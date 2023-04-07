export interface PluginToken {
	type: string;
	id: string;
	props: Record<string, any>;
	children: any[];
}
export interface Token {
	id: string;
	key: string;
	props: Record<string, any>;
}
export interface TextToken extends Token {
	type: "t";
	text: string;
}
export interface UrlToken extends Token {
	type: "url";
	src: string;
}
export interface ImgToken extends Token {
	type: "img";
	src: string;
}
interface ParagraphToken extends Token {
	type: "p";
	props: {
		indent?: number;
	};
	children: InlineToken[];
}
interface HeadingToken extends Token {
	type: "h";
	props: {
		size: number;
	};
	children: InlineToken[];
}
interface ListToken extends Token {
	type: "l";
	props: {
		type: string;
		indent?: number;
	};
	children: InlineToken[];
}
interface TodoToken extends Token {
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
