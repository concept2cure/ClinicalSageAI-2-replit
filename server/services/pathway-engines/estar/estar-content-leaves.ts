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
 * HONEST-BY-CONSTRUCTION: a section becomes a "present" leaf ONLY when it carries
 * actual authored content (non-empty body). An empty/placeholder section is NOT a
 * leaf — so it correctly reads as a gap in readiness, never invented. Pure adapter
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

export default { sectionsToLeaves, loadDeviceContentLeaves };
