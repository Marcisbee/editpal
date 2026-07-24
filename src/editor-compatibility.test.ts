/// <reference lib="dom" />

import { assertEquals } from "@std/assert";

import { parseMarkdown, toMarkdown } from "./markdown-parser.ts";
import { ACTION, Model } from "./model.ts";

function tokenSummary(model: Model) {
	return model.tokens.map((block) => ({
		props: block.props,
		text: block.children.map((child) =>
			child.type === "t" ? child.text : "\uFFFC"
		).join(""),
		type: block.type,
	}));
}

Deno.test("ProseMirror splitBlock heading semantics", () => {
	const cases = [
		{
			expected: [
				{ props: {}, text: "", type: "p" },
				{ props: { size: 1 }, text: "foobar", type: "h" },
			],
			offset: 0,
		},
		{
			expected: [
				{ props: { size: 1 }, text: "foo", type: "h" },
				{ props: { size: 1 }, text: "bar", type: "h" },
			],
			offset: 3,
		},
		{
			expected: [
				{ props: { size: 1 }, text: "foobar", type: "h" },
				{ props: {}, text: "", type: "p" },
			],
			offset: 6,
		},
	];

	for (const { expected, offset } of cases) {
		const model = new Model(parseMarkdown("# foobar"));
		model.selection.setSelection("0.0", offset, "0.0", offset);
		model.action(ACTION._Enter);
		assertEquals(tokenSummary(model) as unknown, expected as unknown);
	}
});

Deno.test("Slate-style cross-block text replacement keeps both outer fragments", () => {
	const model = new Model(parseMarkdown("first paragraph\nsecond paragraph"));
	model.selection.setSelection("0.0", 0, "1.0", 6);

	model.action(ACTION._Key, "a");

	assertEquals(toMarkdown(model.tokens), "a paragraph");
	assertEquals(model.selection.first, ["0.0", 1]);
});

Deno.test("Lexical-style whitespace-only list items exit to a paragraph", () => {
	const model = new Model(parseMarkdown("- first\n-    "));
	model.selection.setSelection("1.0", 3, "1.0", 3);

	model.action(ACTION._Enter);

	assertEquals(tokenSummary(model), [
		{ props: { indent: 0, type: "ul" }, text: "first", type: "l" },
		{ props: {}, text: "", type: "p" },
	]);
});

Deno.test("ProseMirror-style mark application skips outer whitespace", () => {
	const model = new Model(parseMarkdown("one two  three"));
	model.selection.setSelection("0.0", 3, "0.0", 10);

	model.action(ACTION._FormatAdd, ["fontStyle", "italic"]);

	assertEquals(toMarkdown(model.tokens), "one *two  t*hree");
	assertEquals(
		toMarkdown(parseMarkdown(toMarkdown(model.tokens))),
		"one *two  t*hree",
	);
});

Deno.test("whitespace-only selections can still receive a mark", () => {
	const model = new Model(parseMarkdown("one two"));
	model.selection.setSelection("0.0", 3, "0.0", 4);

	model.action(ACTION._FormatAdd, ["fontWeight", "bold"]);

	assertEquals(toMarkdown(model.tokens), "one** **two");
});

Deno.test("Lexical CommonMark cases preserve code precedence and dynamic fences", () => {
	const markdown = [
		"````markdown",
		"`**not bold**`",
		"```bash",
		"npm install",
		"```",
		"````",
	].join("\n");

	const parsed = parseMarkdown(markdown);

	assertEquals(toMarkdown(parsed), markdown);
	assertEquals(
		parsed[0].children[0].type === "t"
			? parsed[0].children[0].props.fontWeight
			: undefined,
		undefined,
	);
});

Deno.test("Lexical-style arbitrary ordered-list starts round-trip", () => {
	const parsed = parseMarkdown("42. answer\n43. next");

	assertEquals(toMarkdown(parsed), "42. answer\n43. next");
	assertEquals(parsed.map((block) => block.props), [
		{ indent: 0, start: 42, type: "ol" },
		{ indent: 0, start: 43, type: "ol" },
	]);

	const typed = new Model();
	typed.action(ACTION._Key, "42. ");
	typed.action(ACTION._Key, "answer");
	assertEquals(toMarkdown(typed.tokens), "42. answer");
});

Deno.test("toolbar italics round-trip when applied inside a word", () => {
	const model = new Model(parseMarkdown("hello"));
	model.selection.setSelection("0.0", 1, "0.0", 4);

	model.action(ACTION._FormatAdd, ["fontStyle", "italic"]);

	const markdown = toMarkdown(model.tokens);
	assertEquals(markdown, "h*ell*o");
	assertEquals(toMarkdown(parseMarkdown(markdown)), markdown);
});
