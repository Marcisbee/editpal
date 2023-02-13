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
import { createBlockToken, createTextToken } from "./utils/create-token";
import { buildKeys } from "./utils/selection";

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
	public selection = new ModelSelection(this);
	public history = new HistoryStore();

	public _idToKey: Record<string, string> = {};
	public _elements: Record<string, AnyToken> = {};
	public _isComposing = false;
	public _stack: Function[] = [];

	constructor(
		tokens: TokenRoot = [createBlockToken("p", {}, [createTextToken()])],
	) {
		super();

		this.tokens = cloneToken(tokens);
		this.recalculate(true);

		// console.log(this.tokens, this._idToKey);
	}

	public update() {}

	public recalculate = (initial = false) => {
		if (this._isComposing) {
			return;
		}

		const {
			_keys,
			_elements,
			_newSelection: [first, last],
		} = buildKeys(this.tokens, [this.selection.first, this.selection.last]);

		this._idToKey = _keys;
		this._elements = _elements;
		this.update();

		// Don't heal initial selection
		if (initial) {
			return;
		}

		if (first[0] === last[0] && first[1] === last[1]) {
			return;
		}

		this.select(
			this.findElement(first[0]!),
			first[1]!,
			this.findElement(last[0]!),
			last[1]!,
		);
	};

	public remove = (key: string) => {
		const parent = this.parent(key);

		// Handle root text nodes
		if (parent === null) {
			const element = this.findElement(key);
			const index = this.tokens.indexOf(element);
			this.tokens.splice(index, 1);
			// console.log("🏴‍☠️ REMOVE ROOT", index);

			return;
		}

		if (!parent || !Array.isArray(parent?.children)) {
			return;
		}

		const index = parent.children.findIndex((c) => c.key === key);
		parent.children.splice(index, 1);
		// console.log("🏴‍☠️ REMOVE CHILD", parent.key, key);
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
			parent.children = [createTextToken()];
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
				this._stack.push(() => {
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

			this._stack.push(() => {
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

		// console.log("🟢 REMOVE INITIAL", (parent as any).index);
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

				this._stack.push(() => {
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

				this._stack.push(() => {
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
			createTextToken(
				{
					...el.props,
					...additionalProps,
				},
				middle,
			),
		];

		if (lastOffset === undefined) {
			return output;
		}

		return output
			.concat(createTextToken(el.props, right))
			.filter((a) => a.text);
	};

	public action = (type: number, data?: string) => {
		// if (!this.history.locked) {
		// 	console.log("ACTION", {
		// 		type,
		// 		data,
		// 	});
		// }

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
						this.select(this.findElement(prev.key)!, prev.text?.length);
						// this._stack.push(() => {
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
						this.select(this.findElement(next.key)!, 0);
						// this._stack.push(() => {
						// 	setCaret(next.id, 0);
						// 	resetSelection(next.id, 0);
						// });
					} else {
						// Heres the issue
						this.select(this.findElement(lastKey)!, 0);
						// this._stack.push(() => {
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
					this.select(element, firstOffset - 1);
					// this._stack.push(() => {
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
							...createTextToken(),
							id: el.id,
							key: el.key,
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

			const newToken = createBlockToken("p", {}, [
				...siblings,
				createTextToken(),
			]);
			const lastKeyChunks = lastElement.key.split(".");
			this.removeBetween(
				firstElement.key,
				String(parseInt(lastKeyChunks[0], 10) + 1),
				false,
			);
			const clonedTokens = this.insert([newToken] as any, firstParent);
			this.recalculate();
			this.select(this.nextText(clonedTokens[0].key)!, 0);
			// this._stack.push(() => setCaret(this.nextText(clonedTokens[0].key)!.id, 0));

			if (firstParent === lastParent) {
				handleEnter(firstParent, clonedTokens[0] as any, this);
			}

			return;
		}

		if (
			(type === ACTION._FormatAdd || type === ACTION._FormatRemove) &&
			data != null
		) {
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

			// if (ACTION._FormatAdd) {
			// 	console.log(
			// 		"%c + STYLE ",
			// 		"background: #00b33c; color: black; font-weight: bold;",
			// 		elements.map((e) => e.key),
			// 		...data,
			// 	);
			// } else {
			// 	console.log(
			// 		"%c - STYLE ",
			// 		"background: #e62e00; color: black; font-weight: bold;",
			// 		elements.map((e) => e.key),
			// 		...data,
			// 	);
			// }

			if (elements.length === 1) {
				const el = elements[0];
				const rest = this._cut(el, firstOffset, lastOffset, newProps);

				this.insert(rest, el);

				this.recalculate();

				return;
			}

			const firstEl = elements.shift()!;
			const lastEl = elements.pop()!;

			this.insert(
				this._cut(firstEl, firstOffset, undefined, newProps),
				firstEl,
			);

			this.insert(this._cut(lastEl, 0, lastOffset, newProps), lastEl);

			if (!firstEl.text && !elements.length) {
				this.remove(firstEl.key);
			}

			for (const el of elements) {
				el.props = {
					...el.props,
					...newProps,
				};
			}

			this.recalculate();
			return;
		}

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
				// this._stack.push(() => {

				// 	this.select(parent.children[index], firstText.length);
				// });
				// return;
			}

			const correctedChild = parent.children[index] as any;

			if (prev && correctedChild !== firstElement) {
				// Element was deleted fallback to previous element
				this.select(prev, previousLength);
			} else {
				this.select(
					correctedChild,
					Math.min(correctedChild.text.length, firstText.length),
				);
			}

			// if (firstElement.text) {
			// 	this.select(firstElement, firstText.length);
			// 	// this._stack.push(() =>
			// 	// 	setCaret(firstElement.id, firstOffset + (data?.length as number)),
			// 	// );
			// 	// this.recalculate();
			// 	return;
			// }

			// // Hello {World} 2
			// // ^^^^^^ > backspace
			// if (firstElement.key.endsWith(".0")) {
			// 	const parent = this.parent(firstElement.key)!;

			// 	// this._stack.push(() => setCaret(parent.id, 0));
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

	// 	this._stack.push(() => setCaret(first.id, start));
	// 	this.update();
	// };

	public select = (
		first: AnyToken,
		firstOffset: number = 0,
		last: AnyToken = first,
		lastOffset: number = firstOffset,
	) => {
		if (this._isComposing) {
			return;
		}

		// console.log(
		// 	"%c SELECT ",
		// 	"background-color: salmon; color: black; font-weight: bold;",
		// 	{
		// 		first: first.key,
		// 		firstOffset,
		// 		last: last.key,
		// 		lastOffset,
		// 	},
		// );

		// this._selectSilent(first, firstOffset);
		this._stack.push(() =>
			setCaret(first.id, firstOffset, last.id, lastOffset),
		);

		this.update();
		this.selection.setSelection(first.key, firstOffset, last.key, lastOffset);
	};

	// public select2 = (
	// 	first: AnyToken,
	// 	firstOffset: number = 0,
	// 	last: AnyToken = first,
	// 	lastOffset: number = firstOffset,
	// ) => {
	// 	return;
	// 	if (this._isComposing) {
	// 		return;
	// 	}

	// 	// this._selectSilent(first, firstOffset);
	// 	this._stack.push(() =>
	// 		setCaret(first.id, firstOffset, last.id, lastOffset),
	// 	);

	// 	this.update();
	// 	this.selection.setSelection(first.key, firstOffset, last.key, lastOffset);
	// };
}
