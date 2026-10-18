import { getAllINDSections, type INDSection } from '../../../services/regulatory/ind-ectd-sections';
import { compareSectionCode, normalizeCtdCode } from '../../../shared/regulatory/section-code';
import { CTD_AUTHORING_GUIDANCE } from '../ind/ctd/authoring-guidance';
import type { CtdSection } from '../ind/ctd/types';
import { templateForCtdSection } from '../market-specs/document-template-library';
import type { IndTemplateOutlineSection } from './ind-template-types';

const IND_SECTIONS = new Map(getAllINDSections().filter(section => ['M2', 'M3'].includes(section.module))
  .map(section => [normalizeCtdCode(section.code)!, section]));
const GUIDANCE = new Map(Object.values(CTD_AUTHORING_GUIDANCE).filter(section => section.module === 2 || section.module === 3)
  .map(section => [section.code, section]));
const REFERENCE_SCOPE = 'Platform reference guidance for a working outline. Assess applicability to the product and current IND stage, '
  + 'use verified supporting records, and explain missing or non-applicable evidence. These expectations do not add required filing '
  + 'sections or establish completeness, approval or submission readiness.';

function inScope(code: string, root: string): boolean {
  return code === root || code.startsWith(`${root}.`);
}

function sourceGuidance(code: string, section: INDSection, guidance: CtdSection | undefined): IndTemplateOutlineSection['guidance'] {
  if (!guidance) return {
    guidance_text: `${REFERENCE_SCOPE}\n\n${section.description}`,
    regulatory_references: [section.regulatoryRef],
    compliance_checklist: [section.description],
    common_pitfalls: [],
    source_reference: `services/regulatory/ind-ectd-sections.ts#${section.code}`,
  };
  return {
    guidance_text: `${REFERENCE_SCOPE}\n\n${guidance.authoringGuidance}`,
    regulatory_references: [...new Set([section.regulatoryRef, guidance.guidance])],
    compliance_checklist: [...new Set([...guidance.keyContentElements, ...(guidance.expectedData ?? [])])],
    common_pitfalls: [...(guidance.commonPitfalls ?? [])],
    source_reference: `server/services/ind/ctd/authoring-guidance.ts#${code}`,
  };
}

function outlineRow(code: string, root: INDSection): IndTemplateOutlineSection {
  const section = IND_SECTIONS.get(code) ?? root;
  const guidance = GUIDANCE.get(code);
  const rootCode = normalizeCtdCode(root.code);
  return {
    code,
    title: code === rootCode ? root.title : IND_SECTIONS.get(code)?.title ?? guidance!.title,
    content: '',
    ordering: 0,
    guidance: sourceGuidance(code, section, guidance),
  };
}

function localWorkingRows(code: string, root: INDSection): IndTemplateOutlineSection[] {
  const template = templateForCtdSection(code);
  if (!template) return [];
  return template.sections.map((section, index): IndTemplateOutlineSection => ({
    code: `${code}:work:${index + 1}`,
    title: section.heading,
    content: '',
    ordering: 0,
    guidance: {
      guidance_text: `${REFERENCE_SCOPE}\n\nDocument-local working heading from reference outline ${section.number}; not a CTD filing node.\n\n${section.purpose}`,
      regulatory_references: [...new Set([root.regulatoryRef, template.regulatoryBasis])],
      compliance_checklist: [section.purpose],
      common_pitfalls: [],
      source_reference: `server/services/market-specs/document-template-library.ts#${template.id}:${section.number}`,
    },
  }));
}

/** One scope, derived from existing records: the selected root stays first,
 * followed by its recorded IND/CTD guidance descendants. A recorded expert
 * outline expands a body without such descendants as explicit local work
 * headings, including when that body is inside a selected module. Reference
 * requirements stay separate from authored facts; no generation prompt,
 * study result, certification or marketing-application verdict is seeded. */
export function buildModule2Or3Outline(section: INDSection): IndTemplateOutlineSection[] {
  const code = normalizeCtdCode(section.code);
  if (!code || !['M2', 'M3'].includes(section.module) || section.module !== `M${code[0]}`) return [];
  if (!IND_SECTIONS.has(code) && !GUIDANCE.has(code)) return [];
  const codes = [...new Set([code, ...IND_SECTIONS.keys(), ...GUIDANCE.keys()])]
    .filter(candidate => inScope(candidate, code)).sort(compareSectionCode);
  const rows = codes.flatMap((candidate, index) => {
    const row = outlineRow(candidate, section);
    if (codes[index + 1]?.startsWith(`${candidate}.`)) return [row];
    return [row, ...localWorkingRows(candidate, IND_SECTIONS.get(candidate) ?? section)];
  });
  return rows.map((row, index) => ({ ...row, ordering: (index + 1) * 100 }));
}
