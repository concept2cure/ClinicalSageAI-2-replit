import { buildIndDocumentCatalogSource } from './ind-document-catalog-source';
import { indTemplateReference, getIndAuthoringTemplates } from './ind-authoring-templates';
import type { IndDocumentCatalog } from '../../../shared/authoring/ind-document-catalog';

/** Canonical IND reference entries plus loadable projections in the same editor. */
export function buildIndDocumentCatalog(): IndDocumentCatalog {
  const source = buildIndDocumentCatalogSource();
  const templates = getIndAuthoringTemplates();
  const byEntry = new Map(templates.map(template => [template.entryId, indTemplateReference(template)]));
  return { ...source,
    sections: source.sections.map(entry => ({ ...entry, template: byEntry.get(entry.id) })),
    deliverables: source.deliverables.map(entry => ({ ...entry, template: byEntry.get(entry.id) })),
    moduleTemplates: templates.filter(template => template.entryId.startsWith('module:')).map(indTemplateReference),
  };
}
