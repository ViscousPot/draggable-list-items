import { Group } from "../list/parse";

export interface CommitContext {
	fromIdx: number;
	toIdx: number;
	group: Group;
}

export type CommitFn = (ctx: CommitContext) => void | Promise<void>;

export interface DragSession {
	group: Group;
	sourceItemIdx: number;
	sourceEl: HTMLElement;
	groupEls: HTMLElement[];
	commit: CommitFn;
}
