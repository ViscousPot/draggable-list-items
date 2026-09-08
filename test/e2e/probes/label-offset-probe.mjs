import { grab, drop, below, locateOrFail } from "../lib/drag.mjs";
import { openClean } from "../lib/obsidian.mjs";

const cases = [
	{ name: "lp grand one subtree -> below grand three", file: "deep.md", from: "grand one", to: "grand three" },
	{ name: "lp mid C subtree -> below mid D", file: "deep.md", from: "mid C", to: "mid D" },
	{ name: "lp leaf iv (2-deep) -> below leaf vii", file: "deep.md", from: "leaf iv", to: "leaf vii" },
	{ name: "lp mid A (2-line) -> below mid C", file: "deep.md", from: "mid A", to: "mid C" },
	{ name: "rv grand one subtree -> below grand three", file: "deep.md", from: "grand one", to: "grand three", mode: "preview" },
	{ name: "rv leaf iv (2-deep) -> below leaf vii", file: "deep.md", from: "leaf iv", to: "leaf vii", mode: "preview" },
	{ name: "rv mid C subtree -> below mid D", file: "deep.md", from: "mid C", to: "mid D", mode: "preview" },
	{ name: "lp top-level single (baseline ref)", file: "bullets.md", from: "alpha", to: "delta" },
];

describe("ghost label offset probe", function () {
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