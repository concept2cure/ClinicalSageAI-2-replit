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
import { rejectAuthoringCreateTransaction, rollbackAuthoringTransaction, settleAuthoringTransactionFailure, type AuthoringCreateTransactionState } from './authoring-create-outcome';
import { AuthoringSectionWriteOutcomeError } from './authoring-section-outcome';
import { createScopedLogger } from '../../utils/logger';
import { resolveGovernedDocument } from '../c2c/governed-document-binding.js';
import { isRegionalSectionKey } from '../../../shared/regulatory/filing-scope.js';
import { programInOrganization } from '../c2c/program-access';
import { getBuiltinAuthoringTemplate } from './builtin-authoring-templates';
import { resolveTemplateSections, refuseBuiltinTemplateStart, builtinTemplateSource, builtinTemplateDocumentFields, builtinTemplateSectionMetadata, templateWorkingBinding, type TemplateSectionSeed } from './authoring-template-sections';
export type { TemplateSectionSeed } from './authoring-template-sections';
import {
  canonicalIdFor,
  recordDocumentAlias,
  DocumentAliasConflictError,
} from '../c2c/document-alias-map.js';
import { insertSectionSeedTx } from './authoring-section-seed';
import { grantAuthoringPermission } from './authoring-permissions';
import { describeRefusedFigures, refusedFigures, refusedKind } from './authoring-html-sanitizer';
import { isSectionCodeConflict, placeNewSection, sectionCodeExists } from './section-placement';
import { LOCKED_DOCUMENT_STATUSES, reserveWritableDocument, DocumentWriteReservationError } from './document-lock';
import {
  bindingColumnState,
  type AuthoringAuditContext,
  type Queryable,
} from './authoring-evidence';

const logger = createScopedLogger('authoring-documents');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The pool as these functions need it: queries, and a client for a transaction. */
export type AuthoringPool = Queryable & {
  connect(): Promise<Queryable & { release: (error?: Error) => void }>;
};

type TxClient = Queryable & { release: (error?: Error) => void };

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

export type AuthoringRefusal = { kind: 'refused'; status: 400 | 403 | 404 | 409 | 503; error: string; code?: string };

export interface Binding {
  documentId: string | null;
  reason?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Template resolution and governed binding (POST /docs)
// ─────────────────────────────────────────────────────────────────────────────

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
  marketDocumentId: string | null = null,
): Promise<Binding> {
  let binding: Binding;
  try {
    binding = await resolveGovernedDocument({ db: pool, orgId: tenantId, projectId: clientProgramId, marketDocumentId });
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
  module: string | null;
  productCode: string | null;
  locale: string;
  templateId: string | null;
  clientProgramId: string | null;
  binding: Binding;
  /** Set only by the from-draft path; the column is referenced only then. */
  provenance?: Record<string, unknown>;
  /** Internal source imports compose and validate one coherent MVCC snapshot. */
  isolation?: 'serializable';
}

/** One section to seed into a new document, inside its create transaction. */
export interface SectionSeed {
  code: string;
  title: string;
  content: string;
  orderIndex: number;
  /** The audit row's change reason and metadata for this seed. */
  changeReason: string | null;
  metadata: Record<string, unknown>;
  /** Non-human contributors recorded on the genesis revision. */
  contributors?: { id: string; name: string }[];
  /** Enlist the lineage gate — the from-draft path, where content is prose. */
  lineage?: {
    machineDraft: { authorId: string } | null;
    /**
     * The section's figures the cited Vault versions state (S5c), read after
     * beforeInsert has verified the sources: recorded as 'derived' lineage in
     * this transaction, beside the clause attribution.
     */
    figureSpans?: () => import('./draft-figure-check').FigureSpan[];
  };
}

function verifiedGenesisReceipt(spec: DocumentRowSpec): Record<string, unknown> | undefined {
  return spec.provenance?.importSource as Record<string, unknown> | undefined;
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

/** Reflect a binding refused by the canonical alias writer in the returned row. */
function documentWithRecordedBinding(row: Record<string, unknown>, binding: Binding, spec: DocumentRowSpec): Record<string, unknown> {
  if (!binding.documentId && spec.binding.documentId) return { ...row, c2c_document_id: null };
  return { ...row };
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
  beforeInsert?: (client: Queryable) => Promise<void>,
  afterInsert?: (client: Queryable) => Promise<void>,
): Promise<{ document: Record<string, unknown>; binding: Binding }> {
  const { pool, tenantId, actor } = ctx;
  const client: TxClient = await pool.connect();
  const transaction: AuthoringCreateTransactionState = { began: false, commitAttempted: false };
  try {
    transaction.began = true;
    await client.query(spec.isolation === 'serializable' ? 'BEGIN ISOLATION LEVEL SERIALIZABLE' : 'BEGIN');
    // Source eligibility must be checked/locked before any regulated write,
    // and before provenance is serialized into the INSERT arguments.
    await beforeInsert?.(client);
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

    const result = await client.query(
      `INSERT INTO authoring_documents (${cols.join(', ')})
       VALUES (${vals.join(', ')})
       RETURNING *`,
      args,
    );
    const binding = await recordAliasesTx(client, tenantId, spec);
    const document = documentWithRecordedBinding(result.rows[0], binding, spec);

    // Every write to a regulated section produces its Part 11 evidence — a
    // section that appears in a document with no record of how it got there
    // is precisely the §11.10(e) gap the audit trail exists to close.
    for (const s of seeds) {
      await insertSectionSeedTx(ctx, client, spec.docId, s, { verifiedImport: verifiedGenesisReceipt(spec) });
    }
    // A governed caller may enlist required ownership/binding writes in the
    // same transaction; their refusal must roll back the new editing copy.
    await afterInsert?.(client);
    transaction.commitAttempted = true;
    await client.query('COMMIT');
    transaction.began = false;
    return { document, binding };
  } catch (txErr) {
    const recovery = { organizationId: tenantId, programId: spec.clientProgramId, documentId: spec.docId };
    return await rejectAuthoringCreateTransaction(client, transaction, txErr, recovery);
  } finally {
    client.release(transaction.discardConnection);
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
  /**
   * Bind to this market's document of the project rather than the home filing
   * (FILING_SPINE F22b). A market document that cannot be bound is refused,
   * never created unbound: the person asked for that market's copy.
   */
  c2c_document_id?: unknown;
}

export type CreateDocumentOutcome =
  | AuthoringRefusal
  | {
      kind: 'created';
      document: Record<string, unknown>;
      /** How many sections the chosen template seeded; null for a blank create. */
      templateSectionCount: number | null;
      binding: Binding;
    };

/**
 * Why a document cannot be anchored to `clientProgramId`, or null when it can.
 * A document belongs to a project (PF-07; founder decision 2026-09-26): one
 * that names none is refused 400 PROJECT_REQUIRED — it used to be created
 * org-wide, where no project ever listed it. A malformed id is a clean 400
 * rather than a UUID-cast 500. Otherwise the project must be a live one this
 * organization owns (LX-20): reads are gated on tenant_id, but the ANCHOR was
 * not, so a document could name another organization's project, a missing one,
 * or a deleted one. 404, not 403: the caller learns nothing about another
 * tenant's project ids.
 */
async function refuseProgramAnchor(ctx: CreateContext, clientProgramId: unknown): Promise<AuthoringRefusal | null> {
  if (clientProgramId === undefined || clientProgramId === null || clientProgramId === '') {
    return { kind: 'refused', status: 400, code: 'PROJECT_REQUIRED', error: 'Open a project first: a document belongs to a project.' };
  }
  if (!UUID_RE.test(String(clientProgramId))) {
    return { kind: 'refused', status: 400, error: 'The project id must be a valid UUID.' };
  }
  if (!(await programInOrganization(ctx.pool, String(clientProgramId), ctx.tenantId))) {
    return { kind: 'refused', status: 404, error: 'Project not found' };
  }
  return null;
}

/**
 * AN IMAGE IN A SECTION IS AN UPLOADED FIGURE OR NOTHING, on create as on save
 * (periodic review 2026-09-28, editor family, SEC-B-1/2 follow-on b1). An
 * organization template's sections are copied into the new document as they
 * are stored, and the template store never checked them, so a template
 * seeded exactly what the section save refuses. The first section holding
 * such an image refuses the create before anything is written; nothing is
 * rewritten, because the template's words are its author's.
 *
 * The images are named in the section save's words (refusedKind), but the
 * advice is not the save's "upload the image or remove it, then save again":
 * a template has no edit route, so the person creating the document can act
 * only on the choice of template (fix-up).
 */
async function refuseTemplateFigures(seeds: TemplateSectionSeed[]): Promise<AuthoringRefusal | null> {
  for (const [i, seed] of seeds.entries()) {
    const refused = await refusedFigures(seed.content);
    if (refused.length > 0) {
      const section = seed.code || seed.title || String(i + 1);
      const notFigures = refused.filter((r) => r.reason !== 'read-differently');
      // refusedFigures reports a misread image only when nothing else is refused.
      const what =
        notFigures.length === 0
          ? 'an image written in a way the editor and the filed document would read differently ' +
            '(a repeated attribute, or an image inside a comment, a text box or a template). '
          : `${notFigures.length === 1 ? 'an image that is not an uploaded figure' : `${notFigures.length} images that are not uploaded figures`} ` +
            `(${[...new Set(notFigures.map((r) => refusedKind(r.src)))].join(', ')}). ` +
            'A section can only hold images uploaded to the document (PNG, JPEG or GIF). ';
      const error = `Template section ${section} holds ${what}Choose another template, or create the document without one.`;
      return { kind: 'refused', status: 400, error };
    }
  }
  return null;
}

/**
 * What a create refuses before anything is read: a project the organization
 * does not own, and a market's copy seeded from a template. A template seeds
 * the sections it carries, of any code; a market's copy holds only its Module 1
 * and 3.2.R (security review, 2026-10-15).
 */
async function refuseStart(ctx: CreateContext, input: CreateDocumentInput): Promise<AuthoringRefusal | null> {
  const programRefusal = await refuseProgramAnchor(ctx, input.client_program_id);
  if (programRefusal) return programRefusal;
  if (!input.c2c_document_id || !input.template_id) return null;
  return {
    kind: 'refused', status: 400, code: 'MARKET_DOCUMENT_TEMPLATE',
    error: "A market's document starts without a template: it holds only that market's Module 1 and 3.2.R. Nothing was created.",
  };
}

const programIdOf = (v: unknown): string | null => (v ? String(v) : null);

/**
 * The new document's binding: the project's home filing, or the market's
 * document the caller named (FILING_SPINE F22b). A named market document that
 * cannot be bound is a refusal, never an unbound create: the person asked for
 * that market's copy.
 */
async function createBinding(
  ctx: CreateContext, builtin: Parameters<typeof templateWorkingBinding>[0], clientProgramId: string | null, named: unknown,
): Promise<Binding | AuthoringRefusal> {
  const marketDocumentId = named ? String(named) : null;
  const binding = await templateWorkingBinding(builtin, () => resolveBinding(ctx.pool, ctx.tenantId, clientProgramId, marketDocumentId));
  if (!marketDocumentId || binding.documentId === marketDocumentId) return binding;
  return { kind: 'refused', status: 409, code: 'MARKET_DOCUMENT_NOT_BOUND', error: binding.reason ?? "The market's document could not be bound." };
}

/** POST /docs. The caller has already resolved the actor (401 without one). */
export async function createDocument(ctx: CreateContext, input: CreateDocumentInput): Promise<CreateDocumentOutcome> {
  const { title, module = 'M3', product_code, locale = 'en-US', template_id, client_program_id } = input;
  const docId = crypto.randomUUID();

  if (!title) return { kind: 'refused', status: 400, error: 'Document title is required' };

  const startRefusal = await refuseStart(ctx, input);
  if (startRefusal) return startRefusal;

  const builtin = template_id ? await getBuiltinAuthoringTemplate(String(template_id)) : undefined;
  const templateRefusal = await refuseBuiltinTemplateStart(ctx, input, builtin);
  if (templateRefusal) return templateRefusal;

  let templateSections: TemplateSectionSeed[] | null = null;
  if (template_id) {
    const resolved = await resolveTemplateSections(ctx.pool, ctx.tenantId, String(template_id), { builtin });
    if (!Array.isArray(resolved)) return resolved;
    const seedRefusal = await refuseTemplateFigures(resolved);
    if (seedRefusal) return seedRefusal;
    templateSections = resolved;
  }

  const clientProgramId = programIdOf(client_program_id);
  const resolvedBinding = await createBinding(ctx, builtin, clientProgramId, input.c2c_document_id);
  if ('kind' in resolvedBinding) return resolvedBinding;
  const templateSource = builtinTemplateSource(builtin);

  const { document, binding } = await insertDocumentTx(
    ctx,
    {
      docId,
      title: String(title),
      ...builtinTemplateDocumentFields(builtin, module, templateSource),
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
      metadata: { template_id, seeded: true, ...builtinTemplateSectionMetadata(builtin, templateSource, s.code) },
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
  | AuthoringRefusal
  | { kind: 'lineage_failed' }
  | { kind: 'created'; section: Record<string, unknown> };

/**
 * What POST /sections refuses before the parent document is read: a missing
 * field, and content the section save would refuse.
 *
 * The section save refuses content holding an image that is not an uploaded
 * figure; this create stored the same content as sent, so it was the way round
 * that refusal (periodic review 2026-09-28, editor family, SEC-B-1/2 follow-on
 * b1). Refused the same way, with the images named, and never rewritten.
 * Content that is not text is refused as well: the driver stores an object as
 * its JSON, which no figure check would have read.
 */
async function refuseSectionInput(input: CreateSectionInput): Promise<AuthoringRefusal | null> {
  const { doc_id, code, title, content } = input;
  if (!doc_id || !code || !title) {
    return { kind: 'refused', status: 400, error: 'doc_id, code, and title are required' };
  }
  if (content != null && typeof content !== 'string') {
    return { kind: 'refused', status: 400, error: 'content must be text' };
  }
  const refused = await refusedFigures(content ?? '');
  return refused.length > 0 ? { kind: 'refused', status: 400, error: describeRefusedFigures(refused) } : null;
}

/**
 * A market's document holds only its Module 1 and 3.2.R (FILING_SPINE F22b).
 * A section of another code in its editing copy would never reach the filing
 * (commit-section-to-filing.ts refuses it), so it is not created. Read through
 * to_jsonb, and a store that cannot be read is no market document: the
 * section is created as before, and the commit still refuses.
 */
async function isMarketDocumentCopy(pool: Queryable, tenantId: number, docId: string, strict = false): Promise<boolean> {
  try {
    const r = await pool.query(
      `SELECT 1 FROM authoring_documents a
         JOIN c2c_documents d ON d.id = to_jsonb(a)->>'c2c_document_id' AND d.org_id = a.tenant_id
        WHERE a.id = $1 AND a.tenant_id = $2 AND to_jsonb(d)->>'filing_scope' = 'market'
        LIMIT 1`,
      [docId, tenantId],
    );
    return (r.rowCount ?? 0) > 0;
  } catch (error) {
    if (strict) throw error;
    return false;
  }
}

/**
 * What the parent document refuses: a section added to a FROZEN or APPROVED
 * document (the same Part 11 lock the save applies, C2C-AUTHOR-001), and a
 * common section in a market's copy (above).
 */
export async function refuseSectionParent(
  pool: Queryable, tenantId: number, parent: { status?: string | null }, docId: string, codeInput: string | { code: string; strict: true },
): Promise<AuthoringRefusal | null> {
  const code = typeof codeInput === 'string' ? codeInput : codeInput.code;
  const strict = typeof codeInput !== 'string';
  if (LOCKED_DOCUMENT_STATUSES.has(String(parent.status ?? '').toUpperCase())) {
    return { kind: 'refused', status: 403, error: 'Document is FROZEN/APPROVED; cannot add sections' };
  }
  if (isRegionalSectionKey(code) || !(await isMarketDocumentCopy(pool, tenantId, docId, strict))) return null;
  return {
    kind: 'refused', status: 409, code: 'WRONG_FILING_SCOPE',
    error: `This document is a market's own part of the filing, its Module 1 and 3.2.R. Section ${code} belongs to the project's home filing; start it there. Nothing was created.`,
  };
}

/** POST /sections. The caller has already resolved the actor (401 without one). */
export async function createSection(ctx: CreateContext, input: CreateSectionInput): Promise<CreateSectionOutcome> {
  const { pool, tenantId } = ctx;
  const { doc_id, code, title, content = '' } = input;
  /* `order_index` was defaulted to 0 and no client sends one, so every section
     of every document was created at the same index (MDX_WORK_ORDER W1-2). An
     explicitly supplied index is still honoured; only the DEFAULT changes,
     from "0" to "where this code belongs". Resolved inside the transaction. */
  const requestedOrderIndex: number | undefined = Number.isFinite(Number(input.order_index))
    ? Number(input.order_index)
    : undefined;
  const sectionId = crypto.randomUUID();

  const inputRefusal = await refuseSectionInput({ doc_id, code, title, content });
  if (inputRefusal) return inputRefusal;

  // The same Part 11 immutability lock the /sections/:sectionId guard applies
  // (C2C-AUTHOR-001): adding a section to a FROZEN or APPROVED document alters
  // the record set a signature attests to. Resolving the parent in-tenant first
  // also turns a foreign/unknown doc_id into a clean 404.
  const parentDoc = await pool.query(
    `SELECT status FROM authoring_documents WHERE id = $1 AND tenant_id = $2`,
    [doc_id, tenantId],
  );
  if ((parentDoc.rowCount ?? 0) === 0) return { kind: 'refused', status: 404, error: 'Document not found' };
  const parentRefusal = await refuseSectionParent(pool, tenantId, parentDoc.rows[0] as { status?: string | null }, String(doc_id), String(code));
  if (parentRefusal) return parentRefusal;

  // Create + lineage commit together, exactly like the interactive save gate:
  // a section created WITH authored content records its provenance in the same
  // transaction or is not created at all. An empty structural scaffold no-ops
  // the gate.
  const client: TxClient = await pool.connect();
  let section: Record<string, unknown>;
  const transaction: AuthoringCreateTransactionState = { began: false, commitAttempted: false };
  try {
    transaction.began = true;
    await client.query('BEGIN');
    // Canonical parent reservation coordinates all child writers with sealing.
    await reserveWritableDocument(client, String(doc_id), tenantId);
    /* Where the new section goes (relative: a document someone has reordered
       keeps that order), and whether its code is already taken — refused as a
       conflict before anything moves (QA 2026-10-08, j4; section-placement.ts). */
    const placed = await placeNewSection(client, { docId: doc_id, tenantId, code: String(code), requestedOrderIndex });
    if (placed.kind === 'duplicate') {
      await rollbackAuthoringTransaction(client, transaction);
      return sectionCodeExists(String(code));
    }
    const orderIndex = placed.orderIndex;

    section = await insertSectionSeedTx(ctx, client, String(doc_id), {
      code: String(code), title: String(title), content: content as string, orderIndex,
      changeReason: (input.changeReason as string | undefined) ?? null, metadata: { code, title },
      lineage: { machineDraft: null },
    }, { sectionId });
    transaction.commitAttempted = true;
    await client.query('COMMIT');
    transaction.began = false;
  } catch (caught) {
    const recovery = { organizationId: tenantId, documentId: String(doc_id), sectionId };
    const err = await settleAuthoringTransactionFailure(client, transaction, caught, new AuthoringSectionWriteOutcomeError('section-create', recovery));
    if (err instanceof AuthoringSectionWriteOutcomeError) throw err;
    if (err instanceof DocumentWriteReservationError) return { kind: 'refused', status: err.status, code: err.code, error: err.message };
    // A concurrent create of the same code passes the check above and loses at
    // the unique index: still a conflict, not a lineage failure.
    if (isSectionCodeConflict(err)) return sectionCodeExists(String(code));
    logger.error('Section create refused — content and lineage rolled back together', {
      sectionId,
      tenantId,
      err: err instanceof Error ? err.message : String(err),
    });
    return { kind: 'lineage_failed' };
  } finally {
    client.release(transaction.discardConnection);
  }

  return { kind: 'created', section };
}
