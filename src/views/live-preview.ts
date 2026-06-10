import {
	EditorView,
	ViewPlugin,
	ViewUpdate,
	PluginValue,
} from "@codemirror/view";
import { foldCode, unfoldCode, foldedRanges } from "@codemirror/language";
import { Platform } from "obsidian";
import { findAllGroups, Group } from "../list/parse";
import { moveItemCrossGroup } from "../list/reorder";
import { beginDrag } from "../drag/controller";
import { DragSession, GroupSlot } from "../drag/types";
import { DraggableListSettings } from "../settings";

const HANDLE_CLASS = "dli-handle";
const HANDLE_CM_CLASS = "dli-handle-cm";
const SHOW_CLASS = "dli-show";
const OVERLAY_CLASS = "dli-cm-overlay";

interface HandleEntry {
	handle: HTMLElement;
	cleanup: () => void;
	lineNum: number;
	indent: number;
}

export function buildLivePreviewExtension(getSettings: () => DraggableListSettings) {
	return ViewPlugin.fromClass(
		class implements PluginValue {
			view: EditorView;
			overlay: HTMLDivElement;
			handles = new Map<HTMLElement, HandleEntry>();
			scheduled = false;
			scrollListener: () => void;
			hoveredLineEl: HTMLElement | null = null;
			hoverPending = false;
			getSettings: () => DraggableListSettings;

			constructor(view: EditorView) {
				this.view = view;
				this.getSettings = getSettings;
				this.overlay = activeDocument.createElement("div");
				this.overlay.className = OVERLAY_CLASS;
				view.scrollDOM.appendChild(this.overlay);
				this.scrollListener = () => this.schedule();
				view.scrollDOM.addEventListener("scroll", this.scrollListener, { passive: true });
				this.schedule();
			}

			update(u: ViewUpdate): void {
				if (u.docChanged || u.viewportChanged || u.geometryChanged) {
					this.schedule();
				}
			}

			destroy(): void {
				this.view.scrollDOM.removeEventListener("scroll", this.scrollListener);
				for (const { cleanup } of this.handles.values()) cleanup();
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
					const top = r.top - overlayRect.top;
					const offset = Platform.isMobile ? 18 : 14;

					let contentLeft: number | null = null;
					const linePos = this.view.posAtDOM(lineEl);
					if (linePos >= 0 && linePos <= this.view.state.doc.length) {
						const line = this.view.state.doc.lineAt(linePos);
						const indent = /^\s*/.exec(line.text)?.[0].length ?? 0;
						const coords = this.view.coordsAtPos(line.from + indent);
						if (coords) contentLeft = coords.left;
						entry.lineNum = line.number - 1;
						entry.indent = indent;
					}

					const anchorLeft = contentLeft ?? r.left;
					const left = anchorLeft - overlayRect.left - offset;
					entry.handle.style.top = `${top}px`;
					entry.handle.style.left = `${left}px`;
					entry.handle.style.height = `${r.height}px`;
				}

				for (const [el, entry] of this.handles) {
					if (!seen.has(el)) {
						entry.cleanup();
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

				const onEnter = () => this.setHover(lineEl);
				const onLeave = () => this.setHover(null);
				lineEl.addEventListener("mouseenter", onEnter);
				lineEl.addEventListener("mouseleave", onLeave);
				handle.addEventListener("mouseenter", onEnter);
				handle.addEventListener("mouseleave", onLeave);

				const onDown = (ev: PointerEvent) => {
					if (ev.button !== 0) return;
					ev.preventDefault();
					ev.stopPropagation();
					this.onHandle(ev, lineEl);
				};
				handle.addEventListener("pointerdown", onDown);
				handle.addEventListener("mousedown", (ev) => ev.preventDefault());
				handle.addEventListener("dragstart", (ev) => ev.preventDefault());
				handle.addEventListener("contextmenu", (ev) => {
					ev.preventDefault();
					ev.stopPropagation();
					this.toggleFold(lineEl);
				});

				const cleanup = () => {
					lineEl.removeEventListener("mouseenter", onEnter);
					lineEl.removeEventListener("mouseleave", onLeave);
				};
				return { handle, cleanup, lineNum: -1, indent: 0 };
			}

			setHover(lineEl: HTMLElement | null): void {
				this.hoveredLineEl = lineEl;
				if (this.hoverPending) return;
				this.hoverPending = true;
				window.requestAnimationFrame(() => {
					this.hoverPending = false;
					this.reconcileHover();
				});
			}

			reconcileHover(): void {
				for (const e of this.handles.values()) {
					e.handle.classList.remove(SHOW_CLASS);
				}
				const lineEl = this.hoveredLineEl;
				if (!lineEl) return;
				const target = this.handles.get(lineEl);
				if (!target) return;
				target.handle.classList.add(SHOW_CLASS);
				let currentIndent = target.indent;
				if (currentIndent === 0) return;
				const candidates = Array.from(this.handles.values())
					.filter((e) => e.lineNum < target.lineNum && e.indent < target.indent)
					.sort((a, b) => b.lineNum - a.lineNum);
				for (const e of candidates) {
					if (e.indent < currentIndent) {
						e.handle.classList.add(SHOW_CLASS);
						currentIndent = e.indent;
						if (currentIndent === 0) return;
					}
				}
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

				const pos = view.posAtDOM(lineEl);
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
					for (const item of g.items) {
						const els: HTMLElement[] = [];
						for (let ln = item.startLine; ln <= item.endLine; ln++) {
							const el = lineMap.get(ln);
							if (el) els.push(el);
						}
						if (els.length === 0) continue;
						groupEls.push(els);
						const r = els[0]!.getBoundingClientRect();
						itemRects.push(r);
					}
					if (groupEls.length === 0) continue;
					allGroupSlots.push({ group: g, groupEls, itemRects });
				}

				const sourceSlot = allGroupSlots[groupIdx]!;
				if (sourceSlot.groupEls.length === 0) return;

				const settings = this.getSettings();
				const session: DragSession = {
					group,
					sourceItemIdx,
					sourceEl: lineEl,
					groupEls: sourceSlot.groupEls,
					allGroups: allGroupSlots,
					enableCrossGroupDrag: settings.enableCrossGroupDrag,
					commit: ({ fromIdx, toIdx, fromGroup, toGroup }) => {
						commitMoveCM(view, fromGroup, fromIdx, toGroup, toIdx);
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

	const result = moveItemCrossGroup(docText, freshFrom, freshFromIdx, freshTo, toIdx);
	if (!result) return;

	const newLines = result.split("\n");
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
}
