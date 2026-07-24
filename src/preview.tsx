import { h } from "preact";
import type { ComponentChild, ComponentChildren, VNode } from "preact";

import type {
	BlockToken,
	InlineToken,
	TextToken,
	TokenRoot,
} from "./tokens.ts";
import type { EditpalExtensions } from "./extensions.ts";
import { toMarkdown } from "./markdown-parser.ts";
import { RenderAttachment } from "./plugin/attachment.tsx";

/** Properties accepted by the read-only {@link MarkdownPreview} renderer. */
export interface MarkdownPreviewProps {
	/** Accessible label applied to the rendered article. */
	ariaLabel?: string;
	/** Optional class name applied to the rendered article. */
	className?: string;
	/** Parsed Markdown document to render. */
	tokens: TokenRoot;
	/** Opt-in renderers shared with the editable surface. */
	extensions?: EditpalExtensions;
}

function safeHref(value: string | undefined): string | undefined {
	if (!value) {
		return;
	}
	const trimmed = value.trim();
	return /^(?:https?:|mailto:|\/|#)/i.test(trimmed) ? trimmed : undefined;
}

function PreviewText(
	{ extensions, token }: {
		extensions?: EditpalExtensions;
		token: TextToken;
	},
) {
	const {
		boldMarker: _boldMarker,
		code,
		codeMarker: _codeMarker,
		highlight,
		italicMarker: _italicMarker,
		link,
		mention,
		markdownEscape: _markdownEscape,
		url: _url,
		...style
	} = token.props;

	const content = (
		<span
			key={token.id}
			style={style}
			data-ep={token.id}
			data-ep-code-inline={code || undefined}
			data-ep-highlight={highlight || undefined}
			data-ep-link={link || undefined}
			data-t={token.text ? true : "empty"}
		>
			{mention
				? extensions?.mentions?.find(({ id }) => id === mention.configId)
					?.renderMention?.({ mention, text: token.text }) ?? token.text
				: token.text || "\u200B"}
		</span>
	);
	const href = safeHref(link);
	return href
		? (
			<a href={href} rel="noreferrer noopener">
				{content}
			</a>
		)
		: content;
}

function PreviewImage(
	{ token }: { token: Extract<InlineToken, { type: "img" }> },
) {
	const src = safeHref(token.src);
	if (!src) {
		return null;
	}

	return (
		<figure key={token.id} data-ep-img data-ep-preview-img>
			<img src={src} alt={token.props.alt || ""} />
			{token.props.alt && <figcaption>{token.props.alt}</figcaption>}
		</figure>
	);
}

function PreviewUrl(
	{ token }: {
		token:
			| Extract<InlineToken, { type: "url" }>
			| (TextToken & { props: { url?: string } });
	},
) {
	const href = safeHref(token.type === "url" ? token.src : token.props.url);
	if (!href) {
		return token.type === "t" ? <PreviewText token={token} /> : token.src;
	}

	return (
		<a
			key={token.id}
			data-ep-url={href}
			data-ep-preview-url
			href={href}
			rel="noreferrer noopener"
		>
			<i
				style={{
					backgroundImage: token.meta?.icon
						? `url(${JSON.stringify(token.meta.icon)})`
						: undefined,
				}}
			/>
			<span>{token.type === "t" ? token.text : token.src}</span>
		</a>
	);
}

function renderInline(
	tokens: InlineToken[],
	extensions?: EditpalExtensions,
): ComponentChildren[] {
	return tokens.map((token) => {
		if (token.type === "img") {
			return <PreviewImage key={token.id} token={token} />;
		}
		if (token.type === "attachment") {
			return (
				<RenderAttachment
					key={token.id}
					item={token}
					preview
					config={extensions?.attachments}
				/>
			);
		}
		if (token.type === "url" || (token.type === "t" && token.props.url)) {
			const source = token.type === "url" ? token.src : token.props.url || "";
			const integration = extensions?.inlineIntegrations?.map((definition) => ({
				definition,
				match: definition.match(source, token),
			})).find(({ match }) => Boolean(match));
			if (integration?.match) {
				const context = {
					match: integration.match,
					token,
				};
				return (
					<span
						data-ep-inline-integration={integration.definition.id}
						aria-label={integration.definition.ariaLabel?.(context)}
					>
						{integration.definition.render(context)}
					</span>
				);
			}
			return <PreviewUrl key={token.id} token={token} />;
		}
		if (token.type === "t" && token.props.link) {
			const integration = extensions?.inlineIntegrations?.map((definition) => ({
				definition,
				match: definition.match(token.props.link || "", token),
			})).find(({ match }) => Boolean(match));
			if (integration?.match) {
				const context = {
					match: integration.match,
					token,
				};
				return (
					<span
						data-ep-inline-integration={integration.definition.id}
						aria-label={integration.definition.ariaLabel?.(context)}
					>
						{integration.definition.render(context)}
					</span>
				);
			}
		}
		return <PreviewText key={token.id} token={token} extensions={extensions} />;
	});
}

function PreviewBlock({
	block,
	codeEnd,
	codeStart,
	extensions,
}: {
	block: BlockToken;
	codeEnd: boolean;
	codeStart: boolean;
	extensions?: EditpalExtensions;
}) {
	const children = renderInline(block.children, extensions);

	switch (block.type) {
		case "h": {
			const size = Math.max(1, Math.min(block.props.size, 6));
			return h(
				`h${size}`,
				{
					"data-ep": block.id,
					"data-ep-h": size,
					key: block.id,
				},
				children,
			);
		}
		case "p": {
			const { indent, ...style } = block.props;
			return (
				<p
					key={block.id}
					style={style}
					data-ep={block.id}
					data-ep-i={indent}
				>
					{children}
				</p>
			);
		}
		case "l": {
			const { indent, type, ...style } = block.props;
			return (
				<li
					key={block.id}
					style={style}
					data-ep={block.id}
					data-ep-i={indent}
					data-ep-l={type || "ul"}
				>
					{children}
				</li>
			);
		}
		case "todo": {
			const { done, indent, ...style } = block.props;
			return (
				<p
					key={block.id}
					style={style}
					data-ep={block.id}
					data-ep-d={done}
					data-ep-i={indent}
					data-ep-todo
				>
					{children}
					<input
						data-ep-todo-check
						type="checkbox"
						checked={done}
						tabIndex={-1}
						aria-disabled="true"
						aria-label={done ? "Completed task" : "Incomplete task"}
					/>
				</p>
			);
		}
		case "quote": {
			const { level, ...style } = block.props;
			return (
				<blockquote
					key={block.id}
					style={{
						...style,
						marginLeft: `${Math.max(0, (level || 1) - 1) * 20}px`,
					}}
					data-ep={block.id}
					data-ep-quote
					data-ep-quote-level={level || 1}
				>
					{children}
				</blockquote>
			);
		}
		case "code": {
			const { language, ...style } = block.props;
			return (
				<pre
					key={block.id}
					style={style}
					data-ep={block.id}
					data-ep-code
					data-ep-code-end={codeEnd || undefined}
					data-ep-code-start={codeStart || undefined}
					data-ep-language={language || undefined}
				>
					<code>{children}</code>
				</pre>
			);
		}
		case "hr":
			return (
				<div key={block.id} data-ep={block.id} data-ep-hr>
					<hr />
				</div>
			);
	}
}

/**
 * Render parsed Markdown without editor state, listeners, or visible markers.
 *
 * This renderer is suitable for read-only posts, feeds, and previews.
 */
export function MarkdownPreview({
	ariaLabel = "Markdown preview",
	className,
	extensions,
	tokens,
}: MarkdownPreviewProps): VNode {
	const content: ComponentChild[] = [];
	for (let index = 0; index < tokens.length; index++) {
		const block = tokens[index];
		if (block.type === "l") {
			const type = block.props.type === "ol" ? "ol" : "ul";
			const items: ComponentChild[] = [];
			while (
				tokens[index]?.type === "l" &&
				(tokens[index] as BlockToken & { type: "l" }).props.type ===
					block.props.type &&
				(tokens[index] as BlockToken & { type: "l" }).props.indent ===
					block.props.indent
			) {
				const listBlock = tokens[index];
				items.push(
					<PreviewBlock
						key={listBlock.id}
						block={listBlock}
						codeEnd
						codeStart
						extensions={extensions}
					/>,
				);
				index += 1;
			}
			index -= 1;
			content.push(h(type, { key: `list-${block.id}` }, items));
			continue;
		}

		const rendered = (
			<PreviewBlock
				key={block.id}
				block={block}
				codeEnd={block.type === "code" &&
					tokens[index + 1]?.type !== "code"}
				codeStart={block.type === "code" &&
					tokens[index - 1]?.type !== "code"}
				extensions={extensions}
			/>
		);
		const source = toMarkdown([block]);
		const embed = extensions?.lineEmbeds?.map((definition) => ({
			definition,
			match: definition.match(source, block),
		})).find(({ match }) => Boolean(match));
		if (embed?.match) {
			content.push(
				<div
					key={`embed-${block.id}-${embed.definition.id}`}
					data-ep-line-with-embed
				>
					{!embed.definition.replaceLine && rendered}
					<div data-ep-line-embed={embed.definition.id}>
						{embed.definition.render({
							block,
							match: embed.match,
						})}
					</div>
				</div>,
			);
		} else {
			content.push(rendered);
		}
	}

	return (
		<article
			className={className}
			data-ep-preview
			aria-label={ariaLabel}
		>
			{content}
		</article>
	);
}
