import { browser } from "@wdio/globals";
import { grab, drop, below, above, locateOrFail } from "../lib/drag.mjs";
import { openClean } from "../lib/obsidian.mjs";

const move = async (x, y) => {
	await browser
		.action("pointer", { parameters: { pointerType: "mouse" } })
		.move({ x, y, duration: 40 })
		.perform(true);
	await browser.pause(60);
};

describe("ghost drift probe", function () {
	for (const c of [
		{ name: "lp top-level alpha", file: "bullets.md", from: "alpha", to: "delta" },
		{ name: "lp nested child a", file: "nested.md", from: "child a", to: "parent three" },
		{ name: "rv top-level alpha", file: "bullets.md", from: "alpha", to: "delta", mode: "preview" },
		{ name: "rv nested child a", file: "nested.md", from: "child a", to: "parent three", mode: "preview" },
	]) {
		it(c.name, async function () {
			await openClean(c.file, { mode: c.mode || "source" });
			const target = await locateOrFail(c.to);
			const p1 = below(target);
			const p2 = above(target);
			const p3 = { x: target.row.x + 20, y: target.row.y + Math.round(target.row.h / 2) };
			await grab(c.from, p1);
			await move(p2.x, p2.y);
			await move(p3.x, p3.y);
			await drop();
		});
	}
});