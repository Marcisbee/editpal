import { useStore } from "exome/preact";
import { h, createContext, RefObject } from "preact";
import { useContext, useLayoutEffect, useRef, useState } from "preact/hooks";

import type { AnyToken, TextToken } from "./tokens";
import { ACTION, Model as EditorModel } from "./model";
import { RenderImage } from "./plugin/image";
import { RenderUrl } from "./plugin/url";
import { FloatingToolbar } from "./floating-toolbar";
import { SlashDropdown } from "./slash-dropdown";

import "./app.css";

export const Model = EditorModel;

function RenderText(item: TextToken & { k: string }) {
	if (item.props?.url) {
		return <RenderUrl {...item} key={item.id} />;
	}

	const { id, props, text, k } = item;

	return (
		<span
			// Handle dead key insertion
			key={`${id}-${text}`}
			style={props}
			data-ep={id}
			// data-debug={k}
			data-t={text ? true : "empty"}
		>
			{text.replace(/ /g, "\u00A0") || <br />}
		</span>
	);
}

function RenderItem(item: AnyToken & { k: string }) {
	const { model } = useContext(EditorContext);

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
				data-ep-d={done}
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
				<label data-ep-todo-check contentEditable={false}>
					<input
						type="checkbox"
						defaultChecked={done}
						tabIndex={-1}
						onMouseDown={preventDefault}
						onChange={(e) => {
							item.props.done = (e.target as HTMLInputElement).checked;
							model.recalculate();
						}}
						onFocus={preventDefault}
					/>
					<span data-ep-todo-checkbox>
						{done && (
							<svg
								xmlns="http://www.w3.org/2000/svg"
								width="20"
								height="14"
								viewBox="0 0 148 128"
								fill="none"
							>
								<path stroke="#fff" stroke-width="34" d="m13 64 37 39 86-90" />
							</svg>
						)}
					</span>
				</label>
			</p>
		);
	}

	if (item.type === "img") {
		return <RenderImage {...item} key={item.id} />;
	}

	if (item.type === "url") {
		return <RenderUrl {...item} key={item.id} />;
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

		// if (first?.dataset?.ep && first?.dataset?.['t'] === 'empty' && first?.dataset?.['t'] === last?.dataset?.['t']) {
		// 	console.log('yep');
		// 	let a = model._idToKey[first?.dataset?.ep];
		// 	let f = model._idToKey[first?.dataset?.ep];

		// 	selection.setSelection(
		// 		/\./.test(a) ? a : `${a}.0`,
		// 		anchorOffset,
		// 		/\./.test(f) ? f : `${f}.0`,
		// 		focusOffset,
		// 	);

		// 	return;
		// }

		// Firefox selects parent element not text when double click on text
		// if (first?.dataset?.ep) {
		// 	const pl = first.childNodes[0].childNodes[0];
		// 	if (pl) {
		// 		first = first.childNodes[0].childNodes[0];
		// 		anchorOffset = 0;
		// 	}
		// }
		// if (last?.dataset?.ep) {
		// 	const p = last.childNodes[last.childNodes.length - 1];
		// 	const pl = p.childNodes[p.childNodes.length - 1];
		// 	if (p?.childNodes && pl) {
		// 		last = pl;
		// 		focusOffset = last.textContent?.length || 0;
		// 	}
		// }

		try {
			let anchor =
				first?.dataset?.["t"] === "empty"
					? first?.dataset.ep
					: first?.parentElement?.dataset.ep || first?.dataset.ep;
			let focus =
				last?.dataset?.["t"] === "empty"
					? last?.dataset.ep
					: last?.parentElement?.dataset.ep || last?.dataset.ep;

			if (!anchor) {
				return;
			}

			if (!focus) {
				focus = anchor;
				focusOffset = anchorOffset;
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
		} catch (e) {}
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
		model.selection.setFocus(true);
		onSelectionStart(event);
	}

	function onBlur(event) {
		model.selection.setFocus(false);
		model.selection.setSelection(
			...model.selection.first,
			...model.selection.first,
		);
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
		e.addEventListener("mousedown", onSelect, true);
		e.addEventListener("blur", onBlur);
		e.addEventListener("drop", onDrop);

		return () => {
			e.removeEventListener("compositionstart", onCompositionStart);
			e.removeEventListener("compositionend", onCompositionEnd);
			e.removeEventListener("focus", onFocus);
			e.removeEventListener("selectstart", onSelectionStart);
			e.removeEventListener("mousedown", onSelect, true);
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
			<FloatingToolbar />
			<SlashDropdown />

			<div
				ref={ref}
				contentEditable
				tabIndex={0}
				onDragStart={preventDefaultAndStop}
				onPaste={(e) => {
					preventDefaultAndStop(e);

					const text = e.clipboardData.getData("text");

					model.history.batch();

					action(ACTION._Key, text);

					model.history.batch();
				}}
				onKeyDown={(e) => {
					if ((e.metaKey || e.ctrlKey) && (e.key === "z" || e.key === "Z")) {
						model.action(e.shiftKey ? ACTION._Redo : ACTION._Undo);
						return;
					}

					// Firefox doesn't trigger selection change event on SELECT ALL
					// if ((e.metaKey || e.ctrlKey) && (e.key === "a" || e.key === "A")) {
					// 	console.log("select all");
					// 	model._stack.push(() => {
					// 		onSelectionChange(e);
					// 	});
					// 	return;
					// }

					// Allow cmd+r etc.
					if (e.metaKey) {
						return;
					}

					if (model.slash.isOpen && model.slash.onKey(e.key)) {
						e.preventDefault();
						return;
					}

					if (e.key.indexOf("Arrow") === 0) {
						model.history.batch();
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
