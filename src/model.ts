import { Exome } from "exome";

import { AnyToken, BlockToken, TextToken, TokenRoot } from "./tokens";
import { setCaret, cloneToken, stringSplice, ranID } from "./utils";

export const ACTION = {
	_Key: 0,
	_Remove: 1,
	_Enter: 2,
	_Delete: 3,
	_Tab: 4,
	_ShiftTab: 5,
	_Paste: 6,
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
			indent: fromParent.props?.indent,
			type: fromParent.props?.type || 'ul',
		};
		return;
	}
}

function dotSize(value: string): number {
	return value.split(".").length;
}

function keySize(key: string): number {
  return parseInt(key.split(".").join(""), 10)
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
				continue;
			}

			element.props.indent = Math.max(0, (element.props.indent || 0) + mod);
		}
	}
}

export class Model extends Exome {
	public tokens: TokenRoot;
	public selection: {
		anchor: string;
		anchorOffset: number;
		focus: string;
		focusOffset: number;
	} | null = null;

	public _idToKey: Record<string, string> = {};
	public _elements: Record<string, AnyToken> = {};
	public _elements_temp: Record<string, AnyToken> = {};

	constructor(tokens: TokenRoot) {
		super();

		this.tokens = JSON.parse(JSON.stringify(tokens));
		this.recalculate();

		console.log(this.tokens, this._idToKey);
	}

	public recalculate() {
		this._elements_temp = {};
		this._idToKey = this._buildKeys(this.tokens);
		this._elements = this._elements_temp;
	}

	private _buildKeys(
		tokens: AnyToken | AnyToken[],
		keys: Record<string, string> = {},
		key: string[] = [],
	) {
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

		if (Array.isArray(tokens.children)) {
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
	}

	public setSelection(selection: Model["selection"]) {
		this.selection = selection;
	}

	public remove(key: string) {
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
	}

	public keysBetween(firstKey: string, lastKey: string) {
		const keys = Object.values(this._idToKey);
		return keys.slice(keys.indexOf(firstKey), keys.indexOf(lastKey) + 1);
	}

	public removeBetween(firstKey: string, lastKey: string, lastIncluded = true) {
		const keys = Object.values(this._idToKey);
		for (const key of keys.slice(keys.indexOf(firstKey))) {
			if (key > lastKey) {
				return;
			}

			if (
				!(
					key > firstKey &&
					(lastIncluded && firstKey !== lastKey
						? key <= lastKey
						: key < lastKey)
				)
			) {
				continue;
			}

			this.remove(key);
		}
	}

	public findElement(key: string) {
		return this._elements[key];
	}

	public innerText(key: string) {
		let el = this.findElement(key);
		if (el?.type !== "t") {
			el = el.children[0];
		}
		return el;
	}

	public parent(currentKey: string): BlockToken | null {
		const keyChunks = currentKey.split(".");
		keyChunks.pop();
		const parentKey = keyChunks.join(".");

		if (!parentKey) {
			return null;
		}

		return this.findElement(parentKey) as BlockToken;
	}

	public nextSiblings(currentKey: string, selfIncluded = false): AnyToken[] {
		const selfKey = currentKey.split(".").pop()!;

		const parent = this.parent(currentKey);

		if (!parent?.children) {
			return [];
		}

		console.log(
			parent.children.slice(parseInt(selfKey, 10) + (selfIncluded ? 0 : +1)),
		);
		return parent.children.slice(
			parseInt(selfKey, 10) + (selfIncluded ? 0 : +1),
		);
	}

	public previousText(currentKey: string): TextToken | null {
		const keys = Object.values(this._idToKey);
		const index = keys.indexOf(currentKey);

		if (index < 1) {
			return null;
		}

		const lastKey = keys[index - 1];

		const el = this.findElement(lastKey);

		if (el?.type === "t") {
			return el;
		}

		return this.previousText(lastKey);
	}

	public nextText(currentKey: string): TextToken | null {
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
	}

	private _handleInitialRemove(element: AnyToken) {
		const parent = element.type === "t" ? this.parent(element.key)! : element;

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
				debounceRaf(() => {
					setCaret(prev!.id, l);
				});
				this.recalculate();
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

			debounceRaf(() => {
				if (prevAfterCalculation !== prev) {
					setCaret(prevAfterCalculation.id, prevLength);
					return;
				}

				setCaret(prev.id, prevLength);
			});
			return;
		}

		transformToParagraph(parent);

		console.log("🟢 REMOVE INITIAL", (parent as any).index);

		function transformToParagraph(element: AnyToken) {
			// Transform block to paragraph
			element.type = "p";
			(element as any).props = undefined;
		}
	}

	private _handleTextTransforms(element: TextToken, textAdded: string) {
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
        type: 'ol',
      };
			return;
		}
	}

	public insertAfterParent(token: BlockToken, element: AnyToken) {
		const parent = element.type === "t" ? this.parent(element.key)! : element;

		const clone = cloneToken(token);
		this.tokens.splice(parseInt(parent.key.split(".")[0], 10) + 1, 0, clone);

		return clone;
	}

	public insertAfter(tokens: AnyToken[], element: AnyToken) {
		const parent = element.type === "t" ? this.parent(element.key)! : element;

		// console.log(parent.children.indexOf(element));
		const newTokens = tokens.map(cloneToken);

		parent.children.splice(
			parent.children.indexOf(element) + 1,
			0,
			...newTokens,
		);

		return newTokens;
	}

	public action(type: number, data?: string) {
		if (!this.selection) {
			return;
		}

		const { anchor, anchorOffset, focus, focusOffset } = this.selection;

		const [first, last] = [
			{ key: anchor, offset: anchorOffset },
			{ key: focus, offset: focusOffset },
		].sort((a, b) => {
			if (a.key === b.key) {
				return a.offset > b.offset ? 1 : -1;
			}

			return keySize(a.key) > keySize(b.key) ? 1 : -1;
		});

		const resetSelection = (key: string, offset: number) => {
			// this.selection!.anchor = first.key;
			// this.selection!.focus = first.key;
			// this.selection!.anchorOffset = 0;
			// this.selection!.focusOffset = 0;
			this.setSelection({
				anchor: key,
				focus: key,
				anchorOffset: offset,
				focusOffset: offset,
			});
		};

		if (
			type === ACTION._Remove &&
			(first.key !== last.key || first.offset !== last.offset)
		) {
			type = ACTION._Key;
			data = "";
		} else if (type === ACTION._Remove && first.offset > 1) {
			type = ACTION._Key;
			data = "";
			first.offset -= 1;
		} else if (type === ACTION._Remove) {
			let element = this.innerText(first.key);

			const isFirstChild = element.key?.endsWith(".0") ?? true;

			if (first.offset === 1) {
				element.text = stringSplice(
					element.text,
					first.offset - 1,
					first.offset,
					"",
				);

				if (!isFirstChild) {
					const prev = this.previousText(element.key);

					if (prev) {
						const l = prev.text?.length;
						debounceRaf(() => {
							setCaret(prev.id, l);
						});
					}
				} else if (!element.text) {
					const next = this.nextText(last.key);

					if (
						next &&
						next.id.replace(/\.[\d]+$/, "") ===
							element.key.replace(/\.[\d]+$/, "")
					) {
						debounceRaf(() => {
							setCaret(next.id, 0);
							resetSelection(next.id, 0);
						});
					} else {
						// console.log("HEREEE");
						// Heres the issue
						debounceRaf(() => {
							setCaret(this.findElement(last.key).id, 0);
							resetSelection(last.key, 0);
							// if (this.selection) {
							// 	this.selection.anchorOffset = this.selection.anchorOffset - 1;
							// 	this.selection.focusOffset = this.selection.focusOffset - 1;
							// }
							// this.setSelection(this.selection);
						});
						// this._handleInitialRemove(element);
						// return;
					}
				} else {
					debounceRaf(() => {
						setCaret(element.id, first.offset - 1);
						resetSelection(first.key, first.offset - 1);
						// if (this.selection) {
						// 	this.selection.anchorOffset = this.selection.anchorOffset - 1;
						// 	this.selection.focusOffset = this.selection.focusOffset - 1;
						// }
						// this.setSelection(this.selection);
					});
				}

				if (!element.text) {
					this.recalculate();
				}

				return;
			}

			// if (!isFirstChild) {
			//   return;
			// }

			this._handleInitialRemove(element);

			return;
		}

		// TAB key
		if (type === ACTION._Tab || type === ACTION._ShiftTab) {
			let firstElement = this.innerText(first.key);
			let firstParent = this.parent(firstElement.key)!;
			let lastElement = this.innerText(last.key);
			let lastParent = this.parent(lastElement.key)!;

			handleTab(firstParent, lastParent, this, type === ACTION._ShiftTab);

			return;
		}

		// ENTER key
		if (type === ACTION._Enter) {
			let firstElement = this.innerText(first.key);
			let firstParent = this.parent(firstElement.key)!;
			let lastElement = this.innerText(last.key);
			let lastParent = this.parent(lastElement.key)!;

			const siblings: any[] = this.nextSiblings(lastElement.key, true)
				.filter((e) => e.key >= lastElement.key)
				.map(cloneToken);
			if (siblings[0]?.text) {
				siblings[0].text = siblings[0].text.slice(last.offset);
			}

			firstElement.text = firstElement.text.slice(0, first.offset);

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
			const clonedToken = this.insertAfterParent(newToken as any, firstElement);
			// console.log({ clonedToken });
			this.recalculate();
			debounceRaf(() => setCaret(this.nextText(clonedToken.key)!.id, 0));

			if (firstParent === lastParent) {
				handleEnter(firstParent, clonedToken, this);
			}

			return;
		}

		// Handle new text being added
		if (type === ACTION._Key && data != null) {
			let firstElement = this.innerText(first.key);
			let lastElement = this.innerText(last.key);

			const lastText = lastElement.text;
			firstElement.text = firstElement.text.slice(0, first.offset) + data;

			if (firstElement !== lastElement) {
				const siblings: any[] = this.nextSiblings(lastElement.key, true)
					.filter((e) => e.key >= lastElement.key)
					.map(cloneToken);
				if (siblings[0]?.text) {
					siblings[0].text = siblings[0].text.slice(last.offset);
				}

				const lastKeyChunks = lastElement.key.split(".");
				this.removeBetween(
					firstElement.key,
					String(parseInt(lastKeyChunks[0], 10) + 1),
					false,
				);

				this.insertAfter(siblings, firstElement);

				resetSelection(first.key, 0);
			} else {
				firstElement.text += lastText.slice(last.offset);
			}

			if (data && first.key === last.key && first.offset === last.offset) {
				this._handleTextTransforms(firstElement, data);
			}

			if (firstElement.text) {
				debounceRaf(() =>
					setCaret(firstElement.id, first.offset + (data?.length as number)),
				);
				this.recalculate();
				return;
			}

			// Hello {World} 2
			// ^^^^^^ > backspace
			if (firstElement.key.endsWith(".0")) {
				const parent = this.parent(firstElement.key)!;

				debounceRaf(() => setCaret(parent.id, 0));
				this.recalculate();

				resetSelection(first.key, 0);
				return;
			}

			// Hello {World} 2
			//        ^^^^^ > backspace
			const prev = this.previousText(firstElement.key)!;
			const l = prev.text.length || 0;
			debounceRaf(() => setCaret(prev.id, l));
			this.recalculate();
			return;
		}
	}
}

let queued: number;
function debounceRaf(fn: FrameRequestCallback) {
	if (queued) {
		cancelAnimationFrame(queued);
	}

	queued = requestAnimationFrame(fn);
}
