import assert from "node:assert";
import { browser } from "@wdio/globals";
import { obsidianPage } from "wdio-obsidian-service";
import { openClean, waitForHandles, PLUGIN_ID } from "../lib/obsidian.mjs";

const leftovers = () =>
	browser.execute(() => ({
		nodes: document.querySelectorAll(
			".dli-handle, .dli-ghost, .dli-drop-line, .dli-cm-overlay",
		).length,
		enabled: document.body.classList.contains("dli-enabled"),
		mobile: document.body.classList.contains("dli-mobile"),
	}));

describe("plugin lifecycle", function () {
	after(async function () {
		await obsidianPage.enablePlugin(PLUGIN_ID);
		await browser.pause(500);
	});

	it("removes every injected node and body class on unload", async function () {
		await openClean("bullets.md");
		const before = await leftovers();
		assert.ok(before.nodes > 0, "plugin should have injected nodes while loaded");
		assert.strictEqual(before.enabled, true, "body should carry dli-enabled");

		await obsidianPage.disablePlugin(PLUGIN_ID);
		await browser.pause(800);

		const after = await leftovers();
		assert.strictEqual(after.nodes, 0, "no .dli-* nodes may survive unload");
		assert.strictEqual(after.enabled, false, "dli-enabled must be removed");
		assert.strictEqual(after.mobile, false, "dli-mobile must be removed");
	});

	it("re-attaches cleanly when the plugin is enabled again", async function () {
		await obsidianPage.enablePlugin(PLUGIN_ID);
		await browser.pause(800);
		await openClean("bullets.md");
		await waitForHandles(4);

		const state = await leftovers();
		assert.strictEqual(state.enabled, true);
		assert.ok(state.nodes >= 4, "handles should be back");
	});
});
