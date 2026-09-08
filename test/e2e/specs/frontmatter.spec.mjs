import assert from "node:assert";
import { browser } from "@wdio/globals";
import { drag, grab, drop, below, locateOrFail } from "../lib/drag.mjs";
import { openClean, docText, fileText, handleCount } from "../lib/obsidian.mjs";

const ghostTop = () =>
	browser.execute(() => {
		const g = document.querySelector(".dli-ghost");
		return g ? Math.round(g.getBoundingClientRect().top) : null;
	});

describe("notes with frontmatter", function () {
	it("renders a handle for every list item despite the frontmatter", async function () {
		await openClean("frontmatter.md");
		assert.strictEqual(await handleCount(), 3);
	});

	it("reorders correctly in live preview", async function () {
		await openClean("frontmatter.md");
		const charlie = await locateOrFail("fm charlie");
		await drag("fm alpha", below(charlie));

		assert.strictEqual(
			await docText(),
			"---\ntitle: Has frontmatter\ntags: [test]\n---\n\n# Frontmatter\n\n- fm bravo\n- fm charlie\n- fm alpha\n",
			"frontmatter must be preserved and the list reordered",
		);
	});

	it("reorders correctly in reading view", async function () {
		await openClean("frontmatter.md", { mode: "preview" });
		const charlie = await locateOrFail("fm charlie");
		await drag("fm alpha", below(charlie));

		await browser.waitUntil(
			async () => (await fileText("frontmatter.md")).includes("- fm charlie\n- fm alpha"),
			{ timeout: 10000, interval: 200, timeoutMsg: "file was not rewritten" },
		);
		assert.strictEqual(
			await fileText("frontmatter.md"),
			"---\ntitle: Has frontmatter\ntags: [test]\n---\n\n# Frontmatter\n\n- fm bravo\n- fm charlie\n- fm alpha\n",
		);
	});

	for (const [label, mode] of [
		["live preview", "source"],
		["reading view", "preview"],
	]) {
		it(`keeps the drag ghost aligned with the grabbed item in ${label} despite frontmatter`, async function () {
			await openClean("fm-tasks.md", { mode });
			const src = await locateOrFail("Task A");
			const target = await locateOrFail("Task C");
			const dropPoint = below(target);
			const expectedTop = src.row.y + (dropPoint.y - src.hy);
			await grab("Task A", dropPoint);
			const top = await ghostTop();
			assert.ok(top !== null, "ghost must be present while dragging");
			assert.ok(
				Math.abs(top - expectedTop) <= 2,
				`ghost top must track the grabbed row (${expectedTop}), got ${top}`,
			);
			await drop();
		});
	}
});
