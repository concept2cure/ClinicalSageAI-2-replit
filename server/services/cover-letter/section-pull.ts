/**
 * eSTAR section pull — tenant-safe lookup of section content.
 *
 * The cover-letter composer needs verbatim text from specific eSTAR sections
 * (typically §3 Indications for Use, §6 Substantial Equivalence, §11
 * Performance, §12 Labeling). This module owns the read path.
 *
 * Tenant safety: every read joins `organization_id`. There is no escape
 * hatch — callers must supply the calling user's `organizationId`.
 *
 * The current implementation reads from `cerv2_510k_sections`. The
 * cerv2_510k_sections.documentId field is how a section is associated with
 * a particular eSTAR document; pass `documentId` when you have it.
 *
 * If the section is missing the function returns a placeholder marker
 * `{ content: null, status: 'missing' }` rather than throwing. The composer
 * decides how to surface gaps in the rendered draft.
 */

import { and, eq, inArray } from 'drizzle-orm';

import { db } from '../../db';
import { cerv2510kSections } from '../../../shared/schema';

export interface SectionPullRequest {
  organizationId: number;
  documentId: number;
  sectionNumbers: string[];
}

export interface PulledSection {
  sectionNumber: string;
  sectionTitle: string | null;
  content: string | null;
  status: 'present' | 'missing' | 'empty';
  completionPercentage: number;
}

export async function pullEstarSections(
  req: SectionPullRequest,
): Promise<PulledSection[]> {
  if (req.sectionNumbers.length === 0) return [];

  // The eSTAR convention stores section numbers as decimals ("3.0", "6.0",
  // "11.0"). Q-Sub commitments and the default cover-letter caller pass
  // the integer form ("3", "6", "11"). Match both spellings — exact OR the
  // same number with a ".0" suffix — so callers don't have to know the
  // local storage convention.
  const expanded = new Set<string>();
  for (const n of req.sectionNumbers) {
    expanded.add(n);
    if (/^\d+$/.test(n)) {
      expanded.add(`${n}.0`);
    } else if (/^\d+\.0$/.test(n)) {
      expanded.add(n.slice(0, -2));
    }
  }

  const rows = await db
    .select({
      sectionNumber: cerv2510kSections.sectionNumber,
      sectionTitle: cerv2510kSections.sectionTitle,
      content: cerv2510kSections.content,
      completionPercentage: cerv2510kSections.completionPercentage,
    })
    .from(cerv2510kSections)
    .where(
      and(
        eq(cerv2510kSections.organizationId, req.organizationId),
        eq(cerv2510kSections.documentId, req.documentId),
        inArray(cerv2510kSections.sectionNumber, [...expanded]),
      ),
    );

  // Build the lookup keyed by both the canonical-stored value AND the
  // requested form so the caller's exact section number resolves either way.
  const byNumber = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    byNumber.set(row.sectionNumber, row);
    if (/^\d+\.0$/.test(row.sectionNumber)) {
      byNumber.set(row.sectionNumber.slice(0, -2), row);
    } else if (/^\d+$/.test(row.sectionNumber)) {
      byNumber.set(`${row.sectionNumber}.0`, row);
    }
  }

  // Return one PulledSection per requested number, in request order, marking
  // missing rows explicitly. This makes the composer's job stable across
  // partial data.
  return req.sectionNumbers.map(num => {
    const row = byNumber.get(num);
    if (!row) {
      return {
        sectionNumber: num,
        sectionTitle: null,
        content: null,
        status: 'missing' as const,
        completionPercentage: 0,
      };
    }
    const content = (row.content ?? '').trim();
    return {
      sectionNumber: num,
      sectionTitle: row.sectionTitle,
      content: content.length > 0 ? content : null,
      status: content.length > 0 ? ('present' as const) : ('empty' as const),
      completionPercentage: row.completionPercentage ?? 0,
    };
  });
}
