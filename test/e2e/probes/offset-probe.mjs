import { grab, drop, below, locateOrFail } from "../lib/drag.mjs";
import { openClean } from "../lib/obsidian.mjs";

const cases = [
	{ name: "lp top-level alpha -> below delta", file: "bullets.md", from: "alpha", to: "delta" },
	{ name: "lp parent one (with children) -> below parent three", file: "nested.md", from: "parent one", to: "parent three" },
	{ name: "lp nested child a -> below parent three", file: "nested.md", from: "child a", to: "parent three" },
	{ name: "rv top-level alpha -> below delta", file: "bullets.md", from: "alpha", to: "delta", mode: "preview" },
	{ name: "rv nested child a -> below parent three", file: "nested.md", from: "child a", to: "parent three", mode: "preview" },
];

describe("ghost offset probe", function () {
	for (const c of cases) {
		it(c.name, async function () {
			await openClean(c.file, { mode: c.mode || "source" });
			const target = await locateOrFail(c.to);
			const dropPoint = below(target);
			await grab(c.from, dropPoint);
			await drop();
		});
	}
});