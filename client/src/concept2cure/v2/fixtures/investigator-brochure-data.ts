/**
 * InvestigatorBrochure surface fixture — a realistic ICH E6(R2) §7 IB section
 * tree for an in-development small molecule (BX-115). Shapes exactly the display
 * contract the surface renders and the GET /api/investigator-brochure route
 * returns ({ number, title, required, status, gaps, description, depth }), so the
 * surface renders offline and only adopts the live list on a shape match.
 *
 * `status` is the deterministic regulatory verdict from the IB gap engine:
 *   rendered — all inputs the section needs are present
 *   partial  — some needed inputs present, some absent
 *   missing  — no needed input present yet (nothing to say)
 */

export interface IBSectionRow {
  number: string;
  title: string;
  required: boolean;
  status: 'rendered' | 'partial' | 'missing';
  gaps: string[];
  description: string;
  /** 0 = top-level IB chapter / front matter, 1 = sub-section (e.g. 4.1). */
  depth: number;
}

/** Product the sample IB is drafted for (shown in the surface header). */
export const IB_PRODUCT_NAME = 'BX-115';

/** Realistic mid-development IB: front matter + nonclinical complete, clinical
 *  and marketing experience still open (early-phase program). */
export const IB_SECTIONS: IBSectionRow[] = [
  { number: '0', title: 'Title Page', required: true, status: 'rendered', gaps: [], depth: 0,
    description: 'Sponsor name, product identifier(s), IB edition number and date, supersedes statement' },
  { number: '0a', title: 'Confidentiality Statement', required: true, status: 'rendered', gaps: [], depth: 0,
    description: 'Confidentiality notice and intended-recipient statement for investigators and IRB/IEC' },
  { number: '0b', title: 'Table of Contents', required: true, status: 'rendered', gaps: [], depth: 0,
    description: 'Auto-generated table of contents for the IB' },
  { number: '1', title: 'Summary', required: true, status: 'partial', depth: 0,
    gaps: ['clinical summary (M2.5/M2.7)', 'integrated safety / marketing experience'],
    description: 'Concise summary of significant physical, chemical, pharmaceutical, pharmacological, toxicological, pharmacokinetic, and clinical information' },
  { number: '2', title: 'Introduction', required: true, status: 'rendered', gaps: [], depth: 0,
    description: 'Chemical name, active ingredients, pharmacological class, rationale and anticipated indication(s), general approach to evaluation' },
  { number: '3', title: 'Physical, Chemical, and Pharmaceutical Properties and Formulation', required: true, status: 'rendered', gaps: [], depth: 0,
    description: 'Description of the substance (structural formula), physical/chemical/pharmaceutical properties, formulation and excipients, storage and handling' },
  { number: '4', title: 'Nonclinical Studies', required: true, status: 'rendered', gaps: [], depth: 0,
    description: 'Summary of nonclinical pharmacology, pharmacokinetics, and toxicology results' },
  { number: '4.1', title: 'Nonclinical Pharmacology', required: true, status: 'rendered', gaps: [], depth: 1,
    description: 'Primary and secondary pharmacodynamics, mechanism of action, safety pharmacology' },
  { number: '4.2', title: 'Pharmacokinetics and Product Metabolism in Animals', required: true, status: 'rendered', gaps: [], depth: 1,
    description: 'Absorption, distribution, metabolism, and excretion (ADME) in animal species' },
  { number: '4.3', title: 'Toxicology', required: true, status: 'rendered', gaps: [], depth: 1,
    description: 'Single- and repeat-dose toxicity, genotoxicity, carcinogenicity, reproductive toxicity, NOAELs and target-organ findings' },
  { number: '5', title: 'Effects in Humans', required: true, status: 'missing', depth: 0,
    gaps: ['clinical summary (M2.5/M2.7)', 'integrated safety / marketing experience'],
    description: 'Summary of clinical pharmacokinetics, metabolism, safety, efficacy, and marketing experience' },
  { number: '5.1', title: 'Pharmacokinetics and Metabolism in Humans', required: true, status: 'missing', depth: 1,
    gaps: ['clinical summary (M2.5/M2.7)'],
    description: 'Human PK including absorption, distribution, protein binding, metabolism, excretion; population PK and special populations' },
  { number: '5.2', title: 'Safety and Efficacy', required: true, status: 'missing', depth: 1,
    gaps: ['clinical summary (M2.5/M2.7)', 'integrated safety / marketing experience'],
    description: 'Summary of safety and efficacy across studies; adverse drug reactions by body system; identified and potential risks' },
  { number: '5.3', title: 'Marketing Experience', required: false, status: 'missing', depth: 1,
    gaps: ['integrated safety / marketing experience'],
    description: 'Countries where marketed/approved/withdrawn; post-marketing findings significant to safety' },
  { number: '6', title: 'Summary of Data and Guidance for the Investigator', required: true, status: 'partial', depth: 0,
    gaps: ['clinical summary (M2.5/M2.7)', 'integrated safety / marketing experience'],
    description: 'Integrated discussion of nonclinical and clinical data; practical guidance on recognition and treatment of possible overdose and adverse drug reactions; risk-benefit context' },
  { number: '7', title: 'References', required: false, status: 'rendered', gaps: [], depth: 0,
    description: 'List of references to publications and reports cited in the IB' },
];
