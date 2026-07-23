import { useStore } from "exome/preact";
import { Fragment, h } from "preact";
import { useContext, useLayoutEffect, useRef, useState } from "preact/hooks";

import { EditorContext, preventDefaultAndStop } from "../editpal.tsx";
import type { TextToken, UrlToken } from "../tokens.ts";

export function RenderUrl(item: (TextToken | UrlToken) & { k: string }) {
	const { id, k, meta } = item;
	const url = item.type === "url" ? item.src : item.props.url;
	const { model } = useContext(EditorContext);
	const {
		first: [first],
		last: [last],
	} = useStore(model.selection);
	const [urlMeta, setUrlMeta] = useState(meta);

	useLayoutEffect(() => {
		if (urlMeta !== undefined) {
			return;
		}

		setUrlMeta(
			item.meta = {
				icon: "https://strike.lv/favicon.ico",
			},
		);

		// fetch("http://localhost:8082/v1/meta/url", {
		// 	method: "post",
		// 	body: JSON.stringify({
		// 		url: props.url,
		// 	}),
		// 	headers: {
		// 		"Content-Type": "application/json",
		// 	},
		// })
		// 	.then((res) => res.json())
		// 	.then((data) => {
		// 		setUrlMeta(item.meta = data || {});
		// 	});
	}, [url]);

	const isSelected = [
		...model.keysBetween(first, last),
		...model.keysBetween(last, first),
	].indexOf(k) > -1;

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
					backgroundImage: urlMeta?.icon
						? `url(${JSON.stringify(urlMeta.icon)})`
						: undefined,
				}}
				// contentEditable={false}
			/>
			{/* <span style={{ position: 'absolute' }}><br /></span> */}
			{/* <span contentEditable={false}>{props.url}</span> */}
		</span>
	);
}
