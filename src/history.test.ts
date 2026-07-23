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
