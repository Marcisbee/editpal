import { useStore } from "exome/preact";
import { h } from "preact";
import { useContext } from "preact/hooks";

import { EditorContext, preventDefaultAndStop } from "./editpal";
import { ACTION } from "./model";

export function Toolbar() {
	const { model } = useContext(EditorContext);
	const { action, selection } = useStore(model);
	const { format } = useStore(selection);

	return (
		<div>
			<button
				type="button"
				data-e-tb-active={format.fontWeight === "bold" ? true : undefined}
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
				data-e-tb-active={format.fontStyle === "italic" ? true : undefined}
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
				data-e-tb-active={
					format.textDecoration === "underline" ? true : undefined
				}
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
				data-e-tb-active={format.color === "orangered" ? true : undefined}
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
					<path d="m9.06 11.9 8.07-8.06a2.85 2.85 0 1 1 4.03 4.03l-8.06 8.08" />
					<path d="M7.07 14.94c-1.66 0-3 1.35-3 3.02 0 1.33-2.5 1.52-2 2.02 1.08 1.1 2.49 2.02 4 2.02 2.2 0 4-1.8 4-4.04a3.01 3.01 0 0 0-3-3.02z" />
				</svg>
			</button>
		</div>
	);
}
