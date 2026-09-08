import assert from "node:assert";
import { browser } from "@wdio/globals";
import { drag, below, locateOrFail } from "../../lib/drag.mjs";
import { openClean, docText, handleCount } from "../../lib/obsidian.mjs";

describe("mobile emulation", function () {
	it("tags the body with dli-mobile and keeps handles visible", async function () {
		await openClean("bullets.md");
		const info = await browser.execute(() => {
			const h = document.querySelector(".dli-handle");
			const cs = h ? getComputedStyle(h) : null;
			return {
				mobile: document.body.classList.contains("dli-mobile"),
				opacity: cs ? cs.opacity : null,
				visibility: cs ? cs.visibility : null,
			};
		});
		assert.strictEqual(info.mobile, true, "body must carry dli-mobile");
		assert.ok(info.opacity !== "0", `handles must be visible without hover, opacity=${info.opacity}`);
		assert.strictEqual(info.visibility, "visible");
	});

	it("reorders an item by dragging its handle on mobile", async function () {
		await openClean("bullets.md");
		const delta = await locateOrFail("delta");
		await drag("bravo", below(delta));

		assert.strictEqual(
			await docText(),
			"# Bullets\n\n- alpha\n- charlie\n- delta\n- bravo\n",
			"bravo should sit after delta on mobile",
		);
	});

	it("renders reading-view handles on mobile", async function () {
		await openClean("bullets.md", { mode: "preview" });
		assert.strictEqual(
			await handleCount(),
			4,
			"reading view should render a handle per item on mobile",
		);
	});
});