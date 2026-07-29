import { useStore } from "exome/preact";
import { createContext, h } from "preact";
import type { Context, HTMLAttributes, RefObject, VNode } from "preact";
import {
	useContext,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "preact/hooks";

import type { AnyToken, BlockToken, InlineToken, TextToken } from "./tokens.ts";
import { isBlockToken } from "./tokens.ts";
import { ACTION, Model as EditorModel } from "./model.ts";
import type { MarkdownBoundary } from "./selection.ts";
import { RenderImage } from "./plugin/image.tsx";
import { RenderAttachment } from "./plugin/attachment.tsx";
import { RenderUrl } from "./plugin/url.tsx";
import { FloatingToolbar } from "./floating-toolbar.tsx";
import { SlashDropdown } from "./slash-dropdown.tsx";
import { inlineMarkdownAffixes, type MarkdownMarker } from "./markdown.ts";
import {
	codeFenceMarker,
	inlineTokensToMarkdown,
	toMarkdown,
} from "./markdown-parser.ts";
import {
	nextGraphemeBoundary,
	previousGraphemeBoundary,
	setCodeFenceCaret,
	setInlineMarkdownCaret,
} from "./utils.ts";
import type { EditpalExtensions } from "./extensions.ts";
import { MentionDropdown } from "./mention-dropdown.tsx";

export const Model = EditorModel;
export type { UpdateAssetData } from "./model.ts";
/**
 * URL of the stylesheet matching the installed package version.
 *
 * Use this when a runtime cannot import the `style.css` package subpath
 * directly, such as a browser application loading Editpal from JSR.
 */
export const stylesheetUrl: URL = new URL("./style.css", import.meta.url);
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
	AttachmentToken,
	BlockToken,
	InlineToken,
	JsonValue,
	MentionData,
	TextToken,
	TokenRoot,
} from "./tokens.ts";
export type {
	AttachmentConfig,
	EditpalExtensions,
	InlineIntegration,
	LineEmbed,
	LinkEditor,
	MentionConfig,
	MentionSuggestion,
	SlashCommand,
	UploadedAttachment,
} from "./extensions.ts";

function RenderText(
	item: TextToken & {
		k: string;
		markdownAfter?: PositionedMarkdownMarker[];
		markdownBefore?: PositionedMarkdownMarker[];
		sourceEnd?: number;
		sourceStart?: number;
	},
) {
	const { activeId, extensions, model } = useContext(EditorContext);
	if (item.props?.url) {
		return <RenderUrl {...item} key={item.id} />;
	}
	if (item.props?.link) {
		const integration = extensions?.inlineIntegrations?.map((definition) => ({
			definition,
			match: definition.match(item.props.link || "", item),
		})).find(({ match }) => Boolean(match));
		if (integration?.match) {
			const context = {
				match: integration.match,
				model,
				token: item,
			};
			return (
				<span
					contentEditable={false}
					data-ep={item.id}
					data-ep-inline-integration={integration.definition.id}
					data-ep-selectable="inline-embed"
					data-ep-s={activeId === item.id || undefined}
					aria-label={integration.definition.ariaLabel?.(context)}
					onClick={preventSelectableLinkActivation}
				>
					{integration.definition.render(context)}
				</span>
			);
		}
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
		mention,
		markdownEscape: _markdownEscape,
		typingBoundary: _typingBoundary,
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
			data-ep-mention={mention?.configId}
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
			{mention
				? (
					<span contentEditable={false} data-ep-mention-content>
						{extensions?.mentions?.find(({ id }) => id === mention.configId)
							?.renderMention?.({ mention, text }) ?? text}
					</span>
				)
				: text || "\u200B"}
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
		codeFence?: string;
		codeStart?: boolean;
		k: string;
		markdownAfter?: PositionedMarkdownMarker[];
		markdownBefore?: PositionedMarkdownMarker[];
		sourceEnd?: number;
		sourceStart?: number;
	},
) {
	const { mode, model } = useContext(EditorContext);

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
		const { indent, start, type, ...style } = item.props || {};

		return (
			<li
				key={item.id}
				style={{
					...style,
					counterReset: type === "ol" && !indent && start
						? `list-number ${Math.max(0, start - 1)}`
						: undefined,
				}}
				data-ep={item.id}
				data-ep-l={type || "ul"}
				data-ep-i={indent}
				data-ep-list-start={start}
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
		const fence = item.codeFence || "```";
		const opening = `${fence}${language || ""}`;
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
				{mode === "markdown" && item.codeStart && (
					<span
						data-ep-code-fence
						data-ep-code-fence-side="start"
						data-ep-md-key="codeFence"
						data-ep-md-marker
						data-ep-md-side="before"
						data-ep-source-end={opening.length}
						data-ep-source-start={0}
					>
						{opening}
					</span>
				)}
				<code>
					<RenderMap items={item.children} />
				</code>
				{mode === "markdown" && item.codeEnd && (
					<span
						data-ep-code-fence
						data-ep-code-fence-side="end"
						data-ep-md-key="codeFence"
						data-ep-md-marker
						data-ep-md-side="after"
						data-ep-source-end={fence.length}
						data-ep-source-start={0}
					>
						{fence}
					</span>
				)}
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

	if (item.type === "attachment") {
		return <RenderAttachment item={item} key={item.id} />;
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

	const { activeId, extensions, mode, model } = useContext(EditorContext);
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
		let codeFence: string | undefined;
		if (item.type === "code") {
			let codeStart = index;
			let codeEnd = index;
			while (items[codeStart - 1]?.type === "code") {
				codeStart -= 1;
			}
			while (items[codeEnd + 1]?.type === "code") {
				codeEnd += 1;
			}
			const code = items.slice(codeStart, codeEnd + 1).map((entry) =>
				entry.type === "code"
					? entry.children.map((child) =>
						child.type === "t"
							? child.text
							: child.type === "img"
							? child.props.alt || ""
							: child.src
					).join("")
					: ""
			).join("\n");
			codeFence = codeFenceMarker(code);
		}

		const rendered = (
			<RenderItem
				{...item}
				codeEnd={item.type === "code" && next?.type !== "code"}
				codeFence={codeFence}
				codeStart={item.type === "code" && previous?.type !== "code"}
				k={item.key}
				key={item.id}
				markdownBefore={markdownBefore}
				markdownAfter={markdownAfter}
				sourceEnd={sourceEnd}
				sourceStart={sourceStart}
			/>
		);
		if (
			!isBlockToken(item) ||
			item.type === "code" ||
			!extensions?.lineEmbeds?.length
		) {
			return rendered;
		}

		const source = toMarkdown([item]);
		for (const embed of extensions.lineEmbeds) {
			const match = embed.match(source, item);
			if (!match) {
				continue;
			}
			return (
				<div
					data-ep-line-with-embed
					data-ep-line-replaced={embed.replaceLine || undefined}
					key={`embed-${item.id}-${embed.id}`}
				>
					{rendered}
					<div
						contentEditable={false}
						data-ep={item.id}
						data-ep-line-embed={embed.id}
						data-ep-selectable="line-embed"
						data-ep-s={activeId === item.id || undefined}
						onClick={preventSelectableLinkActivation}
					>
						{embed.render({ block: item, match, model })}
					</div>
				</div>
			);
		}
		return rendered;
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

export function preventSelectableLinkActivation(event: MouseEvent) {
	if (
		event.metaKey ||
		event.ctrlKey ||
		event.altKey ||
		event.shiftKey ||
		!(event.target instanceof Element) ||
		!event.target.closest("a[href]")
	) {
		return;
	}
	preventDefaultAndStop(event);
}

/** Properties accepted by the {@link Editpal} component. */
export interface EditpalProps {
	/** Editor state shared with the component. */
	model: EditorModel;
	/** Editing presentation. Defaults to `"markdown"`. */
	mode?: EditpalMode;
	/** Opt-in mentions, integrations, line embeds, and uploads. */
	extensions?: EditpalExtensions;
	/** Called after the model document changes. */
	onChange?: (markdown: string, model: EditorModel) => void;
	/** Prevent document mutation while retaining selection and copying. */
	readOnly?: boolean;
	/** Disable editing and remove the editor from the tab order. */
	disabled?: boolean;
	/** Hint shown when the document is empty. */
	placeholder?: string;
	/** Accessible name for the editable surface. */
	ariaLabel?: string;
	/** Class applied to the editable surface. */
	className?: string;
	/** DOM id applied to the editable surface. */
	id?: string;
	/** Inline style applied to the editable surface. */
	style?: HTMLAttributes<HTMLDivElement>["style"];
	/** Additional native attributes applied before Editpal's managed handlers. */
	editorProps?: HTMLAttributes<HTMLDivElement>;
	/** Submit the Markdown value with a native HTML form. */
	name?: string;
	/** Associate the hidden form value with a form element by id. */
	form?: string;
	/** Mark the editor and its native form value as required. */
	required?: boolean;
	/** Maximum serialized Markdown length. */
	maxLength?: number;
	/** Called when an insertion would exceed `maxLength`. */
	onLimitExceeded?: (maxLength: number, model: EditorModel) => void;
}

/**
 * Available editable presentations.
 *
 * `"markdown"` displays editable Markdown markers, while `"basic"` hides the
 * markers without disabling editing.
 */
export type EditpalMode = "basic" | "markdown";

function increment(i: number) {
	return i + 1;
}

interface EditorContextValue {
	model: EditorModel;
	editor: RefObject<HTMLDivElement>;
	mode: EditpalMode;
	extensions?: EditpalExtensions;
	editable: boolean;
	activeId?: string;
	setActiveId(id?: string): void;
	replaceAsset(id: string, file: File): Promise<void>;
}

export const EditorContext: Context<EditorContextValue> = createContext<
	EditorContextValue
>({} as EditorContextValue);

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

	const nodeElement = node instanceof Element ? node : node.parentElement;
	const codeFence = nodeElement?.closest<HTMLElement>(
		"[data-ep-code-fence]",
	);
	if (token?.type === "code" && codeFence) {
		const side = codeFence.dataset.epCodeFenceSide;
		const textChildren = token.children.filter(
			(child): child is TextToken => child.type === "t",
		);
		const boundaryText = side === "start"
			? textChildren[0]
			: textChildren[textChildren.length - 1];
		if (boundaryText) {
			return pointAtInline(
				boundaryText,
				side === "end" ? boundaryText.text.length : 0,
			);
		}
	}

	if (token && !isBlockToken(token)) {
		if (
			token.type === "t" &&
			(tokenElement?.matches("[data-ep-inline-integration]") ||
				nodeElement?.closest("[data-ep-mention-content]"))
		) {
			return pointAtInline(token, offset > 0 ? token.text.length : 0);
		}
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

function markdownMarkerAtEdge(
	node: Node | undefined,
	backward: boolean,
): HTMLElement | undefined {
	if (!node) {
		return;
	}
	const direct = markerElement(node);
	if (direct) {
		return direct;
	}
	if (node.nodeType === Node.TEXT_NODE) {
		return;
	}

	const children = Array.from(node.childNodes);
	return markdownMarkerAtEdge(
		backward ? children[children.length - 1] : children[0],
		backward,
	);
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

	let current: Node = node;
	if (node.nodeType === Node.TEXT_NODE) {
		const textLength = node.textContent?.length || 0;
		if ((backward && offset !== 0) || (!backward && offset !== textLength)) {
			return;
		}
	} else {
		const children = Array.from(node.childNodes);
		const adjacent = backward ? children[offset - 1] : children[offset];
		if (adjacent) {
			return markdownMarkerAtEdge(adjacent, backward);
		}
		if (
			(backward && offset !== 0) ||
			(!backward && offset !== children.length)
		) {
			return;
		}
	}

	while (current.parentNode) {
		const parent = current.parentNode;
		if (
			parent instanceof HTMLElement &&
			parent.matches("[data-ep-main]")
		) {
			return;
		}

		const siblings = Array.from(parent.childNodes);
		const index = siblings.findIndex((sibling) => sibling === current);
		const adjacent = backward ? siblings[index - 1] : siblings[index + 1];
		if (adjacent) {
			return markdownMarkerAtEdge(adjacent, backward);
		}
		current = parent;
	}
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

/**
 * Render an interactive Markdown editor backed by an Editpal {@link Model}.
 *
 * The model owns document content, selection, formatting, and history, so it
 * may be retained outside the component and serialized with {@link toMarkdown}.
 */
export function Editpal(
	{
		ariaLabel,
		className,
		disabled = false,
		editorProps,
		extensions,
		form,
		id,
		maxLength,
		mode = "markdown",
		model,
		name,
		onChange,
		onLimitExceeded,
		placeholder,
		readOnly = false,
		required = false,
		style,
	}: EditpalProps,
): VNode {
	const { tokens, _stack, action, selection } = useStore(model);
	const ref = useRef<HTMLDivElement>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const uploadControllers = useRef(new Set<AbortController>());
	const onChangeRef = useRef(onChange);
	const committedCompositionRef = useRef<string | null>(null);
	const [focus, setFocus] = useState(0);
	const [reload, setReload] = useState(0);
	const [activeId, setActiveId] = useState<string>();
	const editable = !disabled && !readOnly;
	const markdown = toMarkdown(tokens);

	useEffect(() => {
		onChangeRef.current = onChange;
	}, [onChange]);

	useEffect(() => {
		onChangeRef.current?.(markdown, model);
	}, [markdown, model]);

	useEffect(() => {
		return () => {
			for (const controller of uploadControllers.current) {
				controller.abort();
			}
			uploadControllers.current.clear();
		};
	}, []);

	useLayoutEffect(() => {
		_stack.splice(0).pop()?.();
	});

	function activeSelectableId(): string | undefined {
		return activeId;
	}

	function insertText(
		text: string,
		type: typeof ACTION._Compose | typeof ACTION._Key = ACTION._Key,
	): boolean {
		if (maxLength !== undefined && text) {
			const selectedLength = model.selectedText().length;
			const projected = markdown.length - selectedLength + text.length;
			if (projected > maxLength) {
				onLimitExceeded?.(maxLength, model);
				return false;
			}
		}
		const selectedId = activeSelectableId();
		if (selectedId) {
			model.replaceSelectable(selectedId, text);
			setActiveId(undefined);
			return true;
		}
		if (activeId) {
			setActiveId(undefined);
		}
		action(type, text);
		return true;
	}

	function normalizedPastedUrl(text: string): string | undefined {
		const value = text.trim();
		if (!value || /\s/.test(value)) {
			return;
		}
		try {
			const url = new URL(value);
			return url.protocol === "http:" || url.protocol === "https:"
				? value
				: undefined;
		} catch {
			return;
		}
	}

	function placeCaretAfterPastedLink(link: TextToken) {
		const parent = model.parent(link.key);
		const isLineEmbed = parent &&
			extensions?.lineEmbeds?.some((definition) =>
				Boolean(definition.match(toMarkdown([parent]), parent))
			);
		if (!parent || !isLineEmbed) {
			model.placeCaretAfter(link.id);
			return;
		}
		const blockIndex = model.tokens.indexOf(parent);
		const nextBlock = model.tokens[blockIndex + 1];
		if (nextBlock?.children[0]) {
			model.select(nextBlock.children[0], 0);
			return;
		}
		model.placeCaretAfter(link.id);
		action(ACTION._Enter);
	}

	function pasteLinkOverSelection(url: string): boolean {
		if (model.selectionTouchesCodeBlock) {
			return false;
		}
		const { first, last } = model.selection;
		if (first[0] === last[0] && first[1] === last[1]) {
			return false;
		}
		action(ACTION._FormatAdd, ["link", url]);
		const lastLink = model.keysBetween(
			model.selection.first[0],
			model.selection.last[0],
		).map((key) => model.findElement(key)).reverse().find(
			(token): token is TextToken =>
				token?.type === "t" && token.props.link === url,
		);
		if (lastLink) {
			placeCaretAfterPastedLink(lastLink);
		}
		return true;
	}

	function pasteLinkAtCaret(url: string): boolean {
		if (model.selectionTouchesCodeBlock) {
			return false;
		}
		const { first, last } = model.selection;
		if (first[0] !== last[0] || first[1] !== last[1]) {
			return false;
		}
		const startElement = model.findElement(first[0]);
		const startId = startElement?.id;
		const startOffset = first[1];
		if (!startId || !insertText(url)) {
			return true;
		}

		const startKey = model._idToKey[startId];
		const [endKey, endOffset] = model.selection.first;
		if (!startKey) {
			return true;
		}
		model.selection.setSelection(
			startKey,
			startOffset,
			endKey,
			endOffset,
		);
		action(ACTION._FormatAdd, ["link", url]);

		const lastLink = model.keysBetween(
			model.selection.first[0],
			model.selection.last[0],
		).map((key) => model.findElement(key)).reverse().find((token) =>
			token?.type === "t" && token.props.link === url
		);
		if (lastLink?.type === "t") {
			placeCaretAfterPastedLink(lastLink);
		}
		return true;
	}

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
			const selectedMarker = domCollapsed ? markerElement(first) : undefined;
			if (selectedMarker) {
				const sourcePoint = markdownSourcePoint(
					model,
					first,
					anchorOffset,
				);
				if (sourcePoint) {
					const codeFenceSide = selectedMarker.dataset.epCodeFenceSide;
					_stack.push(() => {
						if (
							codeFenceSide === "start" ||
							codeFenceSide === "end"
						) {
							setCodeFenceCaret(
								sourcePoint.block.id,
								codeFenceSide,
								sourcePoint.offset,
							);
							return;
						}
						setInlineMarkdownCaret(
							sourcePoint.block.id,
							sourcePoint.offset,
						);
					});
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
		const mentionElement = event.target instanceof Element
			? event.target.closest<HTMLElement>("[data-ep-mention]")
			: undefined;
		const mentionId = mentionElement?.dataset.ep;
		const mentionToken = mentionId
			? model.findElement(model._idToKey[mentionId])
			: undefined;
		if (
			mentionElement &&
			mentionToken?.type === "t" &&
			mentionToken.props.mention
		) {
			preventDefaultAndStop(event);
			ref.current?.focus({ preventScroll: true });
			const rect = mentionElement.getBoundingClientRect();
			if (event.clientX < rect.left + rect.width / 2) {
				model.placeCaretBefore(mentionToken.id);
			} else {
				model.placeCaretAfter(mentionToken.id);
			}
			return;
		}
		const selectable = event.target instanceof Element
			? event.target.closest<HTMLElement>("[data-ep-selectable]")
			: undefined;
		if (selectable) {
			preventDefaultAndStop(event);
			ref.current?.focus({ preventScroll: true });
			const id = selectable.dataset.ep;
			if (id) {
				setActiveId(id);
				const token = model.findElement(model._idToKey[id]);
				const selectableToken = token && isBlockToken(token)
					? token.children.find((child) =>
						child.type === "url" ||
						(child.type === "t" &&
							Boolean(child.props.link || child.props.url))
					)
					: token;
				if (selectableToken && !isBlockToken(selectableToken)) {
					model.select(selectableToken, 0);
					model.selection.setFormat(
						selectableToken.type === "t" ? selectableToken.props : {},
					);
				}
			}
		} else {
			setActiveId(undefined);
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
		// During contenteditable reconciliation, WebKit can briefly collapse the
		// native selection onto the editor root at offset zero. Treating that
		// transient range as user intent moves the model caret to the document
		// start, so the next mobile beforeinput inserts in the wrong place.
		// Pointer selection is resolved directly by onSelect; asynchronous
		// selectionchange events should only replace the model selection once
		// both endpoints have returned to rendered token content.
		if (
			domSelection.anchorNode === ref.current ||
			domSelection.focusNode === ref.current
		) {
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
			event.relatedTarget.closest(".e-fl-drop, .e-fl-toolbar")
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

	async function uploadFile(file: File) {
		const config = extensions?.attachments;
		if (!config || !editable) {
			return;
		}
		if (config.maxSize !== undefined && file.size > config.maxSize) {
			config.onError?.(
				new RangeError(
					`${file.name} exceeds the ${config.maxSize} byte attachment limit`,
				),
				file,
			);
			return;
		}
		const controller = new AbortController();
		uploadControllers.current.add(controller);
		try {
			const uploaded = await config.upload(file, {
				model,
				reportProgress(progress) {
					config.onProgress?.(
						file,
						Math.max(0, Math.min(1, progress)),
					);
				},
				signal: controller.signal,
			});
			if (controller.signal.aborted) {
				return;
			}
			config.onUploaded?.(uploaded, file);
			return uploaded;
		} catch (error) {
			if (!controller.signal.aborted) {
				config.onError?.(error, file);
			}
		} finally {
			uploadControllers.current.delete(controller);
		}
	}

	async function uploadFiles(files: Iterable<File>) {
		if (model.selectionTouchesCodeBlock) {
			return;
		}
		for (const file of files) {
			const firstElement = model.findElement(model.selection.first[0]);
			const lastElement = model.findElement(model.selection.last[0]);
			const bookmark = {
				firstId: firstElement?.id,
				firstOffset: model.selection.first[1],
				lastId: lastElement?.id,
				lastOffset: model.selection.last[1],
			};
			const uploaded = await uploadFile(file);
			if (!uploaded) {
				continue;
			}
			const firstKey = bookmark.firstId
				? model._idToKey[bookmark.firstId]
				: undefined;
			const lastKey = bookmark.lastId
				? model._idToKey[bookmark.lastId]
				: undefined;
			if (firstKey && lastKey) {
				model.selection.setSelection(
					firstKey,
					bookmark.firstOffset,
					lastKey,
					bookmark.lastOffset,
				);
			}
			model.insertAttachment(uploaded);
			if (uploaded.kind === "image" || uploaded.kind === "video") {
				model.action(ACTION._Enter);
			}
		}
	}

	async function replaceAsset(id: string, file: File) {
		const uploaded = await uploadFile(file);
		if (!uploaded) {
			return;
		}
		model.updateAsset(id, uploaded);
		setActiveId(id);
	}

	function onDrop(event: DragEvent) {
		preventDefaultAndStop(event);

		onSelect(event);
		const files = event.dataTransfer?.files;
		if (files?.length && extensions?.attachments) {
			void uploadFiles(files);
			return;
		}

		const text = event.dataTransfer?.getData("text/plain");
		if (text && editable) {
			model.history.batch();
			insertText(text);
			model.history.batch();
		}
	}

	function onTodoClick(event: MouseEvent) {
		if (!editable) {
			return;
		}
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
		// Safari may start the composition before its preceding selectionchange
		// is delivered. Capture the visible caret before selection syncing is
		// suspended for the temporary composition DOM.
		onSelectionChange();
		committedCompositionRef.current = null;
		model._isComposing = true;
	}

	function onCompositionEnd(e: CompositionEvent) {
		const fn = () => {
			model._isComposing = false;
			committedCompositionRef.current = e.data;
			if (e.data) {
				insertText(e.data, ACTION._Compose);
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
		if (
			text &&
			maxLength !== undefined &&
			markdown.length - model.selectedText().length + text.length > maxLength
		) {
			onLimitExceeded?.(maxLength, model);
			return true;
		}
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
		let activeMarker = markerElement(domSelection.anchorNode) ||
			markerElement(domSelection.focusNode);
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
			activeMarker = marker;

			const source = marker.matches("[data-ep-code-fence]")
				? marker.textContent || ""
				: inlineTokensToMarkdown(anchor.block.children);
			if (direction === "backward") {
				start = previousGraphemeBoundary(source, start);
			} else if (direction === "forward") {
				end = nextGraphemeBoundary(source, end);
			}
		} else if (!selectionTouchesMarkdownMarker(domSelection)) {
			return false;
		}

		const codeFence = activeMarker?.closest<HTMLElement>(
			"[data-ep-code-fence]",
		);
		const codeFenceSide = codeFence?.dataset.epCodeFenceSide;
		if (
			codeFence &&
			(codeFenceSide === "start" || codeFenceSide === "end")
		) {
			action(ACTION._EditCodeFence, {
				blockId: anchor.block.id,
				end,
				side: codeFenceSide,
				start,
				text,
			});
			return true;
		}

		action(ACTION._EditMarkdown, {
			blockId: anchor.block.id,
			end,
			start,
			text,
		});
		return true;
	}

	function enterSelectedCodeFence(): boolean {
		const domSelection = document.getSelection();
		if (
			mode !== "markdown" ||
			!domSelection?.isCollapsed ||
			!domSelection.anchorNode
		) {
			return false;
		}

		const marker = markerElement(domSelection.anchorNode);
		const codeFence = marker?.closest<HTMLElement>(
			"[data-ep-code-fence]",
		);
		const side = codeFence?.dataset.epCodeFenceSide;
		const sourcePoint = markdownSourcePoint(
			model,
			domSelection.anchorNode,
			domSelection.anchorOffset,
		);
		if (
			!sourcePoint ||
			sourcePoint.block.type !== "code" ||
			(side !== "start" && side !== "end")
		) {
			return false;
		}

		action(ACTION._EnterCodeFence, {
			blockId: sourcePoint.block.id,
			side,
		});
		return true;
	}

	function onBeforeInput(event: InputEvent) {
		if (!editable) {
			preventDefaultAndStop(event);
			return;
		}
		if (event.isComposing || model._isComposing) {
			return;
		}
		if (
			event.inputType === "insertFromComposition" &&
			committedCompositionRef.current !== null
		) {
			// Some engines report the composition commit again after
			// compositionend. The model already accepted that native commit.
			committedCompositionRef.current = null;
			preventDefaultAndStop(event);
			return;
		}
		committedCompositionRef.current = null;
		// A selected atomic element can have a browser caret immediately beside
		// its contenteditable=false DOM. Preserve the explicit model selection;
		// otherwise reconcile from the visible native caret.
		if (!activeSelectableId()) {
			onSelectionChange();
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
						insertText(event.data);
					}
				}
				return;
			case "insertParagraph":
			case "insertLineBreak":
				preventDefaultAndStop(event);
				if (!enterSelectedCodeFence()) {
					action(ACTION._Enter);
				}
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
				insertText(text);
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

	function moveAcrossMention(direction: "left" | "right"): boolean {
		const [firstKey, firstOffset] = model.selection.first;
		const [lastKey, lastOffset] = model.selection.last;
		if (firstKey !== lastKey || firstOffset !== lastOffset) {
			return false;
		}

		const current = model.findElement(firstKey);
		if (current?.type !== "t") {
			return false;
		}
		if (current.props.mention) {
			if (direction === "left") {
				model.placeCaretBefore(current.id);
			} else {
				model.placeCaretAfter(current.id);
			}
			return true;
		}

		const parent = model.parent(current.key);
		if (!parent) {
			return false;
		}
		const index = parent.children.indexOf(current);
		const adjacent = direction === "left" && firstOffset === 0
			? parent.children[index - 1]
			: direction === "right" && firstOffset === current.text.length
			? parent.children[index + 1]
			: undefined;
		if (adjacent?.type !== "t" || !adjacent.props.mention) {
			return false;
		}

		if (direction === "left") {
			model.placeCaretBefore(adjacent.id);
		} else {
			model.placeCaretAfter(adjacent.id);
		}
		return true;
	}

	return (
		<EditorContext.Provider
			value={{
				model,
				editor: ref,
				mode,
				editable,
				extensions,
				activeId,
				setActiveId,
				replaceAsset,
			}}
		>
			<FloatingToolbar />
			<SlashDropdown />
			<MentionDropdown />

			{extensions?.attachments &&
				extensions.attachments.pickerLabel !== false && (
				<div className="e-attachment-picker">
					<button
						type="button"
						disabled={!editable}
						onClick={() => {
							if (!model.selectionTouchesCodeBlock) {
								fileInputRef.current?.click();
							}
						}}
					>
						{extensions.attachments.pickerLabel || "Attach files"}
					</button>
					<input
						ref={fileInputRef}
						type="file"
						hidden
						accept={extensions.attachments.accept}
						multiple={extensions.attachments.multiple !== false}
						onChange={(event) => {
							const files = event.currentTarget.files;
							if (files) {
								void uploadFiles(files);
							}
							event.currentTarget.value = "";
						}}
					/>
				</div>
			)}

			<div
				{...editorProps}
				ref={ref}
				id={id || editorProps?.id}
				className={[editorProps?.className, className].filter(Boolean).join(
					" ",
				) ||
					undefined}
				style={style || editorProps?.style}
				contentEditable={editable}
				tabIndex={disabled ? -1 : 0}
				role="textbox"
				aria-label={ariaLabel || editorProps?.["aria-label"] ||
					"Markdown editor"}
				aria-multiline="true"
				aria-readonly={readOnly || undefined}
				aria-disabled={disabled || undefined}
				aria-required={required || undefined}
				data-ep-placeholder={placeholder}
				data-ep-empty={markdown.length === 0 || undefined}
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
					const copied = selectionTouchesMarkdownMarker(domSelection)
						? domSelection.toString()
						: model.selectedText();
					e.clipboardData?.setData("text/markdown", copied);
					e.clipboardData?.setData(
						"text/plain",
						copied,
					);
				}}
				onCut={(e) => {
					if (!editable) {
						preventDefaultAndStop(e);
						return;
					}
					const domSelection = document.getSelection();
					if (
						!domSelection ||
						domSelection.isCollapsed ||
						!ref.current?.contains(domSelection.anchorNode)
					) {
						return;
					}

					preventDefaultAndStop(e);
					const copied = selectionTouchesMarkdownMarker(domSelection)
						? domSelection.toString()
						: model.selectedText();
					e.clipboardData?.setData("text/markdown", copied);
					e.clipboardData?.setData(
						"text/plain",
						copied,
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
					if (!editable) {
						return;
					}
					// Firefox may defer `selectionchange` until after the paste event.
					// Capture the native range synchronously so async uploads retain
					// the user's actual insertion point in every browser.
					onSelectionChange();
					setActiveId(undefined);
					const files = e.clipboardData?.files;
					if (files?.length && extensions?.attachments) {
						void uploadFiles(files);
						return;
					}

					const text = e.clipboardData?.getData("text/plain") ||
						e.clipboardData?.getData("text") ||
						e.clipboardData?.getData("text/markdown") ||
						"";

					model.history.batch();

					const url = normalizedPastedUrl(text);
					if (
						url &&
						(pasteLinkOverSelection(url) || pasteLinkAtCaret(url))
					) {
						// The selection becomes the link label and the caret is placed
						// in a fresh text token after it.
					} else if (!editSelectedMarkdown(text)) {
						insertText(text);
					}

					model.history.batch();
				}}
				onKeyDown={(e) => {
					if (!editable) {
						return;
					}
					// Character interpretation belongs to the active keyboard layout.
					// During composition, leave every key to the browser and IME.
					if (e.isComposing || model._isComposing) {
						return;
					}
					// Native selection events can be deferred (notably in Firefox).
					// Reconcile the model with the caret the user can actually see
					// before applying any keyboard command.
					const selectedBeforeReconcile = activeSelectableId();
					if (!selectedBeforeReconcile) {
						onSelectionChange();
					}
					const primaryModifier = e.metaKey || e.ctrlKey;
					const key = e.key.toLowerCase();
					const selectedId = selectedBeforeReconcile ||
						activeSelectableId();
					if (activeId && !selectedId) {
						setActiveId(undefined);
					}

					if (
						selectedId &&
						(key === "backspace" || key === "delete") &&
						!primaryModifier &&
						!e.altKey
					) {
						preventDefaultAndStop(e);
						model.removeSelectable(selectedId);
						setActiveId(undefined);
						return;
					}

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
						if (key === "a") {
							preventDefaultAndStop(e);
							model.selectAll();
							return;
						}
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
						if (
							!primaryModifier &&
							!e.altKey &&
							!e.shiftKey &&
							(e.key === "ArrowLeft" || e.key === "ArrowRight") &&
							moveAcrossMention(
								e.key === "ArrowLeft" ? "left" : "right",
							)
						) {
							preventDefaultAndStop(e);
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
						if (!enterSelectedCodeFence()) {
							action(ACTION._Enter);
						}
						return;
					}

					if (e.key === "Delete") {
						preventDefault(e);
						action(ACTION._Delete);
						return;
					}

					// Printable text is handled by beforeinput, where the browser
					// provides layout-aware text after dead-key and IME processing.
					// Navigation, escape, function keys, and browser shortcuts retain
					// their native behavior.
				}}
				data-ep-main
				data-ep-mode={mode}
			>
				<RenderMap key={`root-${reload}`} items={tokens} />
			</div>
			{name && (
				<textarea
					aria-hidden="true"
					className="e-form-value"
					tabIndex={-1}
					readOnly
					name={name}
					form={form}
					required={required}
					disabled={disabled}
					value={markdown}
					onInvalid={() => ref.current?.focus()}
				/>
			)}
		</EditorContext.Provider>
	);
}
