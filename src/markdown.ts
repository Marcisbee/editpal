export interface MarkdownAffixes {
	before: MarkdownMarker[];
	after: MarkdownMarker[];
}

export interface MarkdownMarker {
	key: string;
	marker: string;
}

interface MarkdownFormat {
	key: string;
	active: (props: Record<string, any>) => boolean;
	close: (props: Record<string, any>) => string;
	open: (props: Record<string, any>) => string;
	signature?: (props: Record<string, any>) => string;
}

const MARKDOWN_FORMATS: MarkdownFormat[] = [
	{
		key: "link",
		active: (props) => typeof props.link === "string" && props.link.length > 0,
		open: () => "[",
		close: (props) => `](${props.link})`,
		signature: (props) => String(props.link),
	},
	{
		key: "textDecoration",
		active: (props) =>
			typeof props.textDecoration === "string" &&
			props.textDecoration.split(/\s+/).includes("line-through"),
		open: () => "~~",
		close: () => "~~",
	},
	{
		key: "fontWeight",
		active: (props) =>
			props.fontWeight === "bold" ||
			(typeof props.fontWeight === "number" && props.fontWeight >= 600),
		open: (props) => props.boldMarker || "**",
		close: (props) => props.boldMarker || "**",
		signature: (props) => props.boldMarker || "**",
	},
	{
		key: "fontStyle",
		active: (props) => props.fontStyle === "italic",
		open: (props) => props.italicMarker || "_",
		close: (props) => props.italicMarker || "_",
		signature: (props) => props.italicMarker || "_",
	},
	{
		key: "code",
		active: (props) => props.code === true,
		open: (props) => props.codeMarker || "`",
		close: (props) => props.codeMarker || "`",
		signature: (props) => props.codeMarker || "`",
	},
	{
		key: "highlight",
		active: (props) => props.highlight === true,
		open: () => "==",
		close: () => "==",
	},
];

interface MarkerPair {
	close: string;
	key: string;
	open: string;
	signature: string;
}

function markerStack(props?: Record<string, any>): MarkerPair[] {
	if (!props) {
		return [];
	}

	return MARKDOWN_FORMATS
		.filter(({ active }) => active(props))
		.map((format) => ({
			close: format.close(props),
			key: format.key,
			open: format.open(props),
			signature: format.signature?.(props) || "",
		}));
}

function commonPrefixLength(
	first: MarkerPair[],
	second: MarkerPair[],
): number {
	let index = 0;
	while (
		index < first.length &&
		index < second.length &&
		first[index].key === second[index].key &&
		first[index].signature === second[index].signature
	) {
		index += 1;
	}
	return index;
}

export function inlineMarkdownAffixes(
	previous: Record<string, any> | undefined,
	current: Record<string, any>,
	next: Record<string, any> | undefined,
): MarkdownAffixes {
	const previousMarkers = markerStack(previous);
	const currentMarkers = markerStack(current);
	const nextMarkers = markerStack(next);
	const previousCommon = commonPrefixLength(previousMarkers, currentMarkers);
	const nextCommon = commonPrefixLength(currentMarkers, nextMarkers);

	return {
		before: [
			...currentMarkers.slice(previousCommon).map(({ key, open }) => ({
				key,
				marker: open,
			})),
			...(current.markdownEscape
				? [{ key: "markdownEscape", marker: "\\" }]
				: []),
		],
		after: currentMarkers.slice(nextCommon).reverse().map(({ close, key }) => ({
			key,
			marker: close,
		})),
	};
}

export function markdownFormatActive(
	props: Record<string, any>,
	key: string,
): boolean {
	return MARKDOWN_FORMATS.some((format) =>
		format.key === key && format.active(props)
	) || (key === "markdownEscape" && props.markdownEscape === true);
}

export const MARKDOWN_PROP_KEYS = new Set([
	"boldMarker",
	"code",
	"codeMarker",
	"fontStyle",
	"fontWeight",
	"highlight",
	"italicMarker",
	"link",
	"markdownEscape",
	"textDecoration",
]);
