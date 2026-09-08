import { browser } from "@wdio/globals";
import assert from "node:assert";

export function locate(text) {
	return browser.execute((text) => {
		const rows = Array.from(document.querySelectorAll(".cm-line, li"))
			.filter((el) => (el.textContent || "").includes(text))
			.filter((el) => {
				const r = el.getBoundingClientRect();
				return r.width > 0 && r.height > 0;
			});
		if (rows.length === 0) return { error: `no visible row containing "${text}"` };
		rows.sort(
			(a, b) => a.getBoundingClientRect().height - b.getBoundingClientRect().height,
		);
		const row = rows[0];
		const rr = row.getBoundingClientRect();

		const handles = Array.from(document.querySelectorAll(".dli-handle")).filter(
			(h) => {
				const r = h.getBoundingClientRect();
				if (r.width === 0 && r.height === 0) return false;
				const cy = r.top + r.height / 2;
				return cy >= rr.top - 2 && cy <= rr.bottom + 2;
			},
		);
		if (handles.length === 0) return { error: `no handle for "${text}"`, row: rr };
		const own = handles.filter((h) => row.contains(h));
		const h = (own.length ? own : handles)[0];
		const hr = h.getBoundingClientRect();
		return {
			hx: Math.round(hr.left + hr.width / 2),
			hy: Math.round(hr.top + hr.height / 2),
			row: {
				x: Math.round(rr.left),
				y: Math.round(rr.top),
				w: Math.round(rr.width),
				h: Math.round(rr.height),
			},
			cls: h.className,
		};
	}, text);
}

async function must(text) {
	const l = await locate(text);
	assert.ok(!l.error, `${l.error} (looking for "${text}")`);
	return l;
}

export const below = (l) => ({ x: l.row.x + 40, y: l.row.y + l.row.h - 2 });
export const above = (l) => ({ x: l.row.x + 40, y: l.row.y + 1 });
export const onto = (l) => ({ x: l.row.x + 40, y: l.row.y + Math.round(l.row.h / 2) });

function build(sx, sy, tx, ty, steps) {
	let a = browser
		.action("pointer", { parameters: { pointerType: "mouse" } })
		.move({ x: sx, y: sy })
		.down({ button: 0 })
		.pause(60);
	for (let i = 1; i <= steps; i++) {
		a = a
			.move({
				x: Math.round(sx + ((tx - sx) * i) / steps),
				y: Math.round(sy + ((ty - sy) * i) / steps),
				duration: 30,
			})
			.pause(15);
	}
	return a;
}

async function assertOnHandle(x, y, text) {
	const at = await browser.execute((x, y) => {
		const el = document.elementFromPoint(x, y);
		return el ? { cls: String(el.className), txt: (el.textContent || "").slice(0, 20) } : null;
	}, x, y);
	assert.ok(
		at && at.cls.includes("dli-handle"),
		`drag origin for "${text}" must be the handle, not text; got ${JSON.stringify(at)}`,
	);
}

export async function drag(fromText, point, { steps = 14, settle = 400 } = {}) {
	const src = await must(fromText);
	await assertOnHandle(src.hx, src.hy, fromText);
	await build(src.hx, src.hy, point.x, point.y, steps)
		.pause(100)
		.up({ button: 0 })
		.perform();
	await browser.pause(settle);
}

export async function grab(fromText, point, { steps = 14, hold = 150 } = {}) {
	const src = await must(fromText);
	await assertOnHandle(src.hx, src.hy, fromText);
	await build(src.hx, src.hy, point.x, point.y, steps).perform(true);
	await browser.pause(hold);
	return src;
}

export async function drop(settle = 400) {
	await browser.releaseActions();
	await browser.pause(settle);
}

export async function cancel(settle = 300) {
	await browser.keys(["Escape"]);
	await browser.pause(150);
	await browser.releaseActions();
	await browser.pause(settle);
}

export const dragState = () =>
	browser.execute(() => ({
		ghost: !!document.querySelector(".dli-ghost"),
		dropLine: !!document.querySelector(".dli-drop-line.dli-visible"),
		dragging: !!document.querySelector(".dli-dragging"),
	}));

export { must as locateOrFail };
