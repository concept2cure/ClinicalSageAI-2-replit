#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_OUTPUT = 'docs/reports/repo-health-scan-latest.json';
const SCAN_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);
const DEFAULT_MAX_BYTES = 100_000;
const DEFAULT_MAX_LINES = 1_500;

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

function buildReport(findings, options) {
  const sha = runGit(['rev-parse', 'HEAD']);
  const branch = runGit(['branch', '--show-current']);
  const generatedAt = new Date().toISOString();

  return {
    generatedAt,
    git: { sha, branch },
    thresholds: {
      maxBytes: options.maxBytes,
      maxLines: options.maxLines,
    },
    summary: {
      duplicateBasenames: findings.duplicates.length,
      largeFilesByBytes: findings.largeByBytes.length,
      largeFilesByLines: findings.largeByLines.length,
    },
    findings: {
      duplicateBasenames: findings.duplicates,
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
  lines.push(`- Duplicate basenames: ${report.summary.duplicateBasenames}`);
  lines.push(`- Files over byte threshold: ${report.summary.largeFilesByBytes}`);
  lines.push(`- Files over line threshold: ${report.summary.largeFilesByLines}`);
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
  console.log(`- duplicate basenames: ${report.summary.duplicateBasenames}`);
  console.log(`- files over byte threshold: ${report.summary.largeFilesByBytes}`);
  console.log(`- files over line threshold: ${report.summary.largeFilesByLines}`);
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

function hasRegression(delta) {
  if (!delta) return false;
  return delta.duplicateBasenames > 0 || delta.largeFilesByBytes > 0 || delta.largeFilesByLines > 0;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const files = getTrackedFiles();
  const findings = classifyFiles(files, options);
  const baseline = readBaseline(options.baseline);
  const owners = readOwners(options.owners);
  const report = buildReport(findings, options);
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
    console.log(`- delta duplicate basenames: ${report.comparison.delta.duplicateBasenames}`);
    console.log(`- delta files over byte threshold: ${report.comparison.delta.largeFilesByBytes}`);
    console.log(`- delta files over line threshold: ${report.comparison.delta.largeFilesByLines}`);
  }

  if (options.strict || options.strictNoRegression) {
    const failed = baseline
      ? hasRegression(report.comparison?.delta)
      : report.summary.duplicateBasenames > 0 ||
        report.summary.largeFilesByBytes > 0 ||
        report.summary.largeFilesByLines > 0;
    if (failed) {
      process.exit(1);
    }
  }
}

main();
