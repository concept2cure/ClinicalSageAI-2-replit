/** Append a verified plan to the current document through the canonical section writer. */
import type { AssemblyCommitData, AssemblyCommitInput, AssemblyPlan, AssemblyPreviewInput, AssemblySection } from '../../../shared/authoring/assembly';
import type { CreateContext } from './authoring-documents';
import { refuseSectionParent } from './authoring-documents';
import { authorizeAuthoringProgram, AuthoringProgramAccessError } from './authoring-program-access';
import { decideAuthoringPermission, type AuthoringPrincipal } from './authoring-permissions';
import { reserveWritableDocument, DocumentWriteReservationError } from './document-lock';
import { insertSectionSeedTx } from './authoring-section-seed';
import { describeRefusedFigures, refusedFigures } from './authoring-html-sanitizer';
import type { Queryable } from './authoring-evidence';
import { AssemblyError, buildAssemblyPlan, parseAssemblyInput, type AssemblyDocument, type AssemblyStoredSection, type AssemblyTemplate } from './authoring-assembly-plan';
import { resolveAssemblyTemplate } from './authoring-assembly-source';

export type AssemblyOutcome<T> = { ok: true; data: T } | { ok: false; status: number; code: string; message: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
interface AssemblyTarget { docId: string; input: AssemblyPreviewInput; lock: boolean }

function outcome(error: unknown): AssemblyOutcome<never> {
  if (error instanceof AssemblyError || error instanceof AuthoringProgramAccessError || error instanceof DocumentWriteReservationError) {
    return { ok: false, status: error.status, code: error.code, message: error.message };
  }
  return { ok: false, status: 503, code: 'ASSEMBLY_UNAVAILABLE', message: 'The document build could not be verified or completed. Check the saved document before trying again.' };
}

async function currentContext(q: Queryable, ctx: CreateContext, principal: AuthoringPrincipal | null, programId: string): Promise<{ context: CreateContext; principal: AuthoringPrincipal }> {
  if (!principal || principal.id !== ctx.actor.id) throw new AssemblyError(401, 'ASSEMBLY_ACTOR_REQUIRED', 'A signed-in organization member is required.');
  const admitted = await authorizeAuthoringProgram(q, { tenantId: ctx.tenantId, actor: ctx.actor, principal, programId });
  const user = await q.query(`SELECT u.email FROM users u JOIN organization_users ou ON ou.user_id=u.id
    WHERE u.id=$1 AND ou.organization_id=$2 AND u.status='active'`, [ctx.actor.id, ctx.tenantId]);
  if (user.rows.length !== 1) throw new AssemblyError(403, 'ASSEMBLY_ACTOR_REQUIRED', 'Your current organization membership could not be verified.');
  const email = typeof user.rows[0].email === 'string' ? user.rows[0].email.toLowerCase() : null;
  const actor = { ...ctx.actor, email };
  return { principal: { ...admitted.principal, email }, context: { ...ctx, actor,
    audit: { ...ctx.audit, actorEmail: email ?? 'unknown', actorRole: admitted.role } } };
}

async function target(q: Queryable, ctx: CreateContext, principal: AuthoringPrincipal, args: AssemblyTarget): Promise<{ doc: AssemblyDocument; sections: AssemblyStoredSection[] }> {
  const { docId, input, lock } = args;
  const documentSql = lock
    ? `SELECT d.* FROM authoring_documents d WHERE d.id=$1 AND d.tenant_id=$2
       AND d.client_program_id=$3 FOR UPDATE OF d`
    : `SELECT d.* FROM authoring_documents d WHERE d.id=$1 AND d.tenant_id=$2
       AND d.client_program_id=$3`;
  const result = await q.query(documentSql, [docId, ctx.tenantId, input.programId]);
  const doc = result.rows[0] as AssemblyDocument | undefined;
  if (!doc) throw new AssemblyError(404, 'ASSEMBLY_DOCUMENT_NOT_FOUND', 'The document was not found in this project. Nothing was changed.');
  if (doc.locked_at != null) throw new AssemblyError(403, 'DOCUMENT_FROZEN', 'This document is locked. Create a new version before building. Nothing was changed.');
  // Lock existing grants before evaluating the canonical decision; revocation
  // must not pass between that decision and the section writes.
  if (lock) await q.query('SELECT id FROM doc_permissions WHERE doc_id=$1 AND tenant_id=$2 FOR SHARE', [docId, ctx.tenantId]);
  const permission = await decideAuthoringPermission({ pool: q, principal, action: 'edit', scope: {
    tenantId: ctx.tenantId, docId, sectionId: null, documentStatus: doc.status, createdBy: String(doc.created_by ?? ''),
  } });
  if (!permission.allowed) throw new AssemblyError(403, 'ASSEMBLY_EDIT_DENIED', 'Current document editing permission is required, and the document must be editable. Nothing was changed.');
  const sectionSql = lock
    ? `SELECT * FROM authoring_sections WHERE doc_id=$1 AND tenant_id=$2
       ORDER BY order_index,created_at,id FOR UPDATE`
    : `SELECT * FROM authoring_sections WHERE doc_id=$1 AND tenant_id=$2
       ORDER BY order_index,created_at,id`;
  const sections = (await q.query(sectionSql, [docId, ctx.tenantId])).rows as AssemblyStoredSection[];
  return { doc, sections };
}

async function scopedPlan(q: Queryable, ctx: CreateContext, principal: AuthoringPrincipal | null, args: AssemblyTarget) {
  const { docId, input, lock } = args;
  if (!UUID.test(docId)) throw new AssemblyError(400, 'ASSEMBLY_DOCUMENT_INVALID', 'Choose an exact saved document.');
  const current = await currentContext(q, ctx, principal, input.programId);
  const saved = await target(q, current.context, current.principal, args);
  const template = await resolveAssemblyTemplate(q, ctx.tenantId, input.templateId, saved.doc, lock);
  const plan = buildAssemblyPlan(saved.doc, saved.sections, template, input);
  // An unbound document needs no filing lookup; a bound target must pass the
  // canonical market/common rule without its historical fail-soft fallback.
  if (saved.doc.c2c_document_id) {
    for (const row of plan.rows) {
      const refusal = await refuseSectionParent(q, ctx.tenantId, saved.doc, docId, { code: row.code.trim().toUpperCase(), strict: true });
      if (refusal) throw new AssemblyError(refusal.status, refusal.code ?? 'ASSEMBLY_SCOPE_DENIED', refusal.error);
    }
  }
  return { ...saved, context: current.context, template, plan };
}

export async function previewAuthoringAssembly(ctx: CreateContext, principal: AuthoringPrincipal | null, docId: string, raw: unknown): Promise<AssemblyOutcome<AssemblyPlan>> {
  try {
    const input = parseAssemblyInput(raw);
    const read = await scopedPlan(ctx.pool, ctx, principal, { docId, input, lock: false });
    // Later template reads cannot keep access alive after a membership,
    // project-sharing or document-grant change during this preview.
    const fresh = await currentContext(ctx.pool, ctx, principal, input.programId);
    await target(ctx.pool, fresh.context, fresh.principal, { docId, input, lock: false });
    return { ok: true, data: read.plan };
  } catch (error) { return outcome(error); }
}

function sectionReceipt(row: Record<string, unknown>): AssemblySection {
  return { id: String(row.id), doc_id: String(row.doc_id), code: String(row.code), title: String(row.title),
    content: row.content == null ? '' : String(row.content), order_index: Number(row.order_index),
    updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : typeof row.updated_at === 'string' ? row.updated_at : null };
}

async function appendRows(q: Queryable, ctx: CreateContext, args: { plan: AssemblyPlan; template: AssemblyTemplate; existing: AssemblyStoredSection[]; reason: string }): Promise<AssemblySection[]> {
  const { plan, template, existing, reason } = args;
  const receipts: AssemblySection[] = [];
  for (const row of plan.rows) {
    if (row.disposition === 'preserve') {
      const saved = existing.find(section => section.id === row.existingSectionId);
      if (!saved) throw new AssemblyError(409, 'ASSEMBLY_CHANGED', 'The saved section identity changed. Preview again. Nothing was changed.');
      receipts.push(sectionReceipt(saved));
      continue;
    }
    const figures = await refusedFigures(row.content);
    if (figures.length) throw new AssemblyError(409, 'ASSEMBLY_TEMPLATE_CONTENT_REFUSED', describeRefusedFigures(figures));
    const saved = await insertSectionSeedTx(ctx, q, plan.docId, {
      code: row.code, title: row.title, content: row.content, orderIndex: row.ordering, changeReason: reason,
      metadata: { ...template.metadataFor(row.code), assembly: { version: 1, docId: plan.docId, programId: plan.programId,
        templateId: plan.templateId, templateSnapshot: plan.templateSnapshot, fingerprint: plan.fingerprint } },
      lineage: { machineDraft: null },
    });
    receipts.push(sectionReceipt(saved));
  }
  return receipts;
}

async function commitOnClient(q: Queryable, ctx: CreateContext, principal: AuthoringPrincipal | null, docId: string, input: AssemblyCommitInput): Promise<AssemblyCommitData> {
  const current = await scopedPlan(q, ctx, principal, { docId, input, lock: true });
  if (current.plan.fingerprint !== input.fingerprint) throw new AssemblyError(409, 'ASSEMBLY_CHANGED', 'The document or template changed since this plan was shown. Preview again before building. Nothing was changed.');
  if (current.plan.rows.some(row => row.disposition === 'append')) {
    // The hash comparison above uses the parent BEFORE this canonical touch.
    await reserveWritableDocument(q, docId, ctx.tenantId);
  }
  const sections = await appendRows(q, current.context, { plan: current.plan, template: current.template, existing: current.sections, reason: input.reason });
  // Project-sharing state may change while evidence is written. Re-admit
  // before COMMIT; membership, parent and object grants remain reserved here.
  await currentContext(q, current.context, principal, input.programId);
  return { docId, programId: input.programId, plan: current.plan, sections };
}

export async function commitAuthoringAssembly(ctx: CreateContext, principal: AuthoringPrincipal | null, docId: string, raw: unknown): Promise<AssemblyOutcome<AssemblyCommitData>> {
  let client: (Queryable & { release: (error?: Error) => void }) | undefined;
  let discard: Error | undefined;
  let commitAttempted = false;
  let committed = false;
  try {
    const input = parseAssemblyInput(raw, true) as AssemblyCommitInput;
    client = await ctx.pool.connect();
    await client.query('BEGIN');
    const data = await commitOnClient(client, ctx, principal, docId, input);
    commitAttempted = true;
    await client.query('COMMIT');
    committed = true;
    // The write may stand while current project/document access changes.
    // Re-admit before returning the held private plan or section content.
    const fresh = await currentContext(client, ctx, principal, input.programId);
    await target(client, fresh.context, fresh.principal, { docId, input, lock: false });
    return { ok: true, data };
  } catch (error) {
    if (commitAttempted) {
      // As on canonical document creation, a lost COMMIT response is not
      // permission to send ROLLBACK or reuse a connection with unknown state.
      if (!committed) discard = new Error('Assembly commit could not be confirmed');
      return outcome(null);
    }
    if (client) await client.query('ROLLBACK').catch(() => { discard = new Error('Assembly rollback could not be confirmed'); });
    return outcome(error);
  } finally { client?.release(discard); }
}
