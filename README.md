# editpal

Editpal is a Preact Markdown editor with a model-backed, non-editable renderer.
Markdown delimiters stay visible while editing and are omitted by the preview
component.

## Installation

From npm:

```sh
npm install editpal preact exome
```

Import the library stylesheet once in your application:

```ts
import "editpal/style.css";
```

From JSR:

```sh
deno add jsr:@marcisbee/editpal
```

JSR publishes the TypeScript source. Browser applications can attach the
versioned stylesheet exposed by the module:

```ts
import { stylesheetUrl } from "jsr:@marcisbee/editpal";

const stylesheet = document.createElement("link");
stylesheet.rel = "stylesheet";
stylesheet.href = stylesheetUrl.href;
document.head.append(stylesheet);
```

## Usage

```tsx
import "editpal/style.css";

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

`Editpal` also accepts `ariaLabel`, `className`, `disabled`, `editorProps`, `id`,
`onChange`, `placeholder`, `readOnly`, and `style`. Pass `name` (and optionally
`form` and `required`) to submit the Markdown through a native HTML form.
`maxLength` limits serialized Markdown length and `onLimitExceeded` can display
application validation feedback.
Replace a loaded document with
`model.setMarkdown(markdown)` or `model.setTokens(tokens)`; both operations clear
undo history. Call `model.destroy()` when a model is permanently discarded.

The floating text toolbar appears only for an explicit text selection. Its link
action turns that selection into a labeled link. Selecting an image, attachment,
embed, or existing link opens the corresponding contextual controls for editing
or unlinking it.

## Extensions

All extensions are opt-in. An editor with no `extensions` keeps the default
Markdown behavior and does not render integrations or embeds.

### Mentions

Mention providers may be synchronous or asynchronous, use any trigger, carry
consumer-owned values, and customize both suggestion rows and inserted mentions.
Multiple providers can be active together.

```tsx
const extensions = {
	mentions: [{
		id: "people",
		trigger: "@",
		minQueryLength: 0,
		limit: 8,
		async search(query, { signal }) {
			const response = await fetch(
				`/api/people?q=${encodeURIComponent(query)}`,
				{
					signal,
				},
			);
			return await response.json();
		},
		renderSuggestion: (person) => (
			<span>{person.label} — {person.description}</span>
		),
		renderMention: ({ mention }) => <strong>@{mention.label}</strong>,
		onSelect: (person, model) => {
			console.log("Selected", person.id, model);
		},
	}],
} satisfies EditpalExtensions;

<Editpal model={model} extensions={extensions} />;
```

Search requests receive an `AbortSignal`, so changing or closing a query cancels
stale work. Inserted mentions are regular Markdown text when serialized, while
their structured metadata remains available in the live token model. Provider
values must be JSON-serializable so undo, redo, and document cloning remain
deterministic. Advanced providers can override `getQuery`, `getText`, and
`getMention` for multi-word queries and custom stored identifiers.

### Image, video, and file uploads

The attachment API handles the picker, clipboard files, and drag-and-drop. The
host application owns storage and returns the durable URL that Editpal stores.

```tsx
const extensions = {
	attachments: {
		accept: "image/*,video/*,.pdf,.zip",
		maxSize: 25 * 1024 * 1024,
		async upload(file, { signal }) {
			const body = new FormData();
			body.append("file", file);
			const response = await fetch("/api/uploads", {
				method: "POST",
				body,
				signal,
			});
			return await response.json(); // { kind, name, src, mimeType, size }
		},
		onError(error, file) {
			console.error(`Could not upload ${file.name}`, error);
		},
	},
} satisfies EditpalExtensions;
```

An upload result has a `kind` of `"image"`, `"video"`, or `"file"`. Attachments
are atomic, undoable editor items. They serialize to Markdown images or links.
Images, videos, and files can be selected in the editor. The contextual toolbar
lets users edit image alt text, replace an uploaded asset, or remove it. Markdown
images use the same toolbar instead of an always-visible caption field.
Set `pickerLabel: false` if the application supplies its own picker and call
`model.insertAttachment(...)` after uploading. Upload functions can call
`reportProgress(0.5)` and hosts can observe it through `onProgress`.

Clipboard paste deliberately prefers plain text over rich clipboard formats.
Pasting a URL over selected text turns that text into a labeled link; pasting a
URL at a caret inserts an editable `[url](url)` Markdown link. Typing a URL does
not promote it into a special editor item. Pasted images use the attachment
upload pipeline and leave the caret on the following line so typing can continue.

### Inline integrations

Inline integrations replace the visual rendering of matched Markdown links
without changing their source. Matching is entirely opt-in: each integration
decides which link destinations it accepts, typically with a strict regular
expression. Unmatched links remain ordinary editable Markdown links. Integration
content is atomic and cannot be text-selected.

```tsx
const githubPill: InlineIntegration = {
	id: "github-repository",
	match(source) {
		const match = source.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)$/);
		return match
			? { source, data: { owner: match[1], repo: match[2] } }
			: false;
	},
	render({ match }) {
		const repo = match.data as { owner: string; repo: string };
		return <span>GitHub · {repo.owner}/{repo.repo}</span>;
	},
};
```

### Whole-line embeds

Line embeds receive the complete canonical Markdown for each block. They are
ideal for tweets, videos, issue cards, and other standalone link previews.
Inline integrations and whole-line embeds are selectable, and their contextual
link toolbar can edit or unlink the source URL.
`replaceLine` hides the source line in `MarkdownPreview`; the editable surface
always retains the source so the embed can still be edited.

```tsx
const tweet: LineEmbed = {
	id: "tweet",
	replaceLine: true,
	match(source) {
		const match = source.match(
			/^\[Tweet\]\((https:\/\/(?:twitter\.com|x\.com)\/[^)]+)\)$/,
		);
		return match ? { source: match[1] } : false;
	},
	render: ({ match }) => <TweetEmbed url={match.source} />,
};

<MarkdownPreview
	tokens={model.tokens}
	extensions={{ lineEmbeds: [tweet] }}
/>;
```

Render functions should treat remote metadata as untrusted and must not inject
unsanitized HTML. Editpal itself renders text through Preact and restricts
preview links to HTTP(S), mail, root-relative, and fragment URLs.

### Link editing and slash commands

Applications may provide `extensions.linkEditor.edit(...)` to open their own
link modal. The callback returns a URL to apply, `null` to remove a link, or
`undefined` to cancel. Without this extension, the floating toolbar uses its
built-in URL field.

Add application actions to the existing slash menu with
`extensions.slashCommands`. Each command supplies a label, optional search
keywords, and a `run({ block, model })` callback. No custom commands are
registered by default.

Editpal is published to [npm](https://www.npmjs.com/package/editpal) and
[JSR](https://jsr.io/@marcisbee/editpal). The npm package requires Node.js 18
or newer for build tooling. The rendered editor targets modern browsers.

Supported syntax includes headings, paragraphs, blockquotes, ordered and
unordered lists, task lists, horizontal rules, fenced and inline code, images,
labeled and automatic links, escapes, bold, italic, strikethrough, and
highlighting (`==highlight==`).

Underline and arbitrary text colors are not Markdown formats and are therefore
not exposed by the editor toolbar.

## Development

Requires [Deno](https://deno.com/) 2.9 or newer.

```sh
npm install
deno install
deno task dev
```

Available tasks:

- `deno task build` — build the library into `dist/`
- `deno task preview` — build and serve the optimized demo
- `deno task test` — run the Deno test suite
- `npm run test:e2e` — run Chromium, Firefox, WebKit, and mobile Safari tests
- `deno task check` — type-check the complete application and test graph
- `deno task lint` — lint with Deno
- `deno task fmt` — format with Deno
- `deno task verify` — run formatting, linting, tests, and the production build
- `deno task package` — verify the project and inspect the npm and JSR package
  contents
- `deno task release:check v0.1.0` — verify a release tag against the package
  version

## Publishing

GitHub Actions verifies every pull request and push to `main`. Tags matching
`vX.Y.Z` run the release workflow, which:

1. Requires the tag to match the version in `package.json`.
2. Requires the tagged commit to belong to `main`.
3. Runs the complete verification and clean package build.
4. Publishes the tarball to npm through trusted publishing.
5. Publishes the TypeScript source to JSR through OIDC.
6. Creates a GitHub Release with generated notes and the tarball attached.

### One-time trusted publishing setup

In the npm settings for the `editpal` package, add a GitHub Actions trusted
publisher with:

- Organization or user: `Marcisbee`
- Repository: `editpal`
- Workflow filename: `release.yml`
- Environment: `npm`
- Allowed action: `npm publish`

In the GitHub repository, create an environment named `npm`. You can optionally
add required reviewers to make every production release require approval. No
`NPM_TOKEN` repository secret is needed.

In the JSR settings for `@marcisbee/editpal`, link the package to the
`Marcisbee/editpal` GitHub repository. This authorizes tokenless publishing from
GitHub Actions; no `JSR_TOKEN` secret is needed.

### Create a release

Commit all release changes on `main`, then let npm update both package metadata
files and create the matching tag:

```sh
npm version patch
git push origin main --follow-tags
```

Use `npm version minor` or `npm version major` when appropriate. The version
lifecycle script keeps `deno.json` synchronized with `package.json`. The
workflow is safe to rerun: npm and JSR both skip publication when that exact
version already exists, and the workflow still creates or refreshes the
corresponding GitHub Release.

Update the version in `package.json` before creating a release tarball. The
package is available under the [MIT License](./LICENSE).
