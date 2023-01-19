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
interface ParagraphToken extends Token {
	type: "p";
	props: {
		indent?: number;
	};
	children: TextToken[];
}
interface HeadingToken extends Token {
	type: "h";
	props: {
		size: number;
	};
	children: TextToken[];
}
interface ListToken extends Token {
	type: "l";
	props: {
		type: string;
		indent?: number;
	};
	children: TextToken[];
}
interface TodoToken extends Token {
	type: "todo";
	props: {
		indent?: number;
		done?: boolean;
	};
	children: TextToken[];
}
export type BlockToken = ParagraphToken | HeadingToken | TodoToken | ListToken;
export type AnyToken = TextToken | BlockToken;
export type TokenRoot = BlockToken[];
