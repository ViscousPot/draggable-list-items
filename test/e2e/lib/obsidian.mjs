import { browser } from "@wdio/globals";
import { obsidianPage } from "wdio-obsidian-service";
import { readFileSync } from "node:fs";
import path from "node:path";

export const PLUGIN_ID = "draggable-list-items";
const ROOT = process.env.DLI_E2E_DIR || "/tmp/dli-e2e";

export const baseline = (file) =>
	readFileSync(path.join(ROOT, "vault", file), "utf8");

export const docText = () =>
	browser.executeObsidian(({ app, obsidian }) => {
		const v = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
		return v ? v.editor.getValue() : null;
	});

export const fileText = (file) => obsidianPage.read(file);

export async function setSettings(partial) {
	await browser.executeObsidian(async ({ app }, id, partial) => {
		const plugin = app.plugins.plugins[id];
		Object.assign(plugin.settings, partial);
		await plugin.saveSettings();
	}, PLUGIN_ID, partial);
	await browser.pause(150);
}

export const getSettings = () =>
	browser.executeObsidian(
		({ app }, id) => ({ ...app.plugins.plugins[id].settings }),
		PLUGIN_ID,
	);

export async function setMode(mode) {
	await browser.executeObsidian(async ({ app, obsidian }, mode) => {
		const leaf = app.workspace.getActiveViewOfType(obsidian.MarkdownView)?.leaf;
		if (!leaf) return;
		await leaf.setViewState({
			type: "markdown",
			state: { ...leaf.getViewState().state, mode, source: false },
		});
	}, mode);
	await browser.pause(400);
}

export async function openClean(file, { mode = "source" } = {}) {
	await browser.executeObsidian(({ app }) => app.workspace.detachLeavesOfType("markdown"));
	await obsidianPage.resetVault();
	await obsidianPage.openFile(file);
	if (mode !== "source") await setMode(mode);

	const want = baseline(file);
	await browser.waitUntil(async () => (await docText()) === want, {
		timeout: 15000,
		interval: 150,
		timeoutMsg: `editor did not settle to the pristine ${file}`,
	});
	await waitForHandles();
}

export async function waitForHandles(min = 1) {
	await browser.waitUntil(
		async () =>
			(await browser.execute(
				() =>
					Array.from(document.querySelectorAll(".dli-handle")).filter((h) => {
						const r = h.getBoundingClientRect();
						return r.width > 0 || r.height > 0;
					}).length,
			)) >= min,
		{ timeout: 15000, interval: 150, timeoutMsg: `expected >= ${min} drag handles` },
	);
}

export const handleCount = () =>
	browser.execute(
		() =>
			Array.from(document.querySelectorAll(".dli-handle")).filter((h) => {
				const r = h.getBoundingClientRect();
				return r.width > 0 || r.height > 0;
			}).length,
	);

export async function openSplit(fileA, fileB) {
	await browser.executeObsidian(({ app }) => app.workspace.detachLeavesOfType("markdown"));
	await obsidianPage.resetVault();
	await browser.executeObsidian(async ({ app }, a, b) => {
		const left = app.workspace.getLeaf(true);
		await left.openFile(app.vault.getAbstractFileByPath(a));
		const right = app.workspace.createLeafBySplit(left, "vertical");
		await right.openFile(app.vault.getAbstractFileByPath(b));
	}, fileA, fileB);
	await browser.pause(700);
	await waitForHandles(2);
}

export const readLeaf = (file) =>
	browser.executeObsidian(({ app, obsidian }, file) => {
		for (const leaf of app.workspace.getLeavesOfType("markdown")) {
			const v = leaf.view;
			if (v instanceof obsidian.MarkdownView && v.file && v.file.path === file)
				return v.editor.getValue();
		}
		return null;
	}, file);
