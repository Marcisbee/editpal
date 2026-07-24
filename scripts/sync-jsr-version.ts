interface PackageMetadata {
	version?: unknown;
}

interface DenoMetadata {
	version?: unknown;
}

const packageMetadata = JSON.parse(
	await Deno.readTextFile("package.json"),
) as PackageMetadata;
if (typeof packageMetadata.version !== "string") {
	throw new Error("package.json must contain a version");
}

const denoMetadata = JSON.parse(
	await Deno.readTextFile("deno.json"),
) as DenoMetadata;
denoMetadata.version = packageMetadata.version;

await Deno.writeTextFile(
	"deno.json",
	`${JSON.stringify(denoMetadata, null, "\t")}\n`,
);

console.log(`Synchronized JSR version to ${packageMetadata.version}`);
