import { h } from "preact";
import { createPortal } from "preact/compat";
import { useStore } from "exome/preact";
import { useContext, useMemo } from "preact/hooks";

import { EditorContext, preventDefaultAndStop } from "./editpal";
import { Toolbar } from "./toolbar";

export function FloatingToolbar() {
	const { model } = useContext(EditorContext);
	const { focus, first, last, getOffset, getPortal } = useStore(model.selection);
	const { x, y } = getOffset();

	const portalElement = useMemo(getPortal, [getPortal]);

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

	if (!focus) {
		return null;
	}

	const output = (
		<div
			className="e-fl-toolbar"
			onMouseDown={preventDefaultAndStop}
			style={{
				left: rect.left + rect.width / 2 - x,
				top: rect.top - y,
			}}
		>
			<Toolbar />
		</div>
	);

	if (portalElement) {
		return createPortal(output, portalElement);
	}

	return output;
}
