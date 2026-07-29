import { assertEquals, assertThrows } from "@std/assert";

import { HistoryStore } from "./history.ts";

Deno.test("history lock is released when the callback throws", () => {
	const history = new HistoryStore();

	assertThrows(() => {
		history.lock(() => {
			throw new Error("failure");
		});
	});

	assertEquals(history.locked, false);
});

Deno.test("a merged history unit retains one trace", () => {
	const history = new HistoryStore();
	let value = "";

	const push = (next: string) => {
		if (!history.continues("typing")) {
			const before = value;
			let after: string | undefined;
			history.push({
				close: () => {
					after ??= value;
				},
				undo: () => {
					value = before;
				},
				redo: () => {
					value = after!;
				},
			}, "typing");
		}
		value += next;
	};

	push("a");
	push("b");
	push("c");

	assertEquals(history._batch.length, 1);
	history.undo();
	assertEquals(value, "");
	history.redo();
	assertEquals(value, "abc");
});

Deno.test("history caps undo and redo queues", () => {
	const history = new HistoryStore();
	let value = 0;

	for (let next = 1; next <= 4; next++) {
		const before = value;
		history.push({
			undo: () => {
				value = before;
			},
			redo: () => {
				value = next;
			},
		});
		value = next;
	}

	history.max = 2;
	assertEquals(history._undo.length, 2);
	history.undo();
	history.undo();
	assertEquals(history._redo.length, 2);

	history.max = 1;
	assertEquals(history._undo.length, 0);
	assertEquals(history._redo.length, 1);
});
