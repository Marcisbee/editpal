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
import { safeAreaInsetTop, softwareKeyboardAccessoryInset } from "./utils.ts";

function getIndent(token: BlockToken): number {
	return "indent" in token.props ? token.props.indent ?? 0 : 0;
}

interface SlashOption {
	action(parent: BlockToken): void;
	keywords?: string[];
	label: string;
}

function caretRect(element: HTMLElement, offset: number): DOMRect {
	const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
	const text = walker.nextNode();
	if (!text) {
		return element.getBoundingClientRect();
	}
	const range = document.createRange();
	range.setStart(text, Math.min(offset, text.textContent?.length || 0));
	range.collapse(true);
	const rect = range.getBoundingClientRect();
	range.detach();
	return rect.height || rect.width ? rect : element.getBoundingClientRect();
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
	const dropdownRef = useRef<HTMLDivElement>(null);
	const optionsRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLInputElement>(null);
	const listId = useId();
	const [position, setPosition] = useState({ left: 0, top: 0 });

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

	useLayoutEffect(() => {
		if (!isOpen) {
			return;
		}
		setActiveIndex(filteredOptions.length ? 0 : -1);
		if (optionsRef.current) {
			optionsRef.current.scrollTop = 0;
		}
	}, [isOpen]);

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

	function removeTrigger(action?: (parent: BlockToken) => void): boolean {
		const triggerKey = slash.triggerKey;
		const textEl = triggerKey ? model.findElement(triggerKey) : undefined;
		const parentEl = triggerKey ? model.parent(triggerKey) : undefined;

		if (
			textEl?.type !== "t" ||
			!parentEl ||
			slash.triggerStart === undefined ||
			slash.triggerEnd === undefined
		) {
			return false;
		}

		let result = { offset: slash.triggerStart, text: textEl.text };
		model.transact(() => {
			result = removeSlashTrigger(
				textEl.text,
				slash.triggerStart!,
				slash.triggerEnd!,
			);
			textEl.text = result.text;
			action?.(parentEl);
			selection.setSelection(
				textEl.key,
				result.offset,
				textEl.key,
				result.offset,
			);
		});
		slash.close();
		restoreEditorFocus();
		return true;
	}

	function runAction(action?: (parent: BlockToken) => void) {
		if (action) {
			removeTrigger(action);
		}
	}

	useLayoutEffect(() => {
		if (!isOpen) {
			return;
		}

		const documentScroll = document.scrollingElement?.scrollTop;
		const frame = requestAnimationFrame(() => {
			inputRef.current?.focus({ preventScroll: true });
			if (documentScroll !== undefined && document.scrollingElement) {
				document.scrollingElement.scrollTop = documentScroll;
			}
		});
		return () => cancelAnimationFrame(frame);
	}, [isOpen]);

	useLayoutEffect(() => {
		const dropdown = dropdownRef.current;
		const triggerKey = slash.triggerKey;
		const trigger = triggerKey ? model.findElement(triggerKey) : undefined;
		const anchor = trigger
			? Array.from(
				editor.current?.querySelectorAll<HTMLElement>("[data-ep]") || [],
			).find((candidate) => candidate.dataset.ep === trigger.id)
			: undefined;
		if (
			!isOpen ||
			!dropdown ||
			!anchor ||
			slash.triggerEnd === undefined
		) {
			return;
		}

		const updatePosition = () => {
			const rect = caretRect(anchor, slash.triggerEnd!);
			const viewport = globalThis.visualViewport;
			// Fixed popovers are positioned in visual-viewport coordinates on
			// mobile WebKit. Adding offsetTop/offsetLeft double-counts Safari's
			// keyboard pan and strands the popup underneath the keyboard.
			const viewportLeft = 0;
			const viewportRight = viewport?.width ?? globalThis.innerWidth;
			const viewportHeight = viewport?.height ?? globalThis.innerHeight;
			const touchPoints = globalThis.navigator?.maxTouchPoints ?? 0;
			const viewportTop = Math.max(
				safeAreaInsetTop(),
				touchPoints > 0 ? 56 : 0,
			);
			const viewportBottom = viewportHeight -
				softwareKeyboardAccessoryInset(
					globalThis.innerHeight,
					viewportHeight,
					touchPoints,
				);
			const margin = 8;
			const gap = 4;
			dropdown.style.maxHeight = `${
				Math.max(120, viewportBottom - viewportTop - margin * 2)
			}px`;
			const width = dropdown.offsetWidth;
			const height = dropdown.offsetHeight;
			const maxLeft = Math.max(
				viewportLeft + margin,
				viewportRight - width - margin,
			);
			const maxTop = Math.max(
				viewportTop + margin,
				viewportBottom - height - margin,
			);
			const below = rect.bottom + gap;
			const above = rect.top - height - gap;
			const viewportPosition = {
				left: Math.max(
					viewportLeft + margin,
					Math.min(rect.left, maxLeft),
				),
				top: Math.max(
					viewportTop + margin,
					Math.min(
						below + height <= viewportBottom - margin ? below : above,
						maxTop,
					),
				),
			};
			const offset = getOffset();
			const next = {
				left: viewportPosition.left - offset.x,
				top: viewportPosition.top - offset.y,
			};
			setPosition((current) =>
				current.left === next.left && current.top === next.top ? current : next
			);
		};

		updatePosition();
		globalThis.addEventListener("resize", updatePosition);
		globalThis.addEventListener("scroll", updatePosition, true);
		globalThis.visualViewport?.addEventListener("resize", updatePosition);
		globalThis.visualViewport?.addEventListener("scroll", updatePosition);
		return () => {
			globalThis.removeEventListener("resize", updatePosition);
			globalThis.removeEventListener("scroll", updatePosition, true);
			globalThis.visualViewport?.removeEventListener("resize", updatePosition);
			globalThis.visualViewport?.removeEventListener("scroll", updatePosition);
		};
	}, [
		editor.current,
		filteredOptions.length,
		getOffset,
		isOpen,
		model,
		slash.triggerEnd,
		slash.triggerKey,
	]);

	useLayoutEffect(() => {
		if (!filteredOptions[activeIndex]) {
			return;
		}

		if (!optionsRef.current) {
			return;
		}

		const optionsElement = optionsRef.current;
		const el = optionsElement.children[activeIndex] as HTMLElement | undefined;

		if (!el) {
			return;
		}

		const optionTop = el.offsetTop - optionsElement.offsetTop;
		if (optionTop < optionsElement.scrollTop) {
			optionsElement.scrollTop = optionTop;
		} else if (
			optionTop + el.offsetHeight >
				optionsElement.scrollTop + optionsElement.clientHeight
		) {
			optionsElement.scrollTop = Math.max(
				0,
				optionTop + el.offsetHeight - optionsElement.clientHeight,
			);
		}
	}, [filteredOptions[activeIndex]]);

	if (!editable || !isOpen) {
		return null;
	}

	if (!focus) {
		return null;
	}

	const output = (
		<div
			ref={dropdownRef}
			className="e-fl-drop"
			onMouseDown={(event) => event.stopPropagation()}
			style={{
				left: position.left,
				top: position.top,
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
				onBeforeInput={(event) => {
					if (
						!query &&
						(event.inputType === "deleteContentBackward" ||
							event.inputType === "deleteContentForward")
					) {
						event.preventDefault();
						event.stopPropagation();
						removeTrigger();
					}
				}}
				onKeyDown={(event) => {
					if (event.key === "Escape") {
						event.preventDefault();
						event.stopPropagation();
						slash.dismiss();
						restoreEditorFocus();
						return;
					}

					if (
						!query &&
						(event.key === "Backspace" || event.key === "Delete")
					) {
						event.preventDefault();
						event.stopPropagation();
						removeTrigger();
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
