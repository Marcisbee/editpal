import { h, render } from "preact";
import { useState } from "preact/hooks";
import { useStore } from "exome/preact";

import {
	Editpal,
	type EditpalExtensions,
	MarkdownPreview,
	parseMarkdown,
	toMarkdown,
} from "./editpal.tsx";
import { Model } from "./model.ts";
import { Debug } from "./debug.tsx";

import "./index.css";
import "./style.css";

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
		"Type @ to try the customizable mention API, or attach an image, video, or file.",
		"",
		"[Marcisbee/editpal](https://github.com/Marcisbee/editpal)",
		"",
		"[Tweet](https://twitter.com/openai/status/123456789)",
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

const people = [
	{ id: "ada", label: "ada", description: "Ada Lovelace", role: "engineer" },
	{ id: "grace", label: "grace", description: "Grace Hopper", role: "admiral" },
	{ id: "marcis", label: "marcis", description: "Marcis", role: "maintainer" },
];

const extensions: EditpalExtensions = {
	mentions: [{
		id: "people",
		trigger: "@",
		ariaLabel: "People",
		async search(query, { signal }) {
			await new Promise((resolve) => setTimeout(resolve, 80));
			if (signal.aborted) {
				return [];
			}
			return people.filter((person) =>
				person.label.includes(query.toLowerCase()) ||
				person.description.toLowerCase().includes(query.toLowerCase())
			).map((person) => ({
				...person,
				value: { role: person.role },
			}));
		},
		renderMention: ({ mention }) => (
			<span className="demo-mention">@{mention.label}</span>
		),
	}],
	attachments: {
		accept: "image/*,video/*,.pdf,.txt,.zip",
		pickerLabel: "Attach…",
		upload(file, { signal }) {
			if (signal.aborted) {
				return Promise.reject(
					new DOMException("Upload cancelled", "AbortError"),
				);
			}
			return Promise.resolve({
				kind: file.type.startsWith("image/")
					? "image"
					: file.type.startsWith("video/")
					? "video"
					: "file",
				mimeType: file.type,
				name: file.name,
				size: file.size,
				src: URL.createObjectURL(file),
			});
		},
	},
	inlineIntegrations: [{
		id: "github-repository",
		match(source) {
			const match = source.match(
				/^https:\/\/github\.com\/([^/]+)\/([^/?#]+)\/?$/,
			);
			return match
				? { data: { owner: match[1], repo: match[2] }, source }
				: false;
		},
		ariaLabel: ({ match }) => `GitHub repository ${match.source}`,
		render: ({ match }) => {
			const data = match.data as { owner: string; repo: string };
			return (
				<a href={match.source} className="demo-integration-pill">
					<span aria-hidden="true">◉</span>
					{data.owner}/{data.repo}
				</a>
			);
		},
	}],
	lineEmbeds: [{
		id: "tweet-demo",
		replaceLine: true,
		match(source) {
			const match = source.match(
				/^\[Tweet\]\((https:\/\/(?:twitter\.com|x\.com)\/[^)]+)\)$/,
			);
			return match ? { source: match[1] } : false;
		},
		render: ({ match }) => (
			<article className="demo-tweet">
				<strong>Twitter / X embed demo</strong>
				<p>
					This card is supplied by the host application; Editpal only matches
					the standalone line and mounts it.
				</p>
				<a href={match.source}>{match.source}</a>
			</article>
		),
	}],
};

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
						? (
							<Editpal
								model={model}
								mode={mode}
								extensions={extensions}
								name="content"
								placeholder="Write some Markdown…"
								ariaLabel="Demo Markdown document"
							/>
						)
						: (
							<MarkdownPreview
								tokens={model.tokens}
								extensions={extensions}
							/>
						)}
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
