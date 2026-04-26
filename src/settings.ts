import { App, PluginSettingTab, Setting } from "obsidian";
import DraggableListItemsPlugin from "./main";

export interface DraggableListSettings {
	enabled: boolean;
}

export const DEFAULT_SETTINGS: DraggableListSettings = {
	enabled: true,
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
			.setDesc("Show drag handles on list items in reading view and live preview.")
			.addToggle((t) =>
				t.setValue(this.plugin.settings.enabled).onChange(async (v) => {
					this.plugin.settings.enabled = v;
					await this.plugin.saveSettings();
				}),
			);
	}
}
