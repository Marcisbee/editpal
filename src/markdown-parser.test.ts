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

Deno.test("document Markdown parses and serializes aligned tables", () => {
	const markdown = [
		"| Name | Score | Notes |",
		"| :--- | ---: | :---: |",
		"| **Ada** | 10 | `a|b` |",
		"| Grace | 9 | compiler |",
	].join("\n");
	const tokens = parseMarkdown(markdown);

	assertEquals(
		tokens.map(({ props, type }) => ({ props, type })),
		[
			{
				props: {
					alignments: ["left", "right", "center"],
					header: true,
				},
				type: "tr",
			},
			{
				props: { alignments: ["left", "right", "center"] },
				type: "tr",
			},
			{
				props: { alignments: ["left", "right", "center"] },
				type: "tr",
			},
		],
	);
	assertEquals(toMarkdown(tokens), markdown);
	assertEquals(
		tokens[1].children.filter((child) => child.type === "t").map((child) => ({
			code: child.props.code,
			tableCell: child.props.tableCell,
			text: child.text,
		})),
		[
			{ code: undefined, tableCell: 0, text: "Ada" },
			{ code: undefined, tableCell: 1, text: "10" },
			{ code: true, tableCell: 2, text: "a|b" },
		],
	);
});

Deno.test("table cells preserve escaped pipes and normalize missing cells", () => {
	const tokens = parseMarkdown(
		"| Value | Detail |\n| --- | --- |\n| one \\| two |",
	);

	assertEquals(
		toMarkdown(tokens),
		[
			"| Value | Detail |",
			"| --- | --- |",
			"| one \\| two |  |",
		].join("\n"),
	);
});

Deno.test("pipes without a delimiter row remain paragraphs", () => {
	const tokens = parseMarkdown("| one | two |\nordinary text");

	assertEquals(tokens.map(({ type }) => type), ["p", "p"]);
	assertEquals(toMarkdown(tokens), "| one | two |\nordinary text");
});
