import { test } from "uvu";
import * as assert from "uvu/assert";

import { propsEqual } from './props-equal';

test("propsEqual = true", () => {
	assert.is(propsEqual(undefined as any, undefined as any), true);
	assert.is(propsEqual(null as any, null as any), true);
	assert.is(propsEqual({}, {}), true);
	assert.is(propsEqual({ a: 1 }, { a: 1 }), true);
});

test("propsEqual = false", () => {
	assert.is(propsEqual(undefined as any, { a: 1 }), false);
	assert.is(propsEqual(null as any, { a: 1 }), false);
	assert.is(propsEqual({}, { a: 1 }), false);
	assert.is(propsEqual({ a: 1 }, {}), false);
	assert.is(propsEqual({ b: 1 }, { a: 1 }), false);
});

test.run();
