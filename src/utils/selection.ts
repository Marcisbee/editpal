import type { AnyToken } from "../tokens";

import { propsEqual } from "./props-equal";

export type BuildKeysSelection = [
	[null | string, null | number],
	[null | string, null | number],
];

export interface BuildKeysContext {
	keys: Record<string, string>;
	newSelection: BuildKeysSelection;
}

export function buildKeys(
	tokens: AnyToken | AnyToken[],
	selection: BuildKeysSelection,
	context: BuildKeysContext = {
		keys: {},
		newSelection: JSON.parse(JSON.stringify(selection)),
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

	tokens.key = key.join(".");

	// @TODO handle this
	// this._elements_temp[tokens.key] = tokens;

	context.keys[tokens.id] = tokens.key;

	// @TODO figure out where did last selection was and fix it on the fly

	const [first, last] = context.newSelection;
	const isCollapsed =
		selection[0][0] === selection[1][0] && selection[0][1] === selection[1][1];
	// let fixedFirst;
	// let fixedLast;

	// console.log(
	// 	{
	// 		first,
	// 		firstOffset,
	// 		last,
	// 		lastOffset,
	// 	},
	// 	tokens.key,
	// );

	if (tokens.type !== "t" && Array.isArray(tokens.children)) {
		let lastChild;
		let i = -1;
		let diff = 0;
		let textDiff = 0;
		// let

		for (const child of tokens.children.slice()) {
			i += 1;

			check: {
				if (lastChild?.type !== "t" || child?.type !== "t") {
					break check;
				}

				if (!lastChild.text) {
					// const kk = key.concat(i - 1).join(".");
					console.log("R -last", key, i);
					// if (!isCollapsed && first[0] === kk) {
					// Nothing changes really
					diff -= 1;
					textDiff = 0;
					// first[0] = key.concat(i - 1).join(".");
					// first[1] = 0;
					// }
					// if (lastKey === kk) {
					// 	console.warn("A2", kk);
					// 	// fixedLast = [last.key, last.text.length];
					// }
					tokens.children.splice(i - 1, 1);
					i -= 1;
					break check;
				}

				if (!child.text) {
					// const kk = key.concat(i + 1).join(".");
					console.log("R -child", key, i);
					diff -= 1;
					textDiff = 0;
					tokens.children.splice(i, 1);
					i -= 1;

					// if (lastKey === kk) {
					// 	// this.selection.fixFirstKey -= 1;
					// 	// this.selection.fixFirstOffset = child.text.length;
					// 	console.log("REEEEEEE 1", this.selection.fixFirstKey);
					// }

					// @TODO Handle 0.0 position
					// if (!fixedFirst && firstKey === kk) {
					// 	console.warn("B1", kk, "=>", i, last.text, child.text);
					// 	fixedFirst = [
					// 		key.concat(i).join("."),
					// 		last.text.length + firstOffset,
					// 	];
					// }

					// if (!fixedLast && lastKey === kk) {
					// 	console.warn("B2", kk, "=>", i, last.text, child.text);
					// 	fixedLast = [
					// 		key.concat(i).join("."),
					// 		firstKey === lastKey
					// 			? last.text.length + firstOffset + lastOffset
					// 			: lastOffset,
					// 	];
					// }
					continue;
				}

				if (propsEqual(lastChild.props, child.props)) {
					const kk = key.concat(i - 1).join(".");
					const ka = key.concat(i).join(".");
					console.log("merge", first[0], kk, { diff, textDiff });

					// if (!isCollapsed && last[0] === ka) {
					// 	console.log('pppp');
					// 	// first[0] = kk;

					// 	// if (first[1]) {
					// 	// 	first[1] += lastChild.text.length || 0;
					// 	// }
					// }

					// Child gets merged into last one
					// Merge previous into last one
					if (!isCollapsed && first[0] === ka) {
						first[0] = kk;

						first[1] = lastChild.text.length || 0;
					} else if (!isCollapsed && first[0] === kk) {
						first[0] = kk;

						// if (selection[0][1]) {
						// 	// first[1] += lastChild.text.length || 0;
						// }
						// // console.log("merge 1", kk, { diff });
					}

					if (!isCollapsed && last[0] === child.key) {
						last[0] = kk;

						if (diff < 0) {
							last[1] += lastChild.text.length || 0;
						console.log("last", "+", lastChild.text.length || 0);
						}

						// if (diff === 0) {
							// last[1] += textDiff;
						// 	last[1] += lastChild.text.length || 0;
						// 	console.log('po');
						// }else
						// else if (diff === 0) {
						// 	console.log("po");
						// }
						console.log("PP", { diff, textDiff });
					} else if (!isCollapsed && last[0] === ka) {
						last[0] = kk;
						last[1] += lastChild.text.length || 0;
						console.log("last", "+", lastChild.text.length || 0);
						// console.log("merge 2", kk, { diff });
					} else if (!isCollapsed && last[0] === kk) {
						last[0] = kk;
						if (diff < 0 && textDiff) {
							last[1] = lastChild.text.length + child.text.length;
						console.log("last", "=", lastChild.text.length + child.text.length);
						} else {
							last[1] = lastChild.text.length;
						console.log("last", "=", lastChild.text.length);
						}
						// last[1] = lastChild.text.length || 0;
						// console.log("last", "=", lastChild.text.length || 0);
						// console.log("merge 2", kk, { diff });
					}

					// const ka = key.concat(this.selection.fixFirstKey).join(".");
					// const kb = key.concat(this.selection.fixLastKey).join(".");
					// {
					// 	const kk = key.concat(i).join(".");
					// 	const ka = key.concat(this.selection.fixFirstKey).join(".");
					// 	const kb = key.concat(this.selection.fixLastKey).join(".");

					// 	if (kk === ka) {
					// 		console.log("REMOVE FIRST", kk, ka, this.selection.fixFirstKey);
					// 		this.selection.fixFirstKey -= 1;
					// 	}

					// 	if (kk === kb) {
					// 		console.log("REMOVE LAST", this.selection.fixLastKey);
					// 		this.selection.fixLastKey -= 1;
					// 	}
					// }
					// @TODO this was last try
					// if (firstKey === ka) {
					// 	console.log(
					// 		"%c< FIRST MATCH",
					// 		"color: salmon;",
					// 		last,
					// 		child,
					// 		firstOffset,
					// 	);
					// 	console.table({
					// 		key: {
					// 			from: this.selection.fixFirstKey,
					// 			to: i - 1,
					// 		},
					// 		offset: {
					// 			from: this.selection.fixFirstOffset,
					// 			to: firstOffset || child.key ? 0 : last.text.length,
					// 		},
					// 	});
					// 	// console.log(
					// 	// 	"%c< FIRST MATCH",
					// 	// 	"color: salmon;",
					// 	// 	this.selection.fixFirstKey,
					// 	// 	"=>",
					// 	// 	i - 1,
					// 	// 	last,
					// 	// 	child,
					// 	// );
					// 	this.selection.fixFirstKey = i - 1;
					// 	// this.selection.fixFirstKey -= firstOffset ? 1 : 0;
					// 	this.selection.fixFirstOffset =
					// 		firstOffset || child.key ? 0 : last.text.length;
					// }

					// if (lastKey === kk) {
					// 	console.log(
					// 		"%c> LAST MATCH",
					// 		"color: salmon;",
					// 		last,
					// 		child,
					// 		firstOffset,
					// 	);
					// 	console.table({
					// 		key: {
					// 			from: this.selection.fixLastKey,
					// 			to: i - 1,
					// 		},
					// 		offset: {
					// 			from: this.selection.fixLastOffset,
					// 			to:
					// 				firstKey === lastKey
					// 					? last.text.length
					// 					: last.text.length + child.text.length,
					// 		},
					// 	});
					// 	// console.log(
					// 	// 	"%c> LAST MATCH",
					// 	// 	"color: salmon;",
					// 	// 	this.selection.fixLastKey,
					// 	// 	'=>',
					// 	// 	i - 1,
					// 	// 	last,
					// 	// 	child,
					// 	// );
					// 	this.selection.fixLastKey = i - 1;
					// 	this.selection.fixLastOffset =
					// 		(this.selection.fixFirstKey === this.selection.fixLastKey && last.key)
					// 			? this.selection.fixFirstOffset + lastOffset
					// 			: firstKey === lastKey
					// 			? last.text.length
					// 			: last.text.length + child.text.length;
					// }

					// const kk = key.concat(i - 1).join(".");
					// const ka = firstKey.replace(
					// 	/\.\d+$/,
					// 	`.${this.selection.fixFirstKey}`,
					// );
					// const kb = lastKey.replace(
					// 	/\.\d+$/,
					// 	`.${this.selection.fixLastKey}`,
					// );
					// if (firstKey === ka) {
					// 	// console.log("remove 1.3");
					// 	this.selection.fixFirstKey = i - 1;
					// 	this.selection.fixFirstOffset = last.text.length;
					// }
					// // if (kk === lastKey) {
					// 	// console.log("remove 2.3");
					// 	this.selection.fixLastKey = i -1;
					// 	this.selection.fixLastOffset = firstOffset
					// 		? child.text.length
					// 		: last.text.length;
					// // }
					// if (ka === kk) {
					// 	console.log("remove 1", this.selection.fixFirstKey);
					// 	this.selection.fixFirstKey -= 1;
					// 	this.selection.fixFirstOffset = last.text.length;
					// }
					// if (lastKey === kk) {
					// 	console.log("remove 2.1");
					// 	this.selection.fixLastKey = i- 1;
					// 	this.selection.fixLastOffset = i === 0 ? lastOffset : last.text.length;
					// // } else
					// // if (lastKey === kk && firstKey !== lastKey) {
					// // 	console.log("remove 2.2");
					// // 	this.selection.fixLastKey =i-1;
					// // 	this.selection.fixLastOffset = last.text.length;
					// }

					// console.log("R props", key, i);
					// if (firstKey === kk) {
					// 	console.log('%c resque', 'color: red;');
					// 	this.selection.fixFirstKey -= 1;
					// 	// this.selection.fixFirstOffset = last.text.length;
					// }
					// if (!fixedFirst && firstKey === kk) {
					// 	console.warn(
					// 		"C1",
					// 		kk,
					// 		"=>",
					// 		i - 1,
					// 		last.text,
					// 		"+",
					// 		child.text,
					// 	);
					// 	fixedFirst = [key.concat(i - 1).join("."), last.text.length];
					// }
					// if (!fixedLast && lastKey === kk) {
					// 	console.warn(
					// 		"C2",
					// 		kk,
					// 		"=>",
					// 		i - 1,
					// 		last.text,
					// 		"+",
					// 		child.text,
					// 	);
					// 	fixedLast = [
					// 		key.concat(i - 1).join("."),
					// 		(firstKey === lastKey ? child.text.length : 0) +
					// 			last.text.length,
					// 	];
					// }
					diff -= 1;
					textDiff = lastChild.text.length;
					console.log("text diff", textDiff);

					lastChild.text += child.text;
					tokens.children.splice(i, 1);
					i -= 1;
					continue;
				}

				// Key not initiated
				// This thing was just added
				// if (!child.key) {
				// const kk = key.concat(i - 1).join(".");
				// const ka = firstKey.replace(/\.\d+$/, `.${this.selection.fixFirstKey}`);
				// const kb = lastKey.replace(/\.\d+$/, `.${this.selection.fixLastKey}`);
				// if (ka === firstKey && firstOffset) {
				// 	console.log('add 1');
				// 	this.selection.fixFirstKey += 1;
				// 	this.selection.fixFirstOffset = 0;
				// }
				// if (lastKey === kk && firstKey === lastKey && firstOffset) {
				// 	console.log("add 2.1");
				// 	this.selection.fixLastKey += 1;
				// 	this.selection.fixLastOffset = lastOffset - firstOffset;
				// } else
				// if (lastKey === kk && firstKey !== lastKey) {
				// 	console.log("add 2.2");
				// 	this.selection.fixLastKey += i === 1 ? 0 : 1;
				// 	this.selection.fixLastOffset = i === 1 ? lastOffset : child.text.length;
				// } else
				// if (kk === firstKey && firstOffset) {
				// 	// console.log('add 1.3');
				// 	this.selection.fixFirstKey += 1;
				// 	this.selection.fixFirstOffset = 0;
				// }
				// if (kk === lastKey) {
				// 	// console.log('add 2.3');
				// 	this.selection.fixLastKey += firstOffset ? 1 : 0;
				// 	this.selection.fixLastOffset = firstOffset ? child.text.length : last.text.length;
				// }
				// if (!fixedFirst && firstKey === kk && firstOffset) {
				// 	console.warn("D1", kk, "=>", i, last.text);
				// 	fixedFirst = [key.concat(i).join("."), 0];
				// }
				// if (lastKey === kk && firstOffset) {
				// 	console.warn("D2", kk, "=>", i, last.text);
				// 	fixedLast = [key.concat(i).join("."), child.text.length];
				// }
				// // if (!fixedLast && lastKey === kk && !firstOffset) {
				// // 	console.warn("FIX 3 L1", kk, "=>", i, child.text);
				// // 	fixedLast = [key.concat(i - 1).join("."), child.text.length];
				// // }

				// if (fixedFirst && !fixedLast && lastKey === key.concat(i).join(".")) {
				// 	console.log("%cBINGO", "color: red;");
				// 	console.warn("D3", lastKey, "=>", i, key.concat(i).join("."));
				// 	fixedLast = [key.concat(i - 1).join("."), last.text.length];
				// }
				// console.warn(child, { firstKey, lastKey }, kk, tokens.key);

				// // if (!fixedFirst && )

				// // console.warn(child, {firstKey, lastKey}, kk, tokens.key);
				// }
				// {
				// 	const kk = key.concat(i).join(".");
				// 	const ka = key.concat(this.selection.fixFirstKey).join(".");
				// 	const kb = key.concat(this.selection.fixLastKey).join(".");

				// 	if (kk === firstKey) {
				// 		console.log("ADD FIRST", kk, ka, this.selection.fixFirstKey);
				// 		this.selection.fixFirstKey += firstOffset ? 1 : 0;
				// 		this.selection.fixFirstOffset = 0;

				// 		// reset last offset
				// 		this.selection.fixLastOffset = 0
				// 	}

				// 	if (kk === lastKey) {
				// 		console.log("ADD LAST", kk, kb, this.selection.fixLastKey);
				// 		this.selection.fixLastKey += firstOffset ? 1 : 0;
				// 		this.selection.fixLastOffset += firstOffset ? last.text.length : child.text.length;
				// 	}
				// }
				if (!child.key && !isCollapsed) {
					const kk = key.concat(i - 1).join(".");
					const ka = key.concat(i).join(".");
					console.log("add", first[0], last[0], kk, { diff });

					if (kk === selection[0][0]) {
						first[0] = key.concat(i + diff).join(".");
						first[1] = textDiff;
						// first[1] = 0;
						// console.log("add", first[0], kk);
					}

					// if (kk === last[0]) {
					// 	console.log('>>>>>>>>>');
					// }
					// if (ka === selection[1][0]) {
					// 	last[0] = key.concat(i + diff).join(".");
					// 	// last[0] = key.concat(i + diff).join(".");

					// 	// if (!textDiff) {
					// 	// last[1] = textDiff + lastChild.text.length;
					// 	// } else {
					// 	// last[1] += textDiff;
					// console.log("0-----------");
					// 	// }
					// 	// console.log("add", textDiff, child.text.length, lastChild.text.length);
					// } else
					if (kk === selection[1][0]) {
						last[0] = key.concat(i + diff).join(".");

						if (diff >= 0) {
							last[1] = textDiff + child.text.length || 0;
						console.log("last", "=", textDiff + child.text.length || 0);
							// } else {
							// last[1] += textDiff;
							// } else {
							// 	last[1] = textDiff + lastChild.text.length || 0;
						}
						console.log(">>>>> ", last[1], selection[1][1]);
						// console.log("add", textDiff, child.text.length, lastChild.text.length);
					}

					// if (ka === selection[1][0]) {
					// 	// last[0] = key.concat(i + diff).join(".");
					// 	last[1] = lastChild.text.length;
					// 	console.log("add", textDiff, child.text.length, lastChild.text.length);
					// }
				}

				// @TODO this was last try
			// if (!child.key) {
			// 	if (firstKey === last.key) {
			// 		console.log("%cFIRST MATCH", "color: orange;");
			// 		this.selection.fixFirstKey += 1;
			// 		this.selection.fixFirstOffset = 0;
			// 	}

			// 	// @TODO Figure out `Hello Jupiter!`
			// 	//                     ^^^^^^^ - bold
			// 	// Same for un-bold
			// 	if (lastKey === last.key) {
			// 		console.log("%cLAST MATCH", "color: orange;", last, child);
			// 		this.selection.fixLastKey += firstOffset ? 1 : 0;
			// 		this.selection.fixLastOffset = firstOffset
			// 			? child.text.length
			// 			: last.text.length;
			// 	} else if (firstOffset) {
			// 		// this.selection.fixLastKey += 1;
			// 	}

			// 	console.log("R add", key, i, child, JSON.stringify(last.key));
			// }
			}

			textDiff = 0;

			lastChild = child;
		}

		buildKeys(tokens.children, selection, context, key);
	}

	// if (fixedFirst) {
	// 	this.selection.fixFirst = fixedFirst;
	// 	console.log({
	// 		fixedFirst,
	// 	});
	// 	// this.selection.fix = true;
	// }

	// if (fixedLast) {
	// 	this.selection.fixLast = fixedLast;
	// 	console.log({
	// 		fixedLast,
	// 	});
	// 	// this.selection.fix = true;
	// }

	return context;
}
