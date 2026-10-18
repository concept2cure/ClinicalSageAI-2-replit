/** Paged reference material from the exact same outline that seeds the editor. */
import { getIndAuthoringTemplate, indTemplateReference } from '../authoring/ind-authoring-templates';

function scopeConflicts(request: { family?: string; market?: string; registryId: string }): boolean {
  return !!((request.family && request.family !== 'ectd') || (request.market && request.market !== 'US') || (request.registryId && request.registryId !== 'US_IND'));
}

export function indTemplateReferencePage(id: string, request: { offset: number; limit: number; family?: string; market?: string; registryId: string }): string | null {
  const template = getIndAuthoringTemplate(id);
  if (!template) return null;
  if (scopeConflicts(request)) throw new Error('This template is a US IND working scaffold; the requested filing scope conflicts.');
  const items: Array<Record<string, unknown>> = [];
  for (const row of template.sections) {
    items.push({ kind: 'heading', code: row.code, title: row.title, order: row.ordering, source: row.guidance.source_reference });
    for (let offset = 0; offset < row.guidance.guidance_text.length; offset += 800) items.push({ kind: 'guidance', code: row.code, characterOffset: offset, text: row.guidance.guidance_text.slice(offset, offset + 800) });
    for (const requirement of row.guidance.compliance_checklist) items.push({ kind: 'source-requirement', code: row.code, text: requirement });
    for (const pitfall of row.guidance.common_pitfalls) items.push({ kind: 'review-point', code: row.code, text: pitfall });
    for (const ref of row.guidance.regulatory_references) items.push({ kind: 'reference', code: row.code, text: ref });
  }
  if (request.offset >= items.length) throw new Error('Template offset is outside this outline. Restart at 0.');
  const page: Array<Record<string, unknown>> = [];
  const render = () => JSON.stringify({ ok: true, outlineAvailable: true, template: indTemplateReference(template), items: page,
    total: items.length, nextOffset: request.offset + page.length < items.length ? request.offset + page.length : null,
    note: 'Same working outline as the editor template. Read every page before planning a draft. Reference guidance is not verified project evidence, an official form, approval or filing readiness.' });
  for (const item of items.slice(request.offset, request.offset + request.limit)) {
    page.push(item);
    if (render().length > 5000) { page.pop(); break; }
  }
  if (!page.length) throw new Error('This reference item exceeds the tool budget; read saved section template guidance in the editor.');
  return render();
}
