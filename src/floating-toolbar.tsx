import { h } from "preact";
import { useStore } from "exome/preact";
import { useContext, useMemo } from "preact/hooks";

import { EditorContext, preventDefaultAndStop } from "./editpal";
import { Toolbar } from "./toolbar";

export function FloatingToolbar() {
	const { model } = useContext(EditorContext);
	const { first, last, offsetX, offsetY } = useStore(model.selection);

	const rect = useMemo(() => {
		const sel = window.getSelection();

		if (!sel) {
			return null;
		}

		try {
			const range = sel.getRangeAt(0).cloneRange();
			return range.getBoundingClientRect();
		} catch (e) {
			return null;
		}
		// console.log(rect.top, rect.left);
	}, [first.join(":"), last.join(":")]);

	if (first[0] === last[0] && first[1] === last[1]) {
		return null;
	}

	if (!rect) {
		return null;
	}

	return (
		<div
			className="e-fl-toolbar"
			onMouseDown={preventDefaultAndStop}
			style={{
				left: rect.left + rect.width / 2 - offsetX,
				top: rect.top - offsetY,
			}}
		>
			<Toolbar />
		</div>
	);
}
