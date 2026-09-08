import assert from "node:assert";
import { drag, grab, drop, cancel, dragState, below, above, locateOrFail } from "../lib/drag.mjs";
import { openClean, docText, baseline, handleCount } from "../lib/obsidian.mjs";

describe("live preview", function () {
	it("reorders a bullet by dragging its handle", async function () {
		await openClean("bullets.md");
		const delta = await locateOrFail("delta");
		await drag("bravo", below(delta));

		const after = await docText();
		assert.strictEqual(
			after,
			"# Bullets\n\n- alpha\n- charlie\n- delta\n- bravo\n",
			"bravo should sit after delta",
		);
	});

	it("drags upward as well as downward", async function () {
		await openClean("bullets.md");
		const alpha = await locateOrFail("alpha");
		await drag("delta", above(alpha));

		assert.strictEqual(
			await docText(),
			"# Bullets\n\n- delta\n- alpha\n- bravo\n- charlie\n",
		);
	});

	it("shows the ghost, the drop line and the dragging state mid-drag", async function () {
		await openClean("bullets.md");
		const delta = await locateOrFail("delta");
		await grab("alpha", below(delta));

		await browser.waitUntil(
			async () => {
				const s = await dragState();
				return s.ghost && s.dropLine && s.dragging;
			},
			{
				timeout: 5000,
				interval: 100,
				timeoutMsg: "mid-drag ghost/drop-line/dragging state not reached",
			},
		);
		await drop();
	});

	it("suppresses the drop line over a no-op target", async function () {
		await openClean("bullets.md");
		const bravo = await locateOrFail("bravo");
		await grab("bravo", above(bravo));

		await browser.waitUntil(
			async () => (await dragState()).ghost,
			{ timeout: 5000, interval: 100, timeoutMsg: "ghost did not appear" },
		);
		const state = await dragState();
		assert.strictEqual(state.dropLine, false, "drop line must be hidden on a no-op");
		await drop();

		assert.strictEqual(await docText(), baseline("bullets.md"), "no-op must not edit");
	});

	it("cancels on Escape and leaves the document untouched", async function () {
		await openClean("bullets.md");
		const delta = await locateOrFail("delta");
		await grab("alpha", below(delta));
		assert.strictEqual((await dragState()).ghost, true);

		await cancel();

		const state = await dragState();
		assert.strictEqual(state.ghost, false, "Escape must remove the ghost");
		assert.strictEqual(state.dropLine, false, "Escape must remove the drop line");
		assert.strictEqual(await docText(), baseline("bullets.md"));
	});

	it("renders one handle per list line", async function () {
		await openClean("bullets.md");
		assert.strictEqual(await handleCount(), 4);
	});

	it("aligns the handle to the first row of a wrapped item", async function () {
		await openClean("wrapped.md");
		const info = await browser.execute(() => {
			const lines = Array.from(
				document.querySelectorAll(".cm-line.HyperMD-list-line"),
			);
			const long = lines.find((l) =>
				(l.textContent || "").includes("very long list item"),
			);
			if (!long) return null;
			const longRect = long.getBoundingClientRect();
			const range = document.createRange();
			range.selectNodeContents(long);
			const firstRow = range.getClientRects()[0];
			const handle = Array.from(document.querySelectorAll(".dli-handle")).find(
				(h) => {
					const hr = h.getBoundingClientRect();
					const cy = hr.top + hr.height / 2;
					return cy >= longRect.top - 2 && cy <= longRect.bottom + 2;
				},
			);
			if (!handle || !firstRow) return null;
			const hr = handle.getBoundingClientRect();
			return {
				blockTop: Math.round(longRect.top),
				blockHeight: Math.round(longRect.height),
				firstRowTop: Math.round(firstRow.top),
				handleTop: Math.round(hr.top),
				handleHeight: Math.round(hr.height),
			};
		});
		assert.ok(info, "wrapped item and its handle must be found");
		assert.ok(
			info.blockHeight > info.handleHeight,
			`wrapped block should be taller than the handle (block ${info.blockHeight} vs handle ${info.handleHeight})`,
		);
		assert.ok(
			Math.abs(info.handleTop - info.firstRowTop) <= 2,
			`handle top should align with the first text row (${info.firstRowTop}), got ${info.handleTop}`,
		);
	});
});
