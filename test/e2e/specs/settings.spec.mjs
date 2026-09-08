import assert from "node:assert";
import { drag, onto, locateOrFail } from "../lib/drag.mjs";
import { openClean, docText, fileText, setSettings, handleCount } from "../lib/obsidian.mjs";

describe("settings", function () {
	afterEach(async function () {
		await setSettings({
			enabled: true,
			enableCrossGroupDrag: false,
			enableCrossFileDrag: false,
		});
	});

	it("hides every handle when drag handles are disabled", async function () {
		await openClean("bullets.md");
		assert.strictEqual(await handleCount(), 4, "handles present while enabled");

		await setSettings({ enabled: false });
		assert.strictEqual(await handleCount(), 0, "handles must disappear when disabled");

		await setSettings({ enabled: true });
		assert.strictEqual(await handleCount(), 4, "handles must come back when re-enabled");
	});

	it("moves an item between separate lists once cross-group drag is on", async function () {
		await setSettings({ enableCrossGroupDrag: true });
		await openClean("groups.md");

		const target = await locateOrFail("group2 charlie");
		await drag("group1 alpha", onto(target));

		const after = await docText();
		assert.ok(
			after.includes("- group2 charlie") && after.includes("- group1 alpha"),
			"both items should still exist:\n" + after,
		);
		assert.ok(
			after.indexOf("group1 alpha") > after.indexOf("Separator paragraph"),
			"group1 alpha should have moved into the second list:\n" + after,
		);
	});

	it("converts a bullet into a task when dropped into a task list", async function () {
		await setSettings({ enableCrossGroupDrag: true });
		await openClean("mixed.md");

		const taskOne = await locateOrFail("task one");
		await drag("bullet one", onto(taskOne));

		const after = await docText();
		assert.ok(
			after.includes("- [ ] bullet one"),
			"the bullet must be rewritten as an unchecked task:\n" + after,
		);
	});

	for (const [label, mode] of [
		["live preview", "source"],
		["reading view", "preview"],
	]) {
		it(`moves an item across a heading when dropped below the heading (${label})`, async function () {
			await setSettings({ enableCrossGroupDrag: true });
			await openClean("sections.md", { mode });

			const bravo = await locateOrFail("bravo");
			const charlie = await locateOrFail("charlie");
			const gapMid = (bravo.row.y + bravo.row.h + charlie.row.y) / 2;
			await drag("alpha", { x: charlie.row.x + 40, y: gapMid + 2 });

			const after = mode === "preview" ? await fileText("sections.md") : await docText();
			assert.ok(
				after.indexOf("alpha") > after.indexOf("## Two"),
				"alpha must move below the heading:\n" + after,
			);
			assert.ok(
				after.indexOf("alpha") < after.indexOf("charlie"),
				"alpha must land before charlie:\n" + after,
			);
		});

		it(`keeps an item above a heading when dropped above the heading midpoint (${label})`, async function () {
			await setSettings({ enableCrossGroupDrag: true });
			await openClean("sections.md", { mode });

			const bravo = await locateOrFail("bravo");
			const charlie = await locateOrFail("charlie");
			const gapMid = (bravo.row.y + bravo.row.h + charlie.row.y) / 2;
			await drag("alpha", { x: charlie.row.x + 40, y: gapMid - 2 });

			const after = mode === "preview" ? await fileText("sections.md") : await docText();
			assert.ok(
				after.indexOf("alpha") < after.indexOf("## Two"),
				"alpha must stay above the heading:\n" + after,
			);
			assert.ok(
				after.indexOf("alpha") > after.indexOf("bravo"),
				"alpha must land after bravo:\n" + after,
			);
		});
	}
});
