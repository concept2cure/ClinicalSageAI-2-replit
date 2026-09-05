#!/usr/bin/env node
/**
 * CI Guard: Embedding Runtime Canonicality
 *
 * The canonical runtime for OpenAI embedding calls is
 * server/services/enhancedEmbeddingService.ts, governed by the corpus
 * policy in server/services/embedding-corpus-policy.ts.
 *
 * Rationale (from DATA_KNOWLEDGE_MEMORY_LAYER_AUDIT.md):
 *   The platform stores embeddings in seven pgvector tables across two
 *   dimensions (1536d, 3072d). Direct openai.embeddings.create() calls
 *   bypass the corpus policy, so the same query against the same index
 *   can return different results depending on which call site embedded
 *   it. That's a silent-retrieval-miss class bug.
 *
 * This gate flags new direct callers. Pre-existing callers are listed
 * in the allowlist with their corpus / model usage, both as documentation
 * and as a soft target for migration to embeddingService.embed().
 *
 * Exit 0 — no new direct embedding callers.
 * Exit 1 — a new direct caller appeared.
 *
 * Usage:
 *   node scripts/ci/check-embedding-runtime-canonicality.mjs
 *   node scripts/ci/check-embedding-runtime-canonicality.mjs --strict
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertAllowlistPathsExist } from './lib/allowlist-paths.mjs';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), '..', '..');

// ─── Approved entry points ──────────────────────────────────────────────────

const APPROVED = new Set([
  // The canonical runtime.
  'server/services/enhancedEmbeddingService.ts',
  // Other approved central runtimes.
  'server/services/semanticEmbeddingService.js',
  // Pre-existing direct callers (documented at gate-introduction time,
  // 2026-05-07). Migration target: route through embeddingService.embed().
  // LiteratureAggregatorService.ts — deleted 2026-06-12 (510k-orphaned dead
  // code removed per issue #726; was a direct embedding caller).
  // documentIngestionWorkflow.js — deleted 2026-05-07 (was dead + broken
  // syntax, never imported by a live route). See git log.
  'server/services/innovation/regulatory-delta-radar-service.ts',
  'server/services/innovation/regulatory-negotiation-logbook-service.ts',
  'server/services/innovation/auto-traceability-service.ts',
  // Search/index helpers that embed queries.
  'server/services/semanticSearch.js',
  // Workers — pre-existing batch path.
  'server/workers/entity-extraction-worker.ts',
  // Additional pre-existing direct callers documented at gate-introduction
  // time (2026-05-07). Migration target: enhancedEmbeddingService.embed().
  'server/api/drafting/routes.ts',
  // server/brain/vaultRetriever.js — migrated 2026-05-07 to
  // embeddingService.embed() with corpus 'vaultDocumentChunks'.
  'server/openai-service.ts',
]);

// See scripts/ci/lib/allowlist-paths.mjs. Two entries here were orphaned by
// deletions — note the list already retires entries as comments when someone
// remembers; this makes remembering unnecessary.
if (assertAllowlistPathsExist({ tag: '[ci:embedding-runtime]', repoRoot, name: 'APPROVED', paths: APPROVED }).length) {
  process.exit(1);
}

const DIRECT_CALL_PATTERNS = [
  /\bopenai\.embeddings\.create\s*\(/,
  /\bopenAI\.embeddings\.create\s*\(/,
  /\bgetOpenAI\(\)\.embeddings\.create\s*\(/,
  /\.embeddings\.create\s*\(\s*\{[^}]*model:\s*['"]text-embedding-/,
];

const SCAN_ROOTS = [path.join(repoRoot, 'server')];

function isTestPath(rel) {
  if (rel.includes('/__tests__/')) return true;
  if (rel.endsWith('.test.ts') || rel.endsWith('.test.js')) return true;
  if (rel.endsWith('.spec.ts') || rel.endsWith('.spec.js')) return true;
  return false;
}

function walk(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '_deprecated_migrations') continue;
      out.push(...walk(full));
    } else if (entry.isFile() && (full.endsWith('.ts') || full.endsWith('.js'))) {
      out.push(full);
    }
  }
  return out;
}

const findings = [];

for (const root of SCAN_ROOTS) {
  for (const file of walk(root)) {
    const rel = path.relative(repoRoot, file).replaceAll(path.sep, '/');
    if (isTestPath(rel)) continue;
    if (APPROVED.has(rel)) continue;

    const text = fs.readFileSync(file, 'utf8');
    for (const pattern of DIRECT_CALL_PATTERNS) {
      const m = pattern.exec(text);
      if (!m) continue;
      const lineNumber = text.slice(0, m.index).split('\n').length;
      findings.push({
        file: rel,
        line: lineNumber,
        snippet: text.split('\n')[lineNumber - 1].trim(),
      });
      break;
    }
  }
}

if (findings.length === 0) {
  console.log(
    '[ci:embedding-runtime-canonicality] OK — no new direct embedding callers'
  );
  process.exit(0);
}

console.error(
  '[ci:embedding-runtime-canonicality] FAIL — new direct embedding callers detected:\n'
);
for (const f of findings) {
  console.error(`  ${f.file}:${f.line}`);
  console.error(`    ${f.snippet}`);
  console.error('');
}
console.error(
  `Total: ${findings.length} file(s). New embedding code must route through ` +
    'enhancedEmbeddingService.embed() with a corpus name from ' +
    'server/services/embedding-corpus-policy.ts. If this file is a ' +
    'legitimate exception, add it to the APPROVED list above with a ' +
    'one-line justification.'
);
process.exit(1);
