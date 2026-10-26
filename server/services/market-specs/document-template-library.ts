/**
 * Document template library — the canonical SECTION STRUCTURE (heading skeleton)
 * of the key submission documents, with each section's purpose and regulatory basis.
 *
 * WHY THIS EXISTS: server/services/regulatory/templateCatalog.ts already lists
 * document templates as METADATA (id, title, format, aiDraftable) but carries no
 * actual document structure — there is no canonical heading outline an author or
 * the section-generation engine can scaffold against. This library supplies that:
 * for each document, the ordered sections (number + heading + purpose + required),
 * keyed by the same ids templateCatalog uses where they overlap.
 *
 * HONESTY ABOUT CONTENT: these are the FACTUAL document structures defined by the
 * cited published guidance (ICH M4Q/M4S/M4E for the CTD summaries; 21 CFR 807.92
 * for the 510(k) summary; the EU SmPC guideline / Directive 2001/83/EC Art. 11 for
 * the SmPC; EU MDR Annex I and IVDR Annex I for the two GSPR checklists). They are heading skeletons + concise
 * purpose notes — NOT drafted regulatory prose and NOT a substitute for the current
 * agency template. Authors fill the content; this provides the spine.
 *
 * The CSR outline is not kept here: it is read from the canonical ICH E3 tree
 * (server/services/ind/ctd, csr-e3-*.ts), so it cannot drift from it.
 *
 * PURE + DETERMINISTIC data + lookups: no DB, no network, no LLM.
 *
 * @module server/services/market-specs/document-template-library
 */

import type { E3Section } from '../ind/ctd/index.js';
import { e3SectionSummary, e3SectionDraftingMode, ICH_E3_GUIDANCE } from '../ind/ctd/csr-e3-guidance.js';
import { CRF_AUTHORING_TEMPLATES } from './crf-authoring-templates';
import { SMPC_QRD_SECTIONS } from '../labeling/smpc-qrd-catalog';
import { basisLabel, type RegulatoryBasis } from '../../../shared/regulatory/regulatory-basis';
import { IB_FRONT_MATTER, IB_SUBSECTIONS } from './ib-outline-detail.js';
import { PBRER_TEMPLATE } from './pbrer-outline.js';
import { citeE6R3 } from '../../../shared/regulatory/ich-e6r3';
import { GLOBAL_REGISTRY, isDeviceRegistryEntry, isSharedPlanningRegistryEntry, getApplicationType } from '../../../shared/regulatory/global-document-registry';
import { getSectionBlueprintForEntry } from '../../../shared/regulatory/project-bootstrap';
import type { RegulatoryApplicationType, SectionBlueprint } from '../../../shared/regulatory/document-taxonomy';
import { ICH_E2F_DSUR_SECTIONS } from '../ind/ctd/lifecycle-document-types';
import { lifecycleRecordOutlineFor } from './lifecycle-record-outlines';
import { ctdComponentTemplate, ctdFrontMatter } from './ctd-component-outlines';
import { ICH_M11_PROTOCOL_OUTLINE } from '../ind/ctd/protocol-m11-guidance';
import { ICH_M11_PROTOCOL_LIMITATIONS, ICH_M11_PROTOCOL_SECTIONS } from '../../../shared/regulatory/protocol-m11';
import { getSectionBlueprint as getDedicatedSectionBlueprint, getSectionBlueprintContext } from '../regulatory/sectionBlueprintCatalog';

export interface TemplateSection {
  /** Section number within the document (e.g. "2.5.4", "4.1", "I.1"). */
  number: string;
  heading: string;
  /** What this section is for (concise, factual). */
  purpose: string;
  required: boolean;
  /** Explicit section preparation policy, recorded with saved template guidance. */
  drafting_mode?: 'narrative' | 'manual';
  /** Sub-sections, where the record names them (e.g. the IB's 4.1–4.3). */
  subsections?: TemplateSection[];
  /** Headings a correction replaced, so a document bound to an earlier outline still resolves to this section (2026-10-19). */
  formerTitles?: string[];
}

export interface DocumentTemplateStructure {
  /** Stable id; matches templateCatalog ids where the document overlaps. */
  id: string;
  title: string;
  /** Submission families this structure applies to. */
  families: Array<'ectd' | 'estar' | 'eu_mdr' | 'eu_ivdr' | 'ctis'>;
  /** CTD section code where applicable (e.g. "2.5"). */
  ctdSection?: string;
  /**
   * Published structure source, as shown to the reader. Where `basis` is set this
   * is `basisLabel(basis)`, so a recall basis reads as recall.
   */
  regulatoryBasis: string;
  /** The structured basis, where one is recorded (shared/regulatory/regulatory-basis.ts). */
  basis?: RegulatoryBasis;
  /** Which existing platform record supplies the headings; distinct from evidence of an agency requirement. */
  outlineSource?:
    | { kind: 'project-blueprint' | 'dedicated-blueprint'; registryId: string; blueprintId: string }
    | { kind: 'lifecycle-record' | 'document-outline'; registryId: string; record: string };
  /** Scope/currency limitations the author must see before using an existing scaffold. */
  outlineLimitations?: string[];
  /** Unnumbered front matter (title page, table of contents …), with non-numeric codes. */
  frontMatter?: TemplateSection[];
  sections: TemplateSection[];
}

/**
 * The Investigator's Brochure's basis, from the platform's one record of
 * ICH E6(R3) (shared/regulatory/ich-e6r3.ts): Appendix A, confidence `recall`,
 * carrying the currency fact `ich-e6r3-gcp-step4` so the Step 4 date is read
 * from the registry and is never copied into this file. `url` is FDA's hosted
 * E6(R3) copy — where a reader can go, not a claim that it was read; the note
 * `citeE6R3` supplies says it was not.
 */
const IB_APPENDIX_A = citeE6R3({ kind: 'appendix', id: 'A' });
const IB_BASIS: RegulatoryBasis = {
  ...IB_APPENDIX_A,
  url: 'https://www.fda.gov/media/169090/download',
  note: [IB_APPENDIX_A.note, "the section numbers below are this library's ordinals, not E6 numbering"]
    .filter((part): part is string => Boolean(part))
    .join('; '),
};

/** A template whose shown basis is the one rendering of its structured basis — the two cannot disagree. */
function withBasis(t: Omit<DocumentTemplateStructure, 'regulatoryBasis'> & { basis: RegulatoryBasis }): DocumentTemplateStructure {
  return { ...t, regulatoryBasis: basisLabel(t.basis) };
}

/** Every numbered E3 heading uses the same record and source-preparation policy. */
function e3TemplateSection(s: E3Section): TemplateSection {
  return { number: s.number, heading: s.title, purpose: e3SectionSummary(s), required: s.applies === 'always', drafting_mode: e3SectionDraftingMode(s.number) };
}

/**
 * Existing project scaffolds are useful authoring spines, but their `required`
 * flag is a platform expectation, not proof of a present agency requirement.
 * Never turn project-bootstrap's default CTD fallback into a document outline.
 */
/** The quality outlines are headings; composing their content is the CMC lane's (P-28). */
const QUALITY_COMPOSITION_LIMIT =
  'These are the CTD quality headings only. For a small-molecule US IND, Module 3 content is composed in CMC / Module 3 from its registers (P-28); elsewhere it is authored here from verified source records.';

const PROJECT_OUTLINE_LIMITATIONS = [
  'The required flags describe the existing platform scaffold; they do not establish mandatory agency content.',
  'This is a project authoring scaffold, not the current regional filing schema or a completeness verdict. Confirm the applicable agency and client template before filing.',
];

/**
 * Withhold exact outlines when a future review identifies a scope defect.
 * The previously listed trial/nonclinical defects are repaired in the catalog;
 * their source and applicability limitations remain visible in every projection.
 */
const BLUEPRINTS_REQUIRING_REVIEW: ReadonlySet<string> = new Set();

function exactBlueprint(entry: RegulatoryApplicationType): SectionBlueprint | undefined {
  const blueprint = getSectionBlueprintForEntry(entry);
  return blueprint.id === entry.defaultSectionBlueprint && blueprint.sections.length > 0 ? blueprint : undefined;
}

/** Logical authoring families only; an unmodeled regional format is never defaulted to eCTD. */
function authoringFamilies(entry: RegulatoryApplicationType): DocumentTemplateStructure['families'] {
  if (entry.segment === 'diagnostics_ivd' && entry.region === 'EU') return ['eu_ivdr'];
  if (entry.segment === 'medical_devices' && entry.region === 'EU') return ['eu_mdr'];
  if (entry.submissionFormat === 'CTIS') return ['ctis'];
  if (entry.dossierStandard === 'eSTAR') return ['estar'];
  if (['eCTD', 'CTD', 'NeeS'].includes(entry.dossierStandard)) return ['ectd'];
  return [];
}

function projectOutline(
  entry: RegulatoryApplicationType,
  blueprint: SectionBlueprint,
  id = entry.id,
  sourceKind: 'project-blueprint' | 'dedicated-blueprint' = 'project-blueprint',
): DocumentTemplateStructure {
  const context = getSectionBlueprintContext(entry.id);
  return withBasis({
    id,
    title: entry.displayName,
    families: authoringFamilies(entry),
    basis: context.basis ?? {
      ref: `Concept2Cure existing project blueprint ${blueprint.id}`,
      confidence: 'platform-convention',
      note: `Headings and scaffold expectations read from ${sourceKind === 'dedicated-blueprint' ? 'server/services/regulatory/sectionBlueprintCatalog.ts' : 'shared/regulatory/project-bootstrap.ts'}; not independently verified current regional requirements.`,
    },
    outlineSource: { kind: sourceKind, registryId: entry.id, blueprintId: blueprint.id },
    outlineLimitations: [...PROJECT_OUTLINE_LIMITATIONS, ...context.limitations],
    sections: blueprint.sections.map((s) => ({
      number: s.code,
      heading: s.title,
      purpose: s.guidance
        ? `${s.title}. The existing scaffold cites ${s.guidance}; confirm the current applicable guidance and populate from sponsor source records.`
        : `Populate ${s.title} from sponsor source records. The existing scaffold supplies this heading, not a verified agency content specification.`,
      required: s.required,
    })),
  });
}

/** Named component outlines are projections, never a second heading tree. */
function namedProjectOutline(id: string, registryId: string, ctdSection?: string, limitations: string[] = []): DocumentTemplateStructure[] {
  const entry = getApplicationType(registryId);
  const blueprint = entry && exactBlueprint(entry);
  if (!entry || !blueprint) return [];
  const outline = projectOutline(entry, blueprint, id);
  return [{
    ...outline,
    // A component can be reused by CTIS even when its registry row has no
    // standalone submission format (e.g. a SAP). This is authoring reuse,
    // never a claim that it is a standalone eCTD filing.
    families: ctdSection ? ['ectd'] : ['ectd', 'ctis'],
    ...(ctdSection ? { ctdSection } : {}),
    outlineLimitations: [...PROJECT_OUTLINE_LIMITATIONS, ...limitations],
  }];
}

const EXISTING_BIOTECH_COMPONENT_OUTLINES: DocumentTemplateStructure[] = [
  withBasis({
    id: 'protocol',
    title: ICH_M11_PROTOCOL_OUTLINE.title,
    families: ['ectd', 'ctis'],
    basis: ICH_M11_PROTOCOL_OUTLINE.governing[0],
    outlineSource: { kind: 'document-outline', registryId: 'ICH_PROTOCOL', record: 'ICH_M11_PROTOCOL_OUTLINE' },
    outlineLimitations: [...ICH_M11_PROTOCOL_LIMITATIONS],
    sections: ICH_M11_PROTOCOL_SECTIONS.map((s) => ({
      number: s.code,
      heading: s.title,
      purpose: s.purpose,
      required: true,
    })),
  }),
  ...namedProjectOutline('statistical_analysis_plan', 'ICH_SAP'),
  ...namedProjectOutline('informed_consent', 'ICH_ICF', undefined, [
    'The existing consent scaffold is US-oriented. Confirm the country, site, language and ethics-approved template. Executed participant consent forms remain site records; this outline is for a specimen form.',
  ]),
  // Module 3's drug substance and drug product: read from the ICH M2–M5 record since
  // 2026-10-25 (D2 cleanup C2), where they were the project blueprint's copies.
  ctdComponentTemplate({ id: 'drug_substance', registryId: 'ICH_M3_DS', root: '3.2.S', title: 'Module 3.2.S — Drug Substance', guideline: 'ICH M4Q(R1) — CTD Quality', limitations: [QUALITY_COMPOSITION_LIMIT] }),
  ctdComponentTemplate({ id: 'drug_product', registryId: 'ICH_M3_DP', root: '3.2.P', title: 'Module 3.2.P — Drug Product', guideline: 'ICH M4Q(R1) — CTD Quality', limitations: [QUALITY_COMPOSITION_LIMIT] }),
  withBasis({
    id: 'dsur',
    title: 'Development Safety Update Report (DSUR)',
    families: ['ectd', 'ctis'],
    basis: { ...ICH_E2F_DSUR_SECTIONS[0].basis[0], ref: 'ICH E2F — Development Safety Update Report section structure' },
    outlineSource: { kind: 'lifecycle-record', registryId: 'ICH_DSUR', record: 'ICH_E2F_DSUR_SECTIONS' },
    outlineLimitations: [
      'All sections are retained; where information is absent or not applicable, state that explicitly. A populated outline is not a completed safety assessment.',
      'Confirm the region-specific filing route and administrative requirements; this harmonised structure does not establish regional placement or transmission capability.',
    ],
    // The corrected E2F record has 20 numbered sections plus unnumbered
    // front/back matter. Never reuse the legacy 11-section project outline.
    sections: ICH_E2F_DSUR_SECTIONS.map((s) => ({
      number: s.number ?? s.title.toLowerCase().replace(/\s+/g, '_'),
      heading: s.title,
      purpose: s.guidance,
      required: s.required,
    })),
  }),
];

/** What each top-level SmPC section is for, keyed by QRD section number (sections 1–10). */
const SMPC_PURPOSE: Record<string, string> = {
  '1': 'Invented name, strength, and pharmaceutical form.',
  '2': 'Active substance(s) and excipients with known effect.',
  '3': 'The pharmaceutical form and appearance.',
  '4': 'Indications, posology, contraindications, warnings, interactions, fertility/pregnancy, effects on driving, undesirable effects, overdose (4.1–4.9).',
  '5': 'Pharmacodynamic, pharmacokinetic, and preclinical safety properties (5.1–5.3).',
  '6': 'Excipients, incompatibilities, shelf life, storage, container, handling (6.1–6.6).',
  '7': 'Name and address of the MAH.',
  '8': 'The MA number(s).',
  '9': 'Authorisation and renewal dates.',
  '10': 'Date the SmPC text was last revised.',
};

export const DOCUMENT_TEMPLATES: DocumentTemplateStructure[] = [
  // ── CTD Module 2 summaries (ICH M4) ─────────────────────────────────────────
  // The Quality Overall Summary is read from the ICH M2–M5 record since 2026-10-25
  // (D2 cleanup C2): a five-heading hand copy before, with its Introduction coded
  // 2.3.Intro while the project blueprint coded it 2.3.I.
  ctdComponentTemplate({
    id: 'quality_overall_summary', registryId: 'ICH_QOS', root: '2.3', title: 'Quality Overall Summary (QOS)', guideline: 'ICH M4Q(R1) — CTD Quality',
    frontMatter: [ctdFrontMatter('2.3', '2.3.I', 'Introduction', '2.3.Introduction')],
    limitations: [QUALITY_COMPOSITION_LIMIT],
  }),
  // The Nonclinical Overview, Clinical Overview and Clinical Summary are read
  // from the ICH M2–M5 record to its depth (ctd-component-outlines.ts). They were
  // hand copies of their first level until 2026-10-20: a Clinical Summary had no
  // 2.7.4.2 Adverse Events and a Clinical Overview stopped at 2.5.6.
  ctdComponentTemplate({ id: 'nonclinical_overview', registryId: 'ICH_NONCLIN_OVERVIEW', root: '2.4', title: 'Nonclinical Overview', guideline: 'ICH M4S(R2) — CTD Safety' }),
  ctdComponentTemplate({ id: 'clinical_overview', registryId: 'ICH_CLIN_OVERVIEW', root: '2.5', title: 'Clinical Overview', guideline: 'ICH M4E(R2) — CTD Efficacy' }),
  ctdComponentTemplate({ id: 'clinical_summary', registryId: 'ICH_CLIN_SUMMARY', root: '2.7', title: 'Clinical Summary', guideline: 'ICH M4E(R2) — CTD Efficacy' }),

  // ── Administrative ──────────────────────────────────────────────────────────
  {
    id: 'cover_letter',
    title: 'Submission Cover Letter',
    families: ['ectd', 'estar', 'ctis'],
    // No ctdSection: the Module 1 placement differs by region (1.1 is FDA Forms).
    regulatoryBasis: 'Regional Module 1 administrative guidance — FDA M1 1.2 Cover letters; EU M1 1.0; NMPA 1.0; MFDS 1.2 (server/services/regional-ctd-templates.ts)',
    sections: [
      { number: '1', heading: 'Applicant and Product Identification', purpose: 'Applicant/sponsor, product, application/sequence number, and submission type.', required: true },
      { number: '2', heading: 'Purpose of the Submission', purpose: 'What this sequence contains and why it is being filed.', required: true },
      { number: '3', heading: 'Regulatory References', purpose: 'Prior meetings, agreements, designations, and related applications.', required: false },
      { number: '4', heading: 'Contents Overview', purpose: 'High-level list of the documents/modules included.', required: true },
      { number: '5', heading: 'Contact and Signature', purpose: 'Responsible contact and authorised signatory.', required: true },
    ],
  },

  // ── FDA device — 510(k) summary ─────────────────────────────────────────────
  {
    id: 'k510_summary',
    title: '510(k) Summary',
    families: ['estar'],
    regulatoryBasis: '21 CFR 807.92 (510(k) Summary)',
    sections: [
      { number: '1', heading: 'Submitter Information', purpose: 'Submitter name, address, contact, and date prepared.', required: true },
      { number: '2', heading: 'Device Name', purpose: 'Trade/proprietary name, common name, and classification name.', required: true },
      { number: '3', heading: 'Predicate Device(s)', purpose: 'The legally marketed predicate(s) to which equivalence is claimed.', required: true },
      { number: '4', heading: 'Device Description', purpose: 'Description of the device and how it functions.', required: true },
      { number: '5', heading: 'Intended Use / Indications for Use', purpose: 'Statement of intended use and indications.', required: true },
      { number: '6', heading: 'Technological Characteristics Comparison', purpose: 'Comparison of the device’s technology to the predicate.', required: true },
      { number: '7', heading: 'Performance Data', purpose: 'Summary of non-clinical and, where applicable, clinical performance testing.', required: true },
      { number: '8', heading: 'Substantial Equivalence Conclusion', purpose: 'Conclusion that the device is substantially equivalent to the predicate.', required: true },
    ],
  },

  // ── EU — SmPC ───────────────────────────────────────────────────────────────
  {
    id: 'smpc',
    title: 'Summary of Product Characteristics (SmPC)',
    families: ['ectd'],
    regulatoryBasis: 'Directive 2001/83/EC Art. 11; EU SmPC guideline / QRD template v10.4 (02/2024)',
    // Numbers and headings from the one SmPC record (smpc-qrd-catalog.ts);
    // the purpose notes are this library's overlay, keyed by number.
    sections: SMPC_QRD_SECTIONS.filter((s) => s.depth === 0).map((s) => ({
      number: s.number,
      heading: s.title,
      purpose: SMPC_PURPOSE[s.number] ?? '',
      required: true,
    })),
  },

  // ── EU device — GSPR checklists, one per regulation ─────────────────────────
  // 2026-10-05 (g-ivdr-gspr-checklist, F73 part A): this was one template for
  // eu_mdr and eu_ivdr, citing MDR Annex I numbering for both ("IVDR Annex I is
  // parallel"). It is not: IVDR Annex I is Sections 1–8 / 9–19 / 20, MDR Annex I
  // 1–9 / 10–22 / 23, so an IVD checklist sent labelling to a "Requirement 23"
  // the IVDR does not have. Each regulation now has its own checklist. Both
  // numberings are recall (EUR-Lex was not reachable; corroborated by secondary
  // sources) — docs/evidence/D2-ANA-DOCUMENT-INTELLIGENCE/2026-10-05-record/
  // g-ivdr-gspr-checklist-facts.md.
  withBasis({
    id: 'gspr_checklist',
    title: 'General Safety and Performance Requirements (GSPR) Checklist — MDR',
    families: ['eu_mdr'],
    basis: {
      ref: 'Regulation (EU) 2017/745 (MDR) Annex I',
      confidence: 'recall',
      note: 'Section ranges by recall, corroborated by secondary sources; re-read owed against EUR-Lex CELEX:02017R0745.',
    },
    sections: [
      { number: 'I', heading: 'Chapter I — General Requirements', purpose: 'Sections 1–9: safety/performance, risk management, risk-control, lifecycle risk.', required: true },
      { number: 'II', heading: 'Chapter II — Requirements Regarding Design and Manufacture', purpose: 'Sections 10–22: chemical/physical/biological properties, infection, construction, software, energy, etc.', required: true },
      { number: 'III', heading: 'Chapter III — Requirements Regarding the Information Supplied with the Device', purpose: 'Section 23: label and instructions for use.', required: true },
    ],
  }),
  withBasis({
    id: 'ivdr_gspr_checklist',
    title: 'General Safety and Performance Requirements (GSPR) Checklist — IVDR',
    families: ['eu_ivdr'],
    basis: {
      ref: 'Regulation (EU) 2017/746 (IVDR) Annex I',
      confidence: 'recall',
      note: 'Section ranges by recall, corroborated by secondary sources; re-read owed against EUR-Lex CELEX:02017R0746-20250110.',
    },
    sections: [
      { number: 'I', heading: 'Chapter I — General Requirements', purpose: 'Sections 1–8: performance for the intended purpose, risk management, risk control, benefit-risk, transport and storage.', required: true },
      { number: 'II', heading: 'Chapter II — Requirements Regarding Performance, Design and Manufacture', purpose: 'Sections 9–19: performance characteristics (analytical and clinical), chemical/physical/biological properties, infection and microbial contamination, interaction with the environment, measuring function, software, self-testing and near-patient testing, etc.', required: true },
      { number: 'III', heading: 'Chapter III — Requirements Regarding Information Supplied with the Device', purpose: 'Section 20: 20.1 general requirements; 20.2 information on the label; 20.3 information on the packaging which maintains the sterile condition; 20.4 information in the instructions for use.', required: true },
    ],
  }),

  // ── EU IVD — Performance Evaluation Report ──────────────────────────────────
  {
    id: 'performance_evaluation_report',
    title: 'Performance Evaluation Report (PER)',
    families: ['eu_ivdr'],
    regulatoryBasis: 'Regulation (EU) 2017/746 (IVDR) Annex XIII',
    sections: [
      { number: '1', heading: 'Scientific Validity', purpose: 'Demonstration of the association of the analyte with the clinical condition.', required: true },
      { number: '2', heading: 'Analytical Performance', purpose: 'Analytical sensitivity/specificity, accuracy, precision, and other analytical characteristics.', required: true },
      { number: '3', heading: 'Clinical Performance', purpose: 'Diagnostic sensitivity/specificity and predictive values in the intended population.', required: true },
      { number: '4', heading: 'Performance Evaluation Conclusion', purpose: 'Overall conclusion on benefit-risk based on the performance evidence.', required: true },
    ],
  },

  // ── EU CTA — IMPD ───────────────────────────────────────────────────────────
  {
    id: 'impd',
    title: 'Investigational Medicinal Product Dossier (IMPD)',
    families: ['ctis'],
    regulatoryBasis: 'Regulation (EU) 536/2014; EU IMPD guidance',
    sections: [
      { number: 'S', heading: 'Drug Substance (Quality)', purpose: 'Quality data on the active substance for the IMP.', required: true },
      { number: 'P', heading: 'Drug Product (Quality)', purpose: 'Quality data on the investigational medicinal product.', required: true },
      { number: 'NC', heading: 'Nonclinical Pharmacology and Toxicology', purpose: 'Nonclinical safety supporting the trial.', required: true },
      { number: 'C', heading: 'Previous Clinical Trial and Human Experience', purpose: 'Summary of prior clinical experience relevant to safety.', required: true },
      { number: 'BR', heading: 'Overall Benefit-Risk Assessment', purpose: 'Integrated benefit-risk for the proposed trial.', required: true },
    ],
  },

  // ── Investigator's Brochure (ICH E6(R3) Appendix A) ─────────────────────────
  // 2026-10-05, re-checked 2026-10-11 (g-csr-copies-onto-e3, finding 8): the
  // guideline in force puts the IB in Appendix A. This entry's label was
  // migrated off the superseded revision on trunk on 2026-10-08, so what this
  // step adds is the TYPED basis `IB_BASIS` — built by `citeE6R3` from
  // shared/regulatory/ich-e6r3.ts, so the citation text, its `recall`
  // confidence and its currency fact all have one home, and the dated status is
  // read from the currency registry rather than written out here. A bare string
  // would read as settled regulator text; the rendered label says `recall`.
  // The headings are unchanged; 1–6 are this library's ordinals, not E6
  // numbering. Facts:
  // docs/evidence/D2-ANA-DOCUMENT-INTELLIGENCE/
  // 2026-10-05-record/g-csr-copies-onto-e3-facts.md.
  withBasis({
    id: 'investigators_brochure',
    title: "Investigator's Brochure (IB)",
    families: ['ectd', 'ctis'],
    basis: IB_BASIS,
    frontMatter: IB_FRONT_MATTER,
    sections: [
      { number: '1', heading: 'Summary', purpose: 'Concise summary of the significant physical, chemical, pharmaceutical, pharmacological, toxicological, and clinical information.', required: true },
      { number: '2', heading: 'Introduction', purpose: 'Chemical/generic name, properties, rationale, and anticipated indications.', required: true },
      { number: '3', heading: 'Physical, Chemical and Pharmaceutical Properties and Formulation', purpose: 'Description of the substance and formulation.', required: true },
      { number: '4', heading: 'Nonclinical Studies', purpose: 'Nonclinical pharmacology, pharmacokinetics, and toxicology results.', required: true, subsections: IB_SUBSECTIONS['4'] },
      { number: '5', heading: 'Effects in Humans', purpose: 'Pharmacokinetics, safety, efficacy, and marketing experience in humans.', required: true, subsections: IB_SUBSECTIONS['5'] },
      { number: '6', heading: 'Summary of Data and Guidance for the Investigator', purpose: 'Overall discussion and guidance on recognising/treating possible overdose and adverse reactions.', required: true },
    ],
  }),

  // ── EU Risk Management Plan (GVP Module V) ──────────────────────────────────
  {
    id: 'risk_management_plan',
    title: 'Risk Management Plan (RMP)',
    families: ['ectd'],
    regulatoryBasis: 'EU GVP Module V; Commission Implementing Regulation (EU) 520/2012',
    sections: [
      { number: 'I', heading: 'Product Overview', purpose: 'Administrative information about the product and the RMP.', required: true },
      { number: 'II', heading: 'Safety Specification', purpose: 'Modules SI–SVIII: epidemiology, nonclinical, clinical-trial exposure, populations not studied, post-authorisation experience, and the safety concerns (important identified/potential risks, missing information).', required: true },
      { number: 'III', heading: 'Pharmacovigilance Plan', purpose: 'Routine and additional pharmacovigilance activities to characterise the safety concerns.', required: true },
      { number: 'IV', heading: 'Plans for Post-Authorisation Efficacy Studies', purpose: 'PAES where required.', required: false },
      { number: 'V', heading: 'Risk Minimisation Measures', purpose: 'Routine and additional risk-minimisation measures and their effectiveness evaluation.', required: true },
      { number: 'VI', heading: 'Summary of the Risk Management Plan', purpose: 'Public-facing summary.', required: true },
      { number: 'VII', heading: 'Annexes', purpose: 'Supporting annexes.', required: false },
    ],
  },

  // ── Periodic Benefit-Risk Evaluation Report (ICH E2C(R2)) — pbrer-outline.ts
  PBRER_TEMPLATE,

  // ── Clinical Study Report (ICH E3) ──────────────────────────────────────────
  {
    id: 'clinical_study_report',
    title: 'Clinical Study Report (CSR)',
    families: ['ectd'],
    ctdSection: '5.3.5.1',
    regulatoryBasis: 'ICH E3 — Structure and Content of Clinical Study Reports (canonical tree: server/services/ind/ctd/csr-e3-guidance.ts, with a basis per section)',
    sections: ICH_E3_GUIDANCE.map(e3TemplateSection),
  },
  ...CRF_AUTHORING_TEMPLATES,
  ...EXISTING_BIOTECH_COMPONENT_OUTLINES,
];

// ── Lookups (pure) ────────────────────────────────────────────────────────────

const BY_ID = new Map(DOCUMENT_TEMPLATES.map((t) => [t.id, t]));

/** Compatibility names share the existing object; no new id or heading copy. */
const TEMPLATE_ALIASES: Readonly<Record<string, string>> = {
  'protocol-m11': 'protocol',
  investigator_brochure: 'investigators_brochure',
  rmp: 'risk_management_plan',
};

export function getDocumentTemplate(id: string): DocumentTemplateStructure | undefined {
  return BY_ID.get(TEMPLATE_ALIASES[id] ?? id);
}

/** Existing component records win over older project heading copies. */
const REGISTRY_COMPONENT_TEMPLATES: Readonly<Record<string, string>> = {
  ICH_PROTOCOL: 'protocol',
  ICH_SAP: 'statistical_analysis_plan',
  ICH_ICF: 'informed_consent',
  ICH_M3_DS: 'drug_substance',
  ICH_M3_DP: 'drug_product',
  ICH_DSUR: 'dsur',
  ICH_CSR: 'clinical_study_report',
  ICH_IB: 'investigators_brochure',
  EU_RMP: 'risk_management_plan',
  EU_PER: 'performance_evaluation_report',
  ICH_QOS: 'quality_overall_summary',
  ICH_NONCLIN_OVERVIEW: 'nonclinical_overview',
  ICH_CLIN_OVERVIEW: 'clinical_overview',
  ICH_CLIN_SUMMARY: 'clinical_summary',
  EU_PSUR: 'pbrer',
};

/** Share component identity with inquiry and drafting without copying this map. */
export function componentTemplateIdForRegistry(registryId: string): string | undefined {
  return REGISTRY_COMPONENT_TEMPLATES[registryId];
}

/** Known existing structures whose scope still needs regional review. */
export function registryOutlineRequiresReview(registryId: string): boolean {
  return BLUEPRINTS_REQUIRING_REVIEW.has(registryId);
}

/**
 * A registry-driven outline for an existing authoring type. Missing, fallback
 * and known mis-scoped structures stay unavailable. Registry metadata alone
 * never becomes a claim that AnA has a qualified document builder.
 */
export async function getRegistryDocumentTemplate(registryId: string): Promise<DocumentTemplateStructure | undefined> {
  const entry = getApplicationType(registryId);
  if (!entry?.active || registryOutlineRequiresReview(entry.id)) return undefined;
  // Existing component records win over older project heading copies
  // (lifecycle-record-outlines.ts: the annual reports, PAS/sBLA, CBE, meetings).
  const lifecycle = lifecycleRecordOutlineFor(entry.id);
  if (lifecycle) return lifecycle;
  const component = componentTemplateIdForRegistry(entry.id);
  if (component) {
    const outline = getDocumentTemplate(component);
    return outline ? { ...outline, id: entry.id } : undefined;
  }
  // Mirror project creation/preview precedence. The dedicated catalog contains
  // the regional marketing outlines that the shared registry cannot supply.
  const dedicated = await getDedicatedSectionBlueprint(entry.id);
  if (dedicated) return projectOutline(entry, dedicated, entry.id, 'dedicated-blueprint');
  const shared = exactBlueprint(entry);
  return shared ? projectOutline(entry, shared) : undefined;
}

export interface RegistryDocumentTemplateCoverage {
  registryId: string;
  displayName: string;
  region: RegulatoryApplicationType['region'];
  applicationFamily: RegulatoryApplicationType['applicationFamily'];
  requestedBlueprintId: string;
  /** The project blueprint the served outline is read from; absent when the outline is a record, not a blueprint. */
  blueprintId?: string;
  /** Where the served outline is read from (a blueprint, a lifecycle record, a document outline). */
  outlineSource?: DocumentTemplateStructure['outlineSource'];
  outlineAvailable: boolean;
  reason?: 'existing_blueprint_requires_regional_review' | 'no_dedicated_existing_outline';
}

/** Existing medicinal/device/IVD and shared planning outlines, including gaps; no guessed CTD fallback. */
export async function registryDocumentTemplateCoverage(): Promise<RegistryDocumentTemplateCoverage[]> {
  return Promise.all(GLOBAL_REGISTRY.filter((e) => e.active && (e.segment === 'pharma_biotech' || isDeviceRegistryEntry(e) || isSharedPlanningRegistryEntry(e))).map(async (entry) => {
    const outline = await getRegistryDocumentTemplate(entry.id);
    // The row names the outline actually served: a filing whose outline is a
    // lifecycle record no longer reports the blueprint it was once read from
    // (review nit, 2026-10-18: US_TYPE_B_MEETING reported us_type_b_meeting_sections).
    // A blueprint id is reported only when that blueprint is what is served: a
    // component template or a record is not a blueprint (review nit, 2026-10-18).
    const source = outline?.outlineSource;
    const blueprint = source && 'blueprintId' in source ? { id: source.blueprintId } : undefined;
    return {
      registryId: entry.id,
      displayName: entry.displayName,
      region: entry.region,
      applicationFamily: entry.applicationFamily,
      requestedBlueprintId: entry.defaultSectionBlueprint,
      ...(blueprint ? { blueprintId: blueprint.id } : {}),
      ...(source ? { outlineSource: source } : {}),
      outlineAvailable: Boolean(outline),
      ...(!outline ? { reason: BLUEPRINTS_REQUIRING_REVIEW.has(entry.id)
        ? 'existing_blueprint_requires_regional_review' as const
        : 'no_dedicated_existing_outline' as const } : {}),
    };
  }));
}

/** Templates applicable to a submission family. */
export function templatesForFamily(
  family: 'ectd' | 'estar' | 'eu_mdr' | 'eu_ivdr' | 'ctis'
): DocumentTemplateStructure[] {
  return DOCUMENT_TEMPLATES.filter((t) => t.families.includes(family));
}

/** Template by its CTD section code, where defined. */
export function templateForCtdSection(ctdSection: string): DocumentTemplateStructure | undefined {
  return DOCUMENT_TEMPLATES.find((t) => t.ctdSection === ctdSection);
}

export function documentTemplateIds(): string[] {
  return DOCUMENT_TEMPLATES.map((t) => t.id);
}

export default {
  DOCUMENT_TEMPLATES,
  getDocumentTemplate,
  templatesForFamily,
  templateForCtdSection,
  documentTemplateIds,
  getRegistryDocumentTemplate,
  registryDocumentTemplateCoverage,
};
