import { writeFileSync } from 'node:fs';
import { getIndAuthoringTemplates, indTemplateSnapshot } from '../../../../../../server/services/authoring/ind-authoring-templates';
import { plainTextToHtml } from '../../../../../../shared/authoring/plain-text-html';

const templates = getIndAuthoringTemplates();
const entries = [
  { key: 'M1-form', entryId: 'section:m1.1.1', title: 'Renamed administrative preparation', body: 'The synthetic sponsor contact is identified in the source record.' },
  { key: 'M2-narrative', entryId: 'section:m2.5', title: 'Renamed clinical working notes', body: 'The synthetic clinical rationale awaits supporting project evidence.' },
  { key: 'M3-narrative', entryId: 'section:m3.2.S.1', title: 'Renamed quality working notes', body: 'The synthetic drug-substance description awaits verified supporting records.' },
  { key: 'M4-outline', entryId: 'module:M4', title: 'Renamed nonclinical preparation outline', body: 'The synthetic nonclinical outline identifies outstanding original study records.' },
  { key: 'M4-GLP-record', entryId: 'phase4.glp_compliance:deliverable:0', title: 'Renamed nonclinical source checks', body: 'The synthetic source-record inventory awaits the original signed GLP statement.' },
  { key: 'M5-listings', entryId: 'section:m5.3.7', title: 'Renamed clinical source preparation', body: 'The synthetic source-record inventory awaits the original case report forms and patient listings.' },
];
const at = '2026-10-14T10:00:00.000Z';
const cases = entries.map((entry, i) => {
  const template = templates.find(t => t.entryId === entry.entryId);
  if (!template) throw new Error(`Missing existing template ${entry.entryId}`);
  const n = String(i + 1).padStart(12, '0');
  const id = `dddddddd-0000-4000-8000-${n}`;
  const sectionId = `aaaaaaaa-0000-4000-8000-${n}`;
  const first = template.sections[0];
  const source = { id: template.id, entryId: template.entryId, version: template.version,
    sha256: indTemplateSnapshot(template), kind: template.kind, aiDraftable: template.aiDraftable,
    authoringMode: template.authoringMode, originalFormat: template.originalFormat, limitations: template.limitations };
  const document = { id, title: entry.title, module: template.module, template_id: template.id,
    status: 'DRAFT', updated_at: at, section_count: 1, created_by: 1, product_code: null, c2c_document_id: null,
    provenance: { source: 'template', governedWrite: 'unverified', templateSource: source } };
  const section = { id: sectionId, doc_id: id, code: first.code, title: first.title,
    content: plainTextToHtml(entry.body), order_index: 0, updated_at: at };
  const guidance = { template_guidance: [{ id: `synthetic-guidance-${i + 1}`, ...first.guidance,
    template_source: source, source: 'section-create-audit' }] };
  return { key: entry.key, source, document, sections: [section], guidance, plainBody: entry.body };
});
const snapshot = { fixture: 'Synthetic browser contract; no live service or original regulated record.',
  actor: { id: 1, email: 'synthetic@example.invalid', displayName: 'Synthetic evaluator', organizationId: 1, roles: ['regulatory-author'] },
  program: { id: 'bbbbbbbb-0000-4000-8000-000000000091', name: 'Synthetic template oversight program', stage: 'IND', status: 'ACTIVE', product_type: 'drug' },
  cases };
writeFileSync(new URL('./api-contract.json', import.meta.url), JSON.stringify(snapshot, null, 2) + '\n');
console.info(JSON.stringify(cases.map(c => ({ key: c.key, entryId: c.source.entryId, id: c.source.id, sha256: c.source.sha256,
  module: c.document.module, aiDraftable: c.source.aiDraftable })), null, 2));
