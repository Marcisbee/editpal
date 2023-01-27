import { useStore } from "exome/preact";
import { h } from "preact";
import { useContext, useLayoutEffect, useRef } from "preact/hooks";

import { EditorContext, preventDefaultAndStop } from "../editpal";
import type { ImgToken } from "../tokens";

export function RenderImage(item: ImgToken & { k: string }) {
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
