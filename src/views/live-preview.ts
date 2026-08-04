import {
	EditorView,
	ViewPlugin,
	ViewUpdate,
	PluginValue,
} from "@codemirror/view";
import {
	foldCode,
	unfoldCode,
	foldedRanges,
	foldable,
	foldEffect,
	unfoldEffect,
	foldState,
	codeFolding,
} from "@codemirror/language";
import { StateEffect } from "@codemirror/state";
import { App, Editor, ItemView, MarkdownView, Platform, TFile } from "obsidian";
import { findAllGroups, Group } from "../list/parse";
import {
	moveItemCrossGroup,
	extractItemFromText,
	insertItemIntoText,
} from "../list/reorder";
import { remapLineAfterMove } from "../list/fold-remap";
import {
	beginDrag,
	tryArmGesture,
	releaseGestureArm,
} from "../drag/controller";
import { DragSession, GroupSlot, CrossFileResult } from "../drag/types";
import { DraggableListSettings } from "../settings";

const HANDLE_CLASS = "dli-handle";
const HANDLE_CM_CLASS = "dli-handle-cm";
const HAS_CHILDREN_CLASS = "dli-has-children";
const OVERLAY_CLASS = "dli-cm-overlay";
const DRAG_THRESHOLD_PX = 5;

interface HandleEntry {
	handle: HTMLElement;
	lineNum: number;
	indent: number;
}

interface CmEditor extends Editor {
	cm: EditorView;
}

export function buildLivePreviewExtension(
	getSettings: () => DraggableListSettings,
	app: App,
) {
	return ViewPlugin.fromClass(
		class implements PluginValue {
			view: EditorView;
			overlay: HTMLDivElement;
			handles = new Map<HTMLElement, HandleEntry>();
			scheduled = false;
			scrollListener: () => void;
			getSettings: () => DraggableListSettings;
			app: App;

			constructor(view: EditorView) {
				this.view = view;
				this.app = app;
				this.getSettings = getSettings;
				this.overlay = activeDocument.createElement("div");
				this.overlay.className = OVERLAY_CLASS;
				view.scrollDOM.appendChild(this.overlay);
				this.scrollListener = () => this.schedule();
				view.scrollDOM.addEventListener("scroll", this.scrollListener, {
					passive: true,
				});
				this.schedule();
			}

			update(u: ViewUpdate): void {
				if (u.docChanged || u.viewportChanged || u.geometryChanged) {
					this.schedule();
				}
			}

			destroy(): void {
				this.view.scrollDOM.removeEventListener(
					"scroll",
					this.scrollListener,
				);
				this.handles.clear();
				this.overlay.remove();
			}

			schedule(): void {
				if (this.scheduled) return;
				this.scheduled = true;
				window.requestAnimationFrame(() => {
					this.scheduled = false;
					this.scan();
				});
			}

			scan(): void {
				const lineEls = Array.from(
					this.view.contentDOM.querySelectorAll<HTMLElement>(
						".cm-line.HyperMD-list-line, .cm-line.HyperMD-task-line",
					),
				);

				const seen = new Set<HTMLElement>();
				const overlayRect = this.overlay.getBoundingClientRect();

				for (const lineEl of lineEls) {
					seen.add(lineEl);
					let entry = this.handles.get(lineEl);
					if (!entry) {
						entry = this.createHandle(lineEl);
						this.overlay.appendChild(entry.handle);
						this.handles.set(lineEl, entry);
					}
					const r = lineEl.getBoundingClientRect();
					const offset = Platform.isMobile ? 18 : 14;

					let contentLeft: number | null = null;
					// align to the first visual row (checkbox row), not the
					// whole wrapped block
					let rowTop = r.top;
					let rowHeight = r.height;
					const linePos = this.view.posAtDOM(lineEl);
					if (linePos >= 0 && linePos <= this.view.state.doc.length) {
						const line = this.view.state.doc.lineAt(linePos);
						const indent = /^\s*/.exec(line.text)?.[0].length ?? 0;
						const coords = this.view.coordsAtPos(
							line.from + indent,
						);
						if (coords) {
							contentLeft = coords.left;
							if (coords.bottom > coords.top) {
								rowTop = coords.top;
								rowHeight = coords.bottom - coords.top;
							}
						}
						entry.lineNum = line.number - 1;
						entry.indent = indent;
						entry.handle.classList.toggle(
							HAS_CHILDREN_CLASS,
							foldable(this.view.state, line.from, line.to) !==
								null,
						);
					}

					const anchorLeft = contentLeft ?? r.left;
					const left = anchorLeft - overlayRect.left - offset;
					entry.handle.style.top = `${rowTop - overlayRect.top}px`;
					entry.handle.style.left = `${left}px`;
					entry.handle.style.height = `${rowHeight}px`;
				}

				for (const [el, entry] of this.handles) {
					if (!seen.has(el)) {
						entry.handle.remove();
						this.handles.delete(el);
					}
				}
			}

			createHandle(lineEl: HTMLElement): HandleEntry {
				const handle = activeDocument.createElement("span");
				handle.className = `${HANDLE_CLASS} ${HANDLE_CM_CLASS}`;
				handle.textContent = "⋮⋮";
				handle.draggable = false;

				const onDown = (ev: PointerEvent) => {
					if (ev.button !== 0) return;
					ev.preventDefault();
					ev.stopPropagation();
					this.armGesture(ev, lineEl);
				};
				handle.addEventListener("pointerdown", onDown);
				handle.addEventListener("mousedown", (ev) =>
					ev.preventDefault(),
				);
				handle.addEventListener("dragstart", (ev) =>
					ev.preventDefault(),
				);
				handle.addEventListener("contextmenu", (ev) => {
					ev.preventDefault();
					ev.stopPropagation();
				});

				return { handle, lineNum: -1, indent: 0 };
			}

			armGesture(downEv: PointerEvent, lineEl: HTMLElement): void {
				if (!tryArmGesture()) return;
				const startX = downEv.clientX;
				const startY = downEv.clientY;
				const pointerId = downEv.pointerId;

				const disarm = () => {
					activeDocument.removeEventListener("pointermove", onMove);
					activeDocument.removeEventListener("pointerup", onUp);
					activeDocument.removeEventListener(
						"pointercancel",
						onCancel,
					);
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
					disarm();
					if (!lineEl.isConnected) return;
					this.onHandle(downEv, lineEl);
				};
				const onUp = (e: PointerEvent) => {
					if (e.pointerId !== pointerId) return;
					disarm();
					if (!lineEl.isConnected) return;
					if (this.lineIsFoldable(lineEl)) this.toggleFold(lineEl);
				};
				const onCancel = (e: PointerEvent) => {
					if (e.pointerId !== pointerId) return;
					disarm();
				};
				activeDocument.addEventListener("pointermove", onMove);
				activeDocument.addEventListener("pointerup", onUp);
				activeDocument.addEventListener("pointercancel", onCancel);
			}

			lineIsFoldable(lineEl: HTMLElement): boolean {
				const view = this.view;
				let pos: number;
				try {
					pos = view.posAtDOM(lineEl);
				} catch {
					return false;
				}
				if (pos < 0 || pos > view.state.doc.length) return false;
				const line = view.state.doc.lineAt(pos);
				return foldable(view.state, line.from, line.to) !== null;
			}

			toggleFold(lineEl: HTMLElement): void {
				const view = this.view;
				const chevron = lineEl.querySelector<HTMLElement>(
					".cm-fold-indicator, .collapse-icon, [class*='fold-indicator']",
				);
				if (chevron) {
					chevron.click();
					return;
				}

				let pos: number;
				try {
					pos = view.posAtDOM(lineEl);
				} catch {
					return;
				}
				const line = view.state.doc.lineAt(pos);
				const selection = { anchor: line.from };
				let folded: { from: number; to: number } | null = null;
				const ranges = foldedRanges(view.state);
				ranges.between(line.from, line.to, (from, to) => {
					if (from <= line.to) folded = { from, to };
				});
				view.dispatch({ selection });
				if (folded) {
					unfoldCode(view);
				} else {
					foldCode(view);
				}
			}

			onHandle(ev: PointerEvent, lineEl: HTMLElement): void {
				const view = this.view;
				const pos = view.posAtDOM(lineEl);
				const lineNum = view.state.doc.lineAt(pos).number - 1;
				const docText = view.state.doc.toString();
				const lines = docText.split("\n");

				const allGroups = findAllGroups(lines);
				const groupIdx = allGroups.findIndex((g) =>
					g.items.some((it) => it.startLine === lineNum),
				);
				if (groupIdx < 0) return;

				const group = allGroups[groupIdx]!;
				const sourceItemIdx = group.items.findIndex(
					(it) => it.startLine === lineNum,
				);
				if (sourceItemIdx < 0) return;

				const lineMap = new Map<number, HTMLElement>();
				const cmLines = view.contentDOM.querySelectorAll(".cm-line");
				for (const node of Array.from(cmLines)) {
					const lineEl2 = node as HTMLElement;
					try {
						const p = view.posAtDOM(lineEl2);
						const num = view.state.doc.lineAt(p).number - 1;
						lineMap.set(num, lineEl2);
					} catch {
						/* skip */
					}
				}

				const allGroupSlots: GroupSlot[] = [];
				for (const g of allGroups) {
					const groupEls: HTMLElement[][] = [];
					const itemRects: DOMRect[] = [];
					const itemIdxs: number[] = [];
					const itemExtents: number[] = [];
					for (let ii = 0; ii < g.items.length; ii++) {
						const item = g.items[ii]!;
						const els: HTMLElement[] = [];
						for (
							let ln = item.startLine;
							ln <= item.endLine;
							ln++
						) {
							const el = lineMap.get(ln);
							if (el) els.push(el);
						}
						if (els.length === 0) continue;
						const r = els[0]!.getBoundingClientRect();
						if (r.width === 0 && r.height === 0) continue;
						let extent = r.bottom;
						for (let e = els.length - 1; e >= 0; e--) {
							const er = els[e]!.getBoundingClientRect();
							if (er.width === 0 && er.height === 0) continue;
							if (er.bottom > extent) extent = er.bottom;
							break;
						}
						groupEls.push(els);
						itemRects.push(r);
						itemIdxs.push(ii);
						itemExtents.push(extent);
					}
					if (groupEls.length === 0) continue;
					allGroupSlots.push({
						group: g,
						groupEls,
						itemRects,
						itemIdxs,
						itemExtents,
					});
				}

				const sourceSlot = allGroupSlots.find(
					(s) => s.group === group,
				);
				if (!sourceSlot) return;
				const sourceVisIdx = sourceSlot.itemIdxs.indexOf(sourceItemIdx);
				if (sourceVisIdx < 0) return;

				const sourceFile =
					getFileForCM(this.app, this.view) ??
					this.app.workspace.getActiveFile();
				if (!sourceFile) return;

				const settings = this.getSettings();
				const session: DragSession = {
					group,
					sourceItemIdx,
					sourceVisIdx,
					sourceEl: lineEl,
					groupEls: sourceSlot.groupEls,
					allGroups: allGroupSlots,
					enableCrossGroupDrag: settings.enableCrossGroupDrag,
					enableCrossFileDrag: settings.enableCrossFileDrag,
					app: this.app,
					sourceFile,
					queryCrossFile: (x, y) =>
						queryCrossFileCM(this.app, sourceFile, this.view, x, y),
					commit: ({
						fromIdx,
						toIdx,
						fromGroup,
						toGroup,
						crossFile,
					}) => {
						if (crossFile) {
							return commitCrossFileMoveCM(
								view,
								this.app,
								fromGroup,
								fromIdx,
								toGroup,
								toIdx,
								crossFile,
							);
						}
						commitMoveCM(view, fromGroup, fromIdx, toGroup, toIdx);
						return;
					},
				};

				beginDrag(session, ev);
			}
		},
	);
}

function commitMoveCM(
	view: EditorView,
	fromGroup: Group,
	fromIdx: number,
	toGroup: Group,
	toIdx: number,
): void {
	const anchorLine = fromGroup.items[fromIdx]?.startLine;
	if (anchorLine === undefined) return;
	const docText = view.state.doc.toString();
	const lines = docText.split("\n");
	const allGroups = findAllGroups(lines);

	const freshFrom = allGroups.find((g) =>
		g.items.some((it) => it.startLine === anchorLine),
	);
	if (!freshFrom) return;
	const freshFromIdx = freshFrom.items.findIndex(
		(it) => it.startLine === anchorLine,
	);
	if (freshFromIdx < 0) return;

	const targetAnchor = toGroup.items[0]!.startLine;
	const freshTo = allGroups.find((g) =>
		g.items.some((it) => it.startLine === targetAnchor),
	);
	if (!freshTo) return;

	const result = moveItemCrossGroup(
		docText,
		freshFrom,
		freshFromIdx,
		freshTo,
		toIdx,
	);
	if (!result) return;

	const foldAnchors = captureFoldAnchors(view);

	const newLines = result.text.split("\n");
	const affectedStart = Math.min(
		freshFrom.items[0]!.startLine,
		freshTo.items[0]!.startLine,
	);
	const affectedEnd = Math.max(
		freshFrom.items[freshFrom.items.length - 1]!.endLine,
		freshTo.items[freshTo.items.length - 1]!.endLine,
	);
	const from = view.state.doc.line(affectedStart + 1).from;
	const to = view.state.doc.line(affectedEnd + 1).to;
	const newSlice = newLines.slice(affectedStart, affectedEnd + 1).join("\n");
	view.dispatch({
		changes: { from, to, insert: newSlice },
	});

	restoreFoldAnchors(
		view,
		foldAnchors.map((anchor) =>
			remapLineAfterMove(
				anchor,
				result.srcStart,
				result.srcLen,
				result.destStart,
			),
		),
	);
}

function captureFoldAnchors(view: EditorView): number[] {
	const anchors: number[] = [];
	const iter = foldedRanges(view.state).iter();
	while (iter.value) {
		anchors.push(view.state.doc.lineAt(iter.from).number - 1);
		iter.next();
	}
	return anchors;
}

function restoreFoldAnchors(view: EditorView, anchors: number[]): void {
	const state = view.state;
	const alreadyFolded = foldedRanges(state);
	const effects: StateEffect<unknown>[] = [];
	const seen = new Set<string>();
	for (const anchor of anchors) {
		if (anchor < 0 || anchor >= state.doc.lines) continue;
		const line = state.doc.line(anchor + 1);
		const range = foldable(state, line.from, line.to);
		if (!range) continue;
		const key = `${range.from}:${range.to}`;
		if (seen.has(key)) continue;
		seen.add(key);
		let exists = false;
		alreadyFolded.between(line.from, line.to, (from, to) => {
			if (from < line.from || from > line.to) return;
			if (from === range.from && to === range.to) {
				exists = true;
			} else {
				// a fold clipped by the slice replacement survives with the
				// wrong extent; clear it before re-folding the true range
				effects.push(unfoldEffect.of({ from, to }));
			}
		});
		if (!exists) effects.push(foldEffect.of(range));
	}
	if (effects.length === 0) return;
	if (!state.field(foldState, false)) {
		effects.unshift(StateEffect.appendConfig.of(codeFolding()));
	}
	view.dispatch({ effects });
}

function getFileForCM(app: App, cm: EditorView): TFile | null {
	for (const leaf of app.workspace.getLeavesOfType("markdown")) {
		const editor = (leaf.view as MarkdownView).editor;
		if (!editor) continue;
		if ((editor as CmEditor).cm === cm) {
			return (leaf.view as MarkdownView).file ?? null;
		}
	}
	return null;
}

function getCMFromLeaf(app: App, file: TFile): EditorView | null {
	for (const leaf of app.workspace.getLeavesOfType("markdown")) {
		const view = leaf.view as ItemView;
		if ((view as MarkdownView).file !== file) continue;
		const editor = (view as MarkdownView).editor;
		if (!editor) return null;
		return (editor as CmEditor).cm ?? null;
	}
	return null;
}

function queryCrossFileCM(
	app: App,
	sourceFile: TFile,
	_sourceView: EditorView,
	x: number,
	y: number,
): CrossFileResult | null {
	for (const leaf of app.workspace.getLeavesOfType("markdown")) {
		const leafView = leaf.view;
		if ((leafView as MarkdownView).file === sourceFile) continue;
		const editor = (leafView as MarkdownView).editor;
		if (!editor) continue;
		const cm = (editor as CmEditor).cm as EditorView | undefined;
		if (!cm) continue;
		const rect = cm.contentDOM.getBoundingClientRect();
		if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom)
			continue;

		const docText = cm.state.doc.toString();
		const lines = docText.split("\n");
		const allGroups = findAllGroups(lines);
		const lineMap = new Map<number, HTMLElement>();
		for (const node of Array.from(
			cm.contentDOM.querySelectorAll(".cm-line"),
		)) {
			const el = node as HTMLElement;
			try {
				const p = cm.posAtDOM(el);
				const num = cm.state.doc.lineAt(p).number - 1;
				lineMap.set(num, el);
			} catch {
				/* skip */
			}
		}
		const allGroupSlots: GroupSlot[] = [];
		for (const g of allGroups) {
			const groupEls: HTMLElement[][] = [];
			const itemRects: DOMRect[] = [];
			const itemIdxs: number[] = [];
			const itemExtents: number[] = [];
			for (let ii = 0; ii < g.items.length; ii++) {
				const item = g.items[ii]!;
				const els: HTMLElement[] = [];
				for (let ln = item.startLine; ln <= item.endLine; ln++) {
					const el = lineMap.get(ln);
					if (el) els.push(el);
				}
				if (els.length === 0) continue;
				const r = els[0]!.getBoundingClientRect();
				if (r.width === 0 && r.height === 0) continue;
				let extent = r.bottom;
				for (let e = els.length - 1; e >= 0; e--) {
					const er = els[e]!.getBoundingClientRect();
					if (er.width === 0 && er.height === 0) continue;
					if (er.bottom > extent) extent = er.bottom;
					break;
				}
				groupEls.push(els);
				itemRects.push(r);
				itemIdxs.push(ii);
				itemExtents.push(extent);
			}
			if (groupEls.length === 0) continue;
			allGroupSlots.push({
				group: g,
				groupEls,
				itemRects,
				itemIdxs,
				itemExtents,
			});
		}
		if (allGroupSlots.length === 0) continue;
		const targetFile = (leafView as MarkdownView).file;
		if (!(targetFile instanceof TFile)) continue;
		return { file: targetFile, allGroups: allGroupSlots };
	}
	return null;
}

async function commitCrossFileMoveCM(
	sourceView: EditorView,
	app: App,
	fromGroup: Group,
	fromIdx: number,
	toGroup: Group,
	toIdx: number,
	targetFile: TFile,
): Promise<void> {
	const anchorLine = fromGroup.items[fromIdx]?.startLine;
	if (anchorLine === undefined) return;

	const docText = sourceView.state.doc.toString();
	const docLines = docText.split("\n");
	const allGroups = findAllGroups(docLines);
	const freshFrom = allGroups.find((g) =>
		g.items.some((it) => it.startLine === anchorLine),
	);
	if (!freshFrom) return;
	const freshFromIdx = freshFrom.items.findIndex(
		(it) => it.startLine === anchorLine,
	);
	if (freshFromIdx < 0) return;

	const extract = extractItemFromText(docText, freshFrom, freshFromIdx);
	if (!extract) return;

	const srcStart = freshFrom.items[freshFromIdx]!.startLine;
	const srcLen = extract.block.length;
	const sourceKind = fromGroup.kind;

	// Resolve and apply the target insertion before touching the source, so a
	// failed target lookup can never delete the item without re-inserting it.
	const targetCM = getCMFromLeaf(app, targetFile);
	let openTarget: {
		cm: EditorView;
		freshTo: Group;
		text: string;
		insertAt: number;
	} | null = null;
	if (targetCM) {
		const targetText = targetCM.state.doc.toString();
		const targetLines = targetText.split("\n");
		const targetGroups = findAllGroups(targetLines);
		const targetAnchor = toGroup.items[0]!.startLine;
		const freshTo = targetGroups.find((g) =>
			g.items.some((it) => it.startLine === targetAnchor),
		);
		if (!freshTo) return;
		const result = insertItemIntoText(
			targetText,
			extract.block,
			sourceKind,
			freshTo,
			toIdx,
		);
		if (!result) return;
		openTarget = {
			cm: targetCM,
			freshTo,
			text: result.text,
			insertAt: result.insertAt,
		};
	} else {
		let inserted = false;
		await app.vault.process(targetFile, (text) => {
			const targetLines = text.split("\n");
			const targetGroups = findAllGroups(targetLines);
			const targetAnchor = toGroup.items[0]!.startLine;
			const freshTo = targetGroups.find((g) =>
				g.items.some((it) => it.startLine === targetAnchor),
			);
			if (!freshTo) return text;
			const result = insertItemIntoText(
				text,
				extract.block,
				sourceKind,
				freshTo,
				toIdx,
			);
			if (!result) return text;
			inserted = true;
			return result.text;
		});
		if (!inserted) return;
		// the await opened a window for concurrent source edits; skip the
		// removal (leaving a duplicate the user can undo) rather than
		// deleting lines that may no longer be the dragged item
		if (sourceView.state.doc.toString() !== docText) return;
	}

	const sourceAnchors = captureFoldAnchors(sourceView);

	const affectedStart = freshFrom.items[0]!.startLine;
	const affectedEnd = freshFrom.items[freshFrom.items.length - 1]!.endLine;
	const from = sourceView.state.doc.line(affectedStart + 1).from;
	const to = sourceView.state.doc.line(affectedEnd + 1).to;
	const sourceLines = extract.text.split("\n");
	// extract.text is srcLen lines shorter than the doc, while [from, to]
	// spans the group's OLD extent — the window must shrink to match or the
	// lines following the group get duplicated into the replacement
	const newSlice = sourceLines
		.slice(affectedStart, affectedEnd + 1 - srcLen)
		.join("\n");
	sourceView.dispatch({
		changes: { from, to, insert: newSlice },
	});

	restoreFoldAnchors(
		sourceView,
		sourceAnchors
			.filter((a) => a < srcStart || a >= srcStart + srcLen)
			.map((a) => (a >= srcStart + srcLen ? a - srcLen : a)),
	);

	if (openTarget) {
		const { cm, freshTo, insertAt, text: targetNewText } = openTarget;
		const movedAnchorOffsets = sourceAnchors
			.filter((a) => a >= srcStart && a < srcStart + srcLen)
			.map((a) => a - srcStart);
		const targetAnchors = captureFoldAnchors(cm);

		const newLines = targetNewText.split("\n");
		const affectedStart2 = freshTo.items[0]!.startLine;
		const affectedEnd2 = freshTo.items[freshTo.items.length - 1]!.endLine;
		const from2 = cm.state.doc.line(affectedStart2 + 1).from;
		const to2 = cm.state.doc.line(affectedEnd2 + 1).to;
		const insertSlice = newLines
			.slice(affectedStart2, affectedEnd2 + 1 + extract.block.length)
			.join("\n");
		cm.dispatch({
			changes: { from: from2, to: to2, insert: insertSlice },
		});

		restoreFoldAnchors(
			cm,
			targetAnchors
				.map((a) => (a >= insertAt ? a + srcLen : a))
				.concat(movedAnchorOffsets.map((off) => insertAt + off)),
		);
	}
}
