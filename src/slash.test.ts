/// <reference lib="dom" />

import { assertEquals } from "@std/assert";

import { removeSlashTrigger } from "./slash.ts";

Deno.test("slash trigger removal only removes the active command text", () => {
	assertEquals(removeSlashTrigger("/todo", 0, 5), {
		text: "",
		offset: 0,
	});
	assertEquals(removeSlashTrigger("before /todo after", 7, 12), {
		text: "before  after",
		offset: 7,
	});
	assertEquals(removeSlashTrigger("before / after", 7, 8), {
		text: "before  after",
		offset: 7,
	});
});

Deno.test("slash trigger removal rejects partial words and invalid ranges", () => {
	assertEquals(removeSlashTrigger("path/to", 4, 7), {
		text: "path/to",
		offset: 7,
	});
	assertEquals(removeSlashTrigger("before /todo", -10, 100), {
		text: "before /todo",
		offset: 12,
	});
	assertEquals(removeSlashTrigger("plain", 2, 4), {
		text: "plain",
		offset: 4,
	});
});
