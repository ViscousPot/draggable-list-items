import { browser, expect } from "@wdio/globals";
import { grab, drop, below, locateOrFail } from "../lib/drag.mjs";
import { openClean } from "../lib/obsidian.mjs";

const noVisual = !!process.env.DLI_NO_VISUAL;
const suite = noVisual ? describe.skip : describe;

suite("visual regression", function () {
	it("handle idle state matches the baseline", async function () {
		await openClean("bullets.md");
		await browser.execute(() => {
			document.querySelectorAll(".dli-handle").forEach((h) => h.classList.add("dli-show"));
		});
		await browser.pause(150);
		await expect(browser.$(".dli-handle")).toMatchElementSnapshot("handle-idle", 1);
	});

	it("ghost follows the cursor during a drag", async function () {
		await openClean("bullets.md");
		const delta = await locateOrFail("delta");
		await grab("alpha", below(delta));
		await expect(browser.$(".dli-ghost")).toMatchElementSnapshot("ghost-drag", 1);
		await drop();
	});

	it("drop line spans the target below the list", async function () {
		await openClean("bullets.md");
		const delta = await locateOrFail("delta");
		await grab("alpha", below(delta));
		await expect(browser.$(".dli-drop-line.dli-visible")).toMatchElementSnapshot(
			"drop-line",
			1,
		);
		await drop();
	});
});