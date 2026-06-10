import { Group } from "../list/parse";
import { App, TFile } from "obsidian";

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
}

export interface CrossFileResult {
	file: TFile;
	allGroups: GroupSlot[];
}

export interface DragSession {
	group: Group;
	sourceItemIdx: number;
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
