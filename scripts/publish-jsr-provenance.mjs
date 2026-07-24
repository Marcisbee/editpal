import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { attest } from "sigstore";

// Deno currently attests the JSR version-metadata hash, while JSR verifies the
// uploaded source-tarball hash. Generate the tarball-bound statement immediately
// after publishing, within JSR's provenance attachment window, until Deno
// attaches that form of provenance itself.
const JSR_API_URL = "https://api.jsr.io";
const PAYLOAD_TYPE = "application/vnd.in-toto+json";

function requiredEnvironment(name) {
	const value = process.env[name];
	if (!value) {
		throw new Error(`${name} must be set by GitHub Actions`);
	}
	return value;
}

function certificateToPem(rawBytes) {
	if (rawBytes.includes("-----BEGIN CERTIFICATE-----")) {
		return rawBytes;
	}

	const body = rawBytes.replaceAll(/\s/g, "");
	const lines = body.match(/.{1,64}/g) ?? [];
	return `-----BEGIN CERTIFICATE-----\n${
		lines.join("\n")
	}\n-----END CERTIFICATE-----\n`;
}

function createPredicate() {
	const repository = requiredEnvironment("GITHUB_REPOSITORY");
	const workflowReference = requiredEnvironment("GITHUB_WORKFLOW_REF");
	const relativeReference = workflowReference.startsWith(`${repository}/`)
		? workflowReference.slice(repository.length + 1)
		: workflowReference;
	const separator = relativeReference.lastIndexOf("@");
	const workflowPath = separator === -1
		? relativeReference
		: relativeReference.slice(0, separator);
	const workflowRef = separator === -1
		? ""
		: relativeReference.slice(separator + 1);
	const serverUrl = requiredEnvironment("GITHUB_SERVER_URL");

	return {
		buildDefinition: {
			buildType:
				"https://slsa-framework.github.io/github-actions-buildtypes/workflow/v1",
			externalParameters: {
				workflow: {
					path: workflowPath,
					ref: workflowRef,
					repository: `${serverUrl}/${repository}`,
				},
			},
			internalParameters: {
				github: {
					eventName: process.env.GITHUB_EVENT_NAME ?? "",
					repositoryId: process.env.GITHUB_REPOSITORY_ID ?? "",
					repositoryOwnerId: process.env.GITHUB_REPOSITORY_OWNER_ID ?? "",
				},
			},
			resolvedDependencies: [{
				digest: {
					gitCommit: requiredEnvironment("GITHUB_SHA"),
				},
				uri: `git+${serverUrl}/${repository}@${
					requiredEnvironment("GITHUB_REF")
				}`,
			}],
		},
		runDetails: {
			builder: {
				id: `https://github.com/actions/runner/${
					requiredEnvironment("RUNNER_ENVIRONMENT")
				}`,
			},
			metadata: {
				invocationId: `${serverUrl}/${repository}/actions/runs/${
					requiredEnvironment("GITHUB_RUN_ID")
				}/attempts/${requiredEnvironment("GITHUB_RUN_ATTEMPT")}`,
			},
		},
	};
}

async function getGitHubOidcToken(audience) {
	const url = new URL(requiredEnvironment("ACTIONS_ID_TOKEN_REQUEST_URL"));
	url.searchParams.set("audience", audience);
	const response = await fetch(url, {
		headers: {
			authorization: `Bearer ${
				requiredEnvironment("ACTIONS_ID_TOKEN_REQUEST_TOKEN")
			}`,
		},
	});
	if (!response.ok) {
		throw new Error(
			`GitHub OIDC request failed (${response.status}): ${await response
				.text()}`,
		);
	}

	const result = await response.json();
	if (typeof result.value !== "string" || !result.value) {
		throw new Error("GitHub OIDC response did not contain a token");
	}
	return result.value;
}

function toJsrBundle(bundle) {
	const envelope = bundle.dsseEnvelope ?? bundle.content?.dsseEnvelope;
	const chain = bundle.verificationMaterial?.x509CertificateChain ??
		bundle.verificationMaterial?.content?.x509CertificateChain;
	const tlogEntry = bundle.verificationMaterial?.tlogEntries?.[0];
	if (
		!envelope ||
		!Array.isArray(envelope.signatures) ||
		!chain?.certificates?.[0]?.rawBytes ||
		!tlogEntry
	) {
		throw new Error("Sigstore returned an unsupported bundle format");
	}

	const logIndex = Number(tlogEntry.logIndex);
	if (!Number.isSafeInteger(logIndex)) {
		throw new Error("Sigstore returned an invalid transparency-log index");
	}

	return {
		mediaType: PAYLOAD_TYPE,
		content: {
			$case: "dsseSignature",
			dsseEnvelope: {
				...envelope,
				signatures: envelope.signatures.map((signature) => ({
					keyid: signature.keyid ?? signature.keyId ?? "",
					sig: signature.sig,
				})),
			},
		},
		verificationMaterial: {
			content: {
				$case: "x509CertificateChain",
				x509CertificateChain: {
					certificates: [{
						rawBytes: certificateToPem(
							chain.certificates[0].rawBytes,
						),
					}],
				},
			},
			tlogEntries: [{ logIndex }],
		},
	};
}

async function main() {
	if (process.env.GITHUB_ACTIONS !== "true") {
		throw new Error("JSR provenance can only be published from GitHub Actions");
	}

	const config = JSON.parse(await readFile("deno.json", "utf8"));
	const match = /^@([^/]+)\/(.+)$/.exec(config.name ?? "");
	if (!match || typeof config.version !== "string") {
		throw new Error("deno.json must contain a scoped JSR name and version");
	}
	const [, scope, packageName] = match;
	const version = config.version;
	const versionPath =
		`scopes/${scope}/packages/${packageName}/versions/${version}`;

	const tarballResponse = await fetch(
		`${JSR_API_URL}/${versionPath}/tarball`,
	);
	if (!tarballResponse.ok) {
		throw new Error(
			`Could not download the published JSR tarball (${tarballResponse.status})`,
		);
	}
	const tarball = Buffer.from(await tarballResponse.arrayBuffer());
	const digest = createHash("sha256").update(tarball).digest("hex");
	const tarballHash = `sha256-${digest}`;
	const subjectName = `pkg:jsr/@${scope}/${packageName}@${version}`;

	const statement = {
		_type: "https://in-toto.io/Statement/v1",
		subject: [{
			name: subjectName,
			digest: { sha256: digest },
		}],
		predicateType: "https://slsa.dev/provenance/v1",
		predicate: createPredicate(),
	};
	const sigstoreBundle = await attest(
		Buffer.from(JSON.stringify(statement)),
		PAYLOAD_TYPE,
		{
			legacyCompatibility: true,
			retry: 0,
			timeout: 30_000,
		},
	);

	const audience = JSON.stringify({
		permissions: [{
			permission: "package/publish",
			scope,
			package: packageName,
			version,
			tarballHash,
		}],
	});
	const authorization = await getGitHubOidcToken(audience);
	const provenanceResponse = await fetch(
		`${JSR_API_URL}/${versionPath}/provenance`,
		{
			method: "POST",
			headers: {
				authorization: `githuboidc ${authorization}`,
				"content-type": "application/json",
			},
			body: JSON.stringify({ bundle: toJsrBundle(sigstoreBundle) }),
		},
	);
	if (!provenanceResponse.ok) {
		throw new Error(
			`JSR rejected provenance (${provenanceResponse.status}): ${await provenanceResponse
				.text()}`,
		);
	}

	for (let attempt = 0; attempt < 5; attempt++) {
		const metadataResponse = await fetch(
			`${JSR_API_URL}/${versionPath}?fresh=${Date.now()}`,
			{ headers: { "cache-control": "no-cache" } },
		);
		if (!metadataResponse.ok) {
			throw new Error(
				`Could not verify JSR provenance (${metadataResponse.status})`,
			);
		}
		const metadata = await metadataResponse.json();
		if (metadata.rekorLogId) {
			console.log(
				`Verified JSR provenance for ${subjectName}: https://search.sigstore.dev/?logIndex=${metadata.rekorLogId}`,
			);
			return;
		}
		await new Promise((resolve) => setTimeout(resolve, 2_000));
	}

	throw new Error("JSR accepted provenance but did not expose a Rekor log ID");
}

await main();
