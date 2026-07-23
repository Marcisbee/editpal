import { assertEquals } from "@std/assert";

import { inlineMarkdownAffixes } from "./markdown.ts";

Deno.test("Markdown affixes wrap a complete formatted run", () => {
	assertEquals(
		inlineMarkdownAffixes(
			undefined,
			{ fontWeight: "bold" },
			undefined,
		),
		{
			before: [{ key: "fontWeight", marker: "**" }],
			after: [{ key: "fontWeight", marker: "**" }],
		},
	);
	assertEquals(
		inlineMarkdownAffixes(
			undefined,
			{ fontStyle: "italic" },
			undefined,
		),
		{
			before: [{ key: "fontStyle", marker: "_" }],
			after: [{ key: "fontStyle", marker: "_" }],
		},
	);
	assertEquals(
		inlineMarkdownAffixes(
			undefined,
			{ textDecoration: "line-through" },
			undefined,
		),
		{
			before: [{ key: "textDecoration", marker: "~~" }],
			after: [{ key: "textDecoration", marker: "~~" }],
		},
	);
	assertEquals(
		inlineMarkdownAffixes(
			undefined,
			{ highlight: true },
			undefined,
		),
		{
			before: [{ key: "highlight", marker: "==" }],
			after: [{ key: "highlight", marker: "==" }],
		},
	);
	assertEquals(
		inlineMarkdownAffixes(
			undefined,
			{ code: true, codeMarker: "``" },
			undefined,
		),
		{
			before: [{ key: "code", marker: "``" }],
			after: [{ key: "code", marker: "``" }],
		},
	);
	assertEquals(
		inlineMarkdownAffixes(
			undefined,
			{ link: "https://example.com" },
			undefined,
		),
		{
			before: [{ key: "link", marker: "[" }],
			after: [{ key: "link", marker: "](https://example.com)" }],
		},
	);
});

Deno.test("Markdown affixes span adjacent runs with the same format", () => {
	const bold = { fontWeight: "bold" };

	assertEquals(
		inlineMarkdownAffixes(undefined, bold, {
			fontWeight: "bold",
			color: "red",
		}),
		{
			before: [{ key: "fontWeight", marker: "**" }],
			after: [],
		},
	);
	assertEquals(
		inlineMarkdownAffixes(
			{ fontWeight: "bold", color: "blue" },
			bold,
			undefined,
		),
		{
			before: [],
			after: [{ key: "fontWeight", marker: "**" }],
		},
	);
});

Deno.test("Markdown affixes preserve valid nesting across format changes", () => {
	const bold = { fontWeight: "bold" };
	const boldItalic = { fontWeight: "bold", fontStyle: "italic" };

	assertEquals(
		inlineMarkdownAffixes(undefined, bold, boldItalic),
		{
			before: [{ key: "fontWeight", marker: "**" }],
			after: [],
		},
	);
	assertEquals(
		inlineMarkdownAffixes(bold, boldItalic, bold),
		{
			before: [{ key: "fontStyle", marker: "_" }],
			after: [{ key: "fontStyle", marker: "_" }],
		},
	);
	assertEquals(
		inlineMarkdownAffixes(boldItalic, bold, undefined),
		{
			before: [],
			after: [{ key: "fontWeight", marker: "**" }],
		},
	);
});

Deno.test("non-Markdown formatting does not create fake delimiters", () => {
	assertEquals(
		inlineMarkdownAffixes(
			undefined,
			{ color: "orangered", textDecoration: "underline" },
			undefined,
		),
		{ before: [], after: [] },
	);
});
