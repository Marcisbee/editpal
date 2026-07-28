import type { AnyToken } from "./tokens.ts";

export function ranID() {
	return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

function previousCodePointBoundary(value: string, offset: number): number {
	let boundary = Math.max(0, Math.min(offset, value.length)) - 1;

	if (
		boundary > 0 &&
		value.charCodeAt(boundary) >= 0xDC00 &&
		value.charCodeAt(boundary) <= 0xDFFF &&
		value.charCodeAt(boundary - 1) >= 0xD800 &&
		value.charCodeAt(boundary - 1) <= 0xDBFF
	) {
		boundary -= 1;
	}

	return Math.max(0, boundary);
}

function nextCodePointBoundary(value: string, offset: number): number {
	const boundary = Math.max(0, Math.min(offset, value.length));
	const codePoint = value.codePointAt(boundary);
	return Math.min(
		value.length,
		boundary + (codePoint != null && codePoint > 0xFFFF ? 2 : 1),
	);
}

function isGraphemeExtension(codePoint: number | undefined): boolean {
	if (codePoint == null) {
		return false;
	}

	return (
		(codePoint >= 0x0300 && codePoint <= 0x036F) ||
		(codePoint >= 0x1AB0 && codePoint <= 0x1AFF) ||
		(codePoint >= 0x1DC0 && codePoint <= 0x1DFF) ||
		(codePoint >= 0x20D0 && codePoint <= 0x20FF) ||
		(codePoint >= 0xFE00 && codePoint <= 0xFE0F) ||
		(codePoint >= 0xFE20 && codePoint <= 0xFE2F) ||
		(codePoint >= 0x1F3FB && codePoint <= 0x1F3FF) ||
		(codePoint >= 0xE0100 && codePoint <= 0xE01EF)
	);
}

function isRegionalIndicator(codePoint: number | undefined): boolean {
	return codePoint != null && codePoint >= 0x1F1E6 && codePoint <= 0x1F1FF;
}

interface Segment {
	index: number;
	isWordLike?: boolean;
	segment: string;
}

interface SegmenterLike {
	segment(value: string): Iterable<Segment>;
}

type SegmenterConstructor = new (
	locale?: string,
	options?: { granularity: "grapheme" | "word" },
) => SegmenterLike;

const Segmenter = (Intl as unknown as { Segmenter?: SegmenterConstructor })
	.Segmenter;
const graphemeSegmenter = Segmenter
	? new Segmenter(undefined, { granularity: "grapheme" })
	: undefined;
const wordSegmenter = Segmenter
	? new Segmenter(undefined, { granularity: "word" })
	: undefined;

export function previousGraphemeBoundary(
	value: string,
	offset: number,
): number {
	const safeOffset = Math.max(0, Math.min(offset, value.length));

	if (graphemeSegmenter) {
		let boundary = 0;
		for (const segment of graphemeSegmenter.segment(value)) {
			if (segment.index >= safeOffset) {
				break;
			}
			boundary = segment.index;
		}
		return boundary;
	}

	let boundary = previousCodePointBoundary(value, safeOffset);
	while (
		boundary > 0 &&
		isGraphemeExtension(value.codePointAt(boundary))
	) {
		boundary = previousCodePointBoundary(value, boundary);
	}

	const current = value.codePointAt(boundary);
	if (isRegionalIndicator(current) && boundary > 0) {
		const previous = previousCodePointBoundary(value, boundary);
		if (isRegionalIndicator(value.codePointAt(previous))) {
			boundary = previous;
		}
	}

	while (boundary > 0) {
		const joiner = previousCodePointBoundary(value, boundary);
		if (value.codePointAt(joiner) !== 0x200D) {
			break;
		}

		boundary = previousCodePointBoundary(value, joiner);
		while (
			boundary > 0 &&
			isGraphemeExtension(value.codePointAt(boundary))
		) {
			boundary = previousCodePointBoundary(value, boundary);
		}
	}

	return boundary;
}

export function nextGraphemeBoundary(value: string, offset: number): number {
	const safeOffset = Math.max(0, Math.min(offset, value.length));

	if (graphemeSegmenter) {
		for (const segment of graphemeSegmenter.segment(value)) {
			const end = segment.index + segment.segment.length;
			if (end > safeOffset) {
				return end;
			}
		}
		return value.length;
	}

	let boundary = nextCodePointBoundary(value, safeOffset);
	while (
		boundary < value.length &&
		isGraphemeExtension(value.codePointAt(boundary))
	) {
		boundary = nextCodePointBoundary(value, boundary);
	}

	if (
		isRegionalIndicator(value.codePointAt(safeOffset)) &&
		isRegionalIndicator(value.codePointAt(boundary))
	) {
		boundary = nextCodePointBoundary(value, boundary);
	}

	while (boundary < value.length && value.codePointAt(boundary) === 0x200D) {
		boundary = nextCodePointBoundary(value, boundary);
		boundary = nextCodePointBoundary(value, boundary);
		while (
			boundary < value.length &&
			isGraphemeExtension(value.codePointAt(boundary))
		) {
			boundary = nextCodePointBoundary(value, boundary);
		}
	}

	return boundary;
}

export function snapGraphemeBoundary(
	value: string,
	offset: number,
	forward = false,
): number {
	const safeOffset = Math.max(0, Math.min(offset, value.length));
	if (safeOffset === 0 || safeOffset === value.length) {
		return safeOffset;
	}

	if (graphemeSegmenter) {
		for (const segment of graphemeSegmenter.segment(value)) {
			const end = segment.index + segment.segment.length;
			if (safeOffset === segment.index || safeOffset === end) {
				return safeOffset;
			}
			if (safeOffset > segment.index && safeOffset < end) {
				return forward ? end : segment.index;
			}
		}
		return safeOffset;
	}

	let boundary = 0;
	while (boundary < value.length) {
		const next = nextGraphemeBoundary(value, boundary);
		if (safeOffset === next) {
			return safeOffset;
		}
		if (safeOffset < next) {
			return forward ? next : boundary;
		}
		boundary = next;
	}

	return safeOffset;
}

export function previousWordBoundary(value: string, offset: number): number {
	const safeOffset = Math.max(0, Math.min(offset, value.length));
	if (wordSegmenter) {
		const segments = Array.from(wordSegmenter.segment(value))
			.filter((segment) => segment.index < safeOffset);
		let index = segments.length - 1;
		let boundary = safeOffset;
		while (index >= 0 && /^\s+$/.test(segments[index].segment)) {
			boundary = segments[index].index;
			index -= 1;
		}
		return index >= 0 ? segments[index].index : boundary;
	}

	let boundary = safeOffset;
	while (boundary > 0 && /\s/.test(value[boundary - 1])) {
		boundary = previousCodePointBoundary(value, boundary);
	}
	while (boundary > 0 && !/\s/.test(value[boundary - 1])) {
		boundary = previousCodePointBoundary(value, boundary);
	}
	return boundary;
}

export function nextWordBoundary(value: string, offset: number): number {
	const safeOffset = Math.max(0, Math.min(offset, value.length));
	if (wordSegmenter) {
		const segments = Array.from(wordSegmenter.segment(value));
		let index = segments.findIndex((segment) =>
			segment.index + segment.segment.length > safeOffset
		);
		while (
			index >= 0 &&
			index < segments.length &&
			/^\s+$/.test(segments[index].segment)
		) {
			index += 1;
		}
		const segment = segments[index];
		return segment ? segment.index + segment.segment.length : value.length;
	}

	let boundary = safeOffset;
	while (boundary < value.length && /\s/.test(value[boundary])) {
		boundary = nextCodePointBoundary(value, boundary);
	}
	while (boundary < value.length && !/\s/.test(value[boundary])) {
		boundary = nextCodePointBoundary(value, boundary);
	}
	return boundary;
}

export function stringSplice(
	str: string,
	start: number,
	end: number,
	add: string,
) {
	return str.slice(0, start) + (add || "") + str.slice(end);
}

export function getTokenElement(id: string): HTMLElement | undefined {
	if (typeof document === "undefined") {
		return;
	}

	const escapedId = typeof CSS !== "undefined" && CSS.escape
		? CSS.escape(id)
		: id.replace(/["\\]/g, "\\$&");
	return document.querySelector<HTMLElement>(`[data-ep="${escapedId}"]`) ||
		undefined;
}

export function getTextNode(id: string): Node | undefined {
	const element = getTokenElement(id);
	const textNode = Array.from(element?.childNodes || [])
		.find((node) => node.nodeType === Node.TEXT_NODE);

	return textNode || element;
}

function caretPoint(id: string, offset: number): [Node, number] | undefined {
	const node = getTextNode(id);
	if (!node) {
		return;
	}

	const maxOffset = node.nodeType === Node.TEXT_NODE
		? node.textContent?.length || 0
		: node.nodeName === "BR"
		? 0
		: node.childNodes.length;

	return [node, Math.max(0, Math.min(offset, maxOffset))];
}

export function setCaret(
	first: string,
	firstOffset: number,
	last: string = first,
	lastOffset: number = firstOffset,
) {
	const sel = globalThis.getSelection?.();
	const firstPoint = caretPoint(first, firstOffset);
	const lastPoint = caretPoint(last, lastOffset);

	if (!sel || !firstPoint || !lastPoint) {
		return;
	}

	if (typeof sel.setBaseAndExtent === "function") {
		sel.setBaseAndExtent(...firstPoint, ...lastPoint);
	} else {
		const range = document.createRange();
		range.setStart(...firstPoint);
		range.setEnd(...lastPoint);
		sel.removeAllRanges();
		sel.addRange(range);
	}

	const focusElement = lastPoint[0].nodeType === Node.ELEMENT_NODE
		? lastPoint[0] as Element
		: lastPoint[0].parentElement;
	const editor = focusElement?.closest<HTMLElement>("[data-ep-main]");
	if (editor) {
		scheduleCaretReveal(editor);
	}
}

const caretRevealFrames = new WeakMap<HTMLElement, number>();
const iosKeyboardAccessoryHeight = 56;

export function softwareKeyboardAccessoryInset(
	layoutHeight: number,
	viewportHeight: number,
	touchPoints: number,
): number {
	return touchPoints > 0 && layoutHeight - viewportHeight >= 80
		? iosKeyboardAccessoryHeight
		: 0;
}

export function safeAreaInsetTop(): number {
	if (!globalThis.document?.body) {
		return 0;
	}
	const probe = document.createElement("div");
	probe.style.cssText =
		"position:fixed;visibility:hidden;pointer-events:none;padding-top:env(safe-area-inset-top)";
	document.body.append(probe);
	const inset = Number.parseFloat(getComputedStyle(probe).paddingTop) || 0;
	probe.remove();
	return inset;
}

/**
 * Reveal a restored model caret only when it is actually outside a scrollport.
 * Model-backed input restores the DOM selection after every edit; calling
 * `scrollIntoView` there synchronously walks every ancestor and lets mobile
 * WebKit pan the document on every keystroke.
 */
function scheduleCaretReveal(editor: HTMLElement) {
	const requestFrame = globalThis.requestAnimationFrame;
	if (!requestFrame) {
		return;
	}
	const previousFrame = caretRevealFrames.get(editor);
	if (previousFrame !== undefined) {
		globalThis.cancelAnimationFrame?.(previousFrame);
	}
	const frame = requestFrame(() => {
		caretRevealFrames.delete(editor);
		if (!editor.isConnected || document.activeElement !== editor) {
			return;
		}

		const selection = globalThis.getSelection?.();
		if (
			!selection?.isCollapsed ||
			!selection.rangeCount ||
			!selection.focusNode ||
			!editor.contains(selection.focusNode)
		) {
			return;
		}

		const gap = 4;
		const revealDelta = (top: number, bottom: number) => {
			const caret = selection.getRangeAt(0).getBoundingClientRect();
			if (caret.bottom > bottom - gap) {
				return caret.bottom - bottom + gap;
			}
			if (caret.top < top + gap) {
				return caret.top - top - gap;
			}
			return 0;
		};

		const scrollingElement = document.scrollingElement;
		for (
			let element: HTMLElement | null = editor;
			element;
			element = element.parentElement
		) {
			if (
				element === scrollingElement ||
				element === document.body ||
				element === document.documentElement ||
				element.scrollHeight <= element.clientHeight + 1
			) {
				continue;
			}
			const overflowY = getComputedStyle(element).overflowY;
			if (!/^(?:auto|overlay|scroll)$/.test(overflowY)) {
				continue;
			}

			const bounds = element.getBoundingClientRect();
			element.scrollTop += revealDelta(bounds.top, bounds.bottom);
		}

		const viewport = globalThis.visualViewport;
		const viewportTop = viewport?.offsetTop ?? 0;
		const viewportBottom = viewportTop +
			(viewport?.height ?? globalThis.innerHeight) -
			softwareKeyboardAccessoryInset(
				globalThis.innerHeight,
				viewport?.height ?? globalThis.innerHeight,
				globalThis.navigator?.maxTouchPoints ?? 0,
			);
		const documentDelta = revealDelta(viewportTop, viewportBottom);
		if (documentDelta !== 0) {
			if (scrollingElement) {
				scrollingElement.scrollTop += documentDelta;
			} else {
				globalThis.scrollBy?.(0, documentDelta);
			}
		}
	});
	caretRevealFrames.set(editor, frame);
}

export function setMarkdownBoundaryCaret(
	id: string,
	side: "before" | "after",
) {
	const element = getTokenElement(id);
	const selection = globalThis.getSelection?.();
	if (!element || !selection) {
		return;
	}

	const markers = Array.from(
		element.querySelectorAll<HTMLElement>(
			`:scope > [data-ep-md-marker][data-ep-md-side="${side}"]`,
		),
	);
	const marker = side === "before" ? markers[0] : markers[markers.length - 1];
	if (!marker || marker.parentNode !== element) {
		setCaret(id, side === "before" ? 0 : element.textContent?.length || 0);
		return;
	}

	const markerIndex = Array.from(element.childNodes).indexOf(marker);
	if (markerIndex < 0) {
		return;
	}

	const offset = markerIndex + (side === "after" ? 1 : 0);
	if (typeof selection.setBaseAndExtent === "function") {
		selection.setBaseAndExtent(element, offset, element, offset);
		return;
	}

	const range = document.createRange();
	range.setStart(element, offset);
	range.collapse(true);
	selection.removeAllRanges();
	selection.addRange(range);
}

export function setInlineMarkdownCaret(
	blockId: string,
	sourceOffset: number,
) {
	const block = getTokenElement(blockId);
	const selection = globalThis.getSelection?.();
	if (!block || !selection) {
		return;
	}

	const pointIn = (
		element: HTMLElement,
	): [Node, number] | undefined => {
		const start = Number(element.dataset.epSourceStart);
		const end = Number(element.dataset.epSourceEnd);
		if (
			!Number.isFinite(start) ||
			!Number.isFinite(end) ||
			sourceOffset < start ||
			sourceOffset > end
		) {
			return;
		}

		const textNode = Array.from(element.childNodes).find((node) =>
			node.nodeType === Node.TEXT_NODE
		);
		if (!textNode) {
			return;
		}
		const visibleLength = textNode.textContent === "\u200B"
			? 0
			: textNode.textContent?.length || 0;
		return [
			textNode,
			Math.max(0, Math.min(sourceOffset - start, visibleLength)),
		];
	};

	const markers = Array.from(
		block.querySelectorAll<HTMLElement>("[data-ep-md-marker]"),
	);
	const point = markers.map(pointIn).find(Boolean) ||
		Array.from(
			block.querySelectorAll<HTMLElement>(
				"[data-ep-source-start]:not([data-ep-md-marker])",
			),
		).map(pointIn).find(Boolean);
	if (!point) {
		return;
	}

	if (typeof selection.setBaseAndExtent === "function") {
		selection.setBaseAndExtent(...point, ...point);
		return;
	}

	const range = document.createRange();
	range.setStart(...point);
	range.collapse(true);
	selection.removeAllRanges();
	selection.addRange(range);
}

export function setCodeFenceCaret(
	blockId: string,
	side: "end" | "start",
	offset: number,
) {
	const block = getTokenElement(blockId);
	const selection = globalThis.getSelection?.();
	const marker = block?.querySelector<HTMLElement>(
		`[data-ep-code-fence-side="${side}"]`,
	);
	const textNode = marker?.firstChild;
	if (
		!selection ||
		!textNode ||
		textNode.nodeType !== Node.TEXT_NODE
	) {
		return;
	}

	const point: [Node, number] = [
		textNode,
		Math.max(0, Math.min(offset, textNode.textContent?.length || 0)),
	];
	if (typeof selection.setBaseAndExtent === "function") {
		selection.setBaseAndExtent(...point, ...point);
		return;
	}

	const range = document.createRange();
	range.setStart(...point);
	range.collapse(true);
	selection.removeAllRanges();
	selection.addRange(range);
}

export function cloneToken<T = AnyToken>(token: T): T {
	return JSON.parse(JSON.stringify(token), (key, value) => {
		if (value.type && value?.id) {
			return {
				...value,
				id: ranID(),
			};
		}

		return value;
	});
}
