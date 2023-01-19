import { useStore } from "exome/react";
import { type ReactElement, useLayoutEffect, useRef, useState } from "react";

import type { AnyToken, TextToken } from "./tokens";
import { ACTION, Model as EditorModel } from "./model";

import "./app.css";

export const Model = EditorModel;

function RenderText({ id, props, text }: Omit<TextToken, "type" | "key">) {
	return (
		<span key={id} style={props} data-ep={id}>
			{text.replace(/ /g, "\u00A0") || <br />}
		</span>
	);
}

function RenderItem(item: AnyToken) {
	if (item.type === "h") {
		const { size, ...style } = item.props || {};

		return (
			<strong style={style} data-ep-h={size} data-ep={item.id}>
				<RenderMap key={item.id} items={item.children} />
			</strong>
		);
	}

	if (item.type === "p") {
		const { indent, ...style } = item.props || {};

		return (
			<p style={style} data-ep={item.id} data-ep-i={indent}>
				<RenderMap key={item.id} items={item.children} />
			</p>
		);
	}

	if (item.type === "l") {
		const { indent, type, ...style } = item.props || {};

		return (
			<p
				style={style}
				data-ep={item.id}
				data-ep-l={type || "ul"}
				data-ep-i={indent}
			>
				<RenderMap key={item.id} items={item.children} />
			</p>
		);
	}

	if (item.type === "todo") {
		const { indent, done, ...style } = item.props || {};

		return (
			<p
				style={style}
				data-ep={item.id}
				data-ep-todo
				data-ep-i={indent}
				// @TODO figure out if this is needed
				onKeyDown={(e) => {
					if (e.key.indexOf("Backspace") === 0) {
						// e.preventDefault();
						return;
					}
				}}
				onMouseDown={(e) => e.stopPropagation()}
			>
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
				<RenderMap key={item.id} items={item.children} />
				{/* <img
          className="mx-preview-todo-capture"
          src="https://img.strike.lv/avatars/bc7cefc4-2270-4c5c-9cba-7e7b142c8000.png"
          alt="asd"
        /> */}
			</p>
		);
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
		<RenderItem {...item} key={item.id} />
	)) as unknown as ReactElement;
}

function preventDefault(e: any) {
	e.preventDefault();
}

function preventDefaultAndStop(e: any) {
	preventDefault(e);
	e.stopPropagation();
}

export interface EditpalProps {
	model: EditorModel;
}

export function Editpal({ model }: EditpalProps) {
	const { tokens, stack, action, setSelection } = useStore(model);
	const ref = useRef<HTMLDivElement>(null);
	const [focus, setFocus] = useState(0);
	// const [selection, setSelection] = useState(null);

	useLayoutEffect(() => {
		console.log('every time', stack);
		stack.splice(0).pop()?.();
		// stack.splice(0).forEach((p) => p());
	});

	useLayoutEffect(() => {
		if (!ref.current) {
			return;
		}

		function onSelectionChange(event) {
			console.log('🔵 SELECTION', event);
			const selection = document.getSelection();

			if (!selection) {
				return;
			}

			// console.log(selection.focusNode?.parentElement);
			const anchor =
				selection.anchorNode?.parentElement?.getAttribute("data-ep");
			const focus = selection.focusNode?.parentElement?.getAttribute("data-ep");

			if (!anchor || !focus) {
				return;
			}

			setSelection({
				anchor: model._idToKey[anchor],
				anchorOffset: selection.anchorOffset,
				focus: model._idToKey[focus],
				focusOffset: selection.focusOffset,
			});
		}

		function onSelectionStart(event) {
			document.addEventListener("selectionchange", onSelectionChange, false);
		}

		function onBlur(event) {
			document.removeEventListener("selectionchange", onSelectionChange);
			setFocus((i) => i + 1);
		}

		const add = ref.current.addEventListener;
		const remove = ref.current.removeEventListener;

		add("focus", onSelectionStart, { once: true });
		add("selectstart", onSelectionStart, { once: true });
		add("blur", onBlur, { once: true });

		return () => {
			remove("focus", onSelectionStart);
			remove("selectstart", onSelectionStart);
			remove("blur", onBlur);
		};
	}, [focus]);

	return (
		<div
			ref={ref}
			suppressContentEditableWarning
			contentEditable
			// onFocus={(e) => {
			//   console.log(e);
			// }}
			// onBeforeInput={(e) => {
			// 	// e.preventDefault();
			// }}
			onDrop={preventDefaultAndStop}
			onDragStart={preventDefaultAndStop}
			onPaste={(e) => {
				// @TODO transform before paste
				// @TODO strip from html
				preventDefault(e);
				action(ACTION._Paste, "@TODO");
			}}
			onKeyDown={(e) => {
				if (e.key.indexOf("Arrow") === 0) {
					return;
				}

				if (e.metaKey) {
					return;
				}

				// @TODO handle 'a => ā
				if (e.key === "Dead") {
					preventDefaultAndStop(e);
					return false;
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

				console.log('key', e.key);

				preventDefault(e);
			}}
			data-ep-main
		>
			<RenderMap items={tokens} />
		</div>
	);
}
