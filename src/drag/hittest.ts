export interface HitTarget {
	groupSlotIdx: number;
	itemIdx: number;
}

export interface DropEntry {
	groupSlotIdx: number;
	itemIdx: number;
	top: number;
	lineBottom: number;
	bottom: number;
	left: number;
	right: number;
}

export function hitTest(
	entries: DropEntry[],
	x: number,
	y: number,
	slack = 24,
): HitTarget | null {
	if (entries.length === 0) return null;
	const first = entries[0]!;
	const last = entries[entries.length - 1]!;
	const minLeft = Math.min(...entries.map((e) => e.left)) - slack;
	const maxRight = Math.max(...entries.map((e) => e.right)) + slack;
	if (x < minLeft || x > maxRight) return null;
	if (y < first.top - slack) return null;
	if (y > last.bottom + slack) return null;

	if (y <= first.top) {
		return { groupSlotIdx: first.groupSlotIdx, itemIdx: first.itemIdx };
	}
	if (y >= last.bottom) {
		return { groupSlotIdx: last.groupSlotIdx, itemIdx: last.itemIdx + 1 };
	}

	for (let i = 0; i < entries.length; i++) {
		const e = entries[i]!;
		const mid = e.top + (e.lineBottom - e.top) / 2;
		if (y < mid) {
			return { groupSlotIdx: e.groupSlotIdx, itemIdx: e.itemIdx };
		}
		if (y <= e.bottom) {
			return { groupSlotIdx: e.groupSlotIdx, itemIdx: e.itemIdx + 1 };
		}
		const next = entries[i + 1];
		if (!next) {
			return { groupSlotIdx: e.groupSlotIdx, itemIdx: e.itemIdx + 1 };
		}
		if (y < next.top) {
			const gapMid = (e.bottom + next.top) / 2;
			if (y < gapMid) {
				return { groupSlotIdx: e.groupSlotIdx, itemIdx: e.itemIdx + 1 };
			}
			return { groupSlotIdx: next.groupSlotIdx, itemIdx: next.itemIdx };
		}
	}
	const lastEntry = entries[entries.length - 1]!;
	return { groupSlotIdx: lastEntry.groupSlotIdx, itemIdx: lastEntry.itemIdx + 1 };
}