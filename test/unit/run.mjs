import { build } from "esbuild";
import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = mkdtempSync(path.join(tmpdir(), "dli-unit-"));
const files = readdirSync(here).filter((f) => f.endsWith(".test.ts"));

const bundled = [];
for (const f of files) {
	const out = path.join(outDir, f.replace(/\.ts$/, ".mjs"));
	await build({
		entryPoints: [path.join(here, f)],
		bundle: true,
		platform: "node",
		format: "esm",
		outfile: out,
	});
	bundled.push(out);
}

execFileSync(process.execPath, ["--test", ...bundled], { stdio: "inherit" });