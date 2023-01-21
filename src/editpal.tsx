import { useStore } from "exome/react";
import {
	type ReactElement,
	useLayoutEffect,
	useRef,
	useState,
	createContext,
	RefObject,
	useContext,
} from "react";

import type { AnyToken, TextToken } from "./tokens";
import { ACTION, Model as EditorModel } from "./model";

import "./app.css";

export const Model = EditorModel;

function RenderText({ id, props, text }: Omit<TextToken, "type" | "key">) {
	return (
		<span
			// Handle dead key insertion
			key={`${id}-${text}`}
			style={props}
			data-ep={id}
		>
			{text.replace(/ /g, "\u00A0") || <br />}
		</span>
	);
}

function RenderItem(item: AnyToken & { k: string }) {
	const { editor, model } = useContext(EditorContext);

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

	if (item.type === "img") {
		const a = model.selection?.anchor;
		const f = model.selection?.focus;
		return (
			<span
				key={item.id}
				data-ep={item.id}
				data-ep-img
				data-ep-s={
					(a &&
						f &&
						[...model.keysBetween(a, f), ...model.keysBetween(f, a)].indexOf(
							item.k,
						) > -1) ||
					undefined
				}
				// If pointerEvents, then this is needed
				// onMouseDown={(e) => {
				// 	document.execCommand("selectAll", false, null);
				// 	model.select(model.findElement(item.k)!, 0);
				// }}
			>
				<br />
				<span contentEditable={false}>
					<img src={item.src} alt={"@TODO"} />
				</span>
			</span>
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
		<RenderItem {...item} k={item.key} key={item.id} />
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

const EditorContext = createContext<{
	model: EditorModel;
	editor: RefObject<HTMLDivElement>;
}>({} as any);

export function Editpal({ model }: EditpalProps) {
	const { tokens, stack, action, setSelection } = useStore(model);
	const ref = useRef<HTMLDivElement>(null);
	const [focus, setFocus] = useState(0);
	// const [selection, setSelection] = useState(null);

	useLayoutEffect(() => {
		stack.splice(0).pop()?.();
	});

	useLayoutEffect(() => {
		if (!ref.current) {
			return;
		}

		// const observer = new MutationObserver((mutations) => {
		// 	mutations.forEach(({ type, target, ...rest }) => {
		// 		if (type === 'characterData') {
		// 			const key = target.parentElement?.getAttribute("data-ep");
		// 			const content = target.textContent;
		// 			console.log("🍏 CHARACTER", { key, content }, rest);
		// 			return;
		// 		}

		// 		console.log('🍎 MUTATION', type, target);
		// 		// const targetDOM = mutation.target;
		// 		// if (mutation.type === 'childList') {
		// 		//   const listValues = Array.from(targetNode.children)
		// 		//       .map(node => node.innerHTML)
		// 		//       .filter(html => html !== '<br>');
		// 		//   console.log(listValues);
		// 		// }
		// 	});
		// });

		// observer.observe(ref.current, {
		// 	characterData: true,
		// 	childList: true,
		// 	subtree: true,
		// });

		function onSelectionChange(event) {
			const selection = document.getSelection();

			if (!selection) {
				return;
			}

			const anchor =
				selection.anchorNode?.parentElement?.getAttribute("data-ep") ||
				selection.anchorNode?.getAttribute?.("data-ep");
			const focus =
				selection.focusNode?.parentElement?.getAttribute("data-ep") ||
				selection.focusNode?.getAttribute?.("data-ep");

			if (!anchor || !focus) {
				return;
			}

			// console.log("🔵 SELECTION", selection.type, selection);

			let a = model._idToKey[anchor];
			let f = model._idToKey[focus];

			setSelection({
				anchor: /\./.test(a) ? a : `${a}.0`,
				anchorOffset: selection.anchorOffset,
				focus: /\./.test(f) ? f : `${f}.0`,
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
		<EditorContext.Provider
			value={{
				model,
				editor: ref,
			}}
		>
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
				// onKeyUp={(e) => {
				// 	preventDefaultAndStop(e);
				// 	console.log(e);

				// 	if (e.key === "Dead") {
				// 		console.log(e);
				// 		preventDefault(e);
				// 		// ref.current.contentEditable = "true";
				// 		// ref.current?.focus();
				// 		// action(ACTION._Key, String.fromCharCode(e.code));
				// 		return false;
				// 	}
				// }}
				// onInput={(e) => {
				// 		preventDefaultAndStop(e);
				// }}
				onCompositionEnd={(e) => {
					// Handle ('a => ā) & ('b => 'b)
					action(ACTION._Compose, e.data);
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
						action(ACTION._Key, "");
						return;
					}

					// Don't do anything when composing
					if (e.nativeEvent.isComposing) {
						console.log("key", e.key);
						preventDefault(e);
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

					console.log("key", e.key);

					preventDefault(e);
				}}
				data-ep-main
			>
				<RenderMap items={tokens} />
			</div>
		</EditorContext.Provider>
	);
}
