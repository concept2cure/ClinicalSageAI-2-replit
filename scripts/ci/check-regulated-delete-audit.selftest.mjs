#!/usr/bin/env node
/**
 * Self-test for scripts/ci/check-regulated-delete-audit.mjs
 * (ci:regulated-delete-audit, 21 CFR Part 11 §11.10(e)).
 *
 * The gate reports OK on the current tree — its allow-list is empty and every
 * regulated-table delete in server/routes/ is audited — so its failure branch
 * never fires in normal use, and a guard whose failure branch has never been
 * seen has not been tested (CLAUDE.md, working agreement).
 *
 * Each case writes fixture routes into a temp directory and runs a copy of the
 * gate as a subprocess. The copy carries exactly two path/data edits, nothing
 * else: `ROOT` points at the fixture tree, and the inline `ALLOWLIST` is set per
 * case (`{}` unless the case is about the allow-list), so a real entry added to
 * the gate later cannot leak into a fixture. Its detection is the real one. If
 * either edit stops applying, the selftest fails rather than test the wrong file.
 *
 * The failing shapes are the ones the gate's header and history name:
 *   - the CTQ-factor hard delete the 2026-09-23 (D5) note describes — any
 *     member, no reason, no ledger row, the where clause handed to delete() as
 *     an ignored second argument;
 *   - the pre-governed QMP delete, a chained Drizzle call whose `.delete(<Table>)`
 *     sits on its own line (how the real routes are written);
 *   - a raw-SQL `DELETE FROM ind_applications` with no audit_events row (the
 *     IND handler before it wrote one in the delete's transaction);
 *   - lower-case SQL in a nested router directory (c2c/);
 *   - every one of the nine regulated tables, in both spellings — the D5 note
 *     records that a table missing from the list let the gate report green;
 *   - a comment naming the audit writers and a log line saying "audit" near an
 *     unaudited delete (the header: a bare word must not mask the gap);
 *   - an audited delete in one handler and an unaudited one in a handler far
 *     below it: the audit call covers its own window, not the file;
 *   - a delete AFTER a governedQmsWrite(...) call closes: the governed span is
 *     the helper call's argument list, not the rest of the file;
 *   - an audit row that names no actor (2026-10-01, plan P1-30, DP-33): the
 *     authoring UAT delete as it stood before 73153832 (auditService.logAction
 *     with no user, which this gate accepted), a chained row with
 *     `userId: undefined`, an audit_events INSERT with no user_id column, and a
 *     writeMutation with null in the actor's position.
 *
 * Clean shapes, each the real writer the gate recognises: audit_events INSERT
 * (ind.ts), writeChainedAuditRow (authoring, 2026-10-01), recordCoauthorDocumentEvent
 * (coauthor, 2026-09-23), writeMutation (c2c evidence), and a delete inside a
 * governedQmsWrite callback with no audit call in its window (tenant-ctq-factors,
 * quality-management-api). Near-misses a sloppy gate would flag: an Express
 * `router.delete('/…')` registration, SELECTs of regulated tables, a regulated
 * name as the prefix of an unregulated one (coauthor_documents_history,
 * c2cDocumentsArchive), the JSDoc line the real CTQ route carries ("would have
 * run DELETE FROM ctq_factors with no WHERE"), a commented-out delete, a ')'
 * inside a string and inside a comment within the governed call, and the
 * DELETE FROM fixtures the real tree keeps in server/routes/__tests__/.
 *
 * Allow-list: an entry with a written justification suppresses its own file and
 * no other; an entry with an empty justification suppresses nothing.
 *
 * Not asserted, because the gate does not do it today (pinning these would make
 * the limitation a requirement):
 *   - a commented-out audit CALL (`// await writeMutation(..., userId, ...)`)
 *     that names an actor counts as an audit — AUDIT_RE and the call scan are
 *     applied to comment lines too;
 *   - routes outside server/routes/, and .js files, are not scanned;
 *   - an allow-list entry whose file no longer has a violation is not reported
 *     stale, and a non-string truthy entry (`true`) suppresses without a reason.
 *
 * SELFTEST_GATE_PATH points the selftest at another copy of the gate (a mutant),
 * to show the selftest fails when the gate's detection is weakened:
 *   SELFTEST_GATE_PATH=/tmp/mutant.mjs node scripts/ci/check-regulated-delete-audit.selftest.mjs
 *
 * Usage: node scripts/ci/check-regulated-delete-audit.selftest.mjs   (exit 0 = every case held)
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TAG = '[ci:regulated-delete-audit:selftest]';
const GATE = process.env.SELFTEST_GATE_PATH
  ? path.resolve(process.env.SELFTEST_GATE_PATH)
  : path.join(repoRoot, 'scripts', 'ci', 'check-regulated-delete-audit.mjs');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'regulated-delete-audit-'));
const routesDir = path.join(tmp, 'server', 'routes');
const gateSrc = fs.readFileSync(GATE, 'utf8');

/** The gate, with ROOT at the fixture tree and the given allow-list. Throws if an edit does not apply. */
function patchedGate(allowlist) {
  const rootRe = /const ROOT = [^;]+;/;
  const allowRe = /const ALLOWLIST = [^;]*;/;
  if (!rootRe.test(gateSrc)) throw new Error(`could not patch ROOT in ${GATE}`);
  if (!allowRe.test(gateSrc)) throw new Error(`could not patch ALLOWLIST in ${GATE}`);
  return gateSrc
    .replace(rootRe, `const ROOT = ${JSON.stringify(tmp)};`)
    .replace(allowRe, `const ALLOWLIST = ${JSON.stringify(allowlist)};`);
}

function runGate({ allowlist = {}, args = [] } = {}) {
  const gatePath = path.join(tmp, `gate-${Math.random().toString(36).slice(2)}.mjs`);
  fs.writeFileSync(gatePath, patchedGate(allowlist));
  try {
    const stdout = execFileSync(process.execPath, [gatePath, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { code: 0, stdout, out: stdout };
  } catch (err) {
    const stdout = err.stdout ?? '';
    return { code: err.status ?? 1, stdout, out: `${stdout}${err.stderr ?? ''}` };
  } finally {
    fs.rmSync(gatePath, { force: true });
  }
}

function writeRoute(rel, body) {
  const full = path.join(routesDir, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, body);
}
function clearRoutes() {
  fs.rmSync(routesDir, { recursive: true, force: true });
  fs.mkdirSync(routesDir, { recursive: true });
  // The gate also scans server/services/coauthor (its SCAN_DIRS, 2026-10-01 D5),
  // and a directory it scans must exist, as it does in the real tree.
  fs.mkdirSync(path.join(tmp, 'server', 'services', 'coauthor'), { recursive: true });
}

/** `n` lines of unrelated code, to put two sites beyond the gate's window of each other. */
const filler = (n, tag = 'f') =>
  Array.from({ length: n }, (_, k) => `  const ${tag}${k} = normalise(input, ${k});`).join('\n');

/** 1-based line of the first line of `body` containing `marker`. */
function lineOf(body, marker) {
  const i = body.split('\n').findIndex((l) => l.includes(marker));
  if (i < 0) throw new Error(`fixture lacks marker ${JSON.stringify(marker)}`);
  return i + 1;
}
/** The gate's report line for a site: `server/routes/<rel>:<line>`. */
const site = (rel, body, marker) => `server/routes/${rel}:${lineOf(body, marker)}`;

/** A site must be a whole report line (so `x.ts:4` is not found inside `x.ts:48`); other text, a substring. */
const has = (out, s) =>
  s.startsWith('server/routes/') ? out.split('\n').some((l) => l.trim() === s) : out.includes(s);

/* ---------------------------------------------------------------- fixtures */

/** 2026-09-23 (D5): a CTQ factor hard-deleted by any member, no reason, no
    ledger row; the where clause passed to delete() as an ignored argument. */
const CTQ_HARD_DELETE = `import { Router } from 'express';
import { and, eq } from 'drizzle-orm';
import { ctqFactors } from '@shared/schema';
const router = Router();

router.delete('/:tenantId/ctq-factors/:factorId', authMiddleware, async (req, res) => {
  try {
    const tenantId = parseInt(req.params.tenantId as string);
    const factorId = parseInt(req.params.factorId as string);
    const db = getDb(req);
    await db.delete(ctqFactors, and(eq(ctqFactors.id, factorId), eq(ctqFactors.organizationId, tenantId)));
    res.json({ success: true, message: 'CTQ factor deleted successfully' });
  } catch (error) {
    logger.error('Error deleting CTQ factor', { error });
    res.status(500).json({ error: 'Failed to delete CTQ factor' });
  }
});

export default router;
`;

/** The QMP delete before it ran inside governedQmsWrite: a chained call. */
const QMP_CHAINED_DELETE = `router.delete('/qmp/:id', authMiddleware, async (req, res) => {
  const organizationId = req.resolvedOrganizationId;
  const qmpId = parseInt(req.params.id);
  // Delete the QMP
  await getDb(req)
    .delete(qualityManagementPlans)
    .where(
      and(
        eq(qualityManagementPlans.organizationId, organizationId),
        eq(qualityManagementPlans.id, qmpId)
      )
    );
  invalidateCache(organizationId, 'qmp', 'plans');
  res.json({ success: true, message: 'Quality Management Plan deleted successfully' });
});
`;

/** The IND delete with its transaction but without the audit_events row. */
const IND_UNAUDITED = `router.delete('/applications/:id', async (req, res) => {
  const deletedId = await transaction(async (client: any) => {
    const del = await client.query(
      'DELETE FROM ind_applications WHERE id = $1 AND organization_id = $2 RETURNING id',
      [id, organizationId],
    );
    if (!del.rows.length) throw new Error('IND application not found');
    return del.rows[0].id;
  });
  res.json({ success: true, deletedId });
});
`;

/** The same handler as ind.ts ships it: the audit_events INSERT in the delete's transaction. */
const IND_AUDITED = `router.delete('/applications/:id', async (req, res) => {
  const deletedId = await transaction(async (client: any) => {
    const delSql =
      'DELETE FROM ind_applications WHERE id = $1 AND organization_id = $2 RETURNING id';
    const del = await client.query(delSql, [id, organizationId]);
    if (!del.rows.length) throw new Error('IND application not found');

    await client.query(
      \`INSERT INTO audit_events
         (organization_id, event_type, entity_type, entity_id, user_id, reason,
          regulatory_significant, gxp_relevant, created_at)
       VALUES ($1, 'ind_application.deleted', 'ind_application', $2, $3, $4, true, true, NOW())\`,
      [app.organization_id, Number(id), auditUserId, 'IND application deleted'],
    );
    return del.rows[0].id;
  });
  res.json({ success: true, deletedId });
});
`;

/** authoring.router.ts, 2026-10-01: the governed delete and its chained audit_logs row. */
const AUTHORING_CHAINED = `async function governedDelete(client, req, docId, tenantId, reason) {
  const contentHash = await computeDocHashOn(client, docId, tenantId);
  await client.query('DELETE FROM authoring_documents WHERE id = $1 AND tenant_id = $2', [docId, tenantId]);
  await writeChainedAuditRow(client, {
    tenantId,
    userId: getActorId(req) ?? undefined,
    action: 'authoring.document.delete',
    resourceType: 'authoring_document',
    resourceId: docId,
    details: { reason, contentHash },
  });
  return { kind: 'deleted' };
}
`;

/** coauthor.ts / ectd-documents.ts: the one writer of a coauthor document event. */
const COAUTHOR_EVENT = `router.delete('/:id', async (req, res) => {
  const deletedRow = await transaction(async (client: any) => {
    let delSql = 'DELETE FROM coauthor_documents WHERE id = $1';
    delSql += ' AND organization_id = $2 RETURNING id, organization_id';
    const del = await client.query(delSql, [docId, organizationId]);
    if (!del.rows.length) return null;
    const row = del.rows[0];
    await recordCoauthorDocumentEvent(client, {
      organizationId: row.organization_id,
      documentId: row.id,
      eventType: 'coauthor_document.deleted',
      actor,
      reason: 'coauthor document deleted',
    });
    return row;
  });
  res.json({ success: true, deletedId: deletedRow.id });
});
`;

/** c2c/documents.ts: writeMutation on the delete's client, before it. */
const C2C_EVIDENCE_WRITE_MUTATION = `router.delete('/:id/sections/:key/evidence/:evId', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await writeMutation(
      'resolve',
      { target: \`section:\${id}:\${key}\`, reason: 'evidence unlinked', payload: { evidenceId: evId } },
      userId,
      orgId,
      'api',
      'documents',
      client,
    );
    await client.query(\`DELETE FROM c2c_document_section_evidence WHERE id = $1\`, [evId]);
    await client.query('COMMIT');
    return res.status(204).send();
  } finally {
    client.release();
  }
});
`;

/** tenant-ctq-factors.ts as it ships: the delete inside governedQmsWrite's
    callback, far from any audit call (the ledger row is written by the helper).
    The ')' in a string and in a comment before the delete must not close the
    governed span early. */
const CTQ_GOVERNED = `router.delete('/:tenantId/ctq-factors/:factorId', authMiddleware, async (req, res) => {
  const userId = governedQmsActor(req, res, CTQ_FACTOR);
  const reason = governedQmsReason(req, res, CTQ_FACTOR);
  await governedQmsWrite(
    req,
    res,
    CTQ_FACTOR,
    { orgId: organizationId, userId, reason, command: 'delete', failure: 'Failed to delete CTQ factor' },
    async () => {
      const db = getDb(req);
      const [existing] = await db
        .select()
        .from(ctqFactors)
        .where(and(eq(ctqFactors.id, factorId), eq(ctqFactors.organizationId, organizationId)))
        .limit(1)
        .for('update');
      if (!existing) throw new GovernedRefusal(404, { error: 'CTQ factor not found :)' });
      // a stray ) in a comment, and an unbalanced ( in the string below
      if (traced.length > 0) throw new GovernedRefusal(409, { message: 'in use (see the matrix' });
${filler(30, 'g')}
      const deleted = await db
        .delete(ctqFactors)
        .where(and(eq(ctqFactors.id, factorId), eq(ctqFactors.organizationId, organizationId)))
        .returning({ id: ctqFactors.id });
      return { target: \`ctq-factor:\${factorId}\`, payload: { snapshot: existing }, status: 200 };
    }
  );
});
`;

/* P1-30 second half (DP-33, 2026-10-01): an audit row an inspector cannot
   attribute is not an audit trail entry (11.10(e) asks for the operator). The
   shapes below each write a row beside the delete that names no actor. */

/** authoring.router.ts before 73153832, verbatim in shape: the UAT clean-up
    delete logged through auditService.logAction with no user, and the gate
    accepted it. */
const AUTHORING_UAT_ACTORLESS = `router.delete('/docs/:docId', async (req, res) => {
  try {
    const doc = (
      await getPool().query(
        \`SELECT id as doc_id, product_code FROM authoring_documents WHERE id = $1\`,
        [req.params.docId]
      )
    ).rows[0];
    if (!doc) return res.status(404).json({ error: 'document not found' });
    await auditService.logAction({
      action: 'authoring_document.deleted',
      resourceType: 'authoring_document',
      resourceId: String(req.params.docId),
      details: { productCode: doc.product_code, via: 'admin-uat-cleanup' },
    });
    await getPool().query(\`DELETE FROM authoring_documents WHERE id = $1\`, [req.params.docId]);
    res.json({ ok: true, deleted: req.params.docId });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete document' });
  }
});
`;

/** The chained writer, with the actor key present and empty. */
const CHAINED_UNDEFINED_ACTOR = `async function governedDelete(client, req, docId, tenantId, reason) {
  await client.query('DELETE FROM authoring_documents WHERE id = $1 AND tenant_id = $2', [docId, tenantId]);
  await writeChainedAuditRow(client, {
    tenantId,
    userId: undefined,
    action: 'authoring.document.delete',
    resourceType: 'authoring_document',
    resourceId: docId,
    details: { reason },
  });
  return { kind: 'deleted' };
}
`;

/** The IND row with no user_id column. */
const IND_NO_ACTOR_COLUMN = `router.delete('/applications/:id', async (req, res) => {
  const deletedId = await transaction(async (client: any) => {
    const del = await client.query('DELETE FROM ind_applications WHERE id = $1 AND organization_id = $2 RETURNING id', [id, organizationId]);
    if (!del.rows.length) throw new Error('IND application not found');
    await client.query(
      \`INSERT INTO audit_events
         (organization_id, event_type, entity_type, entity_id, reason, created_at)
       VALUES ($1, 'ind_application.deleted', 'ind_application', $2, $3, NOW())\`,
      [app.organization_id, Number(id), 'IND application deleted'],
    );
    return del.rows[0].id;
  });
  res.json({ success: true, deletedId });
});
`;

/** writeMutation with null in the actor's position. */
const WRITE_MUTATION_NULL_ACTOR = `router.delete('/:id/sections/:key/evidence/:evId', async (req, res) => {
  await writeMutation(
    'resolve',
    { target: \`section:\${id}:\${key}\`, reason: 'evidence unlinked', payload: { evidenceId: evId } },
    null,
    orgId,
    'api',
    'documents',
    client,
  );
  await client.query(\`DELETE FROM c2c_document_section_evidence WHERE id = $1\`, [evId]);
  return res.status(204).send();
});
`;

/* ------------------------------------------------------------------- cases */

const REGULATED = [
  ['coauthorDocuments', 'coauthor_documents'],
  ['c2cDocuments', 'c2c_documents'],
  ['c2cDocumentSections', 'c2c_document_sections'],
  ['c2cDocumentSectionEvidence', 'c2c_document_section_evidence'],
  ['authoringDocuments', 'authoring_documents'],
  ['indApplications', 'ind_applications'],
  ['qualityManagementPlans', 'quality_management_plans'],
  ['ctqFactors', 'ctq_factors'],
  ['qmpSectionGating', 'qmp_section_gating'],
];
const perTable = REGULATED.flatMap(([id, table]) => [
  [`tables/${id}.drizzle.ts`, `export async function drop(db, x) {\n  await db.delete(${id}).where(eq(${id}.id, x));\n}\n`, `.delete(${id})`],
  [`tables/${table}.sql.ts`, `export async function drop(client, x) {\n  await client.query('DELETE FROM ${table} WHERE id = $1', [x]);\n}\n`, `DELETE FROM ${table}`],
]);

const MULTI_HANDLER = `router.delete('/:id', async (req, res) => {
  await writeMutation('delete', { target: \`doc:\${id}\`, reason }, userId, orgId, 'api', 'documents', client);
  await client.query('DELETE FROM c2c_documents WHERE id = $1 AND organization_id = $2', [id, orgId]);
  res.status(204).send();
});

${filler(40)}

router.delete('/:id/sections/:key', async (req, res) => {
  await client.query('DELETE FROM c2c_document_sections WHERE document_id = $1 AND key = $2', [id, key]);
  res.status(204).send();
});
`;

const MASKED = `router.delete('/:id', async (req, res) => {
  // Part 11: this should go through recordGovernedAction and the auditService
  // before release; the audit trail is written by a later ticket.
  await client.query('DELETE FROM coauthor_documents WHERE id = $1', [id]);
  logger.info('[audit] coauthor document deleted', { id, auditTrail: 'pending' });
  res.json({ success: true });
});
`;

const AFTER_GOVERNED = `${CTQ_GOVERNED}
${filler(30, 'h')}

router.delete('/:tenantId/ctq-factors', authMiddleware, async (req, res) => {
  await getDb(req).delete(ctqFactors).where(eq(ctqFactors.organizationId, organizationId));
  res.json({ success: true });
});
`;

const NEAR_MISSES = `/**
 * Until 2026-09-23 the delete below it passed its where clause as an ignored
 * second argument — fixing the check alone would have run DELETE FROM ctq_factors with
 * no WHERE.
 */
router.delete('/:tenantId/ctq-factors/:factorId', authMiddleware, handleCtqDelete);
router.delete('/qmp/:id', authMiddleware, handleQmpDelete);
// await db.delete(ctqFactors).where(eq(ctqFactors.id, id));
export async function reads(db, client, id) {
  const factors = await db.select().from(ctqFactors).where(eq(ctqFactors.id, id));
  const docs = await client.query('SELECT * FROM coauthor_documents WHERE id = $1', [id]);
  await db.delete(projectNotes).where(eq(projectNotes.id, id));
  await db.delete(c2cDocumentsArchive).where(eq(c2cDocumentsArchive.id, id));
  await client.query('DELETE FROM coauthor_documents_history WHERE document_id = $1', [id]);
  await client.query('DELETE FROM coauthor_document_comments WHERE document_id = $1', [id]);
  return { factors, docs };
}
`;

const cases = [
  /* ------------------------------------------------------------- RED ---- */
  {
    name: 'FAILS on the 2026-09-23 CTQ-factor hard delete — any member, no reason, no ledger row',
    files: { 'tenant-ctq-factors.ts': CTQ_HARD_DELETE },
    expectExit: 1,
    expectIn: [
      'FAIL — 1 unaudited regulated delete(s)',
      site('tenant-ctq-factors.ts', CTQ_HARD_DELETE, 'db.delete(ctqFactors'),
      'await db.delete(ctqFactors, and(',
    ],
  },
  {
    name: 'FAILS on the pre-governed QMP delete, `.delete(<Table>)` on its own line of a chain',
    files: { 'quality-management-api.ts': QMP_CHAINED_DELETE },
    expectExit: 1,
    expectIn: [
      'FAIL — 1 unaudited',
      site('quality-management-api.ts', QMP_CHAINED_DELETE, '.delete(qualityManagementPlans)'),
    ],
  },
  {
    name: 'FAILS on a raw-SQL IND delete with no audit_events row, even inside a transaction',
    files: { 'ind.ts': IND_UNAUDITED },
    expectExit: 1,
    expectIn: ['FAIL — 1 unaudited', site('ind.ts', IND_UNAUDITED, 'DELETE FROM ind_applications')],
  },
  {
    name: 'FAILS on lower-case SQL in a nested router directory',
    files: {
      'c2c/documents.ts': `export async function unlink(client, evId) {\n  await client.query(\`delete from c2c_document_section_evidence where id = $1\`, [evId]);\n}\n`,
    },
    expectExit: 1,
    expectIn: ['FAIL — 1 unaudited', 'server/routes/c2c/documents.ts:2'],
  },
  {
    name: 'FAILS on every regulated table, Drizzle and SQL spellings (a table off the list reports green)',
    files: Object.fromEntries(perTable.map(([rel, body]) => [rel, body])),
    expectExit: 1,
    expectIn: [
      `FAIL — ${perTable.length} unaudited regulated delete(s)`,
      ...perTable.map(([rel, body, marker]) => site(rel, body, marker)),
    ],
  },
  {
    name: 'FAILS when a comment names the audit writers and a log line says "audit" — neither is an audit',
    files: { 'coauthor.ts': MASKED },
    expectExit: 1,
    expectIn: ['FAIL — 1 unaudited', site('coauthor.ts', MASKED, 'DELETE FROM coauthor_documents')],
  },
  {
    name: "FAILS on an unaudited handler far below an audited one — an audit covers its window, not the file",
    files: { 'c2c/documents.ts': MULTI_HANDLER },
    expectExit: 1,
    expectIn: [
      'FAIL — 1 unaudited',
      site('c2c/documents.ts', MULTI_HANDLER, 'DELETE FROM c2c_document_sections'),
    ],
    expectNotIn: [site('c2c/documents.ts', MULTI_HANDLER, 'DELETE FROM c2c_documents')],
  },
  {
    name: 'FAILS on a delete after governedQmsWrite(...) closes; the one inside it stays covered',
    files: { 'tenant-ctq-factors.ts': AFTER_GOVERNED },
    expectExit: 1,
    expectIn: [
      'FAIL — 1 unaudited',
      site('tenant-ctq-factors.ts', AFTER_GOVERNED, 'getDb(req).delete(ctqFactors)'),
    ],
    // The delete inside the governed call (the chained `.delete(ctqFactors)` line) is not reported.
    expectNotIn: [site('tenant-ctq-factors.ts', AFTER_GOVERNED, '        .delete(ctqFactors)')],
  },
  {
    name: 'FAILS in --json mode too: ok:false, the site, exit 1',
    files: { 'ind.ts': IND_UNAUDITED },
    args: ['--json'],
    expectExit: 1,
    expectIn: [],
    extra: (_out, stdout) => {
      let report;
      try {
        report = JSON.parse(stdout);
      } catch {
        return [`stdout is not JSON: ${JSON.stringify(stdout.slice(0, 200))}`];
      }
      const want = { file: 'server/routes/ind.ts', line: lineOf(IND_UNAUDITED, 'DELETE FROM ind_applications') };
      const errs = [];
      if (report.ok !== false) errs.push(`ok was ${JSON.stringify(report.ok)}, expected false`);
      const v = report.violations ?? [];
      if (v.length !== 1 || v[0].file !== want.file || v[0].line !== want.line) {
        errs.push(`violations ${JSON.stringify(v)} != one at ${want.file}:${want.line}`);
      }
      return errs;
    },
  },

  {
    name: 'FAILS on the DP-33 UAT delete: an auditService.logAction row that names no user is not attributable',
    files: { 'authoring.router.ts': AUTHORING_UAT_ACTORLESS },
    expectExit: 1,
    expectIn: [
      'FAIL — 1 unaudited',
      site('authoring.router.ts', AUTHORING_UAT_ACTORLESS, 'DELETE FROM authoring_documents WHERE id = $1`'),
      `the audit call at line ${lineOf(AUTHORING_UAT_ACTORLESS, 'auditService.logAction')} names no actor`,
    ],
  },
  {
    name: 'FAILS when the actor key is there and empty (userId: undefined)',
    files: { 'authoring.router.ts': CHAINED_UNDEFINED_ACTOR },
    expectExit: 1,
    expectIn: ['FAIL — 1 unaudited', site('authoring.router.ts', CHAINED_UNDEFINED_ACTOR, 'DELETE FROM authoring_documents'), 'names no actor'],
  },
  {
    name: 'FAILS on an audit_events INSERT with no user_id column',
    files: { 'ind.ts': IND_NO_ACTOR_COLUMN },
    expectExit: 1,
    expectIn: ['FAIL — 1 unaudited', site('ind.ts', IND_NO_ACTOR_COLUMN, 'DELETE FROM ind_applications'), 'names no actor'],
  },
  {
    name: "FAILS on writeMutation with null in the actor's position",
    files: { 'c2c/documents.ts': WRITE_MUTATION_NULL_ACTOR },
    expectExit: 1,
    expectIn: ['FAIL — 1 unaudited', site('c2c/documents.ts', WRITE_MUTATION_NULL_ACTOR, 'DELETE FROM c2c_document_section_evidence'), 'names no actor'],
  },

  /* --------------------------------------------------------- ALLOW-LIST - */
  {
    name: 'quiet — an allow-list entry with a written justification suppresses its file',
    files: { 'ind.ts': IND_UNAUDITED },
    allowlist: { 'server/routes/ind.ts': 'Selftest: tracked under PRODUCT_QC_REVIEW Part 11, audit lands with the IND rewrite.' },
    expectExit: 0,
    expectIn: ['OK'],
  },
  {
    name: "FAILS on a file the allow-list does not name — an entry covers its own file only",
    files: { 'ind.ts': IND_UNAUDITED, 'coauthor.ts': MASKED, 'legacy/ind.ts': IND_UNAUDITED },
    allowlist: { 'server/routes/ind.ts': 'Selftest: tracked under PRODUCT_QC_REVIEW Part 11.' },
    expectExit: 1,
    expectIn: [
      'FAIL — 2 unaudited',
      site('coauthor.ts', MASKED, 'DELETE FROM coauthor_documents'),
      site('legacy/ind.ts', IND_UNAUDITED, 'DELETE FROM ind_applications'),
    ],
    expectNotIn: [site('ind.ts', IND_UNAUDITED, 'DELETE FROM ind_applications')],
  },
  {
    name: 'FAILS when the allow-list entry carries an empty justification',
    files: { 'ind.ts': IND_UNAUDITED },
    allowlist: { 'server/routes/ind.ts': '' },
    expectExit: 1,
    expectIn: ['FAIL — 1 unaudited', site('ind.ts', IND_UNAUDITED, 'DELETE FROM ind_applications')],
  },

  /* ------------------------------------------------------------ GREEN --- */
  {
    name: 'quiet — ind.ts as shipped: audit_events INSERT in the delete transaction (after the delete)',
    files: { 'ind.ts': IND_AUDITED },
    expectExit: 0,
    expectIn: ['OK'],
  },
  {
    name: 'quiet — authoring governed delete with writeChainedAuditRow (2026-10-01)',
    files: { 'authoring.router.ts': AUTHORING_CHAINED },
    expectExit: 0,
    expectIn: ['OK'],
  },
  {
    name: 'quiet — coauthor delete with recordCoauthorDocumentEvent',
    files: { 'coauthor.ts': COAUTHOR_EVENT, 'ectd-documents.ts': COAUTHOR_EVENT },
    expectExit: 0,
    expectIn: ['OK'],
  },
  {
    name: 'quiet — c2c evidence unlink with writeMutation on the same client',
    files: { 'c2c/documents.ts': C2C_EVIDENCE_WRITE_MUTATION },
    expectExit: 0,
    expectIn: ['OK'],
  },
  {
    name: "quiet — a delete inside governedQmsWrite's callback, no audit call in its window, ')' in a string and a comment",
    files: { 'tenant-ctq-factors.ts': CTQ_GOVERNED },
    expectExit: 0,
    expectIn: ['OK'],
  },
  {
    name: 'quiet — route registrations, SELECTs, comments and look-alike tables are not regulated deletes',
    files: { 'qms.ts': NEAR_MISSES },
    expectExit: 0,
    expectIn: ['OK'],
  },
  {
    name: 'quiet — test fixtures under __tests__/ and *.test.ts are not scanned',
    files: {
      '__tests__/qms-subrouters-governed.test.ts': "await pg.exec(`DELETE FROM qmp_section_gating; DELETE FROM ctq_factors; DELETE FROM quality_management_plans;`);\n",
      '__tests__/helpers/reset.ts': "await pg.exec('DELETE FROM coauthor_documents;');\n",
      'ind.delete.test.ts': "await client.query('DELETE FROM ind_applications');\n",
    },
    expectExit: 0,
    expectIn: ['OK'],
  },
];

/* ------------------------------------------------------------------- run --- */

if (process.env.SELFTEST_GATE_PATH) console.log(`${TAG} testing ${GATE} (SELFTEST_GATE_PATH)`);

let failed = 0;
const started = Date.now();
for (const c of cases) {
  clearRoutes();
  for (const [rel, body] of Object.entries(c.files)) writeRoute(rel, body);
  let problems;
  let res = { code: null, out: '', stdout: '' };
  try {
    res = runGate({ allowlist: c.allowlist ?? {}, args: c.args ?? [] });
    problems = [];
    if (res.code !== c.expectExit) problems.push(`expected exit ${c.expectExit}, got ${res.code}`);
    for (const s of c.expectIn) if (!has(res.out, s)) problems.push(`output lacked: ${JSON.stringify(s)}`);
    for (const s of c.expectNotIn ?? []) if (has(res.out, s)) problems.push(`output wrongly named: ${JSON.stringify(s)}`);
    if (c.extra) problems.push(...c.extra(res.out, res.stdout));
  } catch (err) {
    problems = [`selftest could not run the case: ${err.message}`];
  }
  const ok = problems.length === 0;
  console.log(`  ${ok ? '✓' : '✗'} ${c.name}`);
  if (!ok) {
    failed++;
    for (const p of problems) console.log(`      ${p}`);
    if (res.out) console.log(res.out.trimEnd().split('\n').map((l) => `      | ${l}`).join('\n'));
  }
}

fs.rmSync(tmp, { recursive: true, force: true });

const secs = ((Date.now() - started) / 1000).toFixed(1);
if (failed) {
  console.error(`\n${TAG} FAIL — ${failed}/${cases.length} case(s) did not hold (${secs}s).`);
  process.exit(1);
}
console.log(`\n${TAG} ${cases.length} passed — the gate fails on what it exists to catch. (${secs}s)`);
