export type ListKind = "task" | "bullet" | "ordered";

export interface LineInfo {
	kind: ListKind;
	indent: number;
	rawMarker: string;
	orderedNum?: number;
	orderedSep?: "." | ")";
}

export interface Item {
	startLine: number;
	endLine: number;
}

export interface Group {
	kind: ListKind;
	indent: number;
	items: Item[];
}

const TASK_RE = /^(\s*)([-*+])\s+\[[^\]]\]\s/;
const BULLET_RE = /^(\s*)([-*+])\s+(?!\[[^\]]\]\s)/;
const ORDERED_RE = /^(\s*)(\d+)([.)])\s+/;

export function parseLine(line: string): LineInfo | null {
	const t = TASK_RE.exec(line);
	if (t) {
		return {
			kind: "task",
			indent: t[1]!.length,
			rawMarker: t[2]!,
		};
	}
	const o = ORDERED_RE.exec(line);
	if (o) {
		return {
			kind: "ordered",
			indent: o[1]!.length,
			rawMarker: o[2]! + o[3]!,
			orderedNum: parseInt(o[2]!, 10),
			orderedSep: o[3]! as "." | ")",
		};
	}
	const b = BULLET_RE.exec(line);
	if (b) {
		return {
			kind: "bullet",
			indent: b[1]!.length,
			rawMarker: b[2]!,
		};
	}
	return null;
}

function isBlank(line: string): boolean {
	return /^\s*$/.test(line);
}

function leadingWs(line: string): number {
	const m = /^\s*/.exec(line);
	return m ? m[0].length : 0;
}

export function findGroup(lines: string[], anchorLine: number): Group | null {
	const anchor = lines[anchorLine];
	if (anchor === undefined) return null;
	const anchorInfo = parseLine(anchor);
	if (!anchorInfo) return null;

	const matches = (info: LineInfo | null): boolean =>
		!!info &&
		info.kind === anchorInfo.kind &&
		info.indent === anchorInfo.indent;

	const starts: number[] = [anchorLine];

	let i = anchorLine - 1;
	while (i >= 0) {
		const ln = lines[i]!;
		if (isBlank(ln)) {
			i--;
			continue;
		}
		const info = parseLine(ln);
		if (matches(info)) {
			starts.unshift(i);
			i--;
			continue;
		}
		if (info && info.indent > anchorInfo.indent) {
			i--;
			continue;
		}
		const lws = leadingWs(ln);
		if (!info && lws > anchorInfo.indent) {
			i--;
			continue;
		}
		break;
	}

	i = anchorLine + 1;
	while (i < lines.length) {
		const ln = lines[i]!;
		if (isBlank(ln)) {
			i++;
			continue;
		}
		const info = parseLine(ln);
		if (matches(info)) {
			starts.push(i);
			i++;
			continue;
		}
		if (info && info.indent > anchorInfo.indent) {
			i++;
			continue;
		}
		const lws = leadingWs(ln);
		if (!info && lws > anchorInfo.indent) {
			i++;
			continue;
		}
		break;
	}

	const items: Item[] = starts.map((s, idx) => {
		const next = starts[idx + 1];
		if (next !== undefined) {
			return { startLine: s, endLine: next - 1 };
		}
		const hardEnd = lines.length - 1;
		let end = s;
		for (let j = s + 1; j <= hardEnd; j++) {
			const ln = lines[j]!;
			if (isBlank(ln)) continue;
			const info = parseLine(ln);
			const indent = info ? info.indent : leadingWs(ln);
			if (indent > anchorInfo.indent) {
				end = j;
			} else {
				break;
			}
		}
		return { startLine: s, endLine: end };
	});

	return {
		kind: anchorInfo.kind,
		indent: anchorInfo.indent,
		items,
	};
}

export function findAllGroups(lines: string[]): Group[] {
	const groups: Group[] = [];
	const seen = new Set<number>();

	for (let i = 0; i < lines.length; i++) {
		if (!parseLine(lines[i]!)) continue;
		if (seen.has(i)) continue;

		const group = findGroup(lines, i);
		if (group) {
			groups.push(group);
			for (const item of group.items) {
				seen.add(item.startLine);
			}
		}
	}
	return groups;
}
