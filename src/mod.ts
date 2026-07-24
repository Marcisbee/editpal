/**
 * Editpal is a Preact Markdown editor with visible source markers, a
 * marker-free editing mode, and a read-only renderer.
 *
 * @example Create an editable Markdown document.
 * ```tsx
 * import { Editpal, Model, parseMarkdown } from "@marcisbee/editpal";
 *
 * const model = new Model(parseMarkdown("# Hello **Markdown**"));
 * const editor = <Editpal model={model} />;
 * ```
 *
 * @module
 */

export { Editpal, stylesheetUrl } from "./editpal.tsx";
export type { EditpalMode, EditpalProps } from "./editpal.tsx";
export { Model } from "./model.ts";
export type { UpdateAssetData } from "./model.ts";
export { MarkdownPreview } from "./preview.tsx";
export type { MarkdownPreviewProps } from "./preview.tsx";
export {
	inlineTokensToMarkdown,
	parseInlineMarkdown,
	parseMarkdown,
	toMarkdown,
} from "./markdown-parser.ts";
export type {
	AnyToken,
	AttachmentToken,
	BlockToken,
	InlineToken,
	JsonValue,
	MentionData,
	TextToken,
	TokenRoot,
} from "./tokens.ts";
export type {
	AttachmentConfig,
	AttachmentKind,
	AttachmentRenderContext,
	AttachmentUploadContext,
	EditpalExtensions,
	InlineIntegration,
	InlineIntegrationContext,
	InlineIntegrationMatch,
	LineEmbed,
	LineEmbedContext,
	LineEmbedMatch,
	LinkEditor,
	LinkEditorContext,
	MentionConfig,
	MentionRenderContext,
	MentionSearchContext,
	MentionSuggestion,
	SlashCommand,
	SlashCommandContext,
	UploadedAttachment,
} from "./extensions.ts";
