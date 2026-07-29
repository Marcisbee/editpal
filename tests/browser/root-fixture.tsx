import { h, render } from "preact";

import { Editpal } from "../../src/editpal.tsx";
import { Model } from "../../src/model.ts";
import { parseMarkdown } from "../../src/markdown-parser.ts";

import "../../src/style.css";

function FixtureEditor(
	{ label, model }: { label: string; model: Model },
) {
	return (
		<section>
			<Editpal ariaLabel={label} model={model} mode="basic" />
			<button
				type="button"
				onClick={(event) => {
					const text = model.tokens[0]?.children[0];
					if (text) {
						event.currentTarget.parentElement
							?.querySelector<HTMLElement>("[data-ep-main]")
							?.focus();
						model.select(text, text.type === "t" ? text.text.length : 0);
					}
				}}
			>
				Select {label}
			</button>
		</section>
	);
}

const first = new Model(parseMarkdown("First editor"));
const second = new Model(parseMarkdown("Second editor"));
second.tokens[0].id = first.tokens[0].id;
second.tokens[0].children[0].id = first.tokens[0].children[0].id;
second.recalculate(true);

render(
	<>
		<FixtureEditor label="First scoped editor" model={first} />
		<FixtureEditor label="Second scoped editor" model={second} />
	</>,
	document.getElementById("multiple")!,
);

const shadowHost = document.getElementById("shadow")!;
const shadowRoot = shadowHost.attachShadow({ mode: "open" });
render(
	<FixtureEditor
		label="Shadow scoped editor"
		model={new Model(parseMarkdown("Shadow editor"))}
	/>,
	shadowRoot,
);

const iframe = document.querySelector("iframe")!;
const iframeDocument = iframe.contentDocument!;
render(
	<FixtureEditor
		label="Iframe scoped editor"
		model={new Model(parseMarkdown("Iframe editor"))}
	/>,
	iframeDocument.body,
);
