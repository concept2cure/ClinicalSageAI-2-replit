#!/usr/bin/env node
/**
 * ci:trivyignore-hygiene — every Trivy suppression is bounded and owned, and no
 * misconfiguration check that must be answered per resource is suppressed for
 * the whole tree.
 *
 * Why this exists (security audit 2026-09-24, INF-11; plan item P0-16a):
 * `.trivyignore` is read by the BLOCKING Trivy scans in `.github/workflows/ci.yml`
 * and the deploy gate in `.github/workflows/deploy-aws.yml`. At the audit it held
 * seven entries with no expiry and no owner, two of them for dependencies that
 * were no longer in the tree, and four of them the S3 public-access-block checks
 * suppressed for the whole repository — so a new public bucket would have passed
 * the "blocking" scan. A suppression with no end date and no name is not a
 * decision; it is a hole.
 *
 * Rules, checked on the plaintext `.trivyignore` at the repository root:
 *
 *   1. Every entry line is `<ID> exp:YYYY-MM-DD`. Trivy itself honours `exp:`
 *      (the suppression lapses on that date and the finding returns), so the
 *      date is the control, not a comment. It must be in the future and at most
 *      MAX_DAYS out, so every accepted risk is re-read at least twice a year.
 *   2. Every entry is preceded by a comment block naming `owner:` (a person or
 *      team that answers for the risk) and `reason:` (why it is not fixable
 *      now). One block may cover several consecutive entries (a package with
 *      two advisories).
 *   3. IDs in RESOURCE_SCOPED_ONLY are never suppressed here. Each describes a
 *      property every bucket / trail / image must have; suppressing it for the
 *      tree hides the next resource without it. Such a finding is fixed, or
 *      excepted on the resource with an inline `#trivy:ignore:<ID>` and a
 *      written reason (docs/evidence/W2/2026-09-24-trivy/ is the precedent).
 *
 * Exit 1 with every violation listed; exit 0 with a one-line summary.
 * `--file <path>` checks another file; `--selftest` runs the gate against the
 * cases it exists to catch and exits non-zero unless every one is caught.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const MAX_DAYS = 180;

/**
 * Checks that are a per-resource property and must never be suppressed for
 * the whole tree. Names from the Trivy/Aqua AVD catalogue.
 */
const RESOURCE_SCOPED_ONLY = new Map([
  ['AVD-AWS-0086', 'S3: block public ACLs'],
  ['AVD-AWS-0087', 'S3: block public bucket policies'],
  ['AVD-AWS-0088', 'S3: bucket encryption'],
  ['AVD-AWS-0091', 'S3: ignore public ACLs'],
  ['AVD-AWS-0092', 'S3: no public access with ACL'],
  ['AVD-AWS-0093', 'S3: restrict public buckets'],
  ['AVD-AWS-0094', 'S3: public access block present'],
  ['AVD-AWS-0132', 'S3: customer-managed KMS key'],
  ['AVD-AWS-0014', 'CloudTrail: all regions'],
  ['AVD-AWS-0015', 'CloudTrail: encrypted with CMK'],
  ['AVD-AWS-0016', 'CloudTrail: log-file validation'],
  ['AVD-AWS-0080', 'RDS: storage encryption'],
  ['AVD-AWS-0176', 'RDS: IAM auth / public access'],
]);

const ENTRY_RE = /^([A-Za-z0-9][A-Za-z0-9._-]*)((?:\s+\S+)*)\s*$/;
const EXP_RE = /^exp:(\d{4})-(\d{2})-(\d{2})$/;

function daysBetween(a, b) {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/**
 * @param {string} text file contents
 * @param {{ today?: Date }} [opts]
 * @returns {{ violations: string[], entries: number }}
 */
export function checkTrivyIgnore(text, opts = {}) {
  const today = opts.today ?? new Date();
  const todayUtc = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const violations = [];
  let entries = 0;
  /** @type {string[]} */
  let block = [];

  const lines = text.split(/\r?\n/);
  lines.forEach((raw, idx) => {
    const lineNo = idx + 1;
    const line = raw.trim();
    if (line === '') {
      block = [];
      return;
    }
    if (line.startsWith('#')) {
      block.push(line.slice(1).trim());
      return;
    }

    entries += 1;
    const m = ENTRY_RE.exec(line);
    if (!m) {
      violations.push(`line ${lineNo}: unparseable entry "${line}"`);
      return;
    }
    const id = m[1];
    const rest = m[2].trim().split(/\s+/).filter(Boolean);

    if (RESOURCE_SCOPED_ONLY.has(id)) {
      violations.push(
        `line ${lineNo}: ${id} (${RESOURCE_SCOPED_ONLY.get(id)}) is a per-resource property and may not be ` +
          'suppressed for the whole tree; fix the resource or except it inline with #trivy:ignore and a reason',
      );
    }

    const expField = rest.find((f) => f.startsWith('exp:'));
    if (!expField) {
      violations.push(`line ${lineNo}: ${id} has no exp:YYYY-MM-DD — a suppression with no end date is not a decision`);
    } else {
      const em = EXP_RE.exec(expField);
      const expiry = em
        ? new Date(Date.UTC(Number(em[1]), Number(em[2]) - 1, Number(em[3])))
        : null;
      if (!expiry || Number.isNaN(expiry.getTime())) {
        violations.push(`line ${lineNo}: ${id} has a malformed expiry "${expField}" (want exp:YYYY-MM-DD)`);
      } else {
        const days = daysBetween(todayUtc, expiry);
        if (days <= 0) {
          violations.push(`line ${lineNo}: ${id} expired on ${expField.slice(4)}; re-review it or delete the line`);
        } else if (days > MAX_DAYS) {
          violations.push(
            `line ${lineNo}: ${id} expires ${days} days out; the maximum is ${MAX_DAYS} so every accepted risk is re-read`,
          );
        }
      }
    }
    const unknown = rest.filter((f) => !f.startsWith('exp:'));
    if (unknown.length) {
      violations.push(`line ${lineNo}: ${id} carries fields Trivy does not read (${unknown.join(' ')}); put them in the comment block`);
    }

    const blockText = block.join('\n');
    if (!/(^|\n)owner:\s*\S/.test(blockText)) {
      violations.push(`line ${lineNo}: ${id} has no "# owner:" in the comment block above it`);
    }
    if (!/(^|\n)reason:\s*\S/.test(blockText)) {
      violations.push(`line ${lineNo}: ${id} has no "# reason:" in the comment block above it`);
    }
  });

  return { violations, entries };
}

function runFile(file) {
  if (!fs.existsSync(file)) {
    console.log(`[ci:trivyignore-hygiene] OK — ${file} does not exist; nothing is suppressed.`);
    return 0;
  }
  const { violations, entries } = checkTrivyIgnore(fs.readFileSync(file, 'utf8'));
  if (violations.length) {
    console.error(`[ci:trivyignore-hygiene] FAIL — ${violations.length} violation(s) in ${file} (${entries} entries):`);
    for (const v of violations) console.error(`  - ${v}`);
    console.error(
      '\n  Every entry: "<ID> exp:YYYY-MM-DD" (future, <= ' +
        `${MAX_DAYS} days), preceded by "# owner:" and "# reason:" lines. Per-resource checks are never ` +
        'suppressed tree-wide: fix the resource or except it inline.',
    );
    return 1;
  }
  console.log(`[ci:trivyignore-hygiene] OK — ${entries} suppression(s) in ${file}, each with an owner, a reason and an expiry within ${MAX_DAYS} days.`);
  return 0;
}

function selftest() {
  const today = new Date('2026-09-25T00:00:00Z');
  const soon = '2026-11-25';
  const cases = [
    {
      name: 'clean entry passes',
      text: `# owner: Security Engineering\n# reason: no fixed version; unreachable per ledger\nCVE-2025-71329 exp:${soon}\n`,
      expect: [],
    },
    {
      name: 'missing exp',
      text: `# owner: x\n# reason: y\nCVE-2025-0001\n`,
      expect: [/has no exp:/],
    },
    {
      name: 'expired',
      text: `# owner: x\n# reason: y\nCVE-2025-0001 exp:2026-09-25\n`,
      expect: [/expired on 2026-09-25/],
    },
    {
      name: 'too far out',
      text: `# owner: x\n# reason: y\nCVE-2025-0001 exp:2027-09-25\n`,
      expect: [/expires \d+ days out/],
    },
    {
      name: 'no owner, no reason (blank line breaks the block)',
      text: `# owner: x\n# reason: y\n\nCVE-2025-0001 exp:${soon}\n`,
      expect: [/no "# owner:"/, /no "# reason:"/],
    },
    {
      name: 'tree-wide S3 public access block ignore',
      text: `# owner: x\n# reason: y\nAVD-AWS-0093 exp:${soon}\n`,
      expect: [/AVD-AWS-0093 .* per-resource property/],
    },
    {
      name: 'the audited file shape (no exp, no owner, S3 set) fails on every rule',
      text: `# S3/CloudTrail best practices - requires Terraform module updates\n\nAVD-AWS-0016\nAVD-AWS-0086\n`,
      expect: [/AVD-AWS-0016 .* per-resource/, /AVD-AWS-0016 has no exp:/, /AVD-AWS-0016 has no "# owner:"/, /AVD-AWS-0086 .* per-resource/],
    },
    {
      name: 'one block covers two consecutive entries',
      text: `# owner: x\n# reason: y\nCVE-2025-71329 exp:${soon}\nCVE-2025-71330 exp:${soon}\n`,
      expect: [],
    },
  ];
  let failed = 0;
  for (const c of cases) {
    const { violations } = checkTrivyIgnore(c.text, { today });
    const missing = c.expect.filter((re) => !violations.some((v) => re.test(v)));
    const unexpected = c.expect.length === 0 && violations.length > 0;
    if (missing.length || unexpected) {
      failed += 1;
      console.error(`  ✗ ${c.name}`);
      if (missing.length) console.error(`      not raised: ${missing.map(String).join(', ')}`);
      if (unexpected) console.error(`      unexpected: ${violations.join(' | ')}`);
    } else {
      console.log(`  ✓ ${c.name}`);
    }
  }
  // The file-level entry point must also exit non-zero on a failing file.
  const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'trivyignore-selftest-')), '.trivyignore');
  fs.writeFileSync(tmp, 'AVD-AWS-0093\n');
  const rc = runFile(tmp);
  if (rc !== 1) {
    failed += 1;
    console.error('  ✗ runFile did not exit 1 on a failing file');
  } else {
    console.log('  ✓ runFile exits 1 on a failing file');
  }
  if (failed) {
    console.error(`[ci:trivyignore-hygiene:selftest] FAIL — ${failed} case(s) not caught.`);
    return 1;
  }
  console.log(`[ci:trivyignore-hygiene:selftest] OK — ${cases.length + 1} case(s) caught.`);
  return 0;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname;
if (isMain) {
  const args = process.argv.slice(2);
  if (args.includes('--selftest')) {
    process.exit(selftest());
  }
  const fileIdx = args.indexOf('--file');
  const file = fileIdx >= 0 ? path.resolve(args[fileIdx + 1]) : path.resolve('.trivyignore');
  process.exit(runFile(file));
}
