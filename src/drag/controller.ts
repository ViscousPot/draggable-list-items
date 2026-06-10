import { DragSession, GroupSlot, CrossFileResult } from "./types";
import { Group } from "../list/parse";

let cancelActive: (() => void) | null = null;

export function beginDrag(session: DragSession, ev: PointerEvent): void {
	cancelDrag();
	ev.preventDefault();

	const srcEls = session.groupEls[session.sourceItemIdx];
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

function collectDropRects(
	slots: GroupSlot[],
	sourceGroup: Group,
	enableCrossGroupDrag: boolean,
): { groupSlotIdx: number; itemIdx: number; rect: DOMRect }[] {
	const result: { groupSlotIdx: number; itemIdx: number; rect: DOMRect }[] =
		[];
	for (let g = 0; g < slots.length; g++) {
		const slot = slots[g]!;
		if (slot.group !== sourceGroup) {
			if (!enableCrossGroupDrag) continue;
			if (slot.group.indent !== sourceGroup.indent) continue;
		}
		for (let i = 0; i < slot.groupEls.length; i++) {
			const rect = slot.itemRects[i]!;
			result.push({ groupSlotIdx: g, itemIdx: i, rect });
		}
	}
	result.sort((a, b) => a.rect.top - b.rect.top);
	return result;
}

function hitTest(
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

	const first = allRects[0]!.rect;
	const last = allRects[allRects.length - 1]!.rect;
	const slack = 24;
	const minLeft = Math.min(...allRects.map((r) => r.rect.left)) - slack;
	const maxRight = Math.max(...allRects.map((r) => r.rect.right)) + slack;
	if (x < minLeft || x > maxRight) return null;
	if (y < first.top - slack) return null;
	if (y > last.bottom + slack) return null;

	if (y <= first.top) {
		return {
			groupSlotIdx: allRects[0]!.groupSlotIdx,
			itemIdx: allRects[0]!.itemIdx,
		};
	}
	if (y >= last.bottom) {
		const lastItem = allRects[allRects.length - 1]!;
		return {
			groupSlotIdx: lastItem.groupSlotIdx,
			itemIdx: lastItem.itemIdx + 1,
		};
	}

	for (let i = 0; i < allRects.length; i++) {
		const r = allRects[i]!.rect;
		const mid = r.top + r.height / 2;
		if (y < mid) {
			return {
				groupSlotIdx: allRects[i]!.groupSlotIdx,
				itemIdx: allRects[i]!.itemIdx,
			};
		}
		if (y < r.bottom) {
			const next = allRects[i + 1];
			if (next) {
				return {
					groupSlotIdx: next.groupSlotIdx,
					itemIdx: next.itemIdx,
				};
			}
			return {
				groupSlotIdx: allRects[i]!.groupSlotIdx,
				itemIdx: allRects[i]!.itemIdx + 1,
			};
		}
	}
	const lastItem = allRects[allRects.length - 1]!;
	return {
		groupSlotIdx: lastItem.groupSlotIdx,
		itemIdx: lastItem.itemIdx + 1,
	};
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
	const rects = slot.itemRects;
	let y: number;
	let left: number;
	let width: number;
	if (target.itemIdx === 0) {
		const r = rects[0]!;
		y = r.top;
		left = r.left;
		width = r.width;
	} else if (target.itemIdx >= rects.length) {
		const r = rects[rects.length - 1]!;
		y = r.bottom;
		left = r.left;
		width = r.width;
	} else {
		const a = rects[target.itemIdx - 1]!;
		const b = rects[target.itemIdx]!;
		y = (a.bottom + b.top) / 2;
		left = Math.min(a.left, b.left);
		width = Math.max(a.right, b.right) - left;
	}
	indicator.classList.add("dli-visible");
	indicator.style.left = `${left}px`;
	indicator.style.top = `${y - 1}px`;
	indicator.style.width = `${width}px`;
}
