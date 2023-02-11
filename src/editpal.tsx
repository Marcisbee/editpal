import { useStore } from "exome/preact";
import { h, createContext, RefObject } from "preact";
import { useContext, useLayoutEffect, useRef, useState } from "preact/hooks";

import type { AnyToken, TextToken } from "./tokens";
import { ACTION, Model as EditorModel } from "./model";
import { RenderImage } from "./plugin/image";

import "./app.css";

export const Model = EditorModel;

function RenderText({ id, props, text, k }: TextToken & { k: string }) {
	return (
		<span
			// Handle dead key insertion
			key={`${id}-${text}`}
			style={props}
			data-ep={id}
			// data-debug={k}
		>
			{text.replace(/ /g, "\u00A0") || <br />}
		</span>
	);
}

function RenderItem(item: AnyToken & { k: string }) {
	if (item.type === "h") {
		const { size, ...style } = item.props || {};

		return (
			<strong key={item.id} style={style} data-ep-h={size} data-ep={item.id}>
				<RenderMap items={item.children} />
			</strong>
		);
	}

	if (item.type === "p") {
		const { indent, ...style } = item.props || {};

		return (
			<p key={item.id} style={style} data-ep={item.id} data-ep-i={indent}>
				<RenderMap items={item.children} />
			</p>
		);
	}

	if (item.type === "l") {
		const { indent, type, ...style } = item.props || {};

		return (
			<li
				key={item.id}
				style={style}
				data-ep={item.id}
				data-ep-l={type || "ul"}
				data-ep-i={indent}
			>
				<RenderMap items={item.children} />
			</li>
		);
	}

	if (item.type === "todo") {
		const { indent, done, ...style } = item.props || {};

		return (
			<p
				key={item.id}
				style={style}
				data-ep={item.id}
				data-ep-todo
				data-ep-i={indent}
				// @TODO figure out if this is needed
				// onKeyDown={(e) => {
				// 	if (e.key.indexOf("Backspace") === 0) {
				// 		// e.preventDefault();
				// 		return;
				// 	}
				// }}
				onMouseDown={(e) => e.stopPropagation()}
			>
				<RenderMap items={item.children} />
				<span data-ep-todo-check contentEditable={false}>
					<input
						type="checkbox"
						readOnly
						checked={done}
						tabIndex={-1}
						onMouseDown={preventDefault}
						onFocus={preventDefault}
					/>
				</span>
			</p>
		);
	}

	if (item.type === "img") {
		return <RenderImage {...item} key={item.id} />;
	}

	if (item.type === "t") {
		return <RenderText {...item} key={item.id} />;
	}

	return null;
}

interface RenderMapProps {
	items: AnyToken[];
}

function RenderMap({ items }: RenderMapProps) {
	if (!Array.isArray(items)) {
		return null;
	}

	return items.map((item) => (
		<RenderItem {...item} k={item.key} key={item.id} />
	)) as unknown as JSX.Element;
}

// rome-ignore lint/suspicious/noExplicitAny: <explanation>
export function preventDefault(e: any) {
	e.preventDefault();
}

// rome-ignore lint/suspicious/noExplicitAny: <explanation>
export function preventDefaultAndStop(e: any) {
	preventDefault(e);
	e.stopPropagation();
}

export interface EditpalProps {
	model: EditorModel;
}

function increment(i: number) {
	return i + 1;
}

export const EditorContext = createContext<{
	model: EditorModel;
	editor: RefObject<HTMLDivElement>;
}>({} as any);

function Toolbar() {
	const { model } = useContext(EditorContext);
	const { action, selection } = useStore(model);
	const { format } = useStore(selection);

	return (
		<div
			style={{
				marginBottom: 10,
			}}
		>
			<button
				type="button"
				style={{
					padding: "10px 14px",
					border: 0,
					borderRadius: 5,
					fontWeight: "bold",
					backgroundColor: format.fontWeight === "bold" ? "#555555" : "#353535",
					color: format.fontWeight === "bold" ? "#fff" : "#ccc",
					marginRight: 5,
					width: 40,
				}}
				onMouseDown={preventDefaultAndStop}
				onClick={(e) => {
					preventDefaultAndStop(e);
					const type =
						format.fontWeight === "bold"
							? ACTION._FormatRemove
							: ACTION._FormatAdd;
					action(type, ["fontWeight", "bold"]);
				}}
			>
				B
			</button>
			<button
				type="button"
				style={{
					padding: "10px 14px",
					border: 0,
					borderRadius: 5,
					fontWeight: "bold",
					backgroundColor:
						format.fontStyle === "italic" ? "#555555" : "#353535",
					color: format.fontStyle === "italic" ? "#fff" : "#ccc",
					marginRight: 5,
					width: 40,
				}}
				onMouseDown={preventDefaultAndStop}
				onClick={(e) => {
					preventDefaultAndStop(e);
					const type =
						format.fontStyle === "italic"
							? ACTION._FormatRemove
							: ACTION._FormatAdd;
					action(type, ["fontStyle", "italic"]);
				}}
			>
				<i>I</i>
			</button>
			<button
				type="button"
				style={{
					padding: "10px 14px",
					border: 0,
					borderRadius: 5,
					fontWeight: "bold",
					backgroundColor:
						format.textDecoration === "underline" ? "#555555" : "#353535",
					color: format.textDecoration === "underline" ? "#fff" : "#ccc",
					marginRight: 5,
					width: 40,
				}}
				onMouseDown={preventDefaultAndStop}
				onClick={(e) => {
					preventDefaultAndStop(e);
					const type =
						format.textDecoration === "underline"
							? ACTION._FormatRemove
							: ACTION._FormatAdd;
					action(type, ["textDecoration", "underline"]);
				}}
			>
				<u>U</u>
			</button>
			<button
				type="button"
				style={{
					padding: "10px 14px",
					border: 0,
					borderRadius: 5,
					fontWeight: "bold",
					backgroundColor: format.color === "orangered" ? "#555555" : "#353535",
					color: format.color === "orangered" ? "#fff" : "#ccc",
					marginRight: 5,
					width: 40,
				}}
				onMouseDown={preventDefaultAndStop}
				onClick={(e) => {
					preventDefaultAndStop(e);
					const type =
						format.color === "orangered"
							? ACTION._FormatRemove
							: ACTION._FormatAdd;
					action(type, ["color", "orangered"]);
				}}
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					style={{ width: "1em", height: "1em" }}
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="3"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<path d="m9.06 11.9 8.07-8.06a2.85 2.85 0 1 1 4.03 4.03l-8.06 8.08"></path>
					<path d="M7.07 14.94c-1.66 0-3 1.35-3 3.02 0 1.33-2.5 1.52-2 2.02 1.08 1.1 2.49 2.02 4 2.02 2.2 0 4-1.8 4-4.04a3.01 3.01 0 0 0-3-3.02z"></path>
				</svg>
			</button>
			<br />
			<button
				onMouseDown={preventDefaultAndStop}
				onClick={(e) => {
					action(ACTION._Undo);
				}}
				type="button"
			>
				undo
			</button>
			<button
				onMouseDown={preventDefaultAndStop}
				onClick={(e) => {
					action(ACTION._Redo);
				}}
				type="button"
			>
				redo
			</button>
		</div>
	);
}

export function Editpal({ model }: EditpalProps) {
	const { tokens, _stack, action, selection } = useStore(model);
	const ref = useRef<HTMLDivElement>(null);
	const [focus, setFocus] = useState(0);
	const [reload, setReload] = useState(0);

	useLayoutEffect(() => {
		_stack.splice(0).pop()?.();
	});

	function select(
		first: Node,
		last: Node,
		anchorOffset: number,
		focusOffset: number,
	) {
		if (model._isComposing) {
			return;
		}

		const anchor =
			first?.parentElement?.getAttribute("data-ep") ||
			first?.getAttribute?.("data-ep");
		const focus =
			last?.parentElement?.getAttribute("data-ep") ||
			last?.getAttribute?.("data-ep");

		if (!anchor || !focus) {
			return;
		}

		let a = model._idToKey[anchor];
		let f = model._idToKey[focus];

		selection.setSelection(
			/\./.test(a) ? a : `${a}.0`,
			anchorOffset,
			/\./.test(f) ? f : `${f}.0`,
			focusOffset,
		);

		const anchorProps = model.findElement(a).props as Record<string, any>;
		const focusProps = model.findElement(f).props as Record<string, any>;

		// Set formatting for current selection
		selection.setFormat(
			Object.entries(anchorProps || {}).reduce<Record<string, any>>(
				(acc, [key, value]) => {
					if (focusProps?.[key] === value) {
						acc[key] = value;
					}

					return acc;
				},
				{},
			),
		);
	}

	function onSelect(event: MouseEvent) {
		// ref.current?.focus();

		let range: Range | null;
		if (document.caretRangeFromPoint) {
			// edge, chrome, android
			range = document.caretRangeFromPoint(event.clientX, event.clientY);
		} else {
			// firefox
			const pos = [event.rangeParent, event.rangeOffset] as const;
			range = document.createRange();
			range.setStart(...pos);
			range.setEnd(...pos);
		}

		if (!range) {
			return;
		}

		model.history.batch();

		select(
			range.startContainer,
			range.endContainer,
			range.startOffset,
			range.endOffset,
		);
	}

	// Arrow keys doesn't update selection in FireFox
	function onSelectionStart(event) {
		document.addEventListener("selectionchange", onSelectionChange);
	}

	function onSelectionChange(event) {
		const selection = document.getSelection();

		// console.log("SELEEEECT", selection);

		if (!selection) {
			return;
		}

		select(
			selection.anchorNode!,
			selection.focusNode!,
			selection.anchorOffset,
			selection.focusOffset,
		);
	}

	function onFocus(event) {
		onSelectionStart(event);
	}

	function onBlur(event) {
		document.removeEventListener("selectionchange", onSelectionChange);
		setFocus(increment);
	}

	function onDrop(event: DragEvent) {
		preventDefaultAndStop(event);

		onSelect(event);

		for (const item of event.dataTransfer!.items) {
			if (item.kind === "string" && item.type.match(/^text\/plain/)) {
				// This item is the target node
				item.getAsString((s) => {
					model.action(ACTION._Key, s);
				});
			}
		}
	}

	function onCompositionStart() {
		model._isComposing = true;
	}

	function onCompositionEnd(e: CompositionEvent) {
		const fn = () => {
			model._isComposing = false;
			action(ACTION._Compose, e.data);
			onSelectionChange(e);
			setReload(increment);
		};

		// (Chrome) isTrusted === false
		// (Firefox) isTrusted === true
		// (Safari) isTrusted === true
		if (e.isTrusted) {
			_stack.push(fn);
		} else {
			fn();
		}

		setFocus(increment);
	}

	useLayoutEffect(() => {
		if (!ref.current) {
			return;
		}

		const e = ref.current;

		e.addEventListener("compositionstart", onCompositionStart);
		e.addEventListener("compositionend", onCompositionEnd);
		e.addEventListener("focus", onFocus);
		e.addEventListener("selectstart", onSelectionStart, { once: true });
		e.addEventListener("mousedown", onSelect);
		e.addEventListener("blur", onBlur);
		e.addEventListener("drop", onDrop);

		return () => {
			e.removeEventListener("compositionstart", onCompositionStart);
			e.removeEventListener("compositionend", onCompositionEnd);
			e.removeEventListener("focus", onFocus);
			e.removeEventListener("selectstart", onSelectionStart);
			e.removeEventListener("mousedown", onSelect);
			e.removeEventListener("blur", onBlur);
			e.removeEventListener("drop", onDrop);
		};
	}, [focus]);

	return (
		<EditorContext.Provider
			value={{
				model,
				editor: ref,
			}}
		>
			<Toolbar />

			<div
				ref={ref}
				contentEditable
				tabIndex={0}
				onDragStart={preventDefaultAndStop}
				onPaste={(e) => {
					preventDefaultAndStop(e);

					const text = e.clipboardData.getData("text");

					action(ACTION._Key, text);
				}}
				onKeyDown={(e) => {
					if ((e.metaKey || e.ctrlKey) && (e.key === "z" || e.key === "Z")) {
						model.action(e.shiftKey ? ACTION._Redo : ACTION._Undo);
						return;
					}

					// Allow cmd+r etc.
					if (e.metaKey) {
						return;
					}

					if (e.key.indexOf("Arrow") === 0) {
						model.history.batch();
						return;
					}

					if (e.metaKey) {
						return;
					}

					// Handle dead key https://en.wikipedia.org/wiki/Dead_key
					if (e.key === "Dead") {
						preventDefault(e);
						model._isComposing = true;
						action(ACTION._Key, "");
						return;
					}

					// Don't do anything when composing
					if (model._isComposing) {
						preventDefaultAndStop(e);
						return;
					}

					// Single letter
					if (e.key.length === 1) {
						preventDefaultAndStop(e);
						action(ACTION._Key, e.key);
						return;
					}

					if (e.key === "Tab") {
						preventDefault(e);
						action(e.shiftKey ? ACTION._ShiftTab : ACTION._Tab);
						return;
					}

					if (e.key === "Backspace") {
						preventDefault(e);
						action(ACTION._Remove);
						return;
					}

					if (e.key === "Enter") {
						preventDefault(e);
						action(ACTION._Enter);
						return;
					}

					if (e.key === "Delete") {
						preventDefault(e);
						action(ACTION._Delete);
						return;
					}

					// Allow copy
					if (e.metaKey && e.key === "c") {
						return;
					}

					// console.log("key", e.key);

					preventDefault(e);
				}}
				data-ep-main
			>
				<RenderMap key={`root-${reload}`} items={tokens} />
			</div>
		</EditorContext.Provider>
	);
}
