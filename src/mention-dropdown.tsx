import { useStore } from "exome/preact";
import { h } from "preact";
import { createPortal } from "preact/compat";
import {
	useContext,
	useEffect,
	useId,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "preact/hooks";

import { EditorContext } from "./editpal.tsx";
import type { MentionConfig, MentionSuggestion } from "./extensions.ts";
import type { TextToken } from "./tokens.ts";

interface ActiveMention {
	config: MentionConfig;
	end: number;
	key: string;
	query: string;
	start: number;
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

function activeMention(
	configs: MentionConfig[],
	element: TextToken,
	offset: number,
): ActiveMention | undefined {
	const before = element.text.slice(0, offset);
	for (const config of configs) {
		if (config.getQuery) {
			const custom = config.getQuery(before, config.trigger);
			if (custom) {
				return {
					config,
					end: offset,
					key: element.key,
					query: custom.query,
					start: custom.start,
				};
			}
			continue;
		}
		const index = before.lastIndexOf(config.trigger);
		if (index < 0) {
			continue;
		}
		if (index > 0 && !/\s|\(|\[|\{/.test(before[index - 1])) {
			continue;
		}
		const query = before.slice(index + config.trigger.length);
		if (/\s/.test(query)) {
			continue;
		}
		return {
			config,
			end: offset,
			key: element.key,
			query,
			start: index,
		};
	}
}

export function MentionDropdown() {
	const { editable, editor, extensions, model } = useContext(EditorContext);
	const { first, focus, last, getOffset, getPortal } = useStore(
		model.selection,
	);
	useStore(model);
	const configs = extensions?.mentions || [];
	const [results, setResults] = useState<MentionSuggestion[]>([]);
	const [activeIndex, setActiveIndex] = useState(0);
	const [dismissed, setDismissed] = useState<string>();
	const [loading, setLoading] = useState(false);
	const listId = useId();
	const abortRef = useRef<AbortController>();
	const dropdownRef = useRef<HTMLDivElement>(null);
	const [position, setPosition] = useState({ left: 0, top: 0 });
	const { x, y } = getOffset();
	const configuredPortal = useMemo(getPortal, [getPortal]);
	const portal = configuredPortal ?? globalThis.document?.body ?? null;

	const active = useMemo(() => {
		if (
			!editable ||
			first[0] !== last[0] ||
			first[1] !== last[1] ||
			!configs.length
		) {
			return;
		}
		const element = model.findElement(first[0]);
		return element?.type === "t" &&
				model.parent(element.key)?.type !== "code"
			? activeMention(configs, element, first[1])
			: undefined;
	}, [
		editable,
		configs,
		first[0],
		first[1],
		last[0],
		last[1],
		model.tokens,
	]);
	const signature = active
		? `${active.config.id}:${active.key}:${active.start}:${active.end}:${active.query}`
		: undefined;

	useEffect(() => {
		abortRef.current?.abort();
		setResults([]);
		setActiveIndex(0);
		setDismissed(undefined);
		if (
			!active ||
			active.query.length < (active.config.minQueryLength || 0)
		) {
			return;
		}
		const controller = new AbortController();
		abortRef.current = controller;
		setLoading(true);
		Promise.resolve(
			active.config.search(active.query, {
				model,
				signal: controller.signal,
				trigger: active.config.trigger,
			}),
		).then((suggestions) => {
			if (!controller.signal.aborted) {
				setResults(
					suggestions.slice(0, active.config.limit ?? 8),
				);
			}
		}).catch((error) => {
			if (!controller.signal.aborted) {
				setResults([]);
				active.config.onError?.(error, active.query);
			}
		}).finally(() => {
			if (!controller.signal.aborted) {
				setLoading(false);
			}
		});
		return () => controller.abort();
	}, [active?.config.id, active?.query, active?.start, model]);

	useEffect(() => {
		const target = editor.current;
		if (!target || !active || !focus || !results.length) {
			return;
		}
		const handler = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				event.preventDefault();
				event.stopPropagation();
				setDismissed(signature);
				return;
			}
			if (event.key === "ArrowDown" || event.key === "ArrowUp") {
				event.preventDefault();
				event.stopPropagation();
				const direction = event.key === "ArrowDown" ? 1 : -1;
				setActiveIndex((index) =>
					(index + direction + results.length) % results.length
				);
				return;
			}
			if (event.key !== "Enter") {
				return;
			}
			event.preventDefault();
			event.stopPropagation();
			const suggestion = results[activeIndex];
			if (!suggestion) {
				return;
			}
			const text = active.config.getText?.(
				suggestion,
				active.config.trigger,
			) ?? `${active.config.trigger}${suggestion.label}`;
			const mention = active.config.getMention?.(
				suggestion,
				active.config.trigger,
			) ?? {
				configId: active.config.id,
				id: suggestion.id,
				label: suggestion.label,
				trigger: active.config.trigger,
				value: suggestion.value,
			};
			model.insertMention(active.key, active.start, active.end, text, {
				...mention,
				configId: active.config.id,
			});
			active.config.onSelect?.(suggestion, model);
		};
		target.addEventListener("keydown", handler, true);
		return () => target.removeEventListener("keydown", handler, true);
	}, [
		active,
		activeIndex,
		editor.current,
		focus,
		model,
		results,
		signature,
	]);

	const tokenId = active ? model.findElement(active.key)?.id : undefined;
	const anchor = active && tokenId
		? editor.current?.querySelector<HTMLElement>(`[data-ep="${tokenId}"]`)
		: undefined;

	useLayoutEffect(() => {
		const dropdown = dropdownRef.current;
		if (!active || !anchor || !dropdown) {
			return;
		}

		const updatePosition = () => {
			const rect = caretRect(anchor, active.end);
			const margin = 8;
			const width = dropdown.offsetWidth;
			const height = dropdown.offsetHeight;
			const minLeft = margin - x;
			const maxLeft = globalThis.innerWidth - margin - width - x;
			const minTop = margin - y;
			const maxTop = globalThis.innerHeight - margin - height - y;
			const below = rect.bottom - y;
			const above = rect.top - height - y;
			const preferredTop = below <= maxTop ? below : above;
			const next = {
				left: Math.max(
					minLeft,
					Math.min(rect.left - x, Math.max(minLeft, maxLeft)),
				),
				top: Math.max(
					minTop,
					Math.min(preferredTop, Math.max(minTop, maxTop)),
				),
			};
			setPosition((current) =>
				current.left === next.left && current.top === next.top ? current : next
			);
		};

		updatePosition();
		globalThis.addEventListener("resize", updatePosition);
		globalThis.addEventListener("scroll", updatePosition, true);
		return () => {
			globalThis.removeEventListener("resize", updatePosition);
			globalThis.removeEventListener("scroll", updatePosition, true);
		};
	}, [
		active?.end,
		active?.key,
		anchor,
		loading,
		results.length,
		x,
		y,
	]);

	if (!active || !focus || dismissed === signature) {
		return null;
	}

	const select = (suggestion: MentionSuggestion) => {
		const text = active.config.getText?.(
			suggestion,
			active.config.trigger,
		) ?? `${active.config.trigger}${suggestion.label}`;
		const mention = active.config.getMention?.(
			suggestion,
			active.config.trigger,
		) ?? {
			configId: active.config.id,
			id: suggestion.id,
			label: suggestion.label,
			trigger: active.config.trigger,
			value: suggestion.value,
		};
		model.insertMention(active.key, active.start, active.end, text, {
			...mention,
			configId: active.config.id,
		});
		active.config.onSelect?.(suggestion, model);
		editor.current?.focus({ preventScroll: true });
	};

	const output = (
		<div
			ref={dropdownRef}
			className="e-mention-drop"
			role="listbox"
			id={listId}
			aria-label={active.config.ariaLabel || "Mention suggestions"}
			style={{
				left: position.left,
				top: position.top,
			}}
			onMouseDown={(event) => event.preventDefault()}
			onKeyDown={(event) => {
				if (!results.length) {
					return;
				}
				if (event.key === "ArrowDown" || event.key === "ArrowUp") {
					event.preventDefault();
					const direction = event.key === "ArrowDown" ? 1 : -1;
					setActiveIndex(
						(activeIndex + direction + results.length) % results.length,
					);
				}
				if (event.key === "Enter") {
					event.preventDefault();
					select(results[activeIndex]);
				}
			}}
		>
			{results.map((suggestion, index) => (
				<button
					type="button"
					role="option"
					aria-selected={index === activeIndex}
					data-active={index === activeIndex || undefined}
					key={suggestion.id}
					onMouseEnter={() => setActiveIndex(index)}
					onClick={() => select(suggestion)}
				>
					{active.config.renderSuggestion?.(suggestion) ?? (
						<>
							<strong>{suggestion.label}</strong>
							{suggestion.description && (
								<small>{suggestion.description}</small>
							)}
						</>
					)}
				</button>
			))}
			{loading && (
				<div className="e-mention-status">
					{active.config.renderLoading?.() ?? "Loading…"}
				</div>
			)}
			{!loading && !results.length && (
				<div className="e-mention-status">
					{active.config.renderEmpty?.(active.query) ??
						"No mentions found"}
				</div>
			)}
		</div>
	);

	return portal ? createPortal(output, portal) : output;
}
