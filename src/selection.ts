import { Exome } from "exome";

import { Model } from "./model";

export class ModelSelection extends Exome {
	public first: [string, number] = ["0.0", 0];
	public last: [string, number] = this.first;

	public format: Record<string, any> = {};

	constructor(public model: Model) {
		super();
	}

	public setSelection(
		anchor: string,
		anchorOffset: number,
		focus: string,
		focusOffset: number,
	) {
		const [first, last] = (
			[
				[anchor, anchorOffset],
				[focus, focusOffset],
			] as [string, number][]
		).sort((a, b) => {
			if (a[0] === b[0]) {
				return a[1] > b[1] ? 1 : -1;
			}

			return a[0].localeCompare(b[0], undefined, { numeric: true });
		});

		// Fixes Firefox issue where on double click on word it selects out or range elements
		if (first[0] !== last[0]) {
			if (this.model._elements[first[0]]?.text?.length === first[1]) {
				const f = this.model.nextText(first[0]);

				if (f?.key) {
					first[0] = f.key;
					first[1] = 0;
				}
			}

			if (last[1] === 0) {
				const f = this.model.previousText(last[0]);

				if (f?.key) {
					last[0] = f.key;
					last[1] = f.text?.length;
				}
			}
		}

		this.first = first;
		this.last = last;
	}

	public setFormat(format: Record<string, any>) {
		this.format = format;
	}
}
