import { useStore } from "exome/preact";
import { h } from "preact";
import { useContext } from "preact/hooks";

import { EditorContext, preventDefaultAndStop } from "./editpal.tsx";
import { ACTION } from "./model.ts";

export function Toolbar() {
	const { extensions, model } = useContext(EditorContext);
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
			{extensions?.linkEditor && (
				<button
					type="button"
					aria-label="Link"
					title="Add or edit link"
					data-e-tb-active={format.link ? true : undefined}
					onMouseDown={preventDefaultAndStop}
					onClick={async (event) => {
						preventDefaultAndStop(event);
						const first = selection.first;
						const last = selection.last;
						const firstElement = model.findElement(first[0]);
						const lastElement = model.findElement(last[0]);
						const result = await extensions.linkEditor?.edit({
							current: typeof format.link === "string"
								? format.link
								: undefined,
							model,
							selectedText: model.selectedText(),
						});
						if (result === undefined) {
							return;
						}
						const firstKey = firstElement
							? model._idToKey[firstElement.id]
							: undefined;
						const lastKey = lastElement
							? model._idToKey[lastElement.id]
							: undefined;
						if (!firstKey || !lastKey) {
							return;
						}
						const link = result === "" ? null : result;
						selection.setSelection(
							firstKey,
							first[1],
							lastKey,
							last[1],
						);
						action(
							link === null ? ACTION._FormatRemove : ACTION._FormatAdd,
							["link", link],
						);
					}}
				>
					↗
				</button>
			)}
		</div>
	);
}
