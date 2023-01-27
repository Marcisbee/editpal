import { Exome } from "exome";

import {
	AnyToken,
	BlockToken,
	InlineToken,
	TextToken,
	TokenRoot,
} from "./tokens";
import { setCaret, cloneToken, stringSplice, ranID } from "./utils";

export const ACTION = {
	_Key: 0,
	_Remove: 1,
	_Enter: 2,
	_Delete: 3,
	_Tab: 4,
	_ShiftTab: 5,
	_Paste: 6,
	_Compose: 7,
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

export class ModelSelection extends Exome {
	public first: [string, number] = ["0.0", 0];
	public last: [string, number] = this.first;

	public setSelection(
		anchor: string,
		anchorOffset: number,
		focus: string,
		focusOffset: number,
	) {
		const [first, last] = (
			[
				[anchor, anchorOffset],
				[focus, focusOffset],
			] as [string, number][]
		).sort((a, b) => {
			if (a[0] === b[0]) {
				return a[1] > b[1] ? 1 : -1;
			}

			return a[0].localeCompare(b[0], undefined, { numeric: true });
		});

		this.first = first;
		this.last = last;
	}
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

	public _idToKey: Record<string, string> = {};
	public _elements: Record<string, AnyToken> = {};
	public _elements_temp: Record<string, AnyToken> = {};
	public stack: Function[] = [];
	public _isComposing = false;

	constructor(tokens: TokenRoot) {
		super();

		this.tokens = cloneToken(tokens);
		this.recalculate();

		console.log(this.tokens, this._idToKey);
	}

	public update() {}

	public recalculate = () => {
		if (this._isComposing) {
			return;
		}

		this._elements_temp = {};
		this._idToKey = this._buildKeys(this.tokens);
		this._elements = this._elements_temp;
		this.update();
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
						tokens.children.splice(i - 1, 1);
						i -= 1;
						break check;
					}

					if (!child.text) {
						tokens.children.splice(i, 1);
						i -= 1;
						continue;
					}

					if (JSON.stringify(last.props) === JSON.stringify(child.props)) {
						last.text += child.text;
						tokens.children.splice(i, 1);
						i -= 1;
						continue;
					}
				}

				last = child;
			}

			this._buildKeys(tokens.children, keys, key);
		}

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

	private _handleInitialRemove = (element: AnyToken) => {
		const parent =
			element.type === "t" || element.type === "img"
				? this.parent(element.key)!
				: element;

		if (parent.type === "h") {
			if (parent.props.size <= 1) {
				transformToParagraph(parent);
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

			this.insertAfter(siblings, prev);
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

		transformToParagraph(parent);

		this.select(parent);

		console.log("🟢 REMOVE INITIAL", (parent as any).index);

		function transformToParagraph(element: AnyToken) {
			// Transform block to paragraph
			element.type = "p";
			(element as any).props = undefined;
		}
	};

	private _handleTextTransforms = (element: TextToken, textAdded: string) => {
		console.log({ textAdded });
		if (textAdded === ")") {
			element.text = element.text.replace(/\:\)/g, "😄");
			return;
		}

		const parent = this.parent(element.key)!;

		// "-|[space]" => "• |"
		if (textAdded === " " && parent.type === "p" && element.text === "- ") {
			parent.type = "l";
			element.text = "";
			return;
		}

		// "1.|[space]" => "1. |"
		if (textAdded === " " && parent.type === "p" && element.text === "1. ") {
			parent.type = "l";
			element.text = "";
			parent.props = {
				...parent.props,
				type: "ol",
			};
			return;
		}
	};

	public insertAfter = (tokens: AnyToken[], element: AnyToken) => {
		const parent = this.parent(element.key);

		const newTokens = tokens.map(cloneToken);

		if (!parent) {
			this.tokens.splice(this.tokens.indexOf(element) + 1, 0, ...newTokens);

			return newTokens;
		}

		parent.children.splice(
			parent.children.indexOf(element) + 1,
			0,
			...newTokens,
		);

		return newTokens;
	};

	public action = (type: number, data?: string) => {
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
						this.select(this.findElement(next.key)!, 0);
						// this.stack.push(() => {
						// 	setCaret(next.id, 0);
						// 	resetSelection(next.id, 0);
						// });
					} else {
						// console.log("HEREEE");
						// Heres the issue
						this.select(this.findElement(lastKey)!, 0);
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
					this.select(element, firstOffset - 1);
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
			const clonedTokens = this.insertAfter([newToken] as any, firstParent);
			this.recalculate();
			this.select(this.nextText(clonedTokens[0].key)!, 0);
			// this.stack.push(() => setCaret(this.nextText(clonedTokens[0].key)!.id, 0));

			if (firstParent === lastParent) {
				handleEnter(firstParent, clonedTokens[0] as any, this);
			}

			return;
		}

		// Handle new text being added after Dead key
		if (type === ACTION._Compose && data != null) {
			let el = this.innerText(firstKey)!;

			if (!el) {
				return;
			}

			el.text = stringSplice(el.text, firstOffset - 1, firstOffset - 1, data);

			this.recalculate();
			this.select(el, firstOffset - 1 + data.length);
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

				this.insertAfter(siblings, firstElement);

				this.recalculate();
				// resetSelection(firstKey, 0);
				this.select(firstElement, 0);
			} else {
				firstElement.text += lastText.slice(lastOffset);
				// this.select(firstElement, firstText.length);
			}

			if (data && firstKey === lastKey && firstOffset === lastOffset) {
				this._handleTextTransforms(firstElement, data);
			}

			if (firstElement.text) {
				this.select(firstElement, firstText.length);
				// this.stack.push(() =>
				// 	setCaret(firstElement.id, firstOffset + (data?.length as number)),
				// );
				// this.recalculate();
				return;
			}

			// Hello {World} 2
			// ^^^^^^ > backspace
			if (firstElement.key.endsWith(".0")) {
				const parent = this.parent(firstElement.key)!;

				// this.stack.push(() => setCaret(parent.id, 0));
				this.select(parent, 0);
				this.recalculate();

				// resetSelection(firstKey, 0);
				return;
			}

			// Hello {World} 2
			//        ^^^^^ > backspace
			const prev = this.previousText(firstElement.key)!;
			this.select(prev, prev.text.length || 0);
			this.recalculate();
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

	public select = (first: AnyToken, start: number = 0) => {
		if (this._isComposing) {
			return;
		}

		// this._selectSilent(first, start);
		this.stack.push(() => setCaret(first.id, start));
		
		this.update();
		this.selection.setSelection(first.key, start, first.key, start);
	};
}
