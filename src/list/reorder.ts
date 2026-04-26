import { Group, parseLine } from "./parse";

export interface MoveResult {
	text: string;
	newOrder: number[];
}

export function moveItem(
	text: string,
	group: Group,
	fromIdx: number,
	toIdx: number,
): MoveResult | null {
	if (fromIdx < 0 || fromIdx >= group.items.length) return null;
	if (toIdx < 0 || toIdx > group.items.length) return null;
	if (toIdx === fromIdx || toIdx === fromIdx + 1) {
		return { text, newOrder: group.items.map((_, i) => i) };
	}

	const lines = text.split("\n");
	const blocks: string[][] = group.items.map((it) =>
		lines.slice(it.startLine, it.endLine + 1),
	);

	const order: number[] = group.items.map((_, i) => i);
	const [moved] = order.splice(fromIdx, 1);
	const adjusted = toIdx > fromIdx ? toIdx - 1 : toIdx;
	order.splice(adjusted, 0, moved!);

	const reorderedBlocks = order.map((i) => blocks[i]!);

	if (group.kind === "ordered") {
		for (let i = 0; i < reorderedBlocks.length; i++) {
			const block = reorderedBlocks[i]!;
			const head = block[0]!;
			const info = parseLine(head);
			if (info && info.kind === "ordered") {
				const indent = head.slice(0, info.indent);
				const sep = info.orderedSep ?? ".";
				const rest = head.replace(/^\s*\d+[.)]\s/, "");
				block[0] = `${indent}${i + 1}${sep} ${rest}`;
			}
		}
	}

	const groupStart = group.items[0]!.startLine;
	const groupEnd = group.items[group.items.length - 1]!.endLine;

	const flat: string[] = [];
	for (let i = 0; i < reorderedBlocks.length; i++) {
		flat.push(...reorderedBlocks[i]!);
	}

	const before = lines.slice(0, groupStart);
	const after = lines.slice(groupEnd + 1);
	const newLines = [...before, ...flat, ...after];
	return { text: newLines.join("\n"), newOrder: order };
}
