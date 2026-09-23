/**
 * Authoring documents — the one place a document or a section is CREATED in
 * the authoring store (WM, 2026-09-21, docs/design/ANA_DOCUMENT_CANVAS.md).
 *
 * `createDocument` and `createSection` are the bodies of `POST /docs` and
 * `POST /sections` in server/routes/authoring.router.ts, moved here without a
 * behaviour change: the same statements in the same order on the same
 * executor, the same refusals, the same evidence rows. The router maps the
 * outcomes to HTTP. `insertDocumentTx` is the create transaction both share
 * with authoring-from-draft.ts, so an AnA-built document IS an authoring
 * document (draft status, sections, provenance) and nothing writes a second
 * store.
 *
 * Nothing here imports the database: every entry point takes the pool it
 * should use, so the router's mocked or PGlite-backed pool reaches these
 * functions unchanged and the tool passes the real one.
 */

import crypto from 'crypto';
import type { Pool } from 'pg';
import { createScopedLogger } from '../../utils/logger';
import { resolveGovernedDocument } from '../c2c/governed-document-binding.js';
import {
  canonicalIdFor,
  recordDocumentAlias,
  DocumentAliasConflictError,
} from '../c2c/document-alias-map.js';
import { enforceAuthorLineage } from '../clinical-regulatory-evidence/lineage-gate';
import { grantAuthoringPermission } from './authoring-permissions';
import { sectionInsertIndex } from '../../../shared/regulatory/section-code';
import { LOCKED_DOCUMENT_STATUSES } from './document-lock';
import {
  bindingColumnState,
  createRevision,
  writeAuthoringAuditTrail,
  type AuthoringAuditContext,
  type Queryable,
} from './authoring-evidence';

const logger = createScopedLogger('authoring-documents');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The pool as these functions need it: queries, and a client for a transaction. */
export type AuthoringPool = Pool;

type TxClient = Queryable & { release: () => void };

/** The verified principal creating the record. */
export interface AuthoringActor {
  /** getActorId(req) — the JWT subject, or the tool's user id as a string. */
  id: string;
  /** Lower-cased email when the principal carries one; null otherwise. */
  email: string | null;
}

export interface CreateContext {
  pool: AuthoringPool;
  tenantId: number;
  actor: AuthoringActor;
  audit: AuthoringAuditContext;
}

export type Refusal = { kind: 'refused'; status: 400 | 403 | 404 | 503; error: string };

export interface Binding {
  documentId: string | null;
  reason?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Template resolution and governed binding (POST /docs)
// ─────────────────────────────────────────────────────────────────────────────

export interface TemplateSectionSeed {
  code: string;
  title: string;
  content: string;
  ordering: number;
}

/**
 * Resolve the template BEFORE anything is written.
 *
 * Two template stores are legitimate here and the picker offers both: the
 * GLOBAL regulatory reference store (intelligence.document_templates —
 * structure + guidance, no prose) and the org's own authoring_templates
 * (tenant-scoped, sections WITH content). A create that cannot honor its
 * chosen template must refuse before the INSERT, not lie after it.
 */
async function resolveTemplateSections(
  pool: AuthoringPool,
  tenantId: number,
  templateId: string,
): Promise<TemplateSectionSeed[] | Refusal> {
  if (!UUID_RE.test(templateId)) {
    return { kind: 'refused', status: 400, error: 'template_id must be a valid UUID' };
  }
  // (a) The global reference store. Deliberately no tenant filter — these
  // templates describe agency expectations, not customer content; tenancy
  // comes from the document being created. FAIL SOFT to zero rows when the
  // intelligence schema is absent (a separate bundle, missing in some
  // deployments and the authoring harness).
  let globalSections: { rows: any[] } = { rows: [] };
  try {
    globalSections = await pool.query(
      `SELECT ts.section_code, ts.section_title, ts.ordering
         FROM intelligence.template_sections ts
        WHERE ts.template_id = $1
        ORDER BY ts.ordering`,
      [templateId],
    );
  } catch (intelErr) {
    logger.warn('Global template store unavailable during create; trying the org store', {
      error: intelErr instanceof Error ? intelErr.message : String(intelErr),
    });
  }
  if (globalSections.rows.length > 0) {
    return globalSections.rows.map((r: any, i: number) => ({
      code: String(r.section_code),
      title: String(r.section_title),
      // Structure and guidance only — the honest scaffold starts empty.
      content: '',
      ordering: Number.isFinite(Number(r.ordering)) ? Number(r.ordering) : i,
    }));
  }
  // (b) The org's own template store (tenant-scoped, carries content).
  const orgTemplate = await pool.query(
    `SELECT template_content FROM authoring_templates
      WHERE id = $1 AND tenant_id = $2 AND is_active = true`,
    [templateId, tenantId],
  );
  const orgSections = orgTemplate.rows[0]?.template_content?.sections;
  if (Array.isArray(orgSections) && orgSections.length > 0) {
    return orgSections.map((s: any, i: number) => ({
      code: String(s.code ?? ''),
      title: String(s.title ?? ''),
      content: typeof s.content === 'string' ? s.content : '',
      ordering: Number.isFinite(Number(s.order_index)) ? Number(s.order_index) : i,
    }));
  }
  return {
    kind: 'refused',
    status: 404,
    // The client appends its own "Nothing was persisted." on every failed
    // create — the reason must not restate it (double-period, said twice).
    error: 'No template with this id has any sections in your organization or the global reference store.',
  };
}

/** The reason a document is created in its project without a filing binding. */
const filingAlreadyHeld = (filingId: string, holder: string): string =>
  `The project's governed filing ${filingId} is already the filing of authoring document ${holder}, ` +
  'so this document is created in the project as an unbound working document. A project holds ' +
  'many working documents and one editing copy per filing.';

/**
 * GOVERNED BINDING. c2c_documents is the system of record for a regulatory
 * filing; this stack is the editing layer over it. Read-only resolution: it
 * never CREATES a governed document. FAIL SOFT: binding is an enhancement,
 * never a precondition for creating a document — a governance lookup that
 * cannot run degrades to an unbound document with a stated reason. Then the
 * column check: referenced only when the binding resolved AND the column
 * exists (commit-section-to-filing.ts makes the same check on the write half).
 *
 * ONE FILING, ONE EDITING COPY (control tower, 2026-09-21). The resolver
 * returns the project's single filing of its class, and the alias map keeps
 * one canonical document per (store, native id) — so the SECOND document
 * created in a project used to collide on that filing's alias and be refused
 * 409 DOCUMENT_ALIAS_CONFLICT, and every further document had to be created
 * org-wide, where the open project never listed it. A project must hold many
 * documents (510(k) Summary, SE discussion, cybersecurity summary; IB,
 * protocol synopsis, Module 2.5). The filing keeps exactly one editing copy —
 * `commitSectionToFiling` writes a bound document's sections into the filing's
 * slots by code, and two bound documents would fight over them — and every
 * other document is created IN the project (client_program_id) unbound, with
 * the reason stated. The first document's binding is unchanged.
 */
export async function resolveBinding(
  pool: AuthoringPool,
  tenantId: number,
  clientProgramId: string | null,
): Promise<Binding> {
  let binding: Binding;
  try {
    binding = await resolveGovernedDocument({ db: pool, orgId: tenantId, projectId: clientProgramId });
  } catch (bindErr) {
    logger.warn('Governed-document binding unavailable; creating unbound document', {
      error: bindErr instanceof Error ? bindErr.message : String(bindErr),
      clientProgramId,
    });
    return {
      documentId: null,
      reason: 'The governance store could not be reached, so this document is not bound to a filing.',
    };
  }
  if (!binding.documentId) return binding;
  const state = await bindingColumnState(pool);
  if (state !== 'present') {
    /* The caller is told the truth about what it got: a document that is NOT
       bound to a filing, and why. The two reasons are kept apart — a check that
       threw establishes nothing about the deployment. */
    return {
      documentId: null,
      reason:
        state === 'absent'
          ? 'This deployment has no c2c_document_id column on authoring_documents, so the ' +
            'document was created without a binding to a filing.'
          : 'Whether this deployment carries the c2c_document_id column could not be ' +
            'checked, so the document was created without a binding to a filing.',
    };
  }
  const holder = await canonicalIdFor(pool, {
    organizationId: tenantId,
    store: 'c2c_documents',
    nativeId: String(binding.documentId),
  });
  if (holder.available && holder.canonicalId) {
    return { documentId: null, reason: filingAlreadyHeld(String(binding.documentId), holder.canonicalId) };
  }
  return binding;
}

// ─────────────────────────────────────────────────────────────────────────────
// The create transaction
// ─────────────────────────────────────────────────────────────────────────────

export interface DocumentRowSpec {
  docId: string;
  title: string;
  module: string;
  productCode: string | null;
  locale: string;
  templateId: string | null;
  clientProgramId: string | null;
  binding: Binding;
  /** Set only by the from-draft path; the column is referenced only then. */
  provenance?: Record<string, unknown>;
}

/** One section to seed into a new document, inside its create transaction. */
export interface SectionSeed {
  code: string;
  title: string;
  content: string;
  orderIndex: number;
  /** The audit row's change reason and metadata for this seed. */
  changeReason: string;
  metadata: Record<string, unknown>;
  /** Non-human contributors recorded on the genesis revision. */
  contributors?: { id: string; name: string }[];
  /** Enlist the lineage gate — the from-draft path, where content is prose. */
  lineage?: { machineDraft: { authorId: string } | null };
}

/**
 * Record the document's identity aliases (Document Identity Contract, slice
 * C2). The authoring uuid IS the canonical id, recorded as its own alias; a
 * bound governed c2c document is the same document in that store.
 *
 * Returns the binding as it stands after the write. A fork on the filing's
 * alias — two creates racing for the same filing after resolveBinding's
 * check — is not refused: the loser is demoted to an unbound document in its
 * project, in this transaction, with the reason stated (see resolveBinding).
 */
async function recordAliasesTx(client: Queryable, tenantId: number, spec: DocumentRowSpec): Promise<Binding> {
  const selfAlias = await recordDocumentAlias(client, {
    organizationId: tenantId,
    canonicalId: spec.docId,
    store: 'authoring_documents',
    nativeId: spec.docId,
  });
  if (!selfAlias.recorded && selfAlias.reason === 'relation_absent') {
    logger.warn('Document alias map absent; document created without cross-store identity', {
      docId: spec.docId,
      migration: 'migrations/20260814d_document_alias_map.sql',
    });
    return spec.binding;
  }
  if (!spec.binding.documentId) return spec.binding;
  try {
    await recordDocumentAlias(client, {
      organizationId: tenantId,
      canonicalId: spec.docId,
      store: 'c2c_documents',
      nativeId: String(spec.binding.documentId),
    });
    return spec.binding;
  } catch (err) {
    if (!(err instanceof DocumentAliasConflictError)) throw err;
    await client.query(
      'UPDATE authoring_documents SET c2c_document_id = NULL WHERE id = $1 AND tenant_id = $2',
      [spec.docId, tenantId],
    );
    const holder = await canonicalIdFor(client, {
      organizationId: tenantId,
      store: 'c2c_documents',
      nativeId: String(spec.binding.documentId),
    });
    const holderId = holder.available && holder.canonicalId ? holder.canonicalId : 'another document';
    return { documentId: null, reason: filingAlreadyHeld(String(spec.binding.documentId), holderId) };
  }
}

/**
 * The create transaction: the document, its identity aliases, its section
 * skeleton and their Part 11 evidence land together or not at all. Was the
 * BEGIN/COMMIT block of POST /docs; the seeding loop now takes the seeds it
 * writes as data so the template path and the draft path share it.
 */
export async function insertDocumentTx(
  ctx: CreateContext,
  spec: DocumentRowSpec,
  seeds: SectionSeed[],
): Promise<{ document: Record<string, unknown>; binding: Binding }> {
  const { pool, tenantId, actor } = ctx;
  // Build the INSERT so the program-scope / binding / provenance columns are
  // referenced ONLY when supplied, so a create without them emits the exact
  // original statement and databases lacking those migrations keep working.
  const cols = ['id', 'title', 'module', 'product_code', 'locale', 'status', 'created_by', 'created_at', 'updated_at', 'tenant_id', 'template_id'];
  const vals = ['$1', '$2', '$3', '$4', '$5', `'draft'`, '$6', 'NOW()', 'NOW()', '$7', '$8'];
  const args: unknown[] = [spec.docId, spec.title, spec.module, spec.productCode, spec.locale, actor.id, tenantId, spec.templateId];
  const addCol = (col: string, value: unknown, cast = '') => {
    args.push(value);
    cols.push(col);
    vals.push(`$${args.length}${cast}`);
  };
  if (spec.clientProgramId) addCol('client_program_id', spec.clientProgramId);
  if (spec.binding.documentId) addCol('c2c_document_id', spec.binding.documentId);
  if (spec.provenance) addCol('provenance', JSON.stringify(spec.provenance), '::jsonb');

  const client: TxClient = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `INSERT INTO authoring_documents (${cols.join(', ')})
       VALUES (${vals.join(', ')})
       RETURNING *`,
      args,
    );
    const binding = await recordAliasesTx(client, tenantId, spec);
    const document = { ...result.rows[0], ...(binding.documentId ? {} : spec.binding.documentId ? { c2c_document_id: null } : {}) };

    // Every write to a regulated section produces its Part 11 evidence — a
    // section that appears in a document with no record of how it got there
    // is precisely the §11.10(e) gap the audit trail exists to close.
    for (const s of seeds) {
      const seededRow = await client.query(
        `INSERT INTO authoring_sections (id, doc_id, code, title, content, order_index, created_at, updated_at, tenant_id)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, NOW(), NOW(), $6)
         RETURNING id, code, content`,
        [spec.docId, s.code, s.title, s.content, s.orderIndex, tenantId],
      );
      const row = seededRow.rows[0];
      if (s.lineage) {
        await enforceAuthorLineage(
          client,
          tenantId,
          { documentTable: 'authoring_sections', documentId: String(row.id) },
          s.content,
          actor.id,
          s.lineage.machineDraft ? { machineDraft: s.lineage.machineDraft } : undefined,
        );
      }
      await createRevision(client, {
        sectionId: row.id,
        content: row.content ?? '',
        updatedBy: actor.id,
        tenantId,
        origin: 'genesis',
        contributors: s.contributors ?? [],
      });
      await writeAuthoringAuditTrail(ctx.audit, {
        docId: spec.docId,
        sectionId: row.id,
        operationType: 'CREATE',
        beforeContent: null,
        afterContent: row.content ?? '',
        changeReason: s.changeReason,
        metadata: { ...s.metadata, section_code: row.code },
        executor: client,
      });
    }
    await client.query('COMMIT');
    return { document, binding };
  } catch (txErr) {
    await client.query('ROLLBACK').catch(() => {});
    throw txErr;
  } finally {
    client.release();
  }
}

/**
 * Creator ownership — the mandatory companion to the per-user permission
 * matrix: a document whose creator holds no grant is a document nobody can
 * edit. Best-effort AND outside the transaction, deliberately: a failed grant
 * must not fail (or roll back) document creation, but it is logged as an ERROR
 * because a grant-store outage means the creator will hit a 403 on their next
 * edit.
 */
export async function grantCreatorOwnership(ctx: CreateContext, docId: string): Promise<void> {
  try {
    for (const role of ['OWNER', 'AUTHOR'] as const) {
      await grantAuthoringPermission({
        pool: ctx.pool,
        tenantId: ctx.tenantId,
        docId,
        sectionId: null,
        principalId: ctx.actor.id,
        email: ctx.actor.email,
        role,
        grantedBy: ctx.actor.id,
        reason: 'Document creator',
      });
    }
  } catch (grantErr) {
    logger.error('creator ownership grant failed; creator will be denied on next edit', {
      docId,
      error: grantErr instanceof Error ? grantErr.message : String(grantErr),
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// createDocument — the body of POST /docs
// ─────────────────────────────────────────────────────────────────────────────

export interface CreateDocumentInput {
  title?: unknown;
  module?: unknown;
  product_code?: unknown;
  locale?: unknown;
  template_id?: unknown;
  client_program_id?: unknown;
}

export type CreateDocumentOutcome =
  | Refusal
  | {
      kind: 'created';
      document: Record<string, unknown>;
      /** How many sections the chosen template seeded; null for a blank create. */
      templateSectionCount: number | null;
      binding: Binding;
    };

/** POST /docs. The caller has already resolved the actor (401 without one). */
export async function createDocument(ctx: CreateContext, input: CreateDocumentInput): Promise<CreateDocumentOutcome> {
  const { title, module = 'M3', product_code, locale = 'en-US', template_id, client_program_id } = input;
  const docId = crypto.randomUUID();

  if (!title) return { kind: 'refused', status: 400, error: 'Document title is required' };

  // Reject a malformed program id with a clean 400 rather than letting the
  // UUID column cast throw a 500. Cross-org mis-scoping is already prevented
  // downstream: every read is gated on tenant_id.
  if (client_program_id !== undefined && client_program_id !== null && !UUID_RE.test(String(client_program_id))) {
    return { kind: 'refused', status: 400, error: 'client_program_id must be a valid UUID' };
  }

  let templateSections: TemplateSectionSeed[] | null = null;
  if (template_id) {
    const resolved = await resolveTemplateSections(ctx.pool, ctx.tenantId, String(template_id));
    if (!Array.isArray(resolved)) return resolved;
    templateSections = resolved;
  }

  const clientProgramId = client_program_id ? String(client_program_id) : null;
  const resolvedBinding = await resolveBinding(ctx.pool, ctx.tenantId, clientProgramId);

  const { document, binding } = await insertDocumentTx(
    ctx,
    {
      docId,
      title: String(title),
      module: String(module),
      productCode: product_code == null ? null : String(product_code),
      locale: String(locale),
      templateId: template_id ? String(template_id) : null,
      clientProgramId,
      binding: resolvedBinding,
    },
    // Global templates seed structure with empty content (the honest scaffold);
    // org templates seed the content their rows carry. Seeding is a CREATE like
    // any other and gets its evidence rows.
    (templateSections ?? []).map((s) => ({
      code: s.code,
      title: s.title,
      content: s.content,
      orderIndex: s.ordering,
      changeReason: 'Seeded from template',
      metadata: { template_id, seeded: true },
    })),
  );
  await grantCreatorOwnership(ctx, docId);

  return {
    kind: 'created',
    document,
    templateSectionCount: templateSections ? templateSections.length : null,
    binding,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// createSection — the body of POST /sections
// ─────────────────────────────────────────────────────────────────────────────

export interface CreateSectionInput {
  doc_id?: unknown;
  code?: unknown;
  title?: unknown;
  content?: unknown;
  order_index?: unknown;
  changeReason?: unknown;
}

export type CreateSectionOutcome =
  | Refusal
  | { kind: 'lineage_failed' }
  | { kind: 'created'; section: Record<string, unknown> };

/** POST /sections. The caller has already resolved the actor (401 without one). */
export async function createSection(ctx: CreateContext, input: CreateSectionInput): Promise<CreateSectionOutcome> {
  const { pool, tenantId, actor } = ctx;
  const { doc_id, code, title, content = '' } = input;
  /* `order_index` was defaulted to 0 and no client sends one, so every section
     of every document was created at the same index (MDX_WORK_ORDER W1-2). An
     explicitly supplied index is still honoured; only the DEFAULT changes,
     from "0" to "where this code belongs". Resolved inside the transaction. */
  const requestedOrderIndex: number | undefined = Number.isFinite(Number(input.order_index))
    ? Number(input.order_index)
    : undefined;
  const sectionId = crypto.randomUUID();

  if (!doc_id || !code || !title) {
    return { kind: 'refused', status: 400, error: 'doc_id, code, and title are required' };
  }

  // The same Part 11 immutability lock the /sections/:sectionId guard applies
  // (C2C-AUTHOR-001): adding a section to a FROZEN or APPROVED document alters
  // the record set a signature attests to. Resolving the parent in-tenant first
  // also turns a foreign/unknown doc_id into a clean 404.
  const parentDoc = await pool.query(
    `SELECT status FROM authoring_documents WHERE id = $1 AND tenant_id = $2`,
    [doc_id, tenantId],
  );
  if ((parentDoc.rowCount ?? 0) === 0) return { kind: 'refused', status: 404, error: 'Document not found' };
  const parentStatus = String((parentDoc.rows[0] as { status?: string | null }).status ?? '').toUpperCase();
  if (LOCKED_DOCUMENT_STATUSES.has(parentStatus)) {
    return { kind: 'refused', status: 403, error: 'Document is FROZEN/APPROVED; cannot add sections' };
  }

  // Create + lineage commit together, exactly like the interactive save gate:
  // a section created WITH authored content records its provenance in the same
  // transaction or is not created at all. An empty structural scaffold no-ops
  // the gate.
  const client: TxClient = await pool.connect();
  let result: { rows: any[] };
  try {
    await client.query('BEGIN');
    /* Where the new section goes. Relative, not absolute: a document someone
       has deliberately reordered keeps that order. Locked FOR UPDATE because two
       concurrent creates reading the same order would otherwise both compute
       the same index and land on top of each other. */
    let orderIndex = requestedOrderIndex;
    if (orderIndex === undefined) {
      const existing = await client.query(
        `SELECT id, code FROM authoring_sections
          WHERE doc_id = $1 AND tenant_id = $2
          ORDER BY order_index, created_at
          FOR UPDATE`,
        [doc_id, tenantId],
      );
      const codes = existing.rows.map((r: { code: string }) => String(r.code ?? ''));
      orderIndex = sectionInsertIndex(codes, String(code));
      // Everything at or after the insertion point moves down by one.
      await client.query(
        `UPDATE authoring_sections SET order_index = order_index + 1
          WHERE doc_id = $1 AND tenant_id = $2 AND order_index >= $3`,
        [doc_id, tenantId, orderIndex],
      );
    }

    result = await client.query(
      `INSERT INTO authoring_sections
       (id, doc_id, code, title, content, order_index, created_at, updated_at, tenant_id)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW(), $7)
       RETURNING *`,
      [sectionId, doc_id, code, title, content, orderIndex, tenantId],
    );
    await enforceAuthorLineage(
      client,
      tenantId,
      { documentTable: 'authoring_sections', documentId: sectionId },
      content as string,
      actor.id,
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    logger.error('Section create refused — content and lineage rolled back together', {
      sectionId,
      tenantId,
      err: err instanceof Error ? err.message : String(err),
    });
    return { kind: 'lineage_failed' };
  } finally {
    client.release();
  }

  // Genesis revision: this content, by this author.
  await createRevision(pool, { sectionId, content: content as string, updatedBy: actor.id, tenantId, origin: 'genesis' });
  await writeAuthoringAuditTrail(ctx.audit, {
    docId: doc_id as string,
    sectionId,
    operationType: 'CREATE',
    beforeContent: null,
    afterContent: (content as string) ?? null,
    changeReason: (input.changeReason as string | undefined) ?? null,
    metadata: { code, title },
  });

  return { kind: 'created', section: result.rows[0] };
}
