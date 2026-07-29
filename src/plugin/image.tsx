import { useStore } from "exome/preact";
import { h } from "preact";
import { useContext } from "preact/hooks";

import { EditorContext } from "../editpal.tsx";
import type { ImgToken } from "../tokens.ts";

export function RenderImage(item: ImgToken & { k: string }) {
	const { id, src, k } = item;
	const { activeId, editable, model } = useContext(EditorContext);
	const {
		first: [first],
		last: [last],
	} = useStore(model.selection);

	return (
		<span
			data-ep={id}
			data-ep-img
			data-ep-selectable="image"
			draggable={editable}
			data-ep-s={activeId === id || [
						...model.keysBetween(first, last),
						...model.keysBetween(last, first),
					].indexOf(k) > -1 ||
				undefined}
		>
			<br />
			<span contentEditable={false}>
				<img src={src} alt={item.props.alt} draggable={editable} />
			</span>
		</span>
	);
}
