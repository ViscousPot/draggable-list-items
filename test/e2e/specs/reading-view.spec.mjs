import assert from "node:assert";
import { drag, below, locateOrFail } from "../lib/drag.mjs";
import { openClean, docText, fileText, handleCount } from "../lib/obsidian.mjs";
import { browser } from "@wdio/globals";

describe("reading view", function () {
	it("renders a handle on every list item", async function () {
		await openClean("bullets.md", { mode: "preview" });
		assert.strictEqual(await handleCount(), 4);
	});

	it("reorders the underlying file when an item is dragged", async function () {
		await openClean("bullets.md", { mode: "preview" });
		const delta = await locateOrFail("delta");
		await drag("bravo", below(delta));

		await browser.waitUntil(
			async () => (await fileText("bullets.md")).includes("- delta\n- bravo"),
			{ timeout: 10000, interval: 200, timeoutMsg: "file was not rewritten" },
		);
		assert.strictEqual(
			await fileText("bullets.md"),
			"# Bullets\n\n- alpha\n- charlie\n- delta\n- bravo\n",
		);
	});

	it("hides the native collapse chevron in favour of the handle", async function () {
		await openClean("nested.md", { mode: "preview" });
		const hidden = await browser.execute(() => {
			const c = document.querySelector(
				".markdown-rendered .list-collapse-indicator, .markdown-rendered .collapse-icon",
			);
			if (!c) return { none: true };
			const cs = getComputedStyle(c);
			return { opacity: cs.opacity, pointerEvents: cs.pointerEvents };
		});
		if (!hidden.none) {
			assert.strictEqual(hidden.opacity, "0", "chevron should be transparent");
			assert.strictEqual(hidden.pointerEvents, "none", "chevron should not take clicks");
		}
	});
});
