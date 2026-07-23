import { useStore } from "exome/preact";
import { createContext, h } from "preact";
import type { RefObject } from "preact";
import { useContext, useLayoutEffect, useRef, useState } from "preact/hooks";

import type { AnyToken, BlockToken, InlineToken, TextToken } from "./tokens.ts";
import { isBlockToken } from "./tokens.ts";
import { ACTION, Model as EditorModel } from "./model.ts";
import type { MarkdownBoundary } from "./selection.ts";
import { RenderImage } from "./plugin/image.tsx";
import { RenderUrl } from "./plugin/url.tsx";
import { FloatingToolbar } from "./floating-toolbar.tsx";
import { SlashDropdown } from "./slash-dropdown.tsx";
import { inlineMarkdownAffixes, type MarkdownMarker } from "./markdown.ts";
import { inlineTokensToMarkdown } from "./markdown-parser.ts";
import {
	nextGraphemeBoundary,
	previousGraphemeBoundary,
	setInlineMarkdownCaret,
} from "./utils.ts";

import "./app.css";

export const Model = EditorModel;
export { MarkdownPreview } from "./preview.tsx";
export type { MarkdownPreviewProps } from "./preview.tsx";
export {
	inlineTokensToMarkdown,
	parseInlineMarkdown,
	parseMarkdown,
	toMarkdown,
} from "./markdown-parser.ts";
export type {
	AnyToken,
	BlockToken,
	InlineToken,
	TextToken,
	TokenRoot,
} from "./tokens.ts";

function RenderText(
	item: TextToken & {
		k: string;
		markdownAfter?: PositionedMarkdownMarker[];
		markdownBefore?: PositionedMarkdownMarker[];
		sourceEnd?: number;
		sourceStart?: number;
	},
) {
	if (item.props?.url) {
		return <RenderUrl {...item} key={item.id} />;
	}

	const {
		id,
		markdownAfter,
		markdownBefore,
		props,
		sourceEnd,
		sourceStart,
		text,
	} = item;
	const {
		boldMarker: _boldMarker,
		code,
		codeMarker: _codeMarker,
		highlight,
		italicMarker: _italicMarker,
		link,
		markdownEscape: _markdownEscape,
		url: _url,
		...style
	} = props;

	return (
		<span
			key={id}
			style={style}
			data-ep={id}
			data-ep-code-inline={code || undefined}
			data-ep-highlight={highlight || undefined}
			data-ep-link={link || undefined}
			data-ep-source-end={sourceEnd}
			data-ep-source-start={sourceStart}
			data-t={text ? true : "empty"}
		>
			{markdownBefore?.map(({ key, marker, sourceEnd, sourceStart }) => (
				<span
					data-ep-md-marker
					data-ep-md-key={key}
					data-ep-md-side="before"
					data-ep-source-end={sourceEnd}
					data-ep-source-start={sourceStart}
					key={`before-${key}`}
				>
					{marker}
				</span>
			))}
			{text || "\u200B"}
			{markdownAfter?.map(({ key, marker, sourceEnd, sourceStart }) => (
				<span
					data-ep-md-marker
					data-ep-md-key={key}
					data-ep-md-side="after"
					data-ep-source-end={sourceEnd}
					data-ep-source-start={sourceStart}
					key={`after-${key}`}
				>
					{marker}
				</span>
			))}
		</span>
	);
}

interface PositionedMarkdownMarker extends MarkdownMarker {
	sourceEnd: number;
	sourceStart: number;
}

function RenderItem(
	item: AnyToken & {
		codeEnd?: boolean;
		codeStart?: boolean;
		k: string;
		markdownAfter?: PositionedMarkdownMarker[];
		markdownBefore?: PositionedMarkdownMarker[];
		sourceEnd?: number;
		sourceStart?: number;
	},
) {
	const { model } = useContext(EditorContext);

	if (item.type === "h") {
		const { size, ...style } = item.props || {};

		return (
			<strong key={item.id} style={style} data-ep-h={size} data-ep={item.id}>
				<RenderMap items={item.children} />
			</strong>
		);
	}

	if (item.type === "p") {
		const { indent, ...style } = item.props || {};

		return (
			<p key={item.id} style={style} data-ep={item.id} data-ep-i={indent}>
				<RenderMap items={item.children} />
			</p>
		);
	}

	if (item.type === "l") {
		const { indent, type, ...style } = item.props || {};

		return (
			<li
				key={item.id}
				style={style}
				data-ep={item.id}
				data-ep-l={type || "ul"}
				data-ep-i={indent}
			>
				<RenderMap items={item.children} />
			</li>
		);
	}

	if (item.type === "todo") {
		const { indent, done, ...style } = item.props || {};

		return (
			<p
				key={item.id}
				style={style}
				data-ep={item.id}
				data-ep-todo
				data-ep-i={indent}
				data-ep-d={done}
			>
				<RenderMap items={item.children} />
				<input
					data-ep-todo-check
					type="checkbox"
					checked={done}
					onKeyDown={(e) => e.stopPropagation()}
				/>
			</p>
		);
	}

	if (item.type === "quote") {
		const { level, ...style } = item.props || {};
		return (
			<blockquote
				key={item.id}
				style={{
					...style,
					marginLeft: `${Math.max(0, (level || 1) - 1) * 20}px`,
				}}
				data-ep={item.id}
				data-ep-quote
				data-ep-quote-level={level || 1}
			>
				<RenderMap items={item.children} />
			</blockquote>
		);
	}

	if (item.type === "code") {
		const { language, ...style } = item.props || {};
		return (
			<pre
				key={item.id}
				style={style}
				data-ep={item.id}
				data-ep-code
				data-ep-code-end={item.codeEnd || undefined}
				data-ep-code-start={item.codeStart || undefined}
				data-ep-language={language || undefined}
			>
				<code>
					<RenderMap items={item.children} />
				</code>
			</pre>
		);
	}

	if (item.type === "hr") {
		return (
			<div key={item.id} data-ep={item.id} data-ep-hr>
				<hr contentEditable={false} />
				<span data-ep-hr-caret>
					<RenderMap items={item.children} />
				</span>
			</div>
		);
	}

	if (item.type === "img") {
		return <RenderImage {...item} key={item.id} />;
	}

	if (item.type === "url") {
		return <RenderUrl {...item} key={item.id} />;
	}

	if (item.type === "t") {
		return <RenderText {...item} key={item.id} />;
	}

	return null;
}

interface RenderMapProps {
	items: AnyToken[];
}

function RenderMap({ items }: RenderMapProps) {
	if (!Array.isArray(items)) {
		return null;
	}

	const { mode } = useContext(EditorContext);
	let sourceOffset = 0;

	return items.map((item, index) => {
		const previous = items[index - 1];
		const next = items[index + 1];
		const markdown = mode === "markdown" && item.type === "t" &&
				!item.props.url
			? inlineMarkdownAffixes(
				previous?.type === "t" && !previous.props.url
					? previous.props
					: undefined,
				item.props,
				next?.type === "t" && !next.props.url ? next.props : undefined,
			)
			: { before: [], after: [] };
		const markdownBefore = markdown.before.map((entry) => {
			const sourceStart = sourceOffset;
			sourceOffset += entry.marker.length;
			return {
				...entry,
				sourceEnd: sourceOffset,
				sourceStart,
			};
		});
		const sourceStart = sourceOffset;
		const sourceLength = item.type === "t"
			? item.text.length
			: item.type === "img"
			? `![${item.props.alt || ""}](${item.src})`.length
			: item.type === "url"
			? item.src.length
			: 0;
		sourceOffset += sourceLength;
		const sourceEnd = sourceOffset;
		const markdownAfter = markdown.after.map((entry) => {
			const markerStart = sourceOffset;
			sourceOffset += entry.marker.length;
			return {
				...entry,
				sourceEnd: sourceOffset,
				sourceStart: markerStart,
			};
		});

		return (
			<RenderItem
				{...item}
				codeEnd={item.type === "code" && next?.type !== "code"}
				codeStart={item.type === "code" && previous?.type !== "code"}
				k={item.key}
				key={item.id}
				markdownBefore={markdownBefore}
				markdownAfter={markdownAfter}
				sourceEnd={sourceEnd}
				sourceStart={sourceStart}
			/>
		);
	});
}

// rome-ignore lint/suspicious/noExplicitAny: <explanation>
export function preventDefault(e: any) {
	e.preventDefault();
}

// rome-ignore lint/suspicious/noExplicitAny: <explanation>
export function preventDefaultAndStop(e: any) {
	preventDefault(e);
	e.stopPropagation();
}

export interface EditpalProps {
	model: EditorModel;
	mode?: EditpalMode;
}

export type EditpalMode = "basic" | "markdown";

function increment(i: number) {
	return i + 1;
}

export const EditorContext = createContext<{
	model: EditorModel;
	editor: RefObject<HTMLDivElement>;
	mode: EditpalMode;
}>({} as any);

interface EditorPoint {
	element: InlineToken;
	offset: number;
}

function inlineElementForNode(
	model: EditorModel,
	node: Node,
	preferEnd: boolean,
): InlineToken | undefined {
	const nodes: Element[] = node instanceof Element
		? [node, ...node.querySelectorAll("[data-ep]")]
		: [];
	const inline = nodes
		.map((element) => {
			const id = (element as HTMLElement).dataset.ep;
			return id ? model.findElement(model._idToKey[id]) : undefined;
		})
		.filter((element): element is InlineToken =>
			Boolean(element && !isBlockToken(element))
		);

	return preferEnd ? inline[inline.length - 1] : inline[0];
}

function closestTokenElement(node: Node): HTMLElement | undefined {
	const element = node instanceof HTMLElement ? node : node.parentElement;
	return element?.closest<HTMLElement>("[data-ep]") || undefined;
}

function pointAtInline(
	element: InlineToken,
	offset: number,
): EditorPoint {
	const maxOffset = element.type === "t" ? element.text.length : 0;
	return {
		element,
		offset: Math.max(0, Math.min(offset, maxOffset)),
	};
}

function resolveEditorPoint(
	model: EditorModel,
	editor: HTMLElement,
	node: Node,
	offset: number,
): EditorPoint | undefined {
	if (node !== editor && !editor.contains(node)) {
		return;
	}

	const tokenElement = closestTokenElement(node);
	const tokenId = tokenElement?.dataset.ep;
	const token = tokenId
		? model.findElement(model._idToKey[tokenId])
		: undefined;

	if (token && !isBlockToken(token)) {
		const nodeElement = node instanceof Element ? node : node.parentElement;
		const marker = nodeElement?.closest<HTMLElement>("[data-ep-md-marker]");
		if (marker && token.type === "t") {
			return pointAtInline(
				token,
				marker.dataset.epMdSide === "after" ? token.text.length : 0,
			);
		}

		if (node.nodeType === Node.TEXT_NODE && token.type === "t") {
			return pointAtInline(token, offset);
		}

		if (node === tokenElement && token.type === "t") {
			let textOffset = 0;
			for (const child of Array.from(node.childNodes).slice(0, offset)) {
				textOffset += child.nodeType === Node.TEXT_NODE
					? child.textContent?.length || 0
					: 0;
			}
			return pointAtInline(token, textOffset);
		}

		return pointAtInline(token, 0);
	}

	const container = node instanceof Element ? node : tokenElement;
	if (!container) {
		return;
	}

	const childNodes = Array.from(container.childNodes);
	for (const child of childNodes.slice(offset)) {
		const inline = inlineElementForNode(model, child, false);
		if (inline) {
			return pointAtInline(inline, 0);
		}
	}

	for (const child of childNodes.slice(0, offset).reverse()) {
		const inline = inlineElementForNode(model, child, true);
		if (inline) {
			return pointAtInline(
				inline,
				inline.type === "t" ? inline.text.length : 0,
			);
		}
	}

	const inline = inlineElementForNode(model, container, offset > 0);
	return inline
		? pointAtInline(
			inline,
			inline.type === "t" && offset > 0 ? inline.text.length : 0,
		)
		: undefined;
}

function markdownBoundaryAtPoint(
	model: EditorModel,
	node: Node,
	offset: number,
): MarkdownBoundary | undefined {
	const tokenElement = closestTokenElement(node);
	const tokenId = tokenElement?.dataset.ep;
	const token = tokenId
		? model.findElement(model._idToKey[tokenId])
		: undefined;
	if (!tokenElement || token?.type !== "t") {
		return;
	}

	let side: "before" | "after" | undefined;
	const nodeElement = node instanceof Element ? node : node.parentElement;
	const marker = nodeElement?.closest<HTMLElement>("[data-ep-md-marker]");
	if (marker) {
		const markerSide = marker.dataset.epMdSide;
		const markerLength = marker.textContent?.length || 0;
		const markerOffset = node.nodeType === Node.TEXT_NODE
			? offset
			: offset > 0
			? markerLength
			: 0;
		if (markerSide === "before" && markerOffset === 0) {
			side = "before";
		}
		if (markerSide === "after" && markerOffset >= markerLength) {
			side = "after";
		}
	} else if (node === tokenElement) {
		const children = Array.from(tokenElement.childNodes);
		const firstNode = children[0];
		const lastNode = children[children.length - 1];
		const first = firstNode instanceof HTMLElement ? firstNode : undefined;
		const last = lastNode instanceof HTMLElement ? lastNode : undefined;
		if (
			offset === 0 &&
			first?.matches("[data-ep-md-marker][data-ep-md-side='before']")
		) {
			side = "before";
		}
		if (
			offset === children.length &&
			last?.matches("[data-ep-md-marker][data-ep-md-side='after']")
		) {
			side = "after";
		}
	}

	if (!side) {
		return;
	}

	const format = { ...token.props };
	for (
		const boundaryMarker of tokenElement.querySelectorAll<HTMLElement>(
			`:scope > [data-ep-md-marker][data-ep-md-side="${side}"]`,
		)
	) {
		const key = boundaryMarker.dataset.epMdKey;
		if (key) {
			delete format[key];
			if (key === "code") {
				delete format.codeMarker;
			}
		}
	}

	return {
		format,
		side,
		tokenId: token.id,
	};
}

function markerElement(node: Node | undefined): HTMLElement | undefined {
	const element = node instanceof HTMLElement ? node : node?.parentElement;
	return element?.closest<HTMLElement>("[data-ep-md-marker]") || undefined;
}

function adjacentMarkdownMarker(
	node: Node,
	offset: number,
	backward: boolean,
): HTMLElement | undefined {
	const directMarker = markerElement(node);
	if (directMarker) {
		return directMarker;
	}

	if (node.nodeType === Node.TEXT_NODE) {
		const textLength = node.textContent?.length || 0;
		if ((backward && offset !== 0) || (!backward && offset !== textLength)) {
			return;
		}
		return markerElement(
			backward
				? node.previousSibling || undefined
				: node.nextSibling || undefined,
		);
	}

	const children = Array.from(node.childNodes);
	return markerElement(
		(backward ? children[offset - 1] : children[offset]) || undefined,
	);
}

interface MarkdownSourcePoint {
	block: BlockToken;
	offset: number;
}

function sourceNumber(
	element: HTMLElement,
	key: "sourceEnd" | "sourceStart",
): number | undefined {
	const value = Number(
		key === "sourceStart"
			? element.dataset.epSourceStart
			: element.dataset.epSourceEnd,
	);
	return Number.isFinite(value) ? value : undefined;
}

function sourceEdge(
	node: Node | undefined,
	end: boolean,
): number | undefined {
	if (!node) {
		return;
	}

	if (node instanceof HTMLElement) {
		const direct = sourceNumber(node, end ? "sourceEnd" : "sourceStart");
		if (direct !== undefined) {
			return direct;
		}
		const annotated = Array.from(
			node.querySelectorAll<HTMLElement>("[data-ep-source-start]"),
		);
		const candidate = end ? annotated[annotated.length - 1] : annotated[0];
		return candidate
			? sourceNumber(candidate, end ? "sourceEnd" : "sourceStart")
			: undefined;
	}

	return sourceEdge(node.parentElement || undefined, end);
}

function sourceOffsetAtNode(
	node: Node,
	offset: number,
): number | undefined {
	const element = node instanceof HTMLElement ? node : node.parentElement;
	const marker = element?.closest<HTMLElement>("[data-ep-md-marker]");
	if (marker) {
		const start = sourceNumber(marker, "sourceStart");
		const end = sourceNumber(marker, "sourceEnd");
		if (start === undefined || end === undefined) {
			return;
		}
		const markerOffset = node.nodeType === Node.TEXT_NODE
			? offset
			: offset > 0
			? end - start
			: 0;
		return Math.max(start, Math.min(start + markerOffset, end));
	}

	const token = element?.closest<HTMLElement>("[data-ep-source-start]");
	if (token) {
		const start = sourceNumber(token, "sourceStart");
		const end = sourceNumber(token, "sourceEnd");
		if (start === undefined || end === undefined) {
			return;
		}
		if (node.nodeType === Node.TEXT_NODE && node.parentElement === token) {
			const visibleLength = node.textContent === "\u200B"
				? 0
				: node.textContent?.length || 0;
			return Math.max(
				start,
				Math.min(start + Math.min(offset, visibleLength), end),
			);
		}
		if (node === token) {
			const children = Array.from(token.childNodes);
			for (const child of children.slice(offset)) {
				const edge = sourceEdge(child, false);
				if (edge !== undefined) {
					return edge;
				}
			}
			for (const child of children.slice(0, offset).reverse()) {
				const edge = sourceEdge(child, true);
				if (edge !== undefined) {
					return edge;
				}
			}
			return offset > 0 ? end : start;
		}
	}

	if (node instanceof Element) {
		const children = Array.from(node.childNodes);
		for (const child of children.slice(offset)) {
			const edge = sourceEdge(child, false);
			if (edge !== undefined) {
				return edge;
			}
		}
		for (const child of children.slice(0, offset).reverse()) {
			const edge = sourceEdge(child, true);
			if (edge !== undefined) {
				return edge;
			}
		}
	}
}

function markdownSourcePoint(
	model: EditorModel,
	node: Node,
	offset: number,
): MarkdownSourcePoint | undefined {
	const tokenElement = closestTokenElement(node);
	const tokenId = tokenElement?.dataset.ep;
	const token = tokenId
		? model.findElement(model._idToKey[tokenId])
		: undefined;
	if (!token) {
		return;
	}

	const block = isBlockToken(token) ? token : model.parent(token.key);
	const sourceOffset = sourceOffsetAtNode(node, offset);
	if (!block || sourceOffset === undefined) {
		return;
	}

	return {
		block,
		offset: sourceOffset,
	};
}

export function Editpal({ mode = "markdown", model }: EditpalProps) {
	const { tokens, _stack, action, selection } = useStore(model);
	const ref = useRef<HTMLDivElement>(null);
	const [focus, setFocus] = useState(0);
	const [reload, setReload] = useState(0);

	useLayoutEffect(() => {
		_stack.splice(0).pop()?.();
	});

	function select(
		first: Node,
		last: Node,
		anchorOffset: number,
		focusOffset: number,
	) {
		if (model._isComposing) {
			return;
		}

		try {
			if (!ref.current) {
				return;
			}

			const anchor = resolveEditorPoint(
				model,
				ref.current,
				first,
				anchorOffset,
			);
			const focus = resolveEditorPoint(
				model,
				ref.current,
				last,
				focusOffset,
			);
			if (!anchor || !focus) {
				return;
			}
			selection.setSelection(
				anchor.element.key,
				anchor.offset,
				focus.element.key,
				focus.offset,
			);
			const domCollapsed = first === last && anchorOffset === focusOffset;
			const markdownBoundary = domCollapsed
				? markdownBoundaryAtPoint(model, first, anchorOffset)
				: undefined;
			selection.setMarkdownBoundary(markdownBoundary);
			selection.setFormat(
				markdownBoundary?.format || model.getSelectionFormat(),
			);
			if (domCollapsed && markerElement(first)) {
				const sourcePoint = markdownSourcePoint(
					model,
					first,
					anchorOffset,
				);
				if (sourcePoint) {
					_stack.push(() =>
						setInlineMarkdownCaret(sourcePoint.block.id, sourcePoint.offset)
					);
				}
			}
		} catch {
			// Ignore transient browser selections while the DOM is being reconciled.
		}
	}

	function onSelect(event: MouseEvent) {
		// ref.current?.focus();

		if (
			event.target instanceof Element &&
			event.target.closest("[data-ep-todo-check]")
		) {
			return;
		}
		if (
			event.target instanceof Element &&
			event.target.closest("[data-ep-md-marker]")
		) {
			// Markdown delimiters are real editable text. Let the browser place or
			// extend its native selection inside them.
			model.history.batch();
			return;
		}

		let range: Range | null;
		if (document.caretRangeFromPoint) {
			// edge, chrome, android
			range = document.caretRangeFromPoint(event.clientX, event.clientY);
		} else if (document.caretPositionFromPoint) {
			// firefox
			const position = document.caretPositionFromPoint(
				event.clientX,
				event.clientY,
			);
			if (!position) {
				return;
			}
			range = document.createRange();
			range.setStart(position.offsetNode, position.offset);
			range.setEnd(position.offsetNode, position.offset);
		} else {
			return;
		}

		if (!range) {
			return;
		}

		const domSelection = document.getSelection();
		domSelection?.removeAllRanges();
		domSelection?.addRange(range);

		model.history.batch();

		select(
			range.startContainer,
			range.endContainer,
			range.startOffset,
			range.endOffset,
		);
	}

	// Arrow keys doesn't update selection in FireFox
	function onSelectionStart() {
		document.addEventListener("selectionchange", onSelectionChange);
	}

	function onSelectionChange() {
		const domSelection = document.getSelection();

		if (!domSelection?.anchorNode || !domSelection.focusNode) {
			return;
		}

		select(
			domSelection.anchorNode,
			domSelection.focusNode,
			domSelection.anchorOffset,
			domSelection.focusOffset,
		);
	}

	function onFocus() {
		if (model.slash.isOpen) {
			model.slash.dismiss();
		}
		model.selection.setFocus(true);
		onSelectionStart();
	}

	function onBlur(event: FocusEvent) {
		if (
			event.relatedTarget instanceof Element &&
			event.relatedTarget.closest(".e-fl-drop")
		) {
			return;
		}

		model.selection.setFocus(false);
		model.selection.setSelection(
			...model.selection.first,
			...model.selection.first,
		);
		document.removeEventListener("selectionchange", onSelectionChange);
		setFocus(increment);
	}

	function onDrop(event: DragEvent) {
		preventDefaultAndStop(event);

		onSelect(event);

		const text = event.dataTransfer?.getData("text/plain");
		if (text) {
			model.history.batch();
			model.action(ACTION._Key, text);
			model.history.batch();
		}
	}

	function onTodoClick(event: MouseEvent) {
		const target = event.target instanceof HTMLInputElement
			? event.target
			: undefined;
		if (!target?.matches("[data-ep-todo-check]")) {
			return;
		}

		event.stopPropagation();
		const blockId = target.closest<HTMLElement>("[data-ep-todo]")?.dataset.ep;
		const blockKey = blockId ? model._idToKey[blockId] : undefined;
		if (blockKey) {
			model.action(ACTION._Todo, [blockKey, target.checked]);
		}
	}

	function onMarkdownMarkerClick(event: MouseEvent) {
		if (
			mode !== "markdown" ||
			!(event.target instanceof Element) ||
			!event.target.closest("[data-ep-md-marker]")
		) {
			return;
		}
		const currentSelection = document.getSelection();
		if (currentSelection && !currentSelection.isCollapsed) {
			return;
		}

		const marker = event.target.closest<HTMLElement>(
			"[data-ep-md-marker]",
		);
		const textNode = marker?.firstChild;
		if (!marker || textNode?.nodeType !== Node.TEXT_NODE) {
			return;
		}
		const bounds = marker.getBoundingClientRect();
		const markerLength = textNode.textContent?.length || 0;
		const ratio = bounds.width > 0
			? (event.clientX - bounds.left) / bounds.width
			: 0;
		const offset = Math.max(
			0,
			Math.min(Math.round(ratio * markerLength), markerLength),
		);
		const range = document.createRange();
		range.setStart(textNode, offset);
		range.collapse(true);

		ref.current?.focus({ preventScroll: true });
		currentSelection?.removeAllRanges();
		currentSelection?.addRange(range);
		select(
			range.startContainer,
			range.startContainer,
			range.startOffset,
			range.startOffset,
		);
	}

	function onCompositionStart() {
		model._isComposing = true;
	}

	function onCompositionEnd(e: CompositionEvent) {
		const fn = () => {
			model._isComposing = false;
			if (e.data) {
				action(ACTION._Compose, e.data);
			}
			setReload(increment);
		};

		// (Chrome) isTrusted === false
		// (Firefox) isTrusted === true
		// (Safari) isTrusted === true
		if (e.isTrusted) {
			_stack.push(fn);
		} else {
			fn();
		}

		setFocus(increment);
	}

	useLayoutEffect(() => {
		if (!ref.current) {
			return;
		}

		const e = ref.current;

		e.addEventListener("compositionstart", onCompositionStart);
		e.addEventListener("compositionend", onCompositionEnd);
		e.addEventListener("focus", onFocus);
		e.addEventListener("selectstart", onSelectionStart, { once: true });
		e.addEventListener("mousedown", onSelect, true);
		e.addEventListener("blur", onBlur);
		e.addEventListener("drop", onDrop);
		e.addEventListener("click", onTodoClick);
		e.addEventListener("click", onMarkdownMarkerClick);

		return () => {
			e.removeEventListener("compositionstart", onCompositionStart);
			e.removeEventListener("compositionend", onCompositionEnd);
			e.removeEventListener("focus", onFocus);
			e.removeEventListener("selectstart", onSelectionStart);
			e.removeEventListener("mousedown", onSelect, true);
			e.removeEventListener("blur", onBlur);
			e.removeEventListener("drop", onDrop);
			e.removeEventListener("click", onTodoClick);
			e.removeEventListener("click", onMarkdownMarkerClick);
			document.removeEventListener("selectionchange", onSelectionChange);
		};
	}, [focus, mode]);

	function toggleFormat(key: string, value: string) {
		const type = model.selection.format[key] === value
			? ACTION._FormatRemove
			: ACTION._FormatAdd;
		action(type, [key, value]);
	}

	function selectionTouchesMarkdownMarker(
		domSelection = document.getSelection(),
	): boolean {
		if (
			mode !== "markdown" ||
			!domSelection?.anchorNode ||
			!domSelection.focusNode ||
			!ref.current
		) {
			return false;
		}
		if (
			markerElement(domSelection.anchorNode) ||
			markerElement(domSelection.focusNode)
		) {
			return true;
		}
		if (domSelection.isCollapsed || !domSelection.rangeCount) {
			return false;
		}

		const range = domSelection.getRangeAt(0);
		return Array.from(
			ref.current.querySelectorAll<HTMLElement>("[data-ep-md-marker]"),
		).some((marker) => {
			try {
				return range.intersectsNode(marker);
			} catch {
				return false;
			}
		});
	}

	function editSelectedMarkdown(
		text: string,
		direction?: "backward" | "forward",
	): boolean {
		const domSelection = document.getSelection();
		if (
			mode !== "markdown" ||
			/[\r\n]/.test(text) ||
			!domSelection?.anchorNode ||
			!domSelection.focusNode ||
			!ref.current
		) {
			return false;
		}
		const anchor = markdownSourcePoint(
			model,
			domSelection.anchorNode,
			domSelection.anchorOffset,
		);
		const focus = markdownSourcePoint(
			model,
			domSelection.focusNode,
			domSelection.focusOffset,
		);
		if (!anchor || !focus || anchor.block.id !== focus.block.id) {
			return false;
		}

		let start = Math.min(anchor.offset, focus.offset);
		let end = Math.max(anchor.offset, focus.offset);
		if (domSelection.isCollapsed) {
			const backward = direction === "backward";
			const marker = direction
				? adjacentMarkdownMarker(
					domSelection.anchorNode,
					domSelection.anchorOffset,
					backward,
				)
				: markerElement(domSelection.anchorNode);
			if (!marker) {
				return false;
			}

			const source = inlineTokensToMarkdown(anchor.block.children);
			if (direction === "backward") {
				start = previousGraphemeBoundary(source, start);
			} else if (direction === "forward") {
				end = nextGraphemeBoundary(source, end);
			}
		} else if (!selectionTouchesMarkdownMarker(domSelection)) {
			return false;
		}

		action(ACTION._EditMarkdown, {
			blockId: anchor.block.id,
			end,
			start,
			text,
		});
		return true;
	}

	function onBeforeInput(event: InputEvent) {
		if (event.isComposing || model._isComposing) {
			return;
		}

		if (
			(event.inputType === "deleteContentBackward" ||
				event.inputType === "deleteContentForward") &&
			editSelectedMarkdown(
				"",
				event.inputType === "deleteContentBackward" ? "backward" : "forward",
			)
		) {
			preventDefaultAndStop(event);
			return;
		}

		switch (event.inputType) {
			case "insertText":
			case "insertReplacementText":
				if (event.data != null) {
					preventDefaultAndStop(event);
					if (!editSelectedMarkdown(event.data)) {
						action(ACTION._Key, event.data);
					}
				}
				return;
			case "insertParagraph":
			case "insertLineBreak":
				preventDefaultAndStop(event);
				action(ACTION._Enter);
				return;
			case "deleteContentBackward":
				preventDefaultAndStop(event);
				action(ACTION._Remove);
				return;
			case "deleteWordBackward":
				preventDefaultAndStop(event);
				action(ACTION._RemoveWord);
				return;
			case "deleteSoftLineBackward":
			case "deleteHardLineBackward":
				preventDefaultAndStop(event);
				action(ACTION._RemoveLine);
				return;
			case "deleteContentForward":
				preventDefaultAndStop(event);
				action(ACTION._Delete);
				return;
			case "deleteWordForward":
				preventDefaultAndStop(event);
				action(ACTION._DeleteWord);
				return;
			case "deleteSoftLineForward":
			case "deleteHardLineForward":
				preventDefaultAndStop(event);
				action(ACTION._DeleteLine);
				return;
			case "historyUndo":
			case "historyRedo":
				preventDefaultAndStop(event);
				action(
					event.inputType === "historyUndo" ? ACTION._Undo : ACTION._Redo,
				);
				return;
			case "formatBold":
				preventDefaultAndStop(event);
				toggleFormat("fontWeight", "bold");
				return;
			case "formatItalic":
				preventDefaultAndStop(event);
				toggleFormat("fontStyle", "italic");
				return;
			case "formatUnderline":
				preventDefaultAndStop(event);
				return;
		}

		if (event.inputType.startsWith("insert")) {
			const transfer = (event as InputEvent & { dataTransfer?: DataTransfer })
				.dataTransfer;
			const text = event.data ?? transfer?.getData("text/plain");
			preventDefaultAndStop(event);
			if (text) {
				action(ACTION._Key, text);
			}
			return;
		}

		if (event.inputType.startsWith("delete")) {
			preventDefaultAndStop(event);
			action(
				event.inputType.includes("Forward") ? ACTION._Delete : ACTION._Remove,
			);
			return;
		}

		if (event.inputType.startsWith("format")) {
			// Unsupported native formatting must not mutate the model-owned DOM.
			preventDefaultAndStop(event);
		}
	}

	return (
		<EditorContext.Provider
			value={{
				model,
				editor: ref,
				mode,
			}}
		>
			<FloatingToolbar />
			<SlashDropdown />

			<div
				ref={ref}
				contentEditable
				tabIndex={0}
				onBeforeInput={onBeforeInput}
				onDragStart={preventDefaultAndStop}
				onCopy={(e) => {
					const domSelection = document.getSelection();
					if (
						!domSelection ||
						domSelection.isCollapsed ||
						!ref.current?.contains(domSelection.anchorNode)
					) {
						return;
					}

					preventDefaultAndStop(e);
					e.clipboardData?.setData(
						"text/plain",
						selectionTouchesMarkdownMarker(domSelection)
							? domSelection.toString()
							: model.selectedText(),
					);
				}}
				onCut={(e) => {
					const domSelection = document.getSelection();
					if (
						!domSelection ||
						domSelection.isCollapsed ||
						!ref.current?.contains(domSelection.anchorNode)
					) {
						return;
					}

					preventDefaultAndStop(e);
					e.clipboardData?.setData(
						"text/plain",
						selectionTouchesMarkdownMarker(domSelection)
							? domSelection.toString()
							: model.selectedText(),
					);
					if (editSelectedMarkdown("")) {
						return;
					}
					model.history.batch();
					action(ACTION._Key, "");
					model.history.batch();
				}}
				onPaste={(e) => {
					preventDefaultAndStop(e);

					const text = e.clipboardData?.getData("text/plain") ??
						e.clipboardData?.getData("text") ??
						"";

					model.history.batch();

					if (!editSelectedMarkdown(text)) {
						action(ACTION._Key, text);
					}

					model.history.batch();
				}}
				onKeyDown={(e) => {
					const primaryModifier = e.metaKey || e.ctrlKey;
					const key = e.key.toLowerCase();

					if (
						(key === "backspace" || key === "delete") &&
						!primaryModifier &&
						!e.altKey &&
						editSelectedMarkdown(
							"",
							key === "backspace" ? "backward" : "forward",
						)
					) {
						preventDefaultAndStop(e);
						return;
					}

					if (
						(key === "backspace" || key === "delete") &&
						(e.metaKey || e.ctrlKey || e.altKey)
					) {
						preventDefaultAndStop(e);
						const backward = key === "backspace";
						const line = e.metaKey;
						action(
							backward
								? line ? ACTION._RemoveLine : ACTION._RemoveWord
								: line
								? ACTION._DeleteLine
								: ACTION._DeleteWord,
						);
						return;
					}

					if (primaryModifier && !e.altKey) {
						if (key === "z") {
							preventDefaultAndStop(e);
							action(e.shiftKey ? ACTION._Redo : ACTION._Undo);
							return;
						}
						if (key === "y") {
							preventDefaultAndStop(e);
							action(ACTION._Redo);
							return;
						}
						if (key === "b") {
							preventDefaultAndStop(e);
							toggleFormat("fontWeight", "bold");
							return;
						}
						if (key === "i") {
							preventDefaultAndStop(e);
							toggleFormat("fontStyle", "italic");
							return;
						}
						if (key === "u") {
							preventDefaultAndStop(e);
							return;
						}

						// Copy, cut, paste, select-all, and application/browser shortcuts
						// are handled by their dedicated events or by the browser.
						return;
					}

					if (model.slash.isOpen && e.key === "Escape") {
						preventDefaultAndStop(e);
						model.slash.dismiss();
						return;
					}

					if (e.key.indexOf("Arrow") === 0) {
						model.history.batch();
						return;
					}

					// Let the browser display its temporary IME/dead-key composition.
					if (model._isComposing) {
						return;
					}

					if (Array.from(e.key).length === 1) {
						preventDefaultAndStop(e);
						if (!editSelectedMarkdown(e.key)) {
							action(ACTION._Key, e.key);
						}
						return;
					}

					if (e.key === "Tab") {
						preventDefault(e);
						action(e.shiftKey ? ACTION._ShiftTab : ACTION._Tab);
						return;
					}

					if (e.key === "Backspace") {
						preventDefault(e);
						action(ACTION._Remove);
						return;
					}

					if (e.key === "Enter") {
						preventDefault(e);
						action(ACTION._Enter);
						return;
					}

					if (e.key === "Delete") {
						preventDefault(e);
						action(ACTION._Delete);
						return;
					}

					// Navigation, escape, function keys, and browser shortcuts do not
					// mutate the editor and should retain their native behavior.
				}}
				data-ep-main
				data-ep-mode={mode}
			>
				<RenderMap key={`root-${reload}`} items={tokens} />
			</div>
		</EditorContext.Provider>
	);
}
