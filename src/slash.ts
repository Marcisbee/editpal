import { Exome, subscribe } from "exome";

import type { Model } from "./model.ts";
import type { TextToken } from "./tokens.ts";
function getTextSlice(text: TextToken, end: number) {
	const beforeCaret = (text?.text || "").slice(0, Math.max(0, end));
	return beforeCaret.match(/(?:^|\s)(\S*)$/)?.[1]?.toLowerCase();
}

export function removeSlashTrigger(
	text: string,
	start: number,
	end: number,
): { text: string; offset: number } {
	const safeStart = Math.max(0, Math.min(start, text.length));
	const safeEnd = Math.max(safeStart, Math.min(end, text.length));
	const trigger = text.slice(safeStart, safeEnd);
	const validBoundary = safeStart === 0 || /\s/.test(text[safeStart - 1]);

	if (!validBoundary || trigger[0] !== "/" || /\s/.test(trigger)) {
		return { text, offset: safeEnd };
	}

	return {
		text: text.slice(0, safeStart) + text.slice(safeEnd),
		offset: safeStart,
	};
}

export class Slash extends Exome {
	public x?: number;
	public y?: number;
	public isOpen = false;
	public query?: string;
	public triggerKey?: string;
	public triggerStart?: number;
	public triggerEnd?: number;

	private dismissedTrigger?: string;
	private unsubscribers: Array<() => void> = [];

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
				lastQuery = undefined;
				this.dismissedTrigger = undefined;
				this.close();
				return;
			}

			const el = model.findElement(selection.first[0]) as TextToken;
			if (el?.type !== "t" || model.parent(el.key)?.type === "code") {
				lastQuery = undefined;
				this.dismissedTrigger = undefined;
				this.close();
				return;
			}
			const query = getTextSlice(el, selection.last[1]);

			if (lastQuery === query) {
				return;
			}

			lastQuery = query;

			if (query?.[0] !== "/" || query?.[1] === "/") {
				this.dismissedTrigger = undefined;
				this.close();
				return;
			}

			const triggerStart = selection.last[1] - query.length;
			const trigger = `${el.id}:${triggerStart}`;
			if (this.dismissedTrigger === trigger) {
				this.close();
				return;
			}

			this.setQuery(
				query.slice(1),
				el.key,
				triggerStart,
				selection.last[1],
			);
		};

		this.unsubscribers.push(
			subscribe(selection, handler),
			subscribe(model, handler),
		);
	}

	public destroy() {
		for (const unsubscribe of this.unsubscribers.splice(0)) {
			unsubscribe();
		}
	}

	public close() {
		this.isOpen = false;
		this.query = undefined;
	}

	public dismiss() {
		const element = this.triggerKey
			? this.model.findElement(this.triggerKey)
			: undefined;
		if (element && this.triggerStart !== undefined) {
			this.dismissedTrigger = `${element.id}:${this.triggerStart}`;
		}
		this.close();
	}

	public setQuery(
		query: string,
		xOrTriggerKey: number | string,
		yOrTriggerStart: number,
		triggerKeyOrEnd: number | string,
		triggerStart?: number,
		triggerEnd?: number,
	) {
		this.query = query;
		this.isOpen = true;
		if (typeof xOrTriggerKey === "number") {
			this.x = xOrTriggerKey;
			this.y = yOrTriggerStart;
			this.triggerKey = triggerKeyOrEnd as string;
			this.triggerStart = triggerStart;
			this.triggerEnd = triggerEnd;
			return;
		}
		this.x = undefined;
		this.y = undefined;
		this.triggerKey = xOrTriggerKey;
		this.triggerStart = yOrTriggerStart;
		this.triggerEnd = triggerKeyOrEnd as number;
	}

	public setSearchQuery(query: string) {
		this.query = query;
	}
}
