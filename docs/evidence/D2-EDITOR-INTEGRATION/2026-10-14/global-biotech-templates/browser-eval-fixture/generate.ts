import { writeFileSync } from 'node:fs';
import { getBuiltinAuthoringTemplates, builtinTemplateReference, builtinTemplateSnapshot } from '../../../../../../server/services/authoring/builtin-authoring-templates';

const templates = await getBuiltinAuthoringTemplates();
const entries = [
  { key: 'US-NDA', entryId: 'registry:US_NDA', title: 'Synthetic US marketing preparation' },
  { key: 'CA-CTA', entryId: 'registry:CA_CTA', title: 'Synthetic Canadian trial preparation' },
  { key: 'EU-CTA', entryId: 'registry:EU_CTA', title: 'Synthetic European trial preparation' },
  { key: 'JP-CTN', entryId: 'registry:JP_CTN', title: 'Synthetic Japanese trial preparation' },
  { key: 'GLOBAL-QOS', entryId: 'component:quality_overall_summary', title: 'Synthetic shared quality working notes' },
  { key: 'EU-PIL-gap', entryId: 'component:pil', title: 'Synthetic leaflet source preparation' },
];
const at = '2026-10-14T10:00:00.000Z';
const cases = entries.map((entry, i) => {
  const template = templates.find(t => t.entryId === entry.entryId);
  if (!template) throw new Error(`Missing canonical template ${entry.entryId}`);
  const id = `dddddddd-0000-4000-8000-${String(i + 1).padStart(12, '0')}`;
  const source = { id: template.id, entryId: template.entryId, version: template.version,
    sha256: builtinTemplateSnapshot(template), kind: template.kind, aiDraftable: template.aiDraftable,
    authoringMode: template.authoringMode, originalFormat: template.originalFormat, limitations: template.limitations,
    filingContext: template.filingContext };
  const document = { id, title: entry.title, module: template.module, template_id: template.id,
    status: 'DRAFT', updated_at: at, section_count: template.sections.length, created_by: 1,
    product_code: null, c2c_document_id: null,
    provenance: { source: 'template', governedWrite: 'unverified', templateSource: source } };
  const sections = template.sections.map((section, index) => ({
    id: `aaaaaaaa-0000-4000-8000-${String((i + 1) * 1000 + index).padStart(12, '0')}`,
    doc_id: id, code: section.code, title: section.title, content: '', order_index: index, updated_at: at,
  }));
  const guidance = sections.map((section, index) => ({ sectionId: section.id,
    response: { template_guidance: [{ id: `synthetic-guidance-${i + 1}-${index}`, ...template.sections[index].guidance,
      template_source: source, source: 'section-create-audit' }] } }));
  return { key: entry.key, source, document, sections, guidance,
    templateReference: builtinTemplateReference(template),
    plainBody: 'Synthetic preparation notes await verified project evidence and source originals.' };
});
const snapshot = { fixture: 'Synthetic API contract; creation is intercepted, not a database-persistence claim.',
  actor: { id: 1, email: 'synthetic@example.invalid', displayName: 'Synthetic evaluator', organizationId: 1, roles: ['regulatory-author'] },
  program: { id: 'bbbbbbbb-0000-4000-8000-000000000092', name: 'Synthetic regional template program', stage: 'IND', status: 'ACTIVE', product_type: 'drug' },
  templateCount: templates.length, cases };
writeFileSync(new URL('./api-contract.json', import.meta.url), JSON.stringify(snapshot, null, 2) + '\n');
console.info(JSON.stringify(cases.map(c => ({ key: c.key, entryId: c.source.entryId, id: c.source.id,
  sha256: c.source.sha256, module: c.document.module, aiDraftable: c.source.aiDraftable,
  sections: c.sections.length, filingContext: c.source.filingContext })), null, 2));
