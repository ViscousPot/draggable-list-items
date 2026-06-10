import { App, MarkdownPostProcessorContext, TFile } from "obsidian";
import { findGroup, findAllGroups, parseLine } from "../list/parse";
import { moveItem, moveItemCrossGroup } from "../list/reorder";
import { beginDrag } from "../drag/controller";
import { DragSession, GroupSlot } from "../drag/types";
import { DraggableListSettings } from "../settings";

const HANDLE_CLASS = "dli-handle";
const SHOW_CLASS = "dli-show";
const LINE_ATTR = "dliLine";

export function attachReadingViewHandles(
	app: App,
	getSettings: () => DraggableListSettings,
	el: HTMLElement,
	ctx: MarkdownPostProcessorContext,
): void {
	const section = ctx.getSectionInfo(el);
	if (!section) return;

	const lines = section.text
		.split("\n")
		.slice(section.lineStart, section.lineEnd + 1);
	const startLines: number[] = [];
	for (let i = 0; i < lines.length; i++) {
		if (parseLine(lines[i]!)) {
			startLines.push(i + section.lineStart);
		}
	}

	const lis = Array.from(el.querySelectorAll("li"));
	if (lis.length !== startLines.length) return;

	for (let i = 0; i < lis.length; i++) {
		const li = lis[i]!;
		const lineNum = startLines[i]!;
		li.dataset[LINE_ATTR] = String(lineNum);
		addHandle(li, app, getSettings, ctx.sourcePath);
	}
}

function addHandle(
	li: HTMLLIElement,
	app: App,
	getSettings: () => DraggableListSettings,
	sourcePath: string,
): void {
	if (li.querySelector(`:scope > .${HANDLE_CLASS}`)) return;
	const handle = activeDocument.createElement("span");
	handle.className = HANDLE_CLASS;
	handle.textContent = "⋮⋮";
	handle.draggable = false;

	li.addEventListener("mouseenter", () => handle.classList.add(SHOW_CLASS));
	li.addEventListener("mouseleave", () =>
		handle.classList.remove(SHOW_CLASS),
	);

	handle.addEventListener("pointerdown", (ev) => {
		if (ev.button !== 0) return;
		ev.preventDefault();
		ev.stopPropagation();
		onHandlePointerDown(ev, li, app, getSettings, sourcePath).catch(
			(err) => console.error(err),
		);
	});
	handle.addEventListener("mousedown", (ev) => ev.preventDefault());
	handle.addEventListener("dragstart", (ev) => ev.preventDefault());
	handle.addEventListener("contextmenu", (ev) => {
		ev.preventDefault();
		ev.stopPropagation();
		const chevron = li.querySelector(
			":scope > .list-collapse-indicator, :scope > .collapse-icon",
		);
		if (chevron) (chevron as HTMLElement).click();
	});

	li.prepend(handle);
}

async function onHandlePointerDown(
	ev: PointerEvent,
	li: HTMLLIElement,
	app: App,
	getSettings: () => DraggableListSettings,
	sourcePath: string,
): Promise<void> {
	const enableCrossGroupDrag = getSettings().enableCrossGroupDrag;
	const lineStr = li.dataset[LINE_ATTR];
	if (!lineStr) return;
	const sourceLine = parseInt(lineStr, 10);
	if (Number.isNaN(sourceLine)) return;

	const file = app.vault.getFileByPath(sourcePath);
	if (!file) return;

	const text = await app.vault.cachedRead(file);
	const lines = text.split("\n");
	const allGroups = findAllGroups(lines);
	const sourceGroupIdx = allGroups.findIndex((g) =>
		g.items.some((it) => it.startLine === sourceLine),
	);
	if (sourceGroupIdx < 0) return;
	const group = allGroups[sourceGroupIdx]!;
	if (!enableCrossGroupDrag && group.items.length < 2) return;

	const sourceItemIdx = group.items.findIndex(
		(it) => it.startLine === sourceLine,
	);
	if (sourceItemIdx < 0) return;

	const lineMap = new Map<number, HTMLElement>();
	for (const liEl of activeDocument.querySelectorAll<HTMLElement>("li")) {
		const ln = liEl.dataset[LINE_ATTR];
		if (ln !== undefined) {
			lineMap.set(parseInt(ln, 10), liEl);
		}
	}

	const allGroupSlots: GroupSlot[] = [];
	for (const g of allGroups) {
		const groupEls: HTMLElement[][] = [];
		const itemRects: DOMRect[] = [];
		for (const item of g.items) {
			const liEl = lineMap.get(item.startLine);
			if (!liEl) {
				groupEls.length = 0;
				break;
			}
			groupEls.push([liEl]);
			itemRects.push(liEl.getBoundingClientRect());
		}
		if (groupEls.length === 0) continue;
		allGroupSlots.push({ group: g, groupEls, itemRects });
	}

	const sourceSlot = allGroupSlots[sourceGroupIdx];
	if (!sourceSlot || sourceSlot.groupEls.length === 0) return;

	const session: DragSession = {
		group,
		sourceItemIdx,
		sourceEl: li,
		groupEls: sourceSlot.groupEls,
		allGroups: allGroupSlots,
		enableCrossGroupDrag,
		enableCrossFileDrag: false,
		app,
		sourceFile: file,
		queryCrossFile: () => null,
		commit: ({ fromIdx, toIdx, fromGroup, toGroup }) =>
			commitMove(app, file, fromGroup, fromIdx, toGroup, toIdx),
	};

	beginDrag(session, ev);
}

async function commitMove(
	app: App,
	file: TFile,
	staleFromGroup: { items: { startLine: number }[] },
	fromIdx: number,
	staleToGroup: { items: { startLine: number }[] },
	toIdx: number,
): Promise<void> {
	const fromAnchor = staleFromGroup.items[fromIdx]?.startLine;
	const toAnchor = staleToGroup.items[0]?.startLine;
	if (fromAnchor === undefined || toAnchor === undefined) return;

	const sameGroup = staleFromGroup === staleToGroup;

	await app.vault.process(file, (text) => {
		if (sameGroup) {
			const lines = text.split("\n");
			const fresh = findGroup(lines, fromAnchor);
			if (!fresh) return text;
			const freshFrom = fresh.items.findIndex(
				(it) => it.startLine === fromAnchor,
			);
			if (freshFrom < 0) return text;
			const result = moveItem(text, fresh, freshFrom, toIdx);
			if (!result) return text;
			return result.text;
		}

		const lines = text.split("\n");
		const allGroups = findAllGroups(lines);
		const freshFrom = allGroups.find((g) =>
			g.items.some((it) => it.startLine === fromAnchor),
		);
		const freshTo = allGroups.find((g) =>
			g.items.some((it) => it.startLine === toAnchor),
		);
		if (!freshFrom || !freshTo) return text;
		const freshFromIdx = freshFrom.items.findIndex(
			(it) => it.startLine === fromAnchor,
		);
		if (freshFromIdx < 0) return text;
		const result = moveItemCrossGroup(
			text,
			freshFrom,
			freshFromIdx,
			freshTo,
			toIdx,
		);
		return result ?? text;
	});
}
