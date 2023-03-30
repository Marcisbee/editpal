import { Exome } from "exome";
import { subscribe } from "exome/subscribe";

import type { Model } from "./model";
import type { TextToken } from "./tokens";
import { getTextNode } from "./utils";

function getTextSlice(text: TextToken, end: number) {
	const chunks = (text?.text || "").split(/( )/);
	let i = 0;

	let c: string;
	let count = 0;
	while ((c = chunks[i]) != null) {
		const endCount = count + c.length;

		if (end <= endCount && end >= count) {
			return c?.toLowerCase();
		}

		count = endCount;
		i += 1;
	}

	return;
}

export class Slash extends Exome {
	public x?: number;
	public y?: number;
	public isOpen = false;
	public query?: string;

	constructor(public model: Model) {
		super();

		const { selection } = model;

		let lastQuery: string | undefined;

		const handler = () => {
			if (!selection) {
				return;
			}

			if (
				!(
					selection.first[0] === selection.last[0] &&
					selection.first[1] === selection.last[1]
				)
			) {
				return;
			}

			const el = model.findElement(selection.first[0]) as TextToken;
			const query = getTextSlice(el, selection.last[1]);

			if (lastQuery === query) {
				return;
			}

			lastQuery = query;

			if (query?.[0] !== "/" || query?.[1] === "/") {
				this.close();
				return;
			}

			const text = getTextNode(el.id);

			if (!text) {
				return;
			}

			const range = document.createRange();
			range.selectNode(text);
			const rect = range.getBoundingClientRect();
			range.detach();

			this.setQuery(query.slice(1), rect.left, rect.top + rect.height);
		};

		subscribe(selection, handler);
		subscribe(model, handler);
	}

	public close() {
		this.isOpen = false;
	}

	public setQuery(query: string, x: number, y: number) {
		this.query = query;
		this.isOpen = true;
		this.x = x;
		this.y = y;
	}

	public onKey(key: string) {
		if (key === "Enter") {
			return true;
		}

		if (key === "ArrowUp") {
			return true;
		}

		if (key === "ArrowDown") {
			return true;
		}
	}
}
