import { getAllINDSections, type INDSection } from '../../../services/regulatory/ind-ectd-sections';
import { normalizeCtdCode } from '../../../shared/regulatory/section-code';
import { CTD_AUTHORING_GUIDANCE } from '../ind/ctd/authoring-guidance';
import { getIchM4Heading, ichHeadingTitle } from '../ind/ctd/ich-m4-headings';
import type { CtdSection } from '../ind/ctd/types';
import { ctdComponentSections, ctdRecordSubtree } from '../market-specs/ctd-component-outlines';
import type { TemplateSection } from '../market-specs/document-template-library';
import type { IndTemplateOutlineSection } from './ind-template-types';

/*
 * One record (D2 cleanup C1, 2026-10-25). This projector read the IND section
 * list and the guidance half of the ICH M2–M5 record, never its structural
 * half, so a 2.4 Nonclinical Overview had no 2.4.1–2.4.6 and pasted the
 * template library's six headings in as "2.4:work:N" rows, and a 2.7 Clinical
 * Summary stopped at 2.7.6 while the picker's GLOBAL Clinical Summary beside it
 * held 49 headings. It now walks the record (`ctdRecordSubtree`): every row's
 * number and title are the record's. The IND list supplies only what the
 * record does not hold for a heading: its 21 CFR reference and description.
 */
const IND_SECTIONS = new Map(getAllINDSections().filter(section => ['M2', 'M3'].includes(section.module))
  .map(section => [normalizeCtdCode(section.code)!, section]));
const GUIDANCE = new Map(Object.values(CTD_AUTHORING_GUIDANCE).filter(section => section.module === 2 || section.module === 3)
  .map(section => [section.code, section]));
const REFERENCE_SCOPE = 'Platform reference guidance for a working outline. Assess applicability to the product and current IND stage, '
  + 'use verified supporting records, and explain missing or non-applicable evidence. These expectations do not add required filing '
  + 'sections or establish completeness, approval or submission readiness.';

function briefGuidance(code: string, reference: string, guidance: CtdSection): IndTemplateOutlineSection['guidance'] {
  return {
    guidance_text: `${REFERENCE_SCOPE}\n\n${guidance.authoringGuidance}`,
    regulatory_references: [...new Set([reference, guidance.guidance])],
    compliance_checklist: [...new Set([...guidance.keyContentElements, ...(guidance.expectedData ?? [])])],
    common_pitfalls: [...(guidance.commonPitfalls ?? [])],
    source_reference: `server/services/ind/ctd/authoring-guidance.ts#${code}`,
  };
}

/** A heading the record holds no brief for: the IND list's description where it has one, else the outline's own purpose line. */
function headingGuidance(code: string, root: INDSection, purpose: string | undefined): IndTemplateOutlineSection['guidance'] {
  const listed = IND_SECTIONS.get(code);
  const basis = getIchM4Heading(code)?.basis.ref;
  const text = listed?.description ?? purpose ?? `The ICH M4 heading ${code} ${ichHeadingTitle(code)}.`;
  return {
    guidance_text: `${REFERENCE_SCOPE}\n\n${text}`,
    regulatory_references: [...new Set([listed?.regulatoryRef ?? root.regulatoryRef, ...(basis ? [basis] : [])])],
    compliance_checklist: [text],
    common_pitfalls: [],
    source_reference: listed ? `services/regulatory/ind-ectd-sections.ts#${listed.code}` : `server/services/ind/ctd/ich-m4-headings.ts#${code}`,
  };
}

const flatten = (list: TemplateSection[]): TemplateSection[] => list.flatMap(s => [s, ...flatten(s.subsections ?? [])]);

/** One scope, from the one ICH M2–M5 record: the selected heading first, then
 * every heading the record holds below it, in CTD order. Reference requirements
 * stay separate from authored facts; no generation prompt, study result,
 * certification or marketing-application verdict is seeded. */
export function buildModule2Or3Outline(section: INDSection): IndTemplateOutlineSection[] {
  const code = normalizeCtdCode(section.code);
  if (!code || !['M2', 'M3'].includes(section.module) || section.module !== `M${code[0]}`) return [];
  if (ichHeadingTitle(code) === null) return [];
  const purposes = new Map(flatten(ctdComponentSections(code)).map(s => [s.number, s.purpose]));
  const codes = [code, ...ctdRecordSubtree(code).map(h => h.code)];
  return codes.map((c, index): IndTemplateOutlineSection => {
    const guidance = GUIDANCE.get(c);
    const reference = IND_SECTIONS.get(c)?.regulatoryRef ?? section.regulatoryRef;
    return {
      code: c,
      title: ichHeadingTitle(c)!,
      content: '',
      ordering: (index + 1) * 100,
      guidance: guidance ? briefGuidance(c, reference, guidance) : headingGuidance(c, section, purposes.get(c)),
    };
  });
}
