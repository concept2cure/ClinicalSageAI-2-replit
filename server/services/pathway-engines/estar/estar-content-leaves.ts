/**
 * Content → canonical leaves adapter — feeds the readiness mappers with a
 * project's REAL authored content instead of hand-constructed leaves.
 *
 * The readiness engine (estar-filing-readiness / the mappers) consumes canonical
 * leaves ({sectionCode, title, documentType}). Authored device/IVD content lives
 * in two stores, and this adapter projects either onto leaves so readiness and
 * assembly reflect what a client has actually written:
 *
 *   - the GOVERNED store — c2c_documents / c2c_document_sections, keyed by the
 *     regulatory program the v2 wizard scaffolded (k510 / denovo / pma / cer
 *     rule packs, Part 11 attribution, the same rows the editor saves into);
 *   - the LEGACY store — cerv2_510k_sections, keyed by organization and an
 *     optional document id (the table the live document-preview reads).
 *
 * ── ESTAR-01 / ESTAR-02 ───────────────────────────────────────────────────────
 * The loaders read only the legacy store, org-wide by default: two device
 * programs in one organization shared one content set, and a program authored
 * in the governed editor was invisible to /assemble, /filing-readiness and the
 * draft package. `programId` now selects the governed store for that program.
 * The two stores are never merged: `resolveDeviceContentScope` answers from the
 * program's governed document when it holds authored content, and otherwise
 * from the legacy store exactly as before (the legacy editor is still a live
 * authoring path) — and the routes echo which store answered
 * (`deviceContentSource`), so an org-wide legacy answer is never mistaken for
 * the program's own.
 *
 * HONEST-BY-CONSTRUCTION: a section becomes a leaf ONLY when it carries actual
 * authored content (non-empty body) — an empty section is NOT a leaf, so it
 * correctly reads as a gap in readiness, never invented. Beyond that, each leaf
 * carries `substantive` (derived from the section's `status` plus real content
 * length, never a bare placeholder like "TBD") so the readiness mappers can
 * refuse to mark a required section present for a title-matching draft/stub —
 * a leaf existing is not the same claim as a leaf being finished. Pure adapter
 * (sectionsToLeaves) is separated from the DB loader so it is unit-testable.
 *
 * @module server/services/pathway-engines/estar/estar-content-leaves
 */

import { and, asc, eq } from 'drizzle-orm';
import { db, pool } from '../../../db';
import { cerv2510kSections } from '../../../../shared/schema';
import { sectionPlainText } from '../../c2c/section-content';
import type { FilingLeaf } from './estar-filing-readiness';

/** The subset of a cerv2_510k_sections row the adapter needs. */
export interface DeviceSectionInput {
  sectionNumber?: string | null;
  sectionTitle?: string | null;
  sectionKey?: string | null;
  category?: string | null;
  status?: string | null;
  content?: string | null;
}

/** A section is authored — and thus a real leaf — only when it has content. */
function isAuthored(s: DeviceSectionInput): boolean {
  return (s.content ?? '').trim().length > 0;
}

/** Statuses that represent finalized, non-draft content (legacy + governed vocabularies). */
const FINALIZED_STATUSES = new Set(['approved', 'finalized', 'final', 'locked']);
/**
 * Statuses that are explicitly still in progress — never substantive regardless
 * of length.
 *
 * `drafting` and `ready_for_review` were missing, and they are the two the AI
 * drafter actually writes: write_kit_section defaults `status` to 'drafting'
 * and accepts only drafting | ready_for_review | in_review, while rejecting
 * bodies under 40 characters — the same floor as
 * MIN_SUBSTANTIVE_CONTENT_LENGTH below. So every AI-drafted section fell
 * through this set to the length-only branch and passed it by construction:
 * unreviewed machine drafts marked their eSTAR sections present, and
 * contentReady / canFileNow went true on content no human had read.
 * `drafting` is also the legacy vocabulary's own in-progress value
 * (shared/schema.ts: "todo, drafting, validated").
 */
const DRAFT_STATUSES = new Set([
  'draft', 'drafted', 'drafting', 'todo', 'not_started',
  'review', 'in_review', 'in-review', 'ready_for_review', 'ready-for-review',
  'in-progress', 'in_progress',
]);

/** Bare placeholder bodies that must never count as real content, whatever their length. */
const PLACEHOLDER_BODIES = new Set(['tbd', 'todo', 'tba', 'n/a', 'placeholder', 'coming soon', 'to be determined']);

/**
 * Minimum body length (chars, after trimming) for content to count as "real"
 * when there is no reliable status signal. Short of this, a body reads as a
 * stub even if technically non-empty (e.g. "TBD", "-", a single word).
 */
const MIN_SUBSTANTIVE_CONTENT_LENGTH = 40;

/**
 * A leaf is substantive only when it carries real, finalized content — never a
 * draft/placeholder stub. Conservative / fail-closed by construction:
 *   - an explicit draft/in-review status is NEVER substantive, no matter how
 *     long the body is (a long draft is still a draft);
 *   - an explicit approved/finalized status still requires a non-placeholder,
 *     non-trivial body (a "finalized" section with an empty/placeholder body
 *     is not real content);
 *   - with no reliable status signal at all, fall back to content length alone
 *     (never invent a status the DB didn't report);
 *   - a bare placeholder body ("TBD", "N/A", …) is never substantive regardless
 *     of status.
 */
function isSubstantive(s: DeviceSectionInput): boolean {
  const content = (s.content ?? '').trim();
  if (content.length === 0) return false;
  if (PLACEHOLDER_BODIES.has(content.toLowerCase())) return false;

  const status = (s.status ?? '').trim().toLowerCase();
  if (DRAFT_STATUSES.has(status)) return false;

  const hasRealLength = content.length >= MIN_SUBSTANTIVE_CONTENT_LENGTH;
  if (FINALIZED_STATUSES.has(status)) return hasRealLength;

  // Status unknown/missing: require the content-length signal alone.
  return hasRealLength;
}

/** Normalize a category/key into a canonical documentType token (device_description, labeling, …). */
function normalizeDocType(raw?: string | null): string | undefined {
  if (!raw) return undefined;
  const t = raw.trim().toLowerCase().replace(/[\s\-/]+/g, '_');
  return t.length > 0 ? t : undefined;
}

/**
 * Pure: project authored device sections onto canonical readiness leaves. Only
 * content-bearing sections become leaves (a gap is never invented). Both the
 * documentType (from category/key) and the title are populated so the mappers'
 * documentType- AND title-matchers can hit.
 */
export function sectionsToLeaves(sections: DeviceSectionInput[]): FilingLeaf[] {
  return (Array.isArray(sections) ? sections : []).filter(isAuthored).map((s) => ({
    sectionCode: String(s.sectionNumber || s.sectionKey || ''),
    title: String(s.sectionTitle || s.sectionKey || 'Untitled section'),
    documentType: normalizeDocType(s.category || s.sectionKey),
    substantive: isSubstantive(s),
  }));
}

/** Minimal query surface — the node-postgres Pool, a PoolClient, or PGlite. */
export interface DeviceContentClient {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

export interface LoadDeviceContentLeavesOptions {
  /** Scope to one legacy document's sections (cerv2_510k_sections.document_id) when known. */
  documentId?: number;
  /**
   * The regulatory program (regulatory_programs.id) whose GOVERNED device
   * document to read. When set, the legacy store is not consulted at all.
   */
  programId?: string;
  /** Query client for the governed store (defaults to the shared pool). */
  client?: DeviceContentClient;
}

/** Which store answered a content load — echoed by the routes so a caller can tell. */
export type DeviceContentSource = 'governed_program' | 'legacy_document' | 'legacy_org_wide';

export function deviceContentSource(opts: Pick<LoadDeviceContentLeavesOptions, 'documentId' | 'programId'>): DeviceContentSource {
  if (opts.programId) return 'governed_program';
  if (opts.documentId !== undefined) return 'legacy_document';
  return 'legacy_org_wide';
}

/**
 * Decide which store a load should read, and say so.
 *
 * A program anchor reads its governed document when that document holds at
 * least one authored section. A program whose governed document is empty, or
 * that has none (authored through the legacy editor), reads the legacy store as
 * before — narrowed to `documentId` when given, else org-wide. The returned
 * `scope` is what the loaders take; `source` is what the routes echo.
 */
export async function resolveDeviceContentScope(
  organizationId: number,
  opts: LoadDeviceContentLeavesOptions = {},
): Promise<{ scope: LoadDeviceContentLeavesOptions; source: DeviceContentSource; docType?: string }> {
  if (opts.programId) {
    let authored = false;
    let docType: string | undefined;
    {
      const doc = await loadGovernedDeviceDocument(organizationId, opts.programId, opts.client);
      if (doc) {
        docType = doc.docType;
        const rows = await loadGovernedSectionRows(doc.id, opts.client ?? pool);
        authored = governedSectionsToDeviceSections(rows).some(isAuthored);
      }
    }
    // NOT `catch { authored = false }`. A failed read of the program's governed
    // document is not "this program has no governed content": the fallback that
    // followed returned the LEGACY scope with documentId undefined, i.e. every
    // cerv2_510k_sections row in the organization. A timeout while assembling
    // program A's package silently assembled it from every device in the org —
    // the exact ESTAR-01 defect this module's header says was fixed, reachable
    // again through the error path, and invisible because /build's success
    // response does not echo deviceContentSource. Let the failure surface; the
    // route reports it.
    if (authored) {
      // The class travels with the scope so /build can pick a renderer and a
      // package label that match the document (a PMA is not a 510(k) package).
      // It comes from the SAME tenant-scoped lookup the loader runs.
      return { scope: { programId: opts.programId, client: opts.client }, source: 'governed_program', docType };
    }
  }
  const legacy: LoadDeviceContentLeavesOptions = { documentId: opts.documentId, client: opts.client };
  return { scope: legacy, source: deviceContentSource(legacy) };
}

/** The governed document classes that hold device / IVD content. */
export const GOVERNED_DEVICE_DOC_TYPES: ReadonlyArray<string> = ['k510', 'denovo', 'pma', 'cer'];

/** A c2c_document_sections row, as the governed store returns it. */
export interface GovernedDeviceSectionRow {
  /** c2c_document_sections.id (bigserial — some drivers return it as a string). */
  id?: number | string;
  section_key: string;
  label: string;
  status: string | null;
  content: unknown;
  mandatory?: boolean | null;
}

/**
 * Pure: a governed section row → the adapter's section shape. The label is the
 * documentType source (the mappers match 'device_description', 'labeling', …
 * against it); the rule-pack key is the section code. Content is read through
 * the same reader the editor's lineage gate uses, so `{text}`, `{paragraphs}`
 * and `{markdown}` bodies all count.
 */
export function governedSectionsToDeviceSections(rows: ReadonlyArray<GovernedDeviceSectionRow>): DeviceSectionInput[] {
  return rows.map((r) => ({
    sectionNumber: r.section_key,
    sectionKey: r.section_key,
    sectionTitle: r.label,
    category: r.label,
    status: r.status,
    content: sectionPlainText(r.content),
  }));
}

/**
 * The ONE authored-ness rule for a governed section row, shared with the
 * MDR/IVDR technical-file assembler so it cannot drift from readiness: a row is
 * authored only when its body (read through sectionPlainText) is non-empty.
 */
export function governedSectionIsAuthored(row: GovernedDeviceSectionRow): boolean {
  return isAuthored(governedSectionsToDeviceSections([row])[0]);
}

/**
 * Load the governed device document for a program — tenant-scoped, the most
 * recently created document of one of `docTypes` (default: the k510 / denovo /
 * pma / cer device classes) for that program — and its sections in outline
 * order. Returns no rows (never throws) when the program has no such governed
 * document in this organization.
 *
 * `docTypes` lets the EU technical-file assembler select ONLY the program's
 * `mdr` (or `ivdr`) document: "latest governed document of any device type"
 * would let a CER be packaged as the MDR technical file.
 */
export async function loadGovernedDeviceSections(
  organizationId: number,
  programId: string,
  client: DeviceContentClient = pool,
  docTypes: ReadonlyArray<string> = GOVERNED_DEVICE_DOC_TYPES,
): Promise<GovernedDeviceSectionRow[]> {
  const doc = await loadGovernedDeviceDocument(organizationId, programId, client, docTypes);
  if (!doc) return [];
  return loadGovernedSectionRows(doc.id, client);
}

/** The governed device document a program's content load reads: its id and class. */
export interface GovernedDeviceDocumentRef {
  id: string;
  /** c2c_documents.doc_type — k510 / denovo / pma / cer (or the caller's `docTypes`). */
  docType: string;
}

/**
 * The ONE tenant-scoped c2c_documents lookup behind every governed load: the
 * most recently created document of one of `docTypes` for that program in
 * this organization, with its class. Null (never a throw from an empty result)
 * when the program has none here — the row's class is never looked up by
 * document id alone, so a doc_type can never be read across a tenant boundary.
 */
export async function loadGovernedDeviceDocument(
  organizationId: number,
  programId: string,
  client: DeviceContentClient = pool,
  docTypes: ReadonlyArray<string> = GOVERNED_DEVICE_DOC_TYPES,
): Promise<GovernedDeviceDocumentRef | null> {
  const doc = await client.query<{ id: string; doc_type?: string | null }>(
    `SELECT id, doc_type FROM c2c_documents
      WHERE org_id = $1 AND project_id = $2 AND doc_type = ANY($3::text[])
      ORDER BY created_at DESC
      LIMIT 1`,
    [organizationId, programId, [...docTypes]],
  );
  const row = doc.rows[0];
  if (!row?.id) return null;
  return { id: row.id, docType: String(row.doc_type ?? '') };
}

/** The sections of one governed document, in outline order. */
async function loadGovernedSectionRows(
  documentId: string,
  client: DeviceContentClient,
): Promise<GovernedDeviceSectionRow[]> {
  const sections = await client.query<GovernedDeviceSectionRow>(
    `SELECT id, section_key, label, status, content, mandatory
       FROM c2c_document_sections
      WHERE document_id = $1
      ORDER BY path_order ASC, section_key ASC`,
    [documentId],
  );
  return sections.rows;
}

/**
 * Load a tenant's authored device content and adapt it to readiness leaves.
 * Org-scoped (never trusts request input for the tenant); optionally narrowed to
 * a single document. Mirrors the permissive org-scoping of the live
 * document-preview endpoint.
 *
 * A FAILED READ SURFACES. This used to return [] on any query failure, so a
 * failed read was indistinguishable from an empty one: /build answered 422
 * NO_AUTHORED_CONTENT — "author section content before exporting" — when the
 * read had failed, and /filing-readiness and /assemble reported 0% with every
 * section missing. "An error is never rendered as an empty result" (CLAUDE.md).
 * An empty array from here means the tenant has authored nothing, and nothing
 * else.
 */
export async function loadDeviceContentLeaves(
  organizationId: number,
  opts: LoadDeviceContentLeavesOptions = {},
): Promise<FilingLeaf[]> {
  if (opts.programId) {
    const rows = await loadGovernedDeviceSections(organizationId, opts.programId, opts.client);
    return sectionsToLeaves(governedSectionsToDeviceSections(rows));
  }
  const where =
    opts.documentId !== undefined
      ? and(
          eq(cerv2510kSections.organizationId, organizationId),
          eq(cerv2510kSections.documentId, opts.documentId),
        )
      : eq(cerv2510kSections.organizationId, organizationId);

  const rows = await db
    .select({
      sectionNumber: cerv2510kSections.sectionNumber,
      sectionTitle: cerv2510kSections.sectionTitle,
      sectionKey: cerv2510kSections.sectionKey,
      category: cerv2510kSections.category,
      status: cerv2510kSections.status,
      content: cerv2510kSections.content,
    })
    .from(cerv2510kSections)
    .where(where)
    .orderBy(asc(cerv2510kSections.displayOrder));

  return sectionsToLeaves(rows as DeviceSectionInput[]);
}

/** An authored section projected for document assembly (title + body). */
export interface AuthoredDeviceSection {
  title: string;
  content: string;
  /**
   * The section's rule-pack key (c2c_document_sections.section_key — 'A.3',
   * 'G.5' …) when it came from the governed store, so a per-section package
   * can name its files by outline key. Absent for the legacy store.
   */
  sectionCode?: string;
}

/**
 * Pure: project authored sections onto the editor-JSON shape the export
 * renderers consume (extractSectionsFromEditor): an H1 heading node per
 * section followed by paragraph nodes split on blank lines. Only authored
 * sections appear — an empty section is never invented into the document,
 * so the renderer's per-section "content not found" fallback stays honest.
 */
export function sectionsToEditorJson(sections: AuthoredDeviceSection[]): {
  type: 'doc';
  content: Array<Record<string, unknown>>;
} {
  const content: Array<Record<string, unknown>> = [];
  for (const s of sections) {
    content.push({
      type: 'heading',
      attrs: { level: 1 },
      content: [{ type: 'text', text: s.title }],
    });
    for (const para of s.content.split(/\n{2,}/)) {
      const text = para.trim();
      if (!text) continue;
      content.push({ type: 'paragraph', content: [{ type: 'text', text }] });
    }
  }
  return { type: 'doc', content };
}

/**
 * Load a tenant's authored device sections (title + body) for assembly.
 * Same org-scoped query and honesty rules as loadDeviceContentLeaves: only
 * content-bearing sections return, and a failed read surfaces rather than
 * reading as an absence of content — reporting one as the other tells the user
 * to write sections they have already written.
 */
export async function loadAuthoredDeviceSections(
  organizationId: number,
  opts: LoadDeviceContentLeavesOptions = {},
): Promise<AuthoredDeviceSection[]> {
  if (opts.programId) {
    const rows = await loadGovernedDeviceSections(organizationId, opts.programId, opts.client);
    return governedSectionsToDeviceSections(rows)
      .filter(isAuthored)
      .map((r) => ({ title: String(r.sectionTitle), content: String(r.content), sectionCode: String(r.sectionKey ?? '') || undefined }));
  }
  const where =
    opts.documentId !== undefined
      ? and(
          eq(cerv2510kSections.organizationId, organizationId),
          eq(cerv2510kSections.documentId, opts.documentId),
        )
      : eq(cerv2510kSections.organizationId, organizationId);

  const rows = await db
    .select({
      sectionTitle: cerv2510kSections.sectionTitle,
      sectionKey: cerv2510kSections.sectionKey,
      content: cerv2510kSections.content,
    })
    .from(cerv2510kSections)
    .where(where)
    .orderBy(asc(cerv2510kSections.displayOrder));

  return rows
    .filter((r) => (r.content ?? '').trim().length > 0)
    .map((r) => ({
      title: String(r.sectionTitle || r.sectionKey || 'Untitled section'),
      content: String(r.content),
    }));
}

export default {
  sectionsToLeaves,
  loadDeviceContentLeaves,
  sectionsToEditorJson,
  loadAuthoredDeviceSections,
  loadGovernedDeviceSections,
  loadGovernedDeviceDocument,
  governedSectionsToDeviceSections,
  governedSectionIsAuthored,
  deviceContentSource,
  resolveDeviceContentScope,
};
