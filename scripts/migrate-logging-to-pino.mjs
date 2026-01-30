#!/usr/bin/env node
/*
A small non-invasive codemod to help migrate `console.*` to `logger.*` in JS/TS files.
Usage: node scripts/migrate-logging-to-pino.mjs --dry-run
Options:
  --apply    Actually write files.
  --dir <path>  Directory to scan (defaults to project root)

This script is intentionally conservative: it only replaces `console.log`, `console.warn`,
`console.error`, and `console.debug` with `logger.info`, `logger.warn`, `logger.error`,
and `logger.debug` respectively. It does not add imports or attempt larger structural
changes.
*/

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const dirArgIndex = args.indexOf('--dir');
const baseDir = dirArgIndex > -1 && args[dirArgIndex + 1] ? path.resolve(args[dirArgIndex + 1]) : process.cwd();

const exts = ['.ts', '.tsx', '.js', '.jsx', '.mjs'];
const replacements = [
  [/console\.log\(/g, 'logger.info('],
  [/console\.warn\(/g, 'logger.warn('],
  [/console\.error\(/g, 'logger.error('],
  [/console\.debug\(/g, 'logger.debug('],
];

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (['node_modules', '.git', 'dist', 'build'].includes(entry.name)) continue;
      walk(p);
    } else if (entry.isFile()) {
      if (!exts.includes(path.extname(entry.name))) continue;
      processFile(p);
    }
  }
}

function processFile(filePath) {
  const src = fs.readFileSync(filePath, 'utf8');
  let out = src;
  for (const [re, sub] of replacements) out = out.replace(re, sub);
  if (out !== src) {
    logger.info((apply ? '[APPLY]' : '[DRY RUN]') + ' ' + filePath);
    if (apply) {
      fs.writeFileSync(filePath, out, 'utf8');
    }
  }
}

logger.info('Scanning', baseDir);
walk(baseDir);
logger.info('Done.');
