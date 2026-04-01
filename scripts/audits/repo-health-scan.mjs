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

function writeReport(outputPath, report) {
  const absOut = path.resolve(process.cwd(), outputPath);
  fs.mkdirSync(path.dirname(absOut), { recursive: true });
  fs.writeFileSync(absOut, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

function printSummary(outputPath, report) {
  console.log(`Repo health scan written: ${outputPath}`);
  console.log(`- duplicate basenames: ${report.summary.duplicateBasenames}`);
  console.log(`- files over byte threshold: ${report.summary.largeFilesByBytes}`);
  console.log(`- files over line threshold: ${report.summary.largeFilesByLines}`);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const files = getTrackedFiles();
  const findings = classifyFiles(files, options);
  const report = buildReport(findings, options);
  writeReport(options.output, report);
  printSummary(options.output, report);

  if (options.strict) {
    const failed =
      report.summary.duplicateBasenames > 0 ||
      report.summary.largeFilesByBytes > 0 ||
      report.summary.largeFilesByLines > 0;
    if (failed) {
      process.exit(1);
    }
  }
}

main();
