import assert from "node:assert";
import { drag, grab, drop, dragState, below, onto, locateOrFail } from "../lib/drag.mjs";
import { openClean, docText, baseline } from "../lib/obsidian.mjs";

describe("list kinds and grouping", function () {
	it("renumbers an ordered list after a move", async function () {
		await openClean("ordered.md");
		const fourth = await locateOrFail("fourth");
		await drag("first", below(fourth));

		assert.strictEqual(
			await docText(),
			"# Ordered\n\n1. second\n2. third\n3. fourth\n4. first\n",
			"ordered items must renumber 1..n after the move",
		);
	});

	it("preserves the ) separator when renumbering", async function () {
		await openClean("ordered-paren.md");
		const third = await locateOrFail("third");
		await drag("first", below(third));

		assert.strictEqual(
			await docText(),
			"# Ordered paren\n\n1) second\n2) third\n3) first\n",
		);
	});

	it("moves nested children along with their parent", async function () {
		await openClean("nested.md");
		const three = await locateOrFail("parent three");
		await drag("parent one", below(three));

		assert.strictEqual(
			await docText(),
			"# Nested\n\n- parent two\n- parent three\n- parent one\n\t- child a\n\t- child b\n",
			"child a and child b must travel with parent one",
		);
	});

	it("keeps a task out of a bullet list when cross-group drag is off", async function () {
		await openClean("mixed.md");
		const bulletOne = await locateOrFail("bullet one");
		await grab("task one", onto(bulletOne));

		assert.strictEqual(
			(await dragState()).dropLine,
			false,
			"no drop target across kinds while cross-group drag is disabled",
		);
		await drop();
		assert.strictEqual(await docText(), baseline("mixed.md"), "document must be untouched");
	});

	it("reorders within a task list without disturbing the checked state", async function () {
		await openClean("tasks.md");
		const four = await locateOrFail("four");
		await drag("three", below(four));

		assert.strictEqual(
			await docText(),
			"# Tasks\n\n- [ ] one\n- [ ] two\n- [ ] four\n- [x] three\n",
			"the [x] marker must travel with its item",
		);
	});
});
