/** Loadable projections of the existing IND records, consumed by the existing editor create path. */
import { createHash } from 'node:crypto';
import { stableStringify } from '../../../shared/canonical-json';
import { normalizeCtdCode } from '../../../shared/regulatory/section-code';
import type { IndAuthoringTemplateRef, IndDocumentCatalogDeliverable } from '../../../shared/authoring/ind-document-catalog';
import { getAllINDSections, type INDSection, type CTDModule } from '../../../services/regulatory/ind-ectd-sections';
import { buildIndDocumentCatalogSource } from './ind-document-catalog-source';
import { buildModule1Outline, indSectionOutlineRow } from './ind-template-outlines-m1';
import { buildModule2Or3Outline } from './ind-template-outlines-m2-m3';
import { buildModule4Or5Outline } from './ind-template-outlines-m4-m5';
import type { IndAuthoringTemplate, IndTemplateOutlineSection } from './ind-template-types';

const NAMESPACE = '721e488b710d5ee5ac52a9d8c854c453';
const LIMITS = ['Working scaffold, not an approval, verified evidence or a filing-readiness decision.',
  'Confirm applicability to the product and IND stage; reference requirements can also cover later development.',
  'Additional working headings organize preparation; confirm actual filing placement through the governed workflow.'];
const ORIGINAL = 'Use and retain the original form, dataset, certificate or signed record; this preparation worksheet does not replace it.';

/** RFC 4122 UUIDv5, stable within this versioned projection namespace. */
export function indTemplateId(entryId: string): string {
  const b = createHash('sha1').update(Buffer.from(NAMESPACE, 'hex')).update(`ind-authoring:v1:${entryId}`).digest().subarray(0, 16);
  b[6] = (b[6] & 0x0f) | 0x50; b[8] = (b[8] & 0x3f) | 0x80;
  const h = b.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function orderedUnique(rows: IndTemplateOutlineSection[]): IndTemplateOutlineSection[] {
  const unique = new Map(rows.map(row => [row.code, row]));
  return [...unique.values()].map((row, ordering) => ({ ...row, ordering }));
}

function outline(section: INDSection): IndTemplateOutlineSection[] {
  let rows: IndTemplateOutlineSection[];
  if (section.module === 'M1') rows = buildModule1Outline(section);
  else if (section.module === 'M2' || section.module === 'M3') rows = buildModule2Or3Outline(section);
  else if (section.children?.length) rows = getAllINDSections().filter(s => s.code === section.code || normalizeCtdCode(s.code)?.startsWith(`${normalizeCtdCode(section.code)}.`) === true)
    .flatMap(s => s.children?.length ? [indSectionOutlineRow(s)] : [indSectionOutlineRow(s), ...buildModule4Or5Outline(s)]);
  else rows = buildModule4Or5Outline(section);
  return orderedUnique([indSectionOutlineRow(section), ...rows]);
}

function template(info: { entryId: string; title: string; module: CTDModule | null; aiDraftable: boolean; mode: string; format: string; description: string }, rows: IndTemplateOutlineSection[]): IndAuthoringTemplate {
  const { entryId, title, module, aiDraftable, mode, format, description } = info;
  return { id: indTemplateId(entryId), entryId, name: aiDraftable ? title : `${title} — preparation worksheet`,
    module, kind: aiDraftable ? 'narrative' : 'preparation', aiDraftable, authoringMode: mode, originalFormat: format,
    description, limitations: aiDraftable ? [...LIMITS] : [...LIMITS, ORIGINAL], version: 1, sections: orderedUnique(rows) };
}

function preparationRow(d: IndDocumentCatalogDeliverable): IndTemplateOutlineSection {
  return { code: 'preparation', title: d.title, content: '', ordering: 0, guidance: {
    guidance_text: [d.description, `Preparation for ${d.taskName} in ${d.phaseName}. This deliverable has no recorded CTD placement.`, ...LIMITS,
      !d.aiDraftable ? ORIGINAL : 'Prepare only source-supported text and identify missing evidence.'].filter(Boolean).join('\n\n'),
    regulatory_references: [d.guidance?.fdaGuidanceRef, d.guidance?.ichGuideline, d.guidance?.cfrReference].filter((s): s is string => Boolean(s)),
    compliance_checklist: d.guidance?.keyConsiderations ?? ['Identify inputs, source evidence, outstanding questions and human review.'],
    common_pitfalls: [], source_reference: `services/regulatory/pyramids/ind-pyramid.ts:${d.taskId}`,
  } };
}

function deliverableTemplate(d: IndDocumentCatalogDeliverable, canonical: INDSection[]): IndAuthoringTemplate {
  const bound = canonical.filter(s => d.sectionCodes.some(code => normalizeCtdCode(code) === normalizeCtdCode(s.code)));
  const rows = bound.flatMap(s => outline({ ...s, title: d.title }));
  const selected = rows.length ? rows : [preparationRow(d)];
  const mode = d.aiDraftable ? 'ai_draft' : 'manual';
  return template({ entryId: d.id, title: d.title, module: d.module as CTDModule | null, aiDraftable: d.aiDraftable, mode, format: 'source-dependent', description: d.description ?? d.taskName }, selected);
}

export function getIndAuthoringTemplates(): IndAuthoringTemplate[] {
  const canonical = getAllINDSections();
  const catalog = buildIndDocumentCatalogSource();
  const sections = canonical.filter(s => s.depth > 0).map(s => template({ entryId: `section:${s.code}`, title: `${normalizeCtdCode(s.code)} · ${s.title}`,
    module: s.module, aiDraftable: s.aiDraftable, mode: s.authoringMode, format: s.format, description: s.description }, outline(s)));
  const modules = canonical.filter(s => s.depth === 0).map(s => template({ entryId: `module:${s.module}`, title: `${s.module} · ${s.title}`, module: s.module, aiDraftable: false, mode: 'manual', format: 'mixed', description: s.description },
    outline(s)));
  return [...modules, ...sections, ...catalog.deliverables.map(d => deliverableTemplate(d, canonical))];
}

export function getIndAuthoringTemplate(id: string): IndAuthoringTemplate | undefined {
  return getIndAuthoringTemplates().find(t => t.id === id.toLowerCase());
}

export function indTemplateReference(t: IndAuthoringTemplate): IndAuthoringTemplateRef {
  return { id: t.id, title: t.name, module: t.module, sectionCount: t.sections.length, kind: t.kind,
    aiDraftable: t.aiDraftable, authoringMode: t.authoringMode, originalFormat: t.originalFormat, limitations: t.limitations };
}

export function indTemplateSnapshot(t: IndAuthoringTemplate): string {
  return createHash('sha256').update(stableStringify(t)).digest('hex');
}
