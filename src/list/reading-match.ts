export function stripMarker(line: string): string {
	return line
		.replace(/^\s*[-*+]\s+\[[^\]]\]\s/, "")
		.replace(/^\s*\d+[.)]\s+/, "")
		.replace(/^\s*[-*+]\s+/, "");
}

export function stripMarkdown(text: string): string {
	return text
		.replace(/!\[[^\]]*\]\([^)]*\)/g, "")
		.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
		.replace(/`{1,3}[^`]*`{1,3}/g, "")
		.replace(/(\*\*|__|~~)([^*_~]+)\1/g, "$2")
		.replace(/(\*|_)([^*_]+)\1/g, "$2")
		.replace(/#+\s?/g, "")
		.trim();
}

export function itemText(line: string): string {
	return stripMarkdown(stripMarker(line));
}

export function matchLineNumbers(
	parsed: { line: number; text: string }[],
	liTexts: string[],
): (number | null)[] {
	const result: (number | null)[] = [];
	const used = new Set<number>();
	for (const liText of liTexts) {
		const norm = stripMarkdown(liText);
		let found = -1;
		for (let i = 0; i < parsed.length; i++) {
			if (used.has(i)) continue;
			if (itemText(parsed[i]!.text) === norm) {
				found = i;
				break;
			}
		}
		result.push(found >= 0 ? parsed[found]!.line : null);
		if (found >= 0) used.add(found);
	}
	return result;
}