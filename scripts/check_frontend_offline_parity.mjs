#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

function parseArgs(argv) {
  const args = {};
  for (const arg of argv) {
    if (!arg.startsWith('--')) continue;
    const [k, v] = arg.slice(2).split('=');
    args[k] = v ?? 'true';
  }
  return args;
}

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

function normalizeSet(values) {
  return new Set((values || []).map((v) => String(v).trim()).filter(Boolean));
}

function sorted(values) {
  return [...values].sort((a, b) => a.localeCompare(b));
}

function difference(a, b) {
  const out = new Set();
  for (const item of a) {
    if (!b.has(item)) out.add(item);
  }
  return out;
}

function collectFilesRecursive(baseDir) {
  const files = [];
  if (!fs.existsSync(baseDir)) return files;
  const stack = [baseDir];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.isFile()) {
        files.push(full);
      }
    }
  }
  return files;
}

function readAllowlist(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs
    .readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
}

function scanFossOfflinePolicy(fossRoot, errors) {
  const srcRoot = path.join(fossRoot, 'frontend_app', 'src');
  const allowlistPath = path.join(fossRoot, 'frontend_app', 'offline_scan_allowlist.txt');
  const allowlist = readAllowlist(allowlistPath);

  const patterns = [
    {
      name: 'fetch-absolute-url',
      regex: /\bfetch\s*\(\s*['"`]\s*(https?:\/\/|wss?:\/\/)/
    },
    {
      name: 'axios-absolute-url',
      regex: /\baxios\s*\.\s*(get|post|put|delete|patch|request)\s*\(\s*['"`]\s*(https?:\/\/|wss?:\/\/)/
    },
    {
      name: 'websocket-absolute-url',
      regex: /\bnew\s+WebSocket\s*\(\s*['"`]\s*(wss?:\/\/|https?:\/\/)/
    },
    { name: 'beacon-telemetry', regex: /navigator\.sendBeacon\s*\(/ },
    { name: 'analytics-keywords', regex: /\b(segment|mixpanel|amplitude|posthog|google-analytics|gtag|matomo)\b/i },
    { name: 'sentry-init', regex: /Sentry\.init\s*\(/ }
  ];

  const files = collectFilesRecursive(srcRoot)
    .filter((f) => /\.(ts|tsx|js|jsx)$/.test(f))
    .filter((f) => !f.endsWith('.d.ts'));

  for (const file of files) {
    const rel = path.relative(srcRoot, file).replace(/\\/g, '/');
    if (allowlist.some((prefix) => rel.startsWith(prefix))) continue;

    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
    lines.forEach((line, idx) => {
      for (const pattern of patterns) {
        if (pattern.regex.test(line)) {
          errors.push(
            `FOSS offline policy violation [${pattern.name}] in frontend_app/src/${rel}:${idx + 1}`
          );
        }
      }
    });
  }
}

function compareContractKey(key, fossContract, serverContract, strict, errors) {
  const fossSet = normalizeSet(fossContract[key]);
  const serverSet = normalizeSet(serverContract[key]);

  const missingInServer = difference(fossSet, serverSet);
  if (missingInServer.size > 0) {
    errors.push(
      `Server missing ${key}: ${sorted(missingInServer).join(', ')}`
    );
  }

  if (strict) {
    const missingInFoss = difference(serverSet, fossSet);
    if (missingInFoss.size > 0) {
      errors.push(
        `FOSS missing ${key}: ${sorted(missingInFoss).join(', ')}`
      );
    }
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const thisFile = fileURLToPath(import.meta.url);
  const repoRoot = path.resolve(path.dirname(thisFile), '..');

  const defaultFoss = path.resolve(repoRoot, '..', 'mindmapvault-foss');
  const defaultServer = path.resolve(repoRoot, '..', 'mindmapvault-server');

  const fossRoot = path.resolve(args['foss-root'] || defaultFoss);
  const serverRoot = path.resolve(args['server-root'] || defaultServer);
  const strict = args['strict'] !== 'false';
  const scanFoss = args['scan-foss'] !== 'false';
  const scanResidue = args['scan-residue'] !== 'false';

  const fossContractPath = path.join(fossRoot, 'frontend_app', 'offline_capability_contract.json');
  const serverContractPath = path.join(serverRoot, 'frontend_app', 'offline_capability_contract.json');

  const errors = [];

  if (!fs.existsSync(fossContractPath)) {
    errors.push(`Missing contract file: ${fossContractPath}`);
  }

  const serverContractAvailable = fs.existsSync(serverContractPath);

  if (!serverContractAvailable) {
    console.warn(`Note: server contract not found at ${serverContractPath} — skipping cross-repo comparison.`);
  }

  if (errors.length === 0) {
    const fossContract = readJson(fossContractPath);

    if (serverContractAvailable) {
      const serverContract = readJson(serverContractPath);

      if (fossContract.schemaVersion !== serverContract.schemaVersion) {
        errors.push(
          `schemaVersion mismatch: FOSS=${fossContract.schemaVersion} Server=${serverContract.schemaVersion}`
        );
      }

      compareContractKey('offlineCoreCapabilities', fossContract, serverContract, strict, errors);
      compareContractKey('localOnlyGuarantees', fossContract, serverContract, strict, errors);
      compareContractKey('mustNotRequireServer', fossContract, serverContract, strict, errors);
    }

    if (scanFoss) {
      scanFossOfflinePolicy(fossRoot, errors);
    }

    if (scanResidue) {
      const residueScript = path.join(fossRoot, 'scripts', 'check_foss_saas_residue.mjs');
      if (!fs.existsSync(residueScript)) {
        errors.push(`Missing residue checker: ${residueScript}`);
      } else {
        const result = spawnSync(process.execPath, [residueScript], {
          cwd: fossRoot,
          encoding: 'utf8',
        });
        if (result.status !== 0) {
          const output = `${result.stdout || ''}${result.stderr || ''}`.trim();
          errors.push(output || 'FOSS SaaS residue check failed');
        }
      }
    }
  }

  if (errors.length > 0) {
    console.error('Offline parity check failed:');
    for (const e of errors) {
      console.error(`- ${e}`);
    }
    process.exit(1);
  }

  console.log('Offline parity check passed.');
}

main();
