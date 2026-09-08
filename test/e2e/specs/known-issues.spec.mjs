import assert from "node:assert";
import { browser } from "@wdio/globals";
import { obsidianPage } from "wdio-obsidian-service";
import { handleCount } from "../lib/obsidian.mjs";

describe("known issues", function () {
	for (const mode of ["source", "preview"]) {
		it(`callout lists get no drag handles (${mode})`, async function () {
			await browser.executeObsidian(({ app }) =>
				app.workspace.detachLeavesOfType("markdown"),
			);
			await obsidianPage.resetVault();
			await obsidianPage.openFile("callout.md");
			if (mode === "preview") {
				await browser.executeObsidian(async ({ app, obsidian }) => {
					const leaf = app.workspace.getActiveViewOfType(obsidian.MarkdownView)?.leaf;
					await leaf?.setViewState({
						type: "markdown",
						state: { ...leaf.getViewState().state, mode: "preview", source: false },
					});
				});
			}
			await browser.pause(900);

			assert.strictEqual(
				await handleCount(),
				0,
				"KNOWN ISSUE: lists inside callouts are not draggable. " +
					"If this now returns handles, the bug is fixed - update this test.",
			);
		});
	}
});
