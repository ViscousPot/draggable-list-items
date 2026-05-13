import { App, MarkdownPostProcessorContext, TFile } from "obsidian";
import { findGroup, parseLine } from "../list/parse";
import { moveItem } from "../list/reorder";
import { beginDrag } from "../drag/controller";
import { DragSession } from "../drag/types";

const HANDLE_CLASS = "dli-handle";
const SHOW_CLASS = "dli-show";
const LINE_ATTR = "dliLine";

export function attachReadingViewHandles(
	app: App,
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
		addHandle(li, app, ctx.sourcePath);
	}
}

function addHandle(li: HTMLLIElement, app: App, sourcePath: string): void {
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
		onHandlePointerDown(ev, li, app, sourcePath).catch((err) =>
			console.error(err),
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
	sourcePath: string,
): Promise<void> {
	const lineStr = li.dataset[LINE_ATTR];
	if (!lineStr) return;
	const sourceLine = parseInt(lineStr, 10);
	if (Number.isNaN(sourceLine)) return;

	const file = app.vault.getFileByPath(sourcePath);
	if (!file) return;

	const text = await app.vault.cachedRead(file);
	const lines = text.split("\n");
	const group = findGroup(lines, sourceLine);
	if (!group || group.items.length < 2) return;

	const sourceItemIdx = group.items.findIndex(
		(it) => it.startLine === sourceLine,
	);
	if (sourceItemIdx < 0) return;

	const groupEls = collectGroupEls(li, group.items.length, sourceItemIdx);
	if (!groupEls) return;

	const session: DragSession = {
		group,
		sourceItemIdx,
		sourceEl: li,
		groupEls,
		commit: async ({ fromIdx, toIdx, group: g }) => {
			await commitMove(app, file, g, fromIdx, toIdx);
		},
	};

	beginDrag(session, ev);
}

function collectGroupEls(
	sourceLi: HTMLLIElement,
	count: number,
	sourceIdx: number,
): HTMLElement[][] | null {
	const parent = sourceLi.parentElement;
	if (!parent) return null;
	const sameLevel = Array.from(parent.children).filter(
		(c) =>
			c.tagName === "LI" &&
			(c as HTMLElement).dataset[LINE_ATTR] !== undefined,
	) as HTMLElement[];
	const sourceIdxInParent = sameLevel.indexOf(sourceLi);
	if (sourceIdxInParent < 0) return null;
	const start = sourceIdxInParent - sourceIdx;
	const end = start + count;
	if (start < 0 || end > sameLevel.length) return null;
	return sameLevel.slice(start, end).map((el) => [el]);
}

async function commitMove(
	app: App,
	file: TFile,
	staleGroup: { items: { startLine: number }[] },
	fromIdx: number,
	toIdx: number,
): Promise<void> {
	const anchorLine = staleGroup.items[fromIdx]?.startLine;
	if (anchorLine === undefined) return;
	await app.vault.process(file, (text) => {
		const lines = text.split("\n");
		const fresh = findGroup(lines, anchorLine);
		if (!fresh) return text;
		const freshFrom = fresh.items.findIndex(
			(it) => it.startLine === anchorLine,
		);
		if (freshFrom < 0) return text;
		const result = moveItem(text, fresh, freshFrom, toIdx);
		if (!result) return text;
		return result.text;
	});
}
