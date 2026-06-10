import { Group, parseLine, findAllGroups } from "./parse";

export interface MoveResult {
	text: string;
	newOrder: number[];
}

export function moveItemCrossGroup(
	text: string,
	fromGroup: Group,
	fromIdx: number,
	toGroup: Group,
	toIdx: number,
): string | null {
	if (fromIdx < 0 || fromIdx >= fromGroup.items.length) return null;
	if (toIdx < 0 || toIdx > toGroup.items.length) return null;

	if (fromGroup === toGroup) {
		const result = moveItem(text, fromGroup, fromIdx, toIdx);
		return result ? result.text : null;
	}

	const lines = text.split("\n");
	const fromItem = fromGroup.items[fromIdx]!;
	const sourceStart = fromItem.startLine;
	const sourceEnd = fromItem.endLine;
	const sourceLen = sourceEnd - sourceStart + 1;

	const sourceBlock = lines.splice(sourceStart, sourceLen);

	if (fromGroup.kind !== toGroup.kind) {
		adjustBlockToGroup(sourceBlock, toGroup);
	}

	const targetStart = toGroup.items[0]!.startLine;
	const shift = sourceStart < targetStart ? sourceLen : 0;
	let insertAt = targetStart - shift;
	for (let i = 0; i < toIdx; i++) {
		const item = toGroup.items[i]!;
		insertAt += item.endLine - item.startLine + 1;
	}

	lines.splice(insertAt, 0, ...sourceBlock);

	let result = lines.join("\n");
	if (fromGroup.kind === "ordered" || toGroup.kind === "ordered") {
		result = renumberOrderedInText(result);
	}
	return result;
}

export function extractItemFromText(
	text: string,
	group: Group,
	fromIdx: number,
): { text: string; block: string[] } | null {
	if (fromIdx < 0 || fromIdx >= group.items.length) return null;
	const lines = text.split("\n");
	const item = group.items[fromIdx]!;
	const start = item.startLine;
	const end = item.endLine;
	const block = lines.splice(start, end - start + 1);
	return { text: lines.join("\n"), block };
}

export function insertItemIntoText(
	text: string,
	block: string[],
	sourceKind: import("./parse").ListKind,
	toGroup: Group,
	toIdx: number,
): string | null {
	if (toIdx < 0 || toIdx > toGroup.items.length) return null;
	const lines = text.split("\n");
	if (sourceKind !== toGroup.kind) {
		adjustBlockToGroup(block, toGroup);
	}
	const targetStart = toGroup.items[0]!.startLine;
	let insertAt = targetStart;
	for (let i = 0; i < toIdx; i++) {
		const item = toGroup.items[i]!;
		insertAt += item.endLine - item.startLine + 1;
	}
	lines.splice(insertAt, 0, ...block);
	let result = lines.join("\n");
	if (toGroup.kind === "ordered") {
		result = renumberOrderedInText(result);
	}
	return result;
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

function adjustBlockToGroup(block: string[], toGroup: Group): void {
	if (block.length === 0) return;
	const head = block[0]!;
	const headInfo = parseLine(head);
	if (!headInfo) return;

	const indent = toGroup.indent;
	const indentStr = " ".repeat(indent);

	let content: string;
	if (headInfo.kind === "task") {
		content = head.replace(/^\s*[-*+]\s+\[[^\]]\]\s/, "");
	} else if (headInfo.kind === "ordered") {
		content = head.replace(/^\s*\d+[.)]\s/, "");
	} else {
		content = head.replace(/^\s*[-*+]\s+/, "");
	}

	if (toGroup.kind === "task") {
		block[0] = `${indentStr}- [ ] ${content}`;
	} else if (toGroup.kind === "ordered") {
		block[0] = `${indentStr}1. ${content}`;
	} else {
		block[0] = `${indentStr}- ${content}`;
	}

	if (indent !== headInfo.indent) {
		const delta = indent - headInfo.indent;
		for (let i = 1; i < block.length; i++) {
			const line = block[i]!;
			if (line.trim() === "") continue;
			const li = parseLine(line);
			if (li) {
				const newIndent = Math.max(0, li.indent + delta);
				block[i] = " ".repeat(newIndent) + line.slice(li.indent);
			} else {
				const ws = /^\s*/.exec(line)?.[0].length ?? 0;
				const newWs = Math.max(0, ws + delta);
				block[i] = " ".repeat(newWs) + line.slice(ws);
			}
		}
	}
}

function renumberOrderedInText(text: string): string {
	const lines = text.split("\n");
	const groups = findAllGroups(lines);
	for (const group of groups) {
		if (group.kind !== "ordered") continue;
		for (let i = 0; i < group.items.length; i++) {
			const item = group.items[i]!;
			const lineIdx = item.startLine;
			const line = lines[lineIdx]!;
			const info = parseLine(line);
			if (info && info.kind === "ordered") {
				const sep = info.orderedSep ?? ".";
				const rest = line.replace(/^\s*\d+[.)]\s/, "");
				lines[lineIdx] =
					`${" ".repeat(info.indent)}${i + 1}${sep} ${rest}`;
			}
		}
	}
	return lines.join("\n");
}
