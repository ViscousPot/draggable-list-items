import { grab, drop, below, locateOrFail } from "../lib/drag.mjs";
import { openClean } from "../lib/obsidian.mjs";

const cases = [
	{ name: "lp WITH frontmatter", file: "fm-tasks.md" },
	{ name: "lp WITHOUT frontmatter", file: "no-fm-tasks.md" },
	{ name: "rv WITH frontmatter", file: "fm-tasks.md", mode: "preview" },
	{ name: "rv WITHOUT frontmatter", file: "no-fm-tasks.md", mode: "preview" },
];

describe("frontmatter ghost offset probe", function () {
	for (const c of cases) {
		it(c.name, async function () {
			await openClean(c.file, { mode: c.mode || "source" });
			const target = await locateOrFail("Task C");
			const dropPoint = below(target);
			await grab("Task A", dropPoint);
			await drop();
		});
	}
});