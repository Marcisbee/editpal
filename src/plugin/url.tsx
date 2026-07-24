import { useStore } from "exome/preact";
import { h } from "preact";
import { useContext } from "preact/hooks";

import { EditorContext } from "../editpal.tsx";
import type { TextToken, UrlToken } from "../tokens.ts";

export function RenderUrl(item: (TextToken | UrlToken) & { k: string }) {
	const { id, k, meta } = item;
	const url = item.type === "url" ? item.src : item.props.url;
	const { activeId, extensions, model } = useContext(EditorContext);
	const {
		first: [first],
		last: [last],
	} = useStore(model.selection);

	const isSelected = [
		...model.keysBetween(first, last),
		...model.keysBetween(last, first),
	].indexOf(k) > -1;
	const integration = extensions?.inlineIntegrations?.map((definition) => ({
		definition,
		match: definition.match(url || "", item),
	})).find(({ match }) => Boolean(match));

	if (integration?.match) {
		const context = {
			match: integration.match,
			model,
			token: item,
		};
		return (
			<span
				contentEditable={false}
				data-ep={id}
				data-ep-inline-integration={integration.definition.id}
				data-ep-selectable="inline-embed"
				data-ep-s={activeId === id || undefined}
				aria-label={integration.definition.ariaLabel?.(context)}
			>
				{integration.definition.render(context)}
			</span>
		);
	}

	return (
		<span
			data-ep={id}
			data-ep-url={url}
			data-ep-s={isSelected || undefined}
			// If pointerEvents, then this is needed
			// onMouseDown={isSelected ? undefined : (e) => {
			// 	// document.execCommand("selectAll", false, null);
			// 	model.select(model.findElement(item.k)!, 0);
			// }}
		>
			<i
				style={{
					backgroundImage: meta?.icon
						? `url(${JSON.stringify(meta.icon)})`
						: undefined,
				}}
			/>
		</span>
	);
}
