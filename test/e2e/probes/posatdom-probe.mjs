import { openClean } from "../lib/obsidian.mjs";

describe("posAtDOM skew probe", function () {
	for (const c of [
		{ name: "lp WITH frontmatter", file: "fm-tasks.md" },
		{ name: "lp WITHOUT frontmatter", file: "no-fm-tasks.md" },
	]) {
		it(c.name, async function () {
			await openClean(c.file);
		});
	}
});