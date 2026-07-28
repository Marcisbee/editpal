/// <reference lib="dom" />

import { assertEquals } from "@std/assert";

import { softwareKeyboardAccessoryInset } from "./utils.ts";

Deno.test("software keyboard accessory inset is reserved on touch viewports", () => {
	assertEquals(softwareKeyboardAccessoryInset(844, 430, 5), 56);
	assertEquals(softwareKeyboardAccessoryInset(844, 844, 5), 0);
	assertEquals(softwareKeyboardAccessoryInset(844, 430, 0), 0);
});
