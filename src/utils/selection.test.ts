import { test } from "uvu";
import * as assert from "uvu/assert";

import type { AnyToken, TextToken } from "../tokens";

import { buildKeys, type BuildKeysSelection } from "./selection";

function displaySelection(tokens: AnyToken[], selection: BuildKeysSelection) {
	console.log([selection[0].join(" "), selection[1].join(" ")].join(" - "));

	// Sort focus and anchor to match browser behavior
	// selection = selection
	// 	.slice()
	// 	.sort((a, b) => (Number(a[0]) === Number(b[0]) ? a[1] > b[1] : Number(a[0]) > Number(b[0]) ? 1 : -1));

	const firstChunk = selection[0][0]
		?.split(".")
		.map((a) => parseInt(a, 10)) || [0, 0];
	const firstOffset = selection[0][1] || 0;
	const lastChunk = selection[1][0]?.split(".").map((a) => parseInt(a, 10)) || [
		0, 0,
	];
	const lastOffset = selection[1][1] || 0;

	const selectionIsRange = !(
		firstChunk[0] === lastChunk[0] &&
		firstChunk[1] === lastChunk[1] &&
		firstOffset === lastOffset
	);

	const textLines = tokens
		.map((token, parentIndex) => {
			let range = "";

			const children = token.children
				.map((child, childIndex) => {
					if (selectionIsRange) {
						const lastSize =
							lastChunk[0] === parentIndex && lastChunk[1] === childIndex
								? lastOffset
								: child.text.length;

						let leftover = child.text.length;

						if (
							firstChunk[0] < parentIndex &&
							firstChunk[1] < childIndex &&
							lastChunk[0] >= parentIndex &&
							lastChunk[1] >= childIndex
						) {
							range += "^".repeat(lastSize);
							leftover -= lastSize;
						} else if (
							firstChunk[0] === parentIndex &&
							firstChunk[1] === childIndex
						) {
							range += " ".repeat(firstOffset);
							range += "^".repeat(lastSize - firstOffset);
							leftover -= firstOffset + (lastSize - firstOffset);
						}

						if (leftover) {
							range += " ".repeat(leftover);
						}
					}

					return child.text;
				})
				.join("");

			return children + "\n" + range;
		})
		.join("\n");

	return textLines;
}

test("empty", () => {
	assert.equal(
		buildKeys(
			[],
			[
				["0.0", 0],
				["0.0", 0],
			],
		),
		{
			keys: {},
			newSelection: [
				["0.0", 0],
				["0.0", 0],
			],
		},
	);
});

test("h", () => {
	const tokens: AnyToken[] = [
		{
			type: "h",
			id: "a",
			key: "",
			props: {
				size: 0,
			},
			children: [],
		},
	];
	const context = buildKeys(tokens, [
		["0.0", 0],
		["0.0", 0],
	]);

	assert.equal(context.keys, {
		a: "0",
	});
	assert.equal(tokens, [
		{
			type: "h",
			id: "a",
			key: "0",
			props: {
				size: 0,
			},
			children: [],
		},
	]);
	assert.snapshot(displaySelection(tokens, context.newSelection), "\n");
});

test("h,t", () => {
	const tokens: AnyToken[] = [
		{
			type: "h",
			id: "a",
			key: "",
			props: {
				size: 0,
			},
			children: [
				{
					type: "t",
					id: "b",
					key: "",
					props: {},
					text: "Hello",
				},
			],
		},
	];
	const context = buildKeys(tokens, [
		["0.0", 0],
		["0.0", 0],
	]);

	assert.equal(context.keys, {
		a: "0",
		b: "0.0",
	});
	assert.equal(tokens, [
		{
			type: "h",
			id: "a",
			key: "0",
			props: {
				size: 0,
			},
			children: [
				{
					type: "t",
					id: "b",
					key: "0.0",
					props: {},
					text: "Hello",
				},
			],
		},
	]);
	assert.snapshot(displaySelection(tokens, context.newSelection), "Hello\n");
});

test("h(Hello World)", () => {
	const tokens: AnyToken[] = [
		{
			type: "h",
			id: "a",
			key: "",
			props: {
				size: 0,
			},
			children: [
				{
					type: "t",
					id: "b",
					key: "",
					props: {},
					text: "Hello",
				},
				{
					type: "t",
					id: "c",
					key: "",
					props: {},
					text: " World",
				},
			],
		},
	];
	const context = buildKeys(tokens, [
		["0.0", 0],
		["0.0", 0],
	]);

	assert.equal(context.keys, {
		a: "0",
		b: "0.0",
	});
	assert.equal(tokens, [
		{
			type: "h",
			id: "a",
			key: "0",
			props: {
				size: 0,
			},
			children: [
				{
					type: "t",
					id: "b",
					key: "0.0",
					props: {},
					text: "Hello World",
				},
			],
		},
	]);
	assert.snapshot(
		displaySelection(tokens, context.newSelection),
		"Hello World\n",
	);
});

test("h(Hello[ World]!)", () => {
	const tokens: AnyToken[] = [
		{
			type: "h",
			id: "a",
			key: "",
			props: {
				size: 0,
			},
			children: [
				{
					type: "t",
					id: "b",
					key: "",
					props: {},
					text: "Hello",
				},
				{
					type: "t",
					id: "c",
					key: "",
					props: {
						fontWeight: "bold",
					},
					text: " World",
				},
				{
					type: "t",
					id: "d",
					key: "",
					props: {},
					text: "!",
				},
			],
		},
	];
	const context = buildKeys(tokens, [
		["0.0", 0],
		["0.0", 0],
	]);

	assert.equal(context.keys, {
		a: "0",
		b: "0.0",
		c: "0.1",
		d: "0.2",
	});
	assert.equal(tokens, [
		{
			type: "h",
			id: "a",
			key: "0",
			props: {
				size: 0,
			},
			children: [
				{
					type: "t",
					id: "b",
					key: "0.0",
					props: {},
					text: "Hello",
				},
				{
					type: "t",
					id: "c",
					key: "0.1",
					props: {
						fontWeight: "bold",
					},
					text: " World",
				},
				{
					type: "t",
					id: "d",
					key: "0.2",
					props: {},
					text: "!",
				},
			],
		},
	]);
	assert.snapshot(
		displaySelection(tokens, context.newSelection),
		"Hello World!\n",
	);
});

test("added style h(<Hello>[ World]!) => h([<Hello> World]!)", () => {
	const tokensAdded: TextToken[] = [
		{
			type: "t",
			id: "e",
			key: "",
			props: {
				fontWeight: "bold",
			},
			text: "Hello",
		},
	];
	const tokens: AnyToken[] = [
		{
			type: "h",
			id: "a",
			key: "0.0",
			props: {
				size: 0,
			},
			children: [
				{
					type: "t",
					id: "b",
					key: "0.0",
					props: {},
					text: "", // Was cut from this
				},
				...tokensAdded,
				{
					type: "t",
					id: "c",
					key: "0.1",
					props: {
						fontWeight: "bold",
					},
					text: " World",
				},
				{
					type: "t",
					id: "d",
					key: "0.2",
					props: {},
					text: "!",
				},
			],
		},
	];
	const context = buildKeys(tokens, [
		["0.0", 0],
		["0.0", 5],
	]);

	assert.equal(context.keys, {
		a: "0",
		e: "0.0",
		d: "0.1",
	});
	assert.equal(tokens, [
		{
			type: "h",
			id: "a",
			key: "0",
			props: {
				size: 0,
			},
			children: [
				{
					type: "t",
					id: "e",
					key: "0.0",
					props: {
						fontWeight: "bold",
					},
					text: "Hello World",
				},
				{
					type: "t",
					id: "d",
					key: "0.1",
					props: {},
					text: "!",
				},
			],
		},
	]);
	assert.snapshot(
		displaySelection(tokens, context.newSelection),
		[
			"Hello World!",
			"^^^^^       ",
			// SELECTION
		]
			.filter(Boolean)
			.join("\n"),
	);
});

test("added style h(He<ll>o[ World]!) => h(He[<ll>]o[ World]!)", () => {
	const tokensAdded: TextToken[] = [
		{
			type: "t",
			id: "e",
			key: "",
			props: {
				fontWeight: "bold",
			},
			text: "ll",
		},
		{
			type: "t",
			id: "f",
			key: "",
			props: {},
			text: "o",
		},
	];
	const tokens: AnyToken[] = [
		{
			type: "h",
			id: "a",
			key: "0.0",
			props: {
				size: 0,
			},
			children: [
				{
					type: "t",
					id: "b",
					key: "0.0",
					props: {},
					text: "He",
				},
				...tokensAdded,
				{
					type: "t",
					id: "c",
					key: "0.1",
					props: {
						fontWeight: "bold",
					},
					text: " World",
				},
				{
					type: "t",
					id: "d",
					key: "0.2",
					props: {},
					text: "!",
				},
			],
		},
	];
	const context = buildKeys(tokens, [
		["0.0", 2],
		["0.0", 5],
	]);

	assert.equal(context.keys, {
		a: "0",
		b: "0.0",
		e: "0.1",
		f: "0.2",
		c: "0.3",
		d: "0.4",
	});
	assert.equal(tokens, [
		{
			type: "h",
			id: "a",
			key: "0",
			props: {
				size: 0,
			},
			children: [
				{
					type: "t",
					id: "b",
					key: "0.0",
					props: {},
					text: "He",
				},
				{
					type: "t",
					id: "e",
					key: "0.1",
					props: {
						fontWeight: "bold",
					},
					text: "ll",
				},
				{
					type: "t",
					id: "f",
					key: "0.2",
					props: {},
					text: "o",
				},
				{
					type: "t",
					id: "c",
					key: "0.3",
					props: {
						fontWeight: "bold",
					},
					text: " World",
				},
				{
					type: "t",
					id: "d",
					key: "0.4",
					props: {},
					text: "!",
				},
			],
		},
	]);
	assert.snapshot(
		displaySelection(tokens, context.newSelection),
		[
			"Hello World!",
			"  ^^        ",
			// SELECTION
		]
			.filter(Boolean)
			.join("\n"),
	);
});

test("added style h(He<llo>[ World]!) => h(He[<llo> World]!)", () => {
	const tokensAdded: TextToken[] = [
		{
			type: "t",
			id: "e",
			key: "",
			props: {
				fontWeight: "bold",
			},
			text: "llo",
		},
	];
	const tokens: AnyToken[] = [
		{
			type: "h",
			id: "a",
			key: "0.0",
			props: {
				size: 0,
			},
			children: [
				{
					type: "t",
					id: "b",
					key: "0.0",
					props: {},
					text: "He",
				},
				...tokensAdded,
				{
					type: "t",
					id: "c",
					key: "0.1",
					props: {
						fontWeight: "bold",
					},
					text: " World",
				},
				{
					type: "t",
					id: "d",
					key: "0.2",
					props: {},
					text: "!",
				},
			],
		},
	];
	const context = buildKeys(tokens, [
		["0.0", 2],
		["0.0", 6],
	]);

	assert.equal(context.keys, {
		a: "0",
		b: "0.0",
		e: "0.1",
		d: "0.2",
	});
	assert.equal(tokens, [
		{
			type: "h",
			id: "a",
			key: "0",
			props: {
				size: 0,
			},
			children: [
				{
					type: "t",
					id: "b",
					key: "0.0",
					props: {},
					text: "He",
				},
				{
					type: "t",
					id: "e",
					key: "0.1",
					props: {
						fontWeight: "bold",
					},
					text: "llo World",
				},
				{
					type: "t",
					id: "d",
					key: "0.2",
					props: {},
					text: "!",
				},
			],
		},
	]);
	assert.snapshot(
		displaySelection(tokens, context.newSelection),
		[
			"Hello World!",
			"  ^^^       ",
			// SELECTION
		]
			.filter(Boolean)
			.join("\n"),
	);
});

test("added style h(<He>llo[ World]!) => h([<He>]llo[ World]!)", () => {
	const tokensAdded: TextToken[] = [
		{
			type: "t",
			id: "e",
			key: "",
			props: {
				fontWeight: "bold",
			},
			text: "He",
		},
		{
			type: "t",
			id: "f",
			key: "",
			props: {},
			text: "llo",
		},
	];
	const tokens: AnyToken[] = [
		{
			type: "h",
			id: "a",
			key: "0.0",
			props: {
				size: 0,
			},
			children: [
				{
					type: "t",
					id: "b",
					key: "0.0",
					props: {},
					text: "",
				},
				...tokensAdded,
				{
					type: "t",
					id: "c",
					key: "0.1",
					props: {
						fontWeight: "bold",
					},
					text: " World",
				},
				{
					type: "t",
					id: "d",
					key: "0.2",
					props: {},
					text: "!",
				},
			],
		},
	];
	const context = buildKeys(tokens, [
		["0.0", 0],
		["0.0", 2],
	]);

	assert.equal(context.keys, {
		a: "0",
		e: "0.0",
		f: "0.1",
		c: "0.2",
		d: "0.3",
	});
	assert.equal(tokens, [
		{
			type: "h",
			id: "a",
			key: "0",
			props: {
				size: 0,
			},
			children: [
				{
					type: "t",
					id: "e",
					key: "0.0",
					props: {
						fontWeight: "bold",
					},
					text: "He",
				},
				{
					type: "t",
					id: "f",
					key: "0.1",
					props: {},
					text: "llo",
				},
				{
					type: "t",
					id: "c",
					key: "0.2",
					props: {
						fontWeight: "bold",
					},
					text: " World",
				},
				{
					type: "t",
					id: "d",
					key: "0.3",
					props: {},
					text: "!",
				},
			],
		},
	]);
	assert.snapshot(
		displaySelection(tokens, context.newSelection),
		[
			"Hello World!",
			"^^          ",
			// SELECTION
		]
			.filter(Boolean)
			.join("\n"),
	);
});

test("added style h(Hello[< Wor>ld]!) => h(Hello< Wor>[ld]!)", () => {
	const tokensAdded: TextToken[] = [
		{
			type: "t",
			id: "e",
			key: "",
			props: {},
			text: " Wor",
		},
		{
			type: "t",
			id: "f",
			key: "",
			props: {
				fontWeight: "bold",
			},
			text: "ld",
		},
	];
	const tokens: AnyToken[] = [
		{
			type: "h",
			id: "a",
			key: "0.0",
			props: {
				size: 0,
			},
			children: [
				{
					type: "t",
					id: "b",
					key: "0.0",
					props: {},
					text: "Hello",
				},
				...tokensAdded,
				{
					type: "t",
					id: "c",
					key: "0.1",
					props: {
						fontWeight: "bold",
					},
					text: "", // Changed by cut
				},
				{
					type: "t",
					id: "d",
					key: "0.2",
					props: {},
					text: "!",
				},
			],
		},
	];
	const context = buildKeys(tokens, [
		["0.1", 0],
		["0.1", 4],
	]);

	assert.equal(context.keys, {
		a: "0",
		b: "0.0",
		f: "0.1",
		d: "0.2",
	});
	assert.equal(tokens, [
		{
			type: "h",
			id: "a",
			key: "0",
			props: {
				size: 0,
			},
			children: [
				{
					type: "t",
					id: "b",
					key: "0.0",
					props: {},
					text: "Hello Wor",
				},
				{
					type: "t",
					id: "f",
					key: "0.1",
					props: {
						fontWeight: "bold",
					},
					text: "ld",
				},
				{
					type: "t",
					id: "d",
					key: "0.2",
					props: {},
					text: "!",
				},
			],
		},
	]);
	assert.snapshot(
		displaySelection(tokens, context.newSelection),
		[
			"Hello World!",
			"     ^^^^   ",
			// SELECTION
		]
			.filter(Boolean)
			.join("\n"),
	);
});

test("added style h(Hello[< World>]!) => h(Hello< World>!)", () => {
	const tokensAdded: TextToken[] = [
		{
			type: "t",
			id: "e",
			key: "",
			props: {},
			text: " World",
		},
	];
	const tokens: AnyToken[] = [
		{
			type: "h",
			id: "a",
			key: "0.0",
			props: {
				size: 0,
			},
			children: [
				{
					type: "t",
					id: "b",
					key: "0.0",
					props: {},
					text: "Hello",
				},
				...tokensAdded,
				{
					type: "t",
					id: "c",
					key: "0.1",
					props: {
						fontWeight: "bold",
					},
					text: "", // Changed by cut
				},
				{
					type: "t",
					id: "d",
					key: "0.2",
					props: {},
					text: "!",
				},
			],
		},
	];
	const context = buildKeys(tokens, [
		["0.1", 0],
		["0.1", 6],
	]);

	assert.equal(context.keys, {
		a: "0",
		b: "0.0",
	});
	assert.equal(tokens, [
		{
			type: "h",
			id: "a",
			key: "0",
			props: {
				size: 0,
			},
			children: [
				{
					type: "t",
					id: "b",
					key: "0.0",
					props: {},
					text: "Hello World!",
				},
			],
		},
	]);
	assert.snapshot(
		displaySelection(tokens, context.newSelection),
		[
			"Hello World!",
			"     ^^^^^^ ",
			// SELECTION
		]
			.filter(Boolean)
			.join("\n"),
	);
});

test("added style h(Hello[ <Wor>ld]!) => h(Hello[ ]<Wor>[ld]!)", () => {
	const tokensAdded: TextToken[] = [
		{
			type: "t",
			id: "e",
			key: "",
			props: {},
			text: "Wor",
		},
		{
			type: "t",
			id: "c",
			key: "0.1",
			props: {
				fontWeight: "bold",
			},
			text: "ld",
		},
	];
	const tokens: AnyToken[] = [
		{
			type: "h",
			id: "a",
			key: "0.0",
			props: {
				size: 0,
			},
			children: [
				{
					type: "t",
					id: "b",
					key: "0.0",
					props: {},
					text: "Hello",
				},
				{
					type: "t",
					id: "c",
					key: "0.1",
					props: {
						fontWeight: "bold",
					},
					text: " ", // Changed by cut
				},
				...tokensAdded,
				{
					type: "t",
					id: "d",
					key: "0.2",
					props: {},
					text: "!",
				},
			],
		},
	];
	const context = buildKeys(tokens, [
		["0.1", 1],
		["0.1", 3],
	]);

	assert.equal(context.keys, {
		a: "0",
		b: "0.0",
		c: "0.3",
		e: "0.2",
		d: "0.4",
	});
	assert.equal(tokens, [
		{
			type: "h",
			id: "a",
			key: "0",
			props: {
				size: 0,
			},
			children: [
				{
					type: "t",
					id: "b",
					key: "0.0",
					props: {},
					text: "Hello",
				},
				{
					type: "t",
					id: "c",
					key: "0.1",
					props: {
						fontWeight: "bold",
					},
					text: " ",
				},
				{
					type: "t",
					id: "e",
					key: "0.2",
					props: {},
					text: "Wor",
				},
				{
					type: "t",
					id: "c",
					key: "0.3",
					props: {
						fontWeight: "bold",
					},
					text: "ld",
				},
				{
					type: "t",
					id: "d",
					key: "0.4",
					props: {},
					text: "!",
				},
			],
		},
	]);
	assert.snapshot(
		displaySelection(tokens, context.newSelection),
		[
			"Hello World!",
			"      ^^^   ",
			// SELECTION
		]
			.filter(Boolean)
			.join("\n"),
	);
});

test.run();
