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
  duplicateMethodKeys: new Set([]),
};

function parseArgs(argv) {
  const options = {
    target: DEFAULT_TARGET,
    json: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--target') {
      options.target = argv[i + 1];
      i += 1;
    } else if (arg === '--json') {
      options.json = true;
    }
  }

  return options;
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

    if (uses.length > 1) {
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

function printHumanReport(target, entries, result) {
  console.log(`Route mount audit target: ${target}`);
  console.log(`Total captured mounts: ${entries.length}`);
  console.log(`Errors: ${result.errors.length}`);
  console.log(`Warnings: ${result.warnings.length}`);

  if (result.errors.length > 0) {
    console.log('\nErrors:');
    for (const err of result.errors) {
      console.log(`- ${err.message}`);
      for (const entry of err.entries) {
        console.log(`  • ${formatEntry(entry)}`);
      }
    }
  }

  if (result.warnings.length > 0) {
    console.log('\nWarnings:');
    for (const warn of result.warnings.slice(0, 20)) {
      console.log(`- ${warn.message}`);
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
  const options = parseArgs(process.argv.slice(2));
  const target = path.resolve(process.cwd(), options.target);
  if (!fs.existsSync(target)) {
    console.error(`Missing route mount target: ${options.target}`);
    process.exit(1);
  }

  const source = fs.readFileSync(target, 'utf8');
  const entries = collectMounts(source);
  const result = analyze(entries);

  if (options.json) {
    process.stdout.write(
      JSON.stringify(
        {
          target: options.target,
          mounts: entries.length,
          errors: result.errors,
          warnings: result.warnings,
        },
        null,
        2,
      ) + '\n',
    );
  } else {
    printHumanReport(options.target, entries, result);
  }

  if (result.errors.length > 0) {
    process.exit(1);
  }
}

main();
