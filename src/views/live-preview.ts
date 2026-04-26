import {
	EditorView,
	ViewPlugin,
	ViewUpdate,
	PluginValue,
} from "@codemirror/view";
import { Platform } from "obsidian";
import { findGroup, Group } from "../list/parse";
import { moveItem } from "../list/reorder";
import { beginDrag } from "../drag/controller";
import { DragSession } from "../drag/types";

const HANDLE_CLASS = "dli-handle";
const HANDLE_CM_CLASS = "dli-handle-cm";
const SHOW_CLASS = "dli-show";
const OVERLAY_CLASS = "dli-cm-overlay";

interface HandleEntry {
	handle: HTMLElement;
	cleanup: () => void;
}

export function buildLivePreviewExtension() {
	return ViewPlugin.fromClass(
		class implements PluginValue {
			view: EditorView;
			overlay: HTMLDivElement;
			handles = new Map<HTMLElement, HandleEntry>();
			scheduled = false;
			scrollListener: () => void;

			constructor(view: EditorView) {
				this.view = view;
				this.overlay = document.createElement("div");
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
				requestAnimationFrame(() => {
					this.scheduled = false;
					this.scan();
				});
			}

			scan(): void {
				const lineEls = Array.from(
					this.view.contentDOM.querySelectorAll(
						".cm-line.HyperMD-list-line, .cm-line.HyperMD-task-line",
					),
				) as HTMLElement[];

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
					const left = r.left - overlayRect.left - offset;
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
				const handle = document.createElement("span");
				handle.className = `${HANDLE_CLASS} ${HANDLE_CM_CLASS}`;
				handle.textContent = "⋮⋮";
				handle.draggable = false;

				const showOn = () => handle.classList.add(SHOW_CLASS);
				const showOff = (e: MouseEvent) => {
					const to = e.relatedTarget as Node | null;
					if (to && (to === handle || to === lineEl || lineEl.contains(to))) return;
					handle.classList.remove(SHOW_CLASS);
				};
				lineEl.addEventListener("mouseenter", showOn);
				lineEl.addEventListener("mouseleave", showOff);
				handle.addEventListener("mouseenter", showOn);
				handle.addEventListener("mouseleave", showOff);

				const onDown = (ev: PointerEvent) => {
					if (ev.button !== 0) return;
					ev.preventDefault();
					ev.stopPropagation();
					this.onHandle(ev, lineEl);
				};
				handle.addEventListener("pointerdown", onDown);
				handle.addEventListener("mousedown", (ev) => ev.preventDefault());
				handle.addEventListener("dragstart", (ev) => ev.preventDefault());

				const cleanup = () => {
					lineEl.removeEventListener("mouseenter", showOn);
					lineEl.removeEventListener("mouseleave", showOff);
				};
				return { handle, cleanup };
			}

			onHandle(ev: PointerEvent, lineEl: HTMLElement): void {
				const view = this.view;
				const pos = view.posAtDOM(lineEl);
				const lineNum = view.state.doc.lineAt(pos).number - 1;
				const docText = view.state.doc.toString();
				const lines = docText.split("\n");
				const group = findGroup(lines, lineNum);
				if (!group || group.items.length < 2) return;

				const sourceItemIdx = group.items.findIndex(
					(it) => it.startLine === lineNum,
				);
				if (sourceItemIdx < 0) return;

				const groupEls: (HTMLElement | null)[] = group.items.map((it) => {
					const linePos = view.state.doc.line(it.startLine + 1).from;
					const dom = view.domAtPos(linePos).node;
					let el: HTMLElement | null =
						dom.nodeType === Node.ELEMENT_NODE
							? (dom as HTMLElement)
							: dom.parentElement;
					while (el && !el.classList.contains("cm-line")) {
						el = el.parentElement;
					}
					return el;
				});
				if (groupEls.some((e) => e === null)) return;

				const session: DragSession = {
					group,
					sourceItemIdx,
					sourceEl: lineEl,
					groupEls: groupEls as HTMLElement[],
					commit: ({ fromIdx, toIdx, group: g }) => {
						commitMoveCM(view, g, fromIdx, toIdx);
					},
				};

				beginDrag(session, ev);
			}
		},
	);
}

function commitMoveCM(
	view: EditorView,
	staleGroup: Group,
	fromIdx: number,
	toIdx: number,
): void {
	const anchorLine = staleGroup.items[fromIdx]?.startLine;
	if (anchorLine === undefined) return;
	const docText = view.state.doc.toString();
	const lines = docText.split("\n");
	const fresh = findGroup(lines, anchorLine);
	if (!fresh) return;
	const freshFrom = fresh.items.findIndex((it) => it.startLine === anchorLine);
	if (freshFrom < 0) return;
	const result = moveItem(docText, fresh, freshFrom, toIdx);
	if (!result) return;

	const groupStartLine = fresh.items[0]!.startLine;
	const groupEndLine = fresh.items[fresh.items.length - 1]!.endLine;
	const from = view.state.doc.line(groupStartLine + 1).from;
	const to = view.state.doc.line(groupEndLine + 1).to;
	const newLines = result.text.split("\n");
	const newSlice = newLines.slice(groupStartLine, groupEndLine + 1).join("\n");
	view.dispatch({
		changes: { from, to, insert: newSlice },
	});
}
