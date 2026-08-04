import { App, MarkdownPostProcessorContext, TFile } from "obsidian";
import { findGroup, findAllGroups, parseLine } from "../list/parse";
import { moveItem, moveItemCrossGroup } from "../list/reorder";
import {
	beginDrag,
	tryArmGesture,
	releaseGestureArm,
} from "../drag/controller";
import { DragSession, GroupSlot } from "../drag/types";
import { DraggableListSettings } from "../settings";

const HANDLE_CLASS = "dli-handle";
const HAS_CHILDREN_CLASS = "dli-has-children";
const LINE_ATTR = "dliLine";
const DRAG_THRESHOLD_PX = 5;

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

	if (
		li.querySelector(
			":scope > ul, :scope > ol, :scope > .list-collapse-indicator, :scope > .collapse-icon",
		)
	) {
		handle.classList.add(HAS_CHILDREN_CLASS);
	}

	handle.addEventListener("pointerdown", (ev) => {
		if (ev.button !== 0) return;
		ev.preventDefault();
		ev.stopPropagation();
		armGesture(ev, li, app, getSettings, sourcePath);
	});
	handle.addEventListener("mousedown", (ev) => ev.preventDefault());
	handle.addEventListener("dragstart", (ev) => ev.preventDefault());
	handle.addEventListener("contextmenu", (ev) => {
		ev.preventDefault();
		ev.stopPropagation();
	});

	li.prepend(handle);
}

function armGesture(
	downEv: PointerEvent,
	li: HTMLLIElement,
	app: App,
	getSettings: () => DraggableListSettings,
	sourcePath: string,
): void {
	if (!tryArmGesture()) return;
	const startX = downEv.clientX;
	const startY = downEv.clientY;
	const pointerId = downEv.pointerId;

	const disarm = () => {
		activeDocument.removeEventListener("pointermove", onMove);
		activeDocument.removeEventListener("pointerup", onUp);
		activeDocument.removeEventListener("pointercancel", onCancel);
		releaseGestureArm();
	};
	const onMove = (e: PointerEvent) => {
		if (e.pointerId !== pointerId) return;
		if ((e.buttons & 1) === 0) {
			disarm();
			return;
		}
		const dx = e.clientX - startX;
		const dy = e.clientY - startY;
		if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
		activeDocument.removeEventListener("pointermove", onMove);
		activeDocument.removeEventListener("pointerup", onUp);
		activeDocument.removeEventListener("pointercancel", onCancel);
		if (!li.isConnected) {
			releaseGestureArm();
			return;
		}
		// the session build awaits a vault read; keep the gesture slot
		// claimed and watch for a release OR cancel inside that window so
		// we never start a drag for a pointer that is already gone
		let released = false;
		const onReleaseWhileLoading = (e2: PointerEvent) => {
			if (e2.pointerId !== pointerId) return;
			released = true;
			stopWatchingRelease();
		};
		const stopWatchingRelease = () => {
			activeDocument.removeEventListener(
				"pointerup",
				onReleaseWhileLoading,
			);
			activeDocument.removeEventListener(
				"pointercancel",
				onReleaseWhileLoading,
			);
		};
		activeDocument.addEventListener("pointerup", onReleaseWhileLoading);
		activeDocument.addEventListener(
			"pointercancel",
			onReleaseWhileLoading,
		);
		onHandlePointerDown(
			downEv,
			li,
			app,
			getSettings,
			sourcePath,
			() => released,
		)
			.catch((err) => console.error(err))
			.finally(() => {
				stopWatchingRelease();
				releaseGestureArm();
			});
	};
	const onUp = (e: PointerEvent) => {
		if (e.pointerId !== pointerId) return;
		disarm();
		if (!li.isConnected) return;
		toggleCollapse(li);
	};
	const onCancel = (e: PointerEvent) => {
		if (e.pointerId !== pointerId) return;
		disarm();
	};
	activeDocument.addEventListener("pointermove", onMove);
	activeDocument.addEventListener("pointerup", onUp);
	activeDocument.addEventListener("pointercancel", onCancel);
}

function toggleCollapse(li: HTMLLIElement): void {
	const chevron = li.querySelector<HTMLElement>(
		":scope > .list-collapse-indicator, :scope > .collapse-icon",
	);
	if (chevron) chevron.click();
}

async function onHandlePointerDown(
	ev: PointerEvent,
	li: HTMLLIElement,
	app: App,
	getSettings: () => DraggableListSettings,
	sourcePath: string,
	isReleased?: () => boolean,
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
	activeDocument.querySelectorAll<HTMLElement>("li").forEach((liEl) => {
		const ln = liEl.dataset[LINE_ATTR];
		if (ln !== undefined) {
			lineMap.set(parseInt(ln, 10), liEl);
		}
	});

	const allGroupSlots: GroupSlot[] = [];
	for (const g of allGroups) {
		const groupEls: HTMLElement[][] = [];
		const itemRects: DOMRect[] = [];
		const itemIdxs: number[] = [];
		const itemExtents: number[] = [];
		for (let ii = 0; ii < g.items.length; ii++) {
			const item = g.items[ii]!;
			const liEl = lineMap.get(item.startLine);
			if (!liEl) continue;
			const r = liEl.getBoundingClientRect();
			if (r.width === 0 && r.height === 0) continue;
			groupEls.push([liEl]);
			itemRects.push(r);
			itemIdxs.push(ii);
			itemExtents.push(r.bottom);
		}
		if (groupEls.length === 0) continue;
		allGroupSlots.push({ group: g, groupEls, itemRects, itemIdxs, itemExtents });
	}

	const sourceSlot = allGroupSlots.find((s) => s.group === group);
	if (!sourceSlot) return;
	const sourceVisIdx = sourceSlot.itemIdxs.indexOf(sourceItemIdx);
	if (sourceVisIdx < 0) return;

	const session: DragSession = {
		group,
		sourceItemIdx,
		sourceVisIdx,
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

	if (isReleased?.()) return;
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
		return result ? result.text : text;
	});
}
