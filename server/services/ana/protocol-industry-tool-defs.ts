/**
 * Protocol industry-gap tool definitions — AnA's hands on the engines that
 * close `docs/design/PROTOCOL_INDUSTRY_GAPS.md` Tier 1.
 *
 * Same contract as `protocol-design-tool-defs.ts`, restated because the
 * description is the only thing that steers the model: AnA does not decide
 * anything here. Each tool reaches ONE deterministic engine — the same one the
 * Protocol Development surface reaches through `/api/study-design` and the
 * protocol routers — and reports its output VERBATIM. Every engine is pure:
 * no model, no clock, no RNG.
 *
 *   • `projectTrialSchema`          — ICH M11 §1.2 trial schema (model + SVG)
 *   • `assessSpiritConformance`     — SPIRIT 2013, 33 items
 *   • `deriveCtqFactors`            — ICH E6(R3) critical-to-quality factors
 *   • `projectUsdm`                 — CDISC USDM-shaped export, conformance unverified
 *   • `profileDecentralization`     — decentralised-element profile of the SoA
 *   • `projectWhoIctrp`             — WHO Trial Registration Data Set, 24 items
 *   • `trendDeviations`             — deviation trends and signals
 *   • `redlineVersions`             — section-level redline between two versions
 *   • `projectDoseEscalation`       — BOIN escalation rules from the design (Tier 2)
 *   • `projectEnrollment`           — Poisson–Gamma time to planned N (Tier 2)
 *   • `projectInterimOperatingCharacteristics` — exact group-sequential OC (Tier 2)
 *   • `projectMmrmSizing`           — MMRM sample size from sponsor assumptions (Tier 2)
 *   • `projectExternalControlPlan`  — external-control borrowing plan (Tier 2)
 *   • `checkMultiplicity`           — family-wise error control over the confirmatory family (Tier 2)
 *   • `profileBiospecimens`         — specimens and blood volume from the SoA (Tier 3)
 *
 * Word export is not here: the Protocol Development surface already renders
 * MD, DOCX and PDF from the one assembled Markdown, signature block included
 * (`ProtocolDevWorkspace.tsx` exportProtocol), and a second renderer would
 * diverge from it.
 *
 * ── The four rules written into the prose (CLAUDE.md Rule 2, the design doc) ──
 *  1. A tool that asks a model for a figure is a defect: every count, share,
 *     status and verdict comes from the engine and is reported as returned.
 *  2. Absent is not zero, not "no", not "site" and not "met": where the engine
 *     says not_assessable / unstated / missing / null, the model says so.
 *  3. `unverified` stays `unverified`: the USDM export names its conformance
 *     status and the model must not upgrade it to "valid" or "conformant".
 *  4. No prose, no filing: nothing here writes into `protocol_sections`,
 *     generates protocol text, or claims a registration or transmission.
 *
 * All fifteen are READ-ONLY, so none carries a reason-for-change: nothing is
 * mutated and no governed-action row is written.
 *
 * @module server/services/ana/protocol-industry-tool-defs
 */

import type { AnaTool } from '../ai-gateway/types';

const DOCUMENT_ID_PROPERTY = {
  type: 'number' as const,
  description: 'protocol_documents.id. Must belong to the caller\'s organization.',
};

const VERSION_PROPERTY = (which: 'earlier' | 'later') => ({
  type: 'string' as const,
  description:
    `The ${which} protocol version label as recorded in protocol_versions.version (e.g. "0.3"). Both versions must belong to the same protocol document.` +
    (which === 'later' ? ' Pass "current" to compare against the working copy — the unsnapshotted sections an amendment is being drafted in.' : ''),
});

const DESIGN_REQUIRED =
  'The engine reads the study design BOUND to the protocol document; if none is bound, the tool returns an explanatory error and no result. ' +
  'That is not a clean result — say the engine did not run and suggest bind_protocol_to_study_design.';

export const REVIEW_TRIAL_SCHEMA: AnaTool = {
  name: 'review_trial_schema',
  description:
    'READ-ONLY. Project the ICH M11 §1.2 Trial Schema from the study design bound to a protocol document (projectTrialSchema): the ordered epochs with their ' +
    'visit milestones, the randomisation point, the arms with their interventions, and a deterministic SVG of the schematic. ' +
    DESIGN_REQUIRED + ' ' +
    'Report status (rendered / partial / missing) and every gap VERBATIM. When the design carries no Schedule of Activities the engine cannot draw epochs, ' +
    'days or windows and says so — do not describe a schema the engine did not render, and never invent an epoch, a study day or a visit window. ' +
    'An arm the engine labels "(no intervention recorded)" is reported exactly that way.',
  input_schema: { type: 'object', properties: { document_id: DOCUMENT_ID_PROPERTY }, required: ['document_id'] },
};

export const REVIEW_SPIRIT_CONFORMANCE: AnaTool = {
  name: 'review_spirit_conformance',
  description:
    'READ-ONLY. Assess a protocol against the 33 items of the SPIRIT 2013 checklist (assessSpiritConformance), reading the bound study design for the ' +
    'design-evidenced items and the protocol document\'s own sections for the document-evidenced ones. ' +
    'Report each item\'s status — met, partial, missing, not_assessable — with its evidence and gap VERBATIM, and the summary counts exactly as returned. ' +
    'NOT_ASSESSABLE means the item can only be judged from a protocol section the engine was not given: it is not missing and it is not met. ' +
    'Never total the counts yourself, never compute a conformance percentage, and never say the protocol "meets SPIRIT" — the engine returns per-item ' +
    'statuses, not a verdict. If no design is bound, the design-evidenced items come back missing with that reason; say so.',
  input_schema: { type: 'object', properties: { document_id: DOCUMENT_ID_PROPERTY }, required: ['document_id'] },
};

export const DERIVE_CTQ_FACTORS: AnaTool = {
  name: 'derive_ctq_factors',
  description:
    'READ-ONLY. Derive study-specific critical-to-quality factors (ICH E6(R3) §3.10; TransCelerate RACT) from the study design bound to a protocol ' +
    'document (deriveCtqFactors): one factor per triggering design element — primary and key-secondary endpoints, numeric eligibility thresholds, PK and ' +
    'biomarker sampling, IMP administration, dose-modification rules, blinding, stopping rules and DMC, interim analyses, DLT definitions — each with ' +
    'derivedFrom provenance naming the element. ' +
    DESIGN_REQUIRED + ' ' +
    'Every likelihood and impact is a DEFAULT SEED (ratingSource: "default_seed") from a documented category table, not an assessment: report them as ' +
    'starting values a sponsor rates, never as the study\'s assessed risk. Report notAssessed — the design areas the engine could not read — verbatim. ' +
    'The output drops into the RBM module\'s risk assessment as seeds; this tool does not write it there.',
  input_schema: { type: 'object', properties: { document_id: DOCUMENT_ID_PROPERTY }, required: ['document_id'] },
};

export const EXPORT_USDM_PROJECTION: AnaTool = {
  name: 'export_usdm_projection',
  description:
    'READ-ONLY. Project the study design bound to a protocol document as a CDISC USDM-shaped object graph (projectUsdm) — Study, StudyVersion, StudyDesign, ' +
    'arms, epochs, cells, activities, encounters, the main schedule timeline, eligibility criteria, objectives, endpoints, estimands, interventions — with ' +
    'deterministic identifiers. ' +
    DESIGN_REQUIRED + ' ' +
    'CONFORMANCE IS UNVERIFIED and the engine says so: the CDISC USDM JSON schema is not vendored, so the graph follows USDM entity naming and has NOT been ' +
    'validated against the standard. Report conformance.status and its reason verbatim; never call the export "valid", "conformant" or "USDM-compliant". ' +
    'Report unmappedDesignFields and unfilledUsdmEntities in full — they are the honest boundary of what was exported. The engine invents no sponsor, ' +
    'registry identifier, date or timing the design does not carry.',
  input_schema: { type: 'object', properties: { document_id: DOCUMENT_ID_PROPERTY }, required: ['document_id'] },
};

export const REVIEW_DCT_PROFILE: AnaTool = {
  name: 'review_dct_profile',
  description:
    'READ-ONLY. Profile the decentralised elements of the Schedule of Activities bound to a protocol document (profileDecentralization; FDA guidance on ' +
    'decentralized elements, 2024; EMA/HMA recommendation paper, 2022): where each activity happens, the share of activities with a stated off-site ' +
    'location, the visits every performed activity of which is off-site capable, and findings on IMP administration at home, remote-only safety ' +
    'assessments, off-site PK or biomarker sampling and remote consent. ' +
    DESIGN_REQUIRED + ' ' +
    'An activity with NO stated location is "unstated" — it is not at the site, it is not decentralised, and it is excluded from the off-site share. ' +
    'When nothing has a stated location the share is null and notAssessed says why; report null as "not assessed", never as 0% or as "conducted at site". ' +
    'Report each finding\'s code, message and activity ids verbatim.',
  input_schema: { type: 'object', properties: { document_id: DOCUMENT_ID_PROPERTY }, required: ['document_id'] },
};

export const REVIEW_WHO_ICTRP_RECORD: AnaTool = {
  name: 'review_who_ictrp_record',
  description:
    'READ-ONLY. Project the study design bound to a protocol document as the WHO Trial Registration Data Set (projectWhoIctrp; 24 items, v1.3.1) that every ' +
    'WHO primary registry and the ICMJE policy require — the sibling of the ClinicalTrials.gov and EU CTIS projections. ' +
    DESIGN_REQUIRED + ' ' +
    'Report all 24 items in order with status rendered / partial / missing and each gap sentence verbatim. Sponsor, funder, contacts, dates, ethics review, ' +
    'results and the IPD statement are NOT on the design object and always come back missing with the reason "not carried by the study design; supplied at ' +
    'registration": say exactly that, and never supply one. This is a projection, not a registration; nothing is submitted to any registry.',
  input_schema: { type: 'object', properties: { document_id: DOCUMENT_ID_PROPERTY }, required: ['document_id'] },
};

export const REVIEW_DEVIATION_TRENDS: AnaTool = {
  name: 'review_deviation_trends',
  description:
    'READ-ONLY. Trend a protocol document\'s recorded deviations over a monthly window (trendDeviations; ICH E6(R3) risk-based quality management; ' +
    'TransCelerate KRI methodology): counts by month, category and severity; the reportable and major-or-critical shares; open-deviation ageing; CAPA ' +
    'closure lag; and any signals the engine\'s documented rules raise (DEV-CATEGORY-SPIKE, DEV-SEVERITY-RISE, DEV-AGING) with their evidence. ' +
    'Report every number and signal verbatim. A null share means there were no deviations to measure — say "no deviations recorded", never "0%". ' +
    'A spike the engine declined to declare for lack of prior months is not the absence of a problem; report the reason in the evidence. ' +
    'siteBreakdown.available is false because protocol_deviations carries no site linkage — say a per-site view is not available, and never attribute a ' +
    'deviation to a site.',
  input_schema: {
    type: 'object',
    properties: {
      document_id: DOCUMENT_ID_PROPERTY,
      window_months: { type: 'number', description: 'How many calendar months back from today to trend. Default 6. Between 1 and 36.' },
    },
    required: ['document_id'],
  },
};

export const REVIEW_PROTOCOL_REDLINE: AnaTool = {
  name: 'review_protocol_redline',
  description:
    'READ-ONLY. Compare two recorded versions of a protocol document section by section (redlineVersions): each section unchanged, modified, added, removed, ' +
    'reordered or retitled, with a line-level diff for modified sections and the summary counts. This is the tracked-changes comparison an amendment package ' +
    '(EU CTR substantial modification, 21 CFR 312.30, an IRB amendment) requires. ' +
    'Report the summary and the per-section changes verbatim; quote the diff ops rather than paraphrasing what changed. If either version label is not ' +
    'recorded for this document, or is recorded twice, the tool returns an error and no comparison — say the redline did not run. A section that comes back with a note has no diff — it was above the ' +
    'engine\'s line cap or edit budget; report the note. A null line total means a section could not be counted: say unknown, never 0. This compares the DOCUMENT\'s versions; the study DESIGN\'s changes come from ' +
    'the amendment substantiality engine.',
  input_schema: {
    type: 'object',
    properties: {
      document_id: DOCUMENT_ID_PROPERTY,
      from_version: VERSION_PROPERTY('earlier'),
      to_version: VERSION_PROPERTY('later'),
    },
    required: ['document_id', 'from_version', 'to_version'],
  },
};

export const REVIEW_DOSE_ESCALATION_DESIGN: AnaTool = {
  name: 'review_dose_escalation_design',
  description:
    'READ-ONLY. Project the dose-escalation rules of the study design bound to a protocol document (projectDoseEscalation; BOIN, Liu & Yuan 2015; FDA ' +
    'dosage-optimization guidance, 2024): target toxicity, dose levels, cohort size, the escalation and de-escalation boundaries, and the per-cohort ' +
    'decision table with its elimination column — every number from the platform\'s BOIN engine (stats/dose-finding-boin.ts). ' +
    DESIGN_REQUIRED + ' ' +
    'Report status (rendered / partial / missing / not_applicable), the gaps and the table VERBATIM. A parameter whose source is "engine default" was ' +
    'NOT chosen by the sponsor — say so, never present it as the protocol\'s decision. An escalation-phase design with no rules comes back missing: ' +
    'that is a gap in the protocol, not a clean result. For free-standing what-if calculations use design_dose_finding instead.',
  input_schema: { type: 'object', properties: { document_id: DOCUMENT_ID_PROPERTY }, required: ['document_id'] },
};

export const REVIEW_ENROLLMENT_FORECAST: AnaTool = {
  name: 'review_enrollment_forecast',
  description:
    'READ-ONLY. Forecast when the study design bound to a protocol document reaches its planned sample size from the sponsor\'s site accrual plan ' +
    '(projectEnrollment; Poisson–Gamma accrual, Anisimov & Fedorov 2007): the median time and 80% interval from the platform\'s seeded Monte Carlo ' +
    'engine, the probability of reaching the target at all, the closed-form expectation, and the sites by country. ' +
    DESIGN_REQUIRED + ' ' +
    'Report every figure VERBATIM with its time unit. Site recruitment rates are SPONSOR INPUTS: with no accrual plan the engine returns missing — say ' +
    'the forecast needs site feasibility rates, and never supply or assume a rate. The interval is among simulations that reached the target; when ' +
    'none did the times are null — say the target is not reached, never quote a time.',
  input_schema: { type: 'object', properties: { document_id: DOCUMENT_ID_PROPERTY }, required: ['document_id'] },
};

export const REVIEW_INTERIM_OPERATING_CHARACTERISTICS: AnaTool = {
  name: 'review_interim_operating_characteristics',
  description:
    'READ-ONLY. Compute what the interim-analysis plan of the study design bound to a protocol document does (projectInterimOperatingCharacteristics; ' +
    'ICH E9 §4.5; exact group-sequential computation): the spending function\'s solved efficacy boundaries, the type I error, the power at the ' +
    'alternative the fixed design was powered for, expected information fraction and sample size, and per-look stopping probabilities — every ' +
    'figure from the platform\'s exact engine (stats/group-sequential-oc.ts). ' +
    DESIGN_REQUIRED + ' ' +
    'The characteristics are OF the boundaries the protocol records when it records them; a recorded boundary that departs from the named spending ' +
    'function is a DISCREPANCY — report it verbatim, never quietly substitute the solved value. Report every gap verbatim, including an assumed ' +
    'sidedness; a null power means alpha or power is not recorded — never supply one.',
  input_schema: { type: 'object', properties: { document_id: DOCUMENT_ID_PROPERTY }, required: ['document_id'] },
};

export const REVIEW_MMRM_SIZING: AnaTool = {
  name: 'review_mmrm_sizing',
  description:
    'READ-ONLY. Size the MMRM-analysed continuous endpoint of the study design bound to a protocol document from the sponsor\'s recorded assumptions ' +
    '(projectMmrmSizing; ICH E9(R1); exact GLS information under monotone dropout): per-arm and total N, the variance factor, MMRM\'s efficiency over a ' +
    'completers-only analysis, the achieved power, and whether the planned sample size covers the requirement — every figure from the platform\'s ' +
    'engine (stats/mmrm-design.ts). ' +
    DESIGN_REQUIRED + ' ' +
    'Report every figure and gap VERBATIM. The assumptions (covariance, correlation, SD, effect, per-visit retention, power) are the SPONSOR\'S: when ' +
    'one is not recorded nothing is sized — say which assumption is missing, and never supply one or fall back to complete data.',
  input_schema: { type: 'object', properties: { document_id: DOCUMENT_ID_PROPERTY }, required: ['document_id'] },
};

export const REVIEW_EXTERNAL_CONTROL_PLAN: AnaTool = {
  name: 'review_external_control_plan',
  description:
    'READ-ONLY. Review the external-control borrowing plan of the study design bound to a protocol document (projectExternalControlPlan; FDA draft ' +
    'guidance on externally controlled trials, 2023; ICH E10 §2.5): each element the protocol is expected to pre-specify — source, borrowing method ' +
    'and strength, prior-data conflict handling, covariate comparability, tipping-point sensitivity — stated or not, and the borrowing strength at the ' +
    'planned concurrent-control size (effective historical N, share of control precision borrowed) from the platform\'s engine ' +
    '(stats/external-control.ts). ' +
    DESIGN_REQUIRED + ' ' +
    'Report every element and figure VERBATIM. No posterior or treatment effect is computed at protocol stage — never quote one. A fixed power-prior ' +
    'discount does not handle prior-data conflict; say so rather than calling the plan conflict-robust.',
  input_schema: { type: 'object', properties: { document_id: DOCUMENT_ID_PROPERTY }, required: ['document_id'] },
};

export const REVIEW_MULTIPLICITY_CONTROL: AnaTool = {
  name: 'review_multiplicity_control',
  description:
    'READ-ONLY. Check whether the multiplicity procedure of the study design bound to a protocol document holds the family-wise type I error at alpha over ' +
    'its confirmatory endpoints (checkMultiplicity; ICH E9 §5.6; FDA Multiple Endpoints guidance, 2022): the procedure\'s simulated family-wise error ' +
    'and its Monte Carlo SE, the unadjusted rate for contrast, and whether the alpha allocation covers the family — every rate from the platform\'s ' +
    'engine (stats/multiplicity.ts). ' +
    DESIGN_REQUIRED + ' ' +
    'Report every rate, verdict, note and gap VERBATIM. The simulation assumes independent p-values: say so, and never present it as proof of control ' +
    'under the trial\'s actual dependence. A procedure the engine cannot check (graphical without weights, gatekeeping) is a gap — never substitute another.',
  input_schema: { type: 'object', properties: { document_id: DOCUMENT_ID_PROPERTY }, required: ['document_id'] },
};

export const REVIEW_BIOSPECIMEN_PROFILE: AnaTool = {
  name: 'review_biospecimen_profile',
  description:
    'READ-ONLY. Profile what the Schedule of Activities bound to a protocol document collects (profileBiospecimens): each specimen with what the lab ' +
    'manual still needs (type, volume, processing, storage), and the blood a participant gives — per visit, in total, over the worst 8-week window and ' +
    'the busiest week — summed from the recorded volumes. ' +
    DESIGN_REQUIRED + ' ' +
    'Report every figure and gap VERBATIM. A draw with no volume makes totals LOWER BOUNDS: say so. The OHRP expedited-review figures (550 mL; 50 mL) ' +
    'are reference points for minimal-risk research, NOT safety limits and not a bar a drug trial must clear — never call a protocol unsafe or ' +
    'non-compliant for exceeding them, and never assume a volume for a sampling activity with no specimen recorded.',
  input_schema: { type: 'object', properties: { document_id: DOCUMENT_ID_PROPERTY }, required: ['document_id'] },
};

/** In the order a human would reach for them: draw it, check it, derive from it, export it, compare it. */
export const PROTOCOL_INDUSTRY_TOOLS: AnaTool[] = [
  REVIEW_TRIAL_SCHEMA,
  REVIEW_SPIRIT_CONFORMANCE,
  DERIVE_CTQ_FACTORS,
  EXPORT_USDM_PROJECTION,
  REVIEW_DCT_PROFILE,
  REVIEW_WHO_ICTRP_RECORD,
  REVIEW_DEVIATION_TRENDS,
  REVIEW_PROTOCOL_REDLINE,
  REVIEW_DOSE_ESCALATION_DESIGN,
  REVIEW_ENROLLMENT_FORECAST,
  REVIEW_INTERIM_OPERATING_CHARACTERISTICS,
  REVIEW_MMRM_SIZING,
  REVIEW_EXTERNAL_CONTROL_PLAN,
  REVIEW_MULTIPLICITY_CONTROL,
  REVIEW_BIOSPECIMEN_PROFILE,
];
