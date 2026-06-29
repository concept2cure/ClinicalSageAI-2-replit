/**
 * Protocol Templates deterministic logic (Capability C2C-20a)
 *
 * Pure, DB-free, LLM-free: merge a template's sections with the kind's canonical
 * required sections (built-in SECTION_TEMPLATES) so a cloned document never drops a
 * regulatorily-required section, and validate a template before save.
 *
 * @module server/services/protocol-templates/protocol-templates-logic
 */

import { templateFor, type ProtocolKind } from '../protocol-development/protocol-development-logic';

export interface TemplateSectionView {
  sectionKey: string;
  title: string;
  content?: string | null;
  required?: boolean;
  orderIndex?: number;
}

export interface MergedSection {
  sectionKey: string;
  title: string;
  content: string | null;
  required: boolean;
  orderIndex: number;
  /** Where the section came from: the template, or injected from the required catalog. */
  origin: 'template' | 'catalog';
}

/**
 * Merge a template's sections with the kind's canonical required sections. Template
 * sections win on content/title/order; any required catalog section missing from the
 * template is appended (origin 'catalog') so the cloned document is never missing a
 * required section. Pure.
 */
export function mergeTemplateSections(kind: ProtocolKind, templateSections: TemplateSectionView[]): MergedSection[] {
  const out: MergedSection[] = [];
  const seen = new Set<string>();
  let order = 0;
  for (const s of [...templateSections].sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0))) {
    if (seen.has(s.sectionKey)) continue;
    seen.add(s.sectionKey);
    out.push({
      sectionKey: s.sectionKey,
      title: s.title,
      content: s.content ?? null,
      required: s.required ?? true,
      orderIndex: order++,
      origin: 'template',
    });
  }
  for (const cat of templateFor(kind)) {
    if (seen.has(cat.sectionKey)) continue;
    seen.add(cat.sectionKey);
    out.push({ sectionKey: cat.sectionKey, title: cat.title, content: null, required: cat.required, orderIndex: order++, origin: 'catalog' });
  }
  return out;
}

export interface TemplateValidation { valid: boolean; findings: string[]; coversRequired: boolean }

/**
 * Validate a template: it must have at least one section, and we flag (non-blocking)
 * any required catalog section it omits. `coversRequired` is true when every required
 * catalog section is present. Pure.
 */
export function validateTemplate(kind: ProtocolKind, templateSections: TemplateSectionView[]): TemplateValidation {
  const findings: string[] = [];
  if (templateSections.length === 0) findings.push('Template has no sections.');
  const keys = new Set(templateSections.map((s) => s.sectionKey));
  const missing = templateFor(kind).filter((c) => c.required && !keys.has(c.sectionKey));
  for (const m of missing) findings.push(`Missing required section "${m.title}" (will be injected from the catalog on clone).`);
  return { valid: templateSections.length > 0, findings, coversRequired: missing.length === 0 };
}
