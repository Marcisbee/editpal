import { addMiddleware, Exome } from "exome";
// import { exomeDevtools } from "exome/devtools";

// addMiddleware(
// 	exomeDevtools({
// 		name: "Exome Playground",
// 	}),
// );

export interface Trace {
	undo(): void;
	redo(): void;
	close?(): void;
}

type TraceBatch = Trace[];

export class HistoryStore extends Exome {
	public locked = false;

	private _max = 40;
	private _lastBatchId?: string | number;

	public _batch: TraceBatch = [];
	public _undo: TraceBatch[] = [];
	public _redo: TraceBatch[] = [];

	public get max(): number {
		return this._max;
	}

	public set max(value: number) {
		this._max = Math.max(0, Math.floor(value));
		this._undo.splice(0, Math.max(0, this._undo.length - this._max));
		this._redo.splice(0, Math.max(0, this._redo.length - this._max));
	}

	public lock = <Value>(fn: () => Value): Value => {
		const wasLocked = this.locked;
		this.locked = true;
		try {
			return fn();
		} finally {
			this.locked = wasLocked;
		}
	};

	public undo() {
		this.lock(() => {
			this.batch();

			const undo = this._undo.pop();

			if (!undo?.[0]) {
				return;
			}

			const batch = undo.reduceRight((acc, trace) => {
				trace.close?.();
				trace.undo();
				return acc.concat(trace);
			}, [] as TraceBatch);

			this._redo.push(batch);
			this._trim(this._redo);
		});
	}

	public redo() {
		this.lock(() => {
			const redo = this._redo.pop();

			if (!redo?.[0]) {
				return;
			}

			const batch = redo.reduceRight((acc, trace) => {
				trace.redo();
				return acc.concat(trace);
			}, [] as TraceBatch);

			this._undo.push(batch);
			this._trim(this._undo);
		});
	}

	public batch = () => {
		if (this._batch.length === 0) {
			return;
		}

		for (const trace of this._batch) {
			trace.close?.();
		}
		this._undo.push(this._batch);
		this._batch = [];
		this._lastBatchId = undefined;

		this._trim(this._undo);
	};

	public continues(batch?: string | number): boolean {
		return batch !== undefined &&
			this._lastBatchId === batch &&
			this._batch.length > 0;
	}

	public push(trace: Trace, batch?: string | number) {
		if (this.locked) {
			return;
		}

		this._redo = [];

		if (this._lastBatchId !== batch) {
			this.batch();
		}

		const previous = this._undo[this._undo.length - 1];
		for (const previousTrace of previous || []) {
			previousTrace.close?.();
		}

		this._lastBatchId = batch;

		if (batch === undefined) {
			this._undo.push([trace]);
		} else {
			this._batch.push(trace);
		}

		this._trim(this._undo);
	}

	public clear() {
		this.batch();
		this._undo = [];
		this._redo = [];
	}

	private _trim(queue: TraceBatch[]) {
		queue.splice(0, Math.max(0, queue.length - this._max));
	}
}
