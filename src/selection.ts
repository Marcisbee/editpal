import { Exome } from "exome";

import type { Model } from "./model.ts";

export interface MarkdownBoundary {
	format: Record<string, any>;
	side: "before" | "after";
	tokenId: string;
}

export class ModelSelection extends Exome {
	public focus = false;
	public first: [string, number] = ["0.0", 0];
	public last: [string, number] = this.first;

	public format: Record<string, any> = {};
	public markdownBoundary?: MarkdownBoundary;

	constructor(public model: Model) {
		super();
	}

	public setFocus(focus: boolean) {
		this.focus = focus;
	}

	public setSelection(
		anchor: string,
		anchorOffset: number,
		focus: string,
		focusOffset: number,
	) {
		this.markdownBoundary = undefined;
		const [first, last] = (
			[
				[anchor, anchorOffset],
				[focus, focusOffset],
			] as [string, number][]
		).sort((a, b) => {
			if (a[0] === b[0]) {
				return a[1] - b[1];
			}

			return a[0].localeCompare(b[0], undefined, { numeric: true });
		});

		this.first = first;
		this.last = last;
	}

	public setFormat(format: Record<string, any>) {
		this.format = format;
	}

	public setMarkdownBoundary(boundary?: MarkdownBoundary) {
		this.markdownBoundary = boundary;
	}

	public getOffset = () => ({
		x: 0,
		y: 0,
	});

	public setOffset(getter: ModelSelection["getOffset"]) {
		this.getOffset = getter;
	}

	public getPortal = (): null | HTMLElement => null;

	public setPortal(getter: ModelSelection["getPortal"]) {
		this.getPortal = getter;
	}
}
