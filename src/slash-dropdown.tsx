import { h } from "preact";
import { useStore } from "exome/preact";
import { onAction } from "exome";
import { createPortal } from "preact/compat";
import { useContext, useLayoutEffect, useMemo } from "preact/hooks";

import { EditorContext, preventDefaultAndStop } from "./editpal";
import { Slash } from "./slash";
import type { BlockToken, TextToken } from "./tokens";

const slashOptions = [
	{
		label: "title",
		action(parent: BlockToken, child: TextToken, query: string) {
			parent.type = "h" as any;
			child.text = child.text
				.replace(` /${query}`, "")
				.replace(`/${query}`, "");
			parent.props = {
				size: 1,
				...parent.props,
			};
		},
	},
	{
		label: "todo",
		action(parent: BlockToken, child: TextToken, query: string) {
			parent.type = "todo" as any;
			child.text = child.text
				.replace(` /${query}`, "")
				.replace(`/${query}`, "");
			parent.props = {
				indent: parent.props.indent || 0,
				done: false,
			};
		},
	},
];

export function SlashDropdown() {
	const {
		model: { slash, selection, findElement, parent, recalculate },
	} = useContext(EditorContext);
	const { getOffset, getPortal } = selection;
	const { isOpen, query } = useStore(slash);
	const { x, y } = getOffset();

	const portalElement = useMemo(getPortal, [getPortal]);

	const filteredOptions = useMemo(() => {
		return slashOptions.filter(({ label }) => {
			if (query) {
				return ~label.indexOf(query);
			}

			return true;
		});
	}, [query]);

	function runAction(
		action: (parent: BlockToken, child: TextToken, query: string) => void,
	) {
		const textEl = findElement(selection.first[0])! as TextToken;
		const parentEl = parent(selection.first[0])!;

		action?.(parentEl, textEl, slash.query!);

		recalculate();
	}

	useLayoutEffect(() => {
		return onAction(Slash, "onKey", (instance, _, [key]) => {
			if (instance !== slash) {
				return;
			}

			if (key === "Enter") {
				runAction(filteredOptions[0]?.action);
				return;
			}
		});
	}, [filteredOptions.length]);

	if (!isOpen) {
		return null;
	}

	if (!filteredOptions.length) {
		return null;
	}

	const output = (
		<div
			className="e-fl-drop"
			onMouseDown={preventDefaultAndStop}
			style={{
				left: slash.x! - x,
				top: slash.y! - y,
			}}
		>
			{filteredOptions.map(({ label, action }) => (
				<button key={label} onClick={() => runAction(action)}>
					{label}
				</button>
			))}
			{JSON.stringify({ query, x: slash.x, y: slash.y })}
			{/* <Toolbar /> */}
		</div>
	);

	if (portalElement) {
		return createPortal(output, portalElement);
	}

	return output;
}
