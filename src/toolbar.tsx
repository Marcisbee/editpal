import { useStore } from "exome/preact";
import { h } from "preact";
import { useContext, useState } from "preact/hooks";

import { EditorContext, preventDefaultAndStop } from "./editpal.tsx";
import { ACTION } from "./model.ts";

export function Toolbar({ hideLink = false }: { hideLink?: boolean }) {
	const { extensions, model } = useContext(EditorContext);
	const { selection } = useStore(model);
	const { format } = useStore(selection);
	const [editingLink, setEditingLink] = useState(false);
	const [linkUrl, setLinkUrl] = useState("");

	function toggle(key: string, value: any) {
		model.smartFormat(
			format[key] === value ? ACTION._FormatRemove : ACTION._FormatAdd,
			[key, value],
		);
	}

	async function openLinkEditor() {
		if (!extensions?.linkEditor) {
			setEditingLink(true);
			return;
		}
		if (!model.prepareSmartSelection()) {
			return;
		}
		const first = [...selection.first] as [string, number];
		const last = [...selection.last] as [string, number];
		const firstElement = model.findElement(first[0]);
		const lastElement = model.findElement(last[0]);
		const result = await extensions.linkEditor.edit({
			current: typeof format.link === "string" ? format.link : undefined,
			model,
			selectedText: model.selectedText(),
		});
		if (result === undefined) {
			return;
		}
		const firstKey = firstElement ? model._idToKey[firstElement.id] : undefined;
		const lastKey = lastElement ? model._idToKey[lastElement.id] : undefined;
		if (!firstKey || !lastKey) {
			return;
		}
		selection.setSelection(firstKey, first[1], lastKey, last[1]);
		model.action(
			result === "" || result === null
				? ACTION._FormatRemove
				: ACTION._FormatAdd,
			["link", result || null],
		);
	}

	function applyLink() {
		const url = linkUrl.trim();
		if (!url) {
			return;
		}
		if (model.smartFormat(ACTION._FormatAdd, ["link", url])) {
			setEditingLink(false);
			setLinkUrl("");
		}
	}

	return (
		<div className="e-toolbar">
			<div className="e-toolbar-buttons">
				<button
					type="button"
					aria-label="Bold"
					title="Bold (**)"
					data-e-tb-active={format.fontWeight === "bold" || undefined}
					onMouseDown={preventDefaultAndStop}
					onClick={(event) => {
						preventDefaultAndStop(event);
						toggle("fontWeight", "bold");
					}}
				>
					B
				</button>
				<button
					type="button"
					aria-label="Italic"
					title="Italic (_)"
					data-e-tb-active={format.fontStyle === "italic" || undefined}
					onMouseDown={preventDefaultAndStop}
					onClick={(event) => {
						preventDefaultAndStop(event);
						toggle("fontStyle", "italic");
					}}
				>
					<i>I</i>
				</button>
				<button
					type="button"
					aria-label="Strikethrough"
					title="Strikethrough (~~)"
					data-e-tb-active={format.textDecoration === "line-through" ||
						undefined}
					onMouseDown={preventDefaultAndStop}
					onClick={(event) => {
						preventDefaultAndStop(event);
						toggle("textDecoration", "line-through");
					}}
				>
					<s>S</s>
				</button>
				<button
					type="button"
					aria-label="Inline code"
					title="Inline code (`)"
					data-e-tb-active={format.code === true || undefined}
					onMouseDown={preventDefaultAndStop}
					onClick={(event) => {
						preventDefaultAndStop(event);
						toggle("code", true);
					}}
				>
					{"</>"}
				</button>
				<button
					type="button"
					aria-label="Highlight"
					title="Highlight (==)"
					data-e-tb-active={format.highlight === true || undefined}
					onMouseDown={preventDefaultAndStop}
					onClick={(event) => {
						preventDefaultAndStop(event);
						toggle("highlight", true);
					}}
				>
					<mark>H</mark>
				</button>
				{!hideLink && (
					<button
						type="button"
						aria-label="Link"
						title="Add link"
						data-e-tb-active={Boolean(format.link) || undefined}
						onMouseDown={preventDefaultAndStop}
						onClick={(event) => {
							preventDefaultAndStop(event);
							void openLinkEditor();
						}}
					>
						↗
					</button>
				)}
			</div>
			{editingLink && (
				<div className="e-fl-toolbar-row e-toolbar-link-editor">
					<input
						autoFocus
						aria-label="New link URL"
						placeholder="https://…"
						type="url"
						value={linkUrl}
						onInput={(event) => setLinkUrl(event.currentTarget.value)}
						onKeyDown={(event) => {
							event.stopPropagation();
							if (event.key === "Enter") {
								event.preventDefault();
								applyLink();
							}
							if (event.key === "Escape") {
								setEditingLink(false);
							}
						}}
					/>
					<button
						type="button"
						aria-label="Apply new link"
						onMouseDown={preventDefaultAndStop}
						onClick={(event) => {
							preventDefaultAndStop(event);
							applyLink();
						}}
					>
						✓
					</button>
				</div>
			)}
		</div>
	);
}
