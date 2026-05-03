#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const thisFile = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(thisFile), '..');
const srcRoot = path.join(repoRoot, 'frontend_app', 'src');

const errors = [];

function collectFiles(baseDir) {
  const out = [];
  const stack = [baseDir];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      if (entry.isFile() && /\.(ts|tsx|js|jsx)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) out.push(full);
    }
  }
  return out;
}

function rel(file) {
  return path.relative(repoRoot, file).replace(/\\/g, '/');
}

for (const file of collectFiles(srcRoot)) {
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/);

  lines.forEach((line, index) => {
    const at = `${rel(file)}:${index + 1}`;

    if (/\bfetch\s*\(/.test(line) && /\/api\b|auth\/refresh|mindmaps\//.test(line)) {
      errors.push(`Server HTTP pattern in FOSS source at ${at}`);
    }

    if (/\baxios\s*\./.test(line)) {
      errors.push(`Axios usage detected in FOSS source at ${at}`);
    }

    if (/\bnew\s+WebSocket\s*\(/.test(line)) {
      errors.push(`WebSocket usage detected in FOSS source at ${at}`);
    }

    if (/subscription|checkout|billing/i.test(line)) {
      errors.push(`SaaS billing wording detected in FOSS source at ${at}`);
    }
  });
}

if (errors.length) {
  console.error('FOSS SaaS residue check failed:');
  for (const err of errors) console.error(`- ${err}`);
  process.exit(1);
}

console.log('FOSS SaaS residue check passed.');
