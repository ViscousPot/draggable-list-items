import { App, PluginSettingTab, Setting } from "obsidian";
import DraggableListItemsPlugin from "./main";

export interface DraggableListSettings {
	enabled: boolean;
	enableCrossGroupDrag: boolean;
	enableCrossFileDrag: boolean;
}

export const DEFAULT_SETTINGS: DraggableListSettings = {
	enabled: true,
	enableCrossGroupDrag: false,
	enableCrossFileDrag: false,
};

export class DraggableListSettingTab extends PluginSettingTab {
	plugin: DraggableListItemsPlugin;

	constructor(app: App, plugin: DraggableListItemsPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Enable drag handles")
			.setDesc(
				"Show drag handles on list items in reading view and live preview.",
			)
			.addToggle((t) =>
				t.setValue(this.plugin.settings.enabled).onChange(async (v) => {
					this.plugin.settings.enabled = v;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName("Enable cross-group drag")
			.setDesc(
				"Drag list items between groups at the same indent level (e.g., between two separate bullet lists).",
			)
			.addToggle((t) =>
				t
					.setValue(this.plugin.settings.enableCrossGroupDrag)
					.onChange(async (v) => {
						this.plugin.settings.enableCrossGroupDrag = v;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Enable cross-file drag")
			.setDesc(
				"Drag list items between different files across editor panes. (Live preview only)",
			)
			.addToggle((t) =>
				t
					.setValue(this.plugin.settings.enableCrossFileDrag)
					.onChange(async (v) => {
						this.plugin.settings.enableCrossFileDrag = v;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Collapse list items")
			.setDesc(
				"The drag handle replaces the collapse chevron. Right-click the handle on a collapsible list item to collapse or expand it.",
			);
	}
}
