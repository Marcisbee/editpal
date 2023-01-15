import { Exome } from "exome";
import { useStore } from "exome/react";
import { useLayoutEffect, useRef, useState } from "react";

import type { AnyToken, TokenRoot, BlockToken, TextToken } from "./tokens";
import { setCaret, cloneToken, ranID, stringSplice } from "./utils";

import "./app.css";

// @TODO Handle "tab" key

const style = `
h1.mx-preview-heading,
h2.mx-preview-heading,
h3.mx-preview-heading {
  display: block;
  margin: 0;
  padding: 0 0 15px 0;
}
h1.mx-preview-heading::before {
  display: 'inline';
  content: '#';
  opacity: 0.5;
  margin-right: 0.3em;
}
h2.mx-preview-heading::before {
  display: 'inline';
  content: '##';
  opacity: 0.5;
  margin-right: 0.3em;
}
h3.mx-preview-heading::before {
  display: 'inline';
  content: '###';
  opacity: 0.5;
  margin-right: 0.3em;
}
p.mx-preview-paragraph {
  display: block;
  margin: 0;
  padding: 0 0 15px 0;
}
p.mx-preview-todo {
  display: block;
  position: relative;
  margin: 0;
  padding: 5px 0;
}
img.mx-preview-todo-capture {
  display: inline-block;
  width: 100%;
  height: 100%;
  top: 0;
  left: 0;
  position: absolute;
  opacity: 0.5;
  pointer-events: none;
}
`;

function RenderText({ id, props, text }) {
	const ref = useRef(null);
	const { ...style } = props || {};

	return (
		<span style={style} data-mx-id={id}>
			{text.replace(/ /g, "\u00A0") || <br />}
		</span>
	);
}

function RenderItem({
	item: { id, type, props, text, children },
}: {
	item: AnyToken;
}) {
	if (type === "h") {
		const { size, ...style } = props || {};

		if (size === 3) {
			return (
				<h3 className="mx-preview-heading" style={style} data-mx-id={id}>
					<RenderMap items={children} />
				</h3>
			);
		}

		if (size === 2) {
			return (
				<h2 className="mx-preview-heading" style={style} data-mx-id={id}>
					<RenderMap items={children} />
				</h2>
			);
		}

		return (
			<h1 className="mx-preview-heading" style={style} data-mx-id={id}>
				<RenderMap items={children} />
			</h1>
		);
	}

	if (type === "p") {
		const { ...style } = props || {};

		return (
			<p className="mx-preview-paragraph" style={style} data-mx-id={id}>
				<RenderMap items={children} />
			</p>
		);
	}

	if (type === "todo") {
		const { done, ...style } = props || {};

		return (
			<p
				className="mx-preview-todo"
				style={{
					...style,
					paddingLeft: 26,
					position: "relative",
					// boxShadow: '0 0 0 1px pink',
				}}
				data-mx-id={id}
				onKeyDown={(e) => {
					if (e.key.indexOf("Backspace") === 0) {
						// e.preventDefault();
						return;
					}
				}}
				onMouseDown={(e) => e.stopPropagation()}
			>
				<span
					style={{ userSelect: "none", position: "absolute", marginLeft: -26 }}
					contentEditable={false}
				>
					<input
						type="checkbox"
						readOnly
						checked={done}
						tabIndex={-1}
						onMouseDown={(e) => e.preventDefault()}
						onFocus={(e) => e.preventDefault()}
					/>
				</span>
				<RenderMap items={children} />
				{/* <img
          className="mx-preview-todo-capture"
          src="https://img.strike.lv/avatars/bc7cefc4-2270-4c5c-9cba-7e7b142c8000.png"
          alt="asd"
        /> */}
			</p>
		);
	}

	if (type === "t") {
		return <RenderText id={id} props={props} text={text} />;
	}
}

function RenderMap({ items }) {
	if (!Array.isArray(items)) {
		return null;
	}

	return items.map((item) => <RenderItem item={item} />) as any;
}

const root = [
	{
		id: ranID(),
		type: "h",
		props: {
			size: 2,
		},
		children: [
			{
				id: ranID(),
				type: "t",
				text: "Hello ",
			},
			{
				id: ranID(),
				type: "t",
				props: {
					color: "orangered",
				},
				text: "Jupiter",
			},
			{
				id: ranID(),
				type: "t",
				text: "!",
			},
		],
	},
	{
		id: ranID(),
		type: "h",
		props: {
			size: 3,
		},
		children: [
			{
				id: ranID(),
				type: "t",
				text: "Hello ",
			},
			{
				id: ranID(),
				type: "t",
				props: {
					color: "orangered",
				},
				text: "Jupiter",
			},
			{
				id: ranID(),
				type: "t",
				text: "!",
			},
		],
	},
	{
		id: ranID(),
		type: "todo",
		props: {
			done: false,
		},
		children: [
			{
				id: ranID(),
				type: "t",
				props: {
					color: "orangered",
				},
				text: "asd",
			},
		],
	},
	{
		id: ranID(),
		type: "todo",
		props: {
			done: true,
		},
		children: [
			{
				id: ranID(),
				type: "t",
				props: {},
				text: "fdc",
			},
		],
	},
	{
		id: ranID(),
		type: "p",
		props: {},
		children: [
			{
				id: ranID(),
				type: "t",
				props: {
					color: "orangered",
				},
				text: "Hello ",
			},
			{
				id: ranID(),
				type: "t",
				props: {
					fontWeight: "bold",
				},
				text: "World",
			},
			{
				id: ranID(),
				type: "t",
				props: {
					color: "orangered",
				},
				text: " 2",
			},
		],
	},
];

class Model extends Exome {
	public tokens: TokenRoot;
	public selection = null;

	public idToKey: Record<string, string> = {};
	public _elements: Record<string, AnyToken> = {};
	public _elements_temp: Record<string, AnyToken> = {};

	constructor(tokens: TokenRoot) {
		super();

		this.tokens = JSON.parse(JSON.stringify(tokens));
		this.recalculate();

		console.log(this.tokens, this.idToKey);
	}

	public recalculate() {
		this._elements_temp = {};
		this.idToKey = this.buildKeys(this.tokens);
		this._elements = this._elements_temp;
	}

	private buildKeys(
		tokens: AnyToken | AnyToken[],
		keys: Record<string, string> = {},
		key: string[] = [],
	) {
		if (Array.isArray(tokens)) {
			let i = 0;
			for (const element of tokens) {
				this.buildKeys(element, keys, key.concat(i + ""));
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

			this.buildKeys(tokens.children, keys, key);
		}

		return keys;
	}

	public setSelection(selection: any) {
		this.selection = selection;
	}

	public removeElementByKey(key: string) {
		const parent = this.findParent(key);

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

	public removeElementsBetween(
		firstKey: string,
		lastKey: string,
		lastIncluded = true,
	) {
		const keys = Object.values(this.idToKey);
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

			this.removeElementByKey(key);
		}
	}

	public findElement(key: string) {
		return this._elements[key];
	}

	public findTextElement(key: string) {
		let el = this.findElement(key);
		if (el.type !== "t") {
			el = el.children[0];
		}
		return el;
	}

	public findParent(currentKey: string): BlockToken | null {
		const keyChunks = currentKey.split(".");
		keyChunks.pop();
		const parentKey = keyChunks.join(".");

		if (!parentKey) {
			return null;
		}

		return this.findElement(parentKey) as BlockToken;
	}

	public findAllNextSiblings(
		currentKey: string,
		selfIncluded = false,
	): AnyToken[] {
		const selfKey = currentKey.split(".").pop()!;

		const parent = this.findParent(currentKey);

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

	public findPreviousTextElement(currentKey: string): TextToken | null {
		const keys = Object.values(this.idToKey);
		const index = keys.indexOf(currentKey);

		if (index < 1) {
			return null;
		}

		const lastKey = keys[index - 1];

		const el = this.findElement(lastKey);

		if (el?.type === "t") {
			return el;
		}

		return this.findPreviousTextElement(lastKey);
	}

	public findNextTextElement(currentKey: string): TextToken | null {
		const keys = Object.values(this.idToKey);
		const index = keys.indexOf(currentKey);

		if (index < 1) {
			return null;
		}

		const lastKey = keys[index + 1];

		const el = this.findElement(lastKey);

		if (el?.type === "t") {
			return el;
		}

		return this.findNextTextElement(lastKey);
	}

	public handleInitialRemove(element: AnyToken) {
		const parent =
			element.type === "t" ? this.findParent(element.key)! : element;

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
				const prev = this.findPreviousTextElement(parent.key);
				this.removeElementByKey(parent.key);
				const l = prev!.text.length;
				debounceRaf(() => {
					setCaret(prev!.id, l);
				});
				this.recalculate();
				return;
			}

			const prev = this.findPreviousTextElement(parent.key);
			const prevParent = this.findParent(
				this.findPreviousTextElement(parent.key)!.key,
			)!;
			const siblings = parent.children.map(cloneToken);
			// this.removeElementsBetween(first.id, last.id);

			if (Array.isArray(prevParent.children)) {
				prevParent.children.push(...siblings);
			}

			this.removeElementByKey(parent.key);
			const l = prev!.text.length;
			this.recalculate();

			debounceRaf(() => {
				setCaret(prev!.id, l);
			});

			// console.log("@TODO handle concat blocks");

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

	public handleTextTransforms(element: AnyToken) {
		const parent =
			element.type === "t" ? this.findParent(element.key)! : element;

		// @TODO handle "-|[space]" => "• |"
	}

	public insertTokenAfterParent(token: BlockToken, element: AnyToken) {
		const parent =
			element.type === "t" ? this.findParent(element.key)! : element;

		const clone = cloneToken(token);
		this.tokens.splice(parseInt(parent.key.split(".")[0], 10) + 1, 0, clone);

		return clone;
	}

	public insertTokensAfter(tokens: AnyToken[], element: AnyToken) {
		const parent =
			element.type === "t" ? this.findParent(element.key)! : element;

		// console.log(parent.children.indexOf(element));

		parent.children.splice(
			parent.children.indexOf(element) + 1,
			0,
			...tokens.map(cloneToken),
		);
	}

	public action(type: string, data?: string) {
		const { anchor, anchorOffset, focus, focusOffset } = this.selection;

		const [first, last] = [
			{ key: anchor, offset: anchorOffset },
			{ key: focus, offset: focusOffset },
		].sort((a, b) => {
			if (a.key === b.key) {
				return a.offset > b.offset ? 1 : -1;
			}

			return a.key > b.key ? 1 : -1;
		});

		if (
			type === "remove" &&
			(first.key !== last.key || first.offset !== last.offset)
		) {
			type = "key";
			data = "";
		} else if (type === "remove" && first.offset > 1) {
			type = "key";
			data = "";
			first.offset -= 1;
		} else if (type === "remove") {
			let element = this.findTextElement(first.key);

			const isFirstChild = first.key?.endsWith(".0") ?? true;

			if (first.offset === 1) {
				element.text = stringSplice(
					element.text,
					first.offset - 1,
					first.offset,
					"",
				);

				if (!isFirstChild) {
					const prev = this.findPreviousTextElement(first.key);

					if (prev) {
						const l = prev.text?.length;
						debounceRaf(() => {
							setCaret(prev.id, l);
						});
					}
				} else if (!element.text) {
					const next = this.findNextTextElement(last.key);

					if (
						next &&
						next.id.replace(/\.[\d]+$/, "") ===
							first.key.replace(/\.[\d]+$/, "")
					) {
						debounceRaf(() => {
							setCaret(next.id, 0);
							if (this.selection) {
								this.selection.anchor = next.id;
								this.selection.focus = next.id;
								this.selection.anchorOffset = 0;
								this.selection.focusOffset = 0;
							}
							this.setSelection(this.selection);
						});
					} else {
						// console.log("HEREEE");
						// Heres the issue
						debounceRaf(() => {
							setCaret(this.findElement(last.key).id, 0);
							if (this.selection) {
								this.selection.anchorOffset = this.selection.anchorOffset - 1;
								this.selection.focusOffset = this.selection.focusOffset - 1;
							}
							this.setSelection(this.selection);
						});
						// this.handleInitialRemove(element);
						// return;
					}
				} else {
					debounceRaf(() => {
						setCaret(element.id, first.offset - 1);
						if (this.selection) {
							this.selection.anchorOffset = this.selection.anchorOffset - 1;
							this.selection.focusOffset = this.selection.focusOffset - 1;
						}
						this.setSelection(this.selection);
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

			this.handleInitialRemove(element);

			return;
		}

		// ENTER key
		if (type === "enter") {
			let firstElement = this.findTextElement(first.key);

			const siblings: any[] = this.findAllNextSiblings(last.key, true)
				.filter((e) => e.key >= last.key)
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
			const lastKeyChunks = last.key.split(".");
			this.removeElementsBetween(
				first.key,
				String(parseInt(lastKeyChunks[0], 10) + 1),
				false,
			);
			const clonedToken = this.insertTokenAfterParent(
				newToken as any,
				firstElement,
			);
			this.recalculate();
			debounceRaf(() =>
				setCaret(this.findNextTextElement(clonedToken.key)!.id, 0),
			);
			return;
		}

		// Handle new text being added
		if (type === "key" && data != null) {
			let firstElement = this.findTextElement(first.key);
			let lastElement = this.findTextElement(last.key);

			const lastText = lastElement.text;
			firstElement.text = firstElement.text.slice(0, first.offset) + data;

			if (firstElement !== lastElement) {
				const siblings: any[] = this.findAllNextSiblings(last.key, true)
					.filter((e) => e.key >= last.key)
					.map(cloneToken);
				if (siblings[0]?.text) {
					siblings[0].text = siblings[0].text.slice(last.offset);
				}

				const lastKeyChunks = last.key.split(".");
				this.removeElementsBetween(
					first.key,
					String(parseInt(lastKeyChunks[0], 10) + 1),
					false,
				);
				this.insertTokensAfter(siblings, firstElement);
			} else {
				firstElement.text += lastText.slice(last.offset);
			}

			if (firstElement.text) {
				debounceRaf(() =>
					setCaret(firstElement.id, first.offset + data?.length),
				);
				this.recalculate();
				return;
			}

			// Hello {World} 2
			// ^^^^^^ > backspace
			if (first.key.endsWith(".0")) {
				const parent = this.findParent(first.key)!;

				debounceRaf(() => setCaret(parent.id, 0));
				this.recalculate();
				console.log("@TODO");
				return;
			}

			// Hello {World} 2
			//        ^^^^^ > backspace
			const prev = this.findPreviousTextElement(first.key)!;
			const l = prev.text.length || 0;
			debounceRaf(() => setCaret(prev.id, l));
			this.recalculate();
			return;
		}
	}
}

const model = new Model(root as any);

let queued: number;
function debounceRaf(fn: FrameRequestCallback) {
	if (queued) cancelAnimationFrame(queued);

	queued = requestAnimationFrame(fn);
}

function buildIndent(indent: number) {
	return " ".repeat(indent);
}

/**
 root
  ├ (1) heading  
  | └ (2) text  "Welcome to the playground"
  ├ (3) quote  
  | └ (4) text  "In case you were wondering what the black box at the bottom is – it's the debug view, showing the current state of editor. You can disable it by pressing on the settings control in the bottom-left of your screen and toggling the debug view setting."
  ├ (5) paragraph  
  | ├ (6) text  "The playground is a demo environment built with "
  | ├ (7) text  "@lexical/react" { format: code }
  | ├ (8) text  ". Try typing in "
  | ├ (10) text  "some text" { format: bold }
  | ├ (11) text  " with "
  | ├ (12) text  "different" { format: italic }
  | └ (13) text  " formats."

 selection: range 
  ├ anchor { key: 30, offset: 5, type: text }
  └ focus { key: 38, offset: 4, type: text }
 */
function debug(tokens: AnyToken | AnyToken[], indent = 0): string[] {
	let dent = buildIndent(indent);

	if (Array.isArray(tokens)) {
		if (indent === 0) {
			return ["root", ...tokens.map((t) => debug(t, indent + 1)).flat()];
		}

		return tokens.map((t) => debug(t, indent + 1)).flat();
	}

	dent += `├ (${tokens.key}) `;

	if (tokens.type === "t") {
		return [
			`${dent}text ${JSON.stringify(tokens.text)} ${
				tokens.props ? JSON.stringify(tokens.props) : ""
			}`,
		];
	}

	const output: string[] = [`${dent}`];

	if (tokens.type === "p") {
		output[0] += "paragraph";
	} else if (tokens.type === "h") {
		output[0] += "heading";
	} else {
		output[0] += (tokens as any).type;
	}

	if (tokens.children?.length) {
		output.push(...debug(tokens.children, indent));
	}

	return output;
}

function Editor({ model }: any) {
	const { tokens, action, selection, setSelection } = useStore(model);
	const ref = useRef<HTMLDivElement>(null);
	const [focus, setFocus] = useState(0);
	// const [selection, setSelection] = useState(null);

	useLayoutEffect(() => {
		if (!ref.current) {
			return;
		}

		function onSelectionChange(event) {
			// console.log('🔵 SELECTION', event);
			const selection = document.getSelection();

			if (!selection) {
				return;
			}

			// console.log(selection.focusNode?.parentElement);
			const anchor =
				selection.anchorNode?.parentElement?.getAttribute("data-mx-id");
			const focus =
				selection.focusNode?.parentElement?.getAttribute("data-mx-id");

			if (!anchor || !focus) {
				return;
			}

			setSelection({
				anchor: model.idToKey[anchor],
				anchorOffset: selection.anchorOffset,
				focus: model.idToKey[focus],
				focusOffset: selection.focusOffset,
			});
		}

		function onSelectionStart(event) {
			document.addEventListener("selectionchange", onSelectionChange, false);
		}

		function onBlur(event) {
			document.removeEventListener("selectionchange", onSelectionChange);
			// @TODO handle onblur event  [vscode|chrome] click inside editor > click in vscode > click in browser tab (not in editor) > type
			setFocus((i) => i + 1);
			setSelection(null);
		}

		ref.current.addEventListener("selectstart", onSelectionStart, {
			once: true,
		});
		ref.current.addEventListener("blur", onBlur, { once: true });

		return () => {
			document.removeEventListener("selectstart", onSelectionStart);
			document.removeEventListener("blur", onBlur);
		};
	}, [focus]);

	return (
		<>
			<div
				ref={ref}
				suppressContentEditableWarning
				contentEditable
				// onFocus={(e) => {
				//   console.log(e);
				// }}
				onBeforeInput={(e) => {
					// e.preventDefault();
				}}
				onDrop={(e) => {
					e.stopPropagation();
					e.preventDefault();
				}}
				onDragStart={(e) => {
					e.stopPropagation();
					e.preventDefault();
				}}
				onPaste={(e) => {
					// @TODO transform before paste
					// @TODO strip from html
					e.preventDefault();
					action("paste", "@TODO");
				}}
				onKeyDown={(e) => {
					if (e.key.indexOf("Arrow") === 0) {
						return;
					}

					if (e.metaKey) {
						return;
					}

					// Single letter
					if (e.key.length === 1) {
						e.preventDefault();
						action("key", e.key);
						return;
					}

					if (e.key === "Tab") {
						e.preventDefault();
						action(e.shiftKey ? "shifttab" : "tab");
						return;
					}

					if (e.key === "Backspace") {
						e.preventDefault();
						action("remove");
						return;
					}

					if (e.key === "Enter") {
						e.preventDefault();
						action("enter");
						return;
					}

					if (e.key === "Delete") {
						e.preventDefault();
						action("delete");
						return;
					}

					// Allow copy
					if (e.metaKey && e.key === "c") {
						return;
					}

					e.preventDefault();
				}}
				style={{
					userSelect: "text",
					border: "1px solid orange",
					borderRadius: 6,
					width: 500,
					padding: 10,
				}}
			>
				<RenderMap items={tokens} />
			</div>
			<pre
				style={{
					position: "absolute",
					textAlign: "left",
					fontSize: 12,
					lineHeight: 1.4,
				}}
			>
				{debug(tokens).flat(Number.POSITIVE_INFINITY).join("\n")}
				{`\n\nselection\n`}
				{selection ? (
					<>
						{` ├ anchor ${JSON.stringify({
							key: selection.anchor,
							offset: selection.anchorOffset,
						})}\n`}
						{` └ focus ${JSON.stringify({
							key: selection.focus,
							offset: selection.focusOffset,
						})}\n`}
					</>
				) : (
					" └ null"
				)}
			</pre>
		</>
	);
}

export function App() {
	return (
		<div className="App">
			<style>{style}</style>
			<h1>Text Editor</h1>
			<div>
				<Editor model={model} />
			</div>
		</div>
	);
}
