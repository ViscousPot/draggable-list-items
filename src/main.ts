import { Plugin, Platform } from "obsidian";
import { DEFAULT_SETTINGS, DraggableListSettings, DraggableListSettingTab } from "./settings";
import { attachReadingViewHandles } from "./views/reading-view";
import { buildLivePreviewExtension } from "./views/live-preview";

export default class DraggableListItemsPlugin extends Plugin {
	settings: DraggableListSettings;

	async onload() {
		await this.loadSettings();

		if (Platform.isMobile) {
			document.body.classList.add("dli-mobile");
		}

		this.registerMarkdownPostProcessor((el, ctx) => {
			if (!this.settings.enabled) return;
			attachReadingViewHandles(this.app, el, ctx);
		});

		this.registerEditorExtension(buildLivePreviewExtension());

		this.addSettingTab(new DraggableListSettingTab(this.app, this));
	}

	onunload(): void {
		document.body.classList.remove("dli-mobile");
		document.querySelectorAll(".dli-handle, .dli-ghost, .dli-drop-line, .dli-cm-overlay").forEach((el) => el.remove());
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as Partial<DraggableListSettings>,
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
