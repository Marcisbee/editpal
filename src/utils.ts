import type { AnyToken } from "./tokens";

export function ranID() {
	return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

export function stringSplice(
	str: string,
	start: number,
	end: number,
	add: string,
) {
	return str.slice(0, start) + (add || "") + str.slice(end);
}

export function getTextNode(id: string) {
	const element = document.querySelector(`[data-ep="${id}"`);
	let textNode = element?.childNodes?.[0];

	if (textNode?.nodeType !== 3) {
		// nodeType 3 = text node
		textNode = [].slice
			.call(element?.childNodes || [], 0)
			.find((node?: Node) => node?.nodeType === 3 || node?.nodeName === "BR");
	}

	return textNode;
}

export function setCaret(
	first: string,
	firstOffset: number,
	last: string = first,
	lastOffset: number = firstOffset,
) {
	const sel = window.getSelection();

	if (!sel) {
		return;
	}

	sel.setBaseAndExtent(
		getTextNode(first)!,
		firstOffset,
		getTextNode(last)!,
		lastOffset,
	);
}

export function cloneToken<T = AnyToken>(token: T): T {
	return JSON.parse(JSON.stringify(token), (key, value) => {
		if (value.type && value?.id) {
			return {
				...value,
				id: ranID(),
			};
		}

		return value;
	});
}
