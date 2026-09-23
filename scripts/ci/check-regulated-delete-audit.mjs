#!/usr/bin/env node
/**
 * Regulated-data delete → audit coverage gate (21 CFR Part 11 §11.10(e)).
 *
 * Every DELETE of a regulated record must be accompanied by an audit-trail
 * write. This static gate scans server/routes/ for DELETEs on regulated tables
 * (Drizzle `.delete(<Table>)` and raw `DELETE FROM <table>`) and fails if a
 * delete has no audit call nearby — so no NEW unaudited regulated delete can
 * land. It does not assert ordering/transactionality (a separate concern); it
 * asserts an audit call exists.
 *
 * The allow-list below is now empty: every regulated-table delete is positively
 * audited, so this is a pure positive-coverage guard — any new unaudited
 * regulated delete is a hard CI failure. New allow-list entries should be added
 * only with a justification (see PRODUCT_QC_REVIEW Part 11); the goal is to keep
 * it empty.
 *
 * Exit codes: 0 = clean, 1 = a new unaudited regulated delete was found.
 * Usage: node scripts/ci/check-regulated-delete-audit.mjs [--json]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..', '..');
const ROUTES = path.join(ROOT, 'server', 'routes');
const jsonOut = process.argv.includes('--json');

// Regulated record tables — Drizzle identifiers and their SQL names.
const REGULATED = [
  ['coauthorDocuments', 'coauthor_documents'],
  ['c2cDocuments', 'c2c_documents'],
  ['c2cDocumentSections', 'c2c_document_sections'],
  ['c2cDocumentSectionEvidence', 'c2c_document_section_evidence'],
  ['authoringDocuments', 'authoring_documents'],
  ['indApplications', 'ind_applications'], // IND = regulated FDA submission record
  // 2026-09-23 (D5): the quality-management plan and the CTQ factors and gating
  // rules it holds set the gates governed documents are validated against. A
  // CTQ factor could be hard-deleted by any member, with no reason and no
  // ledger row, and this gate did not list the table, so it reported green.
  ['qualityManagementPlans', 'quality_management_plans'],
  ['ctqFactors', 'ctq_factors'],
  ['qmpSectionGating', 'qmp_section_gating'],
];

// Require an actual call/statement, not a bare word in a comment, so a comment
// mentioning "auditService" near an unaudited delete cannot mask the gap.
// 2026-09-23 (W5/D7, co-author final pass): recordCoauthorDocumentEvent
// (server/services/coauthor/coauthor-audit.ts) is the one writer of a
// coauthor_documents audit_events row; both coauthor DELETE handlers call it,
// in the delete's transaction, instead of the inline INSERT this gate used to
// see there. server/__tests__/security/coauthor-document-delete-audit.contract.test.ts
// pins the row it writes (event type, reason, flags) for both.
const AUDIT_RE =
  /\b(writeMutation|logAuditEntry|recordGovernedAction|logAuditEvent|recordGovernedDecision|logRegulatedDeletion|recordCoauthorDocumentEvent)\s*\(|\bauditService\.|INSERT\s+INTO\s+audit_events\b/i;

// Operator-tracked unaudited regulated deletes (PRODUCT_QC_REVIEW Part 11).
// Empty — every regulated-table delete is now positively audited. New entries
// should be added only with a justification; the goal is to keep this empty.
const ALLOWLIST = {};

const WINDOW = 25; // lines around a delete to search for an audit call

/* A delete written inside the callback of a governed-write helper is audited
   by construction: the helper writes the ledger row on the delete's own
   transaction (server/services/qms/governed-qms-write.ts governedQmsWrite runs
   recordGovernedAction before COMMIT). The ledger call can sit well outside the
   25-line window, so the delete's position is checked against the helper
   call's argument span instead. */
const GOVERNED_WRITER_RE = /\bgovernedQmsWrite\s*\(/g;

/** Index just past the ')' that closes the call opening at `open`; string- and comment-aware. */
function callEnd(src, open) {
  let depth = 0;
  for (let j = open; j < src.length; j++) {
    const ch = src[j];
    if (ch === '/' && src[j + 1] === '/') { const nl = src.indexOf('\n', j); j = nl === -1 ? src.length : nl; continue; }
    if (ch === '/' && src[j + 1] === '*') { const end = src.indexOf('*/', j + 2); j = end === -1 ? src.length : end + 1; continue; }
    if (ch === '"' || ch === "'" || ch === '`') {
      let k = j + 1;
      while (k < src.length && src[k] !== ch) k += src[k] === '\\' ? 2 : 1;
      j = k;
      continue;
    }
    if (ch === '(') depth++;
    else if (ch === ')' && --depth === 0) return j + 1;
  }
  return src.length;
}

/** [start, end) offsets of every governed-writer call in `src`. */
function governedSpans(src) {
  const spans = [];
  let m;
  GOVERNED_WRITER_RE.lastIndex = 0;
  while ((m = GOVERNED_WRITER_RE.exec(src))) spans.push([m.index, callEnd(src, m.index + m[0].length - 1)]);
  return spans;
}

/** A comment line names a table without deleting from it. */
const isCommentLine = (line) => /^\s*(\/\/|\/\*|\*)/.test(line);

function listTsFiles(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== 'node_modules' && e.name !== '__tests__') listTsFiles(full, acc);
    } else if (e.name.endsWith('.ts') && !e.name.endsWith('.test.ts')) {
      acc.push(full);
    }
  }
  return acc;
}

function deleteSiteRe() {
  const drizzle = REGULATED.map(([id]) => id).join('|');
  const sql = REGULATED.map(([, name]) => name).join('|');
  return new RegExp(`\\.delete\\(\\s*(?:${drizzle})\\b|DELETE\\s+FROM\\s+(?:${sql})\\b`, 'i');
}

const siteRe = deleteSiteRe();
const violations = [];

for (const file of listTsFiles(ROUTES)) {
  const rel = path.relative(ROOT, file);
  const src = fs.readFileSync(file, 'utf-8');
  const lines = src.split('\n');
  const spans = governedSpans(src);
  let offset = 0;
  const lineStart = lines.map((l) => { const at = offset; offset += l.length + 1; return at; });
  lines.forEach((line, i) => {
    if (!siteRe.test(line) || isCommentLine(line)) return;
    const from = Math.max(0, i - WINDOW);
    const to = Math.min(lines.length, i + WINDOW + 1);
    const hasAudit = lines.slice(from, to).some(l => AUDIT_RE.test(l));
    if (hasAudit) return;
    if (spans.some(([a, b]) => lineStart[i] > a && lineStart[i] < b)) return; // inside a governed write
    if (ALLOWLIST[rel]) return; // operator-tracked
    violations.push({ file: rel, line: i + 1, excerpt: line.trim().slice(0, 120) });
  });
}

if (jsonOut) {
  console.log(JSON.stringify({ ok: violations.length === 0, violations }, null, 2));
} else if (violations.length === 0) {
  console.log(
    '[regulated-delete-audit] OK — every regulated-table delete has an audit call (or is operator-allow-listed).'
  );
} else {
  console.error(`[regulated-delete-audit] FAIL — ${violations.length} unaudited regulated delete(s):\n`);
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}`);
    console.error(`    ${v.excerpt}`);
  }
  console.error(
    '\n21 CFR Part 11 §11.10(e): a delete of a regulated record must write an audit-trail entry.\n' +
      'Add an audit call (writeMutation / logAuditEntry / recordGovernedAction) before the delete,\n' +
      'or, if intentional, allow-list it with a justification in this script.'
  );
}

process.exit(violations.length === 0 ? 0 : 1);
