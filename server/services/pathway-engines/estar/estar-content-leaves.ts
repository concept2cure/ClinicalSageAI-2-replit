/**
 * Content → canonical leaves adapter — feeds the readiness mappers with a
 * project's REAL authored content instead of hand-constructed leaves.
 *
 * The readiness engine (estar-filing-readiness / the mappers) consumes canonical
 * leaves ({sectionCode, title, documentType}). Authored device/IVD content lives
 * in `cerv2_510k_sections` (the same table the live document-preview reads). This
 * adapter projects those sections onto leaves so filing-readiness reflects what a
 * client has actually written — turning readiness from a demo into a real tool.
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
import { db } from '../../../db';
import { cerv2510kSections } from '../../../../shared/schema';
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

/** Statuses that represent finalized, non-draft content. */
const FINALIZED_STATUSES = new Set(['approved', 'finalized', 'final']);
/** Statuses that are explicitly still in progress — never substantive regardless of length. */
const DRAFT_STATUSES = new Set(['draft', 'in_review', 'in-progress', 'in_progress']);

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

export interface LoadDeviceContentLeavesOptions {
  /** Scope to one document's sections (cerv2_510k_sections.document_id) when known. */
  documentId?: number;
}

/**
 * Load a tenant's authored device content and adapt it to readiness leaves.
 * Org-scoped (never trusts request input for the tenant); optionally narrowed to
 * a single document. Mirrors the permissive org-scoping of the live
 * document-preview endpoint. Returns [] on any query failure (readiness then
 * honestly reports everything missing rather than throwing).
 */
export async function loadDeviceContentLeaves(
  organizationId: number,
  opts: LoadDeviceContentLeavesOptions = {},
): Promise<FilingLeaf[]> {
  try {
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
  } catch {
    return [];
  }
}

/** An authored section projected for document assembly (title + body). */
export interface AuthoredDeviceSection {
  title: string;
  content: string;
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
 * Same org-scoped query and honesty rules as loadDeviceContentLeaves —
 * only content-bearing sections return; [] on any query failure.
 */
export async function loadAuthoredDeviceSections(
  organizationId: number,
  opts: LoadDeviceContentLeavesOptions = {},
): Promise<AuthoredDeviceSection[]> {
  try {
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
  } catch {
    return [];
  }
}

export default { sectionsToLeaves, loadDeviceContentLeaves, sectionsToEditorJson, loadAuthoredDeviceSections };
