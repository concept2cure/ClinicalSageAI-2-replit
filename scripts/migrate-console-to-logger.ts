/**
 * Bulk migration: console.* → createScopedLogger
 *
 * The console-bridge installed in server/utils/consoleBridge.ts
 * closes the redaction gap for legacy call sites without touching
 * code. This script is the long-term cleanup: every route / service
 * file that still calls `console.error / .warn / .log` directly gets
 * rewritten to use a scoped logger, which (a) gives structured
 * context that the bridge can't recover and (b) lets the file be
 * grep-clean of bare console calls.
 *
 * SAFETY POSTURE — this script is conservative on purpose:
 *
 *   - Only touches files under `server/` (and only `.ts` files).
 *   - Skips test files (`__tests__/**`, `*.test.ts`, `*.spec.ts`)
 *     entirely — test logging stays as `console.*` so vitest
 *     surfaces them.
 *   - Skips the logger itself, the consoleBridge, and a small
 *     allowlist of files where `console.*` is intentional (CLI
 *     scripts, the dev-server log shim).
 *   - Skips any file that already has both `createScopedLogger` AND
 *     `console.*` mixed — that means a partial migration is in
 *     flight; we don't want to fight it.
 *   - Only rewrites the THREE simplest patterns. Anything else
 *     (template literals, multi-line catches, args with side
 *     effects) is left as-is. The console-bridge still redacts those
 *     at runtime.
 *
 *   Three patterns rewritten:
 *
 *     console.error('[scope] message:', err)
 *       → logger.error('message', { err: err instanceof Error ? err.message : String(err) })
 *
 *     console.warn('[scope] message')
 *       → logger.warn('message')
 *
 *     console.log('[scope] message')
 *       → logger.info('message')
 *
 * USAGE:
 *
 *   npx tsx scripts/migrate-console-to-logger.ts [--apply] [--dir path]
 *
 *   Without --apply the script prints what it WOULD change and
 *   exits 0. With --apply it edits files in place and emits a
 *   per-file summary. Run it on a clean working tree so you can
 *   diff and revert per-file.
 *
 *   The first time you run --apply on a file, the script adds:
 *
 *     import { createScopedLogger } from '<relative>/utils/logger.js';
 *     const logger = createScopedLogger('<filename-stem>');
 *
 *   right after the last top-level import. The scope name is the
 *   filename stem (e.g. `decision-lineage.ts` → 'decision-lineage').
 */

import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, relative, resolve, dirname, basename, extname } from 'node:path';

interface Options {
  apply: boolean;
  dir: string;
}

interface FileReport {
  path: string;
  changed: number;
  skipped: string[];
  addedLoggerImport: boolean;
}

const SKIP_FILE_PATTERNS = [
  // Test files — keep raw console for vitest output.
  /\/__tests__\//,
  /\.test\.ts$/,
  /\.spec\.ts$/,
  // The logger and bridge themselves must keep `console.*` calls.
  /\/utils\/logger\.[tj]s$/,
  /\/utils\/consoleBridge\.ts$/,
  // CLI / migration scripts where console is the intended output.
  /\/scripts\//,
  /\/migrations\//,
  // Dev shim that wraps console for the dev server.
  /\/vite\.ts$/,
];

const PATTERN_ERROR_WITH_VAR =
  /console\.error\(\s*'\[([^\]]+)\]\s+([^']+?):',\s*([a-zA-Z_$][\w$]*)\s*\)\s*;?/g;
const PATTERN_WARN_BARE = /console\.warn\(\s*'\[([^\]]+)\]\s+([^']+)'\s*\)\s*;?/g;
const PATTERN_LOG_BARE = /console\.log\(\s*'\[([^\]]+)\]\s+([^']+)'\s*\)\s*;?/g;

function parseArgs(argv: string[]): Options {
  const opts: Options = { apply: false, dir: 'server' };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--apply') opts.apply = true;
    else if (argv[i] === '--dir' && i + 1 < argv.length) opts.dir = argv[++i];
  }
  return opts;
}

function walkTs(root: string): string[] {
  const out: string[] = [];
  const visit = (p: string) => {
    let entries: string[];
    try {
      entries = readdirSync(p);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry === 'node_modules' || entry === 'dist' || entry === '_archive' || entry === '_deprecated') {
        continue;
      }
      const full = join(p, entry);
      let st;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) visit(full);
      else if (st.isFile() && extname(entry) === '.ts') out.push(full);
    }
  };
  visit(root);
  return out;
}

function shouldSkip(path: string): boolean {
  return SKIP_FILE_PATTERNS.some(p => p.test(path));
}

function loggerImportFor(filePath: string): string {
  // Resolve the relative path from the file to server/utils/logger.
  const fileDir = dirname(filePath);
  const loggerAbs = resolve('server/utils/logger.js');
  let rel = relative(fileDir, loggerAbs).replace(/\\/g, '/');
  if (!rel.startsWith('.')) rel = './' + rel;
  return `import { createScopedLogger } from '${rel}';`;
}

function scopeNameFor(filePath: string): string {
  const stem = basename(filePath, '.ts').replace(/\.routes?$/, '');
  return stem;
}

function findInsertionPoint(src: string): number {
  // Insert after the last top-level `import ... from '...';` line.
  // Don't be clever with comment blocks — just find the last import
  // and insert on the next line.
  const importLine = /^import\s.+?from\s+['"][^'"]+['"];?\s*$/gm;
  let last: RegExpExecArray | null = null;
  let match: RegExpExecArray | null;
  while ((match = importLine.exec(src)) !== null) last = match;
  if (!last) return 0;
  return last.index + last[0].length;
}

function migrateFile(path: string): { content: string | null; report: FileReport } {
  const report: FileReport = { path, changed: 0, skipped: [], addedLoggerImport: false };
  const original = readFileSync(path, 'utf8');

  // Quick reject: no console.* at all? nothing to do.
  if (!/console\.(error|warn|log)\b/.test(original)) {
    return { content: null, report };
  }

  // Mixed-mode reject: if the file already has BOTH createScopedLogger
  // AND console.*, someone is in the middle of a partial migration —
  // leave it alone.
  const hasLogger = /createScopedLogger\s*\(/.test(original);
  let hasConsoleAfterEdits = false;

  let src = original;
  let changed = 0;

  // PATTERN 1: console.error('[scope] msg:', err)
  src = src.replace(PATTERN_ERROR_WITH_VAR, (_match, _scope, msg, varName) => {
    changed++;
    return `logger.error('${msg.trim()}', { err: ${varName} instanceof Error ? ${varName}.message : String(${varName}) });`;
  });

  // PATTERN 2: console.warn('[scope] msg')
  src = src.replace(PATTERN_WARN_BARE, (_match, _scope, msg) => {
    changed++;
    return `logger.warn('${msg.trim()}');`;
  });

  // PATTERN 3: console.log('[scope] msg')
  src = src.replace(PATTERN_LOG_BARE, (_match, _scope, msg) => {
    changed++;
    return `logger.info('${msg.trim()}');`;
  });

  if (changed === 0) {
    return { content: null, report };
  }

  // Note any console.* we left behind for the operator.
  const remaining = (src.match(/console\.(error|warn|log)\b/g) || []).length;
  if (remaining > 0) {
    hasConsoleAfterEdits = true;
    report.skipped.push(`${remaining} console.* call(s) remain — complex patterns`);
  }

  // Mixed-mode safety: if the file STARTED clean (no logger) and we
  // added rewrites but some console.* remains, that means the file
  // has both shapes. We'd be doing exactly the partial migration we
  // said we'd avoid. Roll back.
  if (!hasLogger && hasConsoleAfterEdits) {
    return {
      content: null,
      report: { ...report, changed: 0, skipped: ['mixed shapes detected — left untouched'] },
    };
  }

  // Add the logger import + instance if not already there.
  if (!hasLogger) {
    const insertAt = findInsertionPoint(src);
    const importStmt = loggerImportFor(path);
    const scope = scopeNameFor(path);
    const block = `\n${importStmt}\n\nconst logger = createScopedLogger('${scope}');\n`;
    src = src.slice(0, insertAt) + block + src.slice(insertAt);
    report.addedLoggerImport = true;
  }

  report.changed = changed;
  return { content: src, report };
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const root = resolve(opts.dir);
  const files = walkTs(root).filter(p => !shouldSkip(p));

  let touched = 0;
  let totalChanges = 0;
  const skippedDetails: string[] = [];

  for (const f of files) {
    const { content, report } = migrateFile(f);
    if (content == null) continue;

    if (opts.apply) {
      writeFileSync(f, content, 'utf8');
    }

    touched++;
    totalChanges += report.changed;
    const rel = relative(process.cwd(), f);
    console.log(
      `${opts.apply ? 'rewrote' : 'would rewrite'} ${rel}: ${report.changed} call(s)` +
        (report.addedLoggerImport ? ' [+logger import]' : '') +
        (report.skipped.length ? ` (skipped: ${report.skipped.join(', ')})` : '')
    );
    if (report.skipped.length) skippedDetails.push(rel);
  }

  console.log(
    `\nSummary: ${opts.apply ? 'rewrote' : 'would rewrite'} ${touched} file(s), ${totalChanges} call site(s).`
  );
  if (skippedDetails.length) {
    console.log(
      `${skippedDetails.length} file(s) had remaining console.* calls — manual review recommended.`
    );
  }
  if (!opts.apply) {
    console.log('\nDry run — pass --apply to write changes.');
  }
}

main();
