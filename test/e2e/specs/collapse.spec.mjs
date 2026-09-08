import assert from "node:assert";
import { browser } from "@wdio/globals";
import { drag, above, below, locateOrFail } from "../lib/drag.mjs";
import { openClean } from "../lib/obsidian.mjs";

const rightClick = async (l) => {
	await browser
		.action("pointer", { parameters: { pointerType: "mouse" } })
		.move({ x: l.hx, y: l.hy })
		.down({ button: 2 })
		.up({ button: 2 })
		.perform();
	await browser.pause(500);
};

const visibleText = () =>
	browser.execute(() =>
		Array.from(document.querySelectorAll(".cm-line, .markdown-rendered li"))
			.filter((el) => {
				const r = el.getBoundingClientRect();
				return r.width > 0 && r.height > 0;
			})
			.map((el) => el.textContent)
			.join("\n"),
	);

const childAVisible = () =>
	browser.execute(() => {
		const child = Array.from(document.querySelectorAll(".cm-line")).find((el) =>
			(el.textContent || "").includes("child a"),
		);
		const r = child ? child.getBoundingClientRect() : null;
		return !!r && r.height > 0;
	});

const ensureCollapsed = async (parent) => {
	if (await childAVisible()) await rightClick(parent);
	await browser.pause(200);
};

describe("collapse via the handle", function () {
	it("folds and unfolds a parent in live preview", async function () {
		await openClean("nested.md");
		assert.ok((await visibleText()).includes("child a"), "children start visible");

		const parent = await locateOrFail("parent one");
		await rightClick(parent);
		assert.ok(
			!(await visibleText()).includes("child a"),
			"right-clicking the handle should fold the children away",
		);

		const parentAgain = await locateOrFail("parent one");
		await rightClick(parentAgain);
		assert.ok(
			(await visibleText()).includes("child a"),
			"right-clicking again should unfold",
		);
	});

	it("collapses a parent in reading view", async function () {
		await openClean("nested.md", { mode: "preview" });
		const parent = await locateOrFail("parent one");
		await rightClick(parent);

		const collapsed = await browser.execute(() =>
			Array.from(document.querySelectorAll(".markdown-rendered li")).some((li) =>
				li.classList.contains("is-collapsed"),
			),
		);
		assert.ok(collapsed, "the list item should carry is-collapsed");
	});

	it("preserves fold state across a drag", async function () {
		await openClean("nested.md");
		const parent = await locateOrFail("parent one");
		await ensureCollapsed(parent);
		assert.ok(!(await childAVisible()), "children hidden before drag");

		const three = await locateOrFail("parent three");
		await drag("parent three", above(parent));

		assert.ok(!(await childAVisible()), "the fold must survive the drag");
	});

	it("keeps a collapsed subtree collapsed when the parent is dragged", async function () {
		await openClean("nested.md");
		const parent = await locateOrFail("parent one");
		await ensureCollapsed(parent);
		assert.ok(!(await childAVisible()), "children hidden before drag");

		const three = await locateOrFail("parent three");
		await drag("parent one", below(three));

		assert.ok(!(await childAVisible()), "the fold must travel with the collapsed subtree");
	});
});
