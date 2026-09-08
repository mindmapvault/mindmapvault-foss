#!/usr/bin/env node
/**
 * Release gate: mind map import/export round-trip fidelity.
 *
 * A user review put it plainly: "Exporting a mindmap and then re-importing it
 * loses all formatting." This script exists so that class of bug cannot ship
 * again. It runs the round-trip suite, which exports a fixture tree that sets
 * every field the editor supports, re-imports it through each format, and
 * diffs the result against what that format declares it can carry.
 *
 * Run from the repository root:
 *
 *   node scripts/check_import_export_roundtrip.mjs
 *
 * It runs two suites:
 *   - roundTrip.test.ts — our export → our import keeps every claimed field.
 *   - compat.test.ts    — files written by the real FreeMind / FreePlane /
 *                         WiseMapping / XMind / Obsidian applications import
 *                         correctly (the files a user actually has).
 *
 * Exit code 0 means every format round-trips everything its fidelity mask
 * claims and every real-world fixture parses. Non-zero means a regression —
 * block the release and either fix the format or narrow its mask.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const frontendDir = path.join(repoRoot, 'frontend_app');

// pnpm is the workspace package manager. In CI it is on PATH (via
// pnpm/action-setup); on a local Windows machine without an admin shell the
// shim may be absent, so fall back to corepack with the pinned version.
const isWin = process.platform === 'win32';
const hasPnpm = spawnSync(isWin ? 'pnpm.cmd' : 'pnpm', ['--version'], {
  stdio: 'ignore', shell: false, windowsHide: true,
}).status === 0;

const testArgs = [
  // Round-trip: our export → our import keeps every claimed field.
  'src/utils/__tests__/roundTrip.test.ts',
  // Compatibility: real source-software files import correctly.
  'src/utils/__tests__/compat.test.ts',
];

const [cmd, args] = hasPnpm
  ? [isWin ? 'pnpm.cmd' : 'pnpm', ['exec', 'vitest', 'run', ...testArgs]]
  : isWin
    ? ['cmd.exe', ['/d', '/s', '/c', `corepack pnpm@10.17.1 exec vitest run ${testArgs.join(' ')}`]]
    : ['corepack', ['pnpm@10.17.1', 'exec', 'vitest', 'run', ...testArgs]];

const result = spawnSync(
  cmd,
  args,
  { cwd: frontendDir, stdio: 'inherit', shell: false, windowsHide: true },
);

if (result.error) {
  console.error('[roundtrip] failed to launch vitest:', result.error.message);
  process.exit(1);
}

if (result.status !== 0) {
  console.error('\n[roundtrip] FAIL — import/export round-trip regression. See the diff above.');
  process.exit(result.status ?? 1);
}

console.log('\n[roundtrip] OK — every format round-trips the fields it claims to carry.');
