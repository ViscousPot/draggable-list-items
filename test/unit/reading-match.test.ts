import { test } from "node:test";
import assert from "node:assert";
import { itemText, stripMarkdown, matchLineNumbers } from "../../src/list/reading-match";

test("itemText strips the marker", () => {
	assert.strictEqual(itemText("- alpha"), "alpha");
	assert.strictEqual(itemText("\t- child"), "child");
	assert.strictEqual(itemText("- [ ] task"), "task");
	assert.strictEqual(itemText("1. numbered"), "numbered");
	assert.strictEqual(itemText("3) paren"), "paren");
});

test("stripMarkdown removes inline formatting and links", () => {
	assert.strictEqual(stripMarkdown("**bold** and *italic*"), "bold and italic");
	assert.strictEqual(stripMarkdown("[link](url)"), "link");
	assert.strictEqual(stripMarkdown("`code` here"), "here");
	assert.strictEqual(stripMarkdown("~~strike~~"), "strike");
});

test("matchLineNumbers pairs lis to parsed lines by text", () => {
	const parsed = [
		{ line: 2, text: "- alpha" },
		{ line: 3, text: "- [ ] task one" },
		{ line: 4, text: "- **bold** item" },
	];
	const result = matchLineNumbers(parsed, ["task one", "bold item", "alpha"]);
	assert.deepStrictEqual(result, [3, 4, 2]);
});

test("matchLineNumbers skips unmatched lis", () => {
	const parsed = [{ line: 2, text: "- alpha" }];
	assert.deepStrictEqual(matchLineNumbers(parsed, ["alpha", "callout item"]), [2, null]);
});

test("matchLineNumbers skips parsed lines with no li", () => {
	const parsed = [
		{ line: 2, text: "- real one" },
		{ line: 3, text: "- fake in code" },
	];
	assert.deepStrictEqual(matchLineNumbers(parsed, ["real one"]), [2]);
});

test("matchLineNumbers handles duplicate item text in order", () => {
	const parsed = [
		{ line: 2, text: "- same" },
		{ line: 3, text: "- same" },
	];
	assert.deepStrictEqual(matchLineNumbers(parsed, ["same", "same"]), [2, 3]);
});