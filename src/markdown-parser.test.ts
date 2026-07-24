import { assertEquals } from "@std/assert";

import {
	inlineTokensToMarkdown,
	parseInlineMarkdown,
	parseMarkdown,
	toMarkdown,
} from "./markdown-parser.ts";

function inlineSummary(markdown: string) {
	return parseInlineMarkdown(markdown).map((token) =>
		token.type === "t"
			? { props: token.props, text: token.text, type: token.type }
			: token.type === "img"
			? {
				props: token.props,
				src: token.src,
				type: token.type,
			}
			: { src: token.src, type: token.type }
	);
}

Deno.test("inline Markdown parses every supported text format", () => {
	const markdown = "**_both_** ~~gone~~ ==mark== `code`";
	assertEquals(inlineSummary(markdown), [
		{
			props: {
				fontStyle: "italic",
				fontWeight: "bold",
				italicMarker: "_",
			},
			text: "both",
			type: "t",
		},
		{ props: {}, text: " ", type: "t" },
		{
			props: { textDecoration: "line-through" },
			text: "gone",
			type: "t",
		},
		{ props: {}, text: " ", type: "t" },
		{ props: { highlight: true }, text: "mark", type: "t" },
		{ props: {}, text: " ", type: "t" },
		{
			props: { code: true, codeMarker: "`" },
			text: "code",
			type: "t",
		},
	]);
	assertEquals(inlineTokensToMarkdown(parseInlineMarkdown(markdown)), markdown);
});

Deno.test("inline Markdown parses labeled links, images, and escapes", () => {
	const markdown =
		"[OpenAI](https://openai.com) ![logo](https://example.com/logo.png) \\*literal\\*";
	assertEquals(inlineSummary(markdown), [
		{
			props: { link: "https://openai.com" },
			text: "OpenAI",
			type: "t",
		},
		{ props: {}, text: " ", type: "t" },
		{
			props: { alt: "logo" },
			src: "https://example.com/logo.png",
			type: "img",
		},
		{ props: {}, text: " ", type: "t" },
		{
			props: { markdownEscape: true },
			text: "*",
			type: "t",
		},
		{ props: {}, text: "literal", type: "t" },
		{
			props: { markdownEscape: true },
			text: "*",
			type: "t",
		},
	]);
	assertEquals(inlineTokensToMarkdown(parseInlineMarkdown(markdown)), markdown);
});

Deno.test("inline code supports delimiter runs around literal backticks", () => {
	const markdown = "``code with ` inside``";
	assertEquals(inlineSummary(markdown), [
		{
			props: { code: true, codeMarker: "``" },
			text: "code with ` inside",
			type: "t",
		},
	]);
	assertEquals(inlineTokensToMarkdown(parseInlineMarkdown(markdown)), markdown);
});

Deno.test("document Markdown round-trips core block syntax", () => {
	const markdown = [
		"# Title",
		"> Quote",
		"  - nested",
		"- [x] task",
		"---",
		"```ts",
		"const answer = 42;",
		"```",
	].join("\n");
	const tokens = parseMarkdown(markdown);

	assertEquals(
		tokens.map(({ props, type }) => ({ props, type })),
		[
			{ props: { size: 1 }, type: "h" },
			{ props: { level: 1 }, type: "quote" },
			{ props: { indent: 1, type: "ul" }, type: "l" },
			{ props: { done: true, indent: 0 }, type: "todo" },
			{ props: {}, type: "hr" },
			{ props: { language: "ts" }, type: "code" },
		],
	);
	assertEquals(toMarkdown(tokens), markdown);
});

Deno.test("tilde code fences parse and serialize canonically", () => {
	const tokens = parseMarkdown("~~~js\nconst value = `tick`;\n~~~");
	assertEquals(tokens[0].type, "code");
	assertEquals(tokens[0].props, { language: "js" });
	assertEquals(
		toMarkdown(tokens),
		"```js\nconst value = `tick`;\n```",
	);
});
