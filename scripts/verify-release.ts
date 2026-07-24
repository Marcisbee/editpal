interface PackageMetadata {
	name?: unknown;
	private?: unknown;
	version?: unknown;
}

interface JsrMetadata {
	name?: unknown;
	version?: unknown;
}

const tag = Deno.args.find((argument) => argument !== "--");
if (!tag) {
	throw new Error("Usage: verify-release.ts <vX.Y.Z tag>");
}

const metadata = JSON.parse(
	await Deno.readTextFile("package.json"),
) as PackageMetadata;
const jsrMetadata = JSON.parse(
	await Deno.readTextFile("deno.json"),
) as JsrMetadata;
if (typeof metadata.name !== "string" || !metadata.name) {
	throw new Error("package.json must contain a package name");
}
if (metadata.private === true) {
	throw new Error(`${metadata.name} is marked private and cannot be published`);
}
if (typeof metadata.version !== "string") {
	throw new Error("package.json must contain a version");
}
if (jsrMetadata.name !== "@marcisbee/editpal") {
	throw new Error("deno.json must contain the JSR name @marcisbee/editpal");
}
if (jsrMetadata.version !== metadata.version) {
	throw new Error(
		`JSR version ${
			String(jsrMetadata.version)
		} does not match npm version ${metadata.version}`,
	);
}

const semver =
	/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
if (!semver.test(metadata.version)) {
	throw new Error(`Invalid package version: ${metadata.version}`);
}

const expectedTag = `v${metadata.version}`;
if (tag !== expectedTag) {
	throw new Error(
		`Release tag ${tag} does not match package version ${metadata.version}; expected ${expectedTag}`,
	);
}

console.log(
	`Validated ${metadata.name} and ${jsrMetadata.name}@${metadata.version} from ${tag}`,
);
