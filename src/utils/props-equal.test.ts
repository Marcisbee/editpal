import { assertStrictEquals } from "@std/assert";

import { propsEqual } from "./props-equal.ts";

Deno.test("propsEqual = true", () => {
	assertStrictEquals(propsEqual(undefined as any, undefined as any), true);
	assertStrictEquals(propsEqual(null as any, null as any), true);
	assertStrictEquals(propsEqual({}, {}), true);
	assertStrictEquals(propsEqual({ a: 1 }, { a: 1 }), true);
});

Deno.test("propsEqual = false", () => {
	assertStrictEquals(propsEqual(undefined as any, { a: 1 }), false);
	assertStrictEquals(propsEqual(null as any, { a: 1 }), false);
	assertStrictEquals(propsEqual({}, { a: 1 }), false);
	assertStrictEquals(propsEqual({ a: 1 }, {}), false);
	assertStrictEquals(propsEqual({ b: 1 }, { a: 1 }), false);
});
