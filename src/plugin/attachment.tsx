import { h } from "preact";
import { useContext } from "preact/hooks";

import { EditorContext } from "../editpal.tsx";
import type { AttachmentConfig } from "../extensions.ts";
import type { AttachmentToken } from "../tokens.ts";

export function attachmentDescriptor(token: AttachmentToken) {
	return {
		alt: token.props.alt,
		kind: token.props.kind,
		meta: token.props.meta,
		mimeType: token.props.mimeType,
		name: token.props.name,
		size: token.props.size,
		src: token.src,
	};
}

export function RenderAttachment(
	{ config, item, preview = false }: {
		config?: AttachmentConfig;
		item: AttachmentToken;
		preview?: boolean;
	},
) {
	const context = useContext(EditorContext);
	const attachment = attachmentDescriptor(item);
	const custom = (config || context.extensions?.attachments)
		?.renderAttachment?.({
			attachment,
			model: preview ? undefined : context.model,
		});

	if (custom != null) {
		return (
			<span
				contentEditable={false}
				data-ep={item.id}
				data-ep-attachment={attachment.kind}
			>
				{custom}
			</span>
		);
	}

	if (attachment.kind === "image") {
		return (
			<span
				contentEditable={false}
				data-ep={item.id}
				data-ep-attachment="image"
			>
				<img src={attachment.src} alt={attachment.alt || attachment.name} />
			</span>
		);
	}

	if (attachment.kind === "video") {
		return (
			<span
				contentEditable={false}
				data-ep={item.id}
				data-ep-attachment="video"
			>
				<video controls src={attachment.src}>
					<a href={attachment.src}>{attachment.name}</a>
				</video>
				<span>{attachment.name}</span>
			</span>
		);
	}

	return (
		<a
			contentEditable={false}
			data-ep={item.id}
			data-ep-attachment="file"
			href={attachment.src}
			download={attachment.name}
		>
			{attachment.name}
		</a>
	);
}
