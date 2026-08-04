# Draggable List Items

Reorder list items by dragging.

[![Obsidian Downloads](https://img.shields.io/badge/dynamic/json?logo=obsidian&color=%23483699&label=Downloads&query=%24%5B%22draggable-list-items%22%5D.downloads&url=https%3A%2F%2Fraw.githubusercontent.com%2Fobsidianmd%2Fobsidian-releases%2Fmaster%2Fcommunity-plugin-stats.json)](https://community.obsidian.md/plugins/draggable-list-items)
[![Obsidian Compatibility](https://img.shields.io/badge/Obsidian-v1.5.7+-483699?logo=obsidian&style=flat-square)](https://community.obsidian.md/plugins/draggable-list-items)

<img width="960" height="540" alt="variant_d_polished_14s" src="https://github.com/user-attachments/assets/388f0e5b-5d8e-413c-bd5c-feec6775a8ba" />

Works in reading view and live preview, on desktop and mobile. Tasks (`- [ ]`), bullets (`-` `*` `+`), and ordered lists (`1.`, `1)`) each form their own drag groups, so you can't drag a task into a bullet list. Nested children move with their parent. Ordered lists renumber on drop.

## Usage

Every list item shows a drag handle next to its checkbox or bullet; items with nested children show it in your accent color. Press the handle and drag to move an item. A ghost preview follows the cursor and a drop indicator line shows where the item will land. Collapsed items stay collapsed — dragging never changes any item's collapsed state.

`Esc` cancels an in-progress drag.

### Collapse / expand

Click the handle on a collapsible list item (accent-colored) to toggle its collapsed state. A click only counts while the pointer stays within the drag threshold, so dragging never toggles. The handle replaces the default collapse chevron.

### Cross-group drag

Enable **Cross-group drag** in settings to drag items between separate lists at the same indent level — including across headings and paragraphs. In the space holding a heading, release in the upper half to place the item above the heading, or in the lower half to place it below.

### Cross-file drag

Enable **Cross-file drag** in settings to drag items between different files across editor panes. Live preview only.

## Settings

Open **Settings → Community plugins → Draggable List Items**:

- **Enable drag handles** -- Show or hide all drag handles.
- **Enable cross-group drag** -- Drag items between lists at the same indent, across headings and paragraphs.
- **Enable cross-file drag** -- Drag items across files in different editor panes (live preview only).
- **Collapse list items** -- Info: click the accent-colored handle to collapse or expand.

## Install

Install from **Settings → Community plugins → Browse** and search for "Draggable List Items", or visit [community.obsidian.md/plugins/draggable-list-items](https://community.obsidian.md/plugins/draggable-list-items).

## Limitations

Source mode is not supported.
