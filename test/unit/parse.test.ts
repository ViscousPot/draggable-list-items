import { test } from "node:test";
import assert from "node:assert";
import { parseLine, findAllGroups, findGroup } from "../../src/list/parse";

test("parseLine bullet", () => {
	assert.deepStrictEqual(parseLine("- foo"), { kind: "bullet", indent: 0, rawMarker: "-" });
	assert.deepStrictEqual(parseLine("  - foo"), { kind: "bullet", indent: 2, rawMarker: "-" });
});

test("parseLine task", () => {
	assert.deepStrictEqual(parseLine("- [ ] foo"), { kind: "task", indent: 0, rawMarker: "-" });
	assert.deepStrictEqual(parseLine("- [x] done"), { kind: "task", indent: 0, rawMarker: "-" });
});

test("parseLine ordered", () => {
	assert.deepStrictEqual(parseLine("1. foo"), { kind: "ordered", indent: 0, rawMarker: "1.", orderedNum: 1, orderedSep: "." });
	assert.deepStrictEqual(parseLine("3) foo"), { kind: "ordered", indent: 0, rawMarker: "3)", orderedNum: 3, orderedSep: ")" });
});

test("parseLine rejects non-list lines", () => {
	assert.strictEqual(parseLine("plain text"), null);
	assert.strictEqual(parseLine("## Heading"), null);
	assert.strictEqual(parseLine(""), null);
	assert.strictEqual(parseLine("---"), null);
});

test("findAllGroups splits on headings and blank lines", () => {
	const text = ["# A", "", "- a", "- b", "", "## B", "", "- c"];
	const groups = findAllGroups(text);
	assert.strictEqual(groups.length, 2);
	assert.strictEqual(groups[0]!.indent, 0);
	assert.deepStrictEqual(groups[0]!.items.map((i) => i.startLine), [2, 3]);
	assert.deepStrictEqual(groups[1]!.items.map((i) => i.startLine), [7]);
});

test("findAllGroups groups by indent", () => {
	const text = ["- p1", "\t- c1", "\t- c2", "- p2"];
	const groups = findAllGroups(text);
	assert.strictEqual(groups.length, 2);
	assert.deepStrictEqual(groups[0]!.items, [
		{ startLine: 0, endLine: 2 },
		{ startLine: 3, endLine: 3 },
	]);
	assert.deepStrictEqual(groups[1]!.items.map((i) => i.startLine), [1, 2]);
});

test("findAllGroups includes frontmatter phantom list", () => {
	const text = ["---", "tags:", "  - test", "---", "", "- a", "- b"];
	const groups = findAllGroups(text);
	assert.strictEqual(groups.length, 2);
	assert.strictEqual(groups[0]!.items[0]!.startLine, 2);
	assert.strictEqual(groups[1]!.items[0]!.startLine, 5);
});

test("findGroup finds the group containing a line", () => {
	const text = ["- a", "- b", "", "1. one", "2. two"];
	const g = findGroup(text, 4);
	assert.ok(g);
	assert.strictEqual(g.kind, "ordered");
	assert.deepStrictEqual(g.items.map((i) => i.startLine), [3, 4]);
});