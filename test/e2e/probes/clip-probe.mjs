import { browser } from "@wdio/globals";
import { grab, drop, above, locateOrFail } from "../lib/drag.mjs";
import { openClean } from "../lib/obsidian.mjs";

const injectPointerMarker = () =>
	browser.execute(() => {
		if (document.getElementById("dli-ptr-probe")) return;
		const mk = document.createElement("div");
		mk.id = "dli-ptr-probe";
		mk.style.cssText =
			"position:fixed;width:18px;height:18px;border:2px solid #ff0000;border-radius:50%;" +
			"transform:translate(-50%,-50%);pointer-events:none;z-index:2147483646;" +
			"background:rgba(255,0,0,0.4);";
		document.body.appendChild(mk);
		document.addEventListener("pointermove", (e) => {
			mk.style.left = e.clientX + "px";
			mk.style.top = e.clientY + "px";
		}, true);
		document.addEventListener("pointerdown", (e) => {
			mk.style.left = e.clientX + "px";
			mk.style.top = e.clientY + "px";
		}, true);
	});

const dragToTop = async (fromText, firstText) => {
	await injectPointerMarker();
	const src = await locateOrFail(fromText);
	const first = await locateOrFail(firstText);
	const p = above(first);
	let a = browser
		.action("pointer", { parameters: { pointerType: "mouse" } })
		.move({ x: src.hx, y: src.hy })
		.down({ button: 0 })
		.pause(200);
	const steps = 30;
	for (let i = 1; i <= steps; i++) {
		a = a.move({
			x: Math.round(src.hx + ((p.x - src.hx) * i) / steps),
			y: Math.round(src.hy + ((p.y - src.hy) * i) / steps),
			duration: 45,
		}).pause(35);
	}
	await a.pause(700).up({ button: 0 }).perform();
	await browser.pause(400);
};

describe("clip probe", function () {
	it("clip: lp six b to very top of deepest sublist (valid)", async function () {
		await openClean("deep6.md");
		await dragToTop("six b", "six a");
	});

	it("clip: rv six b to very top of deepest sublist (valid)", async function () {
		await openClean("deep6.md", { mode: "preview" });
		await dragToTop("six b", "six a");
	});

	it("clip: lp five to very top of its level (valid)", async function () {
		await openClean("deep6.md");
		await dragToTop("five b", "five");
	});

	it("clip: lp three b to very top of its level (valid)", async function () {
		await openClean("deep6.md");
		await dragToTop("three b", "three");
	});
});