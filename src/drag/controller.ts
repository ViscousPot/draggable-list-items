import type { DragSession, GroupSlot, CrossFileResult } from "./types";
import type { Group } from "../list/parse";

let cancelActive: (() => void) | null = null;
let gestureArmed = false;

/**
 * Claims the single gesture slot (armed press or active drag). Callers must
 * pair a successful claim with releaseGestureArm() on every disarm path.
 */
export function tryArmGesture(): boolean {
	if (gestureArmed || cancelActive !== null) return false;
	gestureArmed = true;
	return true;
}

export function releaseGestureArm(): void {
	gestureArmed = false;
}

export function beginDrag(session: DragSession, ev: PointerEvent): void {
	cancelDrag();
	ev.preventDefault();

	const srcEls = session.groupEls[session.sourceVisIdx];
	if (!srcEls || srcEls.length === 0) return;
	const srcRect = unionRect(srcEls);
	const sourceParent = session.sourceEl.parentElement;
	const anchorLeft = sourceParent
		? sourceParent.getBoundingClientRect().left
		: srcRect.left;

	const ghost = buildGhost(session.sourceEl, srcEls, srcRect);
	activeDocument.body.appendChild(ghost);

	const indicator = activeDocument.createElement("div");
	indicator.className = "dli-drop-line";
	activeDocument.body.appendChild(indicator);

	session.sourceEl.classList.add("dli-dragging");

	const offsetX = ev.clientX - anchorLeft;
	const offsetY = ev.clientY - srcRect.top;
	const pointerId = ev.pointerId;

	let target: HitTarget | null = null;
	let activeGroups: GroupSlot[] = session.allGroups;
	let crossFile: CrossFileResult | null = null;

	positionGhost(ghost, ev.clientX - offsetX, ev.clientY - offsetY);

	const onMove = (e: PointerEvent) => {
		if (e.pointerId !== pointerId) return;
		if ((e.buttons & 1) === 0) {
			cancelDrag();
			return;
		}
		e.preventDefault();
		positionGhost(ghost, e.clientX - offsetX, e.clientY - offsetY);

		const sourceHit = hitTest(
			session.allGroups,
			session.group,
			session.enableCrossGroupDrag,
			e.clientX,
			e.clientY,
		);

		if (sourceHit !== null) {
			target = sourceHit;
			activeGroups = session.allGroups;
			crossFile = null;
		} else if (session.enableCrossFileDrag && session.queryCrossFile) {
			const cf = session.queryCrossFile(e.clientX, e.clientY);
			if (cf) {
				crossFile = cf;
				activeGroups = cf.allGroups;
				target = hitTest(
					activeGroups,
					session.group,
					true,
					e.clientX,
					e.clientY,
				);
			} else {
				crossFile = null;
				activeGroups = session.allGroups;
				target = null;
			}
		} else {
			crossFile = null;
			activeGroups = session.allGroups;
			target = null;
		}

		updateIndicator(
			indicator,
			activeGroups,
			session.group,
			session.sourceItemIdx,
			target,
		);
	};

	const cleanup = () => {
		activeDocument.removeEventListener("pointermove", onMove);
		activeDocument.removeEventListener("pointerup", onUp);
		activeDocument.removeEventListener("pointercancel", onUp);
		activeDocument.removeEventListener("keydown", onKey, true);
		ghost.remove();
		indicator.remove();
		session.sourceEl.classList.remove("dli-dragging");
		if (cancelActive === cleanup) cancelActive = null;
	};

	const onUp = (e: PointerEvent) => {
		if (e.pointerId !== pointerId) return;
		const final = target;
		const finalCrossFile = crossFile;
		cleanup();
		if (final !== null) {
			const groups = finalCrossFile
				? finalCrossFile.allGroups
				: session.allGroups;
			const slot = groups[final.groupSlotIdx];
			if (!slot) return;
			if (
				!finalCrossFile &&
				slot.group === session.group &&
				(final.itemIdx === session.sourceItemIdx ||
					final.itemIdx === session.sourceItemIdx + 1)
			) {
				return;
			}
			Promise.resolve(
				session.commit({
					fromIdx: session.sourceItemIdx,
					toIdx: final.itemIdx,
					fromGroup: session.group,
					toGroup: slot.group,
					crossFile: finalCrossFile ? finalCrossFile.file : undefined,
				}),
			).catch((err) => console.error(err));
		}
	};

	const onKey = (e: KeyboardEvent) => {
		if (e.key === "Escape") cancelDrag();
	};

	cancelActive = cleanup;

	activeDocument.addEventListener("pointermove", onMove, { passive: false });
	activeDocument.addEventListener("pointerup", onUp);
	activeDocument.addEventListener("pointercancel", onUp);
	activeDocument.addEventListener("keydown", onKey, true);
}

export function cancelDrag(): void {
	if (cancelActive) cancelActive();
}

function freezeStyles(src: HTMLElement, clone: HTMLElement): void {
	const cs = window.getComputedStyle(src);
	for (let i = 0; i < cs.length; i++) {
		const prop = cs[i]!;
		clone.style.setProperty(prop, cs.getPropertyValue(prop));
	}
	const srcChildren = src.children;
	const cloneChildren = clone.children;
	const n = Math.min(srcChildren.length, cloneChildren.length);
	for (let i = 0; i < n; i++) {
		freezeStyles(
			srcChildren[i] as HTMLElement,
			cloneChildren[i] as HTMLElement,
		);
	}
}

function unionRect(els: HTMLElement[]): DOMRect {
	let top = Infinity;
	let left = Infinity;
	let right = -Infinity;
	let bottom = -Infinity;
	for (const el of els) {
		const r = el.getBoundingClientRect();
		if (r.top < top) top = r.top;
		if (r.left < left) left = r.left;
		if (r.right > right) right = r.right;
		if (r.bottom > bottom) bottom = r.bottom;
	}
	return new DOMRect(left, top, right - left, bottom - top);
}

function buildGhost(
	anchor: HTMLElement,
	srcEls: HTMLElement[],
	srcRect: DOMRect,
): HTMLElement {
	const ghost = activeDocument.createElement("div");
	ghost.className = "dli-ghost markdown-rendered";

	const parent = anchor.parentElement;
	const useListContext =
		srcEls.length === 1 &&
		parent !== null &&
		(parent.tagName === "OL" || parent.tagName === "UL");

	if (useListContext && parent) {
		const liClone = anchor.cloneNode(true) as HTMLElement;
		liClone.classList.remove("dli-dragging");
		liClone
			.querySelectorAll(
				".dli-handle, .list-collapse-indicator, .collapse-icon, .cm-fold-indicator",
			)
			.forEach((h) => h.remove());

		const list = parent.cloneNode(false) as HTMLElement;
		if (parent.tagName === "OL") {
			const lis = Array.from(parent.children).filter(
				(c) => c.tagName === "LI",
			) as HTMLElement[];
			const idx = lis.indexOf(anchor);
			const baseStart = parseInt(parent.getAttribute("start") ?? "1", 10);
			list.setAttribute("start", String(baseStart + idx));
		}
		list.appendChild(liClone);
		ghost.appendChild(list);

		const parentRect = parent.getBoundingClientRect();
		ghost.style.left = `${parentRect.left}px`;
		ghost.style.width = `${parentRect.width}px`;
	} else {
		for (const el of srcEls) {
			const clone = el.cloneNode(true) as HTMLElement;
			clone.classList.remove("dli-dragging");
			clone
				.querySelectorAll(
					".dli-handle, .list-collapse-indicator, .collapse-icon, .cm-fold-indicator",
				)
				.forEach((h) => h.remove());
			freezeStyles(el, clone);
			ghost.appendChild(clone);
		}
		ghost.style.left = `${srcRect.left}px`;
		ghost.style.width = `${srcRect.width}px`;
	}

	ghost.style.top = `${srcRect.top}px`;
	ghost.style.height = `${srcRect.height}px`;
	return ghost;
}

function positionGhost(ghost: HTMLElement, x: number, y: number): void {
	ghost.style.left = `${x}px`;
	ghost.style.top = `${y}px`;
}

interface HitTarget {
	groupSlotIdx: number;
	itemIdx: number;
}

interface DropEntry {
	groupSlotIdx: number;
	/** real index into the slot's group.items */
	itemIdx: number;
	rect: DOMRect;
	/** bottom of the item's last visible line (below its subtree) */
	extentBottom: number;
}

function collectDropRects(
	slots: GroupSlot[],
	sourceGroup: Group,
	enableCrossGroupDrag: boolean,
): DropEntry[] {
	const result: DropEntry[] = [];
	for (let g = 0; g < slots.length; g++) {
		const slot = slots[g]!;
		if (slot.group !== sourceGroup) {
			if (!enableCrossGroupDrag) continue;
			if (slot.group.indent !== sourceGroup.indent) continue;
		}
		for (let i = 0; i < slot.groupEls.length; i++) {
			const rect = slot.itemRects[i]!;
			// hidden elements measure as all-zero boxes; letting one in
			// would hand it a huge hit region via the gap split
			if (rect.width === 0 && rect.height === 0) continue;
			result.push({
				groupSlotIdx: g,
				itemIdx: slot.itemIdxs[i]!,
				rect,
				extentBottom: Math.max(
					rect.bottom,
					slot.itemExtents[i] ?? rect.bottom,
				),
			});
		}
	}
	result.sort((a, b) => a.rect.top - b.rect.top);
	return result;
}

export function hitTest(
	groups: GroupSlot[],
	sourceGroup: Group,
	enableCrossGroupDrag: boolean,
	x: number,
	y: number,
): HitTarget | null {
	const allRects = collectDropRects(
		groups,
		sourceGroup,
		enableCrossGroupDrag,
	);
	if (allRects.length === 0) return null;

	const first = allRects[0]!;
	const last = allRects[allRects.length - 1]!;
	const slack = 24;
	const minLeft = Math.min(...allRects.map((r) => r.rect.left)) - slack;
	const maxRight = Math.max(...allRects.map((r) => r.rect.right)) + slack;
	if (x < minLeft || x > maxRight) return null;
	if (y < first.rect.top - slack) return null;
	if (y > last.extentBottom + slack) return null;

	if (y <= first.rect.top) {
		return { groupSlotIdx: first.groupSlotIdx, itemIdx: first.itemIdx };
	}
	if (y >= last.extentBottom) {
		return { groupSlotIdx: last.groupSlotIdx, itemIdx: last.itemIdx + 1 };
	}

	for (let i = 0; i < allRects.length; i++) {
		const cur = allRects[i]!;
		const r = cur.rect;
		const mid = r.top + r.height / 2;
		if (y < mid) {
			return { groupSlotIdx: cur.groupSlotIdx, itemIdx: cur.itemIdx };
		}
		const next = allRects[i + 1];
		if (!next) break;
		if (y < next.rect.top) {
			// pointer is in this item's lower half, over its subtree, or in
			// the span separating it from the next entry (headers/paragraphs
			// between groups): the upper half of that span drops AFTER this
			// item (above the header), the lower half BEFORE the next one
			// (below the header); inside one group both resolve identically
			const boundary = (cur.extentBottom + next.rect.top) / 2;
			if (y < boundary) {
				return {
					groupSlotIdx: cur.groupSlotIdx,
					itemIdx: cur.itemIdx + 1,
				};
			}
			return { groupSlotIdx: next.groupSlotIdx, itemIdx: next.itemIdx };
		}
	}
	return { groupSlotIdx: last.groupSlotIdx, itemIdx: last.itemIdx + 1 };
}

function itemExtentBottom(slot: GroupSlot, visIdx: number): number {
	const rectBottom = slot.itemRects[visIdx]!.bottom;
	return Math.max(rectBottom, slot.itemExtents[visIdx] ?? rectBottom);
}

function updateIndicator(
	indicator: HTMLElement,
	groups: GroupSlot[],
	sourceGroup: Group,
	sourceItemIdx: number,
	target: HitTarget | null,
): void {
	if (target === null) {
		indicator.classList.remove("dli-visible");
		return;
	}
	const slot = groups[target.groupSlotIdx];
	if (!slot) {
		indicator.classList.remove("dli-visible");
		return;
	}
	if (
		slot.group === sourceGroup &&
		(target.itemIdx === sourceItemIdx ||
			target.itemIdx === sourceItemIdx + 1)
	) {
		indicator.classList.remove("dli-visible");
		return;
	}

	// the boundary sits before REAL item target.itemIdx; locate its visible
	// neighbors (viewport rendering can omit items from the slot arrays)
	const vis = slot.itemIdxs;
	let nextVis = -1;
	for (let i = 0; i < vis.length; i++) {
		if (vis[i]! >= target.itemIdx) {
			nextVis = i;
			break;
		}
	}
	const prevVis = nextVis === -1 ? vis.length - 1 : nextVis - 1;

	let y: number;
	let left: number;
	let width: number;
	if (prevVis < 0 && nextVis === -1) {
		indicator.classList.remove("dli-visible");
		return;
	}
	if (prevVis < 0) {
		const r = slot.itemRects[nextVis]!;
		y = r.top;
		left = r.left;
		width = r.width;
	} else if (nextVis === -1) {
		const r = slot.itemRects[prevVis]!;
		y = itemExtentBottom(slot, prevVis);
		left = r.left;
		width = r.width;
	} else {
		const a = slot.itemRects[prevVis]!;
		const b = slot.itemRects[nextVis]!;
		y = (itemExtentBottom(slot, prevVis) + b.top) / 2;
		left = Math.min(a.left, b.left);
		width = Math.max(a.right, b.right) - left;
	}
	indicator.classList.add("dli-visible");
	indicator.style.left = `${left}px`;
	indicator.style.top = `${y - 1}px`;
	indicator.style.width = `${width}px`;
}
