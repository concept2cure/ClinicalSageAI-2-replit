/**
 * Exact project section blueprints for the US biotech filing identities whose
 * outline is their own lifecycle record (2026-10-29,
 * docs/design/US_BIOTECH_FILING_COMPLETION_2026-10-27.md).
 *
 * What already exists: each identity's parts are in LIFECYCLE_DOCUMENT_TYPES
 * (ind/ctd/us-biotech-*-sources.ts, appended there), and the template library
 * serves them through lifecycle-record-outlines.ts. The project section layer
 * (sectionBlueprintCatalog.ts) did not know them, so each identity resolved to
 * the shared generic CTD fallback (`default_sections`) for readiness, package
 * building, the bootstrap preview and AnA. This module is a PROJECTION of those
 * records, not a copy of their headings: a correction to a record reaches the
 * project blueprint with it.
 *
 * The blueprint id is the entry's own defaultSectionBlueprint, so every reader
 * that compares the two (document-template-library.ts exactBlueprint,
 * AnaDocumentDraftingService's fallback check) sees an exact identity.
 *
 * @module server/services/regulatory/registry/blueprints/usLifecycleRecordBlueprints
 */
import type { SectionBlueprint } from '../../../../../shared/regulatory/document-taxonomy.js';
import type { RegulatoryBasis } from '../../../../../shared/regulatory/regulatory-basis.js';
import { getApplicationType } from '../../../../../shared/regulatory/global-document-registry.js';
import { LIFECYCLE_DOCUMENT_TYPES, US_BIOTECH_LIFECYCLE_RECORD_BY_REGISTRY_ID } from '../../../ind/ctd/lifecycle-document-types.js';
import type { LifecycleDocumentType } from '../../../ind/ctd/types.js';

const MANUAL_TYPES = new Set(['form', 'data', 'table']);

function recordFor(registryId: string): LifecycleDocumentType {
  const recordId = US_BIOTECH_LIFECYCLE_RECORD_BY_REGISTRY_ID[registryId];
  const record = LIFECYCLE_DOCUMENT_TYPES.find(r => r.id === recordId);
  if (!record || record.registryId !== registryId || record.components.length === 0) {
    throw new Error(`The lifecycle record for ${registryId} is unavailable.`);
  }
  return record;
}

function projectBlueprint(registryId: string): SectionBlueprint {
  const entry = getApplicationType(registryId);
  if (!entry) throw new Error(`${registryId} is not a registry identity.`);
  const record = recordFor(registryId);
  return {
    id: entry.defaultSectionBlueprint,
    name: record.label,
    sections: record.components.map(c => ({
      code: c.code,
      title: c.title,
      // A compatibility grouping, as usIndAmendmentBlueprint uses it: these
      // parts are not CTD-placed by this outline.
      module: 1,
      required: c.required,
      contentType: c.contentType,
      guidance: [
        c.authoringGuidance,
        `Source guidance: ${c.guidance}`,
        MANUAL_TYPES.has(c.contentType)
          ? 'Prepare this part manually from the original form, dataset, table or signed record; AnA does not generate or replace it.'
          : 'Narrative part: draft only from cited source records.',
      ].join('\n\n'),
      ...(c.formerTitles?.length ? { formerTitles: [...c.formerTitles] } : {}),
    })),
  };
}

/** Every exact blueprint this module projects, keyed by registry id. */
export const US_LIFECYCLE_RECORD_SECTION_BLUEPRINTS: Readonly<Record<string, SectionBlueprint>> = Object.freeze(
  Object.fromEntries(Object.keys(US_BIOTECH_LIFECYCLE_RECORD_BY_REGISTRY_ID).map(id => [id, projectBlueprint(id)])),
);

/** The record's basis and limits, for getSectionBlueprintContext; undefined for any other id. */
export function usLifecycleRecordBlueprintContext(registryId: string): { basis: RegulatoryBasis; limitations: readonly string[] } | undefined {
  if (!(registryId in US_BIOTECH_LIFECYCLE_RECORD_BY_REGISTRY_ID)) return undefined;
  const record = recordFor(registryId);
  return {
    basis: {
      ref: record.regulatoryBasis.join('; '),
      confidence: 'recall',
      note: `Lifecycle record LIFECYCLE_DOCUMENT_TYPES:${record.id}. Regulator text (eCFR, fda.gov) was not re-read for it; confirm the current text before relying on a deadline or content requirement.`,
    },
    limitations: [
      `Parts of the exact lifecycle record ${record.id}; the module field groups them for compatibility and is not a CTD placement.`,
      'Original forms, datasets, validated tables, listings and signed records are prepared manually from their sources; only narrative parts are AnA-eligible.',
      'Required flags are the record\'s expectations. A conditional part is unresolved, not waived; applicability is the filer\'s decision on the facts.',
      ...(record.timing ? [`Timing, from the record: ${record.timing}`] : []),
    ],
  };
}
