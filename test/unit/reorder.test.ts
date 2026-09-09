import { test } from "node:test";
import assert from "node:assert";
import { findAllGroups } from "../../src/list/parse";
import {
	moveItem,
	moveItemCrossGroup,
	extractItemFromText,
	insertItemIntoText,
	remapLines,
	insertionIndex,
	moveParams,
	makeChildItem,
	insertAsChild,
} from "../../src/list/reorder";

const lines = (text: string) => text.split("\n");

test("moveItem reorders within a group", () => {
	const text = ["# B", "", "- a", "- b", "- c", "- d"].join("\n");
	const all = findAllGroups(lines(text));
	const g = all.find((x) => x.kind === "bullet")!;
	const result = moveItem(text, g, 0, 4);
	assert.ok(result);
	assert.strictEqual(result.text, ["# B", "", "- b", "- c", "- d", "- a"].join("\n"));
	assert.deepStrictEqual(result.newOrder, [1, 2, 3, 0]);
});

test("moveItem no-ops on source and source+1 targets", () => {
	const text = ["- a", "- b", "- c"].join("\n");
	const g = findAllGroups(lines(text))[0]!;
	assert.strictEqual(moveItem(text, g, 1, 1)!.text, text);
	assert.strictEqual(moveItem(text, g, 1, 2)!.text, text);
});

test("moveItem renumbers ordered lists", () => {
	const text = ["1. one", "2. two", "3. three", "4. four"].join("\n");
	const g = findAllGroups(lines(text))[0]!;
	const result = moveItem(text, g, 0, 4)!;
	assert.strictEqual(result.text, ["1. two", "2. three", "3. four", "4. one"].join("\n"));
});

test("moveItem moves nested children with the parent", () => {
	const text = ["- p1", "\t- c1", "\t- c2", "- p2", "- p3"].join("\n");
	const g = findAllGroups(lines(text))[0]!;
	const result = moveItem(text, g, 0, 3)!;
	assert.strictEqual(result.text, ["- p2", "- p3", "- p1", "\t- c1", "\t- c2"].join("\n"));
});

test("moveItemCrossGroup converts a bullet into a task", () => {
	const text = ["- b-one", "", "- [ ] t-one", "- [ ] t-two"].join("\n");
	const all = findAllGroups(lines(text));
	const from = all.find((g) => g.kind === "bullet")!;
	const to = all.find((g) => g.kind === "task")!;
	const result = moveItemCrossGroup(text, from, 0, to, 0);
	assert.ok(result);
	assert.ok(result.includes("- [ ] b-one"));
});

test("moveItemCrossGroup renumbers ordered targets", () => {
	const text = ["- bullet", "", "1. one", "2. two"].join("\n");
	const all = findAllGroups(lines(text));
	const from = all.find((g) => g.kind === "bullet")!;
	const to = all.find((g) => g.kind === "ordered")!;
	const result = moveItemCrossGroup(text, from, 0, to, 0)!;
	assert.strictEqual(result, ["", "1. bullet", "2. one", "3. two"].join("\n"));
});

test("extractItemFromText returns the doc without the block", () => {
	const text = ["- a", "- b", "- c"].join("\n");
	const g = findAllGroups(lines(text))[0]!;
	const extract = extractItemFromText(text, g, 1)!;
	assert.deepStrictEqual(extract.block, ["- b"]);
	assert.strictEqual(extract.text, ["- a", "- c"].join("\n"));
});

test("extract + insert round-trip moves a subtree across files", () => {
	const src = ["# S", "", "- s-one", "\t- child a", "\t- child b", "- s-two"].join("\n");
	const tgt = ["# T", "", "- t-one", "- t-two"].join("\n");
	const srcGroups = findAllGroups(lines(src));
	const srcGroup = srcGroups.find((g) => g.items.some((it) => it.startLine === 2))!;
	const extract = extractItemFromText(src, srcGroup, 0)!;
	assert.strictEqual(extract.block.length, 3);
	assert.ok(!extract.text.includes("s-one"));
	assert.ok(extract.text.includes("s-two"));

	const tgtGroups = findAllGroups(lines(tgt));
	const tgtGroup = tgtGroups.find((g) => g.kind === "bullet")!;
	const inserted = insertItemIntoText(tgt, extract.block, "bullet", tgtGroup, 1);
	assert.ok(inserted);
	assert.strictEqual(
		inserted,
		["# T", "", "- t-one", "- s-one", "\t- child a", "\t- child b", "- t-two"].join("\n"),
	);
});

test("cross-file source slice does not duplicate trailing content", () => {
	const text = ["# C", "", "- c-one", "\t- c-one child a", "\t- c-one child b", "- c-two", "", "Trailing paragraph"].join("\n");
	const all = findAllGroups(lines(text));
	const group = all.find((g) => g.items.some((it) => it.startLine === 2))!;
	const extract = extractItemFromText(text, group, 0)!;
	assert.strictEqual(extract.block.length, 3);
	const affectedStart = group.items[0]!.startLine;
	const affectedEnd = group.items[group.items.length - 1]!.endLine;
	const sourceLines = extract.text.split("\n");
	assert.deepStrictEqual(
		sourceLines.slice(affectedStart, affectedEnd + 1 - extract.block.length),
		["- c-two"],
	);
	assert.strictEqual(extract.text.split("Trailing paragraph").length - 1, 1);
});

test("the buggy unbounded source slice overruns into trailing content", () => {
	const text = ["# C", "", "- c-one", "\t- c-one child a", "\t- c-one child b", "- c-two", "", "Trailing paragraph"].join("\n");
	const all = findAllGroups(lines(text));
	const group = all.find((g) => g.items.some((it) => it.startLine === 2))!;
	const extract = extractItemFromText(text, group, 0)!;
	const affectedStart = group.items[0]!.startLine;
	const affectedEnd = group.items[group.items.length - 1]!.endLine;
	const sourceLines = extract.text.split("\n");
	assert.ok(
		sourceLines.slice(affectedStart, affectedEnd + 1).includes("Trailing paragraph"),
	);
});

test("remapLines maps a move permutation", () => {
	assert.deepStrictEqual(remapLines(0, 0, 5, [0, 1, 2, 3, 4, 5]), [5, 0, 1, 2, 3, 4]);
	assert.deepStrictEqual(remapLines(2, 2, 0, [0, 1, 2, 3, 4, 5]), [1, 2, 0, 3, 4, 5]);
	assert.deepStrictEqual(remapLines(1, 3, 2, [0, 1, 2, 3, 4, 5, 6]), [0, 2, 3, 4, 1, 5, 6]);
});

test("remapLines moves a subtree block", () => {
	assert.deepStrictEqual(remapLines(0, 2, 4, [0, 1, 2, 3, 4, 5]), [4, 5, 6, 0, 1, 2]);
});

test("moveParams matches moveItem same-group permutation", () => {
	const text = ["- a", "- b", "- c", "- d"].join("\n");
	const g = findAllGroups(lines(text))[0]!;
	const p = moveParams(g, 0, g, 4)!;
	assert.deepStrictEqual(p, { s: 0, e: 0, t: 3 });
	assert.deepStrictEqual(remapLines(p.s, p.e, p.t, [0, 1, 2, 3]), [3, 0, 1, 2]);
	const p2 = moveParams(g, 2, g, 0)!;
	assert.deepStrictEqual(p2, { s: 2, e: 2, t: 0 });
	assert.deepStrictEqual(remapLines(p2.s, p2.e, p2.t, [0, 1, 2, 3]), [1, 2, 0, 3]);
});

test("moveParams matches moveItemCrossGroup permutation", () => {
	const text = ["- a", "- b", "Sep", "- x", "- y"].join("\n");
	const all = findAllGroups(lines(text));
	const from = all.find((g) => g.items[0].startLine === 0)!;
	const to = all.find((g) => g.items[0].startLine === 3)!;
	const p = moveParams(from, 0, to, 0)!;
	assert.deepStrictEqual(p, { s: 0, e: 0, t: 2 });
	assert.deepStrictEqual(remapLines(p.s, p.e, p.t, [0, 1, 2, 3, 4]), [2, 0, 1, 3, 4]);
});

test("insertionIndex accounts for the source shift", () => {
	const text = ["- a", "- b", "Sep", "- x", "- y"].join("\n");
	const all = findAllGroups(lines(text));
	const tgt = all.find((g) => g.items[0].startLine === 3)!;
	assert.strictEqual(insertionIndex(tgt, 2, 0, 1), 4);
	assert.strictEqual(insertionIndex(tgt, 0, 0, 1), 2);

	const text2 = ["- x", "- y", "Sep", "- a", "- b"].join("\n");
	const all2 = findAllGroups(lines(text2));
	const tgt2 = all2.find((g) => g.items[0].startLine === 0)!;
	assert.strictEqual(insertionIndex(tgt2, 2, 3, 1), 2);
	assert.strictEqual(insertionIndex(tgt2, 0, 3, 1), 0);
});

test("makeChildItem re-indents an item under its new parent", () => {
	const text = ["- p1", "\t- child x", "- p2", "\t- child y", "- p3"].join("\n");
	const all = findAllGroups(lines(text));
	const from = all.find((g) => g.indent === 1)!;
	const parent = all.find((g) => g.indent === 0)!;
	const result = makeChildItem(text, from, 0, parent, 2)!;
	assert.strictEqual(
		result.text,
		["- p1", "- p2", "\t- child y", "- p3", "\t- child x"].join("\n"),
	);
	assert.deepStrictEqual([result.s, result.e, result.t], [1, 1, 4]);
});

test("makeChildItem places an item after existing children", () => {
	const text = ["- p", "\t- c1", "\t- c2", "- other", "\t- c3"].join("\n");
	const all = findAllGroups(lines(text));
	const from = all.find((g) => g.indent === 1 && g.items.some((i) => i.startLine === 4))!;
	const parent = all.find((g) => g.indent === 0 && g.items.some((i) => i.startLine === 0))!;
	const result = makeChildItem(text, from, 0, parent, 0)!;
	assert.strictEqual(
		result.text,
		["- p", "\t- c1", "\t- c2", "\t- c3", "- other"].join("\n"),
	);
});

test("makeChildItem handles a source item with children", () => {
	const text = ["- p1", "- p2", "\t- sub a", "\t- sub b"].join("\n");
	const all = findAllGroups(lines(text));
	const group = all.find((g) => g.indent === 0)!;
	const result = makeChildItem(text, group, 1, group, 0)!;
	assert.strictEqual(
		result.text,
		["- p1", " - p2", "  - sub a", "  - sub b"].join("\n"),
	);
});

test("insertAsChild re-indents and inserts after the parent subtree", () => {
	const text = ["- p", "\t- c", "- other"].join("\n");
	const all = findAllGroups(lines(text));
	const parent = all.find((g) => g.indent === 0 && g.items.some((i) => i.startLine === 0))!;
	const result = insertAsChild(text, ["- moving", "\t- child of moving"], 0, parent, 0)!;
	assert.strictEqual(
		result,
		["- p", "\t- c", " - moving", "  - child of moving", "- other"].join("\n"),
	);
});