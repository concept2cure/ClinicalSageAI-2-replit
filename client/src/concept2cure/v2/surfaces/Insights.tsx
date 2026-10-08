import React, { useState, useRef, useEffect } from 'react';
import { I } from '../icons';
import { useLiveData, EmptyState, ErrorState } from '../dataConnect';
import { apiRequest, serverMessage } from '@/lib/queryClient';
import { downloadBlob, safeFileName } from '../download';
import { getOrgId } from '@/utils/authToken';
import { useAuthUser } from '@/services/portal/authService';
import { canFinalizeReport, canGovernedWrite } from '@shared/constants/permissions';
import { EsignModal, esignSignerOf, type EsigSignedManifest } from '../../_shared/components/EsignModal';
import { GovernedTimestamp } from '../../_shared/components/GovernedTimestamp';
import type { EsigMeaning } from '../../hooks/useEsignature';
import type { OwnedSurfaceViewProps } from '../surfaceViews';
import { publishShellProject, shellProgramId, shellProgramName, useShellProject } from '../shellProject';
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

/** A tier's display name. */
function tierLabel(id: string): string {
  return (RO_TIERS.find(t => t.id === id) || { label: id }).label;
}

const RO_FEATURE_TIER: Record<string, string> = {
  report_families: 'standard',
  scheduled_reports: 'professional',
  portfolio_rollup: 'enterprise',
};

const RO_FEATURE_LABEL: Record<string, string> = {
  report_families: 'Governed report families',
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

/* ── Report types: the server's catalog for the program in view ──
   This was RO_TYPES, a hand copy of 30 server seed rows filtered by the shell's
   segment preference, so the canvas offered what the copy said rather than
   what the server would run: a device-only 510(k) matrix for a biologic IND
   (the preference was 'biopharma', which mapped to pharma + biotech + DEVICE),
   and tiles for types no engine computes, each returning the readiness digest
   under its own title (QA 2026-10-08, j8). The catalog is now the overview's
   `reportTypes`: filtered by the lead program's recorded product type, with
   each type's entitlement and whether an engine computes it (`runnable`). */
interface ReportType {
  typeId: string;
  label: string;
  family: string;
  scopes: string[];
  segments: string[];
  t: { allowPartial?: boolean; requireBlockers?: boolean; requireConfidence?: boolean; requireExplicitGaps?: boolean; forbidFinal?: boolean; requireDisclosure?: boolean };
  /** An engine computes it over a program; otherwise it is shown as not computed and never run. */
  runnable: boolean;
}

/** The overview's catalog row (server insights-canvas-routes.ts CanvasReportType). */
interface CanvasReportType {
  typeId: string;
  label: string;
  family: string;
  allowedScopes?: string[];
  allowedClientSegments?: string[];
  truthfulnessRules?: Record<string, unknown>;
  runnable?: boolean;
}

/** The server catalog as the canvas reads it. A row without `runnable: true` is not run. */
function catalogFrom(rows: CanvasReportType[] | undefined): ReportType[] {
  return (rows ?? []).map((r) => ({
    typeId: r.typeId,
    label: r.label,
    family: r.family,
    scopes: r.allowedScopes ?? [],
    segments: r.allowedClientSegments ?? [],
    t: (r.truthfulnessRules ?? {}) as ReportType['t'],
    runnable: r.runnable === true,
  }));
}

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
  /** The lead is a project (L189: it said 'program' with a project id). */
  scope: 'project';
  scopeId: string;
  projectId: number;
  code: string | null;
  label: string;
  indication: string | null;
  readiness: number | null;
  confidence: number | null;
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
  readiness: number | null;
  confidence: number | null;
  status: string;
  riskLevel: string;
  criticalBlockerCount: number;
}
interface CanvasPortfolio {
  entitled: boolean;
  requiredTier: string;
  summary: {
    programCount: number;
    avgReadiness: number | null;
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
  /** The open program named by `?programId=`, and whether it leads (server
   *  insights-canvas-routes.ts, CanvasOpenProgram). Null/absent: none named. */
  openProgram?: { programId: string; state: 'lead' | 'unanchored' | 'not-in-portfolio' } | null;
  /** The governed report catalog for the program in view (see catalogFrom). */
  reportTypes?: CanvasReportType[];
  /** The programs the canvas can be opened on, for the picker shown when none is open. */
  programs?: Array<{ programId: string; code: string | null; label: string }>;
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

/* ── Entitlement decision ── */
function roDecide(typeId: string, family: string, tier: string): { entitled: boolean; feature: string; requiredTier: string } {
  const hay = (typeId + ' ' + (family || '')).toLowerCase();
  let feature = 'report_families';
  if (/(^|[._\s])portfolio|board[_\s-]?pack|rollup|roll[_\s-]up/.test(hay)) feature = 'portfolio_rollup';
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
    { id: 'preapproval', label: 'Pre-approval command pack', types: ['readiness.executive_digest', 'ema.rmp_psur_signal_alignment', 'compliance.audit_assurance_pack'], why: 'Pairs the readiness digest with safety-signal alignment and the audit assurance an action date calls for.' },
    { id: 'globalfile', label: 'Global filing harmonization', types: ['ema.maa_readiness_assessment', 'china_nmpa.ctd_module_gap_analysis', 'provenance.evidence_trace_report'], why: 'Reuse the US dossier across EMA and NMPA — the gap analyses show what each region still needs.' },
  ],
  biotech: [
    { id: 'blaassembly', label: 'BLA assembly pack', types: ['readiness.executive_digest', 'provenance.evidence_trace_report', 'fcoi.disclosure_register'], why: 'Tracks readiness and closes the evidence and financial-disclosure gaps before filing.' },
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

/** The standard packs for a segment that hold at least one report this program's
 *  catalog runs. A pack of reports no engine computes is not offered as a pack. */
function roPresetsForSeg(seg: string, types: ReportType[]): Preset[] {
  const runs = new Set(types.filter((t) => t.runnable).map((t) => t.typeId));
  return (RO_PRESETS[seg] || RO_PRESETS.pharma).filter((p) => p.types.some((id) => runs.has(id)));
}

/* ── Guardrail ──
   The old text read "AnA narrates and explains report outputs…". Two things
   were wrong with it. AnA is not what answers here — `roRouteReply` is a
   deterministic intent router that composes its text from the constants in this
   file — and "narrates and explains" describes a language model doing work that
   a `switch` is doing. The half that was true, and the half that matters, is
   that no metric on this surface originates here. */
const RO_GUARDRAIL = 'Find a report matches your words to a governed report type and runs it; it does not answer in its own words. Every metric, score and probability comes from a deterministic provider or a disclosed model; none is originated here.';

/* ── Resolve type from free text ──
   Whole words, not substrings, and none of the words every request carries.
   "Show me the controlled documents overdue for periodic review" ran the
   Controlled Substances Inventory & DEA Ledger: the token "controlled" was a
   substring of its type id, and nothing else in the request scored (QA
   2026-10-08, j8). Controlled documents are QMS records, reported on Audit &
   compliance reports (RO_QMS_INTENT, below), and a word shared with a type's
   name is evidence only when it is the same word. */
const RO_STOP_WORDS = new Set([
  'the', 'and', 'for', 'show', 'report', 'reports', 'run', 'generate', 'create', 'build', 'produce', 'make',
  'what', 'which', 'can', 'you', 'all', 'our', 'give', 'get', 'with', 'from', 'this', 'that', 'please',
  'pack', 'view', 'about', 'into', 'over', 'list', 'need', 'want', 'how', 'are', 'its', 'program', 'programs',
  // Kinds of document many report names share: on their own they name no report.
  // "Show the 510(k) equivalence matrix" matched the Cross-Region Submission
  // Comparison Matrix on "matrix" alone (2026-10-08 after-check).
  'matrix', 'register', 'assessment', 'analysis', 'brief', 'readiness',
]);
function roWords(text: string): string[] {
  return text.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !RO_STOP_WORDS.has(w));
}

/** A request about QMS records: controlled documents, SOPs, periodic review, change control, CAPA, training. */
const RO_QMS_INTENT = /\b(controlled[\s-]+documents?|sops?|standard operating procedures?|periodic reviews?|qms|quality management|document control|change control|change requests?|capas?|training records?|read[\s-]+and[\s-]+understood)\b/;

/** The catalog type a request names, runnable or not; null when none does. */
function roResolveType(utterance: string, types: ReportType[]): ReportType | null {
  const text = (utterance || '').toLowerCase();
  const words = new Set(roWords(text));
  let best: ReportType | null = null;
  let bestScore = 0;
  types.forEach(t => {
    const hay = new Set(roWords(`${t.typeId} ${t.label} ${t.family} ${(RO_FAMILY[t.family] || {}).label || ''}`));
    let s = 0;
    words.forEach(w => { if (hay.has(w)) s++; });
    if (/510|equivalence|predicate/.test(text) && t.typeId.includes('510k')) s += 3;
    if (/readiness|ready|digest|executive/.test(text) && t.typeId === 'readiness.executive_digest') s += 3;
    if (/etmf|tmf|trial master/.test(text) && t.typeId === 'etmf.completeness_pack') s += 3;
    if (/audit|compliance|part 11|assurance/.test(text) && t.typeId === 'compliance.audit_assurance_pack') s += 2;
    if (/evidence|provenance|trace/.test(text) && t.typeId === 'provenance.evidence_trace_report') s += 2;
    if (/maa|europe|ema/.test(text) && t.typeId === 'ema.maa_readiness_assessment') s += 2;
    if (/inspection|483/.test(text) && t.typeId === 'inspection.readiness_pack') s += 2;
    if (/safety|psur|rmp|signal/.test(text) && t.typeId === 'ema.rmp_psur_signal_alignment') s += 2;
    // A tie goes to the type that runs: a request is answered with a report when one fits as well.
    if (s > bestScore || (s === bestScore && s > 0 && t.runnable && best && !best.runnable)) { bestScore = s; best = t; }
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
interface PortfolioRow { code: string; indication: string | null; readiness: number | null }
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
function roSuggestForClient(p: ProgramCtx, seg: string, types: ReportType[]) {
  const preset: Preset | null = roPresetsForSeg(seg, types)[0] ?? null;
  const rBit = p.readiness == null
    ? (p.filing ? `${p.code} is in ${p.filing} preparation` : `${p.code}'s submission readiness is not yet computed`)
    : `${p.code} is ${p.readiness}% ready`;
  const pduBit = p.pdufa ? ` with a target action date of ${p.pdufa}` : '';
  /* The third prompt was "Run the audit assurance pack" or "Show the 510(k)
     equivalence matrix", chosen by the shell's segment preference: the 510(k)
     prompt was offered to a biologic program, and neither report has an engine
     (QA 2026-10-08, j8). The prompts now name only what runs here. */
  return {
    headline: 'Build any governed report or dashboard — describe what you need.',
    body: preset
      ? `${rBit}${pduBit}. The ${preset.label} is the standard starting pack for ${SEG_LABEL[seg] || seg} — it is not picked from the readiness figure above.`
      : `${rBit}${pduBit}.`,
    preset,
    prompts: [
      ...(preset ? [`Build the ${preset.label}`] : []),
      p.readiness != null ? `How ready is ${p.code} to file?` : `Generate the Executive Readiness Digest for ${p.code}`,
      `What reports can you run for ${p.code}?`,
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
  /** The report family, from the catalog type the run was made from. */
  family?: string;
  scopeType: string;
  scopeId: string;
  /** What the report is about, by name (the server's stored scope label, else the program's name). */
  scopeLabel?: string;
  generatedAt: string;
  status: string;
  truthfulness: { allowedStatus: string; downgradedFrom: string; reasons: string[] };
  sections: ROSection[];
}


/* ── Intent router ── */
/* What "Find a report" shows for the last search: one result, replaced by the
   next. It was a thread of `{ role: 'user' | 'ana' }` messages drawn as chat
   bubbles beside AnA's mark (FILING_SPINE F6). */
interface FoundResult {
  text: string;
  chips?: [string, string][];
  locked?: { feature: string; requiredTier: string; typeLabel: string };
  /** A destination the result sends the person to (a surface id and its button label). */
  nav?: { surface: string; label: string };
}

interface RouteReply {
  tool: string;
  text: string;
  chips?: [string, string][];
  locked?: { feature: string; requiredTier: string; typeLabel: string };
  question?: boolean;
  nav?: { surface: string; label: string };
  report: RenderedReport | null;
  dashboard: DashboardData | null;
  /* When set, findReport() generates this report from the REAL governed backend
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
function roRouteReply(utterance: string, tier: string, ctx: { program: ProgramCtx; portfolio: CanvasPortfolio; types: ReportType[]; report?: RenderedReport | null }): RouteReply {
  const c = ctx;
  const route = roRouteIntent(utterance);
  const name = route.matched ? route.name! : (route.candidates && route.candidates[0]) || 'generate_report';
  const p = ctx.program;
  function cap(s: string) { return (RO_TIERS.find(t => t.id === s) || { label: s }).label; }
  const lockMsg = (feature: string, typeLabel: string): RouteReply => ({ tool: name, text: `"${typeLabel}" needs the ${cap(RO_FEATURE_TIER[feature])} plan — it is a ${RO_FEATURE_LABEL[feature]} capability. No estimated result is shown on a plan that has not unlocked the governed model. What it includes, and how to unlock it:`, locked: { feature, requiredTier: RO_FEATURE_TIER[feature], typeLabel }, report: null, dashboard: null });
  const entitledFor = (t: ReportType) => roDecide(t.typeId, t.family, tier);

  if (name === 'portfolio_readiness') {
    const dec = roDecide('portfolio_rollup', 'portfolio', tier);
    /* The organisation's real entitlement, not the previewed tier: previewing
       Enterprise on a Standard plan answered "Your plan unlocks the portfolio
       rollup, but there are no governed programs", false twice (reporting
       review 2026-10-01). The server withholds the programs from an org it
       does not entitle. */
    if (!dec.entitled || !ctx.portfolio.entitled) return lockMsg('portfolio_rollup', 'Portfolio readiness rollup');
    // Live, enterprise-gated rollup — programs is null when the org isn't
    // entitled or has none; show an honest empty, never a fabricated board.
    const rows = ctx.portfolio.programs ? roPortfolioFrom(ctx.portfolio.programs) : [];
    if (rows.length === 0) return { tool: name, text: `Your plan unlocks the portfolio rollup, but there are no governed programs to roll up yet. Once a program with a readiness run exists in your organization, its board view appears here.`, report: null, dashboard: null };
    return { tool: name, text: `Readiness across your ${rows.length} program${rows.length > 1 ? 's' : ''}. The numbers are the governed readiness scores, ranked — not recomputed here.`, dashboard: { kind: 'portfolio', label: 'Portfolio readiness', why: 'Board view across all programs', rows }, report: null };
  }
  if (name === 'compare_regions') {
    const markets = roMarketsIn(utterance);
    if (markets.length < 2) return { tool: name, question: true, text: `Which markets should be compared for ${p.code}? Pick at least two.`, chips: [['FDA vs EMA', `Compare FDA and EMA for ${p.code}`], ['FDA vs EMA vs PMDA', `Compare FDA, EMA and PMDA for ${p.code}`], ['FDA vs NMPA', `Compare FDA and NMPA for ${p.code}`]], report: null, dashboard: null };
    return { tool: name, text: `Comparing ${markets.join(', ')} for ${p.code}. A market with no governed value yet shows as missing rather than estimated.`, dashboard: { kind: 'compare', label: `Regional comparison — ${p.code}`, why: markets.join(' — '), markets, program: p }, report: null };
  }
  if (name === 'explain_blockers') {
    const rep = c.report;
    if (!rep) return { tool: name, question: true, text: 'Which report? Generate or open one and its blockers are listed here, straight from the server’s truthfulness gate.', chips: [['Executive Readiness Digest', `Generate the executive readiness digest for ${p.code}`]], report: null, dashboard: null };
    const reasons = (rep.truthfulness && rep.truthfulness.reasons) || [];
    return { tool: name, text: `"${rep.reportTypeLabel}" is held at ${rep.status} because: ${reasons.join('; ')}. Those are the gate's own reasons, verbatim. Clear them and it can promote toward final; the status gate is deterministic.`, report: rep, dashboard: null };
  }
  /* A forecast or CRL/RTF pre-mortem was the readiness run under a prediction's
     title, behind a Professional lock: no prediction model ran (reporting
     review 2026-10-01). None is part of this release, and the server now
     refuses a prediction type as a run. The question is answered with what the
     governed record does hold. */
  if (name === 'get_prediction') {
    return {
      tool: name,
      text: `Forecasts and CRL/RTF pre-mortems are not part of this release: no validated prediction model is in the governed record, and a readiness report is not shown under a prediction's name. The Executive Readiness Digest states ${p.code}'s evaluated readiness and the blockers that stand before filing.`,
      chips: [['Executive Readiness Digest', `Generate the executive readiness digest for ${p.code}`]],
      report: null,
      dashboard: null,
    };
  }
  /* QMS records are not a report type on this canvas: controlled documents,
     their periodic review, change control and training are reported, sealed,
     on Audit & compliance reports (Controlled document register). The request
     is sent there, and nothing is run here (QA 2026-10-08, j8). */
  if (RO_QMS_INTENT.test(utterance.toLowerCase())) {
    return {
      tool: 'route_qms',
      text: 'Controlled documents, their periodic review, change control and training are reported on Audit & compliance reports, in the Controlled document register. No report is run here for this request.',
      nav: { surface: 'compliance-reports', label: 'Open Audit & compliance reports' },
      report: null,
      dashboard: null,
    };
  }
  const resolved = roResolveType(utterance, ctx.types);
  if (name === 'list_report_types' || !resolved) {
    const cands = ctx.types.filter((t) => t.runnable).slice(0, 6);
    if (cands.length === 0) return { tool: 'list_report_types', text: `No governed report this release computes applies to ${p.code}. Nothing is run in its place.`, report: null, dashboard: null };
    return { tool: 'list_report_types', question: true, text: `For ${p.code}${p.filing ? ` (${p.filing})` : ''}, any of these can be run — or describe what you need in your own words and it is matched to the closest governed report type.`, chips: cands.map(t => [t.label, `Generate the ${t.label} for ${p.code}`]), report: null, dashboard: null };
  }
  /* A type no engine computes is said to be one, and not run: it came back as
     the readiness digest under its own title (QA 2026-10-08, j8). */
  if (!resolved.runnable) {
    const alt = ctx.types.filter((t) => t.runnable).slice(0, 4);
    return {
      tool: 'generate_report',
      text: `No engine computes the ${resolved.label} in this release, so it is not run, and no other report is shown under its name.${alt.length ? ` These run for ${p.code}:` : ''}`,
      chips: alt.map(t => [t.label, `Generate the ${t.label} for ${p.code}`]),
      report: null,
      dashboard: null,
    };
  }
  const dec = entitledFor(resolved);
  if (!dec.entitled) return lockMsg(dec.feature, resolved.label);
  return { tool: 'generate_report', text: `Running the ${resolved.label} for ${p.code} against the governed record. Every value is computed from the governed record; none is originated here.`, report: null, reportType: resolved, dashboard: null };
}

/* ── Inline helpers ── */

/* ── Provenance string ── */
function roProv(refs?: { sourceTable: string; sourceField?: string; recordId?: string; transformation?: string }[]): string | undefined {
  if (!refs || !refs.length) return undefined;
  return 'Derived from ' + refs.map(r => {
    const f = r.sourceField ? '.' + r.sourceField : '';
    const rec = r.recordId !== undefined ? ' #' + r.recordId : '';
    const tr = r.transformation ? ' — ' + r.transformation : '';
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
        <div className="ro-svg-cap">{(s.label as string) || 'Trajectory'} — advisory band (model not validated)</div>
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
  return <div className="ro-svg-cap">Chart — {chartType}</div>;
}

/* ── ROBlock ── */
/**
 * A report table as a table (reporting review 2026-10-01, DESIGN-5): column
 * headers a screen reader associates with each cell (WCAG 1.3.1), the
 * platform's governed table style (`reg-tbl`, as the compliance reports use).
 */
function ROTable({ columns, rows }: { columns: string[]; rows: string[][] }) {
  return (
    <div className="ro-table">
      <table className="reg-tbl">
        <thead><tr>{columns.map((c, i) => <th key={i} scope="col">{c}</th>)}</tr></thead>
        <tbody>{rows.map((row, r) => <tr key={r}>{row.map((cell, c) => <td key={c}>{cell}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

/** Where a value came from, as text anyone can open: never hover-only (DESIGN-5). */
function ROProvenance({ prov }: { prov: string | undefined }) {
  if (!prov) return null;
  return (
    <details className="ro-m-prov">
      <summary>Source</summary>
      <span>{prov}</span>
    </details>
  );
}

function ROBlock({ block }: { block: ROBlockData }) {
  switch (block.kind) {
    case 'summary': return <p className="ro-summary">{block.text}</p>;
    case 'narrative': return (
      <div className="ro-narr">
        <p className="ro-narr-body">{block.text}</p>
        <p className="ro-narr-tag" title={block.disclosure}>AI-generated narrative — {block.disclosure}</p>
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
          <div className="ro-m-val">{disp}{block.unit && disp !== '--' ? <span className="ro-m-unit">{block.unit}</span> : null}</div>
          {stLabel ? <div className={'ro-m-st st-' + st}>{stLabel}</div> : null}
          <ROProvenance prov={prov} />
        </div>
      );
    }
    case 'table': return (
      <>
        <ROTable columns={block.columns || []} rows={(block.rows || []).map((row) => row.map((cell) => (cell === null || cell === undefined ? '--' : String(cell))))} />
        <ROProvenance prov={roProv(block.provenance)} />
      </>
    );
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
        <div className="ro-disc-s">{block.validated ? 'Validated' : 'Not validated'}{block.confidence !== undefined ? ` — confidence ${(block.confidence * 100).toFixed(0)}%` : ''}</div>
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
/** The family a report is filed under, and what it is about by name — never a row id. */
function reportHeading(report: RenderedReport): { fam: { label?: string; region?: string }; scope: string } {
  return { fam: RO_FAMILY[report.family ?? ''] || {}, scope: report.scopeLabel ?? 'This program' };
}

function ROReport({ report, onExport, onFinalize, seal, compact }: {
  report: RenderedReport;
  onExport: (r: RenderedReport) => void;
  /** Offered only to a role that may finalize, on a run that is not final. */
  onFinalize?: () => void;
  seal?: ReportSeal | null;
  compact?: boolean;
}) {
  if (!report) return null;
  const { fam, scope } = reportHeading(report);
  const stTone = report.status === 'final' ? 'ok' : report.status === 'partial' ? 'warn' : 'idle';
  const sections = compact ? report.sections.slice(0, 2) : report.sections;
  return (
    <div className="ro-report">
      <div className="ro-rep-head">
        <div className="ro-rep-eyebrow">{fam.label || 'Governed report'}{fam.region ? <span className="ro-region">{fam.region}</span> : null}</div>
        <h2 className="ro-rep-title">{report.reportTypeLabel || report.reportTypeId}</h2>
        <div className="ro-rep-meta">
          {/* The scope by name: "project — 1" named a database row (QA 2026-10-08, j8). */}
          <span data-testid="ro-scope">{scope}</span>
          <span className={'ro-status st-' + stTone}>{report.status}</span>
          <span className="ro-gen">generated {new Date(report.generatedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
        </div>
        {report.truthfulness && report.truthfulness.reasons && report.truthfulness.reasons.length ?
          <div className="ro-truth">{I.shieldCheck} Truthfulness gate — held at <b>{report.status}</b>: {report.truthfulness.reasons.join('; ')}.</div> : null}
        {seal ? <ROSealLine seal={seal} /> : null}
      </div>
      {sections.map(sec => (
        <section key={sec.id} className="ro-sec">
          <h3 className="ro-sec-h">{sec.title}</h3>
          <div className="ro-sec-body">{sec.blocks.map((b, i) => <ROBlock key={i} block={b} />)}</div>
        </section>
      ))}
      {!compact && <ROReportActions report={report} onExport={onExport} onFinalize={onFinalize} />}
    </div>
  );
}

/* ── RODashboard ── */
/* `onAsk` is gone from here too — it was declared, threaded down from the
   canvas and never called once in the whole component. */
function RODashboard({ dashboard, tier, onRun, canRun, scope, catalog }: { dashboard: DashboardData; tier: string; onRun: (t: ReportType) => void; canRun: boolean; scope: string; catalog: ReportType[] }) {
  if (!dashboard) return null;

  if (dashboard.kind === 'portfolio') {
    const rows = dashboard.rows || [];
    /* Readiness is null for a program none was computed for. The average is
       over the computed ones only, and states nothing when there are none. */
    const known = rows.filter((r) => r.readiness != null).map((r) => r.readiness as number);
    const avg = known.length ? Math.round(known.reduce((a, v) => a + v, 0) / known.length) : null;
    return (
      <div className="ro-dash">
        <div className="ro-dash-head"><div><div className="ro-rep-eyebrow">Portfolio — board view</div><h2 className="ro-rep-title">{dashboard.label}</h2><div className="ro-rep-meta"><span>{rows.length} programs</span>{avg == null ? <span className="ro-status">readiness not computed</span> : <span className="ro-status">avg readiness {avg}%{known.length < rows.length ? ` · ${rows.length - known.length} not computed` : ''}</span>}</div></div></div>
        <div className="ro-port-grid">
          {rows.map((r, i) => (
            <div key={i} className="ro-port-card">
              {r.readiness == null
                ? <div className="ro-port-ind" role="note">Readiness not computed</div>
                : <ROChart chartType="readiness_ring" spec={{ value: r.readiness, label: '' }} />}
              <div className="ro-port-b"><div className="ro-port-code">{r.code}</div><div className="ro-port-ind">{r.indication}</div></div>
            </div>
          ))}
        </div>
        <div className="ro-dash-note">{I.info} Readiness values are the governed scores per program, in the order the server ranked them. The average is taken here, over the programs that have one.</div>
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
        <ROTable columns={['Requirement', ...m]} rows={tRows.map((r) => [r[0], ...m.map(() => r[1] ?? '--')])} />
        <div className="ro-dash-note">{I.info} No per-market assessment is in the governed record, so every market cell reads "--". Connect the live regional providers to populate the deltas.</div>
      </div>
    );
  }

  /* preset pack -- grid of governed report cards */
  // A pack's types that apply to this program (the catalog is the program's).
  const types = (dashboard.types || []).map(id => catalog.find(t => t.typeId === id)).filter(Boolean) as ReportType[];
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
              <div className="ro-lock"><span className="ro-lock-chip">{I.lock} {(RO_TIERS.find(x => x.id === dec.requiredTier) || { label: '' }).label} plan</span></div>
              <div className="ro-pack-sub">{RO_FEATURE_LABEL[dec.feature]} — unlock to include in this pack.</div>
            </div>
          );
          /* Running a report creates a governed record, which the server refuses
             to a role without governed:write. The tile says so instead of
             offering a run that will be refused. */
          /* A type that does not run at this scope (research_admin.scorecard runs
             over a program group or account) says so instead of offering a run
             the server refuses. */
          /* No engine computes it: said so, never run as the readiness digest
             under its title (QA 2026-10-08, j8). */
          if (!t.runnable) return (
            <div key={t.typeId} className="ro-pack-card is-locked" data-testid="ro-pack-not-computed">
              <div className="ro-pack-fam">{fam.label}{fam.region ? <span className="ro-region">{fam.region}</span> : null}</div>
              <div className="ro-pack-title">{t.label}</div>
              <div className="ro-pack-sub">Not computed in this release. No engine produces this report, so it is not run.</div>
            </div>
          );
          if (!t.scopes.includes(scope)) return (
            <div key={t.typeId} className="ro-pack-card is-locked">
              <div className="ro-pack-fam">{fam.label}</div>
              <div className="ro-pack-title">{t.label}</div>
              <div className="ro-pack-sub">Runs over {t.scopes.join(' or ')}, not a single {scope}.</div>
            </div>
          );
          if (!canRun) return (
            <div key={t.typeId} className="ro-pack-card is-locked">
              <div className="ro-pack-fam">{fam.label}{fam.region ? <span className="ro-region">{fam.region}</span> : null}</div>
              <div className="ro-pack-title">{t.label}</div>
              <div className="ro-pack-sub">View only. Running a report needs an editor role in this organization.</div>
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

/** Why a finalize was refused, from the refusal's own status and code. A 409 is
 *  the truthfulness gate (its reasons) or a run already final (its seal stands);
 *  a bare 403 is a role the server does not let finalize. Anything else is the
 *  signature ceremony's own sentence (reason, meaning, password, separation of
 *  duties). Null when the refusal carries nothing readable. */
function finalizeRefusalNote(status: unknown, payload: unknown): string | null {
  const p = (payload ?? {}) as { reasons?: unknown; error?: { code?: unknown } };
  if (status === 409 && p.error?.code === 'RUN_ALREADY_FINAL') {
    // The message goes through the canonical reader, which keeps infrastructure
    // text and enum tokens off the screen (ci:error-envelope).
    return `Already final — ${serverMessage(payload) ?? 'this run was finalized earlier.'}`;
  }
  if (status === 409 && Array.isArray(p.reasons)) return `Not finalized — held below final: ${p.reasons.join('; ')}`;
  if (status === 403 && (p.error?.code == null || p.error.code === 'AUTH_004')) {
    return 'Not finalized — finalizing a report is for organisation owners, admins and managers.';
  }
  return serverMessage(payload);
}

/** What the canvas says when POST /runs refuses. A plan refusal carries
 *  requiredTier; the write gate's does not. Every 403 read as "needs a higher
 *  plan" before the write gate existed, and would have told a viewer to upgrade. */
function runRefusalNote(label: string, status: unknown, payload: unknown): string {
  const tier = (payload as { requiredTier?: unknown } | null)?.requiredTier;
  if (status === 403 && tier) {
    return `"${label}" needs a higher plan (${String(tier)}). No estimated result is shown on a plan that has not unlocked the governed model.`;
  }
  if (status === 403) {
    return `"${label}" wasn't run — ${serverMessage(payload) ?? 'the server refused it'}. Running a report needs an editor role in this organization.`;
  }
  if (status === 404) return `"${label}" isn't in your governed report registry, so it can't be run against real data. None is fabricated.`;
  return `Couldn't run "${label}" — ${serverMessage(payload) ?? 'the server did not say why'}.`;
}

/** POST /api/report-os/runs: the new run's id, or the sentence to show. */
/* With a program open, the run names THAT program (its regulatory_programs
   UUID) and the server resolves its project record with the same strict anchor
   resolver the overview used; the client carries no project id for it (QA
   2026-10-08, j8: every report ran over project 1). */
async function requestRun(type: ReportType, program: ProgramCtx, programId: string | null): Promise<{ runId: number } | { note: string }> {
  let res: Response;
  try {
    res = await apiRequest('POST', '/api/report-os/runs', {
      organizationId: Number(getOrgId()) || 0,
      scopeType: program.scope,
      ...(programId ? { programId } : { scopeId: program.scopeId }),
      reportTypeId: type.typeId,
    });
  } catch (e) {
    // apiRequest throws for every non-OK status but 401. Read the refusal
    // structurally, not by instanceof (see finalizeRefusalNote's callers).
    const err = e as { status?: unknown; payload?: unknown } | null;
    if (typeof err?.status === 'number') return { note: runRefusalNote(type.label, err.status, err.payload) };
    return { note: `Couldn't reach the report engine — ${e instanceof Error ? e.message : String(e)}.` };
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) return { note: runRefusalNote(type.label, res.status, body) };
  const runId = body?.data?.run?.id;
  return runId == null ? { note: 'The run started but returned no id — reload and retry.' } : { runId: Number(runId) };
}

/** GET /runs/:id/rendered, adopted as the canvas's report; null when it did not come back. */
async function fetchRenderedRun(runId: number, type: ReportType, program: ProgramCtx): Promise<RenderedReport | null> {
  try {
    const res = await apiRequest('GET', `/api/report-os/runs/${runId}/rendered`);
    const rendered = (await res.json().catch(() => null))?.data;
    if (!res.ok || !rendered || !Array.isArray(rendered.sections)) return null;
    const status = typeof rendered.status === 'string' ? rendered.status : 'partial';
    return {
      reportTypeId: rendered.reportTypeId ?? type.typeId,
      reportTypeLabel: type.label,
      family: type.family,
      scopeType: rendered.scopeType ?? program.scope,
      scopeId: rendered.scopeId ?? program.scopeId,
      scopeLabel: typeof rendered.scopeLabel === 'string' && rendered.scopeLabel ? rendered.scopeLabel : program.label,
      generatedAt: rendered.generatedAt ?? new Date().toISOString(),
      status,
      truthfulness: (rendered.truthfulness && Array.isArray(rendered.truthfulness.reasons))
        ? rendered.truthfulness
        : { allowedStatus: status, downgradedFrom: 'final', reasons: [] },
      sections: rendered.sections,
    };
  } catch {
    return null;
  }
}

/** GET /runs/:id/export.pdf through the canonical downloadBlob: what was saved, or why nothing was. */
async function downloadRunPdf(runId: number, rep: RenderedReport): Promise<{ ok: boolean; text: string }> {
  try {
    const res = await apiRequest('GET', `/api/report-os/runs/${runId}/export.pdf`);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      return { ok: false, text: `No file saved — ${serverMessage(body) ?? 'the export service did not say why'}.` };
    }
    const blob = await res.blob();
    const filename = `${safeFileName(rep.reportTypeLabel || rep.reportTypeId, 'report')}_run${runId}.pdf`;
    return downloadBlob(filename, blob)
      ? { ok: true, text: `Saved ${filename}.` }
      : { ok: false, text: 'No file saved — this browser refused the download.' };
  } catch (e) {
    return { ok: false, text: `No file saved — ${e instanceof Error ? e.message : String(e)}.` };
  }
}

/** A finalized run's signature and seal, as the server returned them. */
export interface ReportSeal {
  signer: string | null;
  signedAt: string;
  meaning: string;
  algorithm: string;
  hash: string;
  atomCount: number;
}

const REPORT_FINALIZE_MEANINGS: ReadonlyArray<EsigMeaning> = ['authorship', 'approval', 'responsibility'];
const SEAL_MEANING_LABEL: Record<string, string> = { authorship: 'authorship', approval: 'approval', responsibility: 'responsibility' };

const textOr = (v: unknown, fallback: string): string => (typeof v === 'string' ? v : fallback);

/** The signature and seal a finalize answered with. */
function sealFromResponse(body: { data?: { seal?: Record<string, unknown>; signature?: Record<string, unknown> } } | null, meaning: string): Omit<ReportSeal, 'signer'> {
  const seal = body?.data?.seal ?? {};
  const signature = body?.data?.signature ?? {};
  return {
    signedAt: textOr(signature.signedAt, ''),
    meaning: textOr(signature.meaning, meaning),
    algorithm: textOr(seal.algorithm, 'sha256'),
    hash: textOr(seal.contentHash, ''),
    atomCount: typeof seal.atomCount === 'number' ? seal.atomCount : 0,
  };
}

/** POST /runs/:id/finalize with the signature; the seal, or a thrown sentence the dialog shows. */
async function finalizeRun(
  runId: number,
  input: { meaning: EsigMeaning; reason: string; password: string; totp?: string },
): Promise<Omit<ReportSeal, 'signer'>> {
  let res: Response;
  try {
    res = await apiRequest('POST', `/api/report-os/runs/${runId}/finalize`, {
      reason: input.reason,
      meaning: input.meaning,
      reauth: { password: input.password, ...(input.totp ? { totp: input.totp } : {}) },
    });
  } catch (e) {
    const err = e as { status?: unknown; payload?: unknown } | null;
    const note = err ? finalizeRefusalNote(err.status, err.payload) : null;
    throw new Error(note ?? (e instanceof Error ? e.message : String(e)), { cause: e });
  }
  const body = await res.json().catch(() => null);
  // apiRequest RETURNS a 401: the ceremony's re-authentication refusals are 401s.
  if (!res.ok) throw new Error(serverMessage(body) ?? 'Your session is not signed in any more. Sign in again; nothing was finalized.');
  return sealFromResponse(body, input.meaning);
}

/* ── Finalize is an electronic signature ──────────────────────────────────────
   Until 2026-10-01 the canvas finalized as a side effect of "Export report":
   one click sealed the run final with no reason, no meaning and no
   re-authentication (reporting review, Part 11 lens). Finalizing is now its own
   act, in the product's one signing dialog (the shared EsignModal): meaning,
   reason, the account password and the authenticator code when one is
   enrolled. The server re-verifies them inside the transaction that seals the
   run (services/part11/governed-signature-ceremony.ts). Export only reads. */
function ReportFinalizeModal({ runId, report, onClose, onSealed }: {
  runId: number;
  report: RenderedReport;
  onClose: () => void;
  onSealed: (seal: ReportSeal) => void;
}) {
  const authUser = useAuthUser();
  const signer = esignSignerOf(authUser);
  const onSign = async (input: { meaning: EsigMeaning; reason: string; password: string; totp?: string }): Promise<EsigSignedManifest> => {
    const sealed = await finalizeRun(runId, input);
    onSealed({ ...sealed, signer: signer?.name ?? null });
    return { meaning: input.meaning, reason: input.reason, signedAt: sealed.signedAt, ...(sealed.hash ? { hash: sealed.hash } : {}) };
  };
  return (
    <EsignModal
      open
      action="Finalize report"
      target={report.reportTypeLabel || report.reportTypeId}
      targetMeta="Finalizing seals the report's content and provenance under your signature and locks the run final. A final report is not changed afterwards."
      defaultMeaning="authorship"
      meanings={REPORT_FINALIZE_MEANINGS}
      signer={signer}
      requireMfa={authUser?.mfaEnabled === true}
      onClose={onClose}
      onSign={onSign}
    />
  );
}

/** The signature manifestation on a finalized report (21 CFR 11.50): who, when, what it means, and the seal. */
function ROSealLine({ seal }: { seal: ReportSeal }) {
  return (
    <div className="ro-truth" role="note" data-testid="ro-seal">
      {I.shieldCheck}
      <span>
        Final. Signed{seal.signer ? ` by ${seal.signer}` : ''} as {SEAL_MEANING_LABEL[seal.meaning] ?? seal.meaning},{' '}
        <GovernedTimestamp value={seal.signedAt} layout="inline" />. Sealed {seal.algorithm} {seal.hash.slice(0, 12)}… over {seal.atomCount} provenance atoms.
      </span>
    </div>
  );
}

/** Export reads; Finalize, when offered, signs. */
function ROReportActions({ report, onExport, onFinalize }: {
  report: RenderedReport;
  onExport: (r: RenderedReport) => void;
  onFinalize?: () => void;
}) {
  return (
    <div className="ro-rep-actions">
      <button className="sp-primary" onClick={() => onExport(report)}>{I.download || I.fileText} Export PDF</button>
      {onFinalize && <button type="button" className="btn ghost" onClick={onFinalize}>{I.shieldCheck} Finalize…</button>}
    </div>
  );
}

/** A report segment (the program's recorded product type, server segment.ts) → the pack set. */
const RO_PRESET_SEGMENT: Record<string, string> = {
  pharma: 'pharma', biotech: 'biotech', device: 'medtech', ivd: 'diagnostics', cro: 'cro',
};

export function InsightsCanvas({ onNav, segment }: OwnedSurfaceViewProps) {

  // Live canvas bootstrap — the org's REAL subscription tier, flagship program
  // readiness (computeInitialRun) and portfolio rollup (server
  // insights-canvas-routes.ts → GET /api/insights-canvas/overview), replacing
  // the retired PJ_PROGRAMS / GI_BY_SEG / APP_LICENSE fixtures. Real object →
  // honest empty (no flagship program yet) → honest error.
  // Each retry is a new read (reporting review 2026-10-01, DESIGN-3).
  const [overviewAttempt, setOverviewAttempt] = useState(0);
  /* The program the shell has open leads the canvas (QA 2026-10-08, j1: with
     HLV-333 open it spoke about the flagship, C2C-001). Named by its UUID; the
     server resolves the anchored project the readiness runs are keyed on. */
  const openProgramId = shellProgramId(useShellProject());
  const overviewUrl =
    '/api/insights-canvas/overview' + (openProgramId ? `?programId=${encodeURIComponent(openProgramId)}` : '');
  const overview = useLiveData<CanvasOverview>(overviewUrl, [overviewUrl, overviewAttempt]);
  const data = overview.data;
  const program = data?.leadProgram ? leadToProgramCtx(data.leadProgram) : null;
  /* The catalog and the packs follow the program's recorded product type (the
     overview's `segments`), not the shell's segment preference, which offered a
     device pack and a 510(k) prompt to a biologic program (QA 2026-10-08, j8). */
  const catalog = catalogFrom(data?.reportTypes);
  const programSegments = data?.segments ?? [];
  const seg = (programSegments.length === 1 ? RO_PRESET_SEGMENT[programSegments[0]] : undefined) ?? (segment || 'pharma');
  // A run names the open program when it is the one leading the canvas.
  const runProgramId = data?.openProgram?.state === 'lead' ? data.openProgram.programId : null;
  const suggest = program ? roSuggestForClient(program, seg, catalog) : null;

  // Real subscription tier comes from the overview; `tierOverride` is the local
  // "preview on another plan" control (canonical entitlement UX), not persisted.
  const [tierOverride, setTierOverride] = useState<string | null>(null);
  const realTier = data?.tier ?? 'standard';
  const tier = tierOverride ?? realTier;
  const previewing = tierOverride != null && tierOverride !== realTier;
  /* "Find a report": the words in the field stay there after a search, as in
     any search; the result is the router's answer to the last one. */
  const [query, setQuery] = useState('');
  const [found, setFoundState] = useState<FoundResult | null>(null);
  /* Which result is on screen. A run states its outcome in the result only if
     no later search, preset or tile has replaced the result meanwhile. */
  const foundSeq = useRef(0);
  const setFound = (next: FoundResult | null) => { foundSeq.current += 1; setFoundState(next); };
  /* Why the last run produced no report (a refusal, a missing role, a failed
     read), stated where the result is, never as an empty canvas. */
  const [runNote, setRunNote] = useState<string | null>(null);
  const fieldId = React.useId();
  const [report, setReport] = useState<RenderedReport | null>(null);
  // The governed run id behind the displayed report (report-os run), or null for
  // a re-shown report with no run. Drives the real finalize/seal on export.
  const [reportRunId, setReportRunId] = useState<number | null>(null);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, fireToast] = useToast();
  /* Every write under /api/report-os and /api/insights needs a writing role
     (requireEditorAccessForWrites). A viewer reads the canvas and is told,
     rather than offered runs the server will refuse. */
  const authUser = useAuthUser();
  const canWrite = canGovernedWrite(authUser);
  const canFinalize = canFinalizeReport(authUser);
  // The displayed run's signature and seal once finalized here, and whether the signing dialog is open.
  const [seal, setSeal] = useState<ReportSeal | null>(null);
  const [signing, setSigning] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setFound(null); setRunNote(null); setReport(null); setReportRunId(null); setSeal(null); setDashboard(null); }, [seg]);
  /* The result sits just above the field; keep it in view as it changes. */
  useEffect(() => { const el = scrollRef.current; if (el) el.scrollTop = el.scrollHeight; }, [found, runNote, busy]);

  const pushCanvasTop = () => { const el = canvasRef.current; if (el) el.scrollTop = 0; };

  /* Generate a report from the REAL governed backend. POST /api/report-os/runs
     computes + persists the run synchronously (no polling); GET /runs/:id/rendered
     returns the section/block document with the truthfulness gate applied
     (requestRun, fetchRenderedRun). The run id is tracked so the report can be
     exported and finalized. Any failure surfaces as an honest message — nothing
     is fabricated, and an unentitled/unknown type is stated, never estimated. */
  const runReport = async (type: ReportType): Promise<void> => {
    if (!program) return;
    /* The result said "Running the …" when the run began. Once the run ends it
       says what happened, so it never reports as current a run that finished or
       never started. A run that produced no report drops the result's sentence
       and the alert says why: one statement, not "Running" beside "wasn't run". */
    const mine = foundSeq.current;
    const settle = (next: FoundResult | null) => { if (foundSeq.current === mine) setFound(next); };
    const say = (text: string) => { settle(null); setRunNote(text); };
    setRunNote(null);
    if (!canWrite) {
      say(`"${type.label}" wasn't run. Running a report creates a governed record, which needs an editor role in this organization.`);
      return;
    }
    setBusy(true);
    setDashboard(null);
    try {
      const started = await requestRun(type, program, runProgramId);
      if ('note' in started) { say(started.note); return; }
      const adopted = await fetchRenderedRun(started.runId, type, program);
      if (!adopted) { say("The run completed but its rendered document didn't come back — reload and retry."); return; }
      setReport(adopted);
      setReportRunId(started.runId);
      setSeal(null);
      settle({ text: `The ${type.label} for ${program.code} ran against the governed record and is shown in the report canvas. Every value is computed from the governed record; none is originated here.` });
      pushCanvasTop();
    } finally {
      setBusy(false);
    }
  };

  /* A suggestion (an opener prompt, a result's choice) fills the field with the
     words it searches for, so the field always shows what the result answers. */
  const findReport = async (raw?: string) => {
    const text = (raw == null ? query : raw).trim();
    if (!text || busy || !program || !data) return;
    if (raw != null) setQuery(raw);
    setRunNote(null);
    // roRouteReply resolves intent, chips and the entitlement lock — all
    // deterministic. When it resolves a report type, generation goes to the REAL
    // backend via runReport, not to a client-built preview.
    const reply = roRouteReply(text, tier, { program, portfolio: data.portfolio, types: catalog, report });
    setFound({ text: reply.text, chips: reply.chips, locked: reply.locked, nav: reply.nav });
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
    setRunNote(null);
    setFound({ text: `${preset.label}: ${preset.why} Each tile runs a governed report against the live record; pick one to run it. Anything the plan has not unlocked shows as locked, never as an estimate.` });
    setDashboard({ kind: 'pack', label: preset.label, why: preset.why, types: preset.types });
    setReport(null);
    setReportRunId(null);
    pushCanvasTop();
  };

  /* Run a report from a pack tile (states it as the result, then generates). */
  const runFromTile = (type: ReportType) => {
    setFound({ text: `Running the ${type.label} for ${program?.code ?? 'this program'} against the governed record.` });
    void runReport(type);
  };

  /* ── Export is a read ───────────────────────────────────────────────────────
     "Export report" once only sealed the run and produced no file; then it
     sealed AND downloaded, so a click that read as "save a copy" finalized the
     run with no reason, meaning or re-authentication (reporting review
     2026-10-01). Export now does one thing: GET /runs/:id/export.pdf, the
     governed PDF of the STORED run (audited server-side as run_exported), saved
     through the canonical downloadBlob, whose false return is reported, never
     swallowed. Finalizing is its own signed act (ReportFinalizeModal). */
  const exportRep = async (rep: RenderedReport) => {
    if (reportRunId == null) { fireToast('Only a freshly-run governed report can be exported — run one first.', 'error'); return; }
    const saved = await downloadRunPdf(reportRunId, rep);
    fireToast(saved.text, saved.ok ? undefined : 'error');
  };

  const onSealed = (sealed: ReportSeal) => {
    setSeal(sealed);
    setReport(r => (r ? { ...r, status: 'final' } : r));
  };

  // Four-state render: loading → honest error → honest empty (no flagship
  // program) → the live canvas. No fixture stand-in in any state.
  if (overview.loading) {
    return (
      <div className="rc">
        <div className="rc-canvas" style={{ gridColumn: '1 / -1' }}>
          <EmptyState busy icon={I.barChart} title="Loading the reporting canvas…" />
        </div>
      </div>
    );
  }
  if (overview.error) {
    return (
      <div className="rc">
        <div className="rc-canvas" style={{ gridColumn: '1 / -1' }}>
          <ErrorState
            title="Couldn't load the reporting canvas"
            message="Your organization's plan, program readiness and portfolio rollup could not be read. Nothing is shown in their place."
            retry={() => setOverviewAttempt((n) => n + 1)}
          />
          {/* A failed read of the program canvas says nothing about the audit
              records, so the compliance reports stay one click away. */}
          <div style={{ marginTop: 12 }}>
            <button type="button" className="btn ghost" onClick={() => onNav && onNav('compliance-reports')}>Audit & compliance reports</button>
          </div>
        </div>
      </div>
    );
  }
  /* The open program could not lead: say so FOR that program. Falling through
     to the organisation's flagship is the defect this replaces. */
  const openState = data?.openProgram?.state;
  if (data && !program && (openState === 'unanchored' || openState === 'not-in-portfolio')) {
    const name = shellProgramName() ?? 'This program';
    return (
      <div className="rc">
        <div className="rc-canvas" style={{ gridColumn: '1 / -1' }}>
          <EmptyState
            icon={I.barChart || I.fileText}
            title={`${name} has no readiness or reports here yet`}
            hint={
              openState === 'unanchored'
                ? "Readiness and governed reports are computed over a program's project record, and this program has none. Nothing from another program is shown in its place."
                : "This program's project record is not among the programs whose readiness is computed for your organization (it may be archived or part of another program). Nothing from another program is shown in its place."
            }
            action={{ label: 'Audit & compliance reports', onAct: () => onNav && onNav('compliance-reports') }}
          />
        </div>
      </div>
    );
  }
  /* No program open: ask which, from the organisation's programs. The flagship
     stood in here, and with no readiness computed anywhere it was the lowest
     project id — every report and digest ran over project 1, a program nobody
     had chosen (QA 2026-10-08, j8). Choosing opens the program across the app,
     through the shell's one program channel, and the canvas then leads with it. */
  const choices = data?.programs ?? [];
  if (data && !program && !data.openProgram && choices.length > 0) {
    return (
      <div className="rc">
        <div className="rc-canvas" style={{ gridColumn: '1 / -1' }}>
          <div className="rc-empty" data-testid="rc-program-picker">
            <h2 className="rc-empty-h">Which program is the report for?</h2>
            <p className="rc-empty-s">Governed reports and the readiness digest run over one program. Choose it here; it opens across the app, as it does from Projects.</p>
            <div className="rc-empty-presets" role="group" aria-label="Programs">
              {choices.map((pr) => (
                <button
                  key={pr.programId}
                  type="button"
                  className="rc-empty-preset"
                  onClick={() => publishShellProject({ id: pr.programId, title: pr.label, ...(pr.code ? { code: pr.code } : {}) })}
                >
                  <div className="rc-ep-h">{pr.code ?? pr.label}</div>
                  {pr.code ? <div className="rc-ep-s">{pr.label}</div> : null}
                </button>
              ))}
            </div>
            <div style={{ marginTop: 12 }}>
              <button type="button" className="btn ghost" onClick={() => onNav && onNav('compliance-reports')}>Audit & compliance reports</button>
            </div>
          </div>
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
            hint="Once a program with a governed readiness run exists in your organization, the reporting canvas opens here — the program's readiness, the portfolio rollup, and every governed report, computed from the governed record. Nothing is estimated."
            /* Audit and compliance reports read the organisation's own records,
               not a program, so they stay reachable before any program exists. */
            action={{ label: 'Audit & compliance reports', onAct: () => onNav && onNav('compliance-reports') }}
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
           them.

           It also kept the SHAPE of a conversation: the person's words echoed
           in a bubble, the answer in a bubble beside AnA's mark (the blue
           asterisk), three dots while it "typed". There is one AnA, and she is
           the conversation; a bubble beside her mark credits her with what a
           router chose. So the pane is now what it is (FILING_SPINE F6): a
           field labelled "Find a report", a Find button, and one result that
           the next search replaces. `roRouteReply` is still its router. -- */}
      <div className="rc-ana">
        <div className="rc-ana-head">
          <div className="rc-ana-id"><div><div className="nm">Report builder</div><div className="sub">{[p.code, p.filing, SEG_LABEL[seg] || seg].filter(Boolean).join(' — ')}</div></div></div>
          {/* The organisation-wide audit and compliance reports live on their own
              surface; this is the quiet way there from the program canvas. */}
          <button type="button" className="pj-card-h-go" onClick={() => onNav && onNav('compliance-reports')}>Audit & compliance reports</button>
        </div>

        <div className="rc-ana-scroll" ref={scrollRef}>
          {!canWrite && (
            <div className="ro-dash-note" role="note" data-testid="rc-view-only">
              {I.lock} View only. Running a governed report needs an editor role in this organization.
            </div>
          )}
          {/* Opener. The program facts below are live; the preset is a static
              per-segment default, and says so. */}
          <div className="rc-opener">
            <div className="ro-rep-eyebrow">Where to start</div>
            <div className="rc-op-headline">{suggest.headline}</div>
            <div className="rc-op-body">{suggest.body}</div>
            {suggest.preset && (
              <>
                <button className="rc-preset-btn" onClick={() => suggest.preset && buildPreset(suggest.preset)}>{I.barChart} Build the {suggest.preset.label} {I.right}</button>
                <div className="rc-op-why">{suggest.preset.why}</div>
              </>
            )}
            <div className="rc-chips">
              {suggest.prompts.map((q, i) => (<button key={i} className="rc-chip" onClick={() => findReport(q)}>{q}</button>))}
            </div>
          </div>

          {/* The result of the last search: the router's words, the choices it
              offers and the plan lock, in one section the next search replaces.
              Not a thread: the searched words stay in the field below. The
              section and its live region stay mounted, empty until the first
              search, so the first result is announced too (a live region
              inserted already holding its text is often not read). It is named
              "Result", a region, only while it holds one. */}
          <section aria-label={found ? 'Result' : undefined} data-testid="rc-find-result" data-empty={found ? undefined : 'true'}>
            {found && <div className="ro-rep-eyebrow">Result</div>}
            <p className="rc-op-body" role="status" style={found ? undefined : { margin: 0 }}>{found?.text ?? ''}</p>
            {found?.locked && (
              <div className="rc-lock">
                <div className="rc-lock-h">{I.lock} {tierLabel(found.locked.requiredTier)} plan unlocks {found.locked.typeLabel}</div>
                <div className="rc-lock-s">{RO_FEATURE_LABEL[found.locked.feature]} is a paid capability. No estimated result is shown on a plan that has not unlocked the governed model.</div>
                <div className="rc-lock-acts">
                  <button className="rc-lock-up" onClick={() => onNav && onNav('licensing')}>See plans {I.right}</button>
                  <button className="rc-chip" onClick={() => setTierOverride(found.locked!.requiredTier)}>Preview on {tierLabel(found.locked.requiredTier)}</button>
                </div>
              </div>
            )}
            {found?.chips && found.chips.length ? <div className="rc-chips">{found.chips.map((c, ci) => (<button key={ci} className="rc-chip" onClick={() => findReport(c[1])}>{c[0]}</button>))}</div> : null}
            {found?.nav ? <div className="rc-chips"><button type="button" className="rc-chip" onClick={() => { if (found.nav && onNav) onNav(found.nav.surface); }}>{found.nav.label}</button></div> : null}
          </section>
          {/* A run in flight is a sentence in a status region. It was three
              pulsing dots beside AnA's mark, which is how a chat says "typing". */}
          {busy && <div className="ro-dash-note" role="status">{I.clock} Running the report…</div>}
          {runNote && !busy && <div className="ro-dash-note" role="alert">{I.alertTriangle} {runNote}</div>}
        </div>

        {/* Find a report, and the plan it is read against */}
        <div className="rc-composer">
          <div className="rc-tier" role="group" aria-label="Subscription tier">
            <span className="rc-tier-lbl">Plan</span>
            {RO_TIERS.map(t => (<button key={t.id} className={'rc-tier-b' + (tier === t.id ? ' on' : '')} aria-pressed={tier === t.id} onClick={() => setTierOverride(t.id)}>{t.label}</button>))}
          </div>
          {/* A preview looked exactly like the organisation's plan (reporting
              review 2026-10-01). It says it is one, and names the real plan. */}
          {previewing && (
            <div className="ro-dash-note" role="status" data-testid="rc-tier-preview">
              {I.info} Previewing {tierLabel(tier)}. Your organization's plan is {tierLabel(realTier)}.{' '}
              <button type="button" className="rc-chip" onClick={() => setTierOverride(null)}>Back to {tierLabel(realTier)}</button>
            </div>
          )}
          <label className="gov-label" htmlFor={fieldId} style={{ display: 'block', marginBottom: 5 }}>Find a report</label>
          <div className="rc-input">
            {/* One line: Enter finds, as the button does. The words stay after a
                search, so the field always says what the result answers. */}
            <textarea id={fieldId} rows={1} value={query} placeholder={`A report type, market or question for ${p.code}`}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void findReport(); } }} />
            <button type="button" className="btn primary" disabled={!query.trim() || busy} onClick={() => void findReport()}>Find</button>
          </div>
          <div className="rc-guardrail">{I.shieldCheck} {RO_GUARDRAIL}</div>
        </div>
      </div>

      {/* -- Right: the report / dashboard artifact -- */}
      <div className="rc-canvas" ref={canvasRef}>
        {report ? <ROReport
            report={report}
            onExport={exportRep}
            onFinalize={canFinalize && reportRunId != null && report.status !== 'final' ? () => setSigning(true) : undefined}
            seal={seal}
          />
          : dashboard ? <RODashboard dashboard={dashboard} tier={tier} onRun={runFromTile} canRun={canWrite} scope={p.scope} catalog={catalog} />
          : (
            <div className="rc-empty">
              {/* "AnA builds the report" and "a pack AnA suggests … based on
                  your whole portfolio" were the same two claims as the opener:
                  a persona for a template matcher, and a portfolio-derived
                  recommendation for `roPresetsForSeg(seg)`, which reads neither
                  the portfolio nor the program. */}
              <h2 className="rc-empty-h">Governed reports, built to order.</h2>
              <p className="rc-empty-s">Find a report on the left, or start from one of the standard packs for {p.code}. Every value is computed from the governed record; nothing is estimated.</p>
              <div className="rc-empty-presets">
                {roPresetsForSeg(seg, catalog).map(pr => (
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
      {signing && report && reportRunId != null && (
        <ReportFinalizeModal runId={reportRunId} report={report} onClose={() => setSigning(false)} onSealed={onSealed} />
      )}
      <C2CToast msg={toast} />
    </div>
  );
}
