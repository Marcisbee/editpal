import { h, render } from "preact";
import { useState } from "preact/hooks";
import { useStore } from "exome/preact";

import {
	Editpal,
	MarkdownPreview,
	parseMarkdown,
	toMarkdown,
} from "./editpal.tsx";
import { Model } from "./model.ts";
import { Debug } from "./debug.tsx";

import "./index.css";

const root = parseMarkdown(
	[
		"# Editpal Markdown",
		"",
		"Write **bold**, _italic_, **_both_**, ~~strikethrough~~, ==highlighted==, and `inline code` text.",
		"",
		"> Markdown stays visible while editing and becomes marker-free, read-only content in Preview.",
		"",
		"- [ ] Native unchecked task",
		"- [x] Native completed task",
		"- Nested lists",
		"  1. First nested item",
		"  2. Second nested item",
		"",
		"[OpenAI](https://openai.com) links and images are supported.",
		"",
		"---",
		"",
		"```ts",
		'const message = "Preview-ready Markdown";',
		"```",
		"",
		"![Genji cyberdemon skin](https://img.strike.lv/photos/7110acef-3ad0-4382-a88f-93e854128be8.jpeg)",
	].join("\n"),
);

const model = new Model(root);

function DemoSource({ model }: { model: Model }) {
	const { tokens } = useStore(model);
	return <pre>{toMarkdown(tokens)}</pre>;
}

function App() {
	const [mode, setMode] = useState<"basic" | "markdown" | "preview">(
		"markdown",
	);

	return (
		<div className="App">
			<div
				style={{
					width: 800,
					maxWidth: "100%",
					margin: "0 auto",
				}}
			>
				<header className="demo-header">
					<div>
						<strong>Editpal</strong>
						<span>Markdown editor and renderer</span>
					</div>
					<div className="demo-mode" aria-label="Document mode">
						<button
							type="button"
							aria-pressed={mode === "markdown"}
							onClick={() => setMode("markdown")}
						>
							Markdown
						</button>
						<button
							type="button"
							aria-pressed={mode === "basic"}
							onClick={() => setMode("basic")}
						>
							Basic
						</button>
						<button
							type="button"
							aria-pressed={mode === "preview"}
							onClick={() => setMode("preview")}
						>
							Preview
						</button>
					</div>
				</header>
				<section className="demo-document">
					{mode !== "preview"
						? <Editpal model={model} mode={mode} />
						: <MarkdownPreview tokens={model.tokens} />}
				</section>
				<details className="demo-source">
					<summary>Markdown source</summary>
					<DemoSource model={model} />
				</details>
				{mode !== "preview" && (
					<details className="demo-debug">
						<summary>Model debug view</summary>
						<Debug model={model} />
					</details>
				)}
			</div>
		</div>
	);
}

render(<App />, document.getElementById("root")!);
