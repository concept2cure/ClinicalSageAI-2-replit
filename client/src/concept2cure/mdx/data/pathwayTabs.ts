/**
 * Pathway sub-tab data — Correspondence only.
 * Ported from `ui_kits/mdx/data-pathway-tabs.jsx`.
 *
 * Consumed by `hooks/usePathwayTabsData.ts` and, through it, by
 * `surfaces/pathway/PathwayPanes.tsx` and `surfaces/pathway/FilesTreePane.tsx`.
 * Reachable only through the explicit sample-mode boundary (../lib/sampleMode),
 * never as a fallback for missing live data, and always under the standing
 * sample banner. The closed-enum `AUDIT_KIND_META` taxonomy stays here: it is a
 * display vocabulary shared by every audit path regardless of data source, and
 * it describes REAL events.
 *
 * ── What was deleted, and why it must not come back ──────────────────────────
 * The kit fixtures also carried AUDIT and APPROVALS bundles: 46 audit events
 * across four pathways, stitched into a *synthesized* Part 11 hash-chain by a
 * `chain()` helper, and 13 approval records — several marked `status: 'signed'`
 * with a `signed_at`, a named signer and a signature id, plus audit rows
 * carrying `signed: true` and a `sig`, actor IP addresses and a named notified-
 * body reviewer.
 *
 * That is a fabricated e-signature record and a fabricated immutable audit
 * trail. Sample mode gated them and the standing banner labelled them, which is
 * the right treatment for example CONTENT and the wrong treatment for these:
 * the audit trail is the artifact whose entire evidentiary value is that
 * nothing in it was authored for display. A demonstrable chain of invented
 * signatures is not a lesser version of that record, it is the opposite of one,
 * and no banner makes it safe to render in the surface whose job is to be
 * trusted. The same fabrication was removed once already from the Part 11
 * console; this was the second copy, one lane over.
 *
 * The audit and approvals panes now render live rows or an honest empty state.
 * `PathwayTabsBundle` no longer HAS those fields, so a future `sample={…}` on
 * either gate is a type error rather than a judgement call.
 */

import type {
  AuditKind,
  AuditKindMeta,
  Correspondence,
  PathwayTabsData,
} from '../types';

export const AUDIT_KIND_META: Record<AuditKind, AuditKindMeta> = {
  'section.edit':    { label: 'Edit',     tone: 'neutral' },
  'section.lock':    { label: 'Lock',     tone: 'neutral' },
  'section.unlock':  { label: 'Unlock',   tone: 'warn' },
  'review.start':    { label: 'Review',   tone: 'neutral' },
  'review.complete': { label: 'Verified', tone: 'success' },
  sign:              { label: 'E-sign',   tone: 'accent' },
  comment:           { label: 'Comment',  tone: 'neutral' },
  attach:            { label: 'Attach',   tone: 'neutral' },
  export:            { label: 'Export',   tone: 'neutral' },
  access:            { label: 'Access',   tone: 'neutral' },
};

const K510_CORRESP: Correspondence[] = [
  { id: 'rta-3', kind: 'AI-Hold', channel: 'CDRH eSTAR', from: 'CDRH', received: '2026-04-29T08:14:00Z', due: '2026-05-13', status: 'open', ai: true,
    subject: 'AI-Hold · §11.4 accuracy sub-analysis by age band missing',
    summary: 'Reviewer requests stratified MARD by age decile (18–39, 40–64, 65+). Provide §11.4 update + raw CSV with adjudicated comparator.',
    refs: [{ section: 11, label: '§11 Performance testing' }],
    triage: { ana: 'Auto-flag · Age stratification', priority: 'high', owner: 'Marcus Wei', tasks: 2 } },
  { id: 'rta-2', kind: 'Interactive Review', channel: 'eCopy', from: 'CDRH', received: '2026-04-26T15:32:00Z', due: '2026-05-03', status: 'open', ai: false,
    subject: 'Interactive Review · Predicate K221847 software comparison',
    summary: 'Provide side-by-side software architecture diagram comparing subject device to K221847; clarify CGM algorithm classifier difference.',
    refs: [{ section: 10, label: '§10 Software' }, { section: 5, label: '§5 Predicate comparison' }],
    triage: { ana: 'Draft response from §10 + §5', priority: 'med', owner: 'Jordan Chen', tasks: 1 } },
  { id: 'rta-1', kind: 'RTA', channel: 'CDRH eSTAR', from: 'CDRH', received: '2026-04-21T11:08:00Z', due: '2026-04-28', status: 'closed', ai: false,
    subject: 'RTA · Acceptance review complete · package accepted',
    summary: 'Acceptance review complete. Submission accepted for substantive review. Reviewer assigned: Dr. R. Tanaka.',
    refs: [],
    triage: { ana: 'No action', priority: 'low', owner: 'Jordan Chen', tasks: 0 } },
];

const PMA_CORRESP: Correspondence[] = [
  { id: 'd100-2', kind: 'Day-100', channel: 'CDRH letter', from: 'CDRH', received: '2026-04-28T16:11:00Z', due: '2026-05-28', status: 'open', ai: true,
    subject: 'Day-100 · Pivotal trial · primary endpoint analysis revision',
    summary: '5 deficiencies. PE re-analysis using SAP v3, MARD by age band, AE adjudication committee composition, biocompatibility extractables, software cybersecurity.',
    refs: [{ section: 'M27', label: 'Module 2.7 — Clinical Summary' }, { section: 'M535', label: 'Module 5.3.5 — Pivotal trial' }],
    triage: { ana: 'Decompose into 5 work items', priority: 'high', owner: 'Sara Okafor', tasks: 5 } },
  { id: 'd100-1', kind: 'Major Deficiency', channel: 'CDRH letter', from: 'CDRH', received: '2026-04-22T14:50:00Z', due: '2026-05-06', status: 'in_review', ai: false,
    subject: 'Major Deficiency · Sterilization VP-modeling',
    summary: 'Sterilization validation using ISO 11135 acceptable; provide additional VHP residual data for accessories ≤ 0.1 ppm.',
    refs: [{ section: 'M323', label: 'Module 3.2.S — Sterilization' }],
    triage: { ana: 'Pull supplier CoA', priority: 'med', owner: 'Priya Shah', tasks: 2 } },
];

const CER_CORRESP: Correspondence[] = [
  { id: 'nbq-3', kind: 'NB Major NC', channel: 'TEAM-NB portal', from: 'TÜV SÜD', received: '2026-04-29T07:02:00Z', due: '2026-05-29', status: 'open', ai: true,
    subject: 'Major NC · State of the art evidence — gap in 2024 literature',
    summary: 'NC raised: state-of-the-art summary references 2018 Cochrane review only; need 2023–2024 evidence per MDCG 2020-13. Revise §3 with refreshed corpus.',
    refs: [{ section: 3, label: '§3 State of the art' }],
    triage: { ana: 'Refresh PubMed query 2023–2025', priority: 'high', owner: 'Dr. Lee Hartman', tasks: 1 } },
  { id: 'nbq-2', kind: 'NB Q&A', channel: 'TEAM-NB portal', from: 'TÜV SÜD', received: '2026-04-25T11:15:00Z', due: '2026-05-09', status: 'in_review', ai: false,
    subject: 'NB Q&A · Adjudicated lead-dislodgement cases — clarify denominator',
    summary: 'Reviewer requests denominator clarification for §6.4 lead-dislodgement rate. Confirm whether denominator is enrolled or implanted population.',
    refs: [{ section: 6, label: '§6 Clinical data' }],
    triage: { ana: 'Cross-check SAP', priority: 'med', owner: 'Marcus Wei', tasks: 1 } },
  { id: 'nbq-1', kind: 'NB Minor NC', channel: 'TEAM-NB portal', from: 'TÜV SÜD', received: '2026-04-19T09:30:00Z', due: '2026-04-26', status: 'closed', ai: false,
    subject: 'Minor NC · PMS plan reporting cadence',
    summary: 'Closed. PMS plan updated to quarterly summary + annual periodic safety update.',
    refs: [{ section: 7, label: '§7 PMS plan' }],
    triage: { ana: 'Closed', priority: 'low', owner: 'Jordan Chen', tasks: 0 } },
];

const IVD_CORRESP: Correspondence[] = [
  { id: 'ivq-3', kind: 'NB Major NC', channel: 'TEAM-NB portal', from: 'TÜV SÜD', received: '2026-04-29T07:45:00Z', due: '2026-05-29', status: 'open', ai: true,
    subject: 'Major NC · Analytical performance — interference study missing',
    summary: 'NC raised against GSPR 10.1: SARS-CoV-2 Ag interference study not provided for endogenous substances. Supply study report or justification per CLSI EP07.',
    refs: [{ section: 'AV2', label: 'Analytical validation — SARS-CoV-2 Ag' }],
    triage: { ana: 'Pull CLSI EP07 dataset', priority: 'high', owner: 'Priya Shah', tasks: 1 } },
  { id: 'ivq-2', kind: 'NB Q&A', channel: 'TEAM-NB portal', from: 'TÜV SÜD', received: '2026-04-25T10:30:00Z', due: '2026-05-09', status: 'in_review', ai: false,
    subject: 'NB Q&A · EGFR CDx clinical bridging — comparator method',
    summary: 'Reviewer requests clarification of the comparator assay used in the EGFR companion-diagnostic bridging study and its regulatory status.',
    refs: [{ section: 'CP1', label: 'Clinical performance — EGFR CDx' }],
    triage: { ana: 'Cross-check study design', priority: 'med', owner: 'Marcus Wei', tasks: 1 } },
  { id: 'ivq-1', kind: 'NB Minor NC', channel: 'TEAM-NB portal', from: 'TÜV SÜD', received: '2026-04-19T09:10:00Z', due: '2026-04-26', status: 'closed', ai: false,
    subject: 'Minor NC · IFU symbols — ISO 15223-1 conformity',
    summary: 'Closed. Labelling updated to current ISO 15223-1:2021 symbol set with the self-test pictogram added.',
    refs: [{ section: 'GSPR-III', label: 'GSPR §III — Information supplied' }],
    triage: { ana: 'Closed', priority: 'low', owner: 'Jordan Chen', tasks: 0 } },
];

/** Per-pathway bundle so surfaces can index by pathway. */
export const PATHWAY_TABS_DATA: PathwayTabsData = {
  k510: { correspondence: K510_CORRESP, corrLabel: 'RTA / AI-Hold' },
  pma:  { correspondence: PMA_CORRESP,   corrLabel: 'Day-100' },
  cer:  { correspondence: CER_CORRESP,   corrLabel: 'NB Q&A' },
  ivd:  { correspondence: IVD_CORRESP,   corrLabel: 'NB / GSPR' },
};
