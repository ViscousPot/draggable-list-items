import { Group } from "../list/parse";

export interface CommitContext {
	fromIdx: number;
	toIdx: number;
	fromGroup: Group;
	toGroup: Group;
}

export type CommitFn = (ctx: CommitContext) => void | Promise<void>;

export interface GroupSlot {
	group: Group;
	groupEls: HTMLElement[][];
	itemRects: DOMRect[];
}

export interface DragSession {
	group: Group;
	sourceItemIdx: number;
	sourceEl: HTMLElement;
	groupEls: HTMLElement[][];
	allGroups: GroupSlot[];
	commit: CommitFn;
	enableCrossGroupDrag: boolean;
}
