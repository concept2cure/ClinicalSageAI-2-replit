import React, { useState, useRef, useEffect } from 'react';
import { I } from '../icons';
import { useLiveData, EmptyState } from '../dataConnect';
import { apiRequest, serverMessage } from '@/lib/queryClient';
import { downloadBlob, safeFileName } from '../download';
import { getOrgId } from '@/utils/authToken';
import type { OwnedSurfaceViewProps } from '../surfaceViews';
import '../styles/project-home-v2.css';
import '../styles/insights-v2.css';
import { C2CToast, useToast } from '../toast';

/* ── Entitlement tiers (mdx-entitlements) ── */

interface Tier {
  id: string;
  label: string;
  rank: number;
}

const RO_TIERS: Tier[] = [
  { id: 'standard', label: 'Standard', rank: 0 },
  { id: 'professional', label: 'Professional', rank: 1 },
  { id: 'enterprise', label: 'Enterprise', rank: 2 },
];

const RO_FEATURE_TIER: Record<string, string> = {
  report_families: 'standard',
  prediction_forecast_report: 'professional',
  crl_rtf_premortem: 'professional',
  scheduled_reports: 'professional',
  portfolio_rollup: 'enterprise',
};

const RO_FEATURE_LABEL: Record<string, string> = {
  report_families: 'Governed report families',
  prediction_forecast_report: 'Predictive forecast',
  crl_rtf_premortem: 'CRL / RTF pre-mortem',
  scheduled_reports: 'Scheduled reports',
  portfolio_rollup: 'Portfolio rollup',
};

/* ── Family metadata ── */
const RO_FAMILY: Record<string, { label: string; region?: string }> = {
  readiness: { label: 'Readiness' },
  evidence_provenance: { label: 'Evidence & provenance' },
  compliance_audit: { label: 'Compliance & audit' },
  usa_fda_pma: { label: 'FDA — PMA', region: 'USA' },
  usa_fda_510k: { label: 'FDA — 510(k)', region: 'USA' },
  usa_fda_response: { label: 'FDA — deficiency response', region: 'USA' },
  ema_maa: { label: 'EMA — MAA', region: 'EU' },
  ema_post_market: { label: 'EMA — post-market', region: 'EU' },
  china_nmpa_ctd: { label: 'NMPA — CTD gap', region: 'CN' },
  china_nmpa_registration: { label: 'NMPA — registration', region: 'CN' },
  china_nmpa_response: { label: 'NMPA — deficiency', region: 'CN' },
  fcoi_compliance: { label: 'Financial disclosure' },
  ha_commitment: { label: 'HA interactions & commitments' },
  iacuc_governance: { label: 'IACUC' },
  irb_ethics: { label: 'IRB' },
  ibc_biosafety: { label: 'IBC biosafety' },
  nonclinical_module4: { label: 'Nonclinical / SEND' },
  sponsored_programs: { label: 'Grants' },
  rim_registration: { label: 'RIM registration' },
  inspection_readiness: { label: 'Inspection readiness' },
  controlled_substances: { label: 'Controlled substances', region: 'DEA' },
  lifecycle_obligations: { label: 'Lifecycle obligations' },
  etmf: { label: 'eTMF' },
  research_compliance: { label: 'Research compliance' },
  effort_certification: { label: 'Effort certification' },
  research_security: { label: 'Research security' },
  research_admin: { label: 'Research administration' },
  prediction: { label: 'Predictive intelligence (advisory)' },
};

/* ── Report types (30 governed types from taxonomy) ── */
interface ReportType {
  typeId: string;
  label: string;
  family: string;
  scopes: string[];
  segments: string[];
  t: { allowPartial?: boolean; requireBlockers?: boolean; requireConfidence?: boolean; requireExplicitGaps?: boolean; forbidFinal?: boolean; requireDisclosure?: boolean };
}

const RO_TYPES: ReportType[] = [
  { typeId: 'readiness.executive_digest', label: 'Executive Readiness Digest', family: 'readiness', scopes: ['program', 'project', 'submission'], segments: ['pharma', 'device', 'biotech'], t: { allowPartial: true, requireBlockers: true } },
  { typeId: 'provenance.evidence_trace_report', label: 'Evidence & Provenance Trace Report', family: 'evidence_provenance', scopes: ['project', 'submission', 'document'], segments: ['pharma', 'device', 'biotech'], t: { allowPartial: true, requireConfidence: true } },
  { typeId: 'compliance.audit_assurance_pack', label: 'Compliance & Audit Assurance Pack', family: 'compliance_audit', scopes: ['project', 'submission', 'document'], segments: ['pharma', 'device', 'biotech'], t: { allowPartial: true, requireExplicitGaps: true } },
  { typeId: 'usa_fda.pma_submission_readiness', label: 'FDA PMA Submission Readiness Pack', family: 'usa_fda_pma', scopes: ['project', 'submission'], segments: ['device', 'biotech'], t: { allowPartial: true, requireBlockers: true, requireConfidence: true } },
  { typeId: 'usa_fda.estar_510k_equivalence_matrix', label: 'FDA eSTAR / 510(k) Equivalence Matrix', family: 'usa_fda_510k', scopes: ['project', 'submission', 'document'], segments: ['device'], t: { allowPartial: true, requireExplicitGaps: true, requireConfidence: true } },
  { typeId: 'usa_fda.deficiency_response_intelligence', label: 'FDA Deficiency Response Intelligence Report', family: 'usa_fda_response', scopes: ['project', 'submission', 'document'], segments: ['pharma', 'device', 'biotech'], t: { allowPartial: false, requireBlockers: true, requireExplicitGaps: true } },
  { typeId: 'ema.maa_readiness_assessment', label: 'EMA MAA Readiness Assessment', family: 'ema_maa', scopes: ['program', 'project', 'submission'], segments: ['pharma', 'biotech'], t: { allowPartial: true, requireBlockers: true, requireConfidence: true } },
  { typeId: 'ema.rmp_psur_signal_alignment', label: 'EMA RMP / PSUR Signal Alignment Report', family: 'ema_post_market', scopes: ['project', 'submission', 'document'], segments: ['pharma', 'biotech'], t: { allowPartial: true, requireExplicitGaps: true, requireConfidence: true } },
  { typeId: 'china_nmpa.ctd_module_gap_analysis', label: 'NMPA CTD Module Gap Analysis', family: 'china_nmpa_ctd', scopes: ['project', 'submission', 'document'], segments: ['pharma', 'biotech', 'device'], t: { allowPartial: true, requireExplicitGaps: true, requireConfidence: true } },
  { typeId: 'china_nmpa.registration_dossier_readiness', label: 'NMPA Registration Dossier Readiness Pack', family: 'china_nmpa_registration', scopes: ['program', 'project', 'submission'], segments: ['pharma', 'biotech', 'device'], t: { allowPartial: true, requireBlockers: true, requireConfidence: true } },
  { typeId: 'china_nmpa.deficiency_letter_root_cause_pack', label: 'NMPA Deficiency Letter Root-Cause Pack', family: 'china_nmpa_response', scopes: ['project', 'submission', 'document'], segments: ['pharma', 'biotech', 'device'], t: { allowPartial: false, requireBlockers: true, requireExplicitGaps: true } },
  { typeId: 'fcoi.disclosure_register', label: 'Financial Disclosure Register (21 CFR 54)', family: 'fcoi_compliance', scopes: ['submission', 'project'], segments: ['pharma', 'biotech', 'device'], t: { allowPartial: true, requireBlockers: true } },
  { typeId: 'ha.commitment_register', label: 'HA Interaction & Commitment Register', family: 'ha_commitment', scopes: ['submission', 'project', 'program'], segments: ['pharma', 'biotech', 'device'], t: { allowPartial: true, requireBlockers: true, requireConfidence: true } },
  { typeId: 'iacuc.protocol_register', label: 'IACUC Protocol & Animal Census Register', family: 'iacuc_governance', scopes: ['project', 'submission', 'program'], segments: ['academic', 'biotech', 'pharma'], t: { allowPartial: true, requireBlockers: true } },
  { typeId: 'irb.submission_register', label: 'IRB Submission & Determination Register', family: 'irb_ethics', scopes: ['study', 'submission', 'project'], segments: ['biotech', 'pharma', 'academic'], t: { allowPartial: true, requireBlockers: true } },
  { typeId: 'ibc.registration_register', label: 'IBC Biosafety Registration & Containment Register', family: 'ibc_biosafety', scopes: ['project', 'submission', 'program'], segments: ['biotech', 'academic', 'pharma'], t: { allowPartial: true, requireBlockers: true } },
  { typeId: 'nonclinical.study_send_register', label: 'Nonclinical Study & SEND Readiness Register', family: 'nonclinical_module4', scopes: ['submission', 'program', 'project'], segments: ['pharma', 'biotech'], t: { allowPartial: true, requireBlockers: true } },
  { typeId: 'grants.portfolio_register', label: 'Grant Portfolio & Funder-Milestone Register', family: 'sponsored_programs', scopes: ['program', 'project', 'account'], segments: ['academic', 'biotech'], t: { allowPartial: true, requireBlockers: true, requireConfidence: true } },
  { typeId: 'rim.registration_grid', label: 'Product Registration Grid & Labeling Register', family: 'rim_registration', scopes: ['program', 'project', 'account'], segments: ['pharma', 'biotech'], t: { allowPartial: true, requireBlockers: true } },
  { typeId: 'inspection.readiness_pack', label: 'Inspection Readiness & 483 Response Pack', family: 'inspection_readiness', scopes: ['program', 'project', 'submission'], segments: ['pharma', 'biotech', 'device', 'ivd', 'cro'], t: { allowPartial: true, requireBlockers: true } },
  { typeId: 'controlled_substances.inventory_ledger', label: 'Controlled Substances Inventory & DEA Ledger', family: 'controlled_substances', scopes: ['program', 'project', 'account'], segments: ['academic', 'biotech', 'pharma'], t: { allowPartial: false, requireBlockers: true, requireExplicitGaps: true } },
  { typeId: 'lifecycle.obligation_calendar', label: 'Lifecycle Obligation Calendar', family: 'lifecycle_obligations', scopes: ['program', 'project', 'submission'], segments: ['pharma', 'biotech'], t: { allowPartial: true, requireBlockers: true, requireConfidence: true } },
  { typeId: 'etmf.completeness_pack', label: 'eTMF Completeness & Gap Pack', family: 'etmf', scopes: ['study', 'submission', 'project'], segments: ['pharma', 'biotech', 'cro'], t: { allowPartial: true, requireBlockers: true } },
  { typeId: 'research_compliance.training_status', label: 'Research Personnel Training Status', family: 'research_compliance', scopes: ['program', 'project', 'account'], segments: ['academic', 'biotech', 'pharma'], t: { allowPartial: true, requireBlockers: true } },
  { typeId: 'effort.certification_register', label: 'Effort Certification Register', family: 'effort_certification', scopes: ['program', 'project', 'account'], segments: ['academic', 'biotech', 'pharma'], t: { allowPartial: true, requireBlockers: true } },
  { typeId: 'research_security.coi_register', label: 'Research Security & COI Disclosure Register', family: 'research_security', scopes: ['program', 'project', 'account'], segments: ['academic', 'biotech', 'pharma'], t: { allowPartial: true, requireBlockers: true } },
  { typeId: 'research_admin.scorecard', label: 'Research Administration Scorecard', family: 'research_admin', scopes: ['program', 'account'], segments: ['academic', 'biotech', 'pharma'], t: { allowPartial: true, requireBlockers: true } },
  { typeId: 'prediction.regulatory_forecast', label: 'Predictive Regulatory Forecast', family: 'prediction', scopes: ['program', 'project', 'submission'], segments: ['pharma', 'biotech', 'device'], t: { allowPartial: true, forbidFinal: true, requireDisclosure: true } },
  { typeId: 'prediction.crl_rtf_premortem', label: 'CRL / RTF Pre-Mortem', family: 'prediction', scopes: ['program', 'project', 'submission'], segments: ['pharma', 'biotech'], t: { allowPartial: true, forbidFinal: true, requireDisclosure: true } },
];

/* ── Segment labels ── */
const SEG_LABEL: Record<string, string> = {
  pharma: 'Pharma', biotech: 'Biotech', medtech: 'Med-tech', diagnostics: 'Diagnostics / IVD',
  cro: 'CRO', academic: 'Academic', health: 'Health system',
};

/* ── Program context ── */
interface ProgramCtx {
  code: string;
  label: string;
  // filing / agency / pdufa are NOT on the projects / readiness model and are
  // returned as an explicit null by the overview endpoint — rendered null-safe,
  // never fabricated.
  filing: string | null;
  indication: string | null;
  readiness: number | null;
  scope: string;
  scopeId: string;
  agency: string | null;
  pdufa: string | null;
  // Real count of promotion-blocking findings from computeInitialRun.
  criticalBlockerCount: number;
}

/* ── Live canvas bootstrap (GET /api/insights-canvas/overview) ──
   Mirrors the server CanvasOverview (server/routes/insights-canvas-routes.ts):
   the org's REAL subscription tier, its derived segments, the flagship
   program's REAL governed readiness (computeInitialRun), and the
   enterprise-gated portfolio rollup. No metric is originated on the client;
   filing/agency/pdufa arrive as explicit null (unsourced), never faked. */
interface CanvasLeadProgram {
  scope: 'program';
  scopeId: string;
  projectId: number;
  code: string | null;
  label: string;
  indication: string | null;
  readiness: number | null;
  confidence: number;
  status: string;
  riskLevel: string;
  criticalBlockerCount: number;
  filing: string | null;
  agency: string | null;
  pdufa: string | null;
}
interface CanvasPortfolioProgram {
  projectId: number;
  code: string | null;
  label: string;
  indication: string | null;
  readiness: number;
  confidence: number;
  status: string;
  riskLevel: string;
  criticalBlockerCount: number;
}
interface CanvasPortfolio {
  entitled: boolean;
  requiredTier: string;
  summary: {
    programCount: number;
    avgReadiness: number;
    avgConfidence: number;
    worstRisk: string;
    readyCount: number;
    partialCount: number;
    missingCount: number;
    totalCriticalBlockers: number;
    truncated: boolean;
  } | null;
  programs: CanvasPortfolioProgram[] | null;
}
interface CanvasOverview {
  organizationId: number;
  tier: string;
  segments: string[];
  leadProgram: CanvasLeadProgram | null;
  portfolio: CanvasPortfolio;
}

/** The name to call a program in prose.
 *
 * A program with no `code` was named by `String(projectId)`, which put a raw
 * database primary key into user-facing sentences: the Reporting surface read
 * "1 is 25% ready" and "How ready is 1 to file?". A reader cannot tell that
 * from a corrupted program name. The label is what the user actually called
 * the program, so it is the fallback; the id is never shown. */
export function programName(p: { code: string | null; label?: string | null }): string {
  const code = p.code?.trim();
  if (code) return code;
  const label = p.label?.trim();
  if (label) return label;
  return 'This program';
}

/** Map the live flagship program into the surface's ProgramCtx. filing/agency/
    pdufa are unsourced on the readiness model (explicit null) — never faked. */
function leadToProgramCtx(lp: CanvasLeadProgram): ProgramCtx {
  return {
    code: programName(lp),
    label: lp.label,
    filing: lp.filing,
    indication: lp.indication,
    readiness: lp.readiness,
    scope: lp.scope,
    scopeId: lp.scopeId,
    agency: lp.agency,
    pdufa: lp.pdufa,
    criticalBlockerCount: lp.criticalBlockerCount,
  };
}

/* ── Segment helpers ── */
function roSegForApp(seg: string): string[] {
  const map: Record<string, string[]> = {
    biotech: ['biotech'], pharma: ['pharma'], medtech: ['device'], diagnostics: ['ivd', 'device'],
    cro: ['cro'], academic: ['academic'], health: ['pharma', 'biotech', 'device'],
  };
  return map[seg] || ['pharma', 'biotech', 'device'];
}

function roFilterForSegment(types: ReportType[], seg: string): ReportType[] {
  const want = roSegForApp(seg);
  return types.filter(t => t.segments.length === 0 || t.segments.some(s => want.includes(s)));
}

/* ── Entitlement decision ── */
function roDecide(typeId: string, family: string, tier: string): { entitled: boolean; feature: string; requiredTier: string } {
  const hay = (typeId + ' ' + (family || '')).toLowerCase();
  let feature = 'report_families';
  if (/(^|[._\s])portfolio|board[_\s-]?pack|rollup|roll[_\s-]up/.test(hay)) feature = 'portfolio_rollup';
  else if (/premortem|pre[_\s-]?mortem|(^|[._\s])crl([._\s]|$)|(^|[._\s])rtf([._\s]|$)/.test(hay)) feature = 'crl_rtf_premortem';
  else if (/(^|[._\s])prediction|forecast|trajectory|probability[_\s-]?of[_\s-]?success/.test(hay)) feature = 'prediction_forecast_report';
  const required = RO_FEATURE_TIER[feature] || 'standard';
  const rank = (t: string) => (RO_TIERS.find(x => x.id === t) || { rank: 0 }).rank;
  return { entitled: rank(tier) >= rank(required), feature, requiredTier: required };
}

/* ── Presets per segment ── */
interface Preset {
  id: string;
  label: string;
  types: string[];
  why: string;
}

/* A preset describes what the PACK contains — never what the reader's filing is
   doing. Two of these opened by asserting a state nobody had checked ("Your NDA
   is in agency review", "Your BLA is mid-assembly"), printed verbatim to an org
   whose own home surface correctly reported no programs at all. The live facts
   are stated separately by roSuggestForClient, from the readiness model; a
   static string is not entitled to claim any of them. Guarded by
   Insights.presetCopy.test.ts. */
const RO_PRESETS: Record<string, Preset[]> = {
  pharma: [
    { id: 'preapproval', label: 'Pre-approval command pack', types: ['readiness.executive_digest', 'prediction.crl_rtf_premortem', 'ema.rmp_psur_signal_alignment', 'compliance.audit_assurance_pack'], why: 'Pairs the readiness digest with a CRL/RTF pre-mortem, safety-signal alignment and the audit assurance an action date calls for.' },
    { id: 'globalfile', label: 'Global filing harmonization', types: ['ema.maa_readiness_assessment', 'china_nmpa.ctd_module_gap_analysis', 'provenance.evidence_trace_report'], why: 'Reuse the US dossier across EMA and NMPA — the gap analyses show what each region still needs.' },
  ],
  biotech: [
    { id: 'blaassembly', label: 'BLA assembly pack', types: ['readiness.executive_digest', 'prediction.regulatory_forecast', 'provenance.evidence_trace_report', 'fcoi.disclosure_register'], why: 'Tracks readiness, forecasts the review trajectory, and closes the evidence and financial-disclosure gaps before filing.' },
    { id: 'nonclin', label: 'Nonclinical & CMC readiness', types: ['nonclinical.study_send_register', 'compliance.audit_assurance_pack'], why: 'Confirm Module 4 / SEND datasets and the audit trail are submission-grade.' },
  ],
  medtech: [
    { id: 'clearance', label: '510(k) clearance pack', types: ['usa_fda.estar_510k_equivalence_matrix', 'inspection.readiness_pack', 'compliance.audit_assurance_pack'], why: 'The equivalence matrix carries your substantial-equivalence argument; the inspection and audit packs keep the QMS ready for review.' },
  ],
  diagnostics: [
    { id: 'ivdperf', label: 'IVD performance & clearance pack', types: ['usa_fda.estar_510k_equivalence_matrix', 'inspection.readiness_pack', 'provenance.evidence_trace_report'], why: 'Performance claims traced to source, with the equivalence matrix and inspection readiness for the IVD 510(k).' },
  ],
  cro: [
    { id: 'sponsor', label: 'Sponsor oversight pack', types: ['etmf.completeness_pack', 'inspection.readiness_pack'], why: 'Cross-sponsor eTMF completeness plus 483 / inspection readiness across the sites you run.' },
  ],
  academic: [
    { id: 'researchadmin', label: 'Research administration pack', types: ['research_admin.scorecard', 'irb.submission_register', 'iacuc.protocol_register', 'effort.certification_register'], why: 'The scorecard rolls up IRB, IACUC, effort and COI so nothing lapses across your studies.' },
  ],
  health: [
    { id: 'oversight', label: 'Portfolio oversight pack', types: ['readiness.executive_digest', 'compliance.audit_assurance_pack', 'inspection.readiness_pack'], why: 'Readiness, audit assurance and inspection readiness across the programs you oversee.' },
  ],
};

function roPresetsForSeg(seg: string): Preset[] {
  return RO_PRESETS[seg] || RO_PRESETS.pharma;
}

/* ── Guardrail ──
   The old text read "AnA narrates and explains report outputs…". Two things
   were wrong with it. AnA is not what answers here — `roRouteReply` is a
   deterministic intent router that composes its text from the constants in this
   file — and "narrates and explains" describes a language model doing work that
   a `switch` is doing. The half that was true, and the half that matters, is
   that no metric on this surface originates here. */
const RO_GUARDRAIL = 'This pane routes your request to a governed report type and runs it — it does not answer in its own words. Every metric, score and probability comes from a deterministic provider or a disclosed model; none is originated here.';

/* ── Resolve type from free text ── */
function roResolveType(utterance: string, seg: string): ReportType | null {
  const text = (utterance || '').toLowerCase();
  const tokens = text.split(/[^a-z0-9]+/).filter(t => t.length > 2);
  const cands = roFilterForSegment(RO_TYPES, seg);
  let best: ReportType | null = null;
  let bestScore = 0;
  cands.forEach(t => {
    const hay = (t.typeId + ' ' + t.label + ' ' + t.family + ' ' + ((RO_FAMILY[t.family] || {}).label || '')).toLowerCase();
    let s = 0;
    tokens.forEach(tok => { if (hay.includes(tok)) s++; });
    if (/510|equivalence|predicate/.test(text) && t.typeId.includes('510k')) s += 3;
    if (/readiness|ready|digest|executive/.test(text) && t.typeId === 'readiness.executive_digest') s += 3;
    if (/crl|rtf|pre.?mortem|reject/.test(text) && t.typeId === 'prediction.crl_rtf_premortem') s += 3;
    if (/forecast|predict|trajectory/.test(text) && t.typeId === 'prediction.regulatory_forecast') s += 3;
    if (/etmf|tmf|trial master/.test(text) && t.typeId === 'etmf.completeness_pack') s += 3;
    if (/audit|compliance|part 11|assurance/.test(text) && t.typeId === 'compliance.audit_assurance_pack') s += 2;
    if (/evidence|provenance|trace/.test(text) && t.typeId === 'provenance.evidence_trace_report') s += 2;
    if (/maa|europe|ema/.test(text) && t.typeId === 'ema.maa_readiness_assessment') s += 2;
    if (/inspection|483/.test(text) && t.typeId === 'inspection.readiness_pack') s += 2;
    if (/safety|psur|rmp|signal/.test(text) && t.typeId === 'ema.rmp_psur_signal_alignment') s += 2;
    if (s > bestScore) { bestScore = s; best = t; }
  });
  return bestScore > 0 ? best : null;
}

/* ── Route intent (conversational router) ── */
function roRouteIntent(utterance: string): { matched: boolean; name?: string; candidates?: string[] } {
  const text = (utterance || '').toLowerCase();
  const tokens = new Set(text.split(/[^a-z0-9]+/).filter(Boolean));
  const keywords: Record<string, string[]> = {
    list_report_types: ['list', 'available', 'types', 'options', 'which', 'reports'],
    generate_report: ['generate', 'run', 'create', 'produce', 'build', 'report'],
    explain_blockers: ['blocker', 'blocked', 'why', 'explain', 'stuck', 'final'],
    portfolio_readiness: ['portfolio', 'board', 'program', 'group', 'across', 'executive'],
    regional_gap_analysis: ['gap', 'gaps', 'market', 'region', 'fda', 'ema', 'pmda', 'missing'],
    compare_regions: ['compare', 'comparison', 'versus', 'harmonization', 'markets', 'delta'],
    get_prediction: ['predict', 'prediction', 'forecast', 'risk', 'trajectory', 'likelihood'],
  };
  const scored = Object.keys(keywords).map(name => ({ name, score: keywords[name].reduce((a, kw) => a + (tokens.has(kw) ? 1 : 0), 0) })).sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (best && best.score > 0 && (scored[1] ? scored[1].score : 0) < best.score) return { matched: true, name: best.name };
  return { matched: false, candidates: scored.filter(s => s.score > 0).map(s => s.name) };
}

/* ── Markets extractor ── */
function roMarketsIn(utterance: string): string[] {
  const t = (utterance || '').toLowerCase();
  const out: string[] = [];
  const checks: [string, string][] = [['fda', 'FDA'], ['ema', 'EMA'], ['pmda', 'PMDA'], ['nmpa', 'NMPA'], ['mhra', 'MHRA'], ['health canada', 'Health Canada'], ['tga', 'TGA'], ['mfds', 'MFDS']];
  checks.forEach(([k, v]) => { if (t.includes(k)) out.push(v); });
  return out;
}

/* ── Portfolio rollup (live, from overview.portfolio.programs) ── */
interface PortfolioRow { code: string; indication: string | null; readiness: number }
function roPortfolioFrom(programs: CanvasPortfolioProgram[]): PortfolioRow[] {
  return programs.map(p => ({ code: programName(p), indication: p.indication, readiness: p.readiness }));
}

/* ── Suggest for client (seeded by the live flagship program) ──
   The program facts here ARE live — code, filing, readiness and PDUFA date come
   from the governed overview read-model. The preset does not: it is
   `roPresetsForSeg(seg)[0]`, the first entry of a static per-segment array in
   this file.

   The old copy did not say that. It said "Based on that and where each program
   sits, I'd start with the <preset>" — asserting that the recommendation
   followed from the readiness figure it had just quoted. It did not follow from
   anything; `[0]` never reads `p`. A sentence claiming a judgement that provably
   did not happen is worse than no sentence, because the reader has no way to
   tell it apart from one that did. The live facts are still stated, and the
   preset is now offered as what it is: the standard starting pack for the
   segment. */
function roSuggestForClient(p: ProgramCtx, seg: string) {
  const preset = roPresetsForSeg(seg)[0];
  const rBit = p.readiness == null
    ? (p.filing ? `${p.code} is in ${p.filing} preparation` : `${p.code}'s submission readiness is not yet computed`)
    : `${p.code} is ${p.readiness}% ready`;
  const pduBit = p.pdufa ? ` with a target action date of ${p.pdufa}` : '';
  return {
    headline: 'Build any governed report or dashboard — describe what you need.',
    body: `${rBit}${pduBit}. The ${preset.label} is the standard starting pack for ${SEG_LABEL[seg] || seg} -- it is not picked from the readiness figure above.`,
    preset,
    prompts: [
      `Build the ${preset.label}`,
      p.readiness != null ? `How ready is ${p.code} to file?` : `What reports can you run for ${p.code}?`,
      seg === 'pharma' || seg === 'biotech' ? 'What is my CRL risk?' : 'Show the 510(k) equivalence matrix',
      'Compare readiness across all my programs',
    ],
  };
}

/* ── Render report model ── */
interface ROBlockData {
  kind: string;
  text?: string;
  label?: string;
  value?: number | string | null;
  unit?: string;
  status?: string;
  provenance?: { sourceTable: string; sourceField?: string; recordId?: string; transformation?: string }[];
  chartType?: string;
  spec?: Record<string, unknown>;
  items?: unknown[];
  columns?: string[];
  rows?: (string | null)[][];
  method?: string;
  confidence?: number;
  validated?: boolean;
  note?: string;
  aiGenerated?: boolean;
  disclosure?: string;
}

interface ROSection {
  id: string;
  title: string;
  blocks: ROBlockData[];
}

interface RenderedReport {
  reportTypeId: string;
  reportTypeLabel: string;
  scopeType: string;
  scopeId: string;
  generatedAt: string;
  status: string;
  truthfulness: { allowedStatus: string; downgradedFrom: string; reasons: string[] };
  sections: ROSection[];
}


/* ── Intent router ── */
interface ThreadMsg {
  role: 'user' | 'ana';
  text: string;
  chips?: [string, string][];
  locked?: { feature: string; requiredTier: string; typeLabel: string };
  question?: boolean;
  tool?: string;
}

interface AnaReply {
  tool: string;
  text: string;
  chips?: [string, string][];
  locked?: { feature: string; requiredTier: string; typeLabel: string };
  question?: boolean;
  report: RenderedReport | null;
  dashboard: DashboardData | null;
  /* When set, send() generates this report from the REAL governed backend
     (POST /api/report-os/runs → GET /runs/:id/rendered) instead of the caller
     embedding a client-built report. `report` above stays null in that case. */
  reportType?: ReportType | null;
}

interface DashboardData {
  kind: string;
  label: string;
  why: string;
  types?: string[];
  rows?: PortfolioRow[];
  markets?: string[];
  program?: ProgramCtx;
}

/**
 * Route an utterance to a governed report type, a dashboard, or a clarifying
 * question — deterministically, from the constants in this file.
 *
 * This was `roAnaReply`, and the name was the problem in miniature: nothing here
 * is AnA. There is no model call, no retrieval and no reasoning — `roRouteIntent`
 * scores the utterance against a fixed vocabulary, `roDecide` checks entitlement,
 * and the returned `text` is a template. What it produces IS trustworthy, and
 * more trustworthy than a model would be for this job: it refuses to show an
 * estimated result on an unentitled plan, and when it resolves a type it runs
 * the REAL governed report (POST /api/report-os/runs). None of that needed to be
 * dressed as an assistant talking, and dressing it that way meant a user reading
 * "I will not show an estimated result" credited a judgement to AnA that a
 * `switch` had made. The routing is unchanged; the first person is gone.
 */
function roRouteReply(utterance: string, seg: string, tier: string, ctx: { program: ProgramCtx; portfolio: CanvasPortfolio; report?: RenderedReport | null }): AnaReply {
  const c = ctx;
  const route = roRouteIntent(utterance);
  const name = route.matched ? route.name! : (route.candidates && route.candidates[0]) || 'generate_report';
  const p = ctx.program;
  function cap(s: string) { return (RO_TIERS.find(t => t.id === s) || { label: s }).label; }
  const lockMsg = (feature: string, typeLabel: string): AnaReply => ({ tool: name, text: `"${typeLabel}" needs the ${cap(RO_FEATURE_TIER[feature])} plan — it is a ${RO_FEATURE_LABEL[feature]} capability. No estimated result is shown on a plan that has not unlocked the governed model. What it includes, and how to unlock it:`, locked: { feature, requiredTier: RO_FEATURE_TIER[feature], typeLabel }, report: null, dashboard: null });
  const entitledFor = (t: ReportType) => roDecide(t.typeId, t.family, tier);

  if (name === 'portfolio_readiness') {
    const dec = roDecide('portfolio_rollup', 'portfolio', tier);
    if (!dec.entitled) return lockMsg('portfolio_rollup', 'Portfolio readiness rollup');
    // Live, enterprise-gated rollup — programs is null when the org isn't
    // entitled or has none; show an honest empty, never a fabricated board.
    const rows = ctx.portfolio.programs ? roPortfolioFrom(ctx.portfolio.programs) : [];
    if (rows.length === 0) return { tool: name, text: `Your plan unlocks the portfolio rollup, but there are no governed programs to roll up yet. Once a program with a readiness run exists in your organization, its board view appears here.`, report: null, dashboard: null };
    return { tool: name, text: `Readiness across your ${rows.length} program${rows.length > 1 ? 's' : ''}. The numbers are the governed readiness scores, ranked — not recomputed here.`, dashboard: { kind: 'portfolio', label: 'Portfolio readiness', why: 'Board view across all programs', rows }, report: null };
  }
  if (name === 'compare_regions') {
    const markets = roMarketsIn(utterance);
    if (markets.length < 2) return { tool: name, question: true, text: `Which markets should be compared for ${p.code}? Pick at least two.`, chips: [['FDA vs EMA', `Compare FDA and EMA for ${p.code}`], ['FDA vs EMA vs PMDA', `Compare FDA, EMA and PMDA for ${p.code}`], ['FDA vs NMPA', `Compare FDA and NMPA for ${p.code}`]], report: null, dashboard: null };
    return { tool: name, text: `Comparing ${markets.join(', ')} for ${p.code}. A market with no governed value yet shows as missing rather than estimated.`, dashboard: { kind: 'compare', label: `Regional comparison -- ${p.code}`, why: markets.join(' -- '), markets, program: p }, report: null };
  }
  if (name === 'explain_blockers') {
    const rep = c.report;
    if (!rep) return { tool: name, question: true, text: 'Which report? Generate or open one and its blockers are listed here, straight from the server’s truthfulness gate.', chips: [['Executive Readiness Digest', `Generate the executive readiness digest for ${p.code}`]], report: null, dashboard: null };
    const reasons = (rep.truthfulness && rep.truthfulness.reasons) || [];
    return { tool: name, text: `"${rep.reportTypeLabel}" is held at ${rep.status} because: ${reasons.join('; ')}. Those are the gate's own reasons, verbatim. Clear them and it can promote toward final; the status gate is deterministic.`, report: rep, dashboard: null };
  }
  if (name === 'get_prediction') {
    const isPre = /crl|rtf|reject|refuse/.test((utterance || '').toLowerCase());
    const t = RO_TYPES.find(x => x.typeId === (isPre ? 'prediction.crl_rtf_premortem' : 'prediction.regulatory_forecast'))!;
    const dec = entitledFor(t);
    if (!dec.entitled) return lockMsg(dec.feature, t.label);
    return { tool: name, text: `Running the ${t.label} for ${p.code}. It is advisory — the model is not validated, so every projected value carries a disclosure and the result is held at partial, never final.`, report: null, reportType: t, dashboard: null };
  }
  const resolved = roResolveType(utterance, seg);
  if (name === 'list_report_types' || !resolved) {
    const cands = roFilterForSegment(RO_TYPES, seg).slice(0, 6);
    return { tool: 'list_report_types', question: true, text: `For ${p.code}${p.filing ? ` (${p.filing})` : ''}, any of these can be run — or describe what you need in your own words and it is matched to the closest governed report type.`, chips: cands.map(t => [t.label, `Generate the ${t.label} for ${p.code}`]), report: null, dashboard: null };
  }
  const dec = entitledFor(resolved);
  if (!dec.entitled) return lockMsg(dec.feature, resolved.label);
  return { tool: 'generate_report', text: `Running the ${resolved.label} for ${p.code} against the governed record. Every value is provenance-linked to its governed source; none is originated here.`, report: null, reportType: resolved, dashboard: null };
}

/* ── Inline helpers ── */

/* ── Provenance string ── */
function roProv(refs?: { sourceTable: string; sourceField?: string; recordId?: string; transformation?: string }[]): string | undefined {
  if (!refs || !refs.length) return undefined;
  return 'Derived from ' + refs.map(r => {
    const f = r.sourceField ? '.' + r.sourceField : '';
    const rec = r.recordId !== undefined ? ' #' + r.recordId : '';
    const tr = r.transformation ? ' -- ' + r.transformation : '';
    return r.sourceTable + f + rec + tr;
  }).join('; ');
}

const RO_SEV: Record<string, string> = { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low' };

/* ── Mini charts ── */

function ROChart({ chartType, spec }: { chartType: string; spec: Record<string, unknown> }) {
  const s = spec || {};
  if (chartType === 'readiness_ring') {
    const v = Math.max(0, Math.min(100, Number(s.value) || 0));
    const R = 34;
    const C = 2 * Math.PI * R;
    const off = C * (1 - v / 100);
    const tone = v >= 85 ? 'var(--success)' : v >= 60 ? 'var(--accent-100)' : 'var(--warning)';
    return (
      <div className="ro-ring">
        <svg width="92" height="92" viewBox="0 0 92 92">
          <circle cx="46" cy="46" r={R} fill="none" stroke="var(--bg-200)" strokeWidth="9" />
          <circle cx="46" cy="46" r={R} fill="none" stroke={tone} strokeWidth="9" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={off} transform="rotate(-90 46 46)" />
          <text x="46" y="50" textAnchor="middle" fontSize="20" fontWeight="600" fill="var(--text-100)">{Math.round(v)}</text>
          <text x="46" y="63" textAnchor="middle" fontSize="8" fill="var(--text-400)">of 100</text>
        </svg>
        <div className="ro-ring-lbl">{(s.label as string) || 'Readiness'}</div>
      </div>
    );
  }
  if (chartType === 'forecast_band') {
    const a = Math.max(0, Math.min(100, Number(s.anchor) || 60));
    const pts: [number, number][] = [[0, a], [1, a + 3], [2, a - 2], [3, a + 6], [4, a + 2]];
    const x = (i: number) => 14 + i * 62;
    const y = (v: number) => 96 - (v / 100) * 80;
    const line = pts.map((p, i) => `${x(i)},${y(p[1])}`).join(' ');
    const band = `${pts.map((p, i) => `${x(i)},${y(p[1] + 8)}`).join(' ')} ${pts.map((_p, i) => `${x(pts.length - 1 - i)},${y(pts[pts.length - 1 - i][1] - 8)}`).join(' ')}`;
    return (
      <div className="ro-svgwrap">
        <svg width="280" height="110" viewBox="0 0 280 110">
          <polygon points={band} fill="color-mix(in srgb,var(--accent-100) 14%,transparent)" />
          <polyline points={line} fill="none" stroke="var(--accent-200)" strokeWidth="2" strokeDasharray="3 3" />
          {pts.map((p, i) => <circle key={i} cx={x(i)} cy={y(p[1])} r="2.5" fill="var(--accent-200)" />)}
        </svg>
        <div className="ro-svg-cap">{(s.label as string) || 'Trajectory'} -- advisory band (model not validated)</div>
      </div>
    );
  }
  if (chartType === 'trend') {
    const d: number[] = Array.isArray(s.points) ? (s.points as number[]) : [62, 66, 64, 70, 73];
    const x = (i: number) => 14 + i * (252 / (d.length - 1));
    const y = (v: number) => 96 - (v / 100) * 80;
    const line = d.map((v, i) => `${x(i)},${y(v)}`).join(' ');
    return <div className="ro-svgwrap"><svg width="280" height="110" viewBox="0 0 280 110"><polyline points={line} fill="none" stroke="var(--accent-200)" strokeWidth="2" />{d.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r="2.5" fill="var(--accent-200)" />)}</svg><div className="ro-svg-cap">{(s.label as string) || 'Trend'}</div></div>;
  }
  if (chartType === 'bar' || chartType === 'stacked_bar') {
    const rows = Array.isArray(s.data) ? (s.data as { label: string; value: number }[]) : [];
    const max = Math.max(1, ...rows.map(r => Number(r.value) || 0));
    if (!rows.length) return <div className="ro-svg-cap">No series data — connect the live provider.</div>;
    return <div className="ro-bars">{rows.map((r, i) => (<div key={i} className="ro-bar-row"><span className="ro-bar-lbl">{r.label}</span><span className="ro-bar-track"><span className="ro-bar-fill" style={{ width: ((Number(r.value) || 0) / max * 100) + '%' }} /></span><span className="ro-bar-val">{r.value}</span></div>))}</div>;
  }
  return <div className="ro-svg-cap">Chart -- {chartType}</div>;
}

/* ── ROBlock ── */
function ROBlock({ block }: { block: ROBlockData }) {
  switch (block.kind) {
    case 'summary': return <p className="ro-summary">{block.text}</p>;
    case 'narrative': return (
      <div className="ro-narr">
        <p className="ro-narr-body">{block.text}</p>
        <p className="ro-narr-tag" title={block.disclosure}>AI-generated narrative -- {block.disclosure}</p>
      </div>
    );
    case 'metric': {
      const prov = roProv(block.provenance);
      const disp = (block.value === null || block.value === undefined) ? '--' : String(block.value);
      const st = block.status;
      const stLabel = st === 'missing' ? 'Missing' : st === 'partial' ? 'Partial' : st === 'ready' ? 'Ready' : null;
      return (
        <div className="ro-metric">
          <div className="ro-m-lbl">{block.label}</div>
          <div className="ro-m-val" title={prov} aria-label={prov}>{disp}{block.unit ? <span className="ro-m-unit">{block.unit}</span> : null}</div>
          {stLabel ? <div className={'ro-m-st st-' + st}>{stLabel}</div> : null}
          {prov ? <div className="ro-m-prov" title={prov}>Source on hover</div> : null}
        </div>
      );
    }
    case 'table': {
      const prov = roProv(block.provenance);
      const cols = `repeat(${(block.columns || []).length}, minmax(0,1fr))`;
      return (
        <div className="ro-table" title={prov} aria-label={prov}>
          <div className="ro-thead" style={{ gridTemplateColumns: cols }}>{(block.columns || []).map((c, i) => <span key={i}>{c}</span>)}</div>
          {(block.rows || []).map((row, r) => (<div key={r} className="ro-trow" style={{ gridTemplateColumns: cols }}>{row.map((cell, c) => <span key={c}>{cell === null || cell === undefined ? '--' : String(cell)}</span>)}</div>))}
        </div>
      );
    }
    case 'chart': return <div className="ro-chartcard"><ROChart chartType={block.chartType!} spec={block.spec || {}} /></div>;
    case 'gap-list': return (
      <ul className="ro-list">{((block.items || []) as { title: string; severity: string; message?: string }[]).map((it, i) => {
        const sev = it.severity || 'medium';
        return <li key={i} className="ro-li"><span className={'ro-sev sev-' + sev}>{RO_SEV[sev]}</span><span className="ro-li-b">{it.title}{it.message ? <span className="ro-li-msg">{it.message}</span> : null}</span></li>;
      })}</ul>
    );
    case 'blocker-list': return (
      <ul className="ro-list">{((block.items || []) as string[]).map((it, i) => (<li key={i} className="ro-li"><span className="ro-sev sev-critical">Blocking</span><span className="ro-li-b">{it}</span></li>))}</ul>
    );
    case 'disclosure': return (
      <div className="ro-disc" role="note">
        <div className="ro-disc-h">Method disclosure</div>
        <div className="ro-disc-m">{block.method}</div>
        <div className="ro-disc-s">{block.validated ? 'Validated' : 'Not validated'}{block.confidence !== undefined ? ` -- confidence ${(block.confidence * 100).toFixed(0)}%` : ''}</div>
        <div className="ro-disc-n">{block.note}</div>
      </div>
    );
    default: return null;
  }
}

/* ── ROReport ──
   No "Ask AnA about this report" button. It called the SHELL's `onAsk` on a
   surface registered `ownsConversation: true`, so the question went into a rail
   this screen never draws — invisible here, and waiting for the user, opened,
   on the next surface that did draw one.
   It is deleted rather than rewired to this surface's own pane, for two
   reasons. The pane is not an assistant: it routes through `roRouteReply`, a
   client-side intent router that composes its text from local constants, so
   pointing a real question at it would turn a dead affordance into a fabricated
   assistant reply on a governed reporting surface. And the button asked for
   what the report already states — its exact words were "…and what would move
   it to final", which is the `truthfulness.reasons` list rendered by the
   `.ro-truth` band a few lines below, straight from the server's gate. Nothing
   was lost by removing it; something would have been invented by keeping it. */
function ROReport({ report, onExport, compact }: { report: RenderedReport; onExport: (r: RenderedReport) => void; compact?: boolean }) {
  if (!report) return null;
  const fam = RO_FAMILY[(RO_TYPES.find(t => t.typeId === report.reportTypeId) || { family: '' }).family] || {};
  const stTone = report.status === 'final' ? 'ok' : report.status === 'partial' ? 'warn' : 'idle';
  const sections = compact ? report.sections.slice(0, 2) : report.sections;
  return (
    <div className="ro-report">
      <div className="ro-rep-head">
        <div className="ro-rep-eyebrow">{fam.label || 'Governed report'}{fam.region ? <span className="ro-region">{fam.region}</span> : null}</div>
        <h2 className="ro-rep-title">{report.reportTypeLabel || report.reportTypeId}</h2>
        <div className="ro-rep-meta">
          <span>{report.scopeType} -- {report.scopeId}</span>
          <span className={'ro-status st-' + stTone}>{report.status}</span>
          <span className="ro-gen">generated {new Date(report.generatedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
        </div>
        {report.truthfulness && report.truthfulness.reasons && report.truthfulness.reasons.length ?
          <div className="ro-truth">{I.shield || I.info} Truthfulness gate — held at <b>{report.status}</b>: {report.truthfulness.reasons.join('; ')}.</div> : null}
      </div>
      {sections.map(sec => (
        <section key={sec.id} className="ro-sec">
          <h3 className="ro-sec-h">{sec.title}</h3>
          <div className="ro-sec-body">{sec.blocks.map((b, i) => <ROBlock key={i} block={b} />)}</div>
        </section>
      ))}
      {!compact && (
        <div className="ro-rep-actions">
          <button className="sp-primary" onClick={() => onExport && onExport(report)}>{I.download || I.fileText} Export report</button>
        </div>
      )}
    </div>
  );
}

/* ── RODashboard ── */
/* `onAsk` is gone from here too — it was declared, threaded down from the
   canvas and never called once in the whole component. */
function RODashboard({ dashboard, tier, onRun }: { dashboard: DashboardData; tier: string; onRun: (t: ReportType) => void }) {
  if (!dashboard) return null;

  if (dashboard.kind === 'portfolio') {
    const rows = dashboard.rows || [];
    const avg = rows.reduce((a, r) => a + r.readiness, 0) / Math.max(1, rows.length);
    return (
      <div className="ro-dash">
        <div className="ro-dash-head"><div><div className="ro-rep-eyebrow">Portfolio — board view</div><h2 className="ro-rep-title">{dashboard.label}</h2><div className="ro-rep-meta"><span>{rows.length} programs</span><span className="ro-status st-ok">avg readiness {Math.round(avg)}%</span></div></div></div>
        <div className="ro-port-grid">
          {rows.map((r, i) => (
            <div key={i} className="ro-port-card">
              <ROChart chartType="readiness_ring" spec={{ value: r.readiness || 0, label: '' }} />
              <div className="ro-port-b"><div className="ro-port-code">{r.code}</div><div className="ro-port-ind">{r.indication}</div></div>
            </div>
          ))}
        </div>
        <div className="ro-dash-note">{I.info} Readiness values are the governed scores per program — AnA ranks and frames them, it does not recompute them.</div>
      </div>
    );
  }

  if (dashboard.kind === 'compare') {
    const m = dashboard.markets || [];
    const prog = dashboard.program || {} as ProgramCtx;
    /* ── Every cell in the first two rows was the same value ────────────────
       The cell expression printed `r[1]` under EVERY market column for rows 0
       and 1, so a single PROGRAMME-level readiness score appeared beneath FDA,
       EMA, PMDA and the rest as though each agency had been assessed
       separately — and "eCTD" was asserted as the dossier standard for all of
       them. A reader asked this screen to compare markets and it answered by
       repeating one number and inventing agreement.

       Readiness is real, so it is stated ONCE, as what it is: a
       programme-level figure. The per-market grid keeps only the rows the
       governed record could actually fill per market, and they are all empty,
       which is the honest answer until the regional providers are connected. */
    const tRows: [string, string | null][] = [['Module completeness', null], ['Region-specific gaps', null]];
    return (
      <div className="ro-dash">
        <div className="ro-dash-head"><div><div className="ro-rep-eyebrow">Global harmonization</div><h2 className="ro-rep-title">{dashboard.label}</h2><div className="ro-rep-meta"><span>{m.length} markets</span></div></div></div>
        {prog.readiness != null && (
          <div className="ro-dash-progline">
            Submission readiness <b>{prog.readiness}%</b> — a programme-level figure, not assessed per market.
          </div>
        )}
        <div className="ro-table">
          <div className="ro-thead" style={{ gridTemplateColumns: `minmax(0,1.4fr) repeat(${m.length}, minmax(0,1fr))` }}><span>Requirement</span>{m.map(x => <span key={x}>{x}</span>)}</div>
          {tRows.map((r, ri) => (<div key={ri} className="ro-trow" style={{ gridTemplateColumns: `minmax(0,1.4fr) repeat(${m.length}, minmax(0,1fr))` }}><span>{r[0]}</span>{m.map((_, ci) => <span key={ci}>{r[1] ?? '--'}</span>)}</div>))}
        </div>
        <div className="ro-dash-note">{I.info} No per-market assessment is in the governed record, so every market cell reads "--". Connect the live regional providers to populate the deltas.</div>
      </div>
    );
  }

  /* preset pack -- grid of governed report cards */
  const types = (dashboard.types || []).map(id => RO_TYPES.find(t => t.typeId === id)).filter(Boolean) as ReportType[];
  return (
    <div className="ro-dash">
      {/* "AnA-curated" claimed a curator. The pack is RO_PRESETS[segment], a
          literal in this file — standard is what it is. */}
      <div className="ro-dash-head"><div><div className="ro-rep-eyebrow">Standard pack</div><h2 className="ro-rep-title">{dashboard.label}</h2><p className="ro-dash-why">{dashboard.why}</p></div></div>
      <div className="ro-pack-grid">
        {types.map(t => {
          const dec = roDecide(t.typeId, t.family, tier);
          const fam = RO_FAMILY[t.family] || {};
          if (!dec.entitled) return (
            <div key={t.typeId} className="ro-pack-card is-locked">
              <div className="ro-pack-fam">{fam.label}</div>
              <div className="ro-pack-title">{t.label}</div>
              <div className="ro-lock"><span className="ro-lock-chip">{I.lock || I.shield} {(RO_TIERS.find(x => x.id === dec.requiredTier) || { label: '' }).label} plan</span></div>
              <div className="ro-pack-sub">{RO_FEATURE_LABEL[dec.feature]} -- unlock to include in this pack.</div>
            </div>
          );
          // Tiles no longer pre-generate a report client-side (that was the mock
          // KPI preview). Each tile runs the REAL governed report on click.
          return (
            <button key={t.typeId} className="ro-pack-card" onClick={() => onRun && onRun(t)}>
              <div className="ro-pack-fam">{fam.label}{fam.region ? <span className="ro-region">{fam.region}</span> : null}</div>
              <div className="ro-pack-title">{t.label}</div>
              <div className="ro-pack-kpi"><span className="v">--</span><span className="l">governed report</span></div>
              <div className="ro-pack-open">Run report {I.right}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ════ Insights -- AnA Reporting Canvas ════ */

export function InsightsCanvas({ onNav, segment }: OwnedSurfaceViewProps) {
  const seg = segment || 'pharma';

  // Live canvas bootstrap — the org's REAL subscription tier, flagship program
  // readiness (computeInitialRun) and portfolio rollup (server
  // insights-canvas-routes.ts → GET /api/insights-canvas/overview), replacing
  // the retired PJ_PROGRAMS / GI_BY_SEG / APP_LICENSE fixtures. Real object →
  // honest empty (no flagship program yet) → honest error.
  const overview = useLiveData<CanvasOverview>('/api/insights-canvas/overview');
  const data = overview.data;
  const program = data?.leadProgram ? leadToProgramCtx(data.leadProgram) : null;
  const suggest = program ? roSuggestForClient(program, seg) : null;

  // Real subscription tier comes from the overview; `tierOverride` is the local
  // "preview on another plan" control (canonical entitlement UX), not persisted.
  const [tierOverride, setTierOverride] = useState<string | null>(null);
  const tier = tierOverride ?? data?.tier ?? 'standard';
  const [thread, setThread] = useState<ThreadMsg[]>([]);
  const [draft, setDraft] = useState('');
  const [report, setReport] = useState<RenderedReport | null>(null);
  // The governed run id behind the displayed report (report-os run), or null for
  // a re-shown report with no run. Drives the real finalize/seal on export.
  const [reportRunId, setReportRunId] = useState<number | null>(null);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, fireToast] = useToast();
  const scrollRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setThread([]); setReport(null); setReportRunId(null); setDashboard(null); }, [seg]);
  useEffect(() => { const el = scrollRef.current; if (el) el.scrollTop = el.scrollHeight; }, [thread, busy]);

  const pushCanvasTop = () => { const el = canvasRef.current; if (el) el.scrollTop = 0; };

  /* Generate a report from the REAL governed backend. POST /api/report-os/runs
     computes + persists the run synchronously (no polling); GET /runs/:id/rendered
     returns the section/block document with the truthfulness gate applied. The
     server's RenderedReport is adopted directly (the display renders every server
     block kind); only the display label is filled from the type and a
     truthfulness default supplied. The run id is tracked so the report can be
     sealed. Any failure surfaces as an honest AnA message — nothing is
     fabricated, and an unentitled/unknown type is stated, never estimated. */
  const runReport = async (type: ReportType): Promise<void> => {
    if (!program) return;
    setBusy(true);
    setDashboard(null);
    try {
      const orgId = Number(getOrgId()) || 0;
      const res = await apiRequest('POST', '/api/report-os/runs', {
        organizationId: orgId,
        scopeType: program.scope,
        scopeId: program.scopeId,
        reportTypeId: type.typeId,
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        const msg = res.status === 403
          ? `"${type.label}" needs a higher plan${body?.requiredTier ? ` (${body.requiredTier})` : ''} — I won't show an estimated result on a plan that hasn't unlocked the governed model.`
          : res.status === 404
            ? `"${type.label}" isn't in your governed report registry, so I can't run it against real data — I won't fabricate one.`
            : `Couldn't run "${type.label}" — ${serverMessage(body) ?? 'the server did not say why'}.`;
        setThread(t => [...t, { role: 'ana', text: msg, tool: 'generate_report' }]);
        return;
      }
      const runId: number | null = body?.data?.run?.id ?? null;
      if (runId == null) {
        setThread(t => [...t, { role: 'ana', text: 'The run started but returned no id — reload and retry.', tool: 'generate_report' }]);
        return;
      }
      const rres = await apiRequest('GET', `/api/report-os/runs/${runId}/rendered`);
      const rbody = await rres.json().catch(() => null);
      const rendered = rbody?.data;
      if (!rres.ok || !rendered || !Array.isArray(rendered.sections)) {
        setThread(t => [...t, { role: 'ana', text: "The run completed but its rendered document didn't come back — reload and retry.", tool: 'generate_report' }]);
        return;
      }
      const status = typeof rendered.status === 'string' ? rendered.status : 'partial';
      const adopted: RenderedReport = {
        reportTypeId: rendered.reportTypeId ?? type.typeId,
        reportTypeLabel: type.label,
        scopeType: rendered.scopeType ?? program.scope,
        scopeId: rendered.scopeId ?? program.scopeId,
        generatedAt: rendered.generatedAt ?? new Date().toISOString(),
        status,
        truthfulness: (rendered.truthfulness && Array.isArray(rendered.truthfulness.reasons))
          ? rendered.truthfulness
          : { allowedStatus: status, downgradedFrom: 'final', reasons: [] },
        sections: rendered.sections,
      };
      setReport(adopted);
      setReportRunId(runId);
      pushCanvasTop();
    } catch (e) {
      setThread(t => [...t, { role: 'ana', text: `Couldn't reach the report engine — ${e instanceof Error ? e.message : String(e)}.`, tool: 'generate_report' }]);
    } finally {
      setBusy(false);
    }
  };

  const send = async (raw?: string) => {
    const text = (raw == null ? draft : raw).trim();
    if (!text || busy || !program || !data) return;
    setThread(t => [...t, { role: 'user', text }]);
    setDraft('');
    // roRouteReply resolves intent, chips and the entitlement lock — all
    // deterministic. When it resolves a report type, generation goes to the REAL
    // backend via runReport, not to a client-built preview.
    const reply = roRouteReply(text, seg, tier, { program, portfolio: data.portfolio, report });
    setThread(t => [...t, { role: 'ana', text: reply.text, chips: reply.chips, locked: reply.locked, question: reply.question, tool: reply.tool }]);
    if (reply.reportType) {
      await runReport(reply.reportType);
    } else if (reply.report) {
      // A report re-shown by the brain (e.g. explain_blockers) — keep its run id.
      setReport(reply.report); setDashboard(null); pushCanvasTop();
    } else if (reply.dashboard) {
      setDashboard(reply.dashboard); setReport(null); setReportRunId(null); pushCanvasTop();
    }
  };

  /* The best-practice "pack" is a static, per-segment set of governed report
     TYPES from RO_PRESETS in this file — nothing curates it at runtime (and no
     server bulk-run endpoint exists). Each tile runs its real report on click. */
  const buildPreset = (preset: Preset) => {
    if (!preset) return;
    setThread(t => [...t, { role: 'user', text: `Build the ${preset.label}` }, { role: 'ana', text: `Building the ${preset.label}. ${preset.why} Each tile runs a governed report against the live record — pick any one to run it. Anything the plan has not unlocked shows as locked, never as an estimate.`, tool: 'preset' }]);
    setDashboard({ kind: 'pack', label: preset.label, why: preset.why, types: preset.types });
    setReport(null);
    setReportRunId(null);
    pushCanvasTop();
  };

  /* Run a report from a pack tile (announces it in the thread, then generates). */
  const runFromTile = (type: ReportType) => {
    setThread(th => [...th, { role: 'user', text: `Run the ${type.label}` }, { role: 'ana', text: `Running the ${type.label} for ${program?.code ?? 'this program'} against the governed record.`, tool: 'generate_report' }]);
    void runReport(type);
  };

  /* ── "Export report" now exports a report ─────────────────────────────────
     The control carries a download icon and the word Export, and its entire
     effect was POST /runs/:id/finalize plus a toast. The run was sealed; no
     file was ever produced, so the one thing the word Export promises — a
     document the user can keep, attach or file — could not be done from this
     surface at all.

     Two acts, in order, both real:
       1. POST /api/report-os/runs/:id/finalize — the run's integrity seal
          (sha256 content hash + provenance atoms). A report the truthfulness
          gate holds below final returns 409 and is NOT sealed.
       2. GET  /api/report-os/runs/:id/export.pdf — the governed PDF the server
          renders from the STORED run (createRunPdf: type, scope, status,
          confidence, dependency providers, blockers). It is entitlement-gated
          server-side exactly like the run itself, so a downgraded plan is
          refused there rather than handed a document it has not paid for.

     The seal is attempted first because sealing changes what the PDF states
     (the run's status), and the download runs EVEN WHEN the seal is refused: a
     partial report is still a real report, and withholding the file over a
     status the gate is entitled to hold would be a second, invented refusal.
     The toast states both outcomes separately — sealed or held, saved or not —
     so neither is ever implied by the other. The file itself goes through the
     canonical `downloadBlob` (v2/download.ts); its `false` return (no DOM, a
     sandboxed frame) is reported as a failure to save, never swallowed. */
  const exportRep = async (rep: RenderedReport) => {
    if (reportRunId == null) { fireToast('Only a freshly-run governed report can be exported — run one first.', 'error'); return; }
    const runId = reportRunId;

    // ── 1. Seal ──
    let sealNote: string;
    try {
      const res = await apiRequest('POST', `/api/report-os/runs/${runId}/finalize`);
      const body = await res.json().catch(() => null);
      if (res.status === 409) {
        const reasons = Array.isArray(body?.reasons)
          ? body.reasons.join('; ')
          : (serverMessage(body) || 'the truthfulness gate holds it below final');
        sealNote = `Not sealed — held below final: ${reasons}`;
      } else if (!res.ok) {
        sealNote = `Not sealed — ${serverMessage(body) ?? 'the server did not say why'}`;
      } else {
        const seal = body?.data?.seal;
        const hash = typeof seal?.contentHash === 'string' ? seal.contentHash.slice(0, 12) : null;
        setReport(r => (r ? { ...r, status: 'final' } : r));
        sealNote = `Sealed · ${seal?.algorithm || 'sha256'}${hash ? ' ' + hash + '…' : ''} · ${seal?.atomCount ?? 0} provenance atoms · run locked final`;
      }
    } catch (e) {
      // `apiRequest` THROWS for every non-OK status except 401, so in the real
      // app the 409 above is reached HERE, not by the `res.status` branch. The
      // gate's own reasons live on the thrown error's payload; read
      // STRUCTURALLY rather than via `instanceof ApiRequestError` — several
      // suites mock '@/lib/queryClient' with a factory exporting only
      // `apiRequest`, which binds the class to undefined and makes
      // `e instanceof undefined` throw inside the catch (dataConnect's
      // `failureFrom` documents the same hazard and takes the same precaution).
      const err = e as { status?: unknown; payload?: { reasons?: unknown } } | null;
      const reasons =
        err && err.status === 409 && Array.isArray(err.payload?.reasons)
          ? (err.payload!.reasons as unknown[]).join('; ')
          : null;
      sealNote = reasons
        ? `Not sealed — held below final: ${reasons}`
        : `Not sealed — ${e instanceof Error ? e.message : String(e)}`;
    }

    // ── 2. The file ──
    let fileNote: string;
    try {
      const res = await apiRequest('GET', `/api/report-os/runs/${runId}/export.pdf`);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        fileNote = `no file saved — ${serverMessage(body) ?? 'the export service did not say why'}`;
      } else {
        const blob = await res.blob();
        const filename = `${safeFileName(rep.reportTypeLabel || rep.reportTypeId, 'report')}_run${runId}.pdf`;
        fileNote = downloadBlob(filename, blob)
          ? `saved ${filename}`
          : 'no file saved — this browser refused the download';
      }
    } catch (e) {
      fileNote = `no file saved — ${e instanceof Error ? e.message : String(e)}`;
    }

    const failed = fileNote.startsWith('no file saved') || sealNote.startsWith('Not sealed');
    fireToast(`${sealNote} · ${fileNote}.`, failed ? 'error' : undefined);
  };

  // Four-state render: loading → honest error → honest empty (no flagship
  // program) → the live canvas. No fixture stand-in in any state.
  if (overview.loading) {
    return (
      <div className="rc">
        <div className="rc-canvas" style={{ gridColumn: '1 / -1' }}>
          <div role="status" className="scaf-note" style={{ padding: '40px 20px' }}>Loading the reporting canvas…</div>
        </div>
      </div>
    );
  }
  if (overview.error) {
    return (
      <div className="rc">
        <div className="rc-canvas" style={{ gridColumn: '1 / -1' }}>
          <EmptyState
            tone="error"
            icon={I.alertTriangle}
            title="Couldn't load the reporting canvas"
            hint="The Insights canvas read-model didn't respond. It assembles your organization's subscription tier, flagship program readiness, and portfolio rollup from the governed record — sign in and retry, or check that the service is reachable."
          />
        </div>
      </div>
    );
  }
  if (!program || !data || !suggest) {
    return (
      <div className="rc">
        <div className="rc-canvas" style={{ gridColumn: '1 / -1' }}>
          <EmptyState
            icon={I.barChart || I.fileText}
            title="No program readiness yet"
            hint="Once a program with a governed readiness run exists in your organization, the reporting canvas opens here — flagship readiness, the portfolio rollup, and every governed report, all provenance-linked. Nothing is estimated."
          />
        </div>
      </div>
    );
  }
  const p = program; // narrowed non-null past the guards above

  return (
    <div className="rc">
      {/* -- Left: report routing pane --
           This column called itself "AnA -- Reporting analyst" and spoke in the
           first person, while what answered was `roRouteReply`: a deterministic
           matcher over the constants in this file. A user cannot tell a
           template apart from a model by reading it, so the name and the voice
           were the whole of the claim, and the claim was false.

           The pane keeps its behaviour — it is the right mechanism for "pick a
           governed report type and run it", and more trustworthy for that job
           than a model would be. It no longer wears AnA's name to do it.

           The `rc-ana*` class names stay: they are internal selectors carried by
           insights-v2.css, renaming them would be churn across a stylesheet for
           no user-visible gain, and the cross-shell CSS collision guard counts
           them. -- */}
      <div className="rc-ana">
        <div className="rc-ana-head">
          <div className="rc-ana-id"><span className="rc-ana-mark">*</span><div><div className="nm">Report builder</div><div className="sub">{[p.code, p.filing, SEG_LABEL[seg] || seg].filter(Boolean).join(' -- ')}</div></div></div>
        </div>

        <div className="rc-ana-scroll" ref={scrollRef}>
          {/* Opener. The program facts below are live; the preset is a static
              per-segment default, and says so. */}
          <div className="rc-opener">
            <div className="rc-op-head"><span className="rc-ana-mark sm">*</span><span>Where to start</span></div>
            <div className="rc-op-headline">{suggest.headline}</div>
            <div className="rc-op-body">{suggest.body}</div>
            <button className="rc-preset-btn" onClick={() => buildPreset(suggest.preset)}>{I.sparkles} Build the {suggest.preset.label} {I.right}</button>
            <div className="rc-op-why">{suggest.preset.why}</div>
            <div className="rc-chips">
              {suggest.prompts.map((q, i) => (<button key={i} className="rc-chip" onClick={() => send(q)}>{q}</button>))}
            </div>
          </div>

          {/* Conversation thread */}
          {thread.map((m, i) => m.role === 'user'
            ? <div key={i} className="rc-msg rc-user"><div className="rc-bub">{m.text}</div></div>
            : <div key={i} className="rc-msg rc-ana-msg">
              <span className="rc-ana-mark sm">*</span>
              <div className="rc-ana-body">
                <div className="rc-bub rc-ana-bub">{m.text}</div>
                {m.locked && (
                  <div className="rc-lock">
                    <div className="rc-lock-h">{I.lock || I.shield} {(RO_TIERS.find(t => t.id === m.locked!.requiredTier) || { label: '' }).label} plan unlocks {m.locked.typeLabel}</div>
                    <div className="rc-lock-s">{RO_FEATURE_LABEL[m.locked.feature]} is a paid capability. No estimated result is shown on a plan that has not unlocked the governed model.</div>
                    <div className="rc-lock-acts">
                      <button className="rc-lock-up" onClick={() => onNav && onNav('licensing')}>See plans {I.right}</button>
                      <button className="rc-chip" onClick={() => setTierOverride(m.locked!.requiredTier)}>Preview on {(RO_TIERS.find(t => t.id === m.locked!.requiredTier) || { label: '' }).label}</button>
                    </div>
                  </div>
                )}
                {m.chips && m.chips.length ? <div className="rc-chips">{m.chips.map((c, ci) => (<button key={ci} className="rc-chip" onClick={() => send(c[1])}>{c[0]}</button>))}</div> : null}
              </div>
            </div>
          )}
          {busy && <div className="rc-msg rc-ana-msg"><span className="rc-ana-mark sm">*</span><div className="rc-ana-body"><div className="rc-typing"><span /><span /><span /></div></div></div>}
        </div>

        {/* Composer + tier */}
        <div className="rc-composer">
          <div className="rc-tier" role="group" aria-label="Subscription tier">
            <span className="rc-tier-lbl">Plan</span>
            {RO_TIERS.map(t => (<button key={t.id} className={'rc-tier-b' + (tier === t.id ? ' on' : '')} onClick={() => setTierOverride(t.id)}>{t.label}</button>))}
          </div>
          <div className="rc-input">
            <textarea rows={1} value={draft} placeholder={`Describe the report or dashboard you need for ${p.code}...`}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
            <button className="rc-send" disabled={!draft.trim() || busy} onClick={() => send()} aria-label="Send">{I.arrowUp || I.right}</button>
          </div>
          <div className="rc-guardrail">{I.shield || I.info} {RO_GUARDRAIL}</div>
        </div>
      </div>

      {/* -- Right: the report / dashboard artifact -- */}
      <div className="rc-canvas" ref={canvasRef}>
        {report ? <ROReport report={report} onExport={exportRep} />
          : dashboard ? <RODashboard dashboard={dashboard} tier={tier} onRun={runFromTile} />
          : (
            <div className="rc-empty">
              <div className="rc-empty-mark">*</div>
              {/* "AnA builds the report" and "a pack AnA suggests … based on
                  your whole portfolio" were the same two claims as the opener:
                  a persona for a template matcher, and a portfolio-derived
                  recommendation for `roPresetsForSeg(seg)`, which reads neither
                  the portfolio nor the program. */}
              <h2 className="rc-empty-h">Governed reports, built to order.</h2>
              <p className="rc-empty-s">Describe what you need on the left, or start from one of the standard packs for {p.code}. Every value is provenance-linked to a governed source; nothing is estimated.</p>
              <div className="rc-empty-presets">
                {roPresetsForSeg(seg).map(pr => (
                  <button key={pr.id} className="rc-empty-preset" onClick={() => buildPreset(pr)}>
                    <div className="rc-ep-h">{I.barChart || I.grid} {pr.label}</div>
                    <div className="rc-ep-s">{pr.why}</div>
                    <div className="rc-ep-types">{pr.types.length} governed reports</div>
                  </button>
                ))}
              </div>
            </div>
          )}
      </div>
      <C2CToast msg={toast} />
    </div>
  );
}
