/**
 * The Investigator's Brochure's front matter and sub-sections, for the one IB
 * outline (document-template-library.ts 'investigators_brochure'). Added
 * 2026-10-15 from the IB builder's structure, so the builder and the outline
 * are one tree. Body codes 1–6 are in the library and unchanged: seeds, rule
 * packs and saved documents carry them.
 */
import type { TemplateSection } from './document-template-library.js';

export const IB_FRONT_MATTER: TemplateSection[] = [
      { number: 'title_page', heading: 'Title Page', purpose: 'Sponsor name, product identifier(s), IB edition number and date, and the edition it supersedes.', required: true },
      { number: 'confidentiality_statement', heading: 'Confidentiality Statement', purpose: 'Confidentiality notice and intended-recipient statement for investigators and IRB/IEC.', required: true },
      { number: 'table_of_contents', heading: 'Table of Contents', purpose: 'A current table of contents consistent with the headings below.', required: true },
    ];

export const IB_SUBSECTIONS: Record<'4' | '5', TemplateSection[]> = {
  '4': [
          { number: '4.1', heading: 'Nonclinical Pharmacology', purpose: 'Primary and secondary pharmacodynamics, mechanism of action, and safety pharmacology.', required: true },
          { number: '4.2', heading: 'Pharmacokinetics and Product Metabolism in Animals', purpose: 'Absorption, distribution, metabolism and excretion in the animal species studied.', required: true },
          { number: '4.3', heading: 'Toxicology', purpose: 'Single- and repeat-dose toxicity, genotoxicity, carcinogenicity, reproductive toxicity, NOAELs and target-organ findings.', required: true },
  ],
  '5': [
          { number: '5.1', heading: 'Pharmacokinetics and Metabolism in Humans', purpose: 'Human pharmacokinetics, including absorption, distribution, protein binding, metabolism and excretion, and special populations.', required: true },
          { number: '5.2', heading: 'Safety and Efficacy', purpose: 'Safety and efficacy across studies; adverse drug reactions; identified and potential risks.', required: true },
          { number: '5.3', heading: 'Marketing Experience', purpose: 'Where marketed, approved or withdrawn, and post-marketing findings significant to safety. Only where the product has been marketed.', required: false },
  ],
};
