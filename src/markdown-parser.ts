import { inlineMarkdownAffixes, MARKDOWN_PROP_KEYS } from "./markdown.ts";
import type {
	BlockToken,
	InlineToken,
	TableAlignment,
	TableRowToken,
	TextToken,
	TokenRoot,
} from "./tokens.ts";
import { tableRowCells } from "./tokens.ts";
import {
	createBlockToken,
	createImgToken,
	createTextToken,
} from "./utils/create-token.ts";

export interface ParsedInline {
	origins: number[];
	sourceEnd: number;
	sourceStart: number;
	token: InlineToken;
}

export interface ParseInlineMarkdownOptions {
	basePropsAt?: (sourceIndex: number) => Record<string, any>;
}

const ESCAPABLE = /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/;

function isEscaped(source: string, index: number): boolean {
	let slashes = 0;
	for (
		let cursor = index - 1;
		cursor >= 0 && source[cursor] === "\\";
		cursor--
	) {
		slashes += 1;
	}
	return slashes % 2 === 1;
}

function findClosing(
	source: string,
	marker: string,
	start: number,
	end: number,
): number {
	let cursor = source.indexOf(marker, start);
	while (cursor >= 0 && cursor < end) {
		if (!isEscaped(source, cursor)) {
			return cursor;
		}
		cursor = source.indexOf(marker, cursor + marker.length);
	}
	return -1;
}

function findLinkDestinationEnd(
	source: string,
	start: number,
	end: number,
): number {
	let depth = 0;
	for (let cursor = start; cursor < end; cursor++) {
		if (source[cursor] === "\\" && cursor + 1 < end) {
			cursor += 1;
			continue;
		}
		if (source[cursor] === "(") {
			depth += 1;
			continue;
		}
		if (source[cursor] === ")") {
			if (depth === 0) {
				return cursor;
			}
			depth -= 1;
		}
	}
	return -1;
}

function propsKey(props: Record<string, any>): string {
	return JSON.stringify(
		Object.fromEntries(
			Object.entries(props)
				.filter(([, value]) => value !== undefined)
				.sort(([first], [second]) => first.localeCompare(second)),
		),
	);
}

function appendText(
	output: ParsedInline[],
	text: string,
	origins: number[],
	props: Record<string, any>,
	sourceStart: number,
	sourceEnd: number,
) {
	if (!text) {
		return;
	}

	const cleanProps = Object.fromEntries(
		Object.entries(props).filter(([, value]) => value !== undefined),
	);
	const previous = output[output.length - 1];
	if (
		previous?.token.type === "t" &&
		propsKey(previous.token.props) === propsKey(cleanProps) &&
		previous.sourceEnd === sourceStart
	) {
		previous.token.text += text;
		previous.origins.push(...origins);
		previous.sourceEnd = sourceEnd;
		return;
	}

	output.push({
		origins,
		sourceEnd,
		sourceStart,
		token: createTextToken(cleanProps, text),
	});
}

function parseRange(
	source: string,
	start: number,
	end: number,
	activeProps: Record<string, any>,
	options: ParseInlineMarkdownOptions,
): ParsedInline[] {
	const output: ParsedInline[] = [];
	const basePropsAt = options.basePropsAt || (() => ({}));
	let cursor = start;

	const appendLiteral = (
		value: string,
		origin: number,
		props: Record<string, any> = {},
		sourceStart = origin,
		sourceEnd = origin + value.length,
	) => {
		appendText(
			output,
			value,
			Array.from(value, (_, index) => origin + index),
			{ ...basePropsAt(origin), ...activeProps, ...props },
			sourceStart,
			sourceEnd,
		);
	};

	while (cursor < end) {
		const character = source[cursor];

		if (
			character === "\\" &&
			cursor + 1 < end &&
			ESCAPABLE.test(source[cursor + 1])
		) {
			appendLiteral(
				source[cursor + 1],
				cursor + 1,
				{ markdownEscape: true },
				cursor,
				cursor + 2,
			);
			cursor += 2;
			continue;
		}

		const image = source.startsWith("![", cursor);
		const link = !image && character === "[";
		if (image || link) {
			const labelStart = cursor + (image ? 2 : 1);
			const labelEnd = findClosing(source, "](", labelStart, end);
			if (labelEnd >= labelStart) {
				const urlStart = labelEnd + 2;
				const urlEnd = findLinkDestinationEnd(source, urlStart, end);
				const url = urlEnd >= 0 ? source.slice(urlStart, urlEnd).trim() : "";
				if (url) {
					if (image) {
						output.push({
							origins: [],
							sourceEnd: urlEnd + 1,
							sourceStart: cursor,
							token: createImgToken(
								{ alt: source.slice(labelStart, labelEnd) },
								url,
							),
						});
					} else {
						output.push(
							...parseRange(
								source,
								labelStart,
								labelEnd,
								{ ...activeProps, link: url },
								options,
							),
						);
					}
					cursor = urlEnd + 1;
					continue;
				}
			}
		}

		if (character === "`") {
			let markerLength = 1;
			while (source[cursor + markerLength] === "`") {
				markerLength += 1;
			}
			const marker = "`".repeat(markerLength);
			const innerStart = cursor + markerLength;
			const close = findClosing(source, marker, innerStart, end);
			if (close > innerStart) {
				for (let index = innerStart; index < close; index++) {
					appendLiteral(
						source[index] === "\n" ? " " : source[index],
						index,
						{ code: true, codeMarker: marker },
						index,
						index + 1,
					);
				}
				cursor = close + markerLength;
				continue;
			}
		}

		const unmatchedStrong = ["**", "__"].find((marker) =>
			source.startsWith(marker, cursor) &&
			findClosing(
					source,
					marker,
					cursor + marker.length,
					end,
				) < cursor + marker.length + 1
		);
		if (unmatchedStrong) {
			appendLiteral(unmatchedStrong, cursor);
			cursor += unmatchedStrong.length;
			continue;
		}

		const delimiter = [
			{ marker: "**", props: { fontWeight: "bold" } },
			{
				marker: "__",
				props: { boldMarker: "__", fontWeight: "bold" },
			},
			{ marker: "~~", props: { textDecoration: "line-through" } },
			{ marker: "==", props: { highlight: true } },
			{
				marker: "_",
				props: { fontStyle: "italic", italicMarker: "_" },
			},
			{
				marker: "*",
				props: { fontStyle: "italic", italicMarker: "*" },
			},
		].find(({ marker }) => source.startsWith(marker, cursor));

		if (delimiter) {
			const { marker, props } = delimiter;
			const innerStart = cursor + marker.length;
			const close = findClosing(source, marker, innerStart, end);
			const inside = close >= 0 ? source.slice(innerStart, close) : "";
			const wordUnderscore = marker === "_" &&
				/\w/.test(source[cursor - 1] || "") &&
				/\w/.test(source[innerStart] || "");
			if (close > innerStart && !/^\s|\s$/.test(inside) && !wordUnderscore) {
				output.push(
					...parseRange(
						source,
						innerStart,
						close,
						{ ...activeProps, ...props },
						options,
					),
				);
				cursor = close + marker.length;
				continue;
			}
		}

		appendLiteral(character, cursor);
		cursor += 1;
	}

	return output;
}

function withEditableTextBoundaries(items: ParsedInline[]): ParsedInline[] {
	const output = [...items];
	if (output[0]?.token.type !== "t") {
		output.unshift({
			origins: [],
			sourceEnd: output[0]?.sourceStart || 0,
			sourceStart: output[0]?.sourceStart || 0,
			token: createTextToken(),
		});
	}
	if (output[output.length - 1]?.token.type !== "t") {
		const offset = output[output.length - 1]?.sourceEnd || 0;
		output.push({
			origins: [],
			sourceEnd: offset,
			sourceStart: offset,
			token: createTextToken(),
		});
	}
	return output;
}

export function parseInlineMarkdownDetailed(
	source: string,
	options: ParseInlineMarkdownOptions = {},
): ParsedInline[] {
	return withEditableTextBoundaries(
		parseRange(source, 0, source.length, {}, options),
	);
}

/**
 * Parse inline Markdown into editable text, image, and URL tokens.
 *
 * @param source Markdown without block-level prefixes.
 */
export function parseInlineMarkdown(source: string): InlineToken[] {
	const parsed = parseInlineMarkdownDetailed(source);
	return parsed.length ? parsed.map(({ token }) => token) : [createTextToken()];
}

export interface MarkdownChunk {
	props?: Record<string, any>;
	text: string;
	textStart?: number;
	token?: InlineToken;
}

export function inlineMarkdownChunks(items: InlineToken[]): MarkdownChunk[] {
	const chunks: MarkdownChunk[] = [];

	for (const [index, item] of items.entries()) {
		if (item.type === "attachment") {
			chunks.push({
				text: item.props.kind === "image"
					? `![${item.props.alt || item.props.name}](${item.src})`
					: `[${item.props.name}](${item.src})`,
				token: item,
			});
			continue;
		}
		if (item.type === "img") {
			chunks.push({
				text: `![${item.props.alt || ""}](${item.src})`,
				token: item,
			});
			continue;
		}
		if (item.type === "url") {
			chunks.push({ text: item.src, token: item });
			continue;
		}

		const previous = items[index - 1];
		const next = items[index + 1];
		const markdown = inlineMarkdownAffixes(
			previous?.type === "t" ? previous.props : undefined,
			item.props,
			next?.type === "t" ? next.props : undefined,
		);
		for (const { marker } of markdown.before) {
			chunks.push({ text: marker });
		}
		chunks.push({
			props: item.props,
			text: item.text,
			textStart: 0,
			token: item,
		});
		for (const { marker } of markdown.after) {
			chunks.push({ text: marker });
		}
	}

	return chunks;
}

/** Serialize inline editor tokens to Markdown source. */
export function inlineTokensToMarkdown(items: InlineToken[]): string {
	return inlineMarkdownChunks(items).map(({ text }) => text).join("");
}

function blockChildren(markdown: string): InlineToken[] {
	return parseInlineMarkdown(markdown);
}

function splitTableRow(line: string): string[] | undefined {
	const source = line.trim();
	if (!source) {
		return;
	}

	const cells: string[] = [];
	let cellStart = source.startsWith("|") ? 1 : 0;
	let codeMarkerLength = 0;
	let foundDelimiter = false;

	for (let index = cellStart; index < source.length; index++) {
		if (source[index] === "\\") {
			index += 1;
			continue;
		}
		if (source[index] === "`") {
			let runLength = 1;
			while (source[index + runLength] === "`") {
				runLength += 1;
			}
			if (codeMarkerLength === 0) {
				codeMarkerLength = runLength;
			} else if (codeMarkerLength === runLength) {
				codeMarkerLength = 0;
			}
			index += runLength - 1;
			continue;
		}
		if (source[index] !== "|" || codeMarkerLength !== 0) {
			continue;
		}

		foundDelimiter = true;
		cells.push(source.slice(cellStart, index).trim());
		cellStart = index + 1;
	}

	if (!foundDelimiter) {
		return;
	}
	const finalCell = source.slice(cellStart).trim();
	if (finalCell || !source.endsWith("|")) {
		cells.push(finalCell);
	}
	return cells.length ? cells : undefined;
}

function tableAlignments(line: string): TableAlignment[] | undefined {
	const cells = splitTableRow(line);
	if (
		!cells?.length ||
		cells.some((cell) => !/^:?-{3,}:?$/.test(cell))
	) {
		return;
	}
	return cells.map((cell) =>
		cell.startsWith(":") && cell.endsWith(":")
			? "center"
			: cell.endsWith(":")
			? "right"
			: cell.startsWith(":")
			? "left"
			: "none"
	);
}

function tableRowChildren(cells: string[]): InlineToken[] {
	return cells.flatMap((cell, tableCell) => {
		const children = blockChildren(cell);
		for (const child of children) {
			child.props = { ...child.props, tableCell };
		}
		const first = children[0];
		if (first?.type === "t") {
			first.props.typingBoundary = true;
		}
		return children;
	});
}

function tableRowMarkdown(row: TableRowToken): string {
	const cells = tableRowCells(row).map((children) =>
		inlineMarkdownChunks(children).map((chunk) =>
			chunk.props && !chunk.props.code && !chunk.props.markdownEscape
				? chunk.text.replaceAll("|", "\\|")
				: chunk.text
		).join("")
	);
	return `| ${cells.join(" | ")} |`;
}

function tableDelimiterMarkdown(alignments: TableAlignment[]): string {
	return `| ${
		alignments.map((alignment) =>
			alignment === "center"
				? ":---:"
				: alignment === "right"
				? "---:"
				: alignment === "left"
				? ":---"
				: "---"
		).join(" | ")
	} |`;
}

/**
 * Parse a Markdown document into the token model consumed by Editpal.
 *
 * Empty input is normalized to one editable paragraph.
 */
export function parseMarkdown(markdown: string): TokenRoot {
	const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
	const blocks: BlockToken[] = [];

	for (let index = 0; index < lines.length; index++) {
		const line = lines[index];
		const fence = line.match(/^\s{0,3}(`{3,}|~{3,})\s*([\w+-]*)\s*$/);
		if (fence) {
			const marker = fence[1];
			const language = fence[2] || undefined;
			const codeLines: string[] = [];
			index += 1;
			const closingFence = new RegExp(
				`^\\s{0,3}${marker[0] === "`" ? "`" : "~"}{${marker.length},}\\s*$`,
			);
			while (index < lines.length && !closingFence.test(lines[index])) {
				codeLines.push(lines[index]);
				index += 1;
			}
			for (
				const [lineIndex, codeLine] of (codeLines.length ? codeLines : [""])
					.entries()
			) {
				blocks.push(
					createBlockToken(
						"code",
						lineIndex === 0 && language ? { language } : {},
						[createTextToken({}, codeLine)],
					),
				);
			}
			continue;
		}

		if (/^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
			blocks.push(createBlockToken("hr", {}, [createTextToken()]));
			continue;
		}

		const alignments = index + 1 < lines.length
			? tableAlignments(lines[index + 1])
			: undefined;
		const headerCells = alignments ? splitTableRow(line) : undefined;
		if (
			alignments &&
			headerCells &&
			headerCells.length === alignments.length
		) {
			blocks.push(
				createBlockToken(
					"tr",
					{ alignments, header: true },
					tableRowChildren(headerCells),
				),
			);
			index += 2;
			while (index < lines.length) {
				const cells = splitTableRow(lines[index]);
				if (!cells) {
					break;
				}
				const normalized = cells.slice(0, alignments.length);
				while (normalized.length < alignments.length) {
					normalized.push("");
				}
				blocks.push(
					createBlockToken(
						"tr",
						{ alignments: [...alignments] },
						tableRowChildren(normalized),
					),
				);
				index += 1;
			}
			index -= 1;
			continue;
		}

		const heading = line.match(/^\s{0,3}(#{1,6})\s+(.*)$/);
		if (heading) {
			blocks.push(
				createBlockToken(
					"h",
					{ size: heading[1].length },
					blockChildren(heading[2]),
				),
			);
			continue;
		}

		const quote = line.match(/^\s{0,3}((?:>\s*)+)(.*)$/);
		if (quote) {
			blocks.push(
				createBlockToken(
					"quote",
					{ level: (quote[1].match(/>/g) || []).length },
					blockChildren(quote[2]),
				),
			);
			continue;
		}

		const todo = line.match(/^(\s*)[-+*]\s+\[([ xX])\]\s+(.*)$/);
		if (todo) {
			blocks.push(
				createBlockToken(
					"todo",
					{
						done: todo[2].toLowerCase() === "x",
						indent: Math.floor(todo[1].length / 2),
					},
					blockChildren(todo[3]),
				),
			);
			continue;
		}

		const unordered = line.match(/^(\s*)[-+*]\s+(.*)$/);
		if (unordered) {
			blocks.push(
				createBlockToken(
					"l",
					{ indent: Math.floor(unordered[1].length / 2), type: "ul" },
					blockChildren(unordered[2]),
				),
			);
			continue;
		}

		const ordered = line.match(/^(\s*)(\d+)[.)]\s+(.*)$/);
		if (ordered) {
			blocks.push(
				createBlockToken(
					"l",
					{
						indent: Math.floor(ordered[1].length / 2),
						start: Number(ordered[2]),
						type: "ol",
					},
					blockChildren(ordered[3]),
				),
			);
			continue;
		}

		blocks.push(createBlockToken("p", {}, blockChildren(line)));
	}

	return blocks.length
		? blocks
		: [createBlockToken("p", {}, [createTextToken()])];
}

function blockMarkdown(block: BlockToken): string {
	const inline = inlineTokensToMarkdown(block.children);
	switch (block.type) {
		case "h":
			return `${"#".repeat(block.props.size)} ${inline}`;
		case "quote":
			return `${"> ".repeat(block.props.level || 1)}${inline}`;
		case "l":
			return `${"  ".repeat(block.props.indent || 0)}${
				block.props.type === "ol" ? `${block.props.start || 1}.` : "-"
			} ${inline}`;
		case "todo":
			return `${"  ".repeat(block.props.indent || 0)}- [${
				block.props.done ? "x" : " "
			}] ${inline}`;
		case "hr":
			return "---";
		case "tr":
			return tableRowMarkdown(block);
		default:
			return inline;
	}
}

export function codeFenceMarker(code: string): string {
	const longestBacktickRun = Math.max(
		0,
		...(code.match(/`+/g) || []).map((run) => run.length),
	);
	return "`".repeat(Math.max(3, longestBacktickRun + 1));
}

/** Serialize an Editpal token document to canonical Markdown source. */
export function toMarkdown(tokens: TokenRoot): string {
	const output: string[] = [];

	for (let index = 0; index < tokens.length; index++) {
		const block = tokens[index];
		if (block.type !== "code") {
			output.push(blockMarkdown(block));
			if (block.type === "tr" && block.props.header) {
				output.push(tableDelimiterMarkdown(block.props.alignments));
			}
			continue;
		}

		const language = block.props.language || "";
		const codeLines: string[] = [];
		while (tokens[index]?.type === "code") {
			codeLines.push(
				tokens[index].children.map((child) =>
					child.type === "t"
						? child.text
						: child.type === "img" || child.type === "attachment"
						? child.props.alt || child.props.name || ""
						: child.src
				).join(""),
			);
			index += 1;
		}
		index -= 1;
		const code = codeLines.join("\n");
		const fence = codeFenceMarker(code);
		output.push(`${fence}${language}\n${code}\n${fence}`);
	}

	return output.join("\n");
}

export function markdownBaseProps(
	props: Record<string, any> | undefined,
): Record<string, any> {
	return Object.fromEntries(
		Object.entries(props || {}).filter(([key, value]) =>
			!MARKDOWN_PROP_KEYS.has(key) && value !== undefined
		),
	);
}
