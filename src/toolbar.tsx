import { useStore } from "exome/preact";
import { h } from "preact";
import { useContext } from "preact/hooks";

import { EditorContext, preventDefaultAndStop } from "./editpal.tsx";
import { ACTION } from "./model.ts";

export function Toolbar() {
	const { model } = useContext(EditorContext);
	const { action, selection } = useStore(model);
	const { format } = useStore(selection);

	return (
		<div>
			<button
				type="button"
				aria-label="Bold"
				title="Bold (**)"
				data-e-tb-active={format.fontWeight === "bold" ? true : undefined}
				onMouseDown={preventDefaultAndStop}
				onClick={(e) => {
					preventDefaultAndStop(e);
					const type = format.fontWeight === "bold"
						? ACTION._FormatRemove
						: ACTION._FormatAdd;
					action(type, ["fontWeight", "bold"]);
				}}
			>
				B
			</button>
			<button
				type="button"
				aria-label="Italic"
				title="Italic (_)"
				data-e-tb-active={format.fontStyle === "italic" ? true : undefined}
				onMouseDown={preventDefaultAndStop}
				onClick={(e) => {
					preventDefaultAndStop(e);
					const type = format.fontStyle === "italic"
						? ACTION._FormatRemove
						: ACTION._FormatAdd;
					action(type, ["fontStyle", "italic"]);
				}}
			>
				<i>I</i>
			</button>
			<button
				type="button"
				aria-label="Strikethrough"
				title="Strikethrough (~~)"
				data-e-tb-active={format.textDecoration === "line-through"
					? true
					: undefined}
				onMouseDown={preventDefaultAndStop}
				onClick={(e) => {
					preventDefaultAndStop(e);
					const type = format.textDecoration === "line-through"
						? ACTION._FormatRemove
						: ACTION._FormatAdd;
					action(type, ["textDecoration", "line-through"]);
				}}
			>
				<s>S</s>
			</button>
			<button
				type="button"
				aria-label="Inline code"
				title="Inline code (`)"
				data-e-tb-active={format.code === true ? true : undefined}
				onMouseDown={preventDefaultAndStop}
				onClick={(e) => {
					preventDefaultAndStop(e);
					const type = format.code === true
						? ACTION._FormatRemove
						: ACTION._FormatAdd;
					action(type, ["code", true]);
				}}
			>
				{"</>"}
			</button>
			<button
				type="button"
				aria-label="Highlight"
				title="Highlight (==)"
				data-e-tb-active={format.highlight === true ? true : undefined}
				onMouseDown={preventDefaultAndStop}
				onClick={(e) => {
					preventDefaultAndStop(e);
					const type = format.highlight === true
						? ACTION._FormatRemove
						: ACTION._FormatAdd;
					action(type, ["highlight", true]);
				}}
			>
				<mark>H</mark>
			</button>
		</div>
	);
}
