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
	target: ["es2020", "chrome63"],
} satisfies BuildOptions;

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

	await buildContext.watch();
	const server = await buildContext.serve({ servedir: "www" });
	console.log(`Serving at http://${server.hosts[0]}:${server.port}`);

	await new Promise<void>(() => {});
}

async function buildLibrary(): Promise<void> {
	const result = await build({
		...productionOptions,
		entryPoints: ["src/editpal.tsx"],
		external: ["exome", "preact"],
		metafile: true,
		outdir: "dist",
	});

	console.log(await analyzeMetafile(result.metafile, { verbose: true }));
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
