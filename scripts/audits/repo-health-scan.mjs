#!/usr/bin/env node
/**
 * Repo health scan — duplication and file-size debt.
 *
 * ── Why the duplicate dimension changed ───────────────────────────────────────
 * This scan used to gate on DUPLICATE BASENAMES, and `--strict` demanded zero of
 * them. That gate could never pass, and not because the work was outstanding:
 * the tree carries 95 files named `index`, 48 named `types`, 31 named `app`.
 * Those are `server/config/index.ts`, `server/auth/index.ts`,
 * `server/middleware/index.ts` — barrel files and module-local type files, which
 * is how TypeScript is written. Driving that count to zero would mean giving
 * every barrel a globally unique name and breaking every import that depends on
 * directory resolution. The gate demanded a state that is worse code.
 *
 * So the nightly job was permanently red over a number nobody could act on, and
 * a permanently-red gate is a gate everyone learns to scroll past.
 *
 * Content duplication is the defect that dimension was gesturing at. Two files
 * with byte-identical contents at different paths is unambiguously wrong: one of
 * them gets a fix and the other silently does not. It is measurable without a
 * threshold argument, and — once the findings below are cleared — its honest
 * target is zero.
 *
 * ── Why machine-managed mirrors are excluded ──────────────────────────────────
 * 84 of the 91 content-duplicate groups measured at the time of this change were
 * inside `design-system/`, which docs/design-system-sync.md declares a READ-ONLY
 * mirror of an external canonical project: scripts/sync-design-system.sh replaces
 * the whole directory atomically on every sync. Duplication in there is
 * upstream's structure, it is reproduced verbatim on the next sync, and any edit
 * this repo makes is destroyed. Gating on it would rebuild exactly the
 * permanently-red gate this change exists to remove.
 *
 * The exclusion keys on the `.sync-meta` stamp the sync script writes, not on a
 * hardcoded path — so a second mirror is covered automatically, and a directory
 * that stops being a mirror comes back into scope the moment the stamp goes.
 *
 * ── Why file size is a ceiling and not a zero ─────────────────────────────────
 * The oversize findings are real (a 930KB `AnaToolExecutor.ts` is a genuine
 * maintenance problem) but splitting them is weeks of work with real blast
 * radius, so zero is not a near-term bar. They are gated as a downward-only
 * ceiling recorded in package.json, per this repo's ratchet convention: the
 * number is visible in the diff and can only be edited downward by a human.
 */
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_OUTPUT = 'docs/reports/repo-health-scan-latest.json';
const SCAN_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);
const DEFAULT_MAX_BYTES = 100_000;
const DEFAULT_MAX_LINES = 1_500;

/**
 * Stamp written by scripts/sync-design-system.sh into every directory it owns.
 * A directory carrying one is replaced wholesale on the next sync, so its
 * contents are not this repo's to deduplicate.
 */
const MIRROR_STAMP = '.sync-meta';

function runGit(args) {
  return execFileSync('git', args, {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
}

function parseArgs(argv) {
  const options = {
    output: DEFAULT_OUTPUT,
    strict: false,
    baseline: null,
    owners: null,
    writeMarkdown: null,
    strictNoRegression: false,
    maxBytes: DEFAULT_MAX_BYTES,
    maxLines: DEFAULT_MAX_LINES,
    // Downward-only ceilings for the size dimensions under --strict. Null means
    // "do not gate on size", which is what the per-PR no-regression run wants —
    // it compares against the baseline instead.
    ceilingLargeBytes: null,
    ceilingLargeLines: null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--output') {
      options.output = argv[i + 1];
      i += 1;
    } else if (arg === '--strict') {
      options.strict = true;
    } else if (arg === '--baseline') {
      options.baseline = argv[i + 1];
      i += 1;
    } else if (arg === '--owners') {
      options.owners = argv[i + 1];
      i += 1;
    } else if (arg === '--write-markdown') {
      options.writeMarkdown = argv[i + 1];
      i += 1;
    } else if (arg === '--strict-no-regression') {
      options.strictNoRegression = true;
    } else if (arg === '--max-bytes') {
      options.maxBytes = Number(argv[i + 1]);
      i += 1;
    } else if (arg === '--max-lines') {
      options.maxLines = Number(argv[i + 1]);
      i += 1;
    } else if (arg === '--ceiling-large-bytes') {
      options.ceilingLargeBytes = Number(argv[i + 1]);
      i += 1;
    } else if (arg === '--ceiling-large-lines') {
      options.ceilingLargeLines = Number(argv[i + 1]);
      i += 1;
    }
  }

  for (const key of ['ceilingLargeBytes', 'ceilingLargeLines']) {
    const value = options[key];
    if (value !== null && (!Number.isInteger(value) || value < 0)) {
      throw new Error(`Invalid --${key.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`)} value: ${value}`);
    }
  }

  if (!Number.isFinite(options.maxBytes) || options.maxBytes <= 0) {
    throw new Error(`Invalid --max-bytes value: ${options.maxBytes}`);
  }
  if (!Number.isFinite(options.maxLines) || options.maxLines <= 0) {
    throw new Error(`Invalid --max-lines value: ${options.maxLines}`);
  }

  return options;
}

function getTrackedFiles() {
  const output = runGit(['ls-files']);
  if (!output) return [];
  return output
    .split('\n')
    .map(f => f.trim())
    .filter(Boolean);
}

/**
 * Directory prefixes owned by a sync script, derived from the tracked stamps
 * rather than hardcoded. Returns e.g. ['design-system/'].
 */
function findManagedMirrors(files) {
  return files
    .filter(f => path.basename(f) === MIRROR_STAMP)
    .map(f => {
      const dir = path.dirname(f);
      return dir === '.' ? '' : `${dir}/`;
    })
    .filter(Boolean)
    .sort();
}

function isInsideMirror(file, mirrors) {
  return mirrors.some(prefix => file.startsWith(prefix));
}

/**
 * Groups of tracked source files whose bytes are identical.
 *
 * Exact bytes, deliberately — no whitespace normalisation and no similarity
 * score. A near-duplicate detector needs a threshold, and a threshold is an
 * argument rather than a finding. Byte equality has no false positives: the two
 * files ARE the same file at two paths, and one of them will miss the next fix.
 */
function findContentDuplicates(files, mirrors) {
  const byHash = new Map();

  for (const file of files) {
    if (!SCAN_EXTENSIONS.has(path.extname(file))) continue;
    if (file.startsWith('dist/') || file.startsWith('coverage/') || file.includes('/node_modules/')) {
      continue;
    }
    if (isInsideMirror(file, mirrors)) continue;

    const abs = path.resolve(process.cwd(), file);
    if (!fs.existsSync(abs)) continue;

    const hash = crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex');
    if (!byHash.has(hash)) byHash.set(hash, []);
    byHash.get(hash).push(file);
  }

  return Array.from(byHash.entries())
    .filter(([, paths]) => paths.length > 1)
    .map(([hash, paths]) => ({ hash: hash.slice(0, 12), count: paths.length, paths: paths.slice().sort() }))
    .sort((a, b) => b.count - a.count || a.paths[0].localeCompare(b.paths[0]));
}

function countLines(content) {
  if (content.length === 0) return 0;
  let lines = 1;
  for (let i = 0; i < content.length; i += 1) {
    if (content.charCodeAt(i) === 10) lines += 1; // '\n'
  }
  return lines;
}

function classifyFiles(files, thresholds) {
  const duplicateByBasename = new Map();
  const largeByBytes = [];
  const largeByLines = [];

  for (const file of files) {
    const ext = path.extname(file);
    if (!SCAN_EXTENSIONS.has(ext)) continue;
    if (file.startsWith('dist/') || file.startsWith('coverage/') || file.includes('/node_modules/')) {
      continue;
    }

    const abs = path.resolve(process.cwd(), file);
    if (!fs.existsSync(abs)) continue;

    const base = path.basename(file, ext).toLowerCase();
    if (!duplicateByBasename.has(base)) duplicateByBasename.set(base, []);
    duplicateByBasename.get(base).push(file);

    const stat = fs.statSync(abs);
    if (stat.size > thresholds.maxBytes) {
      largeByBytes.push({ file, bytes: stat.size });
    }

    const content = fs.readFileSync(abs, 'utf8');
    const lines = countLines(content);
    if (lines > thresholds.maxLines) {
      largeByLines.push({ file, lines });
    }
  }

  const duplicates = Array.from(duplicateByBasename.entries())
    .filter(([, paths]) => paths.length > 1)
    .map(([basename, paths]) => ({ basename, count: paths.length, paths }))
    .sort((a, b) => b.count - a.count || a.basename.localeCompare(b.basename));

  largeByBytes.sort((a, b) => b.bytes - a.bytes || a.file.localeCompare(b.file));
  largeByLines.sort((a, b) => b.lines - a.lines || a.file.localeCompare(b.file));

  return { duplicates, largeByBytes, largeByLines };
}

/**
 * Basenames are reported but never gated — see the header. Kept in the report
 * because "31 files named app" is worth a human glance even though it is not a
 * defect, and dropping the field would break the committed baseline's shape.
 */

function buildReport(findings, options, mirrors) {
  const sha = runGit(['rev-parse', 'HEAD']);
  const branch = runGit(['branch', '--show-current']);
  const generatedAt = new Date().toISOString();

  return {
    generatedAt,
    git: { sha, branch },
    thresholds: {
      maxBytes: options.maxBytes,
      maxLines: options.maxLines,
      ceilingLargeBytes: options.ceilingLargeBytes,
      ceilingLargeLines: options.ceilingLargeLines,
    },
    // Recorded so a reader of the report can see WHICH paths were held out of
    // the content-duplicate scan, rather than having to trust that some were.
    managedMirrors: mirrors,
    summary: {
      duplicateBasenames: findings.duplicates.length,
      contentDuplicateGroups: findings.contentDuplicates.length,
      contentDuplicateFiles: findings.contentDuplicates.reduce((total, g) => total + g.count, 0),
      largeFilesByBytes: findings.largeByBytes.length,
      largeFilesByLines: findings.largeByLines.length,
    },
    findings: {
      duplicateBasenames: findings.duplicates,
      contentDuplicates: findings.contentDuplicates,
      largeFilesByBytes: findings.largeByBytes,
      largeFilesByLines: findings.largeByLines,
    },
  };
}

function readOwners(filePath) {
  if (!filePath) return null;
  const abs = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(abs)) {
    throw new Error(`Owners file not found: ${filePath}`);
  }
  const raw = fs.readFileSync(abs, 'utf8');
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.owners)) {
    throw new Error(`Invalid owners file shape: ${filePath}`);
  }
  const hasInvalidOwner = parsed.owners.some(
    item =>
      !item ||
      typeof item !== 'object' ||
      (!item.prefix && !item.pattern) ||
      (item.prefix && typeof item.prefix !== 'string') ||
      (item.pattern && typeof item.pattern !== 'string'),
  );
  if (hasInvalidOwner) {
    throw new Error(`Invalid owner entry in owners file: ${filePath}`);
  }
  return parsed.owners;
}

function resolveOwner(filePath, owners) {
  if (!owners || owners.length === 0) {
    return { owner: 'Unassigned', contact: 'TBD' };
  }
  let best = null;
  let bestScore = -1;
  for (const item of owners) {
    let matched = false;
    let score = -1;
    if (typeof item.prefix === 'string' && item.prefix && filePath.startsWith(item.prefix)) {
      matched = true;
      score = Math.max(score, item.prefix.length);
    }
    if (typeof item.pattern === 'string' && item.pattern) {
      try {
        const regex = new RegExp(item.pattern);
        if (regex.test(filePath)) {
          matched = true;
          score = Math.max(score, item.pattern.length);
        }
      } catch {
        // Ignore invalid pattern match attempts; owners file validation handles this.
      }
    }
    if (matched && score > bestScore) {
      best = item;
      bestScore = score;
    }
  }
  return best
    ? { owner: best.owner || 'Unassigned', contact: best.contact || 'TBD' }
    : { owner: 'Unassigned', contact: 'TBD' };
}

function annotateOwnerCounts(findings, owners) {
  const counts = new Map();
  const bump = (filePath, bucket) => {
    const owner = resolveOwner(filePath, owners);
    const key = `${owner.owner} (${owner.contact})`;
    if (!counts.has(key)) {
      counts.set(key, { duplicateGroups: 0, largeByBytes: 0, largeByLines: 0 });
    }
    counts.get(key)[bucket] += 1;
  };

  for (const dup of findings.duplicateBasenames) {
    for (const filePath of dup.paths) {
      bump(filePath, 'duplicateGroups');
    }
  }
  for (const item of findings.largeFilesByBytes) {
    bump(item.file, 'largeByBytes');
  }
  for (const item of findings.largeFilesByLines) {
    bump(item.file, 'largeByLines');
  }

  return Array.from(counts.entries())
    .map(([owner, values]) => ({ owner, ...values }))
    .sort((a, b) => {
      const at = a.duplicateGroups + a.largeByBytes + a.largeByLines;
      const bt = b.duplicateGroups + b.largeByBytes + b.largeByLines;
      return bt - at || a.owner.localeCompare(b.owner);
    });
}

function writeReport(outputPath, report) {
  const absOut = path.resolve(process.cwd(), outputPath);
  fs.mkdirSync(path.dirname(absOut), { recursive: true });
  fs.writeFileSync(absOut, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

function writeMarkdownReport(outputPath, report) {
  const abs = path.resolve(process.cwd(), outputPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  const lines = [];
  lines.push('# Repo Health Scan');
  lines.push('');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Branch: ${report.git.branch}`);
  lines.push(`SHA: ${report.git.sha}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(
    `- Content-duplicate groups (gated): ${report.summary.contentDuplicateGroups} ` +
      `(${report.summary.contentDuplicateFiles} files)`,
  );
  lines.push(`- Duplicate basenames (reported, not gated): ${report.summary.duplicateBasenames}`);
  lines.push(`- Files over byte threshold: ${report.summary.largeFilesByBytes}`);
  lines.push(`- Files over line threshold: ${report.summary.largeFilesByLines}`);
  if (report.managedMirrors?.length) {
    lines.push(`- Machine-managed mirrors held out of the duplicate scan: ${report.managedMirrors.join(', ')}`);
  }
  if (report.findings.contentDuplicates?.length) {
    lines.push('');
    lines.push('## Content Duplicates');
    lines.push('');
    for (const group of report.findings.contentDuplicates) {
      lines.push(`- ${group.paths.join(' == ')}`);
    }
  }
  if (report.comparison) {
    lines.push(`- Baseline: ${report.comparison.baseline}`);
    lines.push(`- Delta duplicate basenames: ${report.comparison.delta.duplicateBasenames}`);
    lines.push(`- Delta files over byte threshold: ${report.comparison.delta.largeFilesByBytes}`);
    lines.push(`- Delta files over line threshold: ${report.comparison.delta.largeFilesByLines}`);
  }
  if (report.ownerSummary?.length) {
    lines.push('');
    lines.push('## Owner Summary');
    lines.push('');
    for (const owner of report.ownerSummary) {
      lines.push(
        `- ${owner.owner}: duplicateGroups=${owner.duplicateGroups}, ` +
          `largeByBytes=${owner.largeByBytes}, largeByLines=${owner.largeByLines}`
      );
    }
  }
  fs.writeFileSync(abs, `${lines.join('\n')}\n`, 'utf8');
}

function printSummary(outputPath, report) {
  console.log(`Repo health scan written: ${outputPath}`);
  console.log(
    `- content-duplicate groups: ${report.summary.contentDuplicateGroups}` +
      ` (${report.summary.contentDuplicateFiles} files)   [gated]`,
  );
  console.log(`- duplicate basenames: ${report.summary.duplicateBasenames}   [reported, not gated]`);
  console.log(`- files over byte threshold: ${report.summary.largeFilesByBytes}`);
  console.log(`- files over line threshold: ${report.summary.largeFilesByLines}`);
  if (report.managedMirrors?.length) {
    console.log(`- held out as machine-managed mirrors: ${report.managedMirrors.join(', ')}`);
  }
}

function readBaseline(filePath) {
  if (!filePath) return null;
  const abs = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(abs)) {
    throw new Error(`Baseline file not found: ${filePath}`);
  }
  const raw = fs.readFileSync(abs, 'utf8');
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || !parsed.summary) {
    throw new Error(`Invalid baseline report shape: ${filePath}`);
  }
  return parsed;
}

function computeDelta(current, baseline) {
  if (!baseline) {
    return null;
  }
  const safe = value => (Number.isFinite(value) ? value : 0);
  const currentSummary = current.summary ?? {};
  const baselineSummary = baseline.summary ?? {};
  return {
    duplicateBasenames: safe(currentSummary.duplicateBasenames) - safe(baselineSummary.duplicateBasenames),
    // null, not a number, when the baseline predates this dimension. See below.
    contentDuplicateGroups: Number.isFinite(baselineSummary.contentDuplicateGroups)
      ? safe(currentSummary.contentDuplicateGroups) - safe(baselineSummary.contentDuplicateGroups)
      : null,
    largeFilesByBytes: safe(currentSummary.largeFilesByBytes) - safe(baselineSummary.largeFilesByBytes),
    largeFilesByLines: safe(currentSummary.largeFilesByLines) - safe(baselineSummary.largeFilesByLines),
  };
}

function stripVolatileFields(report) {
  const clone = JSON.parse(JSON.stringify(report));
  if (clone && typeof clone === 'object') {
    delete clone.generatedAt;
    if (clone.git && typeof clone.git === 'object') {
      delete clone.git.sha;
    }
  }
  return clone;
}

/**
 * Basename drift is deliberately absent here as well as from the strict gate.
 * Adding a second `types.ts` to a new module is correct TypeScript, and failing
 * a PR for it would teach people to route around this scan.
 *
 * ── A null delta is "cannot compare", and must not fail ───────────────────────
 * computeDelta returns null for contentDuplicateGroups when the committed
 * baseline predates that dimension. Treating an absent field as 0 is a guess,
 * not a comparison, and it produced a real false failure: the commit that
 * introduced this gate did not update the baseline in the same commit, so for
 * two commits the current count (6) was compared against a field that did not
 * exist, read as 0, and reported as a regression of +6. Nothing had regressed —
 * the dimension simply had no prior value.
 *
 * `null > 0` is false in JS, so the comparison below already behaves correctly;
 * it is written explicitly so nobody "fixes" it back into safe(undefined).
 */
function hasRegression(delta) {
  if (!delta) return false;
  const grew = (d) => typeof d === 'number' && d > 0;
  return grew(delta.contentDuplicateGroups) || grew(delta.largeFilesByBytes) || grew(delta.largeFilesByLines);
}

/**
 * The strict gate. Returns the reasons it failed, so the operator is told what
 * to do rather than just handed a non-zero exit.
 */
function strictFailures(report, options) {
  const reasons = [];
  const { summary } = report;

  if (summary.contentDuplicateGroups > 0) {
    reasons.push(
      `${summary.contentDuplicateGroups} group(s) of byte-identical files ` +
        `(${summary.contentDuplicateFiles} files). One copy will get the next fix and the ` +
        `others will not. Delete the redundant copies, or extract the shared module:\n` +
        report.findings.contentDuplicates
          .map(g => `     ${g.paths.join('\n     ==  ')}`)
          .join('\n'),
    );
  }

  if (options.ceilingLargeBytes !== null && summary.largeFilesByBytes > options.ceilingLargeBytes) {
    reasons.push(
      `${summary.largeFilesByBytes} files exceed ${options.maxBytes} bytes, above the ceiling of ` +
        `${options.ceilingLargeBytes}. The ceiling in package.json moves DOWN only.`,
    );
  }
  if (options.ceilingLargeLines !== null && summary.largeFilesByLines > options.ceilingLargeLines) {
    reasons.push(
      `${summary.largeFilesByLines} files exceed ${options.maxLines} lines, above the ceiling of ` +
        `${options.ceilingLargeLines}. The ceiling in package.json moves DOWN only.`,
    );
  }

  return reasons;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const files = getTrackedFiles();
  const mirrors = findManagedMirrors(files);
  const findings = classifyFiles(files, options);
  findings.contentDuplicates = findContentDuplicates(files, mirrors);
  const baseline = readBaseline(options.baseline);
  const owners = readOwners(options.owners);
  const report = buildReport(findings, options, mirrors);
  report.comparison = baseline
    ? {
        baseline: options.baseline,
        delta: computeDelta(report, baseline),
      }
    : null;
  report.ownerSummary = annotateOwnerCounts(report.findings, owners);
  if (owners) {
    report.owners = owners;
  }

  const outputPath = path.resolve(process.cwd(), options.output);
  const existingForStableWrite =
    fs.existsSync(outputPath) && options.output === DEFAULT_OUTPUT
      ? JSON.parse(fs.readFileSync(outputPath, 'utf8'))
      : null;
  const stableCurrent = stripVolatileFields(report);
  const stableExisting = existingForStableWrite ? stripVolatileFields(existingForStableWrite) : null;
  if (existingForStableWrite && stableExisting && JSON.stringify(stableExisting) === JSON.stringify(stableCurrent)) {
    // Preserve file content when only volatile fields changed.
    report.generatedAt = existingForStableWrite.generatedAt ?? report.generatedAt;
    report.git = {
      ...(report.git ?? {}),
      sha: existingForStableWrite?.git?.sha ?? report.git.sha,
      branch: report.git.branch,
    };
  }

  writeReport(options.output, report);
  if (options.writeMarkdown) {
    writeMarkdownReport(options.writeMarkdown, report);
  }
  printSummary(options.output, report);
  if (report.comparison) {
    console.log(`- baseline: ${report.comparison.baseline}`);
    // Printed first because it is the dimension the no-regression gate acts on.
    console.log(
      `- delta content-duplicate groups: ${
        report.comparison.delta.contentDuplicateGroups === null
          ? 'n/a (baseline predates this dimension — not compared)'
          : report.comparison.delta.contentDuplicateGroups
      }`,
    );
    console.log(`- delta duplicate basenames: ${report.comparison.delta.duplicateBasenames}`);
    console.log(`- delta files over byte threshold: ${report.comparison.delta.largeFilesByBytes}`);
    console.log(`- delta files over line threshold: ${report.comparison.delta.largeFilesByLines}`);
  }

  if (options.strictNoRegression && baseline) {
    if (hasRegression(report.comparison?.delta)) {
      console.error('\n❌ repo health regressed against the baseline.');
      process.exit(1);
    }
    return;
  }

  if (options.strict) {
    const reasons = strictFailures(report, options);
    if (reasons.length > 0) {
      console.error('\n❌ repo health strict gate failed:\n');
      for (const reason of reasons) console.error(`   • ${reason}\n`);
      process.exit(1);
    }
    console.log('\n✅ repo health strict gate passed.');
  }
}

main();
