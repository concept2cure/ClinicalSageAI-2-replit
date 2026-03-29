#!/usr/bin/env node
import { readdirSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';

const GENERATED_PATTERNS = [
  /^LAST_\d+_PRS_WIRING_AUDIT_\d{4}-\d{2}-\d{2}\.md$/,
  /^LAST_\d+_PRS_BUILD_PLAN_EXECUTION_\d{4}-\d{2}-\d{2}\.md$/,
  /^LAST_\d+_PRS_BUILD_PLAN_EXECUTION_\d{4}-\d{2}-\d{2}\.json$/,
];

export function parseArgs(argv) {
  const opts = {
    dir: 'docs/audits',
    retainDays: 14,
    dryRun: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dir') {
      opts.dir = argv[i + 1];
      i += 1;
    } else if (arg === '--retain-days') {
      opts.retainDays = Number(argv[i + 1]);
      i += 1;
    } else if (arg === '--dry-run') {
      opts.dryRun = true;
    }
  }

  if (!Number.isInteger(opts.retainDays) || opts.retainDays < 0) {
    throw new Error(`--retain-days must be a non-negative integer. Received: ${opts.retainDays}`);
  }

  return opts;
}

export function isGeneratedAuditArtifact(fileName) {
  return GENERATED_PATTERNS.some((pattern) => pattern.test(fileName));
}

export function pruneGeneratedArtifacts({ dir, retainDays, dryRun = false, now = new Date() }) {
  const all = readdirSync(dir);
  const generated = all.filter(isGeneratedAuditArtifact);
  const cutoffMs = now.getTime() - retainDays * 24 * 60 * 60 * 1000;

  const removed = [];
  const kept = [];

  for (const file of generated) {
    const fullPath = path.join(dir, file);
    const mtimeMs = statSync(fullPath).mtimeMs;
    if (mtimeMs < cutoffMs) {
      removed.push(file);
      if (!dryRun) {
        rmSync(fullPath);
      }
    } else {
      kept.push(file);
    }
  }

  return { scanned: all.length, generated: generated.length, kept, removed, dryRun, retainDays };
}

export function main() {
  const opts = parseArgs(process.argv.slice(2));
  const summary = pruneGeneratedArtifacts(opts);

  process.stdout.write(
    `${opts.dryRun ? '[dry-run] ' : ''}scanned=${summary.scanned} generated=${summary.generated} kept=${summary.kept.length} removed=${summary.removed.length}\n`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
