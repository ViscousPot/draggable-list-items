import { DragSession } from "./types";

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
	let targetIdx: number | null = null;

	positionGhost(ghost, ev.clientX - offsetX, ev.clientY - offsetY);

	const onMove = (e: PointerEvent) => {
		if (e.pointerId !== pointerId) return;
		e.preventDefault();
		positionGhost(ghost, e.clientX - offsetX, e.clientY - offsetY);
		targetIdx = hitTest(session, e.clientX, e.clientY);
		updateIndicator(indicator, session, targetIdx);
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
		const final = targetIdx;
		cleanup();
		if (
			final !== null &&
			final !== session.sourceItemIdx &&
			final !== session.sourceItemIdx + 1
		) {
			Promise.resolve(
				session.commit({
					fromIdx: session.sourceItemIdx,
					toIdx: final,
					group: session.group,
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

function hitTest(session: DragSession, x: number, y: number): number | null {
	const rects = session.groupEls.map((els) => unionRect(els));
	if (rects.length === 0) return null;

	const first = rects[0]!;
	const last = rects[rects.length - 1]!;
	const slack = 24;
	const minLeft = Math.min(...rects.map((r) => r.left)) - slack;
	const maxRight = Math.max(...rects.map((r) => r.right)) + slack;
	if (x < minLeft || x > maxRight) return null;
	if (y < first.top - slack) return null;
	if (y > last.bottom + slack) return null;

	if (y <= first.top) return 0;
	if (y >= last.bottom) return rects.length;

	for (let i = 0; i < rects.length; i++) {
		const r = rects[i]!;
		const mid = r.top + r.height / 2;
		if (y < mid) return i;
		if (y < r.bottom) return i + 1;
	}
	return rects.length;
}

function updateIndicator(
	indicator: HTMLElement,
	session: DragSession,
	target: number | null,
): void {
	if (target === null) {
		indicator.classList.remove("dli-visible");
		return;
	}
	if (
		target === session.sourceItemIdx ||
		target === session.sourceItemIdx + 1
	) {
		indicator.classList.remove("dli-visible");
		return;
	}
	const rects = session.groupEls.map((els) => unionRect(els));
	let y: number;
	let left: number;
	let width: number;
	if (target === 0) {
		const r = rects[0]!;
		y = r.top;
		left = r.left;
		width = r.width;
	} else if (target >= rects.length) {
		const r = rects[rects.length - 1]!;
		y = r.bottom;
		left = r.left;
		width = r.width;
	} else {
		const a = rects[target - 1]!;
		const b = rects[target]!;
		y = (a.bottom + b.top) / 2;
		left = Math.min(a.left, b.left);
		width = Math.max(a.right, b.right) - left;
	}
	indicator.classList.add("dli-visible");
	indicator.style.left = `${left}px`;
	indicator.style.top = `${y - 1}px`;
	indicator.style.width = `${width}px`;
}
