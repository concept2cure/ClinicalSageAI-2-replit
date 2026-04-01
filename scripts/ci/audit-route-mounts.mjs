#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_TARGET = 'server/index.ts';

const ALLOWLIST = {
  // Known legacy shadowing retained intentionally for compatibility.
  shadowPaths: new Set([
    '/api/projects',
    '/api/csr',
    '/api/templates',
    '/api/atoms',
    '/api/reports',
  ]),
  // Canonical shared gateway prefix intentionally mounted by many modules.
  // Keep this explicit and narrow; other multi-use prefixes should still warn.
  multiUsePrefixes: new Set(['/api']),
  duplicateMethodKeys: new Set([]),
};

const ROUTE_OWNERS = [
  { prefix: '/api/concept2cure', owner: 'Concept2Cure Core', contact: 'server/routes/concept2cure.ts' },
  { prefix: '/api/ind', owner: 'IND / Authoring', contact: 'server/routes/ind-*.ts' },
  { prefix: '/api/cmc', owner: 'CMC Platform', contact: 'server/routes/cmc*.ts' },
  { prefix: '/api/reports', owner: 'Reporting', contact: 'server/routes/report*.ts' },
  { prefix: '/api/ai', owner: 'AI Gateway', contact: 'server/services/ai-gateway/' },
  { prefix: '/api/regulatory', owner: 'Regulatory Intelligence', contact: 'server/routes/regulatory*.ts' },
  { prefix: '/api/projects', owner: 'Workspace / Projects', contact: 'server/routes/projects*.ts' },
  { prefix: '/api/documents', owner: 'Document Systems', contact: 'server/routes/document*.ts' },
  { prefix: '/api/templates', owner: 'Template Systems', contact: 'server/routes/templates*.ts' },
  { prefix: '/api/atoms', owner: 'Knowledge / Atoms', contact: 'server/routes/atoms*.ts' },
  { prefix: '/api/csr', owner: 'CSR Builder', contact: 'server/routes/csr*.ts' },
];

function parseArgs(argv) {
  const options = {
    target: DEFAULT_TARGET,
    json: false,
    strictNoRegression: false,
    maxWarnings: null,
    baseline: null,
    writeBaseline: false,
    owners: null,
    writeJson: null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--target') {
      options.target = argv[i + 1];
      i += 1;
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--strict-no-regression') {
      options.strictNoRegression = true;
    } else if (arg === '--max-warnings') {
      options.maxWarnings = Number(argv[i + 1]);
      i += 1;
    } else if (arg === '--baseline') {
      options.baseline = argv[i + 1];
      i += 1;
    } else if (arg === '--write-baseline') {
      options.writeBaseline = true;
    } else if (arg === '--owners') {
      options.owners = argv[i + 1];
      i += 1;
    } else if (arg === '--write-json') {
      options.writeJson = argv[i + 1];
      i += 1;
    }
  }

  if (options.maxWarnings != null && (!Number.isInteger(options.maxWarnings) || options.maxWarnings < 0)) {
    throw new Error(`Invalid --max-warnings value: ${options.maxWarnings}`);
  }

  return options;
}

function readJsonFileIfExists(filePath) {
  if (!filePath) return null;
  const abs = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(abs)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(abs, 'utf8'));
  } catch {
    return null;
  }
}

function writeJsonFile(filePath, payload) {
  const abs = path.resolve(process.cwd(), filePath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function loadOwners(filePath) {
  if (!filePath) return ROUTE_OWNERS;
  const parsed = readJsonFileIfExists(filePath);
  if (!parsed) return ROUTE_OWNERS;
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed.owners)) return parsed.owners;
  return ROUTE_OWNERS;
}

function lineNumberAt(source, index) {
  let lines = 1;
  for (let i = 0; i < index; i += 1) {
    if (source.charCodeAt(i) === 10) lines += 1; // '\n'
  }
  return lines;
}

function collectMounts(source) {
  const entries = [];
  const startServerIdx = source.indexOf('async function startServer');
  const startServerCallIdx = source.indexOf('startServer();');

  const mountPattern = /app\.(use|get|post|put|patch|delete|options|head)\(\s*(['"`])([^'"`]+)\2/g;
  for (const match of source.matchAll(mountPattern)) {
    const kind = match[1];
    const mountPath = match[3];
    const idx = match.index ?? 0;
    const line = lineNumberAt(source, idx);
    const phase =
      startServerIdx >= 0 && idx > startServerIdx && (startServerCallIdx < 0 || idx < startServerCallIdx)
        ? 'startServer'
        : 'module-top';

    entries.push({
      kind,
      path: mountPath,
      line,
      phase,
    });
  }

  return entries;
}

function analyze(entries) {
  const errors = [];
  const warnings = [];

  const byMethodAndPath = new Map();
  const byPath = new Map();

  for (const entry of entries) {
    const methodKey = `${entry.kind}:${entry.path}`;
    if (!byMethodAndPath.has(methodKey)) byMethodAndPath.set(methodKey, []);
    byMethodAndPath.get(methodKey).push(entry);

    if (!byPath.has(entry.path)) byPath.set(entry.path, []);
    byPath.get(entry.path).push(entry);
  }

  for (const [key, grouped] of byMethodAndPath.entries()) {
    const [kind] = key.split(':');
    if (kind !== 'use' && grouped.length > 1 && !ALLOWLIST.duplicateMethodKeys.has(key)) {
      errors.push({
        type: 'duplicate-method-route',
        key,
        entries: grouped,
        message: `Duplicate app.${kind} mount for "${grouped[0].path}"`,
      });
    }
  }

  for (const [mountPath, grouped] of byPath.entries()) {
    const uses = grouped.filter(entry => entry.kind === 'use');
    const methods = grouped.filter(entry => entry.kind !== 'use');

    if (uses.length > 1 && !ALLOWLIST.multiUsePrefixes.has(mountPath)) {
      warnings.push({
        type: 'multi-use-prefix',
        path: mountPath,
        entries: uses,
        message: `Prefix "${mountPath}" mounted via app.use ${uses.length} times`,
      });
    }

    if (uses.length > 0 && methods.length > 0) {
      const risk = {
        type: 'shadow-risk',
        path: mountPath,
        entries: grouped,
        message: `Path "${mountPath}" has both app.use and method handlers; ordering can shadow later routes`,
      };

      if (ALLOWLIST.shadowPaths.has(mountPath)) {
        warnings.push(risk);
      } else {
        errors.push(risk);
      }
    }
  }

  return { errors, warnings };
}

function formatEntry(entry) {
  return `L${entry.line} app.${entry.kind}('${entry.path}') [${entry.phase}]`;
}

function resolveOwner(mountPath, ownerMappings) {
  let best = null;
  for (const candidate of ownerMappings) {
    if (mountPath.startsWith(candidate.prefix)) {
      if (!best || candidate.prefix.length > best.prefix.length) {
        best = candidate;
      }
    }
  }
  return best ?? { owner: 'Unassigned', contact: 'TBD', prefix: '(none)' };
}

function annotateWithOwners(items, ownerMappings) {
  return items.map(item => ({
    ...item,
    owner: resolveOwner(item.path, ownerMappings),
  }));
}

function fingerprintIssue(issue) {
  const key = issue.key || '';
  return `${issue.type}|${issue.path || ''}|${key}`;
}

function computeNewIssueCounts(current, baseline) {
  const empty = { errors: 0, warnings: 0 };
  if (!baseline || !baseline.issues) {
    return empty;
  }

  const baselineErrors = new Set((baseline.issues.errors || []).map(fingerprintIssue));
  const baselineWarnings = new Set((baseline.issues.warnings || []).map(fingerprintIssue));
  return {
    errors: current.errors.filter(issue => !baselineErrors.has(fingerprintIssue(issue))).length,
    warnings: current.warnings.filter(issue => !baselineWarnings.has(fingerprintIssue(issue))).length,
  };
}

function printHumanReport(target, entries, result) {
  console.log(`Route mount audit target: ${target}`);
  console.log(`Total captured mounts: ${entries.length}`);
  console.log(`Errors: ${result.errors.length}`);
  console.log(`Warnings: ${result.warnings.length}`);

  if (result.errors.length > 0) {
    console.log('\nErrors:');
    for (const err of result.errors) {
      console.log(`- ${err.message}`);
      console.log(`  owner: ${err.owner.owner} (${err.owner.contact})`);
      for (const entry of err.entries) {
        console.log(`  • ${formatEntry(entry)}`);
      }
    }
  }

  if (result.warnings.length > 0) {
    console.log('\nWarnings:');
    for (const warn of result.warnings.slice(0, 20)) {
      console.log(`- ${warn.message}`);
      console.log(`  owner: ${warn.owner.owner} (${warn.owner.contact})`);
      for (const entry of warn.entries.slice(0, 4)) {
        console.log(`  • ${formatEntry(entry)}`);
      }
      if (warn.entries.length > 4) {
        console.log(`  • ...and ${warn.entries.length - 4} more`);
      }
    }
    if (result.warnings.length > 20) {
      console.log(`- ...and ${result.warnings.length - 20} more warnings`);
    }
  }
}

function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
  const target = path.resolve(process.cwd(), options.target);
  if (!fs.existsSync(target)) {
    console.error(`Missing route mount target: ${options.target}`);
    process.exit(1);
  }

  const source = fs.readFileSync(target, 'utf8');
  const entries = collectMounts(source);
  const analyzed = analyze(entries);
  const ownerMappings = loadOwners(options.owners);
  const result = {
    errors: annotateWithOwners(analyzed.errors, ownerMappings),
    warnings: annotateWithOwners(analyzed.warnings, ownerMappings),
  };
  const baseline = readJsonFileIfExists(options.baseline);
  const newIssues = computeNewIssueCounts(result, baseline);
  const strictWarningsBaseline =
    options.maxWarnings ?? (baseline && typeof baseline.warnings === 'number' ? baseline.warnings : 16);

  const outputPayload = {
    target: options.target,
    generatedAt: new Date().toISOString(),
    mounts: entries.length,
    errors: result.errors.length,
    warnings: result.warnings.length,
    issues: {
      errors: result.errors.map(issue => ({ type: issue.type, path: issue.path || null, key: issue.key || null })),
      warnings: result.warnings.map(issue => ({ type: issue.type, path: issue.path || null, key: issue.key || null })),
    },
    ownership: ownerMappings,
  };

  if (options.json) {
    process.stdout.write(`${JSON.stringify(outputPayload, null, 2)}\n`);
  } else {
    printHumanReport(options.target, entries, result);
    console.log('\nOwner summary (warning/error counts):');
    const ownerCounts = new Map();
    for (const issue of [...result.errors, ...result.warnings]) {
      const ownerKey = `${issue.owner.owner} (${issue.owner.contact})`;
      if (!ownerCounts.has(ownerKey)) {
        ownerCounts.set(ownerKey, { errors: 0, warnings: 0 });
      }
      if (result.errors.includes(issue)) ownerCounts.get(ownerKey).errors += 1;
      else ownerCounts.get(ownerKey).warnings += 1;
    }
    const sortedOwners = Array.from(ownerCounts.entries()).sort((a, b) => {
      const aTotal = a[1].errors + a[1].warnings;
      const bTotal = b[1].errors + b[1].warnings;
      return bTotal - aTotal || a[0].localeCompare(b[0]);
    });
    for (const [owner, counts] of sortedOwners) {
      console.log(`- ${owner}: ${counts.errors} errors, ${counts.warnings} warnings`);
    }
    if (baseline) {
      console.log(
        `\nBaseline delta: +${newIssues.errors} new errors, +${newIssues.warnings} new warnings ` +
          `(baseline: ${options.baseline})`
      );
    }
  }

  if (options.writeBaseline && options.baseline) {
    writeJsonFile(options.baseline, outputPayload);
  }
  if (options.writeJson) {
    writeJsonFile(options.writeJson, outputPayload);
  }

  if (result.errors.length > 0) {
    process.exit(1);
  }

  if (options.maxWarnings != null && result.warnings.length > options.maxWarnings) {
    console.error(
      `Route mount warning limit exceeded: ${result.warnings.length} > ${options.maxWarnings}`
    );
    process.exit(1);
  }

  if (options.strictNoRegression) {
    const warningCountRegressed = result.warnings.length > strictWarningsBaseline;
    const issueRegressed = newIssues.errors > 0 || newIssues.warnings > 0;
    if (warningCountRegressed || issueRegressed) {
      console.error(
        `Route mount regression detected: ` +
          `${result.warnings.length} warnings (baseline ${strictWarningsBaseline}), ` +
          `${newIssues.errors} new errors, ${newIssues.warnings} new warnings`
      );
      process.exit(1);
    }
  }
}

main();
