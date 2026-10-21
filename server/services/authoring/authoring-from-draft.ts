/**
 * A drafted document becomes an authoring document — the service behind
 * `POST /api/authoring/docs/from-draft` and the `draft_authoring_document` AnA
 * tool (WM, 2026-09-21, docs/design/ANA_DOCUMENT_CANVAS.md).
 *
 * One transaction (authoring-documents.ts insertDocumentTx): the document row
 * with its provenance, every section with sanitized HTML content, a genesis
 * revision and a CREATE audit row per section, and span lineage per section —
 * a model's draft recorded as the machine's, requested by the actor; a seed or
 * file import recorded as the actor's own. A verified workflow import records
 * its deterministic compositor and retains the original machine/template/unknown
 * origin separately; asking for a copy does not assert its words.
 *
 * Provenance records the operation and server evidence. Model names come from
 * retained records, never caller assertions; workflow origins retain an
 * unknown original model without relabeling it as the importing person's work.
 */

import { authorizeAuthoringProgram, AuthoringProgramAccessError } from './authoring-program-access';
import { parseDraftSourceReferences, verifyDraftSourceReferences, type DraftSourceReference, type VerifiedDraftSourceReference } from './draft-source-references';
import { lockDocumentDispositionProgram } from '../document-data-disposition/program-lock';
import { checkSectionFigures, figureSpansInContent, type CitedExcerpt, type SectionFigureCheck } from './draft-figure-check';
import { checkSectionClaims, type ClaimsExcerpt, type SectionClaimsCheck } from './section-claims-check';
import { sectionReadableText } from './authoring-read-render';
import crypto from 'crypto';
import { ANA_MACHINE_AUTHOR_ID, WORKFLOW_IMPORT_AUTHOR_ID, MACHINE_AUTHOR_IDS } from './revision-ledger';
import { servedModelsForTurnOrRun } from './authoring-record';
import type { QualifiedServedModel } from '../ai-governance/approved-models';
import { isWorkflowImportOrigin, type AuthoringImportOrigin, type WorkflowImportOrigin } from '../../../shared/authoring/source-import';
import { columnState, type Queryable } from './authoring-evidence';
import { sanitizeAuthoringSectionHtml, sanitizeMachineDraftSectionHtml } from './authoring-html-sanitizer';
import { workflowCopySectionContent } from './workflow-copy-content';
import {
  grantCreatorOwnership,
  insertDocumentTx,
  resolveBinding,
  type Binding,
  type CreateContext,
  type AuthoringRefusal,
  type SectionSeed,
  type DocumentRowSpec,
} from './authoring-documents';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ─────────────────────────────────────────────────────────────────────────────
// Provenance
// ─────────────────────────────────────────────────────────────────────────────

export type ProvenanceSource = 'ana' | 'seed' | 'import';
export const PROVENANCE_SOURCES: readonly ProvenanceSource[] = ['ana', 'seed', 'import'];

/** What `authoring_documents.provenance` holds (migrations/20260921_authoring_document_provenance.sql). */
export interface DocumentProvenance {
  /** Server-verified original for a source pulled into the one editor. HTTP
   * draft provenance cannot supply this field. The original remains intact. */
  importSource?: AuthoringImportOrigin & { warnings: string[]; reason: string };
  /** Declared references checked against current project records at save.
   * This is not claim-level support, generation proof, approval, or filing readiness. */
  projectSourceReferences?: Array<{
    sectionCode: string; sources: VerifiedDraftSourceReference[]; qualification: 'unassessed'; verification: 'current_at_save';
    /** Each figure of the stored section, found in these excerpts or unverified (S5a, draft-figure-check.ts). */
    figures?: SectionFigureCheck;
    /**
     * The stored section's figures set against the figures these same excerpts state for the same
     * frame: conflict, consistent, or not compared with the slot that differs
     * (section-claims-check.ts). `figures` answers whether a number is in the source at all;
     * this answers whether it agrees. Neither is approval or filing readiness.
     */
    claims?: SectionClaimsCheck;
  }>;
  source: ProvenanceSource;
  conversationId?: string;
  turnId?: string;
  /**
   * The model that wrote this draft, as the NAMED TURN RECORD says — never as a
   * caller said (AnA reasoning round 15, SEC-A-7 door 2). It was caller input,
   * validated only as a string of at most 2000 characters, and it is written
   * into three records that cannot be amended: the append-only `doc_revisions`
   * genesis row, the append-only `authoring_audit_trail` row whose metadata
   * carries this object verbatim, and the document row an inspector reads. So
   * any member of the organisation could name an approved model for prose an
   * unapproved one wrote, permanently.
   *
   * `parseProvenance` therefore no longer accepts it, and `createDocumentFromDraft`
   * parses the provenance of BOTH its callers — the HTTP route and the
   * in-process AnA drafting tool — so there is exactly one rule and no trusted
   * channel beside it: **the model in this record comes from the turn record or
   * not at all.** One invariant is what makes the field auditable; a second,
   * privileged way to set it is how the first defect got in.
   *
   * What that costs, stated: the tool used to set this from `ctx.model`, the
   * gateway's own `lastServedModel`, which was a true fact. It now comes from
   * the turn record instead — which also brings `servedBy`, so the normal tool
   * path records strictly MORE than before. It is only a turn whose record was
   * never filed (a failed turn) that now records no model, and for that turn
   * nothing could have verified the name anyway, which is what 'unverified'
   * says.
   */
  model?: string;
  /**
   * Every model that served the turn this draft came from, with RULE 2's
   * verdict for each (`qualifyServedModels`). Server-computed; absent when no
   * turn record could be resolved.
   */
  servedBy?: QualifiedServedModel[];
  /**
   * What the governed-write rule says of this document's PROSE — not whether
   * the document was created.
   *
   * 'refused' means RULE 2 does not admit these words as governed content: a
   * model it does not admit served the turn, or the record names no model at
   * all. The document still exists and is marked, because refusing the create
   * would push the person to paste the same prose by hand, which carries no
   * mark, so the lineage gate would record it as the PERSON's own work — the
   * same words in the same immutable tables, relabelled from "a machine
   * drafted this" to "a person authored this" (the reasoning is in
   * docs/evidence/ANA-REASONING/2026-10-05/r14/README.md). The governed
   * boundaries are where a 'refused' document is stopped.
   *
   * 'unverified' means no turn record could be resolved, so nothing is claimed
   * either way; `governedWriteWhy` says which.
   */
  governedWrite?: 'allowed' | 'refused' | 'unverified';
  /** Why the verdict is 'unverified', in the words the decision path uses. */
  governedWriteWhy?: string;
  note?: string;
  /** True when the caller gave no module and 'M2' was assumed. Set by the
   *  service, never by the caller; a filing must not treat the assumption as
   *  a decision (2026-09-22 review, #13). */
  moduleDefaulted?: boolean;
  recordedAt: string;
}

export type ProvenanceInput = Omit<DocumentProvenance, 'recordedAt' | 'projectSourceReferences' | 'importSource'>;

/* `model` is NOT here, and that is the point of round 15's change at this door:
   a caller cannot name the model that wrote the draft. It is dropped like any
   unknown key rather than refused, so a client still sending it (the browser
   card did) keeps working and simply stops being believed. The service sets it
   from the turn record. */
const PROVENANCE_TEXT_KEYS = ['conversationId', 'turnId', 'note'] as const;

/** Validate caller-supplied provenance. Unknown keys are dropped, not stored. */
export function parseProvenance(raw: unknown): { ok: true; value: ProvenanceInput } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'provenance is required: { source: ana | seed | import, conversationId?, turnId?, note? }' };
  }
  const r = raw as Record<string, unknown>;
  if (!PROVENANCE_SOURCES.includes(r.source as ProvenanceSource)) {
    return { ok: false, error: `provenance.source must be one of: ${PROVENANCE_SOURCES.join(', ')}` };
  }
  const value: ProvenanceInput = { source: r.source as ProvenanceSource };
  for (const key of PROVENANCE_TEXT_KEYS) {
    const v = r[key];
    if (v === undefined || v === null) continue;
    if (typeof v !== 'string' || v.length > 2000) {
      return { ok: false, error: `provenance.${key} must be a string of at most 2000 characters` };
    }
    if (v.trim()) value[key] = v.trim();
  }
  return { ok: true, value };
}

/**
 * The provenance recorded on a document, read honestly: a deployment without
 * the 20260921 column reports `provenanceStore: 'absent'` (or 'unknown' when
 * the probe could not run) rather than a null that reads as "a person wrote
 * this". A NULL on a deployment that HAS the column does mean exactly that.
 */
export async function readDocumentProvenance(
  executor: Queryable,
  docId: string,
  tenantId: number,
): Promise<{ provenance: DocumentProvenance | null; provenanceStore: 'present' | 'absent' | 'unknown' }> {
  const state = await columnState(executor, 'provenance');
  if (state !== 'present') return { provenance: null, provenanceStore: state };
  const r = await executor.query(
    'SELECT provenance FROM authoring_documents WHERE id = $1 AND tenant_id = $2',
    [docId, tenantId],
  );
  const raw = r.rows[0]?.provenance;
  const provenance = raw && typeof raw === 'object' ? (raw as DocumentProvenance) : null;
  return { provenance, provenanceStore: 'present' };
}

// ─────────────────────────────────────────────────────────────────────────────
// Input
// ─────────────────────────────────────────────────────────────────────────────

export interface DraftSectionInput {
  code: string;
  title: string;
  content: string;
  sourceReferences?: DraftSourceReference[];
}

export interface CreateDocumentFromDraftInput {
  programId: string;
  title: string;
  module?: string | null;
  documentType?: string | null;
  sections: DraftSectionInput[];
  provenance: ProvenanceInput;
}

const MAX_DRAFT_SECTIONS = 200;

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

function parseDraftSections(raw: unknown): Parsed<DraftSectionInput[]> {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { ok: false, error: 'sections must be a non-empty array of { code, title, content }' };
  }
  if (raw.length > MAX_DRAFT_SECTIONS) {
    return { ok: false, error: `sections: at most ${MAX_DRAFT_SECTIONS} sections per document` };
  }
  const sections: DraftSectionInput[] = [];
  for (const [i, s] of (raw as unknown[]).entries()) {
    const sec = (s && typeof s === 'object' ? s : {}) as Record<string, unknown>;
    const code = typeof sec.code === 'string' ? sec.code.trim() : '';
    const title = typeof sec.title === 'string' ? sec.title.trim() : '';
    if (!code || !title) return { ok: false, error: `sections[${i}]: code and title are required` };
    if (sec.content !== undefined && typeof sec.content !== 'string') {
      return { ok: false, error: `sections[${i}]: content must be a string (HTML)` };
    }
    let sourceReferences: DraftSourceReference[];
    try { sourceReferences = parseDraftSourceReferences(sec.sourceReferences); }
    catch { return { ok: false, error: `sections[${i}]: invalid sourceReferences; retain the document IDs, hashes and spans from the batch source receipts` }; }
    sections.push({ code, title, content: (sec.content as string | undefined) ?? '',
      sourceReferences });
  }
  return { ok: true, value: sections };
}

/**
 * Validate a from-draft body into the typed input, or the 400 that refuses it.
 * The route and the tool both go through this so they refuse identically.
 */
export function parseDraftInput(raw: unknown): Parsed<CreateDocumentFromDraftInput> {
  const b = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const programId = typeof b.programId === 'string' ? b.programId.trim() : '';
  if (!programId) return { ok: false, error: 'programId is required — an AnA-built document is filed in a project' };
  if (!UUID_RE.test(programId)) return { ok: false, error: 'programId must be a valid UUID' };
  const title = typeof b.title === 'string' ? b.title.trim() : '';
  if (!title) return { ok: false, error: 'title is required' };
  const sections = parseDraftSections(b.sections);
  if (!sections.ok) return sections;
  const provenance = parseProvenance(b.provenance);
  if (!provenance.ok) return provenance;
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  return {
    ok: true,
    value: {
      programId,
      title,
      module: str(b.module),
      documentType: str(b.documentType),
      sections: sections.value,
      provenance: provenance.value,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
/**
 * What RULE 2 says of a machine draft's prose, as fields to merge into its
 * provenance (AnA reasoning round 15, SEC-A-7 door 2).
 *
 * Its own function so `createDocumentFromDraft` stays under the file's
 * complexity limit, and so this one decision reads in one place.
 *
 * The reference may name the turn RECORD (the browser card sends
 * `m.turnRecord.id`) or the RUN that served it (the in-process AnA tool, since
 * stream.ts passes `turnId: runId` into the tool context);
 * `servedModelsForTurnOrRun` tries both and rewrites the stored reference to
 * the record it resolved to, so the canonical verifiers can re-check it later.
 */
async function governedWriteOf(
  executor: Queryable,
  tenantId: number,
  turnRef: string | undefined,
): Promise<Partial<DocumentProvenance>> {
  const turn = await servedModelsForTurnOrRun(executor, tenantId, turnRef);
  /* Nothing resolved, so nothing is claimed — and there is no model to clear:
     `parseProvenance` drops that field for both callers before this runs, which
     a mutant proved (a `delete provenance.model` here changed no behaviour). */
  if (!turn.ok) return { governedWrite: 'unverified', governedWriteWhy: turn.why };
  /* The record's own model, which overrides whatever a caller or the tool sent.
     `servedModelsOf` lists models "in the order it first served", so this is
     the FIRST model to serve the turn — not a claim that it wrote any
     particular sentence. Where more than one served, `servedBy` carries all of
     them and is the field a reader should believe; this keeps the single-model
     meaning the field already had. */
  const named = turn.servedBy.find((m) => m.model !== null)?.model ?? undefined;
  /* Two cases refuse, not one: a model the rule does not admit, AND a record
     that names no model at all — an empty list is not a list of approved
     models, and `.some()` over it is false. */
  const unadmitted = turn.servedBy.length === 0 || turn.servedBy.some((m) => m.model === null || !m.qualified);
  return {
    turnId: turn.turnRecordId,
    servedBy: turn.servedBy,
    ...(named ? { model: named } : {}),
    governedWrite: unadmitted ? 'refused' : 'allowed',
  };
}

// createDocumentFromDraft
// ─────────────────────────────────────────────────────────────────────────────

export type CreateDocumentFromDraftOutcome =
  | AuthoringRefusal
  | {
      kind: 'created';
      document: Record<string, unknown>;
      sections: Record<string, unknown>[];
      provenance: DocumentProvenance;
      binding: Binding;
    };

const CHANGE_REASON: Record<ProvenanceSource, string> = {
  ana: 'Drafted by AnA in a conversation',
  seed: 'Seeded document',
  import: 'Imported document',
};

/**
 * Create a document with all its sections in ONE transaction. Refuses 503 —
 * nothing written — when the deployment cannot record provenance: a document
 * that claims AnA drafted it must be able to say so.
 */
/** Each section that cites sources: its references and the content as it is stored. */
type SelectedDraftSources = Array<{ sectionCode: string; refs: DraftSourceReference[]; storedContent: string }>;
class DraftSourceVerificationError extends Error {}
const SOURCE_VERIFICATION_REFUSAL: AuthoringRefusal = { kind: 'refused', status: 409, error: 'Project source references are unavailable, changed, or could not be verified. Refresh the source records and draft receipts before saving. Nothing was created.' };

async function verifySourcesInsideSave(q: Queryable, ctx: CreateContext, programId: string, selected: SelectedDraftSources, provenance: DocumentProvenance): Promise<void> {
  if (!selected.length) return;
  try {
    await lockDocumentDispositionProgram(q, ctx.tenantId, programId);
    const references: NonNullable<DocumentProvenance['projectSourceReferences']> = [];
    for (const section of selected) {
      const excerpts: Array<CitedExcerpt & ClaimsExcerpt> = [];
      const sources = await verifyDraftSourceReferences(section.refs, q, ctx.tenantId, programId, { actor: ctx.actor, excerpts });
      const sectionText = sectionReadableText(section.storedContent);
      // Every figure the stored section states, against the excerpts just verified (S5a) — is the
      // number in the source at all — and then whether it agrees with the source's own figure for
      // the same frame. One load of the excerpts serves both.
      const figures = checkSectionFigures(sectionText, excerpts);
      const claims = checkSectionClaims(section.sectionCode, sectionText, excerpts);
      references.push({ sectionCode: section.sectionCode, sources, qualification: 'unassessed', verification: 'current_at_save', figures, claims });
    }
    // Keep the same object used by the document and every CREATE audit row.
    provenance.projectSourceReferences = references;
    provenance.recordedAt = new Date().toISOString();
  } catch {
    throw new DraftSourceVerificationError();
  }
}

export interface CreateDocumentFromDraftOptions {
  /** Internal verified source receipt; public provenance parsing drops it. */
  verifiedImport?: { origin: AuthoringImportOrigin; warnings: string[]; reason: string; reserve: (q: Queryable) => Promise<void>; forceUnbound?: true };
}

function workflowOriginFor(options?: CreateDocumentFromDraftOptions): WorkflowImportOrigin | null {
  const origin = options?.verifiedImport?.origin;
  return origin && isWorkflowImportOrigin(origin) ? origin : null;
}

function storedDraftContents(input: CreateDocumentFromDraftInput, provenance: DocumentProvenance, workflowImport: WorkflowImportOrigin | null): string[] {
  if (workflowImport) return input.sections.map(s => workflowCopySectionContent(s.content));
  const sanitize = provenance.source === 'ana' ? sanitizeMachineDraftSectionHtml : sanitizeAuthoringSectionHtml;
  return input.sections.map(s => sanitize(s.content));
}

function draftedSectionSeeds(input: CreateDocumentFromDraftInput, contents: string[], provenance: DocumentProvenance,
  options: CreateDocumentFromDraftOptions | undefined, workflowImport: WorkflowImportOrigin | null): SectionSeed[] {
  const machine = provenance.source === 'ana' || workflowImport != null;
  const authorId = workflowImport ? WORKFLOW_IMPORT_AUTHOR_ID : ANA_MACHINE_AUTHOR_ID;
  const contributors = machine ? [{ id: authorId, name: MACHINE_AUTHOR_IDS[authorId] }] : [];
  return input.sections.map((section, i) => ({
    code: section.code, title: section.title, content: contents[i], orderIndex: i,
    changeReason: options?.verifiedImport?.reason ?? CHANGE_REASON[provenance.source],
    metadata: { provenance, drafted: true, ...(workflowImport ? { workflowSourceOrigin: workflowImport.sectionOrigins.find(origin => origin.code === section.code) ?? null } : {}) },
    contributors,
    lineage: {
      machineDraft: machine ? { authorId } : null,
      // Read when the section is written, after the sources were verified (S5c).
      figureSpans: () => figureSpansInContent(contents[i],
        provenance.projectSourceReferences?.find(r => r.sectionCode === section.code)?.figures),
    },
  }));
}

function draftRowSpec(docId: string, input: CreateDocumentFromDraftInput, binding: Binding, provenance: DocumentProvenance,
  workflowImport: WorkflowImportOrigin | null): DocumentRowSpec {
  return { docId, title: input.title, module: workflowImport ? null : input.module ?? 'M2', productCode: input.documentType ?? null,
    locale: 'en-US', templateId: null, clientProgramId: input.programId, binding,
    provenance: provenance as unknown as Record<string, unknown>, ...(workflowImport ? { isolation: 'serializable' as const } : {}) };
}

function draftProvenance(value: ProvenanceInput, input: CreateDocumentFromDraftInput, workflowImport: WorkflowImportOrigin | null): DocumentProvenance {
  return { ...value, ...(input.module || workflowImport ? {} : { moduleDefaulted: true }), recordedAt: new Date().toISOString() };
}

export async function createDocumentFromDraft(
  ctx: CreateContext,
  input: CreateDocumentFromDraftInput,
  options?: CreateDocumentFromDraftOptions,
): Promise<CreateDocumentFromDraftOutcome> {
  // The project must be a live one this organization owns (LX-20 / PF-02): the
  // route checked only that programId looked like a UUID, so a draft could be
  // filed in another organization's project. 404, as POST /docs answers.
  try {
    await authorizeAuthoringProgram(ctx.pool, { tenantId: ctx.tenantId, actor: ctx.actor, programId: input.programId });
  } catch (error) {
    if (error instanceof AuthoringProgramAccessError) return { kind: 'refused', status: error.status, code: error.code, error: error.message };
    throw error;
  }
  const provenanceState = await columnState(ctx.pool, 'provenance');
  if (provenanceState !== 'present') {
    return {
      kind: 'refused',
      status: 503,
      error:
        'This deployment cannot record document provenance (authoring_documents.provenance is ' +
        (provenanceState === 'absent' ? 'absent' : 'unverifiable') +
        '), so the draft was not saved. Nothing was created. Apply migrations/20260921_authoring_document_provenance.sql.',
    };
  }
  const parsedProvenance = parseProvenance(input.provenance);
  if (!parsedProvenance.ok) return { kind: 'refused', status: 400, error: parsedProvenance.error };
  const workflowImport = workflowOriginFor(options);
  const provenance = draftProvenance(parsedProvenance.value, input, workflowImport);
  /* What the governed-write rule says of this prose, read from the turn record
     the draft names — before `insertDocumentTx` opens its transaction, so a
     missing store or a malformed reference cannot abort the write it is being
     checked for. A seed or an import is a person's act and carries no verdict. */
  if (provenance.source === 'ana') Object.assign(provenance, await governedWriteOf(ctx.pool, ctx.tenantId, provenance.turnId));
  if (workflowImport) Object.assign(provenance, { governedWrite: 'unverified', governedWriteWhy: 'Workflow source authorship and model qualification are retained as recorded; this import is not human adoption.' });
  // A machine draft keeps no image: a model's image is never an uploaded
  // figure (item 18, 2026-10-05). An import or seed keeps its figures.
  const storedContent = storedDraftContents(input, provenance, workflowImport);
  let selectedSources: SelectedDraftSources;
  try {
    // Parse even for typed callers; actual source reads occur only inside BEGIN.
    selectedSources = input.sections.flatMap((s, i) => s.sourceReferences?.length
      ? [{ sectionCode: s.code, refs: parseDraftSourceReferences(s.sourceReferences), storedContent: storedContent[i] }]
      : []);
  } catch {
    return SOURCE_VERIFICATION_REFUSAL;
  }
  const docId = crypto.randomUUID();
  // The same binding rule as POST /docs: the project's filing keeps one editing
  // copy; every further document is created in the project unbound, with the
  // reason stated — so AnA can draft several documents into one program.
  const resolvedBinding = options?.verifiedImport?.forceUnbound
    ? { documentId: null, reason: 'Workflow working copy; filing requires an explicit governed action.' }
    : await resolveBinding(ctx.pool, ctx.tenantId, input.programId);

  const inserted = await insertDocumentTx(
    ctx,
    draftRowSpec(docId, input, resolvedBinding, provenance, workflowImport),
    draftedSectionSeeds(input, storedContent, provenance, options, workflowImport),
    async client => {
      await authorizeAuthoringProgram(client, { tenantId: ctx.tenantId, actor: ctx.actor, programId: input.programId });
      await verifySourcesInsideSave(client, ctx, input.programId, selectedSources, provenance);
      if (options?.verifiedImport) {
        if (provenance.source !== 'import') throw new Error('Verified import requires import provenance');
        await options.verifiedImport.reserve(client);
        provenance.importSource = {
          ...options.verifiedImport.origin, warnings: [...options.verifiedImport.warnings],
          reason: options.verifiedImport.reason,
        };
      }
    },
  ).catch(err => {
    if (err instanceof DraftSourceVerificationError) return null;
    if (err instanceof AuthoringProgramAccessError) return err;
    throw err;
  });
  if (!inserted) return SOURCE_VERIFICATION_REFUSAL;
  if (inserted instanceof AuthoringProgramAccessError) return { kind: 'refused', status: inserted.status, code: inserted.code, error: inserted.message };
  const { document, binding } = inserted;
  await grantCreatorOwnership(ctx, docId);

  const sections = await ctx.pool.query(
    `SELECT id, doc_id, code, title, content, order_index, track_changes, created_at, updated_at, tenant_id
       FROM authoring_sections WHERE doc_id = $1 AND tenant_id = $2
      ORDER BY order_index, created_at`,
    [docId, ctx.tenantId],
  );
  return { kind: 'created', document, sections: sections.rows, provenance, binding };
}
