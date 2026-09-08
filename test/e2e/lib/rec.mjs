import { spawn, execFileSync } from "node:child_process";
import { mkdirSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import os from "node:os";

const ROOT = process.env.DLI_E2E_DIR || "/tmp/dli-e2e";
const OUT = path.join(ROOT, "recordings");
const LAUNCHER_CACHE =
	process.env.OBSIDIAN_CACHE || path.join(os.homedir(), ".cache/obsidian-launcher");

export const BOUNDS = { x: 80, y: 80, w: 1280, h: 900 };

let proc = null;

function sh(cmd, args) {
	return execFileSync(cmd, args, { encoding: "utf8" });
}

function windows() {
	try {
		return sh("wmctrl", ["-lpG"])
			.split("\n")
			.filter(Boolean)
			.map((l) => l.trim().split(/\s+/));
	} catch {
		return [];
	}
}

export function testWindow() {
	let pids;
	try {
		pids = new Set(sh("pgrep", ["-f", LAUNCHER_CACHE]).split("\n").filter(Boolean));
	} catch {
		return { error: "no launcher-spawned Obsidian process" };
	}
	const rows = windows().filter((r) => pids.has(r[2]) && +r[5] > 200 && +r[6] > 200);
	if (rows.length === 0) return { error: "launcher process has no mapped window" };
	rows.sort((a, b) => +b[5] * +b[6] - +a[5] * +a[6]);
	const r = rows[0];
	return { id: r[0], desk: r[1], pid: r[2], x: +r[3], y: +r[4], w: +r[5], h: +r[6] };
}

function i3(id, cmd) {
	sh("i3-msg", [`[id="${parseInt(id, 16)}"] ${cmd}`]);
}

function floatingState(id) {
	const dec = parseInt(id, 16);
	let tree;
	try {
		tree = JSON.parse(sh("i3-msg", ["-t", "get_tree"]));
	} catch {
		return null;
	}
	let found = null;
	const walk = (n) => {
		if (n.window === dec) found = n.floating || null;
		for (const c of [...(n.nodes || []), ...(n.floating_nodes || [])]) walk(c);
	};
	walk(tree);
	return found;
}

export const isFloating = (id) => /_on$/.test(floatingState(id) || "");

export async function waitForWindow(timeout = 20000) {
	const t0 = Date.now();
	for (;;) {
		const win = testWindow();
		if (!win.error) return win;
		if (Date.now() - t0 > timeout) return win;
		await new Promise((r) => setTimeout(r, 250));
	}
}

export async function prepare(b = BOUNDS) {
	const win = await waitForWindow();
	if (win.error) return win;
	try {
		if (!isFloating(win.id)) i3(win.id, "floating enable");
		i3(win.id, `resize set ${b.w} ${b.h}, move position ${b.x} ${b.y}, focus`);
	} catch (e) {
		return { error: "i3-msg failed: " + String(e) };
	}
	const now = testWindow();
	return {
		want: `${b.w}x${b.h}+${b.x},${b.y}`,
		got: `${now.w}x${now.h}+${now.x},${now.y}`,
		floating: floatingState(win.id),
	};
}

export function start(name) {
	const win = testWindow();
	if (win.error) return null;

	mkdirSync(OUT, { recursive: true });
	const w = win.w - (win.w % 2);
	const h = win.h - (win.h % 2);
	const file = path.join(OUT, name.replace(/[^\w.-]+/g, "_").slice(0, 90) + ".mp4");
	proc = spawn(
		"ffmpeg",
		["-y", "-loglevel", "error", "-f", "x11grab", "-framerate", "30",
		 "-video_size", `${w}x${h}`,
		 "-i", `${process.env.DISPLAY || ":0"}+${win.x},${win.y}`,
		 "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", file],
		{ stdio: ["pipe", "ignore", "pipe"] },
	);
	proc.file = file;
	return file;
}

export async function ready(timeout = 5000) {
	if (!proc) return;
	const f = proc.file;
	const t0 = Date.now();
	let last = -1;
	while (Date.now() - t0 < timeout) {
		const size = existsSync(f) ? statSync(f).size : 0;
		if (size > 0 && size === last) return;
		last = size;
		await new Promise((r) => setTimeout(r, 120));
	}
}

export async function stop() {
	if (!proc) return null;
	const p = proc;
	const file = proc.file;
	proc = null;
	try {
		p.stdin.write("q");
		p.stdin.end();
	} catch {}
	await new Promise((res) => {
		let done = false;
		const finish = () => {
			if (!done) {
				done = true;
				res();
			}
		};
		p.on("close", finish);
		setTimeout(() => {
			try {
				p.kill("SIGINT");
			} catch {}
			finish();
		}, 6000);
	});
	return file;
}
