/**
 * A drafted document becomes an authoring document — the service behind
 * `POST /api/authoring/docs/from-draft` and the `draft_authoring_document` AnA
 * tool (WM, 2026-09-21, docs/design/ANA_DOCUMENT_CANVAS.md).
 *
 * One transaction (authoring-documents.ts insertDocumentTx): the document row
 * with its provenance, every section with sanitized HTML content, a genesis
 * revision and a CREATE audit row per section, and span lineage per section —
 * a model's draft recorded as the machine's, requested by the actor; a seed or
 * an import recorded as the actor's own.
 *
 * Provenance is honest: `source` says who produced it; `model` is present only
 * when the caller reported one; NULL on the row keeps meaning "a person
 * authored this through the editor".
 */

import crypto from 'crypto';
import { ANA_MACHINE_AUTHOR_ID, MACHINE_AUTHOR_IDS } from './revision-ledger';
import { columnState, type Queryable } from './authoring-evidence';
import { sanitizeAuthoringSectionHtml } from './authoring-html-sanitizer';
import {
  grantCreatorOwnership,
  insertDocumentTx,
  resolveBinding,
  type Binding,
  type CreateContext,
  type Refusal,
} from './authoring-documents';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ─────────────────────────────────────────────────────────────────────────────
// Provenance
// ─────────────────────────────────────────────────────────────────────────────

export type ProvenanceSource = 'ana' | 'seed' | 'import';
export const PROVENANCE_SOURCES: readonly ProvenanceSource[] = ['ana', 'seed', 'import'];

/** What `authoring_documents.provenance` holds (migrations/20260921_authoring_document_provenance.sql). */
export interface DocumentProvenance {
  source: ProvenanceSource;
  conversationId?: string;
  turnId?: string;
  /** The model id the gateway reported. Present only when a model drafted it. */
  model?: string;
  note?: string;
  recordedAt: string;
}

export type ProvenanceInput = Omit<DocumentProvenance, 'recordedAt'>;

const PROVENANCE_TEXT_KEYS = ['conversationId', 'turnId', 'model', 'note'] as const;

/** Validate caller-supplied provenance. Unknown keys are dropped, not stored. */
export function parseProvenance(raw: unknown): { ok: true; value: ProvenanceInput } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'provenance is required: { source: ana | seed | import, conversationId?, turnId?, model?, note? }' };
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
    sections.push({ code, title, content: (sec.content as string | undefined) ?? '' });
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
// createDocumentFromDraft
// ─────────────────────────────────────────────────────────────────────────────

export type CreateDocumentFromDraftOutcome =
  | Refusal
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
export async function createDocumentFromDraft(
  ctx: CreateContext,
  input: CreateDocumentFromDraftInput,
): Promise<CreateDocumentFromDraftOutcome> {
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
  const provenance: DocumentProvenance = { ...input.provenance, recordedAt: new Date().toISOString() };
  const docId = crypto.randomUUID();
  // The same binding rule as POST /docs: the project's filing keeps one editing
  // copy; every further document is created in the project unbound, with the
  // reason stated — so AnA can draft several documents into one program.
  const resolvedBinding = await resolveBinding(ctx.pool, ctx.tenantId, input.programId);
  const isMachineDraft = provenance.source === 'ana';
  const contributors = isMachineDraft
    ? [{ id: ANA_MACHINE_AUTHOR_ID, name: MACHINE_AUTHOR_IDS[ANA_MACHINE_AUTHOR_ID] }]
    : [];

  const { document, binding } = await insertDocumentTx(
    ctx,
    {
      docId,
      title: input.title,
      module: input.module ?? 'M2',
      productCode: input.documentType ?? null,
      locale: 'en-US',
      templateId: null,
      clientProgramId: input.programId,
      binding: resolvedBinding,
      provenance: provenance as unknown as Record<string, unknown>,
    },
    input.sections.map((s, i) => ({
      code: s.code,
      title: s.title,
      content: sanitizeAuthoringSectionHtml(s.content),
      orderIndex: i,
      changeReason: CHANGE_REASON[provenance.source],
      metadata: { provenance, drafted: true },
      contributors,
      lineage: { machineDraft: isMachineDraft ? { authorId: ANA_MACHINE_AUTHOR_ID } : null },
    })),
  );
  await grantCreatorOwnership(ctx, docId);

  const sections = await ctx.pool.query(
    `SELECT id, doc_id, code, title, content, order_index, track_changes, created_at, updated_at, tenant_id
       FROM authoring_sections WHERE doc_id = $1 AND tenant_id = $2
      ORDER BY order_index, created_at`,
    [docId, ctx.tenantId],
  );
  return { kind: 'created', document, sections: sections.rows, provenance, binding };
}
