import assert from "node:assert";
import { drag, grab, drop, dragState, onto, locateOrFail } from "../lib/drag.mjs";
import { openSplit, readLeaf, setSettings } from "../lib/obsidian.mjs";

describe("cross-file drag", function () {
	afterEach(async function () {
		await setSettings({ enableCrossFileDrag: false });
	});

	it("refuses to cross panes while the setting is off", async function () {
		await setSettings({ enableCrossFileDrag: false });
		await openSplit("cross-a.md", "cross-b.md");

		const target = await locateOrFail("b-two");
		await grab("a-one", onto(target));
		assert.strictEqual(
			(await dragState()).dropLine,
			false,
			"no drop target in the other pane while cross-file drag is disabled",
		);
		await drop();

		assert.ok((await readLeaf("cross-a.md")).includes("a-one"), "a-one must stay put");
	});

	it("moves an item into the other pane when enabled", async function () {
		await setSettings({ enableCrossFileDrag: true, enableCrossGroupDrag: true });
		await openSplit("cross-a.md", "cross-b.md");

		const target = await locateOrFail("b-two");
		await drag("a-one", onto(target));

		const a = await readLeaf("cross-a.md");
		const b = await readLeaf("cross-b.md");
		assert.ok(!a.includes("a-one"), "a-one must leave the source file:\n" + a);
		assert.ok(b.includes("a-one"), "a-one must land in the target file:\n" + b);
	});
});
