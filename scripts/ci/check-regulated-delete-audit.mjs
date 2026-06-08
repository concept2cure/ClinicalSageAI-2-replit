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
 * The currently-unaudited deletes are allow-listed below with a justification
 * (they are operator-tracked: a soft-delete migration + audit is pending — see
 * PRODUCT_QC_REVIEW Part 11 #1/#5). This gate stops the gap from widening while
 * that work is scheduled.
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
];

const AUDIT_RE =
  /\b(writeMutation|logAuditEntry|recordGovernedAction|logAuditEvent|recordGovernedDecision|auditService|logRegulatedDeletion)\b/;

// Known-unaudited regulated deletes, operator-tracked (PRODUCT_QC_REVIEW Part 11).
// Keyed by route file (each holds a single regulated-delete handler).
const ALLOWLIST = {
  'server/routes/ectd-documents.ts':
    'coauthor_documents hard-delete; soft-delete migration + audit pending (Part 11 #1)',
  'server/routes/coauthor.ts':
    'coauthor_documents hard-delete; soft-delete migration + audit pending (Part 11 #1)',
  'server/routes/authoring.router.ts':
    'authoring_documents UAT-cleanup hard-delete; audit pending (Part 11 #5)',
};

const WINDOW = 25; // lines around a delete to search for an audit call

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
  const lines = fs.readFileSync(file, 'utf-8').split('\n');
  lines.forEach((line, i) => {
    if (!siteRe.test(line)) return;
    const from = Math.max(0, i - WINDOW);
    const to = Math.min(lines.length, i + WINDOW + 1);
    const hasAudit = lines.slice(from, to).some(l => AUDIT_RE.test(l));
    if (hasAudit) return;
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
