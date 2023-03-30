import { h } from "preact";
import { useStore } from "exome/preact";
import { onAction } from "exome";
import { createPortal } from "preact/compat";
import {
	useContext,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "preact/hooks";

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
			};
		},
	},
	{
		label: "sub title",
		action(parent: BlockToken, child: TextToken, query: string) {
			parent.type = "h" as any;
			child.text = child.text
				.replace(` /${query}`, "")
				.replace(`/${query}`, "");
			parent.props = {
				size: 2,
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
				indent: parent.props?.indent || 0,
				done: false,
			};
		},
	},
	{
		label: "unordered list",
		action(parent: BlockToken, child: TextToken, query: string) {
			parent.type = "l" as any;
			child.text = child.text
				.replace(` /${query}`, "")
				.replace(`/${query}`, "");
			parent.props = {
				type: "ul",
				indent: parent.props?.indent || 0,
			};
		},
	},
	{
		label: "ordered list",
		action(parent: BlockToken, child: TextToken, query: string) {
			parent.type = "l" as any;
			child.text = child.text
				.replace(` /${query}`, "")
				.replace(`/${query}`, "");
			parent.props = {
				type: "ol",
				indent: parent.props?.indent || 0,
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
	const ref = useRef<HTMLDivElement>(null);

	const portalElement = useMemo(getPortal, [getPortal]);

	const [activeIndex, setActiveIndex] = useState(0);
	const filteredOptions = useMemo(() => {
		return slashOptions
			.filter(({ label }) => {
				if (query) {
					return ~label.indexOf(query);
				}

				return true;
			})
			.sort((a, b) => a.label.indexOf(query!) - b.label.indexOf(query!));
	}, [query]);

	useLayoutEffect(() => {
		if (filteredOptions.length === 0) {
			setActiveIndex(-1);
			return;
		}

		if (filteredOptions.length >= activeIndex && activeIndex >= 0) {
			return;
		}

		setActiveIndex(0);
	}, [activeIndex, filteredOptions.length]);

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

			if (key === "ArrowUp") {
				setActiveIndex(
					activeIndex
						? (activeIndex - 1) % filteredOptions.length
						: filteredOptions.length - 1,
				);
				return;
			}

			if (key === "ArrowDown") {
				setActiveIndex((activeIndex + 1) % filteredOptions.length);
				return;
			}

			if (key === "Enter") {
				runAction(filteredOptions[activeIndex]?.action);
				return;
			}
		});
	}, [activeIndex, filteredOptions.length]);

	useLayoutEffect(() => {
		if (!filteredOptions[activeIndex]) {
			return;
		}

		if (!ref.current) {
			return;
		}

		const el = ref.current.children[activeIndex];

		if (!el) {
			return;
		}

		el.scrollIntoView?.({ behavior: "smooth", block: "center" });
	}, [filteredOptions[activeIndex]]);

	if (!isOpen) {
		return null;
	}

	if (!filteredOptions.length) {
		return null;
	}

	const output = (
		<div
			ref={ref}
			className="e-fl-drop"
			onMouseDown={preventDefaultAndStop}
			style={{
				left: slash.x! - x,
				top: slash.y! - y,
			}}
		>
			{filteredOptions.map(({ label, action }, index) => (
				<button
					key={label}
					onMouseEnter={() => setActiveIndex(index)}
					onClick={() => runAction(action)}
					data-active={activeIndex === index || undefined}
				>
					{label}
				</button>
			))}
		</div>
	);

	if (portalElement) {
		return createPortal(output, portalElement);
	}

	return output;
}
