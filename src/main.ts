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
		this.applyEnabled();

		this.registerMarkdownPostProcessor((el, ctx) => {
			attachReadingViewHandles(this.app, el, ctx);
		});

		this.registerEditorExtension(buildLivePreviewExtension());

		this.addSettingTab(new DraggableListSettingTab(this.app, this));
	}

	onunload(): void {
		document.body.classList.remove("dli-mobile", "dli-enabled");
		document.querySelectorAll(".dli-handle, .dli-ghost, .dli-drop-line, .dli-cm-overlay").forEach((el) => el.remove());
	}

	applyEnabled(): void {
		document.body.classList.toggle("dli-enabled", this.settings.enabled);
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
		this.applyEnabled();
	}
}
