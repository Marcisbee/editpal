import { useStore } from "exome/preact";
import { h, Fragment } from "preact";
import { useContext, useLayoutEffect, useRef, useState } from "preact/hooks";

import { EditorContext, preventDefaultAndStop } from "../editpal";
import type { TextToken } from "../tokens";

export function RenderUrl(item: TextToken & { k: string }) {
	const { id, props, text, k, meta } = item;
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

		fetch("http://localhost:8082/v1/meta/url", {
			method: "post",
			body: JSON.stringify({
				url: props.url,
			}),
			headers: {
				"Content-Type": "application/json",
			},
		})
			.then((res) => res.json())
			.then((data) => {
				setUrlMeta(data || {});
				item.meta = data || {};
			});
	}, [props.url]);

	const isSelected =
		[
			...model.keysBetween(first, last),
			...model.keysBetween(last, first),
		].indexOf(k) > -1;

	return (
		<span
			data-ep={id}
			data-ep-url={props.url}
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
