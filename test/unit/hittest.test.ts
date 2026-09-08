import { test } from "node:test";
import assert from "node:assert";
import { hitTest, DropEntry } from "../../src/drag/hittest";

const entry = (
	groupSlotIdx: number,
	itemIdx: number,
	top: number,
	bottom: number,
	lineBottom = top + 26,
	left = 0,
	right = 300,
): DropEntry => ({ groupSlotIdx, itemIdx, top, lineBottom, bottom, left, right });

test("hitTest selects the item under the cursor", () => {
	const entries = [
		entry(0, 0, 0, 26),
		entry(0, 1, 28, 54),
		entry(0, 2, 56, 82),
	];
	assert.deepStrictEqual(hitTest(entries, 100, 10), { groupSlotIdx: 0, itemIdx: 0 });
	assert.deepStrictEqual(hitTest(entries, 100, 40), { groupSlotIdx: 0, itemIdx: 1 });
	assert.deepStrictEqual(hitTest(entries, 100, 60), { groupSlotIdx: 0, itemIdx: 2 });
	assert.deepStrictEqual(hitTest(entries, 100, 80), { groupSlotIdx: 0, itemIdx: 3 });
});

test("hitTest targets the end after the last item", () => {
	const entries = [entry(0, 0, 0, 26), entry(0, 1, 28, 54)];
	assert.deepStrictEqual(hitTest(entries, 100, 55), { groupSlotIdx: 0, itemIdx: 2 });
	assert.strictEqual(hitTest(entries, 100, 90), null);
});

test("hitTest inserts before the first item above the list", () => {
	const entries = [entry(0, 0, 100, 126)];
	assert.deepStrictEqual(hitTest(entries, 100, 90), { groupSlotIdx: 0, itemIdx: 0 });
	assert.deepStrictEqual(hitTest(entries, 100, 95), { groupSlotIdx: 0, itemIdx: 0 });
});

test("hitTest splits a cross-group gap at the midpoint", () => {
	const entries = [
		entry(0, 0, 0, 26),
		entry(0, 1, 28, 54),
		entry(1, 0, 100, 126),
	];
	assert.deepStrictEqual(hitTest(entries, 100, 70), { groupSlotIdx: 0, itemIdx: 2 });
	assert.deepStrictEqual(hitTest(entries, 100, 85), { groupSlotIdx: 1, itemIdx: 0 });
});

test("hitTest measures gaps from the subtree bottom", () => {
	const entries = [
		entry(0, 0, 0, 80, 26),
		entry(1, 0, 100, 126),
	];
	assert.deepStrictEqual(hitTest(entries, 100, 50), { groupSlotIdx: 0, itemIdx: 1 });
	assert.deepStrictEqual(hitTest(entries, 100, 85), { groupSlotIdx: 0, itemIdx: 1 });
	assert.deepStrictEqual(hitTest(entries, 100, 92), { groupSlotIdx: 1, itemIdx: 0 });
});

test("hitTest returns null outside the horizontal bounds", () => {
	const entries = [entry(0, 0, 0, 26, 26, 100, 200)];
	assert.strictEqual(hitTest(entries, 50, 10), null);
	assert.strictEqual(hitTest(entries, 260, 10), null);
});

test("hitTest returns null with no entries", () => {
	assert.strictEqual(hitTest([], 100, 10), null);
});