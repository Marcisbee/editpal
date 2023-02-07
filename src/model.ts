import { Exome } from "exome";

import { HistoryStore } from "./history";
import { ModelSelection } from "./selection";
import {
	AnyToken,
	BlockToken,
	InlineToken,
	TextToken,
	TokenRoot,
} from "./tokens";
import { setCaret, cloneToken, stringSplice, ranID } from "./utils";
import { propsEqual } from "./utils/props-equal";

export const ACTION = {
	_Key: 0,
	_Remove: 1,
	_Enter: 2,
	_Delete: 3,
	_Tab: 4,
	_ShiftTab: 5,
	_Compose: 6,
	_FormatAdd: 7,
	_FormatRemove: 8,
	_Undo: 9,
	_Redo: 10,
};

function handleEnter(
	fromParent: BlockToken,
	toParent: BlockToken,
	model: Model,
) {
	if (toParent.type === fromParent.type) {
		return;
	}

	if (fromParent.type === "todo") {
		toParent.type = fromParent.type as any;
		toParent.props = {
			indent: fromParent.props?.indent,
		};
		return;
	}

	if (fromParent.type === "l") {
		toParent.type = fromParent.type as any;
		toParent.props = {
			indent: fromParent.props?.indent || 0,
			type: fromParent.props?.type || "ul",
		};
		return;
	}
}

function dotSize(value: string): number {
	return value.split(".").length;
}

function handleTab(
	firstParent: BlockToken,
	lastParent: BlockToken,
	model: Model,
	shift: boolean,
) {
	const len = dotSize(firstParent.key);
	const keys = model
		.keysBetween(firstParent.key, lastParent.key)
		.filter((key) => dotSize(key) === len);

	for (const key of keys) {
		const element = model.findElement(key);

		const mod = shift ? -1 : 1;

		if (!element.props) {
			element.props = {};
		}

		if (element.type === "h") {
			if (mod === -1 && !element.props.size) {
				(element as any).type = "p";
				(element as any).props = null;
				continue;
			}

			element.props.size = Math.max(
				1,
				Math.min((element.props.size || 0) + mod, 6),
			);
		} else {
			if (mod === -1 && !element.props.indent) {
				element.type = "p";
				model.select(
					model.findElement(model.selection.first[0]),
					model.selection.first[1],
					model.findElement(model.selection.last[0]),
					model.selection.last[1],
				);
				continue;
			}

			element.props.indent = Math.max(
				0,
				Math.min((element.props.indent || 0) + mod, 4),
			);
		}
	}

	model.update();
}

export class Model extends Exome {
	public tokens: TokenRoot;
	// public selection: {
	// 	anchor: string;
	// 	anchorOffset: number;
	// 	focus: string;
	// 	focusOffset: number;
	// } | null = null;
	public selection = new ModelSelection();
	public history = new HistoryStore();

	public _idToKey: Record<string, string> = {};
	public _elements: Record<string, AnyToken> = {};
	public _elements_temp: Record<string, AnyToken> = {};
	public stack: Function[] = [];
	public _isComposing = false;

	constructor(tokens: TokenRoot) {
		super();

		this.tokens = cloneToken(tokens);
		this.recalculate(true);

		console.log(this.tokens, this._idToKey);
	}

	public update() {}

	public recalculate = (initial = false) => {
		if (this._isComposing) {
			return;
		}

		// this.selection.fix = false;
		this.selection.fixFirst = undefined;
		this.selection.fixLast = undefined;

		const firstChunks = this.selection.first[0].split(".");
		const lastChunks = this.selection.last[0].split(".");
		this.selection.fixFirstKey = parseInt(firstChunks.pop()!, 10);
		this.selection.fixFirstOffset = this.selection.first[1];
		this.selection.fixLastKey = parseInt(lastChunks.pop()!, 10);
		this.selection.fixLastOffset = this.selection.last[1];

		this._elements_temp = {};
		this._idToKey = this._buildKeys(this.tokens);
		this._elements = this._elements_temp;
		this.update();

		// Don't heal initial selection
		if (initial) {
			return;
		}

		return;

		// if (!this.selection.fixFirst && !this.selection.fixLast) {
		// 	return;
		// }

		// const {
		// 	fixFirst: [first, firstOffset] = this.selection.first,
		// 	fixLast: [last, lastOffset] = this.selection.last,
		// } = this.selection;
		console.log(
			"APPLY",
			this.selection.fixFirstKey,
			this.selection.fixFirstOffset,
			this.selection.fixLastKey,
			this.selection.fixLastOffset,
		);

		this.select2(
			this.findElement(
				firstChunks.concat(this.selection.fixFirstKey).join("."),
			),
			this.selection.fixFirstOffset,
			this.findElement(lastChunks.concat(this.selection.fixLastKey).join(".")),
			this.selection.fixLastOffset,
			// this.findElement(last),
			// lastOffset,
		);
	};

	private _buildKeys = (
		tokens: AnyToken | AnyToken[],
		keys: Record<string, string> = {},
		key: string[] = [],
	) => {
		if (Array.isArray(tokens)) {
			let i = 0;
			for (const element of tokens) {
				this._buildKeys(element, keys, key.concat(i + ""));
				i += 1;
			}

			return keys;
		}

		if (!tokens?.id) {
			return keys;
		}

		tokens.key = key.join(".");

		this._elements_temp[tokens.key] = tokens;

		keys[tokens.id] = tokens.key;

		// @TODO figure out where did last selection was and fix it on the fly

		const {
			first: [firstKey, firstOffset],
			last: [lastKey, lastOffset],
		} = this.selection;
		let fixedFirst;
		let fixedLast;

		// console.log(
		// 	{
		// 		first,
		// 		firstOffset,
		// 		last,
		// 		lastOffset,
		// 	},
		// 	tokens.key,
		// );

		if (tokens.type !== "t" && Array.isArray(tokens.children)) {
			let last;
			let i = -1;

			for (const child of tokens.children.slice()) {
				i += 1;

				check: {
					if (last?.type !== "t" || child?.type !== "t") {
						break check;
					}

					if (!last.text) {
						console.log("R -last", key, i);
						// const kk = key.concat(i).join(".");
						// if (firstKey === kk) {
						// 	console.warn("A1", kk);
						// 	// fixedFirst = [last.key, last.text.length];
						// }
						// if (lastKey === kk) {
						// 	console.warn("A2", kk);
						// 	// fixedLast = [last.key, last.text.length];
						// }
						tokens.children.splice(i - 1, 1);
						i -= 1;
						break check;
					}

					if (!child.text) {
						console.log("R -child", key, i);
						// const kk = key.concat(i + 1).join(".");
						tokens.children.splice(i, 1);
						i -= 1;

						// if (lastKey === kk) {
						// 	// this.selection.fixFirstKey -= 1;
						// 	// this.selection.fixFirstOffset = child.text.length;
						// 	console.log("REEEEEEE 1", this.selection.fixFirstKey);
						// }

						// @TODO Handle 0.0 position
						// if (!fixedFirst && firstKey === kk) {
						// 	console.warn("B1", kk, "=>", i, last.text, child.text);
						// 	fixedFirst = [
						// 		key.concat(i).join("."),
						// 		last.text.length + firstOffset,
						// 	];
						// }

						// if (!fixedLast && lastKey === kk) {
						// 	console.warn("B2", kk, "=>", i, last.text, child.text);
						// 	fixedLast = [
						// 		key.concat(i).join("."),
						// 		firstKey === lastKey
						// 			? last.text.length + firstOffset + lastOffset
						// 			: lastOffset,
						// 	];
						// }
						continue;
					}

					if (propsEqual(last.props, child.props)) {
						const kk = key.concat(i).join(".");
						const ka = key.concat(this.selection.fixFirstKey).join(".");
						const kb = key.concat(this.selection.fixLastKey).join(".");
						// {
						// 	const kk = key.concat(i).join(".");
						// 	const ka = key.concat(this.selection.fixFirstKey).join(".");
						// 	const kb = key.concat(this.selection.fixLastKey).join(".");

						// 	if (kk === ka) {
						// 		console.log("REMOVE FIRST", kk, ka, this.selection.fixFirstKey);
						// 		this.selection.fixFirstKey -= 1;
						// 	}

						// 	if (kk === kb) {
						// 		console.log("REMOVE LAST", this.selection.fixLastKey);
						// 		this.selection.fixLastKey -= 1;
						// 	}
						// }
						// @TODO this was last try
						// if (firstKey === ka) {
						// 	console.log(
						// 		"%c< FIRST MATCH",
						// 		"color: salmon;",
						// 		last,
						// 		child,
						// 		firstOffset,
						// 	);
						// 	console.table({
						// 		key: {
						// 			from: this.selection.fixFirstKey,
						// 			to: i - 1,
						// 		},
						// 		offset: {
						// 			from: this.selection.fixFirstOffset,
						// 			to: firstOffset || child.key ? 0 : last.text.length,
						// 		},
						// 	});
						// 	// console.log(
						// 	// 	"%c< FIRST MATCH",
						// 	// 	"color: salmon;",
						// 	// 	this.selection.fixFirstKey,
						// 	// 	"=>",
						// 	// 	i - 1,
						// 	// 	last,
						// 	// 	child,
						// 	// );
						// 	this.selection.fixFirstKey = i - 1;
						// 	// this.selection.fixFirstKey -= firstOffset ? 1 : 0;
						// 	this.selection.fixFirstOffset =
						// 		firstOffset || child.key ? 0 : last.text.length;
						// }

						// if (lastKey === kk) {
						// 	console.log(
						// 		"%c> LAST MATCH",
						// 		"color: salmon;",
						// 		last,
						// 		child,
						// 		firstOffset,
						// 	);
						// 	console.table({
						// 		key: {
						// 			from: this.selection.fixLastKey,
						// 			to: i - 1,
						// 		},
						// 		offset: {
						// 			from: this.selection.fixLastOffset,
						// 			to:
						// 				firstKey === lastKey
						// 					? last.text.length
						// 					: last.text.length + child.text.length,
						// 		},
						// 	});
						// 	// console.log(
						// 	// 	"%c> LAST MATCH",
						// 	// 	"color: salmon;",
						// 	// 	this.selection.fixLastKey,
						// 	// 	'=>',
						// 	// 	i - 1,
						// 	// 	last,
						// 	// 	child,
						// 	// );
						// 	this.selection.fixLastKey = i - 1;
						// 	this.selection.fixLastOffset =
						// 		(this.selection.fixFirstKey === this.selection.fixLastKey && last.key)
						// 			? this.selection.fixFirstOffset + lastOffset
						// 			: firstKey === lastKey
						// 			? last.text.length
						// 			: last.text.length + child.text.length;
						// }

						// const kk = key.concat(i - 1).join(".");
						// const ka = firstKey.replace(
						// 	/\.\d+$/,
						// 	`.${this.selection.fixFirstKey}`,
						// );
						// const kb = lastKey.replace(
						// 	/\.\d+$/,
						// 	`.${this.selection.fixLastKey}`,
						// );
						// if (firstKey === ka) {
						// 	// console.log("remove 1.3");
						// 	this.selection.fixFirstKey = i - 1;
						// 	this.selection.fixFirstOffset = last.text.length;
						// }
						// // if (kk === lastKey) {
						// 	// console.log("remove 2.3");
						// 	this.selection.fixLastKey = i -1;
						// 	this.selection.fixLastOffset = firstOffset
						// 		? child.text.length
						// 		: last.text.length;
						// // }
						// if (ka === kk) {
						// 	console.log("remove 1", this.selection.fixFirstKey);
						// 	this.selection.fixFirstKey -= 1;
						// 	this.selection.fixFirstOffset = last.text.length;
						// }
						// if (lastKey === kk) {
						// 	console.log("remove 2.1");
						// 	this.selection.fixLastKey = i- 1;
						// 	this.selection.fixLastOffset = i === 0 ? lastOffset : last.text.length;
						// // } else
						// // if (lastKey === kk && firstKey !== lastKey) {
						// // 	console.log("remove 2.2");
						// // 	this.selection.fixLastKey =i-1;
						// // 	this.selection.fixLastOffset = last.text.length;
						// }

						// console.log("R props", key, i);
						// if (firstKey === kk) {
						// 	console.log('%c resque', 'color: red;');
						// 	this.selection.fixFirstKey -= 1;
						// 	// this.selection.fixFirstOffset = last.text.length;
						// }
						// if (!fixedFirst && firstKey === kk) {
						// 	console.warn(
						// 		"C1",
						// 		kk,
						// 		"=>",
						// 		i - 1,
						// 		last.text,
						// 		"+",
						// 		child.text,
						// 	);
						// 	fixedFirst = [key.concat(i - 1).join("."), last.text.length];
						// }
						// if (!fixedLast && lastKey === kk) {
						// 	console.warn(
						// 		"C2",
						// 		kk,
						// 		"=>",
						// 		i - 1,
						// 		last.text,
						// 		"+",
						// 		child.text,
						// 	);
						// 	fixedLast = [
						// 		key.concat(i - 1).join("."),
						// 		(firstKey === lastKey ? child.text.length : 0) +
						// 			last.text.length,
						// 	];
						// }

						last.text += child.text;
						tokens.children.splice(i, 1);
						i -= 1;
						continue;
					}

					// Key not initiated
					// This thing was just added
					// if (!child.key) {
					const kk = key.concat(i - 1).join(".");
					const ka = firstKey.replace(
						/\.\d+$/,
						`.${this.selection.fixFirstKey}`,
					);
					const kb = lastKey.replace(/\.\d+$/, `.${this.selection.fixLastKey}`);
					// if (ka === firstKey && firstOffset) {
					// 	console.log('add 1');
					// 	this.selection.fixFirstKey += 1;
					// 	this.selection.fixFirstOffset = 0;
					// }
					// if (lastKey === kk && firstKey === lastKey && firstOffset) {
					// 	console.log("add 2.1");
					// 	this.selection.fixLastKey += 1;
					// 	this.selection.fixLastOffset = lastOffset - firstOffset;
					// } else
					// if (lastKey === kk && firstKey !== lastKey) {
					// 	console.log("add 2.2");
					// 	this.selection.fixLastKey += i === 1 ? 0 : 1;
					// 	this.selection.fixLastOffset = i === 1 ? lastOffset : child.text.length;
					// } else
					// if (kk === firstKey && firstOffset) {
					// 	// console.log('add 1.3');
					// 	this.selection.fixFirstKey += 1;
					// 	this.selection.fixFirstOffset = 0;
					// }
					// if (kk === lastKey) {
					// 	// console.log('add 2.3');
					// 	this.selection.fixLastKey += firstOffset ? 1 : 0;
					// 	this.selection.fixLastOffset = firstOffset ? child.text.length : last.text.length;
					// }
					// if (!fixedFirst && firstKey === kk && firstOffset) {
					// 	console.warn("D1", kk, "=>", i, last.text);
					// 	fixedFirst = [key.concat(i).join("."), 0];
					// }
					// if (lastKey === kk && firstOffset) {
					// 	console.warn("D2", kk, "=>", i, last.text);
					// 	fixedLast = [key.concat(i).join("."), child.text.length];
					// }
					// // if (!fixedLast && lastKey === kk && !firstOffset) {
					// // 	console.warn("FIX 3 L1", kk, "=>", i, child.text);
					// // 	fixedLast = [key.concat(i - 1).join("."), child.text.length];
					// // }

					// if (fixedFirst && !fixedLast && lastKey === key.concat(i).join(".")) {
					// 	console.log("%cBINGO", "color: red;");
					// 	console.warn("D3", lastKey, "=>", i, key.concat(i).join("."));
					// 	fixedLast = [key.concat(i - 1).join("."), last.text.length];
					// }
					// console.warn(child, { firstKey, lastKey }, kk, tokens.key);

					// // if (!fixedFirst && )

					// // console.warn(child, {firstKey, lastKey}, kk, tokens.key);
					// }
					// {
					// 	const kk = key.concat(i).join(".");
					// 	const ka = key.concat(this.selection.fixFirstKey).join(".");
					// 	const kb = key.concat(this.selection.fixLastKey).join(".");

					// 	if (kk === firstKey) {
					// 		console.log("ADD FIRST", kk, ka, this.selection.fixFirstKey);
					// 		this.selection.fixFirstKey += firstOffset ? 1 : 0;
					// 		this.selection.fixFirstOffset = 0;

					// 		// reset last offset
					// 		this.selection.fixLastOffset = 0
					// 	}

					// 	if (kk === lastKey) {
					// 		console.log("ADD LAST", kk, kb, this.selection.fixLastKey);
					// 		this.selection.fixLastKey += firstOffset ? 1 : 0;
					// 		this.selection.fixLastOffset += firstOffset ? last.text.length : child.text.length;
					// 	}
					// }

					// @TODO this was last try
					// if (!child.key) {
					// 	if (firstKey === last.key) {
					// 		console.log("%cFIRST MATCH", "color: orange;");
					// 		this.selection.fixFirstKey += 1;
					// 		this.selection.fixFirstOffset = 0;
					// 	}

					// 	// @TODO Figure out `Hello Jupiter!`
					// 	//                     ^^^^^^^ - bold
					// 	// Same for un-bold
					// 	if (lastKey === last.key) {
					// 		console.log("%cLAST MATCH", "color: orange;", last, child);
					// 		this.selection.fixLastKey += firstOffset ? 1 : 0;
					// 		this.selection.fixLastOffset = firstOffset
					// 			? child.text.length
					// 			: last.text.length;
					// 	} else if (firstOffset) {
					// 		// this.selection.fixLastKey += 1;
					// 	}

					// 	console.log("R add", key, i, child, JSON.stringify(last.key));
					// }
				}

				last = child;
			}

			this._buildKeys(tokens.children, keys, key);
		}

		// if (fixedFirst) {
		// 	this.selection.fixFirst = fixedFirst;
		// 	console.log({
		// 		fixedFirst,
		// 	});
		// 	// this.selection.fix = true;
		// }

		// if (fixedLast) {
		// 	this.selection.fixLast = fixedLast;
		// 	console.log({
		// 		fixedLast,
		// 	});
		// 	// this.selection.fix = true;
		// }

		return keys;
	};

	public remove = (key: string) => {
		const parent = this.parent(key);

		// Handle root text nodes
		if (parent === null) {
			const element = this.findElement(key);
			const index = this.tokens.indexOf(element);
			this.tokens.splice(index, 1);
			console.log("🏴‍☠️ REMOVE ROOT", index);

			return;
		}

		if (!parent || !Array.isArray(parent?.children)) {
			return;
		}

		const index = parent.children.findIndex((c) => c.key === key);
		parent.children.splice(index, 1);
		console.log("🏴‍☠️ REMOVE CHILD", parent.key, key);
	};

	public keysBetween = (firstKey: string, lastKey: string) => {
		const keys = Object.values(this._idToKey);
		const li = keys.indexOf(lastKey);

		if (li === -1) {
			return keys.slice(keys.indexOf(firstKey));
		}

		return keys.slice(keys.indexOf(firstKey), li + 1);
	};

	public removeBetween = (
		firstKey: string,
		lastKey: string,
		lastIncluded = true,
	) => {
		const keys = this.keysBetween(firstKey, lastKey);

		keys.shift();

		if (!lastIncluded) {
			const index = keys.indexOf(lastKey);
			if (index > -1) {
				keys.splice(index, 1);
			}
		}

		for (const key of keys) {
			this.remove(key);
		}
	};

	public findElement = (key: string) => {
		return this._elements[key];
	};

	public innerNode = (key: string): InlineToken => {
		let el = this.findElement(key) as any;

		if (el?.children) {
			el = el.children[0];
		}

		return el;
	};

	public innerText = (key: string) => {
		let el = this.innerNode(key);

		if (el.type !== "t") {
			return;
		}

		return el;
	};

	public parent = (key: string): BlockToken | null => {
		const keyChunks = key.split(".");
		keyChunks.pop();
		const parentKey = keyChunks.join(".");

		if (!parentKey) {
			return null;
		}

		return this.findElement(parentKey) as BlockToken;
	};

	public nextSiblings = (key: string, selfIncluded = false): AnyToken[] => {
		const selfKey = key.split(".").pop()!;

		const parent = this.parent(key);

		if (!parent?.children) {
			return [];
		}

		return parent.children.slice(
			parseInt(selfKey, 10) + (selfIncluded ? 0 : +1),
		);
	};

	public previousText = (key: string): TextToken | null => {
		const keys = Object.values(this._idToKey);
		const index = keys.indexOf(key);

		if (index < 1) {
			return null;
		}

		const lastKey = keys[index - 1];

		const el = this.findElement(lastKey);

		if (el?.type === "t") {
			return el;
		}

		return this.previousText(lastKey);
	};

	public nextText = (currentKey: string): TextToken | null => {
		const keys = Object.values(this._idToKey);
		const index = keys.indexOf(currentKey);

		if (index < 1) {
			return null;
		}

		const lastKey = keys[index + 1];

		const el = this.findElement(lastKey);

		if (el?.type === "t") {
			return el;
		}

		return this.nextText(lastKey);
	};

	public _transformToParagraph(element: BlockToken) {
		element.type = "p";
		element.props = undefined as any;
		this.select(element.children[0]);
	}

	private _handleInitialRemove = (element: AnyToken) => {
		const parent =
			element.type === "t" || element.type === "img"
				? this.parent(element.key)!
				: element;

		if (element.type === "img") {
			parent.children = [
				cloneToken({
					type: "t",
					text: "",
					id: ranID(),
					props: {},
					key: "",
				}),
			];
			return;
		}

		if (parent.type === "h") {
			if (parent.props.size <= 1) {
				this._transformToParagraph(parent);
				return;
			}

			parent.props.size -= 1;
			return;
		}

		if (parent.type === "p") {
			if (parent.children.length === 1 && parent.key.startsWith("0")) {
				return;
			}

			if (parent.children.length === 1 && !parent.children[0].text) {
				const prev = this.previousText(parent.key);
				this.remove(parent.key);
				const l = prev!.text.length;
				this.stack.push(() => {
					setCaret(prev!.id, l);
				});
				return;
			}

			// Don't allow to move past first element & first line
			if (parent.key === "0") {
				return;
			}

			const prev = this.previousText(parent.key)!;
			const siblings = parent.children.map(cloneToken);

			this.insert(siblings, prev);
			this.remove(parent.key);

			const prevLength = prev.text.length;

			this.recalculate();

			const prevAfterCalculation = this.innerText(prev.key);

			this.stack.push(() => {
				if (prevAfterCalculation !== prev) {
					setCaret(prevAfterCalculation.id, prevLength);
					return;
				}

				setCaret(prev.id, prevLength);
			});
			return;
		}

		if (parent.props.indent && parent.props.indent > 0) {
			handleTab(parent, parent, this, true);
			return;
		}

		this._transformToParagraph(parent);

		console.log("🟢 REMOVE INITIAL", (parent as any).index);
	};

	private _handleTextTransforms = (element: TextToken, textAdded: string) => {
		if (textAdded === "D") {
			element.text = element.text.replace(/\:D/g, "😄");
			return;
		}

		const parent = this.parent(element.key)!;

		// "-|[space]" => "• |"
		if (textAdded === " " && parent.type === "p" && element.text === "- ") {
			parent.type = "l" as any;
			element.text = "";
			parent.props = {
				indent: 0,
				...parent.props,
				type: "ul",
			};
			return;
		}

		// "1.|[space]" => "1. |"
		if (textAdded === " " && parent.type === "p" && element.text === "1. ") {
			parent.type = "l" as any;
			element.text = "";
			parent.props = {
				indent: 0,
				...parent.props,
				type: "ol",
			};
			return;
		}
	};

	public insert = <T = AnyToken, E = AnyToken>(
		tokens: T[],
		element: E,
		direction = 1,
	): T[] => {
		const parent = this.parent(element.key);

		const newTokens = tokens.map(cloneToken);

		if (!parent) {
			this.tokens.splice(
				this.tokens.indexOf(element) + direction,
				0,
				...newTokens,
			);

			return newTokens;
		}

		parent.children.splice(
			parent.children.indexOf(element) + direction,
			0,
			...newTokens,
		);

		return newTokens;
	};

	private _pushToHistory = (type: number, data?: string) => {
		const first = this.selection.first.slice() as [string, number];
		const last = this.selection.last.slice() as [string, number];
		const tokensString = JSON.stringify(this.tokens);
		const trace = {
			undo: () => {
				this.selection.first = first;
				this.selection.last = last;
				this.tokens = JSON.parse(tokensString);

				this.recalculate();

				this.stack.push(() => {
					setCaret(
						this.findElement(first[0]).id,
						first[1],
						this.findElement(last[0]).id,
						last[1],
					);
				});
			},
			redo: () => {
				this.selection.first = first;
				this.selection.last = last;

				this.recalculate();

				this.stack.push(() => {
					setCaret(
						this.findElement(first[0]).id,
						first[1],
						this.findElement(last[0]).id,
						last[1],
					);
				});

				this.action(type, data);
			},
		};

		// this.history.push(trace);
		this.history.push(trace, type === ACTION._Compose ? ACTION._Key : type);
	};

	private _cut = (
		el: TextToken,
		firstOffset: number,
		lastOffset?: number,
		additionalProps?: Record<string, any>,
	) => {
		let middle = el.text.slice(firstOffset, lastOffset);
		let right = el.text.slice(lastOffset);
		el.text = el.text.slice(0, firstOffset);

		const output: TextToken[] = [
			{
				type: "t",
				text: middle,
				id: ranID(),
				props: {
					...el.props,
					...additionalProps,
				},
				key: "",
			},
		];

		if (lastOffset === undefined) {
			return output;
		}

		return output
			.concat({
				type: "t",
				text: right,
				id: ranID(),
				props: el.props,
				key: "",
			})
			.filter((a) => a.text);
	};

	public action = (type: number, data?: string) => {
		if (!this.history.locked) {
			console.log("ACTION", {
				type,
				data,
			});
		}

		if (type === ACTION._Undo) {
			this.history.undo();
			return;
		}

		if (type === ACTION._Redo) {
			this.history.redo();
			return;
		}

		if (type === ACTION._Key && data === " ") {
			this.history.batch();
		}

		this._pushToHistory(type, data);

		let {
			first: [firstKey, firstOffset],
			last: [lastKey, lastOffset],
		} = this.selection;

		if (
			type === ACTION._Remove &&
			(firstKey !== lastKey || firstOffset !== lastOffset)
		) {
			type = ACTION._Key;
			data = "";
		} else if (type === ACTION._Remove && firstOffset > 1) {
			type = ACTION._Key;
			data = "";
			firstOffset -= 1;
		} else if (type === ACTION._Remove) {
			let element = this.innerNode(firstKey);

			const isFirstChild = element.key?.endsWith(".0") ?? true;

			if (firstOffset === 1) {
				element.text = stringSplice(
					element.text,
					firstOffset - 1,
					firstOffset,
					"",
				);

				if (!isFirstChild) {
					const prev = this.previousText(element.key);

					if (prev) {
						// const l = prev.text?.length;
						this.select2(this.findElement(prev.key)!, prev.text?.length);
						// this.stack.push(() => {
						// 	setCaret(prev.id, l);
						// });
					}
				} else if (!element.text) {
					const next = this.nextText(lastKey);

					if (
						next &&
						next.id.replace(/\.[\d]+$/, "") ===
							element.key.replace(/\.[\d]+$/, "")
					) {
						this.select2(this.findElement(next.key)!, 0);
						// this.stack.push(() => {
						// 	setCaret(next.id, 0);
						// 	resetSelection(next.id, 0);
						// });
					} else {
						// console.log("HEREEE");
						// Heres the issue
						this.select2(this.findElement(lastKey)!, 0);
						// this.stack.push(() => {
						// 	setCaret(this.findElement(lastKey).id, 0);
						// 	resetSelection(lastKey, 0);
						// 	// if (this.selection) {
						// 	// 	this.selection.anchorOffset = this.selection.anchorOffset - 1;
						// 	// 	this.selection.focusOffset = this.selection.focusOffset - 1;
						// 	// }
						// 	// this.setSelection(this.selection);
						// });
						// this._handleInitialRemove(element);
						// return;
					}
				} else {
					this.select2(element, firstOffset - 1);
					// this.stack.push(() => {
					// 	setCaret(element.id, firstOffset - 1);
					// 	resetSelection(firstKey, firstOffset - 1);
					// 	// if (this.selection) {
					// 	// 	this.selection.anchorOffset = this.selection.anchorOffset - 1;
					// 	// 	this.selection.focusOffset = this.selection.focusOffset - 1;
					// 	// }
					// 	// this.setSelection(this.selection);
					// });
				}

				// if (!element.text) {
				this.recalculate();
				// }

				return;
			}

			// if (!isFirstChild) {
			//   return;
			// }

			this._handleInitialRemove(element);
			this.recalculate();

			return;
		}

		// TAB key
		if (type === ACTION._Tab || type === ACTION._ShiftTab) {
			let firstElement = this.innerNode(firstKey);
			let firstParent = this.parent(firstElement.key)!;
			let lastElement = this.innerNode(lastKey);
			let lastParent = this.parent(lastElement.key)!;

			handleTab(firstParent, lastParent, this, type === ACTION._ShiftTab);

			return;
		}

		// ENTER key
		if (type === ACTION._Enter) {
			let firstElement = this.innerText(firstKey);
			let lastElement = this.innerText(lastKey);

			if (!firstElement || !lastElement) {
				const key = !firstElement ? firstKey : lastKey;
				const el = this.findElement(key);
				const parent = this.parent(key);

				if (parent?.type === "p") {
					parent.children = [
						{
							id: el.id,
							key: el.key,
							type: "t",
							props: {},
							text: "",
						},
					];
					this.recalculate();
				}
				return;
			}

			let firstParent = this.parent(firstElement.key)!;
			let lastParent = this.parent(lastElement.key)!;

			const siblings: any[] = this.nextSiblings(lastElement.key, true)
				.filter((e) => e.key >= lastElement!.key)
				.map(cloneToken);
			if (siblings[0]?.text) {
				siblings[0].text = siblings[0].text.slice(lastOffset);
			}

			firstElement.text = firstElement.text.slice(0, firstOffset);

			const newToken = {
				id: ranID(),
				type: "p",
				children: [...siblings, { id: ranID(), type: "t", text: "" }],
			};
			const lastKeyChunks = lastElement.key.split(".");
			this.removeBetween(
				firstElement.key,
				String(parseInt(lastKeyChunks[0], 10) + 1),
				false,
			);
			const clonedTokens = this.insert([newToken] as any, firstParent);
			this.recalculate();
			this.select(this.nextText(clonedTokens[0].key)!, 0);
			// this.stack.push(() => setCaret(this.nextText(clonedTokens[0].key)!.id, 0));

			if (firstParent === lastParent) {
				handleEnter(firstParent, clonedTokens[0] as any, this);
			}

			return;
		}

		if (
			(type === ACTION._FormatAdd || type === ACTION._FormatRemove) &&
			data != null
		) {
			// @TODO figure out how to set styles beforehand
			if (firstKey === lastKey && firstOffset === lastOffset) {
				return;
			}

			const [key, value] = data;
			const newProps = {
				[key]: type === ACTION._FormatAdd ? value : undefined,
			};

			this.selection.setFormat({
				...this.selection.format,
				...newProps,
			});

			// if (firstKey === lastKey && firstOffset === lastOffset) {
			// 	return;
			// }

			const elements = this.keysBetween(firstKey, lastKey).reduce<TextToken[]>(
				(acc, key) => {
					const el = this.findElement(key);

					if (el.type !== "t") {
						return acc;
					}

					return acc.concat(el);
				},
				[],
			);

			if (ACTION._FormatAdd) {
				console.log(
					"%c + STYLE ",
					"background: #00b33c; color: black; font-weight: bold;",
					elements.map((e) => e.key),
					...data,
				);
			} else {
				console.log(
					"%c - STYLE ",
					"background: #e62e00; color: black; font-weight: bold;",
					elements.map((e) => e.key),
					...data,
				);
			}

			if (elements.length === 1) {
				const el = elements[0];
				const rest = this._cut(el, firstOffset, lastOffset, newProps);

				// console.log('rest', el, rest);

				const [newToken] = this.insert(rest, el);

				if (!el.text) {
					this.remove(el.key);
					console.log("REMOVEd");
				}

				// console.log("tokens", el, tokens);

				const prev = this.previousText(el.key);
				const prevText = prev?.text;

				this.recalculate();

				if (!newToken.key && prevText) {
					console.log(1);
					this.select2(
						prev,
						prevText?.length,
						undefined,
						prevText?.length + lastOffset,
					);
				} else if (!el.text) {
					console.log(2);
					this.select2(newToken, firstOffset, undefined, lastOffset);
				} else {
					console.log(3, newToken.text, el.text, prev?.text);
					this.select2(newToken, 0, undefined, newToken.text.length);
				}

				return;
			}

			const firstEl = elements.shift()!;
			const lastEl = elements.pop()!;

			const [firstToken] = this.insert(
				this._cut(firstEl, firstOffset, undefined, newProps),
				firstEl,
			);

			const [lastToken] = this.insert(
				this._cut(lastEl, 0, lastOffset, newProps),
				lastEl,
			);

			for (const el of elements) {
				el.props = {
					...el.props,
					...newProps,
				};
			}

			// console.log("multi", firstEl, elements, lastEl);

			if (!firstEl.text) {
				this.remove(firstEl.key);
			}

			if (!lastEl.text) {
				this.remove(lastEl.key);
			}

				const firstPrev = this.previousText(firstEl.key);
			const firstPrevText = firstPrev?.text;

			this.recalculate();

				if (!firstToken.key && firstPrevText) {
					console.log(1);
					this.select2(
						firstPrev,
						firstPrevText?.length,
						undefined,
						firstPrevText?.length + lastOffset,
					);
				} else if (!firstToken.text) {
					console.log(2);
					this.select2(firstToken, firstOffset, undefined, lastOffset);
				} else {
					console.log(3, firstToken.text, firstToken.text, firstPrev?.text);
					this.select2(firstToken, 0, lastToken, lastToken.text.length || this.previousText(lastEl.key).text.length);
				}
			console.log(firstEl.text, lastEl.text, firstToken.text, lastToken.text);

			// if (!firstToken.key) {
			// 	this.select2(firstEl, firstOffset);
			// }

			// this.select2(firstToken, 0, lastToken, lastToken.text.length);
			// this.select(firstToken, 0, lastToken, lastToken.text.length);
			return;
		}

		// if (type === ACTION._FormatRemove && data != null) {
		// 	const keys = this.keysBetween(firstKey, lastKey);

		// 	for (const key of keys) {
		// 		const el = this.findElement(key);

		// 		if (el.type === "t") {
		// 			console.log(
		// 				"%c - STYLE ",
		// 				"background: #e62e00; color: black; font-weight: bold;",
		// 				el.key,
		// 				...data,
		// 			);
		// 			if (!el.props) {
		// 				continue;
		// 			}
		// 			el.props = {
		// 				...el.props,
		// 				[data[0]]: undefined,
		// 			};
		// 		}
		// 	}

		// 	// @TODO Figure out why remove action doesn't reload view
		// 	this.selection.setFormat({
		// 		...this.selection.format,
		// 		[data[0]]: undefined,
		// 	});
		// 	this.recalculate();
		// 	return;
		// }

		// Handle new text being added after Dead key
		if (type === ACTION._Compose && data != null) {
			let el = this.innerText(firstKey)!;

			if (!el) {
				return;
			}

			el.text = stringSplice(el.text, firstOffset, firstOffset, data);

			this.recalculate();
			this.select(el, firstOffset + data.length);
			return;
		}

		// Handle new text being added
		if (type === ACTION._Key && data != null) {
			let firstElement = this.innerText(firstKey)!;
			let lastElement = this.innerText(lastKey)!;

			if (!firstElement || !lastElement) {
				const key = !firstElement ? firstKey : lastKey;
				const el = this.findElement(key);
				const parent = this.parent(key);

				if (parent?.type === "p") {
					parent.children = [
						{
							id: el.id,
							key: el.key,
							type: "t",
							props: {},
							text: "",
						},
					];
					this.recalculate();
					firstElement = this.innerText(firstKey) as any;
					lastElement = this.innerText(lastKey) as any;
				}
			}

			if (!firstElement && !lastElement) {
				return;
			}

			const parent = this.parent(firstKey)!;
			const index = parent.children.indexOf(firstElement);
			const lastText = lastElement.text;
			firstElement.text = firstElement.text.slice(0, firstOffset) + data;

			const firstText = firstElement.text;

			if (firstElement !== lastElement) {
				const siblings: any[] = this.nextSiblings(lastElement.key, true)
					.filter((e) => e.key >= lastElement.key)
					.map(cloneToken);
				if (siblings[0]?.text) {
					siblings[0].text = siblings[0].text.slice(lastOffset);
				}

				const lastKeyChunks = lastElement.key.split(".");
				this.removeBetween(
					firstElement.key,
					String(parseInt(lastKeyChunks[0], 10) + 1),
					false,
				);

				this.insert(siblings, firstElement);

				// this.recalculate();

				// this.select(parent.children[index], firstText.length);
				// return;
			} else {
				firstElement.text += lastText.slice(lastOffset);
				// this.recalculate();
				// this.select(firstElement, firstText.length);
			}

			const prev = parent.children[index - 1];
			const previousLength = (prev as any)?.text?.length || 0;

			this.recalculate();

			if (data && firstKey === lastKey && firstOffset === lastOffset) {
				this._handleTextTransforms(firstElement, data);
				// const firstChild = parent.children[0] as any;
				// this.select(firstChild, firstChild.text.length);
				// return;
				// this.recalculate();
				// this.stack.push(() => {

				// 	this.select(parent.children[index], firstText.length);
				// });
				// return;
			}

			const correctedChild = parent.children[index] as any;

			if (prev && correctedChild !== firstElement) {
				// Element was deleted fallback to previous element
				this.select2(prev, previousLength);
			} else {
				this.select2(
					correctedChild,
					Math.min(correctedChild.text.length, firstText.length),
				);
			}

			// if (firstElement.text) {
			// 	this.select(firstElement, firstText.length);
			// 	// this.stack.push(() =>
			// 	// 	setCaret(firstElement.id, firstOffset + (data?.length as number)),
			// 	// );
			// 	// this.recalculate();
			// 	return;
			// }

			// // Hello {World} 2
			// // ^^^^^^ > backspace
			// if (firstElement.key.endsWith(".0")) {
			// 	const parent = this.parent(firstElement.key)!;

			// 	// this.stack.push(() => setCaret(parent.id, 0));
			// 	this.select(parent, 0);
			// 	this.recalculate();

			// 	// resetSelection(firstKey, 0);
			// 	return;
			// }

			// // Hello {World} 2
			// //        ^^^^^ > backspace
			// const prev = this.previousText(firstElement.key)!;
			// this.select(prev, prev.text.length || 0);
			// this.recalculate();
			return;
		}
	};

	// private _selectSilent = (first: AnyToken, start: number = 0) => {
	// 	if (this._isComposing) {
	// 		return;
	// 	}

	// 	this.stack.push(() => setCaret(first.id, start));
	// 	this.update();
	// };

	public select2 = (
		first: AnyToken,
		firstOffset: number = 0,
		last: AnyToken = first,
		lastOffset: number = firstOffset,
	) => {
		if (this._isComposing) {
			return;
		}

		console.log(
			"%c SELECT ",
			"background-color: salmon; color: black; font-weight: bold;",
			{
				first: first.key,
				firstOffset,
				last: last.key,
				lastOffset,
			},
		);

		// this._selectSilent(first, firstOffset);
		this.stack.push(() => setCaret(first.id, firstOffset, last.id, lastOffset));

		this.update();
		this.selection.setSelection(first.key, firstOffset, last.key, lastOffset);
	};

	public select = (
		first: AnyToken,
		firstOffset: number = 0,
		last: AnyToken = first,
		lastOffset: number = firstOffset,
	) => {
		return;
		if (this._isComposing) {
			return;
		}

		// this._selectSilent(first, firstOffset);
		this.stack.push(() => setCaret(first.id, firstOffset, last.id, lastOffset));

		this.update();
		this.selection.setSelection(first.key, firstOffset, last.key, lastOffset);
	};
}
