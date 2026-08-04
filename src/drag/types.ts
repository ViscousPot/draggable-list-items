import type { Group } from "../list/parse";
import type { App, TFile } from "obsidian";

export interface CommitContext {
	fromIdx: number;
	toIdx: number;
	fromGroup: Group;
	toGroup: Group;
	crossFile?: TFile;
}

export type CommitFn = (ctx: CommitContext) => void | Promise<void>;

export interface GroupSlot {
	group: Group;
	groupEls: HTMLElement[][];
	itemRects: DOMRect[];
	/**
	 * Real index into group.items for each entry of groupEls/itemRects.
	 * Viewport rendering can omit items, so array positions here are NOT
	 * item indices; commits must use these instead.
	 */
	itemIdxs: number[];
	/**
	 * Bottom of each item's last visible line (below its subtree), frozen at
	 * session build in the same coordinate space as itemRects — elements may
	 * detach or hide mid-drag, so never re-measure them.
	 */
	itemExtents: number[];
}

export interface CrossFileResult {
	file: TFile;
	allGroups: GroupSlot[];
}

export interface DragSession {
	group: Group;
	/** real index into group.items */
	sourceItemIdx: number;
	/** index into groupEls/itemRects (visible arrays) for the source item */
	sourceVisIdx: number;
	sourceEl: HTMLElement;
	groupEls: HTMLElement[][];
	allGroups: GroupSlot[];
	commit: CommitFn;
	enableCrossGroupDrag: boolean;
	enableCrossFileDrag: boolean;
	app: App;
	sourceFile: TFile;
	queryCrossFile: (x: number, y: number) => CrossFileResult | null;
}
