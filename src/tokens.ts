interface Token {
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
	children: TextToken[];
}
interface HeadingToken extends Token {
	type: "h";
	props: {
		size: 1 | 2 | 3 | 4 | 5 | 6;
	};
	children: TextToken[];
}
export type BlockToken = ParagraphToken | HeadingToken;
export type AnyToken = TextToken | BlockToken;
export type TokenRoot = BlockToken[];
