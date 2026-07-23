# editpal

Editpal is a Preact Markdown editor with a model-backed, non-editable renderer.
Markdown delimiters stay visible while editing and are omitted by the preview
component.

## Usage

```tsx
import {
	Editpal,
	MarkdownPreview,
	Model,
	parseMarkdown,
	toMarkdown,
} from "editpal";

const model = new Model(parseMarkdown("# Hello **Markdown**"));

// Editable with visible, directly editable Markdown delimiters
<Editpal model={model} />;

// Editable without Markdown delimiters; visually matches the preview
<Editpal model={model} mode="basic" />;

// Read-only; this component does not subscribe to editor state or install
// editing listeners, so it is suitable for rendering posts and feeds.
<MarkdownPreview tokens={model.tokens} />;

const markdown = toMarkdown(model.tokens);
```

Supported syntax includes headings, paragraphs, blockquotes, ordered and
unordered lists, task lists, horizontal rules, fenced and inline code, images,
labeled and automatic links, escapes, bold, italic, strikethrough, and
highlighting (`==highlight==`).

Underline and arbitrary text colors are not Markdown formats and are therefore
not exposed by the editor toolbar.

## Development

Requires [Deno](https://deno.com/) 2.9 or newer.

```sh
deno ci
deno task dev
```

Available tasks:

- `deno task build` — build the library into `dist/`
- `deno task preview` — build and serve the optimized demo
- `deno task test` — run the Deno test suite
- `deno task check` — type-check the complete application and test graph
- `deno task lint` — lint with Deno
- `deno task fmt` — format with Deno
- `deno task verify` — run formatting, linting, tests, and the production build
