import assert from "node:assert";
import { browser } from "@wdio/globals";
import { drag, grab, drop, above, below, dragState, locateOrFail } from "../lib/drag.mjs";
import { openClean, docText, fileText } from "../lib/obsidian.mjs";

const indicatorTop = async (row) =>
	browser.execute((expectedTop) => {
		const ind = document.querySelector(".dli-drop-line.dli-visible");
		if (!ind) return null;
		return Math.round(ind.getBoundingClientRect().top);
	}, row);

describe("list boundary drops", function () {
	for (const mode of ["source", "preview"]) {
		it(`${mode}: drop to the very top of a flat list`, async function () {
			await openClean("bullets.md", { mode });
			const alpha = await locateOrFail("alpha");
			await grab("charlie", above(alpha));
			assert.strictEqual((await dragState()).dropLine, true, "indicator must show at the top");
			const indTop = await indicatorTop();
			assert.ok(Math.abs(indTop - alpha.row.y) <= 2, `indicator should sit at the first row top (${alpha.row.y}), got ${indTop}`);
			await drop();
			const text = mode === "preview" ? await fileText("bullets.md") : await docText();
			assert.strictEqual(text, "# Bullets\n\n- charlie\n- alpha\n- bravo\n- delta\n");
		});

		it(`${mode}: drop to the very bottom of a flat list`, async function () {
			await openClean("bullets.md", { mode });
			const delta = await locateOrFail("delta");
			await grab("alpha", below(delta));
			assert.strictEqual((await dragState()).dropLine, true, "indicator must show at the bottom");
			await drop();
			const text = mode === "preview" ? await fileText("bullets.md") : await docText();
			assert.strictEqual(text, "# Bullets\n\n- bravo\n- charlie\n- delta\n- alpha\n");
		});

		it(`${mode}: drop a subtree to the very top of the top list`, async function () {
			await openClean("nested.md", { mode });
			const parentOne = await locateOrFail("parent one");
			await drag("parent three", above(parentOne));
			const text = mode === "preview" ? await fileText("nested.md") : await docText();
			assert.strictEqual(
				text,
				"# Nested\n\n- parent three\n- parent one\n\t- child a\n\t- child b\n- parent two\n",
			);
		});

		it(`${mode}: drop a subtree to the very bottom of the top list`, async function () {
			await openClean("nested.md", { mode });
			const parentThree = await locateOrFail("parent three");
			await drag("parent one", below(parentThree));
			const text = mode === "preview" ? await fileText("nested.md") : await docText();
			assert.strictEqual(
				text,
				"# Nested\n\n- parent two\n- parent three\n- parent one\n\t- child a\n\t- child b\n",
			);
		});

		it(`${mode}: drop to the very top of a sublist`, async function () {
			await openClean("deep.md", { mode });
			const leafIV = await locateOrFail("leaf iv");
			await grab("leaf vi", above(leafIV));
			assert.strictEqual((await dragState()).dropLine, true, "indicator must show at the sublist top");
			const indTop = await indicatorTop();
			assert.ok(Math.abs(indTop - leafIV.row.y) <= 2, `indicator should sit at the first child top (${leafIV.row.y}), got ${indTop}`);
			await drop();
			const text = mode === "preview" ? await fileText("deep.md") : await docText();
			assert.ok(text.includes("- leaf vi\n\t\t- leaf iv"), "leaf vi must be first child:\n" + text);
		});

		it(`${mode}: drop to the very bottom of a sublist`, async function () {
			await openClean("deep.md", { mode });
			const leafVI = await locateOrFail("leaf vi");
			await grab("leaf iv", below(leafVI));
			assert.strictEqual((await dragState()).dropLine, true, "indicator must show at the sublist bottom");
			await drop();
			const text = mode === "preview" ? await fileText("deep.md") : await docText();
			assert.ok(text.includes("- leaf vi\n\t\t- leaf iv"), "leaf iv must be the last child:\n" + text);
		});
	}
});