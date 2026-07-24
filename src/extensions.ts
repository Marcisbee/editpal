import type { ComponentChildren } from "preact";

import type {
	BlockToken,
	InlineToken,
	JsonValue,
	MentionData,
} from "./tokens.ts";
import type { Model } from "./model.ts";

export interface MentionSuggestion<Value extends JsonValue = JsonValue> {
	/** Stable identifier stored with analytics callbacks. */
	id: string;
	/** Text inserted after the trigger. */
	label: string;
	/** Optional secondary text for a suggestion row. */
	description?: string;
	/** Consumer-owned data passed back to render and selection callbacks. */
	value?: Value;
}

export interface MentionSearchContext {
	model: Model;
	signal: AbortSignal;
	trigger: string;
}

export interface MentionRenderContext<Value extends JsonValue = JsonValue> {
	mention: MentionData<Value>;
	text: string;
}

export interface MentionConfig<Value extends JsonValue = JsonValue> {
	/** Unique name used to distinguish multiple mention providers. */
	id: string;
	/** Trigger text, commonly `@` or `#`. */
	trigger: string;
	/** Async or synchronous suggestion provider. */
	search(
		query: string,
		context: MentionSearchContext,
	):
		| MentionSuggestion<Value>[]
		| Promise<MentionSuggestion<Value>[]>;
	/** Minimum query length before search runs. Defaults to `0`. */
	minQueryLength?: number;
	/** Maximum number of visible results. Defaults to `8`. */
	limit?: number;
	/** Accessible label for the search popup. */
	ariaLabel?: string;
	/**
	 * Override trigger/query detection. `start` is the source offset to replace.
	 * Return undefined when no mention query is active.
	 */
	getQuery?(
		textBeforeCaret: string,
		trigger: string,
	): { query: string; start: number } | undefined;
	/** Override the literal text inserted for a suggestion. */
	getText?(suggestion: MentionSuggestion<Value>, trigger: string): string;
	/** Override the structured metadata stored on the mention token. */
	getMention?(
		suggestion: MentionSuggestion<Value>,
		trigger: string,
	): MentionData<Value>;
	/** Override how an inserted mention is displayed. */
	renderMention?(context: MentionRenderContext<Value>): ComponentChildren;
	/** Override a suggestion row. */
	renderSuggestion?(suggestion: MentionSuggestion<Value>): ComponentChildren;
	renderLoading?(): ComponentChildren;
	renderEmpty?(query: string): ComponentChildren;
	onError?(error: unknown, query: string): void;
	/** Called after a suggestion has been inserted. */
	onSelect?(suggestion: MentionSuggestion<Value>, model: Model): void;
}

export interface InlineIntegrationMatch {
	/** Consumer data passed to the renderer. */
	data?: unknown;
	/** URL or source string that matched. */
	source: string;
}

export interface InlineIntegrationContext {
	match: InlineIntegrationMatch;
	model?: Model;
	token: InlineToken;
}

export interface InlineIntegration {
	id: string;
	/** Match an atomic URL. Return data to render it, or false to ignore it. */
	match(source: string, token: InlineToken): false | InlineIntegrationMatch;
	render(context: InlineIntegrationContext): ComponentChildren;
	/** Text announced by assistive technology for a non-text component. */
	ariaLabel?(context: InlineIntegrationContext): string;
}

export interface LineEmbedMatch {
	data?: unknown;
	source: string;
}

export interface LineEmbedContext {
	block: BlockToken;
	match: LineEmbedMatch;
	model?: Model;
}

export interface LineEmbed {
	id: string;
	/** Match a block's complete Markdown source. */
	match(source: string, block: BlockToken): false | LineEmbedMatch;
	render(context: LineEmbedContext): ComponentChildren;
	/** Hide the source line visually when an embed is rendered. */
	replaceLine?: boolean;
}

export type AttachmentKind = "file" | "image" | "video";

export interface UploadedAttachment {
	kind: AttachmentKind;
	name: string;
	src: string;
	alt?: string;
	mimeType?: string;
	size?: number;
	meta?: Record<string, JsonValue>;
}

export interface AttachmentRenderContext {
	attachment: UploadedAttachment;
	model?: Model;
}

export interface AttachmentUploadContext {
	model: Model;
	signal: AbortSignal;
	reportProgress(progress: number): void;
}

export interface AttachmentConfig {
	/** File-picker accept value, such as `image/*,video/*,.pdf`. */
	accept?: string;
	/** Allow selecting more than one file. Defaults to `true`. */
	multiple?: boolean;
	/** Optional client-side size limit in bytes. */
	maxSize?: number;
	/** Upload a local file and return its durable attachment descriptor. */
	upload(
		file: File,
		context: AttachmentUploadContext,
	): Promise<UploadedAttachment>;
	renderAttachment?(context: AttachmentRenderContext): ComponentChildren;
	onError?(error: unknown, file: File): void;
	onProgress?(file: File, progress: number): void;
	onUploaded?(attachment: UploadedAttachment, file: File): void;
	/** Label for the built-in picker button. Set false to hide the button. */
	pickerLabel?: string | false;
}

export interface LinkEditorContext {
	current?: string;
	model: Model;
	selectedText: string;
}

export interface LinkEditor {
	/**
	 * Return a URL to apply, `null` to remove the active link, or `undefined`
	 * when the operation was cancelled.
	 */
	edit(
		context: LinkEditorContext,
	): null | string | undefined | Promise<null | string | undefined>;
}

export interface SlashCommandContext {
	block: BlockToken;
	model: Model;
}

export interface SlashCommand {
	id: string;
	label: string;
	keywords?: string[];
	run(context: SlashCommandContext): void;
}

export interface EditpalExtensions {
	attachments?: AttachmentConfig;
	inlineIntegrations?: InlineIntegration[];
	lineEmbeds?: LineEmbed[];
	linkEditor?: LinkEditor;
	mentions?: MentionConfig[];
	slashCommands?: SlashCommand[];
}
