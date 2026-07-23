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
	url?: string;
}

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

export type BlockToken = ParagraphToken | HeadingToken | TodoToken | ListToken;
export type InlineToken = TextToken | ImgToken | UrlToken;
export type AnyToken = InlineToken | BlockToken;
export type TokenRoot = BlockToken[];

export type BlockType = BlockToken["type"];
export type BlockTokenOfType<Type extends BlockType> = Extract<
	BlockToken,
	{ type: Type }
>;
export type BlockProps<Type extends BlockType> = BlockTokenOfType<
	Type
>["props"];

export function isBlockToken(token: AnyToken): token is BlockToken {
	return "children" in token;
}

export function isInlineToken(token: AnyToken): token is InlineToken {
	return !isBlockToken(token);
}

export function setBlockType<Type extends BlockType>(
	token: BlockToken,
	type: Type,
	props: BlockProps<Type>,
): BlockTokenOfType<Type> {
	Object.assign(token, { type, props });
	return token as BlockTokenOfType<Type>;
}
