#!/usr/bin/env node
// Build a .mcpb bundle for Claude Desktop. Stages a minimal copy of the
// project, installs production-only deps into it, then runs `mcpb pack`.
// Cross-platform: pure Node, no shell-specific commands.

import { rm, mkdir, cp, copyFile, readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const staging = path.join(root, "dist-pack");
const output = path.join(root, `${pkg.name}-${pkg.version}.mcpb`);

function run(cmd, args, opts = {}) {
	const r = spawnSync(cmd, args, { stdio: "inherit", shell: true, ...opts });
	if (r.status !== 0) {
		console.error(`\nCommand failed: ${cmd} ${args.join(" ")}`);
		process.exit(r.status ?? 1);
	}
}

console.log("Compiling TypeScript...");
run("npm", ["run", "build"], { cwd: root });

console.log(`Staging at ${path.relative(root, staging)}...`);
await rm(staging, { recursive: true, force: true });
await mkdir(staging, { recursive: true });

await cp(path.join(root, "build"), path.join(staging, "build"), { recursive: true });
await copyFile(path.join(root, "manifest.json"), path.join(staging, "manifest.json"));
await copyFile(path.join(root, "package.json"), path.join(staging, "package.json"));
await copyFile(path.join(root, "package-lock.json"), path.join(staging, "package-lock.json"));
await copyFile(path.join(root, "README.md"), path.join(staging, "README.md"));

console.log("Installing production dependencies...");
run(
	"npm",
	[
		"install",
		"--omit=dev",
		"--omit=optional",
		"--ignore-scripts",
		"--no-audit",
		"--no-fund",
	],
	{ cwd: staging },
);

console.log(`Packing to ${path.relative(root, output)}...`);
await rm(output, { force: true });
run("npx", ["--yes", "@anthropic-ai/mcpb", "pack", staging, output]);

console.log("Cleaning staging directory...");
await rm(staging, { recursive: true, force: true });

console.log(`\nBundle: ${path.relative(root, output)}`);
