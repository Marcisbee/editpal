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
