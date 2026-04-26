import { DragSession } from "./types";

let cancelActive: (() => void) | null = null;

export function beginDrag(session: DragSession, ev: PointerEvent): void {
	cancelDrag();
	ev.preventDefault();

	const srcRect = session.sourceEl.getBoundingClientRect();
	const ghost = buildGhost(session.sourceEl, srcRect);
	document.body.appendChild(ghost);

	const indicator = document.createElement("div");
	indicator.className = "dli-drop-line";
	indicator.style.display = "none";
	document.body.appendChild(indicator);

	session.sourceEl.classList.add("dli-dragging");

	const offsetX = ev.clientX - srcRect.left;
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
		document.removeEventListener("pointermove", onMove);
		document.removeEventListener("pointerup", onUp);
		document.removeEventListener("pointercancel", onUp);
		document.removeEventListener("keydown", onKey, true);
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

	document.addEventListener("pointermove", onMove, { passive: false });
	document.addEventListener("pointerup", onUp);
	document.addEventListener("pointercancel", onUp);
	document.addEventListener("keydown", onKey, true);
}

export function cancelDrag(): void {
	if (cancelActive) cancelActive();
}

function buildGhost(src: HTMLElement, rect: DOMRect): HTMLElement {
	const ghost = src.cloneNode(true) as HTMLElement;
	ghost.classList.add("dli-ghost");
	ghost.classList.remove("dli-dragging");
	ghost.style.width = `${rect.width}px`;
	ghost.style.height = `${rect.height}px`;
	ghost.style.left = `${rect.left}px`;
	ghost.style.top = `${rect.top}px`;
	const handles = ghost.querySelectorAll(".dli-handle");
	handles.forEach((h) => h.remove());
	return ghost;
}

function positionGhost(ghost: HTMLElement, x: number, y: number): void {
	ghost.style.left = `${x}px`;
	ghost.style.top = `${y}px`;
}

function hitTest(
	session: DragSession,
	x: number,
	y: number,
): number | null {
	const rects = session.groupEls.map((el) => el.getBoundingClientRect());
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
		indicator.style.display = "none";
		return;
	}
	if (target === session.sourceItemIdx || target === session.sourceItemIdx + 1) {
		indicator.style.display = "none";
		return;
	}
	const rects = session.groupEls.map((el) => el.getBoundingClientRect());
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
	indicator.style.display = "block";
	indicator.style.left = `${left}px`;
	indicator.style.top = `${y - 1}px`;
	indicator.style.width = `${width}px`;
}
