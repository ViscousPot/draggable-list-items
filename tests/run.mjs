// Invariant tests for the pure list/reorder + fold-remap logic.
// Run from the repo root: node tests/run.mjs
import { buildSync } from "esbuild";
import { strict as assert } from "node:assert";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
buildSync({
	entryPoints: [path.join(here, "entry.ts")],
	bundle: true,
	format: "esm",
	outfile: path.join(here, ".build", "entry.mjs"),
	logLevel: "silent",
});
const lib = await import("./.build/entry.mjs");

let pass = 0;
let fail = 0;
function test(name, fn) {
	try {
		fn();
		pass++;
	} catch (e) {
		fail++;
		console.error(`FAIL: ${name}\n  ${e.message}`);
	}
}

// Oracle: the move as a literal array splice. Returns old-index -> new-index map.
function spliceMap(N, s, len, d) {
	const arr = Array.from({ length: N }, (_, i) => i);
	const block = arr.splice(s, len);
	arr.splice(d, 0, ...block);
	const map = new Array(N);
	arr.forEach((old, idx) => {
		map[old] = idx;
	});
	return map;
}
function spliceLines(lines, s, len, d) {
	const arr = lines.slice();
	const block = arr.splice(s, len);
	arr.splice(d, 0, ...block);
	return arr;
}

// 1. remapLineAfterMove: exhaustive against the splice oracle for small N.
test("remapLineAfterMove matches splice oracle exhaustively (N<=12)", () => {
	for (let N = 1; N <= 12; N++) {
		for (let s = 0; s < N; s++) {
			for (let len = 1; s + len <= N; len++) {
				for (let d = 0; d <= N - len; d++) {
					const map = spliceMap(N, s, len, d);
					for (let i = 0; i < N; i++) {
						const got = lib.remapLineAfterMove(i, s, len, d);
						assert.equal(
							got,
							map[i],
							`N=${N} s=${s} len=${len} d=${d} line=${i}: got ${got}, want ${map[i]}`,
						);
					}
				}
			}
		}
	}
});

const TASKS = [
	"- [ ] A",
	"    - [ ] A1",
	"    - [ ] A2",
	"- [ ] B",
	"- [ ] C",
	"    - [ ] C1",
].join("\n");

function topGroup(text) {
	const groups = lib.findAllGroups(text.split("\n"));
	const g = groups.find((g) => g.indent === 0);
	assert.ok(g, "top-level group exists");
	return g;
}

// 2. moveItem: srcStart/srcLen/destStart identify the moved block in the new text.
test("moveItem down: destStart slice equals moved block", () => {
	const g = topGroup(TASKS);
	const r = lib.moveItem(TASKS, g, 0, 2); // move A (+children) before C
	assert.ok(r);
	assert.equal(r.srcStart, 0);
	assert.equal(r.srcLen, 3);
	assert.equal(r.destStart, 1);
	const lines = r.text.split("\n");
	assert.deepEqual(lines.slice(r.destStart, r.destStart + r.srcLen), [
		"- [ ] A",
		"    - [ ] A1",
		"    - [ ] A2",
	]);
	assert.equal(
		r.text,
		spliceLines(TASKS.split("\n"), r.srcStart, r.srcLen, r.destStart).join("\n"),
	);
});

test("moveItem to end: destStart correct", () => {
	const g = topGroup(TASKS);
	const r = lib.moveItem(TASKS, g, 0, 3); // move A after C
	assert.ok(r);
	assert.equal(r.srcStart, 0);
	assert.equal(r.srcLen, 3);
	assert.equal(r.destStart, 3);
	assert.equal(
		r.text,
		spliceLines(TASKS.split("\n"), 0, 3, 3).join("\n"),
	);
});

test("moveItem up: destStart correct", () => {
	const g = topGroup(TASKS);
	const r = lib.moveItem(TASKS, g, 2, 0); // move C (+C1) to top
	assert.ok(r);
	assert.equal(r.srcStart, 4);
	assert.equal(r.srcLen, 2);
	assert.equal(r.destStart, 0);
	assert.equal(
		r.text,
		spliceLines(TASKS.split("\n"), 4, 2, 0).join("\n"),
	);
});

test("moveItem no-op: text unchanged, destStart === srcStart", () => {
	const g = topGroup(TASKS);
	for (const toIdx of [0, 1]) {
		const r = lib.moveItem(TASKS, g, 0, toIdx);
		assert.ok(r);
		assert.equal(r.text, TASKS);
		assert.equal(r.destStart, r.srcStart);
	}
});

const TWO_LISTS = [
	"- [ ] A",
	"    - [ ] A1",
	"- [ ] B",
	"",
	"Some text",
	"",
	"- [ ] X",
	"- [ ] Y",
].join("\n");

function groupContaining(text, startLine) {
	const groups = lib.findAllGroups(text.split("\n"));
	const g = groups.find((g) => g.items.some((it) => it.startLine === startLine));
	assert.ok(g, `group containing line ${startLine}`);
	return g;
}

// 3. moveItemCrossGroup between separate groups, both directions.
test("moveItemCrossGroup downward: destStart slice equals moved block", () => {
	const from = groupContaining(TWO_LISTS, 0); // [A,B]
	const to = groupContaining(TWO_LISTS, 6); // [X,Y]
	const r = lib.moveItemCrossGroup(TWO_LISTS, from, 0, to, 1); // A(+A1) between X and Y
	assert.ok(r);
	assert.equal(r.srcStart, 0);
	assert.equal(r.srcLen, 2);
	assert.equal(r.destStart, 5);
	const lines = r.text.split("\n");
	assert.deepEqual(lines.slice(5, 7), ["- [ ] A", "    - [ ] A1"]);
	assert.equal(
		r.text,
		spliceLines(TWO_LISTS.split("\n"), 0, 2, 5).join("\n"),
	);
});

test("moveItemCrossGroup upward: destStart correct", () => {
	const from = groupContaining(TWO_LISTS, 6); // [X,Y]
	const to = groupContaining(TWO_LISTS, 0); // [A,B]
	const r = lib.moveItemCrossGroup(TWO_LISTS, from, 0, to, 0); // X to very top
	assert.ok(r);
	assert.equal(r.srcStart, 6);
	assert.equal(r.srcLen, 1);
	assert.equal(r.destStart, 0);
	assert.equal(
		r.text,
		spliceLines(TWO_LISTS.split("\n"), 6, 1, 0).join("\n"),
	);
});

test("moveItemCrossGroup same-group delegates and matches oracle", () => {
	const g = topGroup(TASKS);
	const r = lib.moveItemCrossGroup(TASKS, g, 0, g, 2);
	assert.ok(r);
	assert.equal(r.destStart, 1);
	assert.equal(
		r.text,
		spliceLines(TASKS.split("\n"), r.srcStart, r.srcLen, r.destStart).join("\n"),
	);
});

// 4. insertItemIntoText returns insertAt where the block head lands.
test("insertItemIntoText: insertAt slice equals block", () => {
	const to = groupContaining(TWO_LISTS, 6); // [X,Y]
	const block = ["- [ ] Z", "    - [ ] Z1"];
	const r = lib.insertItemIntoText(TWO_LISTS, block.slice(), "task", to, 2);
	assert.ok(r);
	assert.equal(r.insertAt, 8);
	const lines = r.text.split("\n");
	assert.deepEqual(lines.slice(8, 10), block);
});

// 5. Line-count invariance under kind conversion + ordered renumbering.
const MIXED = [
	"- [ ] A",
	"    - [ ] A1",
	"",
	"1. one",
	"2. two",
	"3. three",
].join("\n");

test("kind conversion preserves line count and destStart identifies block", () => {
	const from = groupContaining(MIXED, 0); // task group [A]
	const to = groupContaining(MIXED, 3); // ordered group
	const r = lib.moveItemCrossGroup(MIXED, from, 0, to, 1); // task A -> ordered, after "one"
	assert.ok(r);
	const lines = r.text.split("\n");
	assert.equal(lines.length, MIXED.split("\n").length, "line count preserved");
	assert.equal(r.srcLen, 2);
	const head = lines[r.destStart];
	assert.match(head, /^\d+[.)] A$/, `converted head, got: ${head}`);
	// renumbering: ordered group is 1..4 in order
	const nums = lines
		.filter((l) => /^\d+[.)] /.test(l))
		.map((l) => parseInt(l, 10));
	assert.deepEqual(nums, [1, 2, 3, 4]);
});

// 6. hitTest gap-splitting and real-index mapping (fake geometry).
function fakeEl(top, bottom) {
	return {
		getBoundingClientRect: () => ({
			top,
			bottom,
			left: 100,
			right: 500,
			width: 400,
			height: bottom - top,
		}),
	};
}
function fakeRect(top, h) {
	return {
		top,
		bottom: top + h,
		left: 100,
		right: 500,
		width: 400,
		height: h,
	};
}

const gA = { kind: "task", indent: 0, items: [{}, {}, {}] };
const gB = { kind: "task", indent: 0, items: [{}, {}] };
const gC = { kind: "task", indent: 4, items: [{}] };
// A: items at y 0/24/48; item 2 has a subtree reaching y=120.
// (gap holding a header) B: items at y 200/224. C: nested, y 400.
const slots = [
	{
		group: gA,
		groupEls: [
			[fakeEl(0, 24)],
			[fakeEl(24, 48)],
			[fakeEl(48, 72), fakeEl(72, 96), fakeEl(96, 120)],
		],
		itemRects: [fakeRect(0, 24), fakeRect(24, 24), fakeRect(48, 24)],
		itemIdxs: [0, 1, 2],
		itemExtents: [24, 48, 120],
	},
	{
		group: gB,
		groupEls: [[fakeEl(200, 224)], [fakeEl(224, 248)]],
		itemRects: [fakeRect(200, 24), fakeRect(224, 24)],
		itemIdxs: [0, 1],
		itemExtents: [224, 248],
	},
	{
		group: gC,
		groupEls: [[fakeEl(400, 424)]],
		itemRects: [fakeRect(400, 24)],
		itemIdxs: [0],
		itemExtents: [424],
	},
];

test("hitTest: in-list behavior unchanged", () => {
	assert.deepEqual(lib.hitTest(slots, gA, true, 200, 5), {
		groupSlotIdx: 0,
		itemIdx: 0,
	});
	assert.deepEqual(lib.hitTest(slots, gA, true, 200, 13), {
		groupSlotIdx: 0,
		itemIdx: 1,
	});
});

test("hitTest: pointer over a subtree appends after its item", () => {
	assert.deepEqual(lib.hitTest(slots, gA, true, 200, 110), {
		groupSlotIdx: 0,
		itemIdx: 3,
	});
});

test("hitTest: header gap splits above/below", () => {
	// span between A's extent (120) and B's top (200) splits at 160
	assert.deepEqual(lib.hitTest(slots, gA, true, 200, 130), {
		groupSlotIdx: 0,
		itemIdx: 3,
	});
	assert.deepEqual(lib.hitTest(slots, gA, true, 200, 170), {
		groupSlotIdx: 1,
		itemIdx: 0,
	});
});

test("hitTest: below last item appends to last group", () => {
	assert.deepEqual(lib.hitTest(slots, gA, true, 200, 250), {
		groupSlotIdx: 1,
		itemIdx: 2,
	});
});

test("hitTest: cross-group off confines targets to the source group", () => {
	assert.equal(lib.hitTest(slots, gA, false, 200, 170), null);
	assert.deepEqual(lib.hitTest(slots, gA, false, 200, 110), {
		groupSlotIdx: 0,
		itemIdx: 3,
	});
});

test("hitTest: different-indent groups are never targets", () => {
	assert.equal(lib.hitTest(slots, gA, true, 200, 400), null);
});

test("hitTest: real item indices survive viewport-culled entries", () => {
	const gD = { kind: "task", indent: 0, items: [{}, {}, {}, {}, {}, {}] };
	const sparse = [
		{
			group: gD,
			groupEls: [[fakeEl(0, 24)], [fakeEl(24, 48)], [fakeEl(48, 72)]],
			itemRects: [fakeRect(0, 24), fakeRect(24, 24), fakeRect(48, 24)],
			itemIdxs: [0, 2, 5],
			itemExtents: [24, 48, 72],
		},
	];
	assert.deepEqual(lib.hitTest(sparse, gD, false, 200, 30), {
		groupSlotIdx: 0,
		itemIdx: 2,
	});
	assert.deepEqual(lib.hitTest(sparse, gD, false, 200, 40), {
		groupSlotIdx: 0,
		itemIdx: 3,
	});
	assert.deepEqual(lib.hitTest(sparse, gD, false, 200, 80), {
		groupSlotIdx: 0,
		itemIdx: 6,
	});
	assert.equal(lib.hitTest(sparse, gD, false, 200, 100), null);
});

test("hitTest: hidden (zero-box) entries are ignored", () => {
	const gH = { kind: "task", indent: 0, items: [{}] };
	const gV = { kind: "task", indent: 0, items: [{}, {}] };
	const zeroRect = {
		top: 0,
		bottom: 0,
		left: 0,
		right: 0,
		width: 0,
		height: 0,
	};
	const withPhantom = [
		{
			group: gH,
			groupEls: [[fakeEl(0, 0)]],
			itemRects: [zeroRect],
			itemIdxs: [0],
			itemExtents: [0],
		},
		{
			group: gV,
			groupEls: [[fakeEl(600, 624)], [fakeEl(624, 648)]],
			itemRects: [fakeRect(600, 24), fakeRect(624, 24)],
			itemIdxs: [0, 1],
			itemExtents: [624, 648],
		},
	];
	// pointer near the page top must NOT be captured by the hidden list
	assert.equal(lib.hitTest(withPhantom, gV, true, 200, 10), null);
	assert.deepEqual(lib.hitTest(withPhantom, gV, true, 200, 590), {
		groupSlotIdx: 1,
		itemIdx: 0,
	});
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
