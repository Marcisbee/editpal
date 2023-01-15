import type { AnyToken } from "./tokens";

export function ranID() {
	var now = Date.now();
	var random = Math.random();

	return (now.toString(36) + random.toString(36).substr(2, 5)).toUpperCase();
}

export function stringSplice(str: string, start: number, end: number, add: string) {
	// We cannot pass negative indexes directly to the 2nd slicing operation.
	if (start < 0) {
		start = str.length + start;
		if (start < 0) {
			start = 0;
		}
	}

	return str.slice(0, start) + (add || "") + str.slice(end);
}

export function setCaret(id: string, position: number) {
	const sel = window.getSelection();

	if (!sel) {
		return;
	}

	if (sel.rangeCount > 0) {
		const element = document.querySelector(`[data-mx-id="${id}"`);
		let textNode = element?.childNodes?.[0];

    // nodeType 3 = text node
    if (textNode?.nodeType !== 3) {
      textNode = [].slice
							.call(element?.childNodes || [], 0)
							.find((node) => node?.nodeType === 3 || node.nodeName === "BR");
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
		if (value?.id) {
			return {
				...value,
				id: ranID(),
			};
		}

		return value;
	});
}
