import { getAllINDSections, type INDSection } from '../../../services/regulatory/ind-ectd-sections';
import { normalizeCtdCode } from '../../../shared/regulatory/section-code';
import { CTD_AUTHORING_GUIDANCE } from '../ind/ctd/authoring-guidance';
import type { IndTemplateOutlineSection } from './ind-template-types';

function requiredCode(value: string): string {
  const code = normalizeCtdCode(value);
  if (!code) throw new Error('The canonical IND section has no valid identity.');
  return code;
}

/** Canonical FDA identity; the current reference guide stays separate from authored content. */
export function indSectionOutlineRow(section: INDSection): IndTemplateOutlineSection {
  const code = requiredCode(section.code);
  const guide = CTD_AUTHORING_GUIDANCE[code];
  return { code, title: section.title, content: '', ordering: 0, guidance: {
    guidance_text: [section.description, guide?.authoringGuidance,
      'Reference scaffold only. Confirm applicability to this IND and use verified project evidence; no source facts, approvals or signatures are supplied.',
      !section.aiDraftable ? 'Complete or review the original form, dataset or signed record; this worksheet does not replace it.' : null,
    ].filter(Boolean).join('\n\n'),
    regulatory_references: [section.regulatoryRef, guide?.guidance].filter((s): s is string => Boolean(s)),
    compliance_checklist: [...(guide?.keyContentElements ?? []), ...(guide?.expectedData ?? []), 'Identify source records and unresolved evidence gaps.'],
    common_pitfalls: [...(guide?.commonPitfalls ?? [])], source_reference: 'services/regulatory/ind-ectd-sections.ts; server/services/ind/ctd/authoring-guidance.ts',
  } };
}

export function buildModule1Outline(section: INDSection): IndTemplateOutlineSection[] {
  const code = requiredCode(section.code);
  const canonical = getAllINDSections().filter(s => s.module === 'M1' && (s.code === section.code || normalizeCtdCode(s.code)?.startsWith(`${code}.`) === true));
  const rows = canonical.map(indSectionOutlineRow);
  if (!rows.some(row => row.code === code)) rows.unshift(indSectionOutlineRow(section));
  const fields = CTD_AUTHORING_GUIDANCE[code]?.keyContentElements ?? [];
  if (!section.children?.length) fields.forEach((field, i) => rows.push({ code: `${code}:work:${i + 1}`, title: field, content: '', ordering: rows.length,
    guidance: { guidance_text: `${field}\n\nWorking preparation heading, not an additional CTD node. Use the verified source or authentic form and retain the original.`,
      regulatory_references: [section.regulatoryRef], compliance_checklist: [field], common_pitfalls: [], source_reference: 'server/services/ind/ctd/authoring-guidance.ts' } }));
  return rows.map((row, ordering) => ({ ...row, ordering }));
}
