import type { AnyToken } from "../tokens";

import { propsEqual } from "./props-equal";

export type BuildKeysSelection = [
	[null | string, null | number],
	[null | string, null | number],
];

export interface BuildKeysContext {
	_elements: Record<string, AnyToken>;
	_keys: Record<string, string>;
	_newSelection: BuildKeysSelection;
}

export function buildKeys(
	tokens: AnyToken | AnyToken[],
	selection: BuildKeysSelection,
	context: BuildKeysContext = {
		_elements: {},
		_keys: {},
		_newSelection: JSON.parse(JSON.stringify(selection)),
	},
	key: string[] = [],
): BuildKeysContext {
	if (Array.isArray(tokens)) {
		let i = 0;
		for (const element of tokens) {
			buildKeys(element, selection, context, key.concat(i + ""));
			i += 1;
		}

		return context;
	}

	if (!tokens?.id) {
		return context;
	}

	// Reset index each time
	let index = 0;

	tokens.key = key.join(".");

	context._elements[tokens.key] = tokens;
	context._keys[tokens.id] = tokens.key;

	const isCollapsed =
		selection[0][0] === selection[1][0] && selection[0][1] === selection[1][1];

	if (tokens.type !== "t" && Array.isArray(tokens.children)) {
		let lastChild;
		let p = -1;
		let i = p;
		let start: number | undefined;
		let newStart: number | undefined;
		let end: number | undefined;
		let newEnd: number | undefined;

		const oldTokens = tokens.children.slice();
		for (const child of oldTokens) {
			p += 1;
			i += 1;

			const childTextLength = child.text?.length || 0;
			// console.log("T", child.text, i, p);

			if (selection[0][0] === key + "." + p && start == null) {
				start = index + selection[0][1];
			}

			if (selection[1][0] === key + "." + p) {
				end = index + selection[1][1];
			}

			index += childTextLength;

			// console.log({ p, i: index  });

			check: {
				if (lastChild?.type !== "t" || child?.type !== "t") {
					break check;
				}

				// if (child?.type === "t" && child?.props?.url === null) {
				// 	p -= 1;
				// }

				// Skip url blocks
				if (
					(lastChild?.type === "t" && lastChild?.props?.url) ||
					(child?.type === "t" && child?.props?.url)
				) {
					break check;
				}

				if (!lastChild.text) {
					tokens.children.splice(i - 1, 1);
					i -= 1;
					break check;
				}

				if (!childTextLength) {
					tokens.children.splice(i, 1);
					i -= 1;
					continue;
				}

				if (propsEqual(lastChild.props, child.props)) {
					lastChild.text += child.text;
					tokens.children.splice(i, 1);
					i -= 1;
					if (lastChild.key && !child.key) {
						// console.log({child, lastChild, next: oldTokens[i + 1]});
						p -= 1;
					}
					continue;
				}
			}

			if (
				!child.key &&
				child.text &&
				(oldTokens[i + 1]?.key === key + "." + i || !oldTokens[i + 1]?.key)
			) {
				// console.log(child, oldTokens[i + 1]);
				p -= 1;
			}

			lastChild = child;
		}

		// console.log({
		// 	start,
		// 	end,
		// });

		// @TODO make this in top loop
		let solves = 0;
		if (
			// !isCollapsed &&
			start != null &&
			newStart == null &&
			end != null &&
			newEnd == null
		) {
			let i = -1;
			let len = 0;

			for (const child of tokens.children) {
				i += 1;

				if (lastChild?.type !== "t" || child?.type !== "t") {
					continue;
				}

				if (len + child.text.length > start && !solves) {
					context._newSelection[0] = [key + "." + i, start - len];
					solves++;
					if (solves >= 2) {
						break;
					}
				}

				if (len + child.text.length >= end) {
					// console.log({
					// 	end,len
					// });
					context._newSelection[1] = [key + "." + i, end - len];
					// console.log("end", key + '.' + i, end - len);
					break;
				}

				len += child.text?.length || 0;
			}
		}

		if (isCollapsed) {
			context._newSelection[1] = context._newSelection[0];
		}

		// if (!isCollapsed && end != null && newEnd == null) {
		// 	let i = -1;
		// 	let len = 0;

		// 	for (const child of tokens.children) {
		// 		i += 1;

		// 		if (lastChild?.type !== "t" || child?.type !== "t") {
		// 			continue;
		// 		}

		// 		// console.log(key + "." + i, child.text, { len, end });

		// 		if (len + child.text.length >= end) {
		// 			// console.log({
		// 			// 	end,len
		// 			// });
		// 			context._newSelection[1] = [key + "." + i, end - len];
		// 			// console.log("end", key + '.' + i, end - len);
		// 			break;
		// 		}

		// 		// if (len > end - 1) {
		// 		// 	console.log("end", key + '.' + i, child.text.length);
		// 		// 	break;
		// 		// } else if (len >= end) {
		// 		// 	console.log("end", key + "." + i, end - len);
		// 		// 	break;
		// 		// }

		// 		len += child.text?.length || 0;
		// 	}
		// }

		buildKeys(tokens.children, selection, context, key);
	}

	return context;
}
