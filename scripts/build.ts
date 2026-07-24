import {
	analyzeMetafile,
	build,
	type BuildOptions,
	context,
	type Plugin,
} from "esbuild";
import { denoPlugin } from "@deno/esbuild-plugin";

type Mode = "build" | "dev" | "preview";

const cssPlugin: Plugin = {
	name: "local-css",
	setup(pluginBuild) {
		pluginBuild.onLoad(
			{ filter: /\.css$/, namespace: "file" },
			async ({ path }) => ({
				contents: await Deno.readTextFile(path),
				loader: "css",
			}),
		);
	},
};

const sharedOptions = {
	bundle: true,
	format: "esm",
	jsx: "transform",
	jsxFactory: "h",
	jsxFragment: "Fragment",
} satisfies BuildOptions;

const productionOptions = {
	...sharedOptions,
	define: {
		"process.env.NODE_ENV": '"production"',
	},
	format: "esm",
	legalComments: "none",
	minify: true,
	platform: "browser",
	pure: ["console.log"],
	target: ["es2020"],
} satisfies BuildOptions;

async function normalizeDeclarations(directory: string): Promise<void> {
	for await (const entry of Deno.readDir(directory)) {
		const path = `${directory}/${entry.name}`;
		if (entry.isDirectory) {
			await normalizeDeclarations(path);
			continue;
		}
		if (!entry.isFile || !entry.name.endsWith(".d.ts")) {
			continue;
		}

		const source = await Deno.readTextFile(path);
		const normalized = source
			.replace(/^import\s+["']\.\/app\.css["'];\r?\n/m, "")
			.replace(
				/(["'])(\.\.?\/[^"']+)\.(?:cts|mts|tsx?|jsx?)(["'])/g,
				"$1$2.js$3",
			);
		await Deno.writeTextFile(path, normalized);
	}
}

async function serve(mode: Exclude<Mode, "build">): Promise<void> {
	const preview = mode === "preview";
	const buildContext = await context({
		...(preview ? productionOptions : sharedOptions),
		entryPoints: ["src/main.tsx"],
		mangleProps: preview ? /^_/ : undefined,
		mangleQuoted: preview,
		outdir: "www",
		plugins: [
			cssPlugin,
			denoPlugin({
				configPath: Deno.realPathSync("deno.json"),
			}),
		],
		sourcemap: "inline",
	});

	// A clean CI checkout has no generated main.js or main.css. Complete the
	// initial build before the readiness URL can respond, otherwise the first
	// browser may keep a page that loaded while those assets still returned 404.
	await buildContext.rebuild();
	await buildContext.watch();
	const server = await buildContext.serve({ port: 4173, servedir: "www" });
	console.log(`Serving at http://${server.hosts[0]}:${server.port}`);

	await new Promise<void>(() => {});
}

async function buildLibrary(): Promise<void> {
	try {
		await Deno.remove("dist", { recursive: true });
	} catch (error) {
		if (!(error instanceof Deno.errors.NotFound)) {
			throw error;
		}
	}

	const result = await build({
		...productionOptions,
		entryPoints: {
			editpal: "src/mod.ts",
		},
		external: ["exome", "preact"],
		metafile: true,
		outdir: "dist",
	});

	console.log(await analyzeMetafile(result.metafile, { verbose: true }));

	await build({
		entryNames: "style",
		entryPoints: ["src/style.css"],
		legalComments: "none",
		minify: true,
		outdir: "dist",
	});

	const declarationStatus = await new Deno.Command(Deno.execPath(), {
		args: ["task", "types"],
		stderr: "inherit",
		stdout: "inherit",
	}).spawn().status;
	if (!declarationStatus.success) {
		throw new Error(
			`Declaration build failed with exit code ${declarationStatus.code}`,
		);
	}
	await normalizeDeclarations("dist");
}

const mode = (Deno.args[0] ?? "build") as Mode;

switch (mode) {
	case "build":
		await buildLibrary();
		break;
	case "dev":
	case "preview":
		await serve(mode);
		break;
	default:
		throw new Error(`Unknown build mode: ${mode}`);
}
