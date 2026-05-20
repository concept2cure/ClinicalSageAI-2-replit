/**
 * One-time migration: move flat-namespace CER reports under per-tenant
 * directories.
 *
 * The /api/cer/reports/:id route used to read from
 * `data/cer_reports/${id}.json` — a flat directory readable by any
 * authenticated user (closed in commit 1664db7). The route now
 * resolves under `data/cer_reports/org-{orgId}/${id}.json` so a
 * foreign-tenant id surfaces as 404.
 *
 * Existing files written under the legacy path need a one-time move.
 * This script:
 *
 *   1. Lists `data/cer_reports/*.json` at the legacy path.
 *   2. For each, parses the JSON and reads its `organizationId` field
 *      (every saved report carries it — saved by the POST handler).
 *   3. Moves the file to `data/cer_reports/org-{N}/{id}.json`,
 *      creating the tenant directory if needed.
 *   4. Skips (with warning) any file whose org id can't be
 *      determined — those need manual triage.
 *   5. Optionally deletes the legacy file on success (only with --delete).
 *
 * Usage:
 *
 *   # Dry run — prints what would happen, makes no changes
 *   npx tsx scripts/migrate-cer-reports.ts
 *
 *   # Apply moves (copy into org-{N}/, keep legacy as backup)
 *   npx tsx scripts/migrate-cer-reports.ts --apply
 *
 *   # Apply moves AND delete legacy files (only after verifying
 *   # the route serves correctly from the new layout)
 *   npx tsx scripts/migrate-cer-reports.ts --apply --delete
 *
 * Safety:
 *   - Default is dry-run.
 *   - --apply copies but doesn't delete the legacy; rollback is just
 *     a directory listing.
 *   - --delete is opt-in and only takes effect when paired with --apply.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
  copyFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';

interface Options {
  apply: boolean;
  delete: boolean;
  dir: string;
}

interface ReportFile {
  legacyPath: string;
  filename: string;
  organizationId?: number;
  reason?: string;
}

function parseArgs(argv: string[]): Options {
  const opts: Options = { apply: false, delete: false, dir: 'data/cer_reports' };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--apply') opts.apply = true;
    else if (argv[i] === '--delete') opts.delete = true;
    else if (argv[i] === '--dir' && i + 1 < argv.length) opts.dir = argv[++i];
  }
  return opts;
}

function inspectReport(filePath: string): ReportFile {
  const filename = filePath.split('/').pop() as string;
  try {
    const content = readFileSync(filePath, 'utf8');
    const json = JSON.parse(content);
    const candidates = [
      json.organizationId,
      json.organization_id,
      json.orgId,
      json.tenantId,
      json.tenant_id,
    ];
    const found = candidates.find(
      v => typeof v === 'number' || (typeof v === 'string' && /^\d+$/.test(v)),
    );
    if (found != null) {
      return { legacyPath: filePath, filename, organizationId: Number(found) };
    }
    return {
      legacyPath: filePath,
      filename,
      reason: 'no organizationId / organization_id / orgId field found in JSON',
    };
  } catch (err) {
    return {
      legacyPath: filePath,
      filename,
      reason: `parse error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const rootDir = resolve(opts.dir);

  if (!existsSync(rootDir)) {
    console.log(`No CER reports directory at ${rootDir} — nothing to migrate.`);
    return;
  }

  const legacyFiles: string[] = [];
  for (const entry of readdirSync(rootDir)) {
    const full = join(rootDir, entry);
    const st = statSync(full);
    if (st.isFile() && entry.endsWith('.json')) {
      legacyFiles.push(full);
    }
  }

  if (legacyFiles.length === 0) {
    console.log('All CER reports already migrated — no flat-namespace files remain.');
    return;
  }

  console.log(`Found ${legacyFiles.length} legacy CER report file(s) in ${rootDir}\n`);

  const inspected = legacyFiles.map(inspectReport);

  let moved = 0;
  let skipped = 0;
  const skippedDetail: string[] = [];

  for (const r of inspected) {
    if (r.organizationId == null) {
      skipped += 1;
      const detail = `  SKIP ${r.filename} — ${r.reason}`;
      skippedDetail.push(detail);
      console.log(detail);
      continue;
    }

    const tenantDir = join(rootDir, `org-${r.organizationId}`);
    const destPath = join(tenantDir, r.filename);

    if (existsSync(destPath)) {
      skipped += 1;
      const detail = `  SKIP ${r.filename} — already exists at ${destPath}`;
      skippedDetail.push(detail);
      console.log(detail);
      continue;
    }

    if (opts.apply) {
      if (!existsSync(tenantDir)) {
        mkdirSync(tenantDir, { recursive: true });
      }
      // Copy first (atomic-ish — we don't lose the file if a later
      // step fails), then delete only when --delete was passed.
      copyFileSync(r.legacyPath, destPath);
      if (opts.delete) {
        unlinkSync(r.legacyPath);
      }
      console.log(
        `  MOVED ${r.filename} → org-${r.organizationId}/${r.filename}` +
          (opts.delete ? ' (legacy deleted)' : ' (legacy retained)'),
      );
    } else {
      console.log(
        `  WOULD MOVE ${r.filename} → org-${r.organizationId}/${r.filename}`,
      );
    }
    moved += 1;
  }

  console.log(`\nSummary:`);
  console.log(`  ${opts.apply ? 'moved' : 'would move'}: ${moved}`);
  console.log(`  skipped:                                       ${skipped}`);
  if (!opts.apply) {
    console.log(`\nDry run — pass --apply to execute. Add --delete to drop legacy files.`);
  } else if (!opts.delete) {
    console.log(`\nLegacy files retained as backup. Re-run with --delete to remove after verifying the route serves correctly.`);
  }

  if (skipped > 0) {
    console.log(
      `\n${skipped} file(s) skipped — manual triage required. They need an organizationId in the JSON or another out-of-band way to determine the owning tenant.`,
    );
  }
}

main();
