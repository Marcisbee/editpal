import { h } from "preact";
import type { ComponentChildren, VNode } from "preact";

import type {
	BlockToken,
	InlineToken,
	TextToken,
	TokenRoot,
} from "./tokens.ts";

export interface MarkdownPreviewProps {
	ariaLabel?: string;
	className?: string;
	tokens: TokenRoot;
}

function safeHref(value: string | undefined): string | undefined {
	if (!value) {
		return;
	}
	const trimmed = value.trim();
	return /^(?:https?:|mailto:|\/|#)/i.test(trimmed) ? trimmed : undefined;
}

function PreviewText({ token }: { token: TextToken }) {
	const {
		boldMarker: _boldMarker,
		code,
		codeMarker: _codeMarker,
		highlight,
		italicMarker: _italicMarker,
		link,
		markdownEscape: _markdownEscape,
		url: _url,
		...style
	} = token.props;

	return (
		<span
			key={token.id}
			style={style}
			data-ep={token.id}
			data-ep-code-inline={code || undefined}
			data-ep-highlight={highlight || undefined}
			data-ep-link={link || undefined}
			data-t={token.text ? true : "empty"}
		>
			{token.text || "\u200B"}
		</span>
	);
}

function PreviewImage(
	{ token }: { token: Extract<InlineToken, { type: "img" }> },
) {
	const src = safeHref(token.src);
	if (!src) {
		return null;
	}

	return (
		<span key={token.id} data-ep-img data-ep-preview-img>
			<br />
			<span>
				<img src={src} alt={token.props.alt || ""} />
				<input
					type="text"
					readOnly
					tabIndex={-1}
					aria-label="Image caption"
					value={token.props.alt || ""}
				/>
			</span>
		</span>
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
		</a>
	);
}

function renderInline(tokens: InlineToken[]): ComponentChildren[] {
	return tokens.map((token) => {
		if (token.type === "img") {
			return <PreviewImage key={token.id} token={token} />;
		}
		if (token.type === "url" || token.props.url) {
			return <PreviewUrl key={token.id} token={token} />;
		}
		return <PreviewText key={token.id} token={token} />;
	});
}

function PreviewBlock({
	block,
	codeEnd,
	codeStart,
}: {
	block: BlockToken;
	codeEnd: boolean;
	codeStart: boolean;
}) {
	const children = renderInline(block.children);

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

export function MarkdownPreview({
	ariaLabel = "Markdown preview",
	className,
	tokens,
}: MarkdownPreviewProps): VNode {
	return (
		<article
			className={className}
			data-ep-preview
			aria-label={ariaLabel}
		>
			{tokens.map((block, index) => (
				<PreviewBlock
					key={block.id}
					block={block}
					codeEnd={block.type === "code" && tokens[index + 1]?.type !== "code"}
					codeStart={block.type === "code" &&
						tokens[index - 1]?.type !== "code"}
				/>
			))}
		</article>
	);
}
