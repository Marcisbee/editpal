import { Exome } from "exome";

export class ModelSelection extends Exome {
	public first: [string, number] = ["0.0", 0];
	public last: [string, number] = this.first;

	public format: Record<string, any> = {};

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

		this.first = first;
		this.last = last;
	}

	public setFormat(format: Record<string, any>) {
		this.format = format;
	}
}
