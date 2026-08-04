/**
 * Maps a 0-based line index through a block move (remove srcLen lines at
 * srcStart, insert them so the block's first line lands at destStart, where
 * destStart is an index in the post-removal — i.e. final — line array).
 */
export function remapLineAfterMove(
	line: number,
	srcStart: number,
	srcLen: number,
	destStart: number,
): number {
	if (line >= srcStart && line < srcStart + srcLen) {
		return destStart + (line - srcStart);
	}
	const afterRemoval = line >= srcStart + srcLen ? line - srcLen : line;
	return afterRemoval >= destStart ? afterRemoval + srcLen : afterRemoval;
}
