/// <reference lib="dom" />

import { assertEquals, assertExists } from "@std/assert";

import { ACTION, Model } from "./model.ts";
import type { BlockToken, InlineToken, TextToken } from "./tokens.ts";

function text(
	value: string,
	props: Record<string, unknown> = {},
): TextToken {
	return {
		id: `text-${crypto.randomUUID()}`,
		key: "",
		props,
		text: value,
		type: "t",
	};
}

function paragraph(...children: InlineToken[]): BlockToken {
	return {
		children,
		id: `block-${crypto.randomUUID()}`,
		key: "",
		props: {},
		type: "p",
	};
}

function image(alt = "image"): InlineToken {
	return {
		id: `image-${crypto.randomUUID()}`,
		key: "",
		props: { alt },
		src: "https://example.com/image.png",
		type: "img",
	};
}

function documentText(model: Model): string {
	return model.tokens.map((block) =>
		block.children.map((child) => child.type === "t" ? child.text : "\uFFFC")
			.join("")
	).join("\n");
}

function textWithFormat(
	model: Model,
	key: string,
	value: unknown,
): string {
	return model.tokens.map((block) =>
		block.children
			.filter((child): child is TextToken =>
				child.type === "t" && child.props[key] === value
			)
			.map((child) => child.text)
			.join("")
	).join("\n");
}

function assertModelInvariants(model: Model): void {
	assertExists(model.tokens[0]);

	for (const [blockIndex, block] of model.tokens.entries()) {
		assertEquals(block.key, `${blockIndex}`);
		assertExists(block.children[0]);

		for (const [childIndex, child] of block.children.entries()) {
			assertEquals(child.key, `${blockIndex}.${childIndex}`);
			assertEquals(model.findElement(child.key), child);

			if (child.type === "t") {
				// Editing must never leave half of a UTF-16 surrogate pair behind.
				assertEquals(
					/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(child.text),
					false,
				);
				assertEquals(
					/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(child.text),
					false,
				);
			}
		}
	}

	assertExists(model.findElement(model.selection.first[0]));
	assertExists(model.findElement(model.selection.last[0]));
}

Deno.test("empty input is normalized into an editable paragraph", () => {
	const model = new Model([]);

	model.action(ACTION._Key, "Hello");

	assertEquals(documentText(model), "Hello");
	assertEquals(model.selection.first, ["0.0", 5]);
	assertModelInvariants(model);
});

Deno.test("backspace removes a whole Unicode grapheme", () => {
	const model = new Model([paragraph(text("A👨‍👩‍👧‍👦e\u0301"))]);
	const child = model.innerText("0.0")!;

	model.selection.setSelection(
		"0.0",
		child.text.length,
		"0.0",
		child.text.length,
	);
	model.action(ACTION._Remove);
	assertEquals(documentText(model), "A👨‍👩‍👧‍👦");

	model.action(ACTION._Remove);
	assertEquals(documentText(model), "A");
	assertEquals(model.selection.first, ["0.0", 1]);
	assertModelInvariants(model);
});

Deno.test("programmatic offsets inside a grapheme are normalized", () => {
	const caret = new Model([paragraph(text("A😀B"))]);
	caret.selection.setSelection("0.0", 2, "0.0", 2);
	caret.action(ACTION._Key, "X");
	assertEquals(documentText(caret), "AX😀B");

	const range = new Model([paragraph(text("A😀B"))]);
	range.selection.setSelection("0.0", 2, "0.0", 3);
	range.action(ACTION._Key, "");
	assertEquals(documentText(range), "AB");
	assertModelInvariants(caret);
	assertModelInvariants(range);
});

Deno.test("word and line deletion respect editing units", () => {
	const model = new Model([paragraph(text("alpha beta gamma"))]);
	model.selection.setSelection("0.0", 11, "0.0", 11);

	model.action(ACTION._RemoveWord);
	assertEquals(documentText(model), "alpha gamma");
	assertEquals(model.selection.first, ["0.0", 6]);

	model.action(ACTION._DeleteWord);
	assertEquals(documentText(model), "alpha ");
	model.action(ACTION._DeleteWord);
	assertEquals(documentText(model), "alpha ");

	model.selection.setSelection("0.0", 3, "0.0", 3);
	model.action(ACTION._RemoveLine);
	assertEquals(documentText(model), "ha ");

	model.selection.setSelection("0.0", 0, "0.0", 0);
	model.action(ACTION._DeleteLine);
	assertEquals(documentText(model), "");
	assertModelInvariants(model);
});

Deno.test("composition replaces the active selection", () => {
	const model = new Model([paragraph(text("before selected after"))]);
	model.selection.setSelection("0.0", 7, "0.0", 15);

	model.action(ACTION._Compose, "入力");

	assertEquals(documentText(model), "before 入力 after");
	assertEquals(model.selection.first, ["0.0", 9]);
	assertModelInvariants(model);
});

Deno.test("backspace at a formatting boundary edits the previous run", () => {
	const model = new Model([
		paragraph(
			text("A😀", { fontWeight: "bold" }),
			text("B", { fontStyle: "italic" }),
		),
	]);

	model.selection.setSelection("0.1", 0, "0.1", 0);
	model.action(ACTION._Remove);

	assertEquals(documentText(model), "AB");
	assertEquals(model.tokens[0].children.length, 2);
	assertEquals(model.selection.first, ["0.0", 1]);
	assertModelInvariants(model);
});

Deno.test("backspace removes an empty trailing paragraph without a stale selection", () => {
	const model = new Model([paragraph(text("First")), paragraph(text(""))]);

	model.selection.setSelection("1.0", 0, "1.0", 0);
	model.action(ACTION._Remove);

	assertEquals(documentText(model), "First");
	assertEquals(model.selection.first, ["0.0", 5]);
	assertModelInvariants(model);
});

Deno.test("delete removes the next grapheme and merges at a block boundary", () => {
	const model = new Model([
		paragraph(text("A😀")),
		paragraph(text("Second")),
	]);

	model.selection.setSelection("0.0", 1, "0.0", 1);
	model.action(ACTION._Delete);
	assertEquals(documentText(model), "A\nSecond");
	assertEquals(model.selection.first, ["0.0", 1]);

	model.action(ACTION._Delete);
	assertEquals(documentText(model), "ASecond");
	assertEquals(model.selection.first, ["0.0", 1]);
	assertModelInvariants(model);
});

Deno.test("multi-line text insertion creates blocks and preserves blank lines", () => {
	const model = new Model([paragraph(text("before after"))]);

	model.selection.setSelection("0.0", 7, "0.0", 7);
	model.action(ACTION._Key, "one\r\ntwo\n\nthree ");

	assertEquals(
		documentText(model),
		"before one\ntwo\n\nthree after",
	);
	assertEquals(model.selection.first, ["3.0", 6]);
	assertModelInvariants(model);
});

Deno.test("unknown keys never remove unrelated content", () => {
	const model = new Model([paragraph(text("A"), text("B", { color: "red" }))]);

	model.remove("0.99");

	assertEquals(documentText(model), "AB");
	assertEquals(model.tokens[0].children.length, 2);
	assertEquals(model.keysBetween("missing", "0.1"), []);
	assertModelInvariants(model);
});

Deno.test("editing an inline atom preserves its text siblings", () => {
	const model = new Model([paragraph(text("before"), image(), text("after"))]);

	model.selection.setSelection("0.1", 0, "0.1", 0);
	model.action(ACTION._Key, "middle");

	assertEquals(documentText(model), "beforemiddleafter");
	assertModelInvariants(model);

	const withImage = new Model([
		paragraph(text("before"), image(), text("after")),
	]);
	withImage.selection.setSelection("0.1", 0, "0.1", 0);
	withImage.action(ACTION._Remove);

	assertEquals(documentText(withImage), "beforeafter");
	assertModelInvariants(withImage);
});

Deno.test("enter exits an empty list and shift-tab exits a level-one heading", () => {
	const list = paragraph(text(""));
	list.type = "l";
	list.props = { indent: 0, type: "ul" };
	const model = new Model([list]);

	model.action(ACTION._Enter);
	assertEquals(model.tokens[0].type, "p");
	assertEquals(model.tokens.length, 1);

	const heading = paragraph(text("Title"));
	heading.type = "h";
	heading.props = { size: 1 };
	const headingModel = new Model([heading]);
	headingModel.action(ACTION._ShiftTab);

	assertEquals(headingModel.tokens[0].type, "p");
	assertEquals(headingModel.tokens[0].props, {});
	assertModelInvariants(headingModel);
});

Deno.test("typing heading markers is symmetric with deleting them", () => {
	const model = new Model([paragraph(text("Title"))]);

	model.selection.setSelection("0.0", 0, "0.0", 0);
	model.action(ACTION._Key, "#");
	assertEquals(model.tokens[0].type, "h");
	assertEquals(model.tokens[0].props, { size: 1 });
	assertEquals(documentText(model), "Title");
	assertEquals(model.selection.first, ["0.0", 0]);

	model.action(ACTION._Key, "#");
	assertEquals(model.tokens[0].type, "h");
	assertEquals(model.tokens[0].props, { size: 2 });
	assertEquals(documentText(model), "Title");
	assertEquals(model.selection.first, ["0.0", 0]);

	model.action(ACTION._Remove);
	assertEquals(model.tokens[0].type, "h");
	assertEquals(model.tokens[0].props, { size: 1 });

	model.action(ACTION._Remove);
	assertEquals(model.tokens[0].type, "p");
	assertEquals(documentText(model), "Title");
	assertModelInvariants(model);
});

Deno.test("heading Markdown supports levels one through six and optional space", () => {
	for (let size = 1; size <= 6; size += 1) {
		const model = new Model();
		model.action(ACTION._Key, `${"#".repeat(size)} Heading`);

		assertEquals(model.tokens[0].type, "h");
		assertEquals(model.tokens[0].props, { size });
		assertEquals(documentText(model), "Heading");
		assertEquals(model.selection.first, ["0.0", 7]);
		assertModelInvariants(model);
	}

	const typed = new Model();
	for (let size = 1; size <= 6; size += 1) {
		typed.action(ACTION._Key, "#");
		assertEquals(typed.tokens[0].type, "h");
		assertEquals(typed.tokens[0].props, { size });
		assertEquals(documentText(typed), "");
	}
	typed.action(ACTION._Key, " ");
	assertEquals(documentText(typed), "");
	assertEquals(typed.selection.first, ["0.0", 0]);

	typed.action(ACTION._Key, "#");
	assertEquals(typed.tokens[0].props, { size: 6 });
	assertEquals(documentText(typed), "#");
	assertEquals(typed.selection.first, ["0.0", 1]);
	assertModelInvariants(typed);
});

Deno.test("unordered and ordered Markdown list markers transform at block start", () => {
	for (const marker of ["- ", "* ", "+ "]) {
		const model = new Model();
		model.action(ACTION._Key, `${marker}Item`);

		assertEquals(model.tokens[0].type, "l");
		assertEquals(model.tokens[0].props, { indent: 0, type: "ul" });
		assertEquals(documentText(model), "Item");
		assertEquals(model.selection.first, ["0.0", 4]);
		assertModelInvariants(model);
	}

	for (const marker of ["1. ", "42. ", "3) "]) {
		const model = new Model();
		model.action(ACTION._Key, `${marker}Item`);

		assertEquals(model.tokens[0].type, "l");
		assertEquals(model.tokens[0].props, { indent: 0, type: "ol" });
		assertEquals(documentText(model), "Item");
		assertEquals(model.selection.first, ["0.0", 4]);
		assertModelInvariants(model);
	}
});

Deno.test("Markdown task markers support unchecked and checked tasks", () => {
	for (
		const [marker, done] of [
			["[ ] ", false],
			["- [ ] ", false],
			["* [x] ", true],
			["+ [X] ", true],
		] as const
	) {
		const model = new Model();
		model.action(ACTION._Key, `${marker}Task`);

		assertEquals(model.tokens[0].type, "todo");
		assertEquals(model.tokens[0].props, { indent: 0, done });
		assertEquals(documentText(model), "Task");
		assertEquals(model.selection.first, ["0.0", 4]);
		assertModelInvariants(model);
	}

	const typed = new Model();
	typed.action(ACTION._Key, "-");
	typed.action(ACTION._Key, " ");
	assertEquals(typed.tokens[0].type, "l");
	typed.action(ACTION._Key, "[x] ");
	assertEquals(typed.tokens[0].type, "todo");
	assertEquals(typed.tokens[0].props, { indent: 0, done: true });
	assertEquals(documentText(typed), "");
	assertModelInvariants(typed);
});

Deno.test("Markdown block markers do not transform in the middle of text", () => {
	const model = new Model([paragraph(text("prefix"))]);
	model.selection.setSelection("0.0", 6, "0.0", 6);

	model.action(ACTION._Key, " # ");
	model.action(ACTION._Key, "- ");
	model.action(ACTION._Key, "2. ");
	model.action(ACTION._Key, "[ ] ");

	assertEquals(model.tokens[0].type, "p");
	assertEquals(documentText(model), "prefix # - 2. [ ] ");
	assertModelInvariants(model);
});

Deno.test("preloaded Markdown-looking text is not transformed by later edits", () => {
	for (const value of ["- item", "42. item", "[ ] item"]) {
		const model = new Model([paragraph(text(value))]);
		model.selection.setSelection("0.0", value.length, "0.0", value.length);

		model.action(ACTION._Key, "!");

		assertEquals(model.tokens[0].type, "p");
		assertEquals(documentText(model), `${value}!`);
		assertModelInvariants(model);
	}
});

Deno.test("Markdown block transforms participate in undo and redo", () => {
	const model = new Model();
	model.action(ACTION._Key, "## Heading");
	assertEquals(model.tokens[0].type, "h");

	model.action(ACTION._Undo);
	assertEquals(model.tokens[0].type, "p");
	assertEquals(documentText(model), "");

	model.action(ACTION._Redo);
	assertEquals(model.tokens[0].type, "h");
	assertEquals(model.tokens[0].props, { size: 2 });
	assertEquals(documentText(model), "Heading");
	assertModelInvariants(model);
});

Deno.test("typed inline Markdown converts formats and leaves the caret outside", () => {
	const cases: Array<[string, string, unknown, string]> = [
		["**bold**", "fontWeight", "bold", "bold"],
		["_italic_", "fontStyle", "italic", "italic"],
		["~~gone~~", "textDecoration", "line-through", "gone"],
		["==mark==", "highlight", true, "mark"],
		["`code`", "code", true, "code"],
	];

	for (const [markdown, key, value, expected] of cases) {
		const model = new Model();
		for (const character of markdown) {
			model.action(ACTION._Key, character);
		}
		model.action(ACTION._Key, "!");

		assertEquals(textWithFormat(model, key, value), expected);
		assertEquals(documentText(model), `${expected}!`);
		const last = model.tokens[0].children.at(-1);
		assertEquals(last?.type === "t" && last.text, "!");
		assertEquals(last?.type === "t" && last.props[key], undefined);
		assertModelInvariants(model);
	}
});

Deno.test("nested inline Markdown preserves distinct bold and italic markers", () => {
	const model = new Model();
	for (const character of "**_both_**!") {
		model.action(ACTION._Key, character);
	}

	assertEquals(documentText(model), "both!");
	assertEquals(textWithFormat(model, "fontWeight", "bold"), "both");
	assertEquals(textWithFormat(model, "fontStyle", "italic"), "both");
	assertEquals(
		model.tokens[0].children.map((child) =>
			child.type === "t" ? [child.text, child.props] : []
		),
		[
			["both", { fontStyle: "italic", fontWeight: "bold" }],
			["!", {}],
		],
	);
	assertModelInvariants(model);
});

Deno.test("typed inline Markdown conversion participates in undo and redo", () => {
	const model = new Model();
	for (const character of "**bold**") {
		model.action(ACTION._Key, character);
	}
	assertEquals(textWithFormat(model, "fontWeight", "bold"), "bold");

	model.action(ACTION._Undo);
	assertEquals(documentText(model), "");
	assertEquals(textWithFormat(model, "fontWeight", "bold"), "");

	model.action(ACTION._Redo);
	assertEquals(documentText(model), "bold");
	assertEquals(textWithFormat(model, "fontWeight", "bold"), "bold");
	assertModelInvariants(model);
});

Deno.test("typed Markdown links, images, and escaped delimiters convert", () => {
	const link = new Model();
	for (const character of "[label](https://example.com)!") {
		link.action(ACTION._Key, character);
	}
	assertEquals(
		link.tokens[0].children.map((child) =>
			child.type === "t" ? [child.text, child.props.link] : []
		),
		[["label", "https://example.com"], ["!", undefined]],
	);

	const imageModel = new Model();
	for (const character of "![alt](https://example.com/image.png)") {
		imageModel.action(ACTION._Key, character);
	}
	assertEquals(
		imageModel.tokens[0].children.some((child) =>
			child.type === "img" &&
			child.src === "https://example.com/image.png" &&
			child.props.alt === "alt"
		),
		true,
	);

	const escaped = new Model();
	for (const character of "\\*literal\\*") {
		escaped.action(ACTION._Key, character);
	}
	assertEquals(documentText(escaped), "*literal*");
	assertEquals(
		textWithFormat(escaped, "markdownEscape", true),
		"**",
	);
	assertModelInvariants(link);
	assertModelInvariants(imageModel);
	assertModelInvariants(escaped);
});

Deno.test("blockquote, horizontal rule, and fenced code markers transform", () => {
	const quote = new Model();
	quote.action(ACTION._Key, ">> Quoted");
	assertEquals(quote.tokens[0].type, "quote");
	assertEquals(quote.tokens[0].props, { level: 2 });
	assertEquals(documentText(quote), "Quoted");

	const rule = new Model();
	rule.action(ACTION._Key, "---");
	assertEquals(rule.tokens[0].type, "hr");
	assertEquals(documentText(rule), "");

	const code = new Model();
	code.action(ACTION._Key, "```ts");
	code.action(ACTION._Enter);
	code.action(ACTION._Key, "const answer = 42;");
	code.action(ACTION._Enter);
	code.action(ACTION._Key, "```");
	code.action(ACTION._Enter);
	assertEquals(
		code.tokens.map((block) => [block.type, block.props]),
		[
			["code", { language: "ts" }],
			["p", {}],
		],
	);
	assertEquals(documentText(code), "const answer = 42;\n");
	assertModelInvariants(quote);
	assertModelInvariants(rule);
	assertModelInvariants(code);
});

Deno.test("empty nested list items outdent before exiting the list", () => {
	const model = new Model();
	model.action(ACTION._Key, "  - item");
	assertEquals(model.tokens[0].type, "l");
	assertEquals(model.tokens[0].props, { indent: 1, type: "ul" });

	model.action(ACTION._Enter);
	assertEquals(model.tokens[1].type, "l");
	assertEquals(model.tokens[1].props, { indent: 1, type: "ul" });
	model.action(ACTION._Enter);
	assertEquals(model.tokens[1].type, "l");
	assertEquals(model.tokens[1].props, { indent: 0, type: "ul" });
	model.action(ACTION._Enter);
	assertEquals(model.tokens[1].type, "p");
	assertModelInvariants(model);
});

Deno.test("todo changes participate in undo and redo", () => {
	const todo = paragraph(text("Task"));
	todo.type = "todo";
	todo.props = { done: false };
	const model = new Model([todo]);

	model.action(ACTION._Todo, ["0", true]);
	assertEquals(
		model.tokens[0].type === "todo" && model.tokens[0].props.done,
		true,
	);

	model.action(ACTION._Undo);
	assertEquals(
		model.tokens[0].type === "todo" && model.tokens[0].props.done,
		false,
	);

	model.action(ACTION._Redo);
	assertEquals(
		model.tokens[0].type === "todo" && model.tokens[0].props.done,
		true,
	);
	assertModelInvariants(model);
});

Deno.test("formatting an atom-only selection is a safe no-op", () => {
	const model = new Model([paragraph(image())]);

	model.action(ACTION._FormatAdd, ["fontWeight", "bold"]);

	assertEquals(model.tokens[0].children[0].type, "img");
	assertModelInvariants(model);
});

Deno.test("formatting ignores zero-width runs at both selection boundaries", () => {
	const model = new Model([
		paragraph(
			text("left", { color: "blue" }),
			text("middle"),
			text("right", { color: "green" }),
		),
	]);

	model.select(model.findElement("0.0"), 4, model.findElement("0.2"), 0);
	model.action(ACTION._FormatAdd, ["fontWeight", "bold"]);

	assertEquals(documentText(model), "leftmiddleright");
	assertEquals(textWithFormat(model, "fontWeight", "bold"), "middle");
	assertEquals(model.selection.format.fontWeight, "bold");

	model.action(ACTION._FormatRemove, ["fontWeight", "bold"]);

	assertEquals(documentText(model), "leftmiddleright");
	assertEquals(textWithFormat(model, "fontWeight", "bold"), "");
	assertEquals(model.selection.format.fontWeight, undefined);
	assertModelInvariants(model);
});

Deno.test("multi-block formatting stays active and toggles off without reselection", () => {
	const model = new Model([
		paragraph(text("zero"), text(" one")),
		paragraph(text("two"), image(), text(" three")),
		paragraph(text("four"), text(" five")),
	]);

	model.select(model.findElement("0.0"), 2, model.findElement("2.0"), 2);
	model.action(ACTION._FormatAdd, ["fontStyle", "italic"]);

	assertEquals(
		textWithFormat(model, "fontStyle", "italic"),
		"ro one\ntwo three\nfo",
	);
	assertEquals(model.selection.format.fontStyle, "italic");

	model.action(ACTION._FormatRemove, ["fontStyle", "italic"]);

	assertEquals(textWithFormat(model, "fontStyle", "italic"), "\n\n");
	assertEquals(model.selection.format.fontStyle, undefined);
	assertEquals(documentText(model), "zero one\ntwo\uFFFC three\nfour five");
	assertModelInvariants(model);
});

Deno.test("selection format is the intersection of all covered text runs", () => {
	const model = new Model([
		paragraph(
			text("bold", { fontWeight: "bold", color: "red" }),
			text("plain", { color: "red" }),
			text("also bold", { fontWeight: "bold", color: "red" }),
		),
	]);

	model.select(model.findElement("0.2"), 4, model.findElement("0.0"), 1);

	assertEquals(model.selection.format, { color: "red" });

	model.action(ACTION._FormatAdd, ["fontWeight", "bold"]);
	assertEquals(model.selection.format, {
		color: "red",
		fontWeight: "bold",
	});
	assertEquals(
		textWithFormat(model, "fontWeight", "bold"),
		"boldplainalso bold",
	);
	assertModelInvariants(model);
});

Deno.test("a visually collapsed cross-run boundary is not formatted", () => {
	const model = new Model([
		paragraph(text("before"), text("after", { color: "red" })),
	]);

	model.select(model.findElement("0.0"), 6, model.findElement("0.1"), 0);
	model.action(ACTION._FormatAdd, ["textDecoration", "underline"]);

	assertEquals(textWithFormat(model, "textDecoration", "underline"), "");
	assertEquals(model.selection.format.textDecoration, undefined);
	assertEquals(documentText(model), "beforeafter");
	assertModelInvariants(model);
});

Deno.test("every toolbar format toggles across a reversed multi-block range", () => {
	const formats: Array<[string, string]> = [
		["fontWeight", "bold"],
		["fontStyle", "italic"],
		["textDecoration", "underline"],
		["color", "orangered"],
	];

	for (const [key, value] of formats) {
		const model = new Model([
			paragraph(text("alpha")),
			paragraph(text("beta")),
		]);

		model.select(model.findElement("1.0"), 3, model.findElement("0.0"), 2);
		model.action(ACTION._FormatAdd, [key, value]);

		assertEquals(textWithFormat(model, key, value), "pha\nbet");
		assertEquals(model.selection.format[key], value);

		model.action(ACTION._FormatRemove, [key, value]);

		assertEquals(textWithFormat(model, key, value), "\n");
		assertEquals(model.selection.format[key], undefined);
		assertEquals(documentText(model), "alpha\nbeta");
		assertModelInvariants(model);
	}
});

Deno.test("formatting snaps range offsets around Unicode graphemes", () => {
	const model = new Model([paragraph(text("A👨‍👩‍👧‍👦B"))]);

	model.select(model.findElement("0.0"), 2, model.findElement("0.0"), 5);
	model.action(ACTION._FormatAdd, ["fontWeight", "bold"]);

	assertEquals(documentText(model), "A👨‍👩‍👧‍👦B");
	assertEquals(textWithFormat(model, "fontWeight", "bold"), "👨‍👩‍👧‍👦");
	assertEquals(model.selection.format.fontWeight, "bold");
	assertModelInvariants(model);
});

Deno.test("undo and redo refresh the active format for the restored range", () => {
	const model = new Model([
		paragraph(text("first")),
		paragraph(text("second")),
	]);

	model.select(model.findElement("0.0"), 1, model.findElement("1.0"), 4);
	model.action(ACTION._FormatAdd, ["fontWeight", "bold"]);
	assertEquals(model.selection.format.fontWeight, "bold");

	model.action(ACTION._Undo);
	assertEquals(textWithFormat(model, "fontWeight", "bold"), "\n");
	assertEquals(model.selection.format.fontWeight, undefined);

	model.action(ACTION._Redo);
	assertEquals(textWithFormat(model, "fontWeight", "bold"), "irst\nseco");
	assertEquals(model.selection.format.fontWeight, "bold");
	assertModelInvariants(model);
});

Deno.test("typing outside a closing Markdown marker creates a plain run", () => {
	const model = new Model([
		paragraph(text("Bold", { fontWeight: "bold", color: "red" })),
	]);
	const bold = model.innerText("0.0")!;
	model.selection.setSelection("0.0", 4, "0.0", 4);
	model.selection.setMarkdownBoundary({
		format: { color: "red" },
		side: "after",
		tokenId: bold.id,
	});

	model.action(ACTION._Key, "!");

	assertEquals(documentText(model), "Bold!");
	assertEquals(
		model.tokens[0].children.map((child) =>
			child.type === "t" ? [child.text, child.props] : []
		),
		[
			["Bold", { fontWeight: "bold", color: "red" }],
			["!", { color: "red" }],
		],
	);
	assertEquals(model.selection.first, ["0.1", 1]);

	model.action(ACTION._Undo);
	assertEquals(documentText(model), "Bold");
	assertEquals(textWithFormat(model, "fontWeight", "bold"), "Bold");

	model.action(ACTION._Redo);
	assertEquals(documentText(model), "Bold!");
	assertEquals(textWithFormat(model, "fontWeight", "bold"), "Bold");
	assertModelInvariants(model);
});

Deno.test("typing before an opening Markdown marker creates a plain run", () => {
	const model = new Model([paragraph(text("Bold", { fontWeight: "bold" }))]);
	const bold = model.innerText("0.0")!;
	model.selection.setSelection("0.0", 0, "0.0", 0);
	model.selection.setMarkdownBoundary({
		format: {},
		side: "before",
		tokenId: bold.id,
	});

	model.action(ACTION._Key, "!");

	assertEquals(documentText(model), "!Bold");
	assertEquals(
		model.tokens[0].children.map((child) =>
			child.type === "t" ? [child.text, child.props.fontWeight] : []
		),
		[
			["!", undefined],
			["Bold", "bold"],
		],
	);
	assertEquals(model.selection.first, ["0.0", 1]);
	assertModelInvariants(model);
});

Deno.test("removing a Markdown marker clears its contiguous format region", () => {
	const model = new Model([
		paragraph(
			text("first", { fontWeight: "bold", color: "red" }),
			text(" second", { fontWeight: "bold", color: "blue" }),
			text(" plain"),
		),
	]);
	const blockId = model.tokens[0].id;

	model.action(ACTION._RemoveMarkdownFormat, {
		caret: { blockId, offset: 12 },
		regions: [{
			blockId,
			end: 12,
			key: "fontWeight",
			start: 0,
			value: "bold",
		}],
	});

	assertEquals(documentText(model), "first second plain");
	assertEquals(textWithFormat(model, "fontWeight", "bold"), "");
	assertEquals(model.selection.first, ["0.1", 7]);

	model.action(ACTION._Undo);
	assertEquals(textWithFormat(model, "fontWeight", "bold"), "first second");

	model.action(ACTION._Redo);
	assertEquals(textWithFormat(model, "fontWeight", "bold"), "");
	assertModelInvariants(model);
});

Deno.test("editing one Markdown marker character preserves broken source", () => {
	const model = new Model([
		paragraph(text("bold", { fontWeight: "bold" })),
	]);
	const blockId = model.tokens[0].id;

	model.action(ACTION._EditMarkdown, {
		blockId,
		end: 8,
		start: 7,
		text: "",
	});

	assertEquals(documentText(model), "**bold*");
	assertEquals(textWithFormat(model, "fontWeight", "bold"), "");
	assertEquals(model.selection.first, ["0.0", 7]);

	model.action(ACTION._Undo);
	assertEquals(documentText(model), "bold");
	assertEquals(textWithFormat(model, "fontWeight", "bold"), "bold");

	model.action(ACTION._Redo);
	assertEquals(documentText(model), "**bold*");
	assertModelInvariants(model);
});

Deno.test("manual Markdown replacement reparses alternate delimiters", () => {
	const model = new Model([
		paragraph(text("bold", { fontWeight: "bold" })),
	]);
	const blockId = model.tokens[0].id;

	model.action(ACTION._EditMarkdown, {
		blockId,
		end: 8,
		start: 0,
		text: "__bold__",
	});

	assertEquals(documentText(model), "bold");
	assertEquals(textWithFormat(model, "fontWeight", "bold"), "bold");
	assertEquals(model.tokens[0].children[0].props.boldMarker, "__");
	assertModelInvariants(model);
});

Deno.test("selection healing ignores a trailing inline atom", () => {
	const model = new Model([paragraph(text("a"), image())]);
	model.tokens[0].children.splice(1, 0, text("b"));
	model.selection.setSelection("0.1", 1, "0.1", 1);

	model.recalculate();

	assertEquals(documentText(model), "ab\uFFFC");
	assertEquals(model.selection.first, ["0.0", 2]);
	assertModelInvariants(model);
});

Deno.test("URLs become atomic after paste or a typed delimiter", () => {
	const pasted = new Model();
	pasted.action(ACTION._Key, "See https://example.com, now");

	assertEquals(
		pasted.tokens[0].children.map((child) =>
			child.type === "t" ? [child.text, child.props.url] : []
		),
		[
			["See ", undefined],
			["", "https://example.com"],
			[", now", undefined],
		],
	);
	assertEquals(pasted.selection.first, ["0.2", 5]);

	const typed = new Model();
	for (const character of "https://example.com ") {
		typed.action(ACTION._Key, character);
	}

	assertEquals(typed.tokens[0].children[1].type, "t");
	assertEquals(
		typed.tokens[0].children[1].type === "t"
			? typed.tokens[0].children[1].props.url
			: undefined,
		"https://example.com",
	);
	assertEquals(documentText(typed), " ");
	assertEquals(typed.selection.first, ["0.2", 1]);
	assertModelInvariants(typed);
});

Deno.test("plain-text selection serialization includes atoms and block breaks", () => {
	const model = new Model([
		paragraph(
			text("See "),
			{
				id: `url-${crypto.randomUUID()}`,
				key: "",
				meta: {},
				props: {},
				src: "https://example.com",
				type: "url",
			},
			text(" now"),
		),
		paragraph(image("Diagram"), text(" caption")),
	]);
	model.selection.setSelection("0.0", 1, "1.1", 8);

	assertEquals(
		model.selectedText(),
		"ee https://example.com now\nDiagram caption",
	);
});

Deno.test("deterministic edit sequences preserve model invariants", () => {
	const operations: [number, string?][] = [
		[ACTION._Key, "a"],
		[ACTION._Key, " "],
		[ACTION._Key, "😀"],
		[ACTION._Key, "e\u0301"],
		[ACTION._Remove],
		[ACTION._Delete],
		[ACTION._Enter],
		[ACTION._Tab],
		[ACTION._ShiftTab],
	];

	for (let seed = 1; seed <= 30; seed += 1) {
		let state = seed;
		const random = () => {
			state = (state * 1664525 + 1013904223) >>> 0;
			return state / 2 ** 32;
		};
		const model = new Model();

		for (let step = 0; step < 80; step += 1) {
			const [action, data] =
				operations[Math.floor(random() * operations.length)];
			model.action(action, data);
			assertModelInvariants(model);
		}
	}
});

Deno.test("cross-run and cross-block edit ranges preserve model invariants", () => {
	const operations: [number, unknown?][] = [
		[ACTION._Key, "x"],
		[ACTION._Key, "👨‍👩‍👧‍👦"],
		[ACTION._Key, ""],
		[ACTION._Remove],
		[ACTION._Delete],
		[ACTION._RemoveWord],
		[ACTION._DeleteWord],
		[ACTION._Enter],
		[ACTION._FormatAdd, ["fontWeight", "bold"]],
		[ACTION._FormatRemove, ["fontWeight", "bold"]],
		[ACTION._Undo],
		[ACTION._Redo],
	];

	for (let seed = 1; seed <= 20; seed += 1) {
		let state = seed;
		const random = () => {
			state = (state * 1664525 + 1013904223) >>> 0;
			return state / 2 ** 32;
		};
		const model = new Model([
			paragraph(text("alpha"), text(" beta", { color: "red" })),
			paragraph(text("gamma")),
			paragraph(text("delta")),
		]);

		for (let step = 0; step < 60; step += 1) {
			const inline = Object.values(model._elements).filter((element) =>
				!("children" in element)
			);
			const anchor = inline[Math.floor(random() * inline.length)];
			const focus = inline[Math.floor(random() * inline.length)];
			const anchorOffset = anchor.type === "t"
				? Math.floor(random() * (anchor.text.length + 1))
				: 0;
			const focusOffset = focus.type === "t"
				? Math.floor(random() * (focus.text.length + 1))
				: 0;
			model.selection.setSelection(
				anchor.key,
				anchorOffset,
				focus.key,
				focusOffset,
			);

			const [action, data] = operations[
				Math.floor(random() * operations.length)
			];
			model.action(action, data);
			assertModelInvariants(model);
		}
	}
});
