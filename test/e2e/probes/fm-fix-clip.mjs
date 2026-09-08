import { browser } from "@wdio/globals";
import { grab, drop, below, locateOrFail } from "../lib/drag.mjs";
import { openClean } from "../lib/obsidian.mjs";

const injectPointerMarker = () =>
	browser.execute(() => {
		if (document.getElementById("dli-ptr-probe")) return;
		const mk = document.createElement("div");
		mk.id = "dli-ptr-probe";
		mk.style.cssText =
			"position:fixed;width:18px;height:18px;border:2px solid #00ff00;border-radius:50%;" +
			"transform:translate(-50%,-50%);pointer-events:none;z-index:2147483646;" +
			"background:rgba(0,255,0,0.4);";
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

describe("clip probe", function () {
	it("clip: lp frontmatter ghost alignment (fixed)", async function () {
		await openClean("fm-tasks.md");
		await injectPointerMarker();
		const src = await locateOrFail("Task A");
		const target = await locateOrFail("Task C");
		const dropPoint = below(target);
		let a = browser
			.action("pointer", { parameters: { pointerType: "mouse" } })
			.move({ x: src.hx, y: src.hy })
			.down({ button: 0 })
			.pause(200);
		const steps = 30;
		for (let i = 1; i <= steps; i++) {
			a = a.move({
				x: Math.round(src.hx + ((dropPoint.x - src.hx) * i) / steps),
				y: Math.round(src.hy + ((dropPoint.y - src.hy) * i) / steps),
				duration: 45,
			}).pause(35);
		}
		await a.pause(500).up({ button: 0 }).perform();
		await browser.pause(400);
	});

	it("clip: rv frontmatter ghost alignment (fixed)", async function () {
		await openClean("fm-tasks.md", { mode: "preview" });
		await injectPointerMarker();
		const src = await locateOrFail("Task A");
		const target = await locateOrFail("Task C");
		const dropPoint = below(target);
		let a = browser
			.action("pointer", { parameters: { pointerType: "mouse" } })
			.move({ x: src.hx, y: src.hy })
			.down({ button: 0 })
			.pause(200);
		const steps = 30;
		for (let i = 1; i <= steps; i++) {
			a = a.move({
				x: Math.round(src.hx + ((dropPoint.x - src.hx) * i) / steps),
				y: Math.round(src.hy + ((dropPoint.y - src.hy) * i) / steps),
				duration: 45,
			}).pause(35);
		}
		await a.pause(500).up({ button: 0 }).perform();
		await browser.pause(400);
	});
});