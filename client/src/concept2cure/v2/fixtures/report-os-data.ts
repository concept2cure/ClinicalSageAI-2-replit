/* Report-OS -- data + logic for the Insights surface (governed reporting).
   Ported from kit report-os-data.jsx (window globals). */

/* ---- Types ---- */

export interface RoTier { id: string; label: string; rank: number; }

export interface RoTruthfulness {
  allowPartial?: boolean; requireBlockers?: boolean; requireConfidence?: boolean;
  requireExplicitGaps?: boolean; forbidFinal?: boolean; requireDisclosure?: boolean;
}

export interface RoReportType {
  typeId: string; label: string; family: string;
  scopes: string[]; segments: string[];
  t: RoTruthfulness;
}

export interface RoFamilyMeta { label: string; region?: string; }
export interface RoToolSpec { label: string; multi: boolean; blurb: string; }
export interface RoPreset { id: string; label: string; types: string[]; why: string; }

export interface RoEntitlementDecision {
  entitled: boolean; feature: string; requiredTier: string;
}

export interface RoRouteResult {
  matched: boolean;
  name?: string;
  candidates?: string[];
}

/* ---- Entitlement tiers ---- */

export const RO_TIERS: RoTier[] = [
  { id: 'standard', label: 'Standard', rank: 0 },
  { id: 'professional', label: 'Professional', rank: 1 },
  { id: 'enterprise', label: 'Enterprise', rank: 2 },
];

export const RO_FEATURE_TIER: Record<string, string> = {
  report_families: 'standard',
  prediction_forecast_report: 'professional',
  crl_rtf_premortem: 'professional',
  scheduled_reports: 'professional',
  portfolio_rollup: 'enterprise',
};

export const RO_FEATURE_LABEL: Record<string, string> = {
  report_families: 'Governed report families',
  prediction_forecast_report: 'Predictive forecast',
  crl_rtf_premortem: 'CRL / RTF pre-mortem',
  scheduled_reports: 'Scheduled reports',
  portfolio_rollup: 'Portfolio rollup',
};

/* ---- Entitlement functions ---- */

export function roFeatureForType(typeId: string, family?: string): string {
  const hay = (typeId + ' ' + (family || '')).toLowerCase();
  if (/(^|[._\s])portfolio|board[_\s-]?pack|rollup|roll[_\s-]up/.test(hay)) return 'portfolio_rollup';
  if (/premortem|pre[_\s-]?mortem|(^|[._\s])crl([._\s]|$)|(^|[._\s])rtf([._\s]|$)/.test(hay)) return 'crl_rtf_premortem';
  if (/(^|[._\s])prediction|forecast|trajectory|probability[_\s-]?of[_\s-]?success/.test(hay)) return 'prediction_forecast_report';
  return 'report_families';
}

export function roDecide(typeId: string, family: string, tier: string): RoEntitlementDecision {
  const feature = roFeatureForType(typeId, family);
  const required = RO_FEATURE_TIER[feature] || 'standard';
  const rank = (t: string): number => (RO_TIERS.find(x => x.id === t) || { rank: 0 }).rank;
  return { entitled: rank(tier) >= rank(required), feature, requiredTier: required };
}

/* ---- Family metadata ---- */

export const RO_FAMILY: Record<string, RoFamilyMeta> = {
  readiness: { label: 'Readiness' },
  evidence_provenance: { label: 'Evidence & provenance' },
  compliance_audit: { label: 'Compliance & audit' },
  usa_fda_pma: { label: 'FDA · PMA', region: 'USA' },
  usa_fda_510k: { label: 'FDA · 510(k)', region: 'USA' },
  usa_fda_response: { label: 'FDA · deficiency response', region: 'USA' },
  ema_maa: { label: 'EMA · MAA', region: 'EU' },
  ema_post_market: { label: 'EMA · post-market', region: 'EU' },
  china_nmpa_ctd: { label: 'NMPA · CTD gap', region: 'CN' },
  china_nmpa_registration: { label: 'NMPA · registration', region: 'CN' },
  china_nmpa_response: { label: 'NMPA · deficiency', region: 'CN' },
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

/* ---- The 30 report types ---- */

export const RO_TYPES: RoReportType[] = [
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

/* ---- Segment helpers ---- */

const SEG_MAP: Record<string, string[]> = {
  biotech: ['biotech'], pharma: ['pharma'], medtech: ['device'], diagnostics: ['ivd', 'device'],
  cro: ['cro'], academic: ['academic'], health: ['pharma', 'biotech', 'device'],
};

export function roSegForApp(seg: string): string[] {
  return SEG_MAP[seg] || ['pharma', 'biotech', 'device'];
}

export const RO_FLAGSHIP: Record<string, string> = {
  biotech: 'readiness.executive_digest', pharma: 'readiness.executive_digest',
  medtech: 'usa_fda.estar_510k_equivalence_matrix', diagnostics: 'usa_fda.estar_510k_equivalence_matrix',
  cro: 'etmf.completeness_pack', academic: 'research_admin.scorecard', health: 'readiness.executive_digest',
};

export function roFilterForSegment(types: RoReportType[], seg: string): RoReportType[] {
  const want = roSegForApp(seg);
  return types.filter(t => t.segments.length === 0 || t.segments.some(s => want.includes(s)));
}

/* ---- Guardrail + tool specs ---- */

export const RO_GUARDRAIL = 'AnA narrates and explains report outputs; it never originates a metric, score, or probability — those come only from deterministic providers and disclosed models.';

export const RO_TOOLS: Record<string, RoToolSpec> = {
  list_report_types: { label: 'List report types', multi: false, blurb: 'Which governed reports your scope, role and segment permit.' },
  generate_report: { label: 'Generate a report', multi: false, blurb: 'Run a governed report at a scope — provenance-linked, truthfulness-gated.' },
  explain_blockers: { label: 'Explain blockers', multi: false, blurb: 'Why a run is held from final and what evidence clears each blocker.' },
  portfolio_readiness: { label: 'Portfolio readiness', multi: true, blurb: 'Readiness, risk and timeline across many programs (board view).' },
  regional_gap_analysis: { label: 'Regional gap analysis', multi: false, blurb: 'Dossier gaps for a target market against its submission standard.' },
  compare_regions: { label: 'Compare regions', multi: true, blurb: 'Requirement deltas across markets for one program (harmonization).' },
  get_prediction: { label: 'Prediction', multi: false, blurb: 'Advisory forecast with mandatory model + validation disclosure.' },
};

/* ---- Intent routing ---- */

const INTENT_KEYWORDS: Record<string, string[]> = {
  list_report_types: ['list', 'available', 'types', 'options', 'which', 'reports'],
  generate_report: ['generate', 'run', 'create', 'produce', 'build', 'report'],
  explain_blockers: ['blocker', 'blocked', 'why', 'explain', 'stuck', 'final'],
  portfolio_readiness: ['portfolio', 'board', 'program', 'group', 'across', 'executive'],
  regional_gap_analysis: ['gap', 'gaps', 'market', 'region', 'fda', 'ema', 'pmda', 'missing'],
  compare_regions: ['compare', 'comparison', 'versus', 'harmonization', 'markets', 'delta'],
  get_prediction: ['predict', 'prediction', 'forecast', 'risk', 'trajectory', 'likelihood'],
};

export function roRouteIntent(utterance: string): RoRouteResult {
  const text = (utterance || '').toLowerCase();
  const tokens = new Set(text.split(/[^a-z0-9]+/).filter(Boolean));
  const scored = Object.keys(INTENT_KEYWORDS)
    .map(name => ({ name, score: INTENT_KEYWORDS[name].reduce((a, kw) => a + (tokens.has(kw) ? 1 : 0), 0) }))
    .sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (best && best.score > 0 && (scored[1] ? scored[1].score : 0) < best.score) {
    return { matched: true, name: best.name };
  }
  return { matched: false, candidates: scored.filter(s => s.score > 0).map(s => s.name) };
}

export function roMarketsIn(utterance: string): string[] {
  const t = (utterance || '').toLowerCase();
  const out: string[] = [];
  const pairs: [string, string][] = [['fda', 'FDA'], ['ema', 'EMA'], ['pmda', 'PMDA'], ['nmpa', 'NMPA'], ['mhra', 'MHRA'], ['health canada', 'Health Canada'], ['tga', 'TGA'], ['mfds', 'MFDS']];
  pairs.forEach(([k, v]) => { if (t.includes(k)) out.push(v); });
  return out;
}

export function roResolveType(utterance: string, seg: string): RoReportType | null {
  const text = (utterance || '').toLowerCase();
  const tokens = text.split(/[^a-z0-9]+/).filter(t => t.length > 2);
  const cands = roFilterForSegment(RO_TYPES, seg);
  let best: RoReportType | null = null;
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

/* ---- Presets ---- */

export const RO_PRESETS: Record<string, RoPreset[]> = {
  pharma: [
    { id: 'preapproval', label: 'Pre-approval command pack', types: ['readiness.executive_digest', 'prediction.crl_rtf_premortem', 'ema.rmp_psur_signal_alignment', 'compliance.audit_assurance_pack'],
      why: 'Your NDA is in agency review — this pack pairs the readiness digest with a CRL/RTF pre-mortem, safety-signal alignment and the audit assurance you’ll need at the action date.' },
    { id: 'globalfile', label: 'Global filing harmonization', types: ['ema.maa_readiness_assessment', 'china_nmpa.ctd_module_gap_analysis', 'provenance.evidence_trace_report'],
      why: 'Reuse the US dossier across EMA and NMPA — the gap analyses show what each region still needs.' },
  ],
  biotech: [
    { id: 'blaassembly', label: 'BLA assembly pack', types: ['readiness.executive_digest', 'prediction.regulatory_forecast', 'provenance.evidence_trace_report', 'fcoi.disclosure_register'],
      why: 'Your BLA is mid-assembly — this pack tracks readiness, forecasts the review trajectory, and closes the evidence and financial-disclosure gaps before filing.' },
    { id: 'nonclin', label: 'Nonclinical & CMC readiness', types: ['nonclinical.study_send_register', 'compliance.audit_assurance_pack'],
      why: 'Confirm Module 4 / SEND datasets and the audit trail are submission-grade.' },
  ],
  medtech: [
    { id: 'clearance', label: '510(k) clearance pack', types: ['usa_fda.estar_510k_equivalence_matrix', 'inspection.readiness_pack', 'compliance.audit_assurance_pack'],
      why: 'The equivalence matrix carries your substantial-equivalence argument; the inspection and audit packs keep the QMS ready for review.' },
  ],
  diagnostics: [
    { id: 'ivdperf', label: 'IVD performance & clearance pack', types: ['usa_fda.estar_510k_equivalence_matrix', 'inspection.readiness_pack', 'provenance.evidence_trace_report'],
      why: 'Performance claims traced to source, with the equivalence matrix and inspection readiness for the IVD 510(k).' },
  ],
  cro: [
    { id: 'sponsor', label: 'Sponsor oversight pack', types: ['etmf.completeness_pack', 'inspection.readiness_pack'],
      why: 'Cross-sponsor eTMF completeness plus 483 / inspection readiness across the sites you run.' },
  ],
  academic: [
    { id: 'researchadmin', label: 'Research administration pack', types: ['research_admin.scorecard', 'irb.submission_register', 'iacuc.protocol_register', 'effort.certification_register'],
      why: 'The scorecard rolls up IRB, IACUC, effort and COI so nothing lapses across your studies.' },
  ],
  health: [
    { id: 'oversight', label: 'Portfolio oversight pack', types: ['readiness.executive_digest', 'compliance.audit_assurance_pack', 'inspection.readiness_pack'],
      why: 'Readiness, audit assurance and inspection readiness across the programs you oversee.' },
  ],
};

export function roPresetsForSeg(seg: string): RoPreset[] {
  return RO_PRESETS[seg] || RO_PRESETS.pharma;
}

export { roProgram, roRenderReport, roPortfolio, roSuggestForClient, roAnaReply } from './report-os-data-ext';
export type { RoProgram, RoProgramRegistry, RenderedReport, RenderedSection, RoAnaReplyResult } from './report-os-data-ext';
