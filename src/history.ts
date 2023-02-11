import { addMiddleware, Exome } from "exome";
import { exomeDevtools } from "exome/devtools";

addMiddleware(
	exomeDevtools({
		name: "Exome Playground",
	}),
);

export interface Trace {
	undo(): void;
	redo(): void;
}

type TraceBatch = Trace[];

export class HistoryStore extends Exome {
	public locked = false;

	private _max = 40;
	private _lastBatchId?: string | number;
	private _batch: TraceBatch = [];

	public _undo: TraceBatch[] = [];
	public _redo: TraceBatch[] = [];

	public lock = (fn: Function) => {
		this.locked = true;
		fn();
		this.locked = false;
	}

	public undo() {
		this.lock(() => {
			this.batch();

			const undo = this._undo.pop();

			if (!undo?.[0]) {
				return;
			}

			const batch = undo.reduceRight((acc, trace) => {
				trace.undo();
				return acc.concat(trace);
			}, [] as TraceBatch);

			this._redo.push(batch);
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
			// console.log(redo);
			// // redo.forEach((trace) => {
			// //   (
			// //     trace.restoreHandler || loadLocalState
			// //   )(trace.instance, trace.payload, trace.state[trace.state.length - 1]);
			// // });

			// this._undo.push(redo);
		});
	}

	public batch = () => {
		if (this._batch.length === 0) {
			return;
		}

		this._undo.push(this._batch);
		this._batch = [];
		this._lastBatchId = undefined;

		if (this._undo.length > this._max) {
			this._undo.shift();
		}
	};

	// push(keydown, 'key')       // start batch
	// push(keydown, 'key')       // continue batch
	// push(backspace, 'delete')  // start new batch
	public push(trace: Trace, batch?: string | number) {
		if (this.locked) {
			return;
		}

		this._redo = [];

		if (this._lastBatchId !== batch) {
			this.batch();
		}

		this._lastBatchId = batch;

		if (batch === undefined) {
			this._undo.push([trace]);
		} else {
			this._batch.push(trace);
		}

		if (this._undo.length > this._max) {
			this._undo.shift();
		}
	}

	public clear() {
		this.batch();
		this._undo = [];
		this._redo = [];
	}
}
