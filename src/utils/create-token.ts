import type {
	AttachmentToken,
	BlockProps,
	BlockToken,
	BlockTokenOfType,
	BlockType,
	ImgToken,
	InlineToken,
	TextToken,
} from "../tokens.ts";

let id = 0;

// @TODO create format cutter
export function createTextToken(
	props: Record<string, any> = {},
	text: string = "",
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

export function createAttachmentToken(
	props: AttachmentToken["props"],
	src: string,
): AttachmentToken {
	return {
		type: "attachment",
		id: "" + id++,
		key: "",
		props,
		src,
	};
}

export function createBlockToken<Type extends BlockType>(
	type: Type,
	props: BlockProps<Type> = {} as BlockProps<Type>,
	children: InlineToken[] = [],
): BlockTokenOfType<Type> {
	return {
		type,
		id: "" + id++,
		key: "",
		props,
		children,
	} as BlockTokenOfType<Type>;
}
