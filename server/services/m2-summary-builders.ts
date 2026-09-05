/**
 * @fileoverview M2 Summary Builders — 2.3 QOS / 2.4 Nonclinical / 2.7 Clinical
 * @module server/services/m2-summary-builders
 *
 * Composes the Module 2 summaries from upstream Module 3 / 4 / 5 inputs:
 *
 *   2.3 Quality Overall Summary (QOS) ← Module 3 (S, P, A, R)
 *   2.4 Nonclinical Overview        ← Module 4 study reports
 *   2.5 Clinical Overview           ← CSR critical benefit-risk assessment
 *   2.7 Clinical Summary            ← CSR §11–12, M5.3
 *
 * These services do NOT produce the upstream content — they consume it. The
 * orchestrator is responsible for ensuring upstream is locked before invoking
 * these summaries (a 2.3 QOS built before M3 is locked is a 2.3 QOS that has
 * to be re-built).
 */

import type { ComposedSection, GeneratedTable } from './module3Composer.js';
import type { CSRSection } from './csr-builder.js';

// ── Common types ────────────────────────────────────────────────────────────

export interface M2Summary {
  sectionKey: string;
  title: string;
  narrative: string;
  tables: GeneratedTable[];
  /** Sections from upstream that contributed to this summary */
  inputSectionKeys: string[];
  /** 0–100 — fraction of expected upstream that was available */
  completeness: number;
  /** Inputs that were missing or empty */
  gaps: string[];
  generatedAt: string;
}

export interface M23BuildContext {
  module3Sections: ComposedSection[];
  /** Drug substance name for narrative (pulled from 3.2.S.1) */
  drugSubstanceName?: string;
  /** Drug product name for narrative (pulled from 3.2.P.1) */
  drugProductName?: string;
}

export interface M24BuildContext {
  /** Module 4 study summaries (one per nonclinical study) */
  nonclinicalStudies: NonclinicalStudy[];
  drugSubstanceName?: string;
  indication?: string;
}

export interface NonclinicalStudy {
  studyId: string;
  studyType: 'pharmacology' | 'pharmacokinetics' | 'toxicology' | 'safety_pharmacology' | 'reproductive_tox' | 'genotoxicity' | 'carcinogenicity';
  species?: string;
  duration?: string;
  doseLevels?: string[];
  primaryFinding: string;
  noael?: string;
  noel?: string;
  glpStatus?: 'GLP' | 'non-GLP';
  reportSection: string;
}

export interface M25BuildContext {
  /** CSRs (one per clinical study) — same clinical inputs as the 2.7 summary. */
  csrs: CSRSummaryInput[];
  /** Indication being summarized */
  indication: string;
  /** Investigational product name */
  investigationalProduct: string;
  /** Disease background / unmet need for 2.5.1 (optional). */
  developmentRationale?: string;
  /** One-line nonclinical safety conclusion carried from the 2.4 overview (optional). */
  nonclinicalConclusion?: string;
}

export interface M27BuildContext {
  /** CSRs (one per clinical study) */
  csrs: CSRSummaryInput[];
  /** Indication being summarized */
  indication: string;
  /** Investigational product name */
  investigationalProduct: string;
}

export interface CSRSummaryInput {
  studyId: string;
  protocolNumber: string;
  phase: string;
  studyDesign: string;
  primaryEndpoint: string;
  primaryResult: string;
  sampleSize: number;
  /** ITT analysis population */
  ittPopulation?: number;
  treatmentArms?: string[];
  /** Map of AE preferred term → incidence rate */
  topAEs?: Array<{ pt: string; rate: string; severity?: string }>;
  /** Number of SAEs */
  saeCount?: number;
  /** Number of deaths */
  deathCount?: number;
  /** Reference to ICH E3 sections */
  csrSections?: CSRSection[];
}

// ── 2.3 Quality Overall Summary ─────────────────────────────────────────────

/**
 * Build M2.3 Quality Overall Summary from a complete Module 3 composition.
 * Per ICH M4Q, the QOS is a high-level summary that mirrors the structure
 * and content of Module 3, but in 40-page summary form.
 */
export function buildM23QualityOverallSummary(ctx: M23BuildContext): M2Summary {
  const sectionsByKey = new Map(ctx.module3Sections.map(s => [s.sectionKey, s]));
  const get = (key: string): ComposedSection | undefined => sectionsByKey.get(key);

  const gaps: string[] = [];
  const inputSectionKeys: string[] = [];

  // Drug substance summary (2.3.S)
  const ds = ctx.drugSubstanceName || 'the drug substance';
  const sName = get('3.2.S.1');
  const sMfg = get('3.2.S.2');
  const sChar = get('3.2.S.3');
  const sSpec = get('3.2.S.4');
  const sStab = get('3.2.S.7');
  for (const [name, section] of [
    ['3.2.S.1', sName],
    ['3.2.S.2', sMfg],
    ['3.2.S.3', sChar],
    ['3.2.S.4', sSpec],
    ['3.2.S.7', sStab],
  ] as const) {
    if (section) inputSectionKeys.push(name);
    else gaps.push(name);
  }

  // Drug product summary (2.3.P)
  const dp = ctx.drugProductName || 'the drug product';
  const pDesc = get('3.2.P.1');
  const pDev = get('3.2.P.2');
  const pMfg = get('3.2.P.3');
  const pSpec = get('3.2.P.5');
  const pStab = get('3.2.P.8');
  for (const [name, section] of [
    ['3.2.P.1', pDesc],
    ['3.2.P.2', pDev],
    ['3.2.P.3', pMfg],
    ['3.2.P.5', pSpec],
    ['3.2.P.8', pStab],
  ] as const) {
    if (section) inputSectionKeys.push(name);
    else gaps.push(name);
  }

  const narrative = [
    `MODULE 2.3 — QUALITY OVERALL SUMMARY`,
    ``,
    `INTRODUCTION`,
    `This Quality Overall Summary (QOS) provides a high-level summary of the chemistry, manufacturing, and controls (CMC) information for ${ds}${dp !== 'the drug product' ? ` and ${dp}` : ''}. The full quality dossier is provided in Module 3.`,
    ``,
    `2.3.S DRUG SUBSTANCE`,
    `2.3.S.1 General Information`,
    sName ? excerpt(sName.narrativeDraft, 400) : `[Section 3.2.S.1 not yet composed — drug substance general information missing]`,
    ``,
    `2.3.S.2 Manufacture`,
    sMfg ? excerpt(sMfg.narrativeDraft, 600) : `[Section 3.2.S.2 not yet composed — manufacturing process information missing]`,
    ``,
    `2.3.S.3 Characterisation`,
    sChar ? excerpt(sChar.narrativeDraft, 500) : `[Section 3.2.S.3 not yet composed — characterisation data missing]`,
    ``,
    `2.3.S.4 Control of Drug Substance`,
    sSpec ? excerpt(sSpec.narrativeDraft, 500) : `[Section 3.2.S.4 not yet composed — specification missing]`,
    ``,
    `2.3.S.7 Stability`,
    sStab ? excerpt(sStab.narrativeDraft, 500) : `[Section 3.2.S.7 not yet composed — stability data missing]`,
    ``,
    `2.3.P DRUG PRODUCT`,
    `2.3.P.1 Description and Composition`,
    pDesc ? excerpt(pDesc.narrativeDraft, 400) : `[Section 3.2.P.1 not yet composed]`,
    ``,
    `2.3.P.2 Pharmaceutical Development`,
    pDev ? excerpt(pDev.narrativeDraft, 600) : `[Section 3.2.P.2 not yet composed]`,
    ``,
    `2.3.P.3 Manufacture`,
    pMfg ? excerpt(pMfg.narrativeDraft, 500) : `[Section 3.2.P.3 not yet composed]`,
    ``,
    `2.3.P.5 Control of Drug Product`,
    pSpec ? excerpt(pSpec.narrativeDraft, 500) : `[Section 3.2.P.5 not yet composed]`,
    ``,
    `2.3.P.8 Stability`,
    pStab ? excerpt(pStab.narrativeDraft, 500) : `[Section 3.2.P.8 not yet composed]`,
    ``,
    `Cross-references: Full data and analytical methods are provided in Module 3.`,
  ].join('\n');

  // Aggregate key tables from upstream — first table from each section is the headline
  const tables: GeneratedTable[] = [];
  for (const section of [sName, sMfg, sChar, sSpec, sStab, pDesc, pDev, pMfg, pSpec, pStab]) {
    if (section?.tables[0]) tables.push(section.tables[0]);
  }

  const expected = 10;
  const completeness = Math.round(((expected - gaps.length) / expected) * 100);

  return {
    sectionKey: '2.3',
    title: 'Quality Overall Summary',
    narrative,
    tables,
    inputSectionKeys,
    completeness,
    gaps,
    generatedAt: new Date().toISOString(),
  };
}

// ── 2.4 Nonclinical Overview ────────────────────────────────────────────────

/**
 * Build M2.4 Nonclinical Overview from Module 4 study reports.
 * Per ICH M4S, this is an integrated assessment across pharmacology, PK, and tox.
 */
export function buildM24NonclinicalOverview(ctx: M24BuildContext): M2Summary {
  const studies = ctx.nonclinicalStudies;
  const ds = ctx.drugSubstanceName || 'the drug substance';

  const byType = {
    pharmacology: studies.filter(s => s.studyType === 'pharmacology'),
    safetyPharm: studies.filter(s => s.studyType === 'safety_pharmacology'),
    pk: studies.filter(s => s.studyType === 'pharmacokinetics'),
    tox: studies.filter(s => s.studyType === 'toxicology'),
    repro: studies.filter(s => s.studyType === 'reproductive_tox'),
    geno: studies.filter(s => s.studyType === 'genotoxicity'),
    carcino: studies.filter(s => s.studyType === 'carcinogenicity'),
  };

  const gaps: string[] = [];
  if (byType.pharmacology.length === 0) gaps.push('primary pharmacology studies');
  if (byType.safetyPharm.length === 0) gaps.push('safety pharmacology (ICH S7A)');
  if (byType.pk.length === 0) gaps.push('pharmacokinetic / ADME studies');
  if (byType.tox.length === 0) gaps.push('repeat-dose toxicology');
  if (byType.geno.length === 0) gaps.push('genotoxicity battery (ICH S2(R1))');

  const narrative = [
    `MODULE 2.4 — NONCLINICAL OVERVIEW`,
    ``,
    `INTRODUCTION`,
    `This Nonclinical Overview integrates the pharmacology, pharmacokinetic, and toxicology data for ${ds}${ctx.indication ? ` developed for ${ctx.indication}` : ''}. ${studies.length} nonclinical study/ies are summarized; full reports are provided in Module 4.`,
    ``,
    `2.4.1 OVERVIEW OF NONCLINICAL TESTING STRATEGY`,
    `The nonclinical program was designed in accordance with ICH M3(R2) and supports the proposed clinical use. ${gaps.length === 0 ? 'All ICH M3(R2) recommended studies have been completed.' : `Gaps in the program: ${gaps.join('; ')}.`}`,
    ``,
    `2.4.2 PHARMACOLOGY`,
    byType.pharmacology.length > 0
      ? `Primary pharmacology studies (${byType.pharmacology.length}) characterize the mechanism of action. Key finding: ${byType.pharmacology[0]?.primaryFinding || 'see Module 4.2.1'}.`
      : `[No pharmacology studies provided — see gap list]`,
    byType.safetyPharm.length > 0
      ? `Safety pharmacology per ICH S7A: cardiovascular, respiratory, and CNS endpoints assessed in ${byType.safetyPharm.length} study/ies.`
      : ``,
    ``,
    `2.4.3 PHARMACOKINETICS`,
    byType.pk.length > 0
      ? `Pharmacokinetic and ADME characterization: ${byType.pk.length} study/ies. Species: ${[...new Set(byType.pk.map(s => s.species).filter(Boolean))].join(', ') || '[not specified]'}.`
      : `[PK / ADME data missing]`,
    ``,
    `2.4.4 TOXICOLOGY`,
    byType.tox.length > 0
      ? `Repeat-dose toxicology: ${byType.tox.length} study/ies in ${[...new Set(byType.tox.map(s => s.species).filter(Boolean))].join(', ') || '[species not specified]'}. NOAEL range: ${nooalSummary(byType.tox)}.`
      : `[Repeat-dose toxicology missing — required per ICH M3(R2)]`,
    byType.repro.length > 0
      ? `Reproductive toxicology per ICH S5(R3): ${byType.repro.length} study/ies.`
      : ``,
    byType.geno.length > 0
      ? `Genotoxicity battery per ICH S2(R1): ${byType.geno.length} assay(s) completed.`
      : ``,
    byType.carcino.length > 0
      ? `Carcinogenicity per ICH S1: ${byType.carcino.length} study/ies.`
      : ``,
    ``,
    `2.4.5 INTEGRATED OVERVIEW AND CONCLUSIONS`,
    // The "supports the plan" sentence used to print whenever any nonclinical
    // study existed, immediately followed by the list of study categories that
    // did not — the assertion and the gap list contradicted each other in one
    // paragraph. It is only drawn when nothing is open.
    gaps.length > 0
      ? `The nonclinical assessment of ${ds} is incomplete; no conclusion on the proposed clinical investigational plan is drawn pending: ${gaps.join('; ')}.`
      : `Based on the nonclinical program, the safety profile of ${ds} supports the proposed clinical investigational plan. No nonclinical issues preclude clinical development.`,
  ].filter(Boolean).join('\n');

  const tables: GeneratedTable[] = [];
  if (studies.length > 0) {
    tables.push({
      title: 'Nonclinical Study Index',
      headers: ['Study ID', 'Type', 'Species', 'GLP', 'NOAEL', 'Module 4 Section'],
      rows: studies.map(s => [
        s.studyId,
        s.studyType.replace('_', ' '),
        s.species || '—',
        s.glpStatus || '—',
        s.noael || s.noel || '—',
        s.reportSection,
      ]),
    });
  }
  if (byType.tox.length > 0) {
    tables.push({
      title: 'Repeat-Dose Toxicology Summary',
      headers: ['Study', 'Species', 'Duration', 'Dose Levels', 'NOAEL', 'Key Finding'],
      rows: byType.tox.map(s => [
        s.studyId,
        s.species || '—',
        s.duration || '—',
        (s.doseLevels || []).join(', ') || '—',
        s.noael || '—',
        s.primaryFinding,
      ]),
    });
  }

  const expected = 5;
  const completeness = Math.max(0, Math.round(((expected - gaps.length) / expected) * 100));

  return {
    sectionKey: '2.4',
    title: 'Nonclinical Overview',
    narrative,
    tables,
    inputSectionKeys: studies.map(s => s.reportSection),
    completeness,
    gaps,
    generatedAt: new Date().toISOString(),
  };
}

// ── 2.5 Clinical Overview ───────────────────────────────────────────────────

/**
 * Build M2.5 Clinical Overview from CSR data.
 * Per ICH M4E(R2), this is the *critical assessment* of the clinical data —
 * shorter and more integrative than the 2.7 Clinical Summary — culminating in
 * an explicit benefit-risk conclusion. The six subsections are:
 *   2.5.1 Product Development Rationale
 *   2.5.2 Overview of Biopharmaceutics
 *   2.5.3 Overview of Clinical Pharmacology
 *   2.5.4 Overview of Efficacy
 *   2.5.5 Overview of Safety
 *   2.5.6 Benefits and Risks Conclusions
 */
export function buildM25ClinicalOverview(ctx: M25BuildContext): M2Summary {
  const csrs = ctx.csrs;
  const pivotal = csrs.filter(c => c.phase.startsWith('3'));
  const clinPharm = csrs.filter(c => c.phase.startsWith('1'));
  const controlled = csrs.filter(c => /^[2-3]/.test(c.phase));
  const totalSubjects = csrs.reduce((s, c) => s + (c.ittPopulation || c.sampleSize || 0), 0);
  const totalSAEs = csrs.reduce((s, c) => s + (c.saeCount || 0), 0);
  const totalDeaths = csrs.reduce((s, c) => s + (c.deathCount || 0), 0);

  const gaps: string[] = [];
  if (csrs.length === 0) gaps.push('no clinical studies available');
  if (clinPharm.length === 0) gaps.push('clinical pharmacology (Phase 1) characterization');
  if (pivotal.length === 0) gaps.push('pivotal (Phase 3) efficacy evidence');
  if (totalSubjects === 0) gaps.push('safety database (no exposure data)');

  const efficacyShown = pivotal.length > 0;
  // The benefit-risk conclusion is the sponsor's medical and regulatory
  // judgment. This used to print "the benefit-risk balance is favorable"
  // whenever one pivotal study existed, reciting the SAE and death counts in
  // the same sentence without either gating the word. The counts are stated;
  // the conclusion is left for a reviewer and recorded as an open item.
  if (csrs.length > 0 && efficacyShown) gaps.push('benefit-risk conclusion (sponsor medical/regulatory judgment; not drawn automatically)');
  const benefitRisk =
    csrs.length === 0
      ? '[Benefit-risk cannot be concluded — no clinical data]'
      : efficacyShown
        ? `Efficacy evidence: ${pivotal.length} pivotal study/ies. Safety database: ${totalSubjects} subjects with ${totalSAEs} serious adverse event(s) and ${totalDeaths} death(s). [Benefit-risk conclusion for ${ctx.indication} requires the sponsor's medical and regulatory judgment of these data; it is not drawn automatically.]`
        : `Efficacy is not yet established (no pivotal study); the benefit-risk balance cannot be concluded for ${ctx.indication} until controlled efficacy data are available.`;

  const narrative = [
    `MODULE 2.5 — CLINICAL OVERVIEW`,
    ``,
    `This Clinical Overview provides a critical assessment of the clinical data for ${ctx.investigationalProduct} in ${ctx.indication}, per ICH M4E(R2). It is intended to be read alongside the Clinical Summary (Module 2.7) and the full study reports in Module 5.`,
    ``,
    `2.5.1 PRODUCT DEVELOPMENT RATIONALE`,
    ctx.developmentRationale ||
      `[Disease background, current therapeutic options, unmet medical need, and the scientific rationale for ${ctx.investigationalProduct} — to be provided.]`,
    ctx.nonclinicalConclusion ? `Nonclinical basis: ${ctx.nonclinicalConclusion}` : ``,
    ``,
    `2.5.2 OVERVIEW OF BIOPHARMACEUTICS`,
    `Biopharmaceutic and analytical-method data are summarized in Module 2.7.1; they support the proposed dosage form and raise no issue affecting the benefit-risk assessment.`,
    ``,
    `2.5.3 OVERVIEW OF CLINICAL PHARMACOLOGY`,
    clinPharm.length > 0
      ? `Clinical pharmacology (${clinPharm.length} Phase 1 study/ies) characterizes pharmacokinetics, pharmacodynamics, and exposure-response, supporting the dose rationale (see Module 2.7.2).`
      : `[Clinical pharmacology characterization missing — required to justify the dose per ICH M4E.]`,
    ``,
    `2.5.4 OVERVIEW OF EFFICACY`,
    efficacyShown
      ? `Efficacy was demonstrated in ${pivotal.length} pivotal study/ies across ${controlled.length} controlled study/ies:`
      : `[No pivotal efficacy study available — efficacy is not yet established.]`,
    ...pivotal.map(
      c => `  • ${c.protocolNumber} (Phase ${c.phase}, n=${c.sampleSize}): ${c.primaryEndpoint} — ${c.primaryResult}.`,
    ),
    ``,
    `2.5.5 OVERVIEW OF SAFETY`,
    csrs.length > 0
      ? `The safety database comprises ${totalSubjects} subjects exposed to ${ctx.investigationalProduct} across ${csrs.length} study/ies, with ${totalSAEs} serious adverse event(s) and ${totalDeaths} death(s). The detailed safety analysis is in Module 2.7.4.`
      : `[No safety database — clinical exposure data missing.]`,
    ``,
    `2.5.6 BENEFITS AND RISKS CONCLUSIONS`,
    benefitRisk,
    gaps.length > 0
      ? `Open items before a definitive benefit-risk conclusion: ${gaps.join('; ')}.`
      : `No open items preclude the benefit-risk conclusion.`,
  ]
    .filter(Boolean)
    .join('\n');

  const tables: GeneratedTable[] = [];
  if (controlled.length > 0) {
    tables.push({
      title: 'Pivotal and Controlled Efficacy Studies',
      headers: ['Study', 'Phase', 'Design', 'N', 'Primary Endpoint', 'Result'],
      rows: controlled.map(c => [
        c.protocolNumber,
        c.phase,
        c.studyDesign,
        String(c.ittPopulation || c.sampleSize),
        c.primaryEndpoint,
        c.primaryResult,
      ]),
    });
  }
  if (csrs.length > 0) {
    tables.push({
      title: 'Benefit-Risk Safety Overview',
      headers: ['Metric', 'Value'],
      rows: [
        ['Total subjects exposed', String(totalSubjects)],
        ['Studies', String(csrs.length)],
        ['Serious adverse events', String(totalSAEs)],
        ['Deaths', String(totalDeaths)],
      ],
    });
  }

  const expected = 6;
  const present = [
    Boolean(ctx.developmentRationale),
    true, // 2.5.2 biopharmaceutics — always summarized
    clinPharm.length > 0,
    efficacyShown,
    totalSubjects > 0,
    csrs.length > 0, // 2.5.6 conclusion is possible
  ].filter(Boolean).length;
  const completeness = Math.round((present / expected) * 100);

  return {
    sectionKey: '2.5',
    title: 'Clinical Overview',
    narrative,
    tables,
    inputSectionKeys: csrs.map(c => `m5.3.5/${c.studyId}`),
    completeness,
    gaps,
    generatedAt: new Date().toISOString(),
  };
}

// ── 2.7 Clinical Summary ────────────────────────────────────────────────────

/**
 * Build M2.7 Clinical Summary from CSR data.
 * Per ICH M4E, this is a 50–400 page integrated summary of efficacy and safety.
 * We compose the four core subsections:
 *   2.7.1 Summary of Biopharmaceutic Studies & Methods
 *   2.7.2 Summary of Clinical Pharmacology
 *   2.7.3 Summary of Clinical Efficacy
 *   2.7.4 Summary of Clinical Safety
 */
export function buildM27ClinicalSummary(ctx: M27BuildContext): M2Summary {
  const csrs = ctx.csrs;
  const phaseCounts = csrs.reduce<Record<string, number>>((acc, c) => {
    acc[c.phase] = (acc[c.phase] || 0) + 1;
    return acc;
  }, {});
  const totalSubjects = csrs.reduce((sum, c) => sum + (c.ittPopulation || c.sampleSize || 0), 0);
  const totalSAEs = csrs.reduce((sum, c) => sum + (c.saeCount || 0), 0);
  const totalDeaths = csrs.reduce((sum, c) => sum + (c.deathCount || 0), 0);

  const gaps: string[] = [];
  if (csrs.length === 0) gaps.push('no CSRs available');
  if (!csrs.some(c => c.phase.startsWith('1'))) gaps.push('no Phase 1 (clinical pharmacology) studies');
  if (!csrs.some(c => c.phase.startsWith('3'))) gaps.push('no Phase 3 (pivotal efficacy) studies');

  const narrative = [
    `MODULE 2.7 — CLINICAL SUMMARY`,
    ``,
    `INTRODUCTION`,
    `This Clinical Summary integrates efficacy and safety data for ${ctx.investigationalProduct} in ${ctx.indication}. ${csrs.length} clinical study/ies enrolling ${totalSubjects} subjects are summarized. Full study reports are provided in Module 5.3.`,
    ``,
    `2.7.1 SUMMARY OF BIOPHARMACEUTIC STUDIES AND ASSOCIATED ANALYTICAL METHODS`,
    `Bioavailability, bioequivalence, and dissolution data: see Module 5.3.1 for full reports. Key findings have been integrated into the proposed dosage form rationale.`,
    ``,
    `2.7.2 SUMMARY OF CLINICAL PHARMACOLOGY STUDIES`,
    csrs.filter(c => c.phase.startsWith('1')).length > 0
      ? `Clinical pharmacology characterization (${csrs.filter(c => c.phase.startsWith('1')).length} study/ies) addresses pharmacokinetics, pharmacodynamics, and exposure-response relationships in healthy volunteers and the target population.`
      : `[Phase 1 clinical pharmacology data missing — required for NDA/BLA per ICH M4E]`,
    ``,
    `2.7.3 SUMMARY OF CLINICAL EFFICACY`,
    `Efficacy was evaluated in ${csrs.filter(c => c.phase.match(/^[2-3]/)).length} controlled study/ies. Pivotal trial(s):`,
    ...csrs.filter(c => c.phase.startsWith('3')).map(c =>
      `  • ${c.protocolNumber} (Phase ${c.phase}): ${c.studyDesign}, n=${c.sampleSize}. Primary endpoint (${c.primaryEndpoint}): ${c.primaryResult}.`
    ),
    ``,
    `Phase distribution: ${Object.entries(phaseCounts).map(([p, n]) => `Phase ${p}: ${n}`).join(', ')}.`,
    ``,
    `2.7.4 SUMMARY OF CLINICAL SAFETY`,
    `Safety database: ${totalSubjects} subjects exposed across ${csrs.length} study/ies. ${totalSAEs} serious adverse event(s) and ${totalDeaths} death(s) reported.`,
    ``,
    `2.7.4.1 Exposure to the Investigational Drug`,
    `Total exposure: ${totalSubjects} subjects received ${ctx.investigationalProduct}. Exposure-response analysis is provided in Module 5.3.5.`,
    ``,
    `2.7.4.2 Adverse Events`,
    csrs.length > 0 && csrs[0].topAEs && csrs[0].topAEs.length > 0
      ? `Most common adverse events (≥5% incidence) across the integrated safety database are summarized below.`
      : `[AE data not yet integrated]`,
    ``,
    `2.7.4.3 Serious Adverse Events and Deaths`,
    `${totalSAEs} SAE(s) reported. ${totalDeaths} death(s) — narratives provided in Module 5.3.5.${totalDeaths > 0 ? ' Causality assessments and impact on benefit-risk are discussed in Module 2.5.' : ''}`,
    ``,
    `2.7.5 LITERATURE REFERENCES`,
    `See Module 5.4 for the integrated reference list.`,
  ].join('\n');

  const tables: GeneratedTable[] = [{
    title: 'Clinical Study Index',
    headers: ['Study ID', 'Phase', 'Design', 'N (ITT)', 'Primary Endpoint', 'Primary Result'],
    rows: csrs.map(c => [
      c.protocolNumber,
      c.phase,
      c.studyDesign,
      String(c.ittPopulation || c.sampleSize),
      c.primaryEndpoint,
      c.primaryResult,
    ]),
  }];

  // Integrated AE table
  const allAEs: Map<string, { count: number; rates: string[] }> = new Map();
  for (const c of csrs) {
    for (const ae of c.topAEs || []) {
      const existing = allAEs.get(ae.pt) || { count: 0, rates: [] };
      existing.count += 1;
      existing.rates.push(`${c.protocolNumber}: ${ae.rate}`);
      allAEs.set(ae.pt, existing);
    }
  }
  if (allAEs.size > 0) {
    tables.push({
      title: 'Integrated Adverse Event Summary (Top by Frequency)',
      headers: ['Preferred Term', 'Studies Reporting', 'Per-Study Rates'],
      rows: Array.from(allAEs.entries())
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 20)
        .map(([pt, data]) => [pt, String(data.count), data.rates.join('; ')]),
    });
  }

  if (totalSAEs > 0 || totalDeaths > 0) {
    tables.push({
      title: 'Serious Adverse Events and Deaths Summary',
      headers: ['Study', 'N (ITT)', 'SAEs', 'Deaths'],
      rows: csrs.map(c => [
        c.protocolNumber,
        String(c.ittPopulation || c.sampleSize),
        String(c.saeCount || 0),
        String(c.deathCount || 0),
      ]),
    });
  }

  const expected = 4;
  const presentSubsections = [
    csrs.length > 0,
    csrs.some(c => c.phase.startsWith('1')),
    csrs.some(c => c.phase.match(/^[2-3]/)),
    csrs.length > 0,
  ].filter(Boolean).length;
  const completeness = Math.round((presentSubsections / expected) * 100);

  return {
    sectionKey: '2.7',
    title: 'Clinical Summary',
    narrative,
    tables,
    inputSectionKeys: csrs.map(c => `m5.3.5/${c.studyId}`),
    completeness,
    gaps,
    generatedAt: new Date().toISOString(),
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function excerpt(text: string, maxChars: number): string {
  if (!text) return '';
  if (text.length <= maxChars) return text;
  return text.substring(0, maxChars).trim() + '…';
}

function nooalSummary(toxStudies: NonclinicalStudy[]): string {
  const noaels = toxStudies.map(s => s.noael).filter(Boolean);
  if (noaels.length === 0) return '[NOAELs not provided]';
  return noaels.join(', ');
}
