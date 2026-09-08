import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import * as rec from "./lib/rec.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const e2eRoot = process.env.DLI_E2E_DIR || "/tmp/dli-e2e";

const isMobile = !!process.env.DLI_MOBILE;

export const config = {
	runner: "local",
	framework: "mocha",
	specs: isMobile
		? ["./specs/mobile/*.spec.mjs"]
		: ["./specs/*.spec.mjs"],

	maxInstances: 1,

	cacheDir: process.env.OBSIDIAN_CACHE || path.join(os.homedir(), ".cache/obsidian-launcher"),

	capabilities: [
		{
			browserName: "obsidian",
			browserVersion: process.env.OBSIDIAN_APP_VERSION || "latest",
			"wdio:obsidianOptions": {
				installerVersion: process.env.OBSIDIAN_INSTALLER_VERSION || "latest",
				plugins: [repoRoot],
				vault: path.join(e2eRoot, "vault"),
				emulateMobile: isMobile,
			},
			...(isMobile
				? {
						"goog:chromeOptions": {
							mobileEmulation: { deviceMetrics: { width: 390, height: 844 } },
						},
					}
				: {}),
		},
	],

	services: [
		"obsidian",
		[
			"visual",
			{
				baselineFolder: path.join(here, ".visual", "baseline"),
				screenshotPath: path.join(here, ".visual"),
				clearRuntimeFolder: true,
				autoSaveBaseline: true,
				alwaysSaveActualImage: false,
			},
		],
	],
	reporters: ["spec"],
	logLevel: "warn",
	mochaOpts: { ui: "bdd", timeout: 180000 },

	async beforeTest(test) {
		await rec.prepare();
		if (process.env.DLI_NO_REC) return;
		rec.start(test.parent ? `${test.parent} - ${test.title}` : test.title);
		await rec.ready();
	},

	async afterTest() {
		if (process.env.DLI_NO_REC) return;
		await rec.stop();
	},
};