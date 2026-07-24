import { h } from "preact";
import { useStore } from "exome/preact";
import { createPortal } from "preact/compat";
import {
	useContext,
	useId,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "preact/hooks";

import { EditorContext } from "./editpal.tsx";
import { removeSlashTrigger } from "./slash.ts";
import type { BlockToken } from "./tokens.ts";
import { setBlockType } from "./tokens.ts";

function getIndent(token: BlockToken): number {
	return "indent" in token.props ? token.props.indent ?? 0 : 0;
}

interface SlashOption {
	action(parent: BlockToken): void;
	keywords?: string[];
	label: string;
}

const slashOptions: SlashOption[] = [
	{
		label: "title",
		action(parent: BlockToken) {
			setBlockType(parent, "h", {
				size: 1,
			});
		},
	},
	{
		label: "sub title",
		action(parent: BlockToken) {
			setBlockType(parent, "h", {
				size: 2,
			});
		},
	},
	{
		label: "todo",
		action(parent: BlockToken) {
			setBlockType(parent, "todo", {
				indent: getIndent(parent),
				done: false,
			});
		},
	},
	{
		label: "blockquote",
		action(parent: BlockToken) {
			setBlockType(parent, "quote", {
				level: 1,
			});
		},
	},
	{
		label: "code block",
		action(parent: BlockToken) {
			setBlockType(parent, "code", {});
		},
	},
	{
		label: "horizontal rule",
		action(parent: BlockToken) {
			parent.children.forEach((child) => {
				if (child.type === "t") {
					child.text = "";
				}
			});
			setBlockType(parent, "hr", {});
		},
	},
	{
		label: "unordered list",
		action(parent: BlockToken) {
			setBlockType(parent, "l", {
				type: "ul",
				indent: getIndent(parent),
			});
		},
	},
	{
		label: "ordered list",
		action(parent: BlockToken) {
			setBlockType(parent, "l", {
				type: "ol",
				indent: getIndent(parent),
			});
		},
	},
];

export function SlashDropdown() {
	const { editable, extensions, model, editor } = useContext(EditorContext);
	const { slash, selection } = model;
	const { getOffset, getPortal, focus } = useStore(selection);
	const { isOpen, query } = useStore(slash);
	const { x, y } = getOffset();
	const optionsRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLInputElement>(null);
	const listId = useId();

	const portalElement = useMemo(getPortal, [getPortal]);
	const options = useMemo<SlashOption[]>(() => [
		...slashOptions,
		...(extensions?.slashCommands || []).map((command) => ({
			label: command.label,
			keywords: command.keywords,
			action(parent: BlockToken) {
				command.run({ block: parent, model });
			},
		})),
	], [extensions?.slashCommands, model]);

	const [activeIndex, setActiveIndex] = useState(0);
	const filteredOptions = useMemo(() => {
		const normalizedQuery = query?.toLowerCase() || "";
		return options
			.filter(({ keywords = [], label }) => {
				return label.includes(normalizedQuery) ||
					keywords.some((keyword) =>
						keyword.toLowerCase().includes(normalizedQuery)
					);
			})
			.sort((a, b) =>
				a.label.indexOf(normalizedQuery) - b.label.indexOf(normalizedQuery)
			);
	}, [options, query]);

	useLayoutEffect(() => {
		if (filteredOptions.length === 0) {
			setActiveIndex(-1);
			return;
		}

		if (activeIndex < filteredOptions.length && activeIndex >= 0) {
			return;
		}

		setActiveIndex(0);
	}, [activeIndex, filteredOptions.length, slash]);

	useLayoutEffect(() => {
		setActiveIndex(filteredOptions.length ? 0 : -1);
	}, [query, filteredOptions.length]);

	function restoreEditorFocus() {
		const [key, offset] = selection.first;
		requestAnimationFrame(() => {
			editor.current?.focus({ preventScroll: true });
			const element = model.findElement(key);
			if (element) {
				model.select(element, offset);
			}
		});
	}

	function runAction(action?: (parent: BlockToken) => void) {
		const triggerKey = slash.triggerKey;
		const textEl = triggerKey ? model.findElement(triggerKey) : undefined;
		const parentEl = triggerKey ? model.parent(triggerKey) : undefined;

		if (
			!action ||
			textEl?.type !== "t" ||
			!parentEl ||
			slash.triggerStart === undefined ||
			slash.triggerEnd === undefined
		) {
			return;
		}

		let result = { offset: slash.triggerStart, text: textEl.text };
		model.transact(() => {
			result = removeSlashTrigger(
				textEl.text,
				slash.triggerStart!,
				slash.triggerEnd!,
			);
			textEl.text = result.text;
			action(parentEl);
			selection.setSelection(
				textEl.key,
				result.offset,
				textEl.key,
				result.offset,
			);
		});
		slash.close();
		restoreEditorFocus();
	}

	useLayoutEffect(() => {
		if (!isOpen) {
			return;
		}

		const frame = requestAnimationFrame(() => {
			inputRef.current?.focus({ preventScroll: true });
		});
		return () => cancelAnimationFrame(frame);
	}, [isOpen]);

	useLayoutEffect(() => {
		if (!filteredOptions[activeIndex]) {
			return;
		}

		if (!optionsRef.current) {
			return;
		}

		const el = optionsRef.current.children[activeIndex];

		if (!el) {
			return;
		}

		el.scrollIntoView?.({ block: "nearest" });
	}, [filteredOptions[activeIndex]]);

	if (!editable || !isOpen) {
		return null;
	}

	if (!focus) {
		return null;
	}

	const output = (
		<div
			className="e-fl-drop"
			onMouseDown={(event) => event.stopPropagation()}
			style={{
				left: slash.x! - x,
				top: slash.y! - y,
			}}
		>
			<input
				ref={inputRef}
				type="search"
				autoFocus
				value={query || ""}
				placeholder="Search commands…"
				aria-label="Search commands"
				aria-controls={listId}
				aria-activedescendant={activeIndex >= 0
					? `${listId}-option-${activeIndex}`
					: undefined}
				onInput={(event) => slash.setSearchQuery(event.currentTarget.value)}
				onKeyDown={(event) => {
					if (event.key === "Escape") {
						event.preventDefault();
						event.stopPropagation();
						slash.dismiss();
						restoreEditorFocus();
						return;
					}

					if (event.key === "ArrowUp" || event.key === "ArrowDown") {
						event.preventDefault();
						event.stopPropagation();
						if (!filteredOptions.length) {
							return;
						}
						const direction = event.key === "ArrowUp" ? -1 : 1;
						setActiveIndex(
							(activeIndex + direction + filteredOptions.length) %
								filteredOptions.length,
						);
						return;
					}

					if (event.key === "Enter") {
						event.preventDefault();
						event.stopPropagation();
						runAction(filteredOptions[activeIndex]?.action);
					}
				}}
				onBlur={(event) => {
					const next = event.relatedTarget;
					if (
						next instanceof Node &&
						event.currentTarget.parentElement?.contains(next)
					) {
						return;
					}
					slash.dismiss();
					if (next instanceof Node && editor.current?.contains(next)) {
						return;
					}
					selection.setFocus(false);
					selection.setSelection(
						...selection.first,
						...selection.first,
					);
				}}
			/>
			<div
				ref={optionsRef}
				id={listId}
				className="e-fl-drop-options"
				role="listbox"
			>
				{filteredOptions.map(({ label, action }, index) => (
					<button
						type="button"
						id={`${listId}-option-${index}`}
						role="option"
						aria-selected={activeIndex === index}
						key={label}
						onMouseEnter={() => setActiveIndex(index)}
						onClick={() => runAction(action)}
						data-active={activeIndex === index || undefined}
					>
						{label}
					</button>
				))}
				{!filteredOptions.length && (
					<div className="e-fl-drop-empty">No matching commands</div>
				)}
			</div>
		</div>
	);

	if (portalElement) {
		return createPortal(output, portalElement);
	}

	return output;
}
