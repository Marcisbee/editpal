import { Exome } from "exome";

import { HistoryStore } from "./history.ts";
import { type MarkdownBoundary, ModelSelection } from "./selection.ts";
import { Slash } from "./slash.ts";
import type {
	AnyToken,
	BlockToken,
	InlineToken,
	JsonValue,
	MentionData,
	TextToken,
	TokenRoot,
} from "./tokens.ts";
import { isBlockToken, isInlineToken, setBlockType } from "./tokens.ts";
import {
	cloneToken,
	nextGraphemeBoundary,
	nextWordBoundary,
	previousGraphemeBoundary,
	previousWordBoundary,
	ranID,
	setCaret,
	setCodeFenceCaret,
	setInlineMarkdownCaret,
	setMarkdownBoundaryCaret,
	snapGraphemeBoundary,
	stringSplice,
} from "./utils.ts";
import {
	createAttachmentToken,
	createBlockToken,
	createTextToken,
} from "./utils/create-token.ts";
import { buildKeys } from "./utils/selection.ts";
import {
	inlineMarkdownChunks,
	inlineTokensToMarkdown,
	markdownBaseProps,
	parseInlineMarkdown,
	parseInlineMarkdownDetailed,
	parseMarkdown,
	toMarkdown,
} from "./markdown-parser.ts";

export const ACTION = {
	_Key: 0,
	_Remove: 1,
	_Enter: 2,
	_Delete: 3,
	_Tab: 4,
	_ShiftTab: 5,
	_Compose: 6,
	_FormatAdd: 7,
	_FormatRemove: 8,
	_Undo: 9,
	_Redo: 10,
	_RemoveWord: 11,
	_DeleteWord: 12,
	_RemoveLine: 13,
	_DeleteLine: 14,
	_Todo: 15,
	_KeyMarkdownBoundary: 16,
	_RemoveMarkdownFormat: 17,
	_EditMarkdown: 18,
	_EditCodeFence: 19,
	_EnterCodeFence: 20,
	_InsertAttachment: 21,
	_InsertMention: 22,
	_UpdateImageAlt: 23,
	_RemoveSelectable: 24,
};

interface MarkdownFormatRegion {
	blockId: string;
	end: number;
	key: string;
	start: number;
	value: any;
}

interface RemoveMarkdownFormatData {
	caret: {
		blockId: string;
		offset: number;
	};
	regions: MarkdownFormatRegion[];
}

interface EditMarkdownData {
	blockId: string;
	end: number;
	start: number;
	tableCell?: number;
	text: string;
}

interface EditCodeFenceData {
	blockId: string;
	end: number;
	side: "end" | "start";
	start: number;
	text: string;
}

interface EnterCodeFenceData {
	blockId: string;
	side: "end" | "start";
}

interface InsertAttachmentData {
	kind: "file" | "image" | "video";
	name: string;
	src: string;
	alt?: string;
	meta?: Record<string, JsonValue>;
	mimeType?: string;
	size?: number;
}

export interface UpdateAssetData {
	alt?: string;
	kind?: "file" | "image" | "video";
	meta?: Record<string, JsonValue>;
	mimeType?: string;
	name?: string;
	size?: number;
	src?: string;
}

interface InsertMentionData {
	end: number;
	key: string;
	mention: MentionData;
	start: number;
	text: string;
}

function isWordCharacter(value: string, offset: number): boolean {
	if (offset < 0 || offset >= value.length) {
		return false;
	}
	const codePoint = value.codePointAt(offset);
	return codePoint !== undefined &&
		/[\p{L}\p{M}\p{N}_]/u.test(String.fromCodePoint(codePoint));
}

function parsedMarkdownCaret(
	parsed: ReturnType<typeof parseInlineMarkdownDetailed>,
	sourceOffset: number,
): { id: string; offset: number } | undefined {
	let lastText: TextToken | undefined;
	for (const entry of parsed) {
		if (entry.token.type !== "t") {
			continue;
		}
		lastText = entry.token;
		if (entry.origins.length === 0) {
			if (sourceOffset <= entry.sourceStart) {
				return { id: entry.token.id, offset: 0 };
			}
			continue;
		}
		if (sourceOffset <= entry.sourceEnd) {
			return {
				id: entry.token.id,
				offset: entry.origins.filter((origin) => origin < sourceOffset).length,
			};
		}
	}

	return lastText
		? { id: lastText.id, offset: lastText.text.length }
		: undefined;
}

function handleEnter(
	fromParent: BlockToken,
	toParent: BlockToken,
	model: Model,
	splitOffset: number,
	hasContentAfter: boolean,
) {
	if (toParent.type === fromParent.type) {
		return;
	}

	if (fromParent.type === "h") {
		const size = fromParent.props.size;
		if (splitOffset === 0) {
			setBlockType(fromParent, "p", {});
			setBlockType(toParent, "h", { size });
		} else if (hasContentAfter) {
			setBlockType(toParent, "h", { size });
		}
		return;
	}

	if (fromParent.type === "todo") {
		setBlockType(toParent, "todo", {
			indent: fromParent.props?.indent,
		});
		return;
	}

	if (fromParent.type === "l") {
		setBlockType(toParent, "l", {
			indent: fromParent.props?.indent || 0,
			type: fromParent.props?.type || "ul",
		});
		return;
	}

	if (fromParent.type === "quote") {
		setBlockType(toParent, "quote", {
			level: fromParent.props.level || 1,
		});
		return;
	}

	if (fromParent.type === "code") {
		setBlockType(toParent, "code", {});
	}
}

function dotSize(value: string): number {
	return value.split(".").length;
}

function handleTab(
	firstParent: BlockToken,
	lastParent: BlockToken,
	model: Model,
	shift: boolean,
) {
	const len = dotSize(firstParent.key);
	const keys = model
		.keysBetween(firstParent.key, lastParent.key)
		.filter((key) => dotSize(key) === len);

	for (const key of keys) {
		const element = model.findElement(key);
		if (!isBlockToken(element)) {
			continue;
		}

		const mod = shift ? -1 : 1;

		if (!element.props) {
			element.props = {};
		}

		if (element.type === "h") {
			if (mod === -1 && element.props.size <= 1) {
				setBlockType(element, "p", {});
				continue;
			}

			element.props.size = Math.max(
				1,
				Math.min((element.props.size || 0) + mod, 6),
			);
		} else if (
			element.type === "p" ||
			element.type === "l" ||
			element.type === "todo"
		) {
			if (mod === -1 && !element.props.indent) {
				setBlockType(element, "p", {});
				model.select(
					model.findElement(model.selection.first[0]),
					model.selection.first[1],
					model.findElement(model.selection.last[0]),
					model.selection.last[1],
				);
				continue;
			}

			element.props.indent = Math.max(
				0,
				Math.min((element.props.indent || 0) + mod, 4),
			);
		} else if (element.type === "quote") {
			if (mod === -1 && (element.props.level || 1) <= 1) {
				setBlockType(element, "p", {});
			} else {
				element.props.level = Math.max(
					1,
					Math.min((element.props.level || 1) + mod, 6),
				);
			}
		}
	}

	model.update();
}

/**
 * Mutable editor state for an Editpal document.
 *
 * A model owns parsed tokens, selection state, undo history, and editing
 * commands. Pass the same instance to {@link Editpal} for its lifetime.
 *
 * @example
 * ```ts
 * const model = new Model(parseMarkdown("# Hello"));
 * ```
 */
export class Model extends Exome {
	public tokens: TokenRoot;
	// public selection: {
	// 	anchor: string;
	// 	anchorOffset: number;
	// 	focus: string;
	// 	focusOffset: number;
	// } | null = null;
	public selection: ModelSelection = new ModelSelection(this);
	public slash: Slash = new Slash(this);
	public history: HistoryStore = new HistoryStore();

	public _idToKey: Record<string, string> = {};
	public _elements: Record<string, AnyToken> = {};
	public _isComposing = false;
	public _stack: Array<() => void> = [];

	constructor(
		tokens: TokenRoot = [createBlockToken("p", {}, [createTextToken()])],
	) {
		super();

		this.tokens = cloneToken(Array.isArray(tokens) ? tokens : []);
		this._ensureEditableDocument();
		this.recalculate(true);

		// console.log(this.tokens, this._idToKey);
	}

	public update() {}

	/** Replace the current document and clear history. */
	public setTokens(tokens: TokenRoot) {
		this.tokens = cloneToken(Array.isArray(tokens) ? tokens : []);
		this.history.clear();
		this.selection.setSelection("0.0", 0, "0.0", 0);
		this.recalculate(true);
	}

	/** Replace the current document from Markdown and clear history. */
	public setMarkdown(markdown: string) {
		this.setTokens(parseMarkdown(markdown));
	}

	/** Release subscriptions owned by this model when it will no longer be used. */
	public destroy() {
		this.slash.destroy();
		this._stack = [];
	}

	public get canUndo(): boolean {
		return this.history._undo.length > 0 || this.history._batch.length > 0;
	}

	public get canRedo(): boolean {
		return this.history._redo.length > 0;
	}

	/** Insert an uploaded attachment at the current selection. */
	public insertAttachment(attachment: InsertAttachmentData) {
		this.action(ACTION._InsertAttachment, attachment);
	}

	/** Replace a text range with a mention token. */
	public insertMention(
		key: string,
		start: number,
		end: number,
		text: string,
		mention: MentionData,
	) {
		this.action(ACTION._InsertMention, { end, key, mention, start, text });
	}

	/** Whether any part of the current selection belongs to a fenced code block. */
	public get selectionTouchesCodeBlock(): boolean {
		return this.keysBetween(
			this.selection.first[0],
			this.selection.last[0],
		).some((key) => {
			const element = this.findElement(key);
			const block = element && isBlockToken(element)
				? element
				: element
				? this.parent(element.key)
				: undefined;
			return block?.type === "code";
		});
	}

	/** Select the complete document, including trailing atomic inline items. */
	public selectAll() {
		const first = this.tokens[0]?.children[0];
		const lastBlock = this.tokens[this.tokens.length - 1];
		const last = lastBlock?.children[lastBlock.children.length - 1];
		if (!first || !last) {
			return;
		}
		this.select(
			first,
			0,
			last,
			last.type === "t" ? last.text.length : 0,
		);
	}

	private _selectionCoversDocument(): boolean {
		const first = this.tokens[0]?.children[0];
		const lastBlock = this.tokens[this.tokens.length - 1];
		const last = lastBlock?.children[lastBlock.children.length - 1];
		if (!first || !last) {
			return false;
		}
		return (
			(
				this.selection.first[0] !== this.selection.last[0] ||
				this.selection.first[1] !== this.selection.last[1]
			) &&
			this.selection.first[0] === first.key &&
			this.selection.first[1] === 0 &&
			this.selection.last[0] === last.key &&
			this.selection.last[1] === (last.type === "t" ? last.text.length : 0)
		);
	}

	/** Update an image caption as an undoable edit. */
	public setImageAlt(id: string, alt: string) {
		this.action(ACTION._UpdateImageAlt, { alt, id });
	}

	/** Remove a selected atomic inline integration or whole-line embed. */
	public removeSelectable(id: string) {
		this.action(ACTION._RemoveSelectable, { id, text: "" });
	}

	/** Replace a selected atomic widget with ordinary paragraph text. */
	public replaceSelectable(id: string, text: string) {
		this.action(ACTION._RemoveSelectable, { id, text });
	}

	/** Update a Markdown image or uploaded attachment as one undoable edit. */
	public updateAsset(id: string, changes: UpdateAssetData) {
		const key = this._idToKey[id];
		const asset = key ? this.findElement(key) : undefined;
		if (asset?.type !== "img" && asset?.type !== "attachment") {
			return;
		}
		this.transact(() => {
			if (changes.src !== undefined) {
				asset.src = changes.src;
			}
			if (changes.alt !== undefined) {
				asset.props.alt = changes.alt;
			}
			if (asset.type === "attachment") {
				for (
					const property of [
						"kind",
						"meta",
						"mimeType",
						"name",
						"size",
					] as const
				) {
					if (changes[property] !== undefined) {
						asset.props[property] = changes[property] as never;
					}
				}
			}
		});
	}

	/**
	 * Edit the URL represented by a labeled or automatic link. Passing `null`
	 * unlinks labeled text and turns an automatic URL back into plain text.
	 */
	public updateLink(id: string, url: string | null) {
		const key = this._idToKey[id];
		const token = key ? this.findElement(key) : undefined;
		if (
			!token || isBlockToken(token) ||
			(token.type !== "t" && token.type !== "url")
		) {
			return;
		}
		this.transact(() => {
			if (token.type === "url") {
				if (url) {
					token.src = url;
				} else {
					const source = token.src;
					Object.assign(token, {
						props: {},
						text: source,
						type: "t",
					});
					delete (token as Partial<typeof token>).src;
				}
				return;
			}
			const current = token.props.link;
			if (current) {
				const parent = this.parent(token.key);
				const children = parent?.children || [];
				const index = children.indexOf(token);
				let start = index;
				let end = index;
				while (
					children[start - 1]?.type === "t" &&
					children[start - 1].props.link === current
				) {
					start -= 1;
				}
				while (
					children[end + 1]?.type === "t" &&
					children[end + 1].props.link === current
				) {
					end += 1;
				}
				for (const child of children.slice(start, end + 1)) {
					if (child.type === "t") {
						child.props.link = url || undefined;
					}
				}
				return;
			}
			const automatic = token.props.url;
			if (automatic) {
				if (url) {
					token.props.url = url;
				} else {
					token.text = automatic;
					token.props.url = undefined;
				}
			}
		});
	}

	/** Put an unformatted caret immediately after an inline item. */
	public placeCaretAfter(id: string) {
		const key = this._idToKey[id];
		const token = key ? this.findElement(key) : undefined;
		const parent = token && !isBlockToken(token)
			? this.parent(token.key)
			: undefined;
		if (!token || isBlockToken(token) || !parent) {
			return;
		}
		const index = parent.children.indexOf(token);
		let next = parent.children[index + 1];
		if (
			next?.type !== "t" ||
			next.props.mention ||
			next.props.link ||
			next.props.url
		) {
			next = createTextToken({ typingBoundary: true });
			parent.children.splice(index + 1, 0, next);
			this.recalculate();
		}
		this.select(next, 0);
	}

	/** Put a caret immediately before an inline item without entering it. */
	public placeCaretBefore(id: string) {
		const key = this._idToKey[id];
		const token = key ? this.findElement(key) : undefined;
		const parent = token && !isBlockToken(token)
			? this.parent(token.key)
			: undefined;
		if (!token || isBlockToken(token) || !parent) {
			return;
		}
		const index = parent.children.indexOf(token);
		let previous = parent.children[index - 1];
		if (
			previous?.type !== "t" ||
			previous.props.mention ||
			previous.props.link ||
			previous.props.url
		) {
			previous = createTextToken({ typingBoundary: true });
			parent.children.splice(index, 0, previous);
			this.recalculate();
		}
		this.select(previous, previous.text.length);
	}

	/**
	 * Expand a collapsed caret to the most useful formatting scope: the whole
	 * link label when inside a link, otherwise the word under the caret.
	 */
	public prepareSmartSelection(): boolean {
		const [firstKey, firstOffset] = this.selection.first;
		const [lastKey, lastOffset] = this.selection.last;
		if (firstKey !== lastKey || firstOffset !== lastOffset) {
			return true;
		}
		const token = this.findElement(firstKey);
		if (token?.type !== "t") {
			return false;
		}
		const parent = this.parent(token.key);
		if (!parent || parent.type === "code") {
			return false;
		}

		if (token.props.link) {
			const index = parent.children.indexOf(token);
			let start = index;
			let end = index;
			while (
				parent.children[start - 1]?.type === "t" &&
				parent.children[start - 1].props.link === token.props.link
			) {
				start -= 1;
			}
			while (
				parent.children[end + 1]?.type === "t" &&
				parent.children[end + 1].props.link === token.props.link
			) {
				end += 1;
			}
			const first = parent.children[start];
			const last = parent.children[end];
			if (first.type === "t" && last.type === "t") {
				this.select(first, 0, last, last.text.length);
				return true;
			}
		}

		let point = Math.min(firstOffset, token.text.length);
		if (!isWordCharacter(token.text, point) && point > 0) {
			const previous = previousGraphemeBoundary(token.text, point);
			if (isWordCharacter(token.text, previous)) {
				point = previous;
			}
		}
		while (
			point < token.text.length &&
			!isWordCharacter(token.text, point)
		) {
			point = nextGraphemeBoundary(token.text, point);
		}
		if (!isWordCharacter(token.text, point)) {
			return false;
		}
		let start = point;
		while (start > 0) {
			const previous = previousGraphemeBoundary(token.text, start);
			if (!isWordCharacter(token.text, previous)) {
				break;
			}
			start = previous;
		}
		let end = point;
		while (end < token.text.length && isWordCharacter(token.text, end)) {
			end = nextGraphemeBoundary(token.text, end);
		}
		let firstToken = token;
		let lastToken = token;
		let firstWordOffset = start;
		let lastWordOffset = end;
		let siblingIndex = parent.children.indexOf(token);
		while (firstWordOffset === 0 && siblingIndex > 0) {
			const previous = parent.children[siblingIndex - 1];
			if (
				previous.type !== "t" ||
				!isWordCharacter(
					previous.text,
					previousGraphemeBoundary(previous.text, previous.text.length),
				)
			) {
				break;
			}
			let previousStart = previous.text.length;
			while (previousStart > 0) {
				const boundary = previousGraphemeBoundary(
					previous.text,
					previousStart,
				);
				if (!isWordCharacter(previous.text, boundary)) {
					break;
				}
				previousStart = boundary;
			}
			firstToken = previous;
			firstWordOffset = previousStart;
			siblingIndex -= 1;
		}
		siblingIndex = parent.children.indexOf(token);
		while (
			lastWordOffset === lastToken.text.length &&
			siblingIndex < parent.children.length - 1
		) {
			const next = parent.children[siblingIndex + 1];
			if (next.type !== "t" || !isWordCharacter(next.text, 0)) {
				break;
			}
			let nextEnd = 0;
			while (
				nextEnd < next.text.length &&
				isWordCharacter(next.text, nextEnd)
			) {
				nextEnd = nextGraphemeBoundary(next.text, nextEnd);
			}
			lastToken = next;
			lastWordOffset = nextEnd;
			siblingIndex += 1;
		}
		this.select(
			firstToken,
			firstWordOffset,
			lastToken,
			lastWordOffset,
		);
		return end > start;
	}

	/** Apply a format using the smart caret scope when no range is selected. */
	public smartFormat(type: number, data: [string, any]): boolean {
		if (!this.prepareSmartSelection()) {
			return false;
		}
		this.action(type, data);
		return true;
	}

	/**
	 * Apply a synchronous custom mutation as one undoable history entry.
	 * Extension data must remain JSON-serializable.
	 */
	public transact(mutate: () => void) {
		const beforeTokens = JSON.stringify(this.tokens);
		const beforeSelection = {
			first: [...this.selection.first] as [string, number],
			last: [...this.selection.last] as [string, number],
		};
		this.history.lock(mutate);
		this.recalculate();
		const afterTokens = JSON.stringify(this.tokens);
		const afterSelection = {
			first: [...this.selection.first] as [string, number],
			last: [...this.selection.last] as [string, number],
		};
		if (beforeTokens === afterTokens) {
			return;
		}

		const restore = (
			tokens: string,
			selection: {
				first: [string, number];
				last: [string, number];
			},
		) => {
			this.tokens = JSON.parse(tokens);
			this.selection.first = selection.first;
			this.selection.last = selection.last;
			this.recalculate();
		};
		this.history.push({
			undo: () => restore(beforeTokens, beforeSelection),
			redo: () => restore(afterTokens, afterSelection),
		});
	}

	private _ensureEditableDocument() {
		if (!Array.isArray(this.tokens)) {
			this.tokens = [];
		}

		if (this.tokens.length === 0) {
			this.tokens.push(createBlockToken("p", {}, [createTextToken()]));
		}

		const usedIds = new Set<string>();
		const ensureUniqueId = (token: AnyToken) => {
			while (
				typeof token.id !== "string" ||
				!token.id ||
				usedIds.has(token.id)
			) {
				token.id = ranID();
			}
			usedIds.add(token.id);
		};

		for (const block of this.tokens) {
			ensureUniqueId(block);
			block.props ||= {} as never;
			if (!Array.isArray(block.children)) {
				block.children = [];
			}
			if (block.children.length === 0) {
				block.children.push(createTextToken());
			}
			if (
				block.type === "code" &&
				block.children.some((child) =>
					child.type !== "t" ||
					Object.values(child.props || {}).some((value) => value !== undefined)
				)
			) {
				block.children = [
					createTextToken({}, inlineTokensToMarkdown(block.children)),
				];
			}

			for (const child of block.children) {
				ensureUniqueId(child);
				child.props ||= {};
				if (child.type === "t" && typeof child.text !== "string") {
					child.text = child.text == null ? "" : String(child.text);
				}
			}
		}
	}

	private _resolveSelectionPoint(
		point: [null | string, null | number],
		preferEnd = false,
	): [string, number] {
		const requestedKey = point[0] || "";
		let element = this.findElement(requestedKey);

		if (element && isBlockToken(element)) {
			element = preferEnd
				? element.children[element.children.length - 1]
				: element.children[0];
		}

		if (!element || isBlockToken(element)) {
			const requestedBlock = Number.parseInt(requestedKey.split(".")[0], 10);
			const blockIndex = Number.isFinite(requestedBlock)
				? Math.max(0, Math.min(requestedBlock, this.tokens.length - 1))
				: preferEnd
				? this.tokens.length - 1
				: 0;
			const block = this.tokens[blockIndex];
			const useEnd = preferEnd || requestedBlock >= this.tokens.length;
			element = useEnd
				? block.children[block.children.length - 1]
				: block.children[0];
			preferEnd = useEnd;
		}

		const maxOffset = element.type === "t" ? element.text.length : 0;
		const requestedOffset = point[1] ?? (preferEnd ? maxOffset : 0);
		const offset = Math.max(0, Math.min(requestedOffset, maxOffset));
		return [
			element.key,
			element.type === "t"
				? snapGraphemeBoundary(element.text, offset, preferEnd)
				: 0,
		];
	}

	public recalculate = (initial = false) => {
		if (this._isComposing) {
			return;
		}

		this._ensureEditableDocument();

		const {
			_keys,
			_elements,
			_newSelection: [first, last],
		} = buildKeys(this.tokens, [this.selection.first, this.selection.last]);

		this._idToKey = _keys;
		this._elements = _elements;
		this.update();

		const selectionIsCollapsed = first[0] === last[0] && first[1] === last[1];
		const resolvedFirst = this._resolveSelectionPoint(first);
		const resolvedLast = this._resolveSelectionPoint(
			last,
			!selectionIsCollapsed,
		);

		if (initial) {
			this.selection.setSelection(...resolvedFirst, ...resolvedLast);
			this.selection.setFormat(this.getSelectionFormat());
			return;
		}

		this.select(
			this.findElement(resolvedFirst[0]),
			resolvedFirst[1],
			this.findElement(resolvedLast[0]),
			resolvedLast[1],
		);
	};

	public remove = (key: string) => {
		const parent = this.parent(key);

		// Handle root text nodes
		if (parent === null) {
			const element = this.findElement(key);
			if (!isBlockToken(element)) {
				return;
			}
			const index = this.tokens.indexOf(element);
			if (index >= 0) {
				this.tokens.splice(index, 1);
			}
			// console.log("🏴‍☠️ REMOVE ROOT", index);

			return;
		}

		if (!parent || !Array.isArray(parent?.children)) {
			return;
		}

		const index = parent.children.findIndex((c) => c.key === key);
		if (index >= 0) {
			parent.children.splice(index, 1);
		}
		// console.log("🏴‍☠️ REMOVE CHILD", parent.key, key);
	};

	private _orderedKeys = (): string[] =>
		this.tokens.flatMap((block) => [
			block.key,
			...block.children.map((child) => child.key),
		]);

	public keysBetween = (firstKey: string, lastKey: string): string[] => {
		const keys = this._orderedKeys();
		const firstIndex = keys.indexOf(firstKey);
		const lastIndex = keys.indexOf(lastKey);

		if (firstIndex === -1) {
			return [];
		}

		if (lastIndex === -1) {
			return keys.slice(firstIndex);
		}

		return keys.slice(
			Math.min(firstIndex, lastIndex),
			Math.max(firstIndex, lastIndex) + 1,
		);
	};

	public removeBetween = (
		firstKey: string,
		lastKey: string,
		lastIncluded = true,
	): void => {
		const keys = this.keysBetween(firstKey, lastKey);

		keys.shift();

		if (!lastIncluded) {
			const index = keys.indexOf(lastKey);
			if (index > -1) {
				keys.splice(index, 1);
			}
		}

		for (const key of keys) {
			this.remove(key);
		}
	};

	public findElement = (key: string): AnyToken => {
		return this._elements[key];
	};

	public innerNode = (key: string): InlineToken => {
		const element = this.findElement(key);
		return isBlockToken(element) ? element.children[0] : element as InlineToken;
	};

	public innerText = (key: string): TextToken | undefined => {
		const el = this.innerNode(key);

		if (el.type !== "t") {
			return;
		}

		return el;
	};

	private _replaceInlineWithText(key: string): TextToken | undefined {
		const element = this.innerNode(key);
		if (!element || element.type === "t") {
			return element?.type === "t" ? element : undefined;
		}

		const parent = this.parent(element.key);
		const index = parent?.children.indexOf(element) ?? -1;
		if (!parent || index < 0) {
			return;
		}

		const replacement = {
			...createTextToken(),
			id: element.id,
			key: element.key,
		};
		parent.children.splice(index, 1, replacement);
		return replacement;
	}

	public parent = (key: string): BlockToken | null => {
		const keyChunks = key.split(".");
		keyChunks.pop();
		const parentKey = keyChunks.join(".");

		if (!parentKey) {
			return null;
		}

		return this.findElement(parentKey) as BlockToken;
	};

	public nextSiblings = (key: string, selfIncluded = false): InlineToken[] => {
		const selfKey = key.split(".").pop()!;

		const parent = this.parent(key);

		if (!parent?.children) {
			return [];
		}

		return parent.children.slice(
			parseInt(selfKey, 10) + (selfIncluded ? 0 : +1),
		);
	};

	public previousText = (key: string): TextToken | null => {
		const keys = this._orderedKeys();
		const index = keys.indexOf(key);

		if (index < 0) {
			return null;
		}

		for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
			const element = this.findElement(keys[cursor]);
			if (element?.type === "t") {
				return element;
			}
		}

		return null;
	};

	public nextText = (currentKey: string): TextToken | null => {
		const keys = this._orderedKeys();
		const index = keys.indexOf(currentKey);

		if (index < 0) {
			return null;
		}

		for (let cursor = index + 1; cursor < keys.length; cursor += 1) {
			const element = this.findElement(keys[cursor]);
			if (element?.type === "t") {
				return element;
			}
		}

		return null;
	};

	public selectedText = (): string => {
		const collapsed = this.selection.first[0] === this.selection.last[0] &&
			this.selection.first[1] === this.selection.last[1];
		const [firstKey, firstOffset] = this._resolveSelectionPoint(
			this.selection.first,
		);
		const [lastKey, lastOffset] = this._resolveSelectionPoint(
			this.selection.last,
			!collapsed,
		);
		const [firstBlock, firstChild] = firstKey.split(".").map(Number);
		const [lastBlock, lastChild] = lastKey.split(".").map(Number);
		const output: string[] = [];

		for (let blockIndex = firstBlock; blockIndex <= lastBlock; blockIndex++) {
			const block = this.tokens[blockIndex];
			if (!block) {
				continue;
			}

			const start = blockIndex === firstBlock ? firstChild : 0;
			const end = blockIndex === lastBlock
				? lastChild
				: block.children.length - 1;
			let line = "";

			for (let childIndex = start; childIndex <= end; childIndex++) {
				const child = block.children[childIndex];
				if (!child) {
					continue;
				}

				if (child.type === "img") {
					line += child.props.alt || "";
					continue;
				}
				if (child.type === "url") {
					line += child.src;
					continue;
				}
				if (child.type === "attachment") {
					line += child.props.name;
					continue;
				}
				if (child.props.url && !child.props.link) {
					line += child.props.url;
					continue;
				}

				const from = blockIndex === firstBlock && childIndex === firstChild
					? firstOffset
					: 0;
				const to = blockIndex === lastBlock && childIndex === lastChild
					? lastOffset
					: child.text.length;
				line += child.text.slice(from, to);
			}

			output.push(line);
		}

		return output.join("\n");
	};

	private _textPointAtBlockOffset(
		block: BlockToken,
		requestedOffset: number,
		preferPrevious = false,
	): { element: TextToken; offset: number } | undefined {
		const textChildren = block.children.filter((child): child is TextToken =>
			child.type === "t"
		);
		const maxOffset = textChildren.reduce(
			(total, child) => total + child.text.length,
			0,
		);
		const offset = Math.max(0, Math.min(requestedOffset, maxOffset));
		let currentOffset = 0;

		for (const [index, child] of textChildren.entries()) {
			const end = currentOffset + child.text.length;
			const isLast = index === textChildren.length - 1;
			if (
				offset < end ||
				(offset === end && (preferPrevious || isLast))
			) {
				return {
					element: child,
					offset: offset - currentOffset,
				};
			}
			currentOffset = end;
		}

		const last = textChildren[textChildren.length - 1];
		return last ? { element: last, offset: last.text.length } : undefined;
	}

	private _selectedTextRanges = (): Array<{
		element: TextToken;
		start: number;
		end: number;
	}> => {
		const [firstKey, firstOffset] = this.selection.first;
		const [lastKey, lastOffset] = this.selection.last;

		return this.keysBetween(firstKey, lastKey).reduce<
			Array<{
				element: TextToken;
				start: number;
				end: number;
			}>
		>((ranges, key) => {
			const element = this.findElement(key);
			if (element?.type !== "t") {
				return ranges;
			}
			if (this.parent(element.key)?.type === "code") {
				return ranges;
			}

			const start = key === firstKey ? firstOffset : 0;
			const end = key === lastKey ? lastOffset : element.text.length;
			if (end > start) {
				ranges.push({ element, start, end });
			}

			return ranges;
		}, []);
	};

	public getSelectionFormat = (): Record<string, any> => {
		const collapsed = this.selection.first[0] === this.selection.last[0] &&
			this.selection.first[1] === this.selection.last[1];

		if (collapsed) {
			const element = this.findElement(this.selection.first[0]);
			return element && !isBlockToken(element)
				? Object.fromEntries(
					Object.entries(element.props || {}).filter(([, value]) =>
						value !== undefined
					),
				)
				: {};
		}

		const selectedProps = this._selectedTextRanges().map(
			({ element }) => element.props || {},
		);
		const firstProps = selectedProps[0];
		if (!firstProps) {
			return {};
		}

		return Object.entries(firstProps).reduce<Record<string, any>>(
			(common, [key, value]) => {
				if (
					value !== undefined &&
					selectedProps.every((props) => props[key] === value)
				) {
					common[key] = value;
				}
				return common;
			},
			{},
		);
	};

	public _transformToParagraph(element: BlockToken) {
		setBlockType(element, "p", {});
		this.select(element.children[0]);
	}

	private _handleInitialRemove = (element: AnyToken) => {
		const parent = isInlineToken(element) ? this.parent(element.key)! : element;

		if (element.type === "img") {
			parent.children = [createTextToken()];
			return;
		}

		if (parent.type === "h") {
			if (parent.props.size <= 1) {
				this._transformToParagraph(parent);
				return;
			}

			parent.props.size -= 1;
			return;
		}

		if (parent.type === "code") {
			const parentIndex = this.tokens.indexOf(parent);
			const previousBlock = this.tokens[parentIndex - 1];
			if (previousBlock?.type !== "code") {
				return;
			}

			const previousLength = previousBlock.children.reduce(
				(length, child) =>
					length + (child.type === "t" ? child.text.length : 0),
				0,
			);
			const previousId = previousBlock.id;
			previousBlock.children.push(...parent.children.map(cloneToken));
			this.remove(parent.key);
			this.recalculate();

			const currentPreviousKey = this._idToKey[previousId];
			const currentPrevious = currentPreviousKey
				? this.findElement(currentPreviousKey)
				: undefined;
			if (currentPrevious && isBlockToken(currentPrevious)) {
				const point = this._textPointAtBlockOffset(
					currentPrevious,
					previousLength,
					true,
				);
				if (point) {
					this.select(point.element, point.offset);
				}
			}
			return;
		}

		if (parent.type === "p") {
			if (parent.children.length === 1 && parent.key === "0") {
				return;
			}

			const onlyChild = parent.children[0];
			if (
				parent.children.length === 1 &&
				onlyChild?.type === "t" &&
				!onlyChild.text
			) {
				const prev = this.previousText(parent.key);
				if (!prev) {
					return;
				}

				const previousLength = prev.text.length;
				this.remove(parent.key);
				this.recalculate();
				const previousAfterCalculation = this.findElement(prev.key);
				if (previousAfterCalculation?.type === "t") {
					this.select(previousAfterCalculation, previousLength);
				}
				return;
			}

			// Don't allow to move past first element & first line
			if (parent.key === "0") {
				return;
			}

			const prev = this.previousText(parent.key);
			if (!prev) {
				return;
			}

			const siblings = parent.children.map(cloneToken);

			this.insert(siblings, prev);
			this.remove(parent.key);

			const prevLength = prev.text.length;

			this.recalculate();

			const prevAfterCalculation = this.innerText(prev.key);
			if (prevAfterCalculation) {
				this.select(prevAfterCalculation, prevLength);
			}
			return;
		}

		if (
			(parent.type === "l" || parent.type === "todo") &&
			parent.props.indent &&
			parent.props.indent > 0
		) {
			handleTab(parent, parent, this, true);
			return;
		}

		if (parent.type === "quote" && (parent.props.level || 1) > 1) {
			parent.props.level = (parent.props.level || 1) - 1;
			this.update();
			return;
		}

		this._transformToParagraph(parent);

		// console.log("🟢 REMOVE INITIAL", (parent as any).index);
	};

	private _transformInlineMarkdown(
		parent: BlockToken,
		caretElement: TextToken,
		caretOffset: number,
	): boolean {
		if (parent.type === "code" || parent.type === "hr") {
			return false;
		}

		const tableCell = parent.type === "tr"
			? caretElement.props.tableCell
			: undefined;
		const originalChildren = parent.type === "tr" &&
				typeof tableCell === "number"
			? parent.children.filter((child) => child.props.tableCell === tableCell)
			: parent.children;
		const chunks = inlineMarkdownChunks(originalChildren);
		const baseProps = new Map<number, Record<string, any>>();
		let source = "";
		let caretSourceOffset = -1;

		for (const chunk of chunks) {
			const start = source.length;
			source += chunk.text;
			if (chunk.token === caretElement && chunk.props) {
				caretSourceOffset = start + Math.max(
					0,
					Math.min(caretOffset, chunk.text.length),
				);
			}
			if (chunk.props) {
				const props = markdownBaseProps(chunk.props);
				for (let index = 0; index < chunk.text.length; index++) {
					baseProps.set(start + index, props);
				}
			}
		}

		if (caretSourceOffset < 0) {
			return false;
		}

		const parsed = parseInlineMarkdownDetailed(source, {
			basePropsAt: (index) => baseProps.get(index) || {},
		});
		const semantic = (items: InlineToken[]) =>
			JSON.stringify(
				items.map((item) =>
					item.type === "t"
						? { props: item.props, text: item.text, type: item.type }
						: item.type === "img"
						? {
							props: item.props,
							src: item.src,
							type: item.type,
						}
						: { props: item.props, src: item.src, type: item.type }
				),
			);
		const nextChildren = parsed.map(({ token }) => token);
		if (semantic(originalChildren) === semantic(nextChildren)) {
			return false;
		}

		const prefix = parseInlineMarkdownDetailed(
			source.slice(0, caretSourceOffset),
			{
				basePropsAt: (index) => baseProps.get(index) || {},
			},
		);
		const prefixText = prefix.filter(({ token }) => token.type === "t");
		const caretTextIndex = Math.max(0, prefixText.length - 1);
		const caretTextOffset = prefixText[caretTextIndex]?.token.type === "t"
			? prefixText[caretTextIndex].token.text.length
			: 0;
		const parentId = parent.id;

		if (parent.type === "tr" && typeof tableCell === "number") {
			const firstIndex = parent.children.findIndex((child) =>
				child.props.tableCell === tableCell
			);
			const cellLength = parent.children.filter((child) =>
				child.props.tableCell === tableCell
			).length;
			parent.children.splice(firstIndex, cellLength, ...nextChildren);
		} else {
			parent.children = nextChildren;
		}
		this.recalculate();

		const currentParentKey = this._idToKey[parentId];
		const currentParent = currentParentKey
			? this.findElement(currentParentKey)
			: undefined;
		if (currentParent && isBlockToken(currentParent)) {
			const textChildren = currentParent.children.filter(
				(child): child is TextToken =>
					child.type === "t" &&
					(typeof tableCell !== "number" ||
						child.props.tableCell === tableCell),
			);
			const caretText = textChildren[
				Math.min(caretTextIndex, Math.max(0, textChildren.length - 1))
			];
			if (caretText) {
				this.select(
					caretText,
					Math.min(caretTextOffset, caretText.text.length),
				);
				const outsideFormat = markdownBaseProps(caretText.props);
				if (
					Object.keys(caretText.props).some((key) =>
						!(key in outsideFormat) &&
						caretText.props[key] !== undefined
					)
				) {
					this.selection.setMarkdownBoundary({
						format: outsideFormat,
						side: "after",
						tokenId: caretText.id,
					});
					this.selection.setFormat(outsideFormat);
					this._stack.push(() =>
						setMarkdownBoundaryCaret(caretText.id, "after")
					);
				}
			}
		}

		return true;
	}

	private _replaceLiteralCodeFence(
		openingIndex: number,
		closingIndex: number,
		caretSide: "end" | "start",
		caretMarkerOffset: number,
	): boolean {
		const source = toMarkdown(
			this.tokens.slice(openingIndex, closingIndex + 1),
		);
		const parsed = parseMarkdown(source);
		if (!parsed.length || parsed.some((block) => block.type !== "code")) {
			return false;
		}

		this.tokens.splice(
			openingIndex,
			closingIndex - openingIndex + 1,
			...parsed,
		);
		this.recalculate();

		const codeBlocks = this.tokens.slice(
			openingIndex,
			openingIndex + parsed.length,
		).filter((block) => block.type === "code");
		const caretBlock = caretSide === "start"
			? codeBlocks[0]
			: codeBlocks[codeBlocks.length - 1];
		const caretText = caretBlock?.children.find(
			(child): child is TextToken => child.type === "t",
		);
		if (caretBlock && caretText) {
			const renderedSource = toMarkdown(codeBlocks);
			const renderedMarker = caretSide === "start"
				? renderedSource.split("\n")[0]
				: renderedSource.split("\n").at(-1) || "";
			this._selectCodeFenceMarker(
				caretBlock,
				caretText,
				caretSide,
				Math.min(caretMarkerOffset, renderedMarker.length),
			);
		}

		return true;
	}

	private _selectCodeFenceMarker(
		caretBlock: BlockToken,
		caretText: TextToken,
		side: "end" | "start",
		markerOffset: number,
	) {
		const textOffset = side === "start" ? 0 : caretText.text.length;
		const blockId = caretBlock.id;
		const textId = caretText.id;
		this.select(caretText, textOffset);
		this._stack.push(() => {
			const currentTextKey = this._idToKey[textId];
			const currentText = currentTextKey
				? this.findElement(currentTextKey)
				: undefined;
			if (currentText?.type === "t") {
				const currentOffset = side === "start" ? 0 : currentText.text.length;
				this.selection.setSelection(
					currentText.key,
					currentOffset,
					currentText.key,
					currentOffset,
				);
				this.selection.setFormat(this.getSelectionFormat());
			}
			setCodeFenceCaret(blockId, side, markerOffset);
		});
	}

	private _restoreCompletedCodeFence(
		parent: BlockToken,
		caretSourceOffset: number,
	): boolean {
		if (parent.type !== "p") {
			return false;
		}

		const currentSource = toMarkdown([parent]);
		const currentIndex = this.tokens.indexOf(parent);
		const closing = currentSource.match(
			/^\s{0,3}(`{3,}|~{3,})\s*$/,
		);
		if (closing) {
			let firstParagraphIndex = currentIndex;
			while (this.tokens[firstParagraphIndex - 1]?.type === "p") {
				firstParagraphIndex -= 1;
			}
			for (
				let openingIndex = firstParagraphIndex;
				openingIndex < currentIndex;
				openingIndex++
			) {
				const candidate = this.tokens[openingIndex];
				const opening = toMarkdown([candidate]).match(
					/^\s{0,3}(`{3,}|~{3,})\s*([\w+-]*)\s*$/,
				);
				if (
					!opening ||
					opening[1][0] !== closing[1][0] ||
					opening[1].length > closing[1].length
				) {
					continue;
				}

				if (
					this._replaceLiteralCodeFence(
						openingIndex,
						currentIndex,
						"end",
						caretSourceOffset,
					)
				) {
					return true;
				}
			}
		}

		const opening = currentSource.match(
			/^\s{0,3}(`{3,}|~{3,})\s*([\w+-]*)\s*$/,
		);
		if (!opening) {
			return false;
		}

		for (
			let closingIndex = currentIndex + 1;
			closingIndex < this.tokens.length;
			closingIndex++
		) {
			const candidate = this.tokens[closingIndex];
			if (candidate.type !== "p") {
				break;
			}

			const candidateClosing = toMarkdown([candidate]).match(
				/^\s{0,3}(`{3,}|~{3,})\s*$/,
			);
			if (
				!candidateClosing ||
				candidateClosing[1][0] !== opening[1][0] ||
				candidateClosing[1].length < opening[1].length
			) {
				continue;
			}

			if (
				this._replaceLiteralCodeFence(
					currentIndex,
					closingIndex,
					"start",
					caretSourceOffset,
				)
			) {
				return true;
			}
		}

		return false;
	}

	private _handleTextTransforms = (
		element: TextToken,
		textAdded: string,
		insertionOffset: number,
	): "block" | "inline" | { caret: number } | undefined => {
		const parent = this.parent(element.key)!;
		if (parent.type === "code") {
			return;
		}

		const insertionEnd = insertionOffset + textAdded.length;
		if (
			element.text.slice(Math.max(0, insertionEnd - 2), insertionEnd) === ":D"
		) {
			element.text = stringSplice(
				element.text,
				Math.max(0, insertionEnd - 2),
				insertionEnd,
				"😄",
			);
			return { caret: insertionEnd };
		}

		const isFirstChild = parent.children[0] === element;
		const completesPrefix = (length: number) =>
			insertionOffset < length && insertionEnd >= length;

		if (
			isFirstChild &&
			parent.type === "p" &&
			/^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/.test(element.text)
		) {
			element.text = "";
			setBlockType(parent, "hr", {});
			return { caret: 0 };
		}

		if (isFirstChild && parent.type === "p") {
			const quote = element.text.match(/^((?:>\s*)+)(.*)$/);
			if (
				quote &&
				insertionEnd >= quote[1].length &&
				(/\s/.test(quote[1]) || textAdded.length > 1)
			) {
				element.text = quote[2];
				setBlockType(parent, "quote", {
					level: (quote[1].match(/>/g) || []).length,
				});
				return {
					caret: Math.max(0, insertionEnd - quote[1].length),
				};
			}
		}

		if (
			/[`~]/.test(textAdded) &&
			this._restoreCompletedCodeFence(parent, insertionEnd)
		) {
			return "block";
		}

		if (
			/[\\`*_~=[\]()!]/.test(textAdded) &&
			this._transformInlineMarkdown(parent, element, insertionEnd)
		) {
			return "inline";
		}

		if (
			isFirstChild &&
			insertionOffset === 0 &&
			textAdded.startsWith("#") &&
			(parent.type === "p" || parent.type === "h")
		) {
			const requested = textAdded.match(/^#+/)?.[0].length || 0;
			const currentSize = parent.type === "h" ? parent.props.size : 0;
			const consumedHashes = Math.min(requested, 6 - currentSize);

			if (consumedHashes > 0) {
				const trailingWhitespace =
					element.text.slice(consumedHashes).match(/^\s+/)?.[0].length || 0;
				const consumed = consumedHashes + trailingWhitespace;
				element.text = element.text.slice(consumed);
				setBlockType(parent, "h", {
					size: currentSize + consumedHashes,
				});
				return {
					caret: Math.max(0, insertionEnd - consumed),
				};
			}
		}

		if (
			isFirstChild &&
			parent.type === "h" &&
			element.text === textAdded &&
			/^\s+$/.test(textAdded)
		) {
			element.text = "";
			return { caret: 0 };
		}

		if (isFirstChild && (parent.type === "p" || parent.type === "l")) {
			const beforeCaret = element.text.slice(0, insertionEnd);
			const todo = element.text.match(
				/^(\s*)(?:(?:[-+*])\s+)?\[([ xX])\]\s+/,
			);
			const canTransformTodo = parent.type === "p" ||
				(parent.type === "l" && parent.props.type === "ul");

			if (
				canTransformTodo &&
				todo &&
				completesPrefix(todo[0].length) &&
				beforeCaret.startsWith(todo[0])
			) {
				element.text = element.text.slice(todo[0].length);
				setBlockType(parent, "todo", {
					indent: Math.max(
						parent.props.indent || 0,
						Math.floor(todo[1].length / 2),
					),
					done: todo[2].toLowerCase() === "x",
				});
				return {
					caret: Math.max(0, insertionEnd - todo[0].length),
				};
			}
		}

		// "-|[space]" => "• |"
		const unordered = isFirstChild && parent.type === "p"
			? element.text.match(/^(\s*)[-+*]\s+/)
			: null;
		if (unordered && completesPrefix(unordered[0].length)) {
			element.text = element.text.slice(unordered[0].length);
			setBlockType(parent, "l", {
				indent: Math.floor(unordered[1].length / 2),
				...parent.props,
				type: "ul",
			});
			return {
				caret: Math.max(0, insertionEnd - unordered[0].length),
			};
		}

		// "1.|[space]" => "1. |"
		const ordered = isFirstChild && parent.type === "p"
			? element.text.match(/^(\s*)(\d+)[.)]\s+/)
			: null;
		if (ordered && completesPrefix(ordered[0].length)) {
			element.text = element.text.slice(ordered[0].length);
			setBlockType(parent, "l", {
				indent: Math.floor(ordered[1].length / 2),
				...parent.props,
				start: Number(ordered[2]),
				type: "ol",
			});
			return {
				caret: Math.max(0, insertionEnd - ordered[0].length),
			};
		}
	};

	public insert(
		tokens: BlockToken[],
		element: BlockToken,
		direction?: number,
	): BlockToken[];
	public insert(
		tokens: InlineToken[],
		element: InlineToken,
		direction?: number,
	): InlineToken[];
	public insert(
		tokens: AnyToken[],
		element: AnyToken,
		direction = 1,
	): AnyToken[] {
		const parent = this.parent(element.key);

		const newTokens = tokens.map(cloneToken);

		if (!parent) {
			if (!isBlockToken(element) || !newTokens.every(isBlockToken)) {
				throw new TypeError("Only block tokens can be inserted at the root");
			}
			this.tokens.splice(
				this.tokens.indexOf(element) + direction,
				0,
				...newTokens,
			);

			return newTokens;
		}

		if (!isInlineToken(element) || !newTokens.every(isInlineToken)) {
			throw new TypeError("Only inline tokens can be inserted into a block");
		}
		parent.children.splice(
			parent.children.indexOf(element) + direction,
			0,
			...newTokens,
		);

		return newTokens;
	}

	private _pushToHistory = (type: number, data?: any) => {
		const first = this.selection.first.slice() as [string, number];
		const last = this.selection.last.slice() as [string, number];
		const tokensString = JSON.stringify(this.tokens);
		const trace = {
			undo: () => {
				this.selection.first = first;
				this.selection.last = last;
				this.tokens = JSON.parse(tokensString);

				this.recalculate();

				this._stack.push(() => {
					setCaret(
						this.findElement(first[0]).id,
						first[1],
						this.findElement(last[0]).id,
						last[1],
					);
				});
			},
			redo: () => {
				this.selection.first = first;
				this.selection.last = last;

				this.recalculate();

				this._stack.push(() => {
					setCaret(
						this.findElement(first[0]).id,
						first[1],
						this.findElement(last[0]).id,
						last[1],
					);
				});

				this.action(type, data);
			},
		};

		const batch = type === ACTION._Todo ||
				(type === ACTION._RemoveSelectable && !data?.text)
			? undefined
			: type === ACTION._RemoveSelectable
			? ACTION._Key
			: type === ACTION._Compose
			? ACTION._Key
			: type;
		this.history.push(trace, batch);
	};

	private _cut = (
		el: TextToken,
		firstOffset: number,
		lastOffset?: number,
		additionalProps?: Record<string, any>,
	) => {
		let middle = el.text.slice(firstOffset, lastOffset);
		let right = el.text.slice(lastOffset);
		el.text = el.text.slice(0, firstOffset);

		const output: TextToken[] = [
			createTextToken(
				{
					...el.props,
					...additionalProps,
				},
				middle,
			),
		];

		if (lastOffset === undefined) {
			return output;
		}

		return output
			.concat(createTextToken(el.props, right))
			.filter((a) => a.text);
	};

	private _removeMention(
		mention: TextToken,
		preferNext: boolean,
	) {
		const parent = this.parent(mention.key);
		if (!parent) {
			return;
		}
		const index = parent.children.indexOf(mention);
		const previousId = parent.children[index - 1]?.id;
		const nextId = parent.children[index + 1]?.id;
		this.remove(mention.key);
		this.recalculate();
		const preferredId = preferNext ? nextId : previousId;
		const fallbackId = preferNext ? previousId : nextId;
		const targetId = preferredId || fallbackId;
		const targetKey = targetId ? this._idToKey[targetId] : undefined;
		const target = targetKey ? this.findElement(targetKey) : undefined;
		if (target && !isBlockToken(target)) {
			const useEnd = target.id === previousId;
			this.select(
				target,
				useEnd && target.type === "t" ? target.text.length : 0,
			);
		}
	}

	public action = (type: number, data?: any) => {
		// if (!this.history.locked) {
		// 	console.log("ACTION", {
		// 		type,
		// 		data,
		// 	});
		// }

		if (type === ACTION._Undo) {
			this.history.undo();
			return;
		}

		if (type === ACTION._Redo) {
			this.history.redo();
			return;
		}

		const markdownBoundary = this.selection.markdownBoundary;
		const selectionIsCollapsed =
			this.selection.first[0] === this.selection.last[0] &&
			this.selection.first[1] === this.selection.last[1];
		const safeFirst = this._resolveSelectionPoint(this.selection.first);
		const safeLast = this._resolveSelectionPoint(
			this.selection.last,
			!selectionIsCollapsed,
		);
		this.selection.setSelection(...safeFirst, ...safeLast);

		if (
			type === ACTION._InsertAttachment &&
			this.selectionTouchesCodeBlock
		) {
			return;
		}
		if (type === ACTION._InsertMention && data) {
			const request = data as InsertMentionData;
			const element = this.innerText(request.key);
			if (element && this.parent(element.key)?.type === "code") {
				return;
			}
		}
		if (
			(type === ACTION._FormatAdd || type === ACTION._FormatRemove) &&
			this._selectedTextRanges().length === 0
		) {
			return;
		}

		if (
			(type === ACTION._Key || type === ACTION._Compose) &&
			typeof data === "string" &&
			data &&
			!/\r|\n/.test(data) &&
			selectionIsCollapsed &&
			markdownBoundary
		) {
			this.action(ACTION._KeyMarkdownBoundary, {
				boundary: markdownBoundary,
				text: data,
			});
			return;
		}

		if (type === ACTION._Key && data === " ") {
			this.history.batch();
		}

		this._pushToHistory(type, data);

		if (
			(type === ACTION._Key || type === ACTION._Compose) &&
			this._selectionCoversDocument()
		) {
			// Replacing the entire document should not inherit its first block
			// style. A neutral paragraph also lets a pasted leading Markdown
			// marker establish the replacement document's intended block type.
			setBlockType(this.tokens[0], "p", {});
		}

		if (type === ACTION._UpdateImageAlt && data) {
			const key = this._idToKey[data.id];
			const image = key ? this.findElement(key) : undefined;
			if (image?.type !== "img") {
				return;
			}
			image.props.alt = String(data.alt || "");
			this.recalculate();
			return;
		}

		if (type === ACTION._RemoveSelectable && data?.id) {
			const key = this._idToKey[data.id];
			const token = key ? this.findElement(key) : undefined;
			const replacement = typeof data.text === "string" ? data.text : "";
			if (!token) {
				return;
			}
			if (isBlockToken(token)) {
				const index = this.tokens.indexOf(token);
				if (replacement) {
					this.tokens.splice(
						index,
						1,
						createBlockToken("p", {}, [createTextToken({}, replacement)]),
					);
				} else {
					this.tokens.splice(index, 1);
				}
				this._ensureEditableDocument();
				this.recalculate();
				const next = this.tokens[Math.min(index, this.tokens.length - 1)];
				const removedLast = index >= this.tokens.length;
				const target = removedLast
					? next.children[next.children.length - 1]
					: next.children[0];
				this.select(
					target,
					replacement && target.type === "t"
						? target.text.length
						: removedLast && target.type === "t"
						? target.text.length
						: 0,
				);
				return;
			}
			const parent = this.parent(token.key);
			if (!parent) {
				return;
			}
			const index = parent.children.indexOf(token);
			const inserted = replacement
				? createTextToken({}, replacement)
				: undefined;
			parent.children.splice(index, 1, ...(inserted ? [inserted] : []));
			if (!parent.children.length) {
				parent.children.push(createTextToken());
			}
			this.recalculate();
			const currentParent = this.findElement(this._idToKey[parent.id]);
			if (!currentParent || !isBlockToken(currentParent)) {
				return;
			}
			const next = currentParent.children[index];
			const target = next ||
				currentParent.children[currentParent.children.length - 1];
			this.select(
				target,
				inserted && target.type === "t"
					? target.text.length
					: next || target.type !== "t"
					? 0
					: target.text.length,
			);
			return;
		}

		if (type === ACTION._InsertMention && data) {
			const request = data as InsertMentionData;
			const element = this.innerText(request.key);
			const parent = element ? this.parent(element.key) : undefined;
			if (!element || !parent) {
				return;
			}
			const start = Math.max(0, Math.min(request.start, element.text.length));
			const end = Math.max(start, Math.min(request.end, element.text.length));
			const index = parent.children.indexOf(element);
			const before = createTextToken(
				element.props,
				element.text.slice(0, start),
			);
			const mention = createTextToken(
				{ ...markdownBaseProps(element.props), mention: request.mention },
				request.text,
			);
			const suffix = element.text.slice(end);
			const after = createTextToken(
				{
					...element.props,
					typingBoundary: suffix ? undefined : true,
				},
				suffix,
			);
			parent.children.splice(index, 1, before, mention, after);
			this.recalculate();
			this.select(after, 0);
			return;
		}

		if (type === ACTION._InsertAttachment && data) {
			// Remove the active range inside the same history transaction.
			this.history.lock(() => this.action(ACTION._Key, ""));
			const [key, offset] = this.selection.first;
			const element = this.innerText(key);
			const parent = element ? this.parent(element.key) : undefined;
			if (!element || !parent) {
				return;
			}

			const request = data as InsertAttachmentData;
			const index = parent.children.indexOf(element);
			const before = createTextToken(
				element.props,
				element.text.slice(0, offset),
			);
			const attachment = createAttachmentToken(
				{
					alt: request.alt,
					kind: request.kind,
					meta: request.meta,
					mimeType: request.mimeType,
					name: request.name,
					size: request.size,
				},
				request.src,
			);
			const after = createTextToken(element.props, element.text.slice(offset));
			parent.children.splice(index, 1, before, attachment, after);
			this.recalculate();
			this.select(after, 0);
			return;
		}

		if (type === ACTION._EnterCodeFence && data) {
			const request = data as EnterCodeFenceData;
			const blockKey = this._idToKey[request.blockId];
			const block = blockKey ? this.findElement(blockKey) : undefined;
			if (!block || block.type !== "code") {
				return;
			}

			let firstIndex = this.tokens.indexOf(block);
			let lastIndex = firstIndex;
			while (this.tokens[firstIndex - 1]?.type === "code") {
				firstIndex -= 1;
			}
			while (this.tokens[lastIndex + 1]?.type === "code") {
				lastIndex += 1;
			}

			if (request.side === "end") {
				const inserted = createBlockToken("p", {}, [createTextToken()]);
				this.tokens.splice(lastIndex + 1, 0, inserted);
				this.recalculate();
				this.select(inserted.children[0], 0);
				return;
			}

			const firstCode = this.tokens[firstIndex];
			const language = firstCode.type === "code"
				? firstCode.props.language
				: undefined;
			if (firstCode.type === "code") {
				firstCode.props.language = undefined;
			}
			const inserted = createBlockToken(
				"code",
				language ? { language } : {},
				[createTextToken()],
			);
			this.tokens.splice(firstIndex, 0, inserted);
			this.recalculate();
			this.select(inserted.children[0], 0);
			return;
		}

		if (type === ACTION._EditCodeFence && data) {
			const request = data as EditCodeFenceData;
			const blockKey = this._idToKey[request.blockId];
			const block = blockKey ? this.findElement(blockKey) : undefined;
			if (!block || block.type !== "code") {
				return;
			}

			let firstIndex = this.tokens.indexOf(block);
			let lastIndex = firstIndex;
			while (this.tokens[firstIndex - 1]?.type === "code") {
				firstIndex -= 1;
			}
			while (this.tokens[lastIndex + 1]?.type === "code") {
				lastIndex += 1;
			}

			const source = toMarkdown(this.tokens.slice(firstIndex, lastIndex + 1));
			const firstLineEnd = source.indexOf("\n");
			const lastLineStart = source.lastIndexOf("\n") + 1;
			const markerStart = request.side === "start" ? 0 : lastLineStart;
			const markerEnd = request.side === "start"
				? firstLineEnd < 0 ? source.length : firstLineEnd
				: source.length;
			const markerLength = markerEnd - markerStart;
			const start = Math.max(0, Math.min(request.start, markerLength));
			const end = Math.max(start, Math.min(request.end, markerLength));
			const inserted = request.text || "";
			const absoluteStart = markerStart + start;
			const absoluteEnd = markerStart + end;
			const nextSource = stringSplice(
				source,
				absoluteStart,
				absoluteEnd,
				inserted,
			);
			const lines = nextSource.split("\n");
			const opening = lines[0]?.match(/^(`{3,}|~{3,})([\w+-]*)$/);
			const closing = lines[lines.length - 1] || "";
			const validFence = Boolean(
				opening &&
					new RegExp(
						`^${opening[1][0] === "`" ? "`" : "~"}{${opening[1].length},}$`,
					).test(closing),
			);
			const nextBlocks = validFence
				? parseMarkdown(nextSource)
				: lines.map((line) =>
					createBlockToken("p", {}, parseInlineMarkdown(line))
				);
			const caretMarkerOffset = start + inserted.length;

			this.tokens.splice(
				firstIndex,
				lastIndex - firstIndex + 1,
				...nextBlocks,
			);
			this.recalculate();

			if (validFence) {
				const codeBlocks = this.tokens.slice(
					firstIndex,
					firstIndex + nextBlocks.length,
				).filter((candidate) => candidate.type === "code");
				const caretBlock = request.side === "start"
					? codeBlocks[0]
					: codeBlocks[codeBlocks.length - 1];
				const caretText = caretBlock?.children.find(
					(child): child is TextToken => child.type === "t",
				);
				if (caretBlock && caretText) {
					this._selectCodeFenceMarker(
						caretBlock,
						caretText,
						request.side,
						caretMarkerOffset,
					);
				}
				return;
			}

			const lineIndex = request.side === "start" ? 0 : lines.length - 1;
			const caretBlock = this.tokens[firstIndex + lineIndex];
			if (caretBlock && isBlockToken(caretBlock)) {
				const point = this._textPointAtBlockOffset(
					caretBlock,
					caretMarkerOffset,
					true,
				);
				if (point) {
					this.select(point.element, point.offset);
				}
			}
			return;
		}

		if (type === ACTION._EditMarkdown && data) {
			const request = data as EditMarkdownData;
			const blockKey = this._idToKey[request.blockId];
			const block = blockKey ? this.findElement(blockKey) : undefined;
			if (
				!block ||
				!isBlockToken(block) ||
				block.type === "code" ||
				block.type === "hr"
			) {
				return;
			}

			const targetChildren = block.type === "tr" &&
					typeof request.tableCell === "number"
				? block.children.filter((child) =>
					child.props.tableCell === request.tableCell
				)
				: block.children;
			const chunks = inlineMarkdownChunks(targetChildren);
			const baseProps = new Map<number, Record<string, any>>();
			let source = "";
			for (const chunk of chunks) {
				const sourceStart = source.length;
				source += chunk.text;
				if (!chunk.props) {
					continue;
				}
				const props = markdownBaseProps(chunk.props);
				for (let index = sourceStart; index < source.length; index++) {
					baseProps.set(index, props);
				}
			}

			const start = Math.max(0, Math.min(request.start, source.length));
			const end = Math.max(start, Math.min(request.end, source.length));
			const inserted = request.text || "";
			const nextSource = stringSplice(source, start, end, inserted);
			const insertedBaseProps = baseProps.get(start) ||
				baseProps.get(Math.max(0, start - 1)) || {};
			const parsed = parseInlineMarkdownDetailed(nextSource, {
				basePropsAt: (index) => {
					if (index < start) {
						return baseProps.get(index) || {};
					}
					if (index < start + inserted.length) {
						return insertedBaseProps;
					}
					return baseProps.get(index - inserted.length + end - start) || {};
				},
			});
			const caretSourceOffset = start + inserted.length;
			const caret = parsedMarkdownCaret(parsed, caretSourceOffset);
			const blockId = block.id;
			const nextChildren = parsed.map(({ token }) => token);
			if (
				block.type === "tr" &&
				typeof request.tableCell === "number"
			) {
				const firstIndex = block.children.findIndex((child) =>
					child.props.tableCell === request.tableCell
				);
				const cellLength = block.children.filter((child) =>
					child.props.tableCell === request.tableCell
				).length;
				block.children.splice(firstIndex, cellLength, ...nextChildren);
			} else {
				block.children = nextChildren;
			}
			this.recalculate();

			const caretElement = caret
				? this.findElement(this._idToKey[caret.id])
				: undefined;
			if (caret && caretElement?.type === "t") {
				this.select(
					caretElement,
					Math.min(caret.offset, caretElement.text.length),
				);
			}
			if (block.type !== "tr") {
				this._stack.push(() =>
					setInlineMarkdownCaret(blockId, caretSourceOffset)
				);
			}
			return;
		}

		if (
			type === ACTION._KeyMarkdownBoundary &&
			typeof data?.text === "string"
		) {
			const boundary = data.boundary as MarkdownBoundary;
			const key = this._idToKey[boundary.tokenId];
			const element = key ? this.findElement(key) : undefined;
			if (element?.type !== "t") {
				return;
			}

			const parent = this.parent(element.key);
			if (!parent) {
				return;
			}

			let blockOffset = 0;
			for (const child of parent.children) {
				if (child === element) {
					if (boundary.side === "after") {
						blockOffset += element.text.length;
					}
					break;
				}
				if (child.type === "t") {
					blockOffset += child.text.length;
				}
			}

			this.insert(
				[createTextToken(boundary.format, data.text)],
				element,
				boundary.side === "before" ? 0 : 1,
			);
			const parentId = parent.id;
			this.recalculate();
			const currentParentKey = this._idToKey[parentId];
			const currentParent = currentParentKey
				? this.findElement(currentParentKey)
				: undefined;
			if (currentParent && isBlockToken(currentParent)) {
				const point = this._textPointAtBlockOffset(
					currentParent,
					blockOffset + data.text.length,
					true,
				);
				if (point) {
					this.select(point.element, point.offset);
				}
			}
			return;
		}

		if (
			type === ACTION._RemoveMarkdownFormat &&
			Array.isArray(data?.regions)
		) {
			const request = data as RemoveMarkdownFormatData;
			for (const region of request.regions) {
				const blockKey = this._idToKey[region.blockId];
				const block = blockKey ? this.findElement(blockKey) : undefined;
				if (!block || !isBlockToken(block)) {
					continue;
				}

				const first = this._textPointAtBlockOffset(
					block,
					region.start,
				);
				const last = this._textPointAtBlockOffset(
					block,
					region.end,
					true,
				);
				if (!first || !last) {
					continue;
				}

				this.selection.setSelection(
					first.element.key,
					first.offset,
					last.element.key,
					last.offset,
				);
				this.history.lock(() =>
					this.action(ACTION._FormatRemove, [region.key, region.value])
				);
			}

			const caretBlockKey = this._idToKey[request.caret.blockId];
			const caretBlock = caretBlockKey
				? this.findElement(caretBlockKey)
				: undefined;
			if (caretBlock && isBlockToken(caretBlock)) {
				const point = this._textPointAtBlockOffset(
					caretBlock,
					request.caret.offset,
					true,
				);
				if (point) {
					this.select(point.element, point.offset);
				}
			}
			return;
		}

		if (type === ACTION._Todo && Array.isArray(data)) {
			const [key, done] = data;
			const todo = this.findElement(key);
			if (todo?.type === "todo") {
				todo.props.done = Boolean(done);
				this.update();
			}
			return;
		}

		if (
			type === ACTION._Key && typeof data === "string" && /\r|\n/.test(data)
		) {
			const lines = data.replace(/\r\n?/g, "\n").split("\n");
			this.history.lock(() => {
				this.action(ACTION._Key, lines[0]);
				for (const line of lines.slice(1)) {
					this.action(ACTION._Enter);
					const [currentKey, currentOffset] = this.selection.last;
					const current = this.innerText(currentKey);
					const parent = current ? this.parent(current.key) : undefined;
					// Interactive Enter intentionally continues quotes and lists.
					// Clipboard lines are independent Markdown source lines, so an
					// inherited block would make every following line part of the
					// first quote/list. Code is the exception: its lines remain
					// literal until a closing fence is entered.
					if (
						current &&
						parent &&
						parent.type !== "p" &&
						parent.type !== "code"
					) {
						setBlockType(parent, "p", {});
						this.recalculate();
						const restored = this.findElement(
							this._idToKey[current.id],
						);
						if (restored?.type === "t") {
							this.select(restored, currentOffset);
						}
					}
					if (line) {
						this.action(ACTION._Key, line);
					}
				}
			});
			return;
		}

		let {
			first: [firstKey, firstOffset],
			last: [lastKey, lastOffset],
		} = this.selection;

		const f1 = this.innerNode(firstKey);

		const removeFirstUrl = f1.type === "t" && f1.props?.url;

		if (
			removeFirstUrl &&
			firstKey === lastKey &&
			[
					ACTION._Tab,
					ACTION._ShiftTab,
					ACTION._FormatRemove,
					ACTION._FormatAdd,
				].indexOf(type) === -1
		) {
			f1.props.url = undefined;
			this.recalculate();

			if ([ACTION._Key, ACTION._Enter, ACTION._Compose].indexOf(type) > -1) {
				this.action(type, data);
			}

			return;
		}

		const selectionIsRange = firstKey !== lastKey ||
			firstOffset !== lastOffset;
		const backwardDeletion = [
			ACTION._Remove,
			ACTION._RemoveWord,
			ACTION._RemoveLine,
		].includes(type);
		const forwardDeletion = [
			ACTION._Delete,
			ACTION._DeleteWord,
			ACTION._DeleteLine,
		].includes(type);
		const deletionType = type;

		if (backwardDeletion && selectionIsRange) {
			type = ACTION._Key;
			data = "";
		} else if (backwardDeletion) {
			const element = this.innerNode(firstKey);

			if (element.type !== "t") {
				const previous = this.previousText(element.key);
				this.remove(element.key);
				this.recalculate();
				if (previous) {
					const previousAfterCalculation = this.findElement(previous.key);
					if (previousAfterCalculation?.type === "t") {
						this.select(
							previousAfterCalculation,
							previousAfterCalculation.text.length,
						);
					}
				}
				return;
			} else if (element.props.mention) {
				this._removeMention(element, true);
				return;
			} else if (firstOffset > 0) {
				firstOffset = deletionType === ACTION._RemoveLine
					? 0
					: deletionType === ACTION._RemoveWord
					? previousWordBoundary(element.text, firstOffset)
					: previousGraphemeBoundary(element.text, firstOffset);
				type = ACTION._Key;
				data = "";
			} else {
				const parent = this.parent(element.key);
				const childIndex = parent?.children.indexOf(element) ?? -1;
				const previous = childIndex > 0
					? parent!.children[childIndex - 1]
					: undefined;

				if (previous?.type === "t" && previous.props.mention) {
					this._removeMention(previous, true);
					return;
				} else if (previous?.type === "t" && previous.text) {
					firstKey = previous.key;
					lastKey = previous.key;
					lastOffset = previous.text.length;
					firstOffset = deletionType === ACTION._RemoveLine
						? 0
						: deletionType === ACTION._RemoveWord
						? previousWordBoundary(previous.text, lastOffset)
						: previousGraphemeBoundary(previous.text, lastOffset);
					type = ACTION._Key;
					data = "";
				} else if (previous) {
					this.remove(previous.key);
					this.recalculate();
					const current = this.findElement(element.key);
					if (current) {
						this.select(current, 0);
					}
					return;
				} else {
					this._handleInitialRemove(element);
					this.recalculate();
					return;
				}
			}
		}

		if (forwardDeletion && selectionIsRange) {
			type = ACTION._Key;
			data = "";
		} else if (forwardDeletion) {
			const element = this.innerNode(firstKey);

			if (element.type !== "t") {
				this.remove(element.key);
				this.recalculate();
				return;
			} else if (element.props.mention) {
				this._removeMention(element, true);
				return;
			} else if (firstOffset < element.text.length) {
				lastOffset = deletionType === ACTION._DeleteLine
					? element.text.length
					: deletionType === ACTION._DeleteWord
					? nextWordBoundary(element.text, firstOffset)
					: nextGraphemeBoundary(element.text, firstOffset);
				type = ACTION._Key;
				data = "";
			} else {
				const orderedKeys = this._orderedKeys();
				const currentIndex = orderedKeys.indexOf(element.key);
				const next = orderedKeys.slice(currentIndex + 1)
					.map((key) => this.findElement(key))
					.find(isInlineToken);

				if (!next) {
					return;
				}

				if (next.type === "t" && next.props.mention) {
					this._removeMention(next, false);
					return;
				}

				if (next.type !== "t") {
					this.remove(next.key);
					this.recalculate();
					const current = this.findElement(element.key);
					if (current) {
						this.select(current, firstOffset);
					}
					return;
				}

				lastKey = next.key;
				const sameParent = this.parent(next.key) === this.parent(element.key);
				lastOffset = sameParent
					? deletionType === ACTION._DeleteLine
						? next.text.length
						: deletionType === ACTION._DeleteWord
						? nextWordBoundary(next.text, 0)
						: nextGraphemeBoundary(next.text, 0)
					: 0;
				type = ACTION._Key;
				data = "";
			}
		}

		// TAB key
		if (type === ACTION._Tab || type === ACTION._ShiftTab) {
			let firstElement = this.innerNode(firstKey);
			let firstParent = this.parent(firstElement.key)!;
			let lastElement = this.innerNode(lastKey);
			let lastParent = this.parent(lastElement.key)!;

			if (
				firstParent.type === "code" &&
				firstParent === lastParent &&
				firstKey === lastKey &&
				firstOffset === lastOffset
			) {
				this.action(ACTION._Key, type === ACTION._Tab ? "\t" : "");
				return;
			}

			handleTab(firstParent, lastParent, this, type === ACTION._ShiftTab);

			return;
		}

		// ENTER key
		if (type === ACTION._Enter) {
			let firstElement = this.innerText(firstKey);
			let lastElement = this.innerText(lastKey);

			if (!firstElement || !lastElement) {
				if (!firstElement) {
					firstElement = this._replaceInlineWithText(firstKey);
				}
				if (!lastElement) {
					lastElement = firstKey === lastKey
						? firstElement
						: this._replaceInlineWithText(lastKey);
				}
				if (!firstElement || !lastElement) {
					return;
				}
			}

			const firstParent = this.parent(firstElement.key)!;
			const lastParent = this.parent(lastElement.key)!;

			if (
				firstKey === lastKey &&
				firstOffset === lastOffset &&
				firstParent === lastParent &&
				firstParent.children.length === 1 &&
				firstElement === lastElement
			) {
				const fence = firstElement.text.match(
					/^\s{0,3}(?:`{3,}|~{3,})\s*([\w+-]*)\s*$/,
				);
				if (firstParent.type === "p" && fence) {
					firstElement.text = "";
					setBlockType(firstParent, "code", {
						language: fence[1] || undefined,
					});
					this.recalculate();
					this.select(firstParent.children[0], 0);
					return;
				}

				if (
					firstParent.type === "code" &&
					/^\s*(?:`{3,}|~{3,})\s*$/.test(firstElement.text)
				) {
					firstElement.text = "";
					setBlockType(firstParent, "p", {});
					this.recalculate();
					this.select(firstParent.children[0], 0);
					return;
				}
			}

			if (
				firstKey === lastKey &&
				firstOffset === 0 &&
				lastOffset === 0 &&
				(
					firstParent.type === "l" ||
					firstParent.type === "todo" ||
					firstParent.type === "quote"
				) &&
				firstParent.children.every((child) =>
					child.type !== "t" || child.text.trim().length === 0
				)
			) {
				for (const child of firstParent.children) {
					if (child.type === "t") {
						child.text = "";
					}
				}
				if (
					(firstParent.type === "l" || firstParent.type === "todo") &&
					(firstParent.props.indent || 0) > 0
				) {
					firstParent.props.indent = (firstParent.props.indent || 0) - 1;
					this.recalculate();
					this.select(firstParent.children[0], 0);
					return;
				}
				if (
					firstParent.type === "quote" &&
					(firstParent.props.level || 1) > 1
				) {
					firstParent.props.level = (firstParent.props.level || 1) - 1;
					this.recalculate();
					this.select(firstParent.children[0], 0);
					return;
				}
				setBlockType(firstParent, "p", {});
				this.recalculate();
				this.select(firstParent.children[0], 0);
				return;
			}

			const siblings = this.nextSiblings(lastElement.key, true)
				.filter((e) => e.key >= lastElement!.key)
				.map(cloneToken);
			if (siblings[0]?.type === "t" && siblings[0].text) {
				siblings[0].text = siblings[0].text.slice(lastOffset);
			}
			const hasContentAfter = siblings.some((sibling) =>
				sibling.type !== "t" || sibling.text.length > 0
			);

			firstElement.text = firstElement.text.slice(0, firstOffset);

			const newToken = createBlockToken("p", {}, [
				...siblings,
				createTextToken(),
			]);
			const lastKeyChunks = lastElement.key.split(".");
			this.removeBetween(
				firstElement.key,
				String(parseInt(lastKeyChunks[0], 10) + 1),
				false,
			);
			const clonedTokens = this.insert([newToken], firstParent);
			this.recalculate();
			this.select(this.nextText(clonedTokens[0].key)!, 0);
			// this._stack.push(() => setCaret(this.nextText(clonedTokens[0].key)!.id, 0));

			if (firstParent === lastParent) {
				handleEnter(
					firstParent,
					clonedTokens[0],
					this,
					firstOffset,
					hasContentAfter,
				);
			}

			return;
		}

		if (
			(type === ACTION._FormatAdd || type === ACTION._FormatRemove) &&
			data != null
		) {
			if (firstKey === lastKey && firstOffset === lastOffset) {
				return;
			}

			const [key, value] = data;
			const newProps = {
				[key]: type === ACTION._FormatAdd ? value : undefined,
				...(key === "code" && type === ACTION._FormatRemove
					? { codeMarker: undefined }
					: {}),
				...(key === "code" && type === ACTION._FormatAdd
					? {
						codeMarker: "`".repeat(
							Math.max(
								1,
								...(this.selectedText().match(/`+/g) || []).map(
									(run) => run.length + 1,
								),
							),
						),
					}
					: {}),
			};

			this.selection.setFormat({
				...this.selection.format,
				...newProps,
			});

			const ranges = this._selectedTextRanges();
			if (
				type === ACTION._FormatAdd &&
				ranges.some(({ element, start, end }) =>
					/\S/.test(element.text.slice(start, end))
				)
			) {
				const firstRange = ranges[0];
				const lastRange = ranges[ranges.length - 1];
				if (firstRange) {
					const leading = firstRange.element.text
						.slice(firstRange.start, firstRange.end)
						.match(/^\s+/)?.[0].length || 0;
					firstRange.start += leading;
				}
				if (lastRange) {
					const trailing = lastRange.element.text
						.slice(lastRange.start, lastRange.end)
						.match(/\s+$/)?.[0].length || 0;
					lastRange.end -= trailing;
				}
				while (ranges[0]?.end <= ranges[0]?.start) {
					ranges.shift();
				}
				while (
					ranges[ranges.length - 1]?.end <=
						ranges[ranges.length - 1]?.start
				) {
					ranges.pop();
				}
			}

			// if (ACTION._FormatAdd) {
			// 	console.log(
			// 		"%c + STYLE ",
			// 		"background: #00b33c; color: black; font-weight: bold;",
			// 		elements.map((e) => e.key),
			// 		...data,
			// 	);
			// } else {
			// 	console.log(
			// 		"%c - STYLE ",
			// 		"background: #e62e00; color: black; font-weight: bold;",
			// 		elements.map((e) => e.key),
			// 		...data,
			// 	);
			// }

			if (ranges.length === 0) {
				this.selection.setFormat(this.getSelectionFormat());
				return;
			}

			if (ranges.length === 1) {
				const { element, start, end } = ranges[0];
				const rest = this._cut(element, start, end, newProps);

				if (key === "url") {
					rest[0].text = "";
					this.insert(
						[
							createTextToken(undefined, ""),
							...rest,
							createTextToken(undefined, ""),
						],
						element,
					);
				} else {
					this.insert(rest, element);
				}

				this.recalculate();

				return;
			}

			const firstRange = ranges.shift()!;
			const lastRange = ranges.pop()!;

			this.insert(
				this._cut(firstRange.element, firstRange.start, undefined, newProps),
				firstRange.element,
			);

			this.insert(
				this._cut(lastRange.element, 0, lastRange.end, newProps),
				lastRange.element,
			);

			if (!firstRange.element.text && !ranges.length) {
				this.remove(firstRange.element.key);
			}

			for (const { element } of ranges) {
				element.props = {
					...element.props,
					...newProps,
				};
			}

			this.recalculate();
			return;
		}

		// Composition uses the same replacement semantics as ordinary text input,
		// but keeps a single history trace for the completed composition.
		if (type === ACTION._Compose && data != null) {
			this.history.lock(() => this.action(ACTION._Key, data));
			return;
		}

		// Handle new text being added
		if (type === ACTION._Key && data != null) {
			let firstElement = this.innerText(firstKey)!;
			let lastElement = this.innerText(lastKey)!;

			if (!firstElement || !lastElement) {
				if (!firstElement) {
					firstElement = this._replaceInlineWithText(firstKey)!;
				}
				if (!lastElement) {
					lastElement = firstKey === lastKey
						? firstElement
						: this._replaceInlineWithText(lastKey)!;
				}
			}

			if (!firstElement && !lastElement) {
				return;
			}

			if (
				firstElement === lastElement &&
				firstOffset === lastOffset &&
				firstElement.props.mention
			) {
				const parent = this.parent(firstElement.key);
				if (!parent) {
					return;
				}
				const index = parent.children.indexOf(firstElement);
				const boundary = createTextToken({ typingBoundary: true });
				parent.children.splice(
					index + (firstOffset > 0 ? 1 : 0),
					0,
					boundary,
				);
				this.recalculate();
				firstElement = boundary;
				lastElement = boundary;
				firstKey = boundary.key;
				lastKey = boundary.key;
				firstOffset = 0;
				lastOffset = 0;
			}

			if (
				firstElement === lastElement &&
				firstOffset === 0 &&
				lastOffset === 0
			) {
				const currentParent = this.parent(firstElement.key);
				const currentIndex = currentParent?.children.indexOf(firstElement) ??
					-1;
				const previous = currentParent?.children[currentIndex - 1];
				if (
					currentParent &&
					previous?.type === "t" &&
					previous.props.mention
				) {
					const boundary = createTextToken({ typingBoundary: true });
					currentParent.children.splice(currentIndex, 0, boundary);
					this.recalculate();
					firstElement = boundary;
					lastElement = boundary;
					firstKey = boundary.key;
					lastKey = boundary.key;
					firstOffset = 0;
					lastOffset = 0;
				}
			}

			const parent = this.parent(firstKey)!;
			const index = parent.children.indexOf(firstElement);
			const lastText = lastElement.text;
			delete firstElement.props.typingBoundary;
			firstElement.text = firstElement.text.slice(0, firstOffset) + data;

			const firstText = firstElement.text;

			if (firstElement !== lastElement) {
				const siblings = this.nextSiblings(lastElement.key, true)
					.filter((e) => e.key >= lastElement.key)
					.map(cloneToken);
				if (siblings[0]?.type === "t" && siblings[0].text) {
					siblings[0].text = siblings[0].text.slice(lastOffset);
				}

				const lastKeyChunks = lastElement.key.split(".");
				this.removeBetween(
					firstElement.key,
					String(parseInt(lastKeyChunks[0], 10) + 1),
					false,
				);

				this.insert(siblings, firstElement);

				// this.recalculate();

				// this.select(parent.children[index], firstText.length);
				// return;
			} else {
				firstElement.text += lastText.slice(lastOffset);
				// this.recalculate();
				// this.select(firstElement, firstText.length);
			}

			const prev = parent.children[index - 1];
			const previousLength = (prev as any)?.text?.length || 0;

			delete firstElement.props.url;
			delete lastElement.props.url;
			if (!firstElement.text) {
				firstElement.props = markdownBaseProps(firstElement.props);
				delete firstElement.props.mention;
			}

			this.recalculate();

			const transform = data
				? this._handleTextTransforms(firstElement, data, firstOffset)
				: undefined;
			if (transform === "block" || transform === "inline") {
				return;
			}
			if (transform) {
				this.recalculate();
			}

			const correctedChild = parent.children[index] as any;

			if (prev && correctedChild !== firstElement) {
				// Element was deleted fallback to previous element
				this.select(prev, previousLength);
			} else {
				this.select(
					correctedChild,
					transform
						? Math.min(correctedChild.text.length, transform.caret)
						: Math.min(correctedChild.text.length, firstText.length),
				);
			}

			// if (firstElement.text) {
			// 	this.select(firstElement, firstText.length);
			// 	// this._stack.push(() =>
			// 	// 	setCaret(firstElement.id, firstOffset + (data?.length as number)),
			// 	// );
			// 	// this.recalculate();
			// 	return;
			// }

			// // Hello {World} 2
			// // ^^^^^^ > backspace
			// if (firstElement.key.endsWith(".0")) {
			// 	const parent = this.parent(firstElement.key)!;

			// 	// this._stack.push(() => setCaret(parent.id, 0));
			// 	this.select(parent, 0);
			// 	this.recalculate();

			// 	// resetSelection(firstKey, 0);
			// 	return;
			// }

			// // Hello {World} 2
			// //        ^^^^^ > backspace
			// const prev = this.previousText(firstElement.key)!;
			// this.select(prev, prev.text.length || 0);
			// this.recalculate();
			return;
		}
	};

	// private _selectSilent = (first: AnyToken, start: number = 0) => {
	// 	if (this._isComposing) {
	// 		return;
	// 	}

	// 	this._stack.push(() => setCaret(first.id, start));
	// 	this.update();
	// };

	public select = (
		first: AnyToken,
		firstOffset: number = 0,
		last: AnyToken = first,
		lastOffset: number = firstOffset,
	) => {
		if (this._isComposing || !first || !last) {
			return;
		}

		first = isBlockToken(first) ? first.children[0] : first;
		last = isBlockToken(last) ? last.children[last.children.length - 1] : last;

		if (!first || !last) {
			return;
		}

		const firstMax = first.type === "t" ? first.text.length : 0;
		const lastMax = last.type === "t" ? last.text.length : 0;
		const selectionIsCollapsed = first === last && firstOffset === lastOffset;
		firstOffset = first.type === "t"
			? snapGraphemeBoundary(first.text, firstOffset)
			: Math.max(0, Math.min(firstOffset, firstMax));
		lastOffset = last.type === "t"
			? snapGraphemeBoundary(last.text, lastOffset, !selectionIsCollapsed)
			: Math.max(0, Math.min(lastOffset, lastMax));

		// console.log(
		// 	"%c SELECT ",
		// 	"background-color: salmon; color: black; font-weight: bold;",
		// 	{
		// 		first: first.key,
		// 		firstOffset,
		// 		last: last.key,
		// 		lastOffset,
		// 	},
		// );

		// this._selectSilent(first, firstOffset);
		this._stack.push(() =>
			setCaret(first.id, firstOffset, last.id, lastOffset)
		);

		this.update();
		this.selection.setSelection(first.key, firstOffset, last.key, lastOffset);
		this.selection.setFormat(this.getSelectionFormat());
	};

	// public select2 = (
	// 	first: AnyToken,
	// 	firstOffset: number = 0,
	// 	last: AnyToken = first,
	// 	lastOffset: number = firstOffset,
	// ) => {
	// 	return;
	// 	if (this._isComposing) {
	// 		return;
	// 	}

	// 	// this._selectSilent(first, firstOffset);
	// 	this._stack.push(() =>
	// 		setCaret(first.id, firstOffset, last.id, lastOffset),
	// 	);

	// 	this.update();
	// 	this.selection.setSelection(first.key, firstOffset, last.key, lastOffset);
	// };
}
