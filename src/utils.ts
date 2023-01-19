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

export function setCaret(id: string, position: number) {
	const sel = window.getSelection();

	if (!sel) {
		return;
	}

	if (sel.rangeCount > 0) {
		const element = document.querySelector(`[data-ep="${id}"`);
		let textNode = element?.childNodes?.[0];

		// nodeType 3 = text node
		if (textNode?.nodeType !== 3) {
			textNode = [].slice
				.call(element?.childNodes || [], 0)
				.find((node?: Node) => node?.nodeType === 3 || node?.nodeName === "BR");
		}

		if (textNode) {
			const pos = Math.min(position, textNode.textContent?.length || 0);

			sel.collapse(textNode, pos);
			console.log("🟪", "FOCUS", textNode, pos);
			return;
		}

		sel.collapse(element, position);
	}
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
