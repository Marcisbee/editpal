import type { BlockToken, ImgToken, InlineToken, TextToken } from "../tokens";

let id = 0;

// @TODO create format cutter
export function createTextToken(
	props: Record<string, any> = {},
	text: string,
): TextToken {
	return {
		type: "t",
		id: "" + id++,
		key: "",
		props,
		text,
	};
}

export function createImgToken(
	props: Record<string, any> = {},
	src: string,
): ImgToken {
	return {
		type: "img",
		id: "" + id++,
		key: "",
		props,
		src,
	};
}

export function createBlockToken(
	type: BlockToken["type"],
	props: Record<string, any> = {},
	children: InlineToken[] = [],
): BlockToken {
	return {
		type,
		id: "" + id++,
		key: "",
		props,
		children,
	};
}
