import { useStore } from "exome/preact";
import { h, Fragment, createContext, RefObject } from "preact";
import { useLayoutEffect, useRef, useState, useContext } from "preact/hooks";

import type { AnyToken, ImgToken, TextToken } from "./tokens";
import { ACTION, Model as EditorModel } from "./model";

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

function RenderImage(item: ImgToken & { k: string }) {
	const { id, src, k } = item;
	const { model } = useContext(EditorContext);
	const {
		first: [first],
		last: [last],
	} = useStore(model.selection);
	const inputRef = useRef<HTMLInputElement>(null);

	useLayoutEffect(() => {
		const handler = (e: any) => preventDefaultAndStop(e);

		inputRef.current?.addEventListener("compositionstart", handler);
		inputRef.current?.addEventListener("compositionend", handler);

		return () => {
			inputRef.current?.removeEventListener("compositionstart", handler);
			inputRef.current?.removeEventListener("compositionend", handler);
		};
	}, []);

	return (
		<span
			data-ep={id}
			data-ep-img
			data-ep-s={
				[
					...model.keysBetween(first, last),
					...model.keysBetween(last, first),
				].indexOf(k) > -1 || undefined
			}
			// If pointerEvents, then this is needed
			// onMouseDown={(e) => {
			// 	document.execCommand("selectAll", false, null);
			// 	model.select(model.findElement(item.k)!, 0);
			// }}
		>
			<br />
			<span contentEditable={false}>
				<img src={src} alt={item.props.alt} />
				<input
					ref={inputRef}
					type="text"
					style={{ userSelect: "auto", pointerEvents: "auto" }}
					onKeyDown={(e) => {
						e.stopPropagation();
					}}
					placeholder="Type caption here..."
					defaultValue={item.props.alt}
					onInput={(e) => {
						item.props.alt = e.target.value;
					}}
				/>
			</span>
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
function preventDefault(e: any) {
	e.preventDefault();
}

// rome-ignore lint/suspicious/noExplicitAny: <explanation>
function preventDefaultAndStop(e: any) {
	preventDefault(e);
	e.stopPropagation();
}

export interface EditpalProps {
	model: EditorModel;
}

function increment(i: number) {
	return i + 1;
}

const EditorContext = createContext<{
	model: EditorModel;
	editor: RefObject<HTMLDivElement>;
}>({} as any);

export function Editpal({ model }: EditpalProps) {
	const { tokens, stack, action, selection } = useStore(model);
	const ref = useRef<HTMLDivElement>(null);
	const [focus, setFocus] = useState(0);
	const [reload, setReload] = useState(0);

	useLayoutEffect(() => {
		stack.splice(0).pop()?.();
	});

	function select(
		first: Node,
		last: Node,
		anchorOffset: number,
		focusOffset: number,
	) {
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

		console.log("SELEEEECT", selection);

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
			stack.push(fn);
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
					if (e.key.indexOf("Arrow") === 0) {
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
						preventDefault(e);
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
