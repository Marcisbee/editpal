export interface PluginToken {
	type: string;
	id: string;
	props: Record<string, any>;
	children: any[];
}

export interface UrlMetadata {
	icon?: string;
}

export interface Token<
	Props extends Record<string, any> = Record<string, any>,
> {
	id: string;
	key: string;
	props: Props;
}

export interface TextTokenProps extends Record<string, any> {
	boldMarker?: string;
	code?: boolean;
	highlight?: boolean;
	italicMarker?: string;
	link?: string;
	markdownEscape?: boolean;
	/** Internal cell index for inline content belonging to a table row. */
	tableCell?: number;
	url?: string;
	mention?: MentionData;
	/** Internal empty token used to keep typing outside an inline atom. */
	typingBoundary?: boolean;
}

export type JsonValue =
	| boolean
	| null
	| number
	| string
	| JsonValue[]
	| { [key: string]: JsonValue };

export interface MentionData<Value extends JsonValue = JsonValue> {
	configId: string;
	id: string;
	label: string;
	trigger: string;
	value?: Value;
}

/** Editable text and its active inline Markdown formatting. */
export interface TextToken extends Token<TextTokenProps> {
	type: "t";
	text: string;
	meta?: UrlMetadata;
}

export interface UrlToken extends Token {
	type: "url";
	src: string;
	meta?: UrlMetadata;
}

export interface ImgTokenProps extends Record<string, any> {
	alt?: string;
}

export interface ImgToken extends Token<ImgTokenProps> {
	type: "img";
	src: string;
}

export interface AttachmentTokenProps extends Record<string, any> {
	alt?: string;
	kind: "file" | "image" | "video";
	meta?: Record<string, JsonValue>;
	mimeType?: string;
	name: string;
	size?: number;
}

/** An uploaded file represented as an atomic inline editor item. */
export interface AttachmentToken extends Token<AttachmentTokenProps> {
	type: "attachment";
	src: string;
}

export interface ParagraphToken extends Token {
	type: "p";
	props: {
		indent?: number;
	};
	children: InlineToken[];
}

export interface HeadingToken extends Token {
	type: "h";
	props: {
		size: number;
	};
	children: InlineToken[];
}

export interface ListToken extends Token {
	type: "l";
	props: {
		type: string;
		indent?: number;
		start?: number;
	};
	children: InlineToken[];
}

export interface TodoToken extends Token {
	type: "todo";
	props: {
		indent?: number;
		done?: boolean;
	};
	children: InlineToken[];
}

export interface QuoteToken extends Token {
	type: "quote";
	props: {
		level?: number;
	};
	children: InlineToken[];
}

export interface CodeToken extends Token {
	type: "code";
	props: {
		language?: string;
	};
	children: InlineToken[];
}

export interface HorizontalRuleToken extends Token {
	type: "hr";
	props: Record<string, never>;
	children: InlineToken[];
}

export type TableAlignment = "center" | "left" | "none" | "right";

export interface TableRowToken extends Token {
	type: "tr";
	props: {
		alignments: TableAlignment[];
		header?: boolean;
	};
	children: InlineToken[];
}

/** A block-level Markdown token such as a paragraph, heading, or code line. */
export type BlockToken =
	| ParagraphToken
	| HeadingToken
	| TodoToken
	| ListToken
	| QuoteToken
	| CodeToken
	| HorizontalRuleToken
	| TableRowToken;
/** Inline document content: editable text, an image, or an automatic URL. */
export type InlineToken = TextToken | ImgToken | UrlToken | AttachmentToken;
/** Any token that may appear in an Editpal document. */
export type AnyToken = InlineToken | BlockToken;
/** Root representation of a parsed Markdown document. */
export type TokenRoot = BlockToken[];

export type BlockType = BlockToken["type"];
export type BlockTokenOfType<Type extends BlockType> = Extract<
	BlockToken,
	{ type: Type }
>;
export type BlockProps<Type extends BlockType> = BlockTokenOfType<
	Type
>["props"];

export function isBlockToken(
	token: AnyToken | null | undefined,
): token is BlockToken {
	return Boolean(token && typeof token === "object" && "children" in token);
}

export function isInlineToken(
	token: AnyToken | null | undefined,
): token is InlineToken {
	return Boolean(token && !isBlockToken(token));
}

export function setBlockType<Type extends BlockType>(
	token: BlockToken,
	type: Type,
	props: BlockProps<Type>,
): BlockTokenOfType<Type> {
	Object.assign(token, { type, props });
	return token as BlockTokenOfType<Type>;
}

/** Return the inline content for each cell in a parsed table row. */
export function tableRowCells(
	row: TableRowToken,
): InlineToken[][] {
	const count = Math.max(
		row.props.alignments.length,
		...row.children.map((child) =>
			typeof child.props.tableCell === "number" ? child.props.tableCell + 1 : 1
		),
	);
	const cells = Array.from({ length: count }, () => [] as InlineToken[]);
	for (const child of row.children) {
		const index = typeof child.props.tableCell === "number"
			? Math.max(0, Math.floor(child.props.tableCell))
			: 0;
		while (cells.length <= index) {
			cells.push([]);
		}
		cells[index].push(child);
	}
	return cells;
}
