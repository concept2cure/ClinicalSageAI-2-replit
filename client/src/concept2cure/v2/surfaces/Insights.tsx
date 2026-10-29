import React, { useState, useRef, useEffect } from 'react';
import { useSearch } from 'wouter';
import { I } from '../icons';
import { useLiveData, EmptyState, ErrorState } from '../dataConnect';
import { apiRequest, errorCodeOf, serverMessage } from '@/lib/queryClient';
import { downloadBlob, safeFileName } from '../download';
import { getOrgId } from '@/utils/authToken';
import { authService, useAuthUser } from '@/services/portal/authService';
import { captureAuthoringSession, useAuthoringReadSession } from '../editor/authoringCurrentRead';
import { canFinalizeReport, canGovernedWrite } from '@shared/constants/permissions';
import { readinessPredicate, readinessQualifier } from '@shared/regulatory/readiness-statement';
import { EsignModal, esignSignerOf, type EsigSignedManifest } from '../../_shared/components/EsignModal';
import { GovernedTimestamp } from '../../_shared/components/GovernedTimestamp';
import type { EsigMeaning } from '../../hooks/useEsignature';
import type { OwnedSurfaceViewProps } from '../surfaceViews';
import { publishShellProject, shellProgramId, shellProgramName, useShellProject } from '../shellProject';
import '../styles/project-home-v2.css';
import '../styles/insights-v2.css';
import { C2CToast, useToast } from '../toast';
import { BundlesPanel } from './InsightsBundlesPanel';
import { useLibraryActions } from './insightsLibraryActions';
import { CatalogPanel, COUNTS_NOT_NARROWED, ORGANIZATION_WIDE_RECORDS, OrganizationCountsNote, countsAreOrganizationWide } from './InsightsCatalogPanel';
import { RunsPanel } from './InsightsRunsPanel';
import { SchedulesPanel } from './InsightsSchedulesPanel';
import { RunEvidence } from './InsightsRunEvidence';
import { LIBRARY_VIEWS, type LibraryReportType, type LibraryView } from './insightsLibraryShared';
import type { BundlePdfContent, ReportRunRow } from './insightsLibraryModel';
import { getSurfaceMeta } from '../registryModel';

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

/** A report-os scope (shared/schema/report-os.ts reportScopeEnum) in a reader's
 *  words. `program` is a report program group, a group of projects, not one
 *  project; it printed as the raw enum, "program" (decision 12). */
const SCOPE_WORD: Record<string, string> = {
  account: 'account', program: 'project group', project: 'project', study: 'study', submission: 'submission', document: 'document',
};
const scopeWord = (s: string) => SCOPE_WORD[s] ?? s;
const REPORT_PLAN_UNVERIFIED = "Your organization's plan could not be verified. Running reports is unavailable until it can be verified.";
const REPORT_ACCESS_CHANGED = 'Your reporting session or access changed. Reopen the report from Run history before continuing.';
const REPORT_WRITE_UNCONFIRMED = 'The report request outcome could not be confirmed. It may have completed. Check Run history before starting another request.';
const REPORT_NOT_SAVED_CODES = new Set(['REPORT_RUN_NOT_RECORDED', 'PROJECT_ACCESS_UNAVAILABLE', 'PROJECT_ACCESS_CHANGED']);

/** A tier's display name. */
function tierLabel(id: string): string {
  if (id === 'free') return 'Free';
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
  /** The scopes an engine actually computes it over — a subset of `scopes`
   *  (server CanvasReportType.computedScopes), empty when none does. */
  computedScopes: string[];
  segments: string[];
  t: { allowPartial?: boolean; requireBlockers?: boolean; requireConfidence?: boolean; requireExplicitGaps?: boolean; forbidFinal?: boolean; requireDisclosure?: boolean };
  /** An engine computes it over a program; otherwise it is shown as not computed and never run. */
  runnable: boolean;
  entitled?: boolean;
  requiredTier?: string;
  region?: string | null;
  allowedPersonas?: string[];
  computedScope?: string | null;
  availabilityReason?: string | null;
  reasonCode?: string | null;
  availabilityState?: LibraryReportType['availabilityState'];
  runScopeType?: string | null;
  runScopeId?: string | null;
}

/** The overview's catalog row (server insights-canvas-routes.ts CanvasReportType). */
interface CanvasReportType {
  typeId: string;
  label: string;
  family: string;
  allowedScopes?: string[];
  computedScopes?: string[];
  allowedClientSegments?: string[];
  truthfulnessRules?: Record<string, unknown>;
  runnable?: boolean;
  entitled?: boolean;
  requiredTier?: string;
  region?: string | null;
  allowedPersonas?: string[];
  computedScope?: string | null;
  availabilityReason?: string | null;
  reasonCode?: string | null;
  availabilityState?: LibraryReportType['availabilityState'];
  runScopeType?: string | null;
  runScopeId?: string | null;
}

/** The server catalog as the canvas reads it. A row without `runnable: true` is not run. */
function catalogFrom(rows: CanvasReportType[] | undefined): ReportType[] {
  return (rows ?? []).map((r) => ({
    typeId: r.typeId,
    label: r.label,
    family: r.family,
    scopes: r.allowedScopes ?? [],
    /* An older server answers no `computedScopes`. The declared scopes are then
       all that is known, and saying "runs over" of them is the claim this field
       exists to drop — so with none, the card says nothing about where it runs
       rather than repeating the declaration. */
    computedScopes: r.computedScopes ?? [],
    segments: r.allowedClientSegments ?? [],
    t: (r.truthfulnessRules ?? {}) as ReportType['t'],
    runnable: r.runnable === true,
    entitled: typeof r.entitled === 'boolean' ? r.entitled : undefined,
    requiredTier: typeof r.requiredTier === 'string' ? r.requiredTier : undefined,
    region: r.region,
    allowedPersonas: r.allowedPersonas,
    computedScope: r.computedScope,
    availabilityReason: r.availabilityReason,
    reasonCode: r.reasonCode,
    availabilityState: r.availabilityState,
    runScopeType: r.runScopeType,
    runScopeId: r.runScopeId,
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
  // Filing and agency come from authorized recorded registry metadata.
  // Missing/unverifiable context and the unsourced action date stay null.
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
   the org's real subscription tier, derived segments, selected program's
   governed readiness and enterprise-gated portfolio rollup. Filing and agency
   arrive only after server admission of recorded metadata; PDUFA stays null. */
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
  registryId?: string | null;
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
  programId?: string | null;
  topBlockers?: string[];
}
interface CanvasPortfolio {
  dataScope?: string;
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
  dataScope?: string;
  tier: string;
  /** Whether `tier` was read, or assumed after a failed capability lookup
   *  (server entitlement-map.ts). Absent on a server that predates the flag,
   *  which is read as resolved — the flag only ever withdraws a claim. */
  tierResolved?: boolean;
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
  return 'This project';
}

/** Map the admitted selected program; recorded labels and nulls stay intact. */
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
  const rank = (t: string) => t === 'free' ? -1 : (RO_TIERS.find(x => x.id === t) || { rank: 0 }).rank;
  return { entitled: rank(tier) >= rank(required), feature, requiredTier: required };
}

function actualReportDecision(type: Pick<ReportType, 'typeId' | 'family' | 'entitled' | 'requiredTier'>, tier: string) {
  const decision = roDecide(type.typeId, type.family, tier);
  return { ...decision, entitled: decision.entitled && type.entitled !== false, requiredTier: type.requiredTier || decision.requiredTier };
}

function actualPlanReason(decision: ReturnType<typeof roDecide>, tier: string): string {
  return `Your current ${tierLabel(tier)} plan does not unlock this report. Its recorded requirement is the ${tierLabel(decision.requiredTier)} plan. Previewing another plan does not grant execution.`;
}

/* ── Presets per segment ── */
/** A pack as the canvas offers it: the reports it holds and its description. */
interface Preset {
  id: string;
  label: string;
  types: string[];
  why: string;
}

/** A pack as defined: what it is for, in words that name no report. */
interface PresetDef {
  id: string;
  label: string;
  types: string[];
  purpose: string;
}

/* A preset describes what the PACK contains — never what the reader's filing is
   doing. Two of these opened by asserting a state nobody had checked ("Your NDA
   is in agency review", "Your BLA is mid-assembly"), printed verbatim to an org
   whose own home surface correctly reported no programs at all. The live facts
   are stated separately by roSuggestForClient, from the readiness model; a
   static string is not entitled to claim any of them. Guarded by
   insightsHonestCopy.test.ts.

   A pack's description names only the reports it computes (follow-up decision
   "Pack copy", docs/LAUNCH_DEFINITION_OF_DONE.md). The descriptions were
   written for every member, and after packs kept only their runnable members
   (aac603a1b) the pre-approval pack, holding the readiness digest alone, still
   promised safety-signal alignment and audit assurance. So `purpose` names no
   report, and roPresetsForSeg names the reports the pack holds, by their
   catalog labels, after the runnable filter. Guarded by
   insightsReportsRunWhatTheyName.test.tsx (1b). */
const RO_PRESETS: Record<string, PresetDef[]> = {
  pharma: [
    { id: 'preapproval', label: 'Pre-approval command pack', types: ['readiness.executive_digest', 'ema.rmp_psur_signal_alignment', 'compliance.audit_assurance_pack'], purpose: 'For the run-up to an action date.' },
    { id: 'globalfile', label: 'Global filing harmonization', types: ['ema.maa_readiness_assessment', 'china_nmpa.ctd_module_gap_analysis', 'provenance.evidence_trace_report'], purpose: 'For reusing the US dossier in other regions.' },
  ],
  biotech: [
    { id: 'blaassembly', label: 'BLA assembly pack', types: ['readiness.executive_digest', 'provenance.evidence_trace_report', 'fcoi.disclosure_register'], purpose: 'For closing gaps before a BLA is filed.' },
    { id: 'nonclin', label: 'Nonclinical & CMC readiness', types: ['nonclinical.study_send_register', 'compliance.audit_assurance_pack'], purpose: 'For confirming Module 4 is submission-grade.' },
  ],
  medtech: [
    { id: 'clearance', label: '510(k) clearance pack', types: ['usa_fda.estar_510k_equivalence_matrix', 'inspection.readiness_pack', 'compliance.audit_assurance_pack'], purpose: 'For keeping a 510(k) and the quality system ready for review.' },
  ],
  diagnostics: [
    { id: 'ivdperf', label: 'IVD performance & clearance pack', types: ['usa_fda.estar_510k_equivalence_matrix', 'inspection.readiness_pack', 'provenance.evidence_trace_report'], purpose: 'For an IVD 510(k) and the claims it rests on.' },
  ],
  cro: [
    { id: 'sponsor', label: 'Sponsor oversight pack', types: ['etmf.completeness_pack', 'inspection.readiness_pack'], purpose: 'For oversight across the sponsors and sites you run.' },
  ],
  academic: [
    { id: 'researchadmin', label: 'Research administration pack', types: ['research_admin.scorecard', 'irb.submission_register', 'iacuc.protocol_register', 'effort.certification_register'], purpose: 'For keeping approvals from lapsing across your studies.' },
  ],
  health: [
    { id: 'oversight', label: 'Portfolio oversight pack', types: ['readiness.executive_digest', 'compliance.audit_assurance_pack', 'inspection.readiness_pack'], purpose: 'For the projects you oversee.' },
  ],
};

/** "the A", "the A and the B", "the A, the B and the C". */
function roNamedList(labels: string[]): string {
  const named = labels.map((label) => `the ${label}`);
  if (named.length < 2) return named.join('');
  return `${named.slice(0, -1).join(', ')} and ${named[named.length - 1]}`;
}

/** The standard packs for a segment, each holding only the reports this
 *  program's catalog computes; a pack left with none is not offered. P-26
 *  (2026-10-08): packs list only types an engine computes. The engine-less
 *  ones are listed once, as not computed in this release (roNotComputed), not
 *  as tiles inside packs. Each description is the pack's purpose and the
 *  reports it holds, by their catalog labels, so it names no other. */
function roPresetsForSeg(seg: string, types: ReportType[]): Preset[] {
  const runs = new Map(types.filter((t) => t.runnable).map((t) => [t.typeId, t.label] as const));
  return (RO_PRESETS[seg] || RO_PRESETS.pharma)
    .map(({ purpose, ...p }) => {
      const held = p.types.filter((id) => runs.has(id));
      return { ...p, types: held, why: `${purpose} It holds ${roNamedList(held.map((id) => runs.get(id) ?? id))}.` };
    })
    .filter((p) => p.types.length > 0);
}

/** The program's catalog types no engine computes, by label, each once. */
function roNotComputed(types: ReportType[]): string[] {
  return [...new Set(types.filter((t) => !t.runnable && !t.computedScopes.length).map((t) => t.label))];
}

/* ── Guardrail ──
   The old text read "AnA narrates and explains report outputs…". Two things
   were wrong with it. AnA is not what answers here — `roRouteReply` is a
   deterministic intent router that composes its text from the constants in this
   file — and "narrates and explains" describes a language model doing work that
   a `switch` is doing. The half that was true, and the half that matters, is
   that no metric on this surface originates here. */
const RO_GUARDRAIL = 'Find a report matches your words to an available governed report type and runs it; it does not answer in its own words. Metrics and scores come from recorded inputs and canonical providers; none is originated here. Prediction definitions remain unavailable as governed runs; no validated prediction model is part of this release.';

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
interface PortfolioRow extends Omit<CanvasPortfolioProgram, 'code'> { code: string }
function roPortfolioFrom(programs: CanvasPortfolioProgram[]): PortfolioRow[] {
  return programs.map(p => ({ ...p, code: programName(p) }));
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
  /* THE WORD "READY" IS NOT THE SERVER'S TO GIVE AWAY.
     This read `${p.code} is ${p.readiness}% ready` off the score alone. For a
     filing type with no resolved required-artifact matrix the score is section
     completion only and the run carries a `critical` gap saying so, so a
     project with every section drafted arrived as `readiness: 100,
     criticalBlockerCount: 1, status: 'missing'` and the canvas opened with
     "BX-204 is 100% ready" (HS-1008-1). That is the refuse-to-accept trap
     stated as reassurance: the figure was right and the sentence was not.
     `readinessPredicate` is the one place that decision is made — see
     shared/regulatory/readiness-statement.ts. */
  const rBit = p.readiness == null
    ? (p.filing ? `${p.code} is in ${p.filing} preparation` : `${p.code}'s submission readiness is not yet computed`)
    : `${p.code} ${readinessPredicate(p)}`;
  const pduBit = p.pdufa ? ` Its target action date is ${p.pdufa}.` : '';
  /* The third prompt was "Run the audit assurance pack" or "Show the 510(k)
     equivalence matrix", chosen by the shell's segment preference: the 510(k)
     prompt was offered to a biologic program, and neither report has an engine
     (QA 2026-10-08, j8). The prompts now name only what runs here. */
  return {
    headline: 'Build any governed report or dashboard — describe what you need.',
    body: preset
      ? `${rBit}.${pduBit} The ${preset.label} is the standard starting pack for ${SEG_LABEL[seg] || seg} — it is not picked from the readiness figure above.`
      : `${rBit}.${pduBit}`,
    preset,
    prompts: [
      ...(preset ? [`Build the ${preset.label}`] : []),
      p.readiness != null ? `How ready is ${p.code} to file?` : `Generate the Executive Readiness Digest for ${p.code}`,
      `What reports can you run for ${p.code}?`,
      'Compare readiness across all my projects',
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
  /** The data boundary its engine computed (server RenderedReport.computedScope): a
   *  register run at project scope still counts the organization's records. */
  computedScope?: string;
  generatedAt: string;
  status: string;
  truthfulness: { allowedStatus: string; downgradedFrom?: string; reasons: string[] };
  sections: ROSection[];
}

/**
 * Why a report is held at its status — the clause after "is held at <status>".
 *
 * PURE, and separate from the router so the sentence can be tested without
 * driving the canvas (the idiom roPortfolioCovers set in this file).
 *
 * "Those are the gate's own reasons, verbatim" used to print over an empty
 * list (HS-1008-3, honest-state review 2026-10-08). A run held at `partial` by
 * outstanding blockers has `truthfulness.reasons == []`, because the gate
 * records a reason only when it downgraded a status that was asked for. The
 * reply read '"X" is held at partial because: . Those are the gate's own
 * reasons, verbatim.' — naming no cause while claiming to quote one.
 *
 * So: quote whichever list the record actually holds, and say which list it is.
 * When neither holds anything, say that, rather than introducing nothing as a
 * quotation.
 */
export function roHeldBecause(reasons: string[], blockers: string[]): string {
  const promote = 'Clear them and it can promote toward final; the status gate is deterministic.';
  if (reasons.length) {
    return `because: ${reasons.join('; ')}. Those are the gate's own reasons, verbatim. ${promote}`;
  }
  if (blockers.length) {
    return (
      `while these blockers stand: ${blockers.join('; ')}. The truthfulness gate ` +
      `recorded no reason of its own — that is the run's blocker list, which is ` +
      `what holds the status. ${promote}`
    );
  }
  return (
    'and neither the truthfulness gate nor the run records a cause. Nothing in ' +
    'the governed record explains this status, so none is offered here.'
  );
}

/**
 * The report's own blockers, read off its rendered blockers section.
 *
 * The server builds that section from the run's `blockers` (render.ts), so this
 * is the document's own list and not a second derivation of it. Absent when the
 * run had none — the section is only pushed when it is non-empty.
 */
function roBlockersOf(rep: RenderedReport): string[] {
  const section = (rep.sections || []).find(sec => sec.id === 'blockers');
  if (!section) return [];
  return (section.blocks || [])
    .filter(b => b.kind === 'blocker-list')
    .flatMap(b => (b.items || []).map(item => String(item)))
    .map(item => item.trim())
    .filter(Boolean);
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
  /**
   * The server capped the rollup and there are more programs than these.
   *
   * `portfolio/fetch.ts` reads `ORG_ROLLUP_CAP + 1` rows and sets `truncated`
   * when it got more than the cap (100). The flag reached the client type and
   * was never rendered, so an organisation with more than 100 programs saw
   * "100 programs · avg readiness N%" presented as its portfolio, with the
   * average taken over the first hundred. A capped board that does not say so
   * is a silent cap on a governed figure.
   */
  truncated?: boolean;
  dataScope?: string;
}

/**
 * What a portfolio reply covers: all of them, or the first N of more.
 *
 * PURE, and separate from the router so the sentence can be tested without
 * driving the canvas. `portfolio/fetch.ts` caps the rollup at
 * `ORG_ROLLUP_CAP` (100) and reads one row past it to set `truncated`; a reply
 * that said "across your 100 programs" to an organisation with 150 would be a
 * silent cap on the figure an executive reads as their position.
 */
function portfolioScopeText(dataScope: string | undefined): string {
  return dataScope === 'accessible_projects' ? 'projects you can access' : 'projects shown on this board';
}
function roPortfolioCovers(count: number, truncated: boolean, dataScope?: string): string {
  const scopeText = count === 1 ? portfolioScopeText(dataScope).replace(/^projects/, 'project') : portfolioScopeText(dataScope);
  if (truncated) {
    /* NOT "the highest-ranked": fetchOrgPrograms selects `ORG_ROLLUP_CAP + 1`
       rows with no ORDER BY, and attentionRanked sorts only within whatever
       hundred came back. Calling them the top programmes would promise a
       selection the query does not make, and would read as "nothing worse than
       this exists". */
    return `${count} of the ${scopeText} — there are more, and these are not a ranked selection.`;
  }
  return `Readiness across ${count} ${scopeText}.`;
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
    if (rows.length === 0) return { tool: name, text: `Your plan unlocks the portfolio rollup, but there are no governed projects to roll up yet. Once a project with a readiness run exists in your organization, its board view appears here.`, report: null, dashboard: null };
    const truncated = ctx.portfolio.summary?.truncated === true;
    return { tool: name, text: `${roPortfolioCovers(rows.length, truncated, ctx.portfolio.dataScope)} The numbers are the governed readiness scores, ranked — not recomputed here.`, dashboard: { kind: 'portfolio', label: 'Portfolio readiness', why: portfolioScopeText(ctx.portfolio.dataScope), rows, truncated, dataScope: ctx.portfolio.dataScope }, report: null };
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
    const held = roHeldBecause(reasons, roBlockersOf(rep));
    return { tool: name, text: `"${rep.reportTypeLabel}" is held at ${rep.status} ${held}`, report: rep, dashboard: null };
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
      text: `${resolved.availabilityReason || `No engine computes the ${resolved.label} in this release, so it is not run.`} No other report is shown under its name.${alt.length ? ` These run for ${p.code}:` : ''}`,
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

/** A spec field as a number, or null when the spec does not carry one.
 *
 *  `Number(x) || 0` reads an absent field, a null and a NaN as zero, which is
 *  how a ring with no value drew an empty ring labelled "0 of 100" — the
 *  not-computed-as-zero defect the rest of this surface was fixed for. A
 *  genuine 0 survives this; nothing else does. */
export function roSpecNum(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

/** What a chart says when its spec does not carry the series it draws. */
function ROChartNoData({ label }: { label: string }) {
  return <div className="ro-svg-cap">{label} — no series data. Connect the live provider.</div>;
}

function ROChart({ chartType, spec }: { chartType: string; spec: Record<string, unknown> }) {
  const s = spec || {};
  if (chartType === 'readiness_ring') {
    const raw = roSpecNum(s.value);
    if (raw === null) return <ROChartNoData label={(s.label as string) || 'Readiness'} />;
    const v = Math.max(0, Math.min(100, raw));
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
    // An anchor is one observation, not a forecast trajectory or interval.
    return <div className="ro-svg-cap">{(s.label as string) || 'Trajectory'} — no measured forecast series is recorded.</div>;
  }
  if (chartType === 'trend') {
    /* The fallback was the literal series [62, 66, 64, 70, 73]: a rising line
       drawn for any report whose spec carried no points (HS-1008-5). Fixture
       data in a governed path is exactly what this repository forbids. */
    const points = Array.isArray(s.points) ? (s.points as unknown[]).map(roSpecNum) : null;
    if (!points || points.length < 2 || points.some(n => n === null)) {
      return <ROChartNoData label={(s.label as string) || 'Trend'} />;
    }
    const d = points as number[];
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
  return { fam: RO_FAMILY[report.family ?? ''] || {}, scope: report.scopeLabel ?? 'This project' };
}

/** The run is headed by a project (or program, or submission) while its engine
 *  counted the organization's records: the run's own carried `computedScope`,
 *  never the type id. An account run is already headed as the organization. */
function ROReport({ report, onExport, onFinalize, seal, runId, exporting = false }: {
  report: RenderedReport;
  onExport: (r: RenderedReport) => void;
  /** Offered only to a role that may finalize, on a run that is not final. */
  onFinalize?: () => void;
  seal?: ReportSeal | null;
  /** The governed run behind the report, when there is one. It unlocks the
   *  evidence disclosure: GET /runs/:id/seal re-verifies the sealing act and
   *  GET /runs/:id/dependencies says what the run read. Both were callable all
   *  along — inside the prefix this surface already claims — and neither had a
   *  caller, so a sealed report re-opened from the history showed no evidence
   *  at all (see InsightsRunEvidence.tsx). */
  runId?: number | null;
  exporting?: boolean;
}) {
  if (!report) return null;
  const { fam, scope } = reportHeading(report);
  const stTone = report.status === 'final' ? 'ok' : report.status === 'partial' ? 'warn' : 'idle';
  /* Every section, always. A `compact` prop used to truncate this to
     `sections.slice(0, 2)` with no note, and suppress the actions and the
     evidence disclosure with it — so the first two sections of a GOVERNED
     report would have rendered as the report, silently, the moment any caller
     passed it. No caller ever did (the single call site omits it), and the
     working agreement's answer for an unreachable path whose replacement is the
     full view at that same call site is to remove it rather than leave a second
     dormant branch to be switched on by accident (coverage review S-3). */
  const sections = report.sections;
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
        {/* The project's name above the organization's counts says which they are. */}
        {countsAreOrganizationWide(report) && <div role="note" data-testid="ro-scope-org"><OrganizationCountsNote className="ro-rep-meta" /></div>}
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
      <ROReportActions report={report} onExport={onExport} onFinalize={onFinalize} exporting={exporting} />
      {runId != null && <RunEvidence runId={runId} />}
    </div>
  );
}

/* ── RODashboard ── */
function PlanUnavailableCard({ type, family, reason = REPORT_PLAN_UNVERIFIED }: { type: ReportType; family?: string; reason?: string }) {
  return (
    <div className="ro-pack-card is-locked">
      <div className="ro-pack-fam">{family}</div>
      <div className="ro-pack-title">{type.label}</div>
      <div className="ro-pack-sub">{reason}</div>
    </div>
  );
}

/* Tiles no longer pre-generate a report client-side (that was the mock KPI
   preview). Each tile runs the REAL governed report on click. A type whose
   engine counts the organization's records says so, as its catalog card does,
   from the catalog's `computedScope` (D2, 2026-10-29). */
function RunPackTile({ type, fam, onRun }: { type: ReportType; fam: { label?: string; region?: string }; onRun: (t: ReportType) => void }) {
  return (
    <button className="ro-pack-card" onClick={() => onRun && onRun(type)}>
      <div className="ro-pack-fam">{fam.label}{fam.region ? <span className="ro-region">{fam.region}</span> : null}</div>
      <div className="ro-pack-title">{type.label}</div>
      {type.computedScope === 'organization' && <OrganizationCountsNote className="ro-pack-sub" />}
      <div className="ro-pack-kpi"><span className="v">--</span><span className="l">governed report</span></div>
      <div className="ro-pack-open">Run report {I.right}</div>
    </button>
  );
}

/* `onAsk` is gone from here too — it was declared, threaded down from the
   canvas and never called once in the whole component. */
function RODashboard({ dashboard, tier, actualTier, tierResolved, onRun, canRun, scope, catalog, onOpenProgram }: { dashboard: DashboardData; tier: string; actualTier: string; tierResolved: boolean; onRun: (t: ReportType) => void; canRun: boolean; scope: string; catalog: ReportType[]; onOpenProgram?: (r: PortfolioRow) => void }) {
  if (!dashboard) return null;

  if (dashboard.kind === 'portfolio') {
    const rows = dashboard.rows || [];
    /* Readiness is null for a program none was computed for. The average is
       over the computed ones only, and states nothing when there are none. */
    const known = rows.filter((r) => r.readiness != null).map((r) => r.readiness as number);
    const avg = known.length ? Math.round(known.reduce((a, v) => a + v, 0) / known.length) : null;
    return (
      <div className="ro-dash">
        <div className="ro-dash-head"><div><div className="ro-rep-eyebrow">Portfolio — board view</div><h2 className="ro-rep-title">{dashboard.label}</h2><div className="ro-rep-meta">{/* A capped board says it is capped, here, beside the count it caps. */}<span>{dashboard.truncated ? `first ${rows.length} projects` : `${rows.length} projects`}</span>{avg == null ? <span className="ro-status">readiness not computed</span> : <span className="ro-status">avg readiness {avg}%{known.length < rows.length ? ` · ${rows.length - known.length} not computed` : ''}</span>}</div></div></div>
        <div className="ro-port-grid">
          {rows.map((r, i) => {
            const content = <>{r.readiness == null
              ? <div className="ro-port-ind" role="note">Readiness not computed</div>
              : <ROChart chartType="readiness_ring" spec={{ value: r.readiness, label: '' }} />}
              <div className="ro-port-b"><div className="ro-port-code">{r.code}</div><div className="ro-port-ind">{r.indication}</div><div className="ro-port-filing">{r.status || 'Status not recorded'}{r.riskLevel ? ` · ${r.riskLevel} risk` : ''}{typeof r.criticalBlockerCount === 'number' ? ` · ${r.criticalBlockerCount} critical blocker${r.criticalBlockerCount === 1 ? '' : 's'}` : ''}</div>{r.topBlockers?.map((blocker, n) => <div key={n} className="ro-port-ind">{blocker}</div>)}</div></>;
            return r.programId && onOpenProgram ? <button key={r.programId} type="button" className="ro-port-card ro-port-open" aria-label={`Open ${r.code}`} onClick={() => onOpenProgram(r)}>{content}</button> : <div key={r.projectId ?? i} className="ro-port-card">{content}</div>;
          })}
        </div>
        <div className="ro-dash-note">{I.info} This board covers {portfolioScopeText(dashboard.dataScope)}. Readiness values are the governed scores per project, in the order the server ranked them. The average is taken here, over the projects that have one.</div>
        {/* The server read one row past its cap to detect this; saying nothing
            would present a hundred-program board as the whole portfolio and an
            average over it as the organisation's. */}
        {dashboard.truncated && (
          <div className="ro-dash-note" role="status" data-testid="ro-port-truncated">
            {I.alertTriangle} The returned portfolio has more projects than this board shows. The rollup is capped
            at {rows.length}, and the server selects them without an ordering — so these are not the
            highest-risk or least-ready ones, and the average above is over them only, not over your whole
            returned portfolio.
          </div>
        )}
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
       governed record could actually fill per market, and they are all empty.

       2026-10-12: the `regional` engine computes a market's Module 1 content
       gaps (services/report-os/regional/filing-readiness.ts), so the old note
       here — "connect the live regional providers to populate the deltas" — now
       names work that is done and still would not fill this grid, which makes
       it the wrong reason to give a reader. The real reason is structural: a
       market assessment is of the filing the program is RECORDED for, and a
       program records one. Assessing this program against a second market would
       assess a filing that does not exist, which is the refusal that engine
       exists to make. So the grid stays empty and says why. */
    const tRows: [string, string | null][] = [['Module completeness', null], ['Region-specific gaps', null]];
    return (
      <div className="ro-dash">
        <div className="ro-dash-head"><div><div className="ro-rep-eyebrow">Global harmonization</div><h2 className="ro-rep-title">{dashboard.label}</h2><div className="ro-rep-meta"><span>{m.length} markets</span></div></div></div>
        {prog.readiness != null && (
          <div className="ro-dash-progline">
            {/* The bare percentage again (HS-1008-1): the same figure can carry
                outstanding critical gaps, and a reader comparing markets has no
                other place here to learn that. */}
            Submission readiness <b>{prog.readiness}%</b>
            {readinessQualifier(prog) ? <> — {readinessQualifier(prog)}</> : null} — a project-level figure, not assessed per market.
          </div>
        )}
        <ROTable columns={['Requirement', ...m]} rows={tRows.map((r) => [r[0], ...m.map(() => r[1] ?? '--')])} />
        <div className="ro-dash-note">{I.info} No per-market comparison is in the governed record, so every market cell reads "--". A market assessment is of the filing this project is recorded for, and a project records one — so {prog.code} can be assessed for its own market, not against a second one it is not filing in. Open the report catalog for the market assessment of its recorded filing.</div>
      </div>
    );
  }

  /* preset pack -- grid of governed report cards */
  // A pack's types that apply to this program (the catalog is the program's)
  // and that an engine computes (P-26): an engine-less type is listed once on
  // the canvas, never as a tile inside a pack.
  const types = ((dashboard.types || []).map(id => catalog.find(t => t.typeId === id)).filter(Boolean) as ReportType[])
    .filter(t => t.runnable);
  return (
    <div className="ro-dash">
      {/* "AnA-curated" claimed a curator. The pack is RO_PRESETS[segment], a
          literal in this file — standard is what it is. */}
      <div className="ro-dash-head"><div><div className="ro-rep-eyebrow">Standard pack</div><h2 className="ro-rep-title">{dashboard.label}</h2><p className="ro-dash-why">{dashboard.why}</p></div></div>
      <div className="ro-pack-grid">
        {types.map(t => {
          const dec = roDecide(t.typeId, t.family, tier), actual = actualReportDecision(t, actualTier);
          const fam = RO_FAMILY[t.family] || {};
          if (!tierResolved) return <PlanUnavailableCard key={t.typeId} type={t} family={fam.label} />;
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
          if (!t.scopes.includes(scope)) return (
            <div key={t.typeId} className="ro-pack-card is-locked">
              <div className="ro-pack-fam">{fam.label}</div>
              <div className="ro-pack-title">{t.label}</div>
              <div className="ro-pack-sub">Runs over {t.scopes.map(scopeWord).join(' or ')}, not a single {scopeWord(scope)}.</div>
            </div>
          );
          if (!actual.entitled) return <PlanUnavailableCard key={t.typeId} type={t} family={fam.label} reason={actualPlanReason(actual, actualTier)} />;
          if (!canRun) return (
            <div key={t.typeId} className="ro-pack-card is-locked">
              <div className="ro-pack-fam">{fam.label}{fam.region ? <span className="ro-region">{fam.region}</span> : null}</div>
              <div className="ro-pack-title">{t.label}</div>
              <div className="ro-pack-sub">View only. Running a report needs an editor role in this organization.</div>
            </div>
          );
          return <RunPackTile key={t.typeId} type={t} fam={fam} onRun={onRun} />;
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
function unconfirmedRunOutcome(status: unknown, payload: unknown): boolean {
  return typeof status === 'number' && (status === 0 || status >= 500) && !REPORT_NOT_SAVED_CODES.has(errorCodeOf(payload) ?? '');
}

function runRefusalNote(label: string, status: unknown, payload: unknown): string {
  if (unconfirmedRunOutcome(status, payload)) return REPORT_WRITE_UNCONFIRMED;
  const p = payload as { requiredTier?: unknown; tier?: unknown } | null;
  const tier = p?.requiredTier;
  /* 2026-10-15: a plan the server could not read (tier: null, requiredTier still
     the gate's 'standard') read as "needs a higher plan (standard)". */
  if (status === 403 && p != null && 'tier' in p && p.tier === null) {
    return `"${label}" wasn't run — your plan could not be read.`;
  }
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
function reportTarget(type: ReportType, program: ProgramCtx | null): { scope: string; scopeId: string; label: string } | null {
  if (type.runScopeType && type.runScopeId) {
    let label = 'Scoped records';
    if (type.runScopeType === 'account') label = 'Organization records';
    else if (type.runScopeType === 'document') label = 'Selected document';
    else if (program) label = program.label;
    return { scope: type.runScopeType, scopeId: type.runScopeId, label };
  }
  return program;
}
function targetNamesProgram(target: { scope: string; scopeId: string }, program: ProgramCtx | null, programId: string | null): boolean {
  return Boolean(programId && program && target.scope === program.scope && target.scopeId === program.scopeId);
}
async function requestRun(type: ReportType, program: ProgramCtx | null, programId: string | null): Promise<{ runId: number } | { note: string }> {
  const target = reportTarget(type, program);
  if (!target) return { note: type.availabilityReason || 'Choose a project or document for this report.' };
  const namesProgram = targetNamesProgram(target, program, programId);
  let res: Response;
  try {
    res = await apiRequest('POST', '/api/report-os/runs', {
      organizationId: Number(getOrgId()) || 0,
      scopeType: target.scope,
      ...(namesProgram ? { programId } : { scopeId: target.scopeId }),
      reportTypeId: type.typeId,
    });
  } catch (e) {
    // apiRequest throws for every non-OK status but 401. Read the refusal
    // structurally, not by instanceof (see finalizeRefusalNote's callers).
    const err = e as { status?: unknown; payload?: unknown } | null;
    if (typeof err?.status === 'number') return { note: runRefusalNote(type.label, err.status, err.payload) };
    return { note: REPORT_WRITE_UNCONFIRMED };
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) return { note: runRefusalNote(type.label, res.status, body) };
  const runId = body?.data?.run?.id;
  return typeof runId === 'number' && Number.isSafeInteger(runId) && runId > 0 ? { runId } : { note: REPORT_WRITE_UNCONFIRMED };
}

/** The result once a run is shown. It names the run's scope, so an organization-scope
 *  run under a project's name says so, in the catalog card's words. */
function ranReportText(label: string, report: RenderedReport): string {
  const counts = countsAreOrganizationWide(report) ? ` ${ORGANIZATION_WIDE_RECORDS}. ${COUNTS_NOT_NARROWED}` : '';
  return `The ${label} for ${report.scopeLabel || 'the stored scope'} ran against the governed record and is shown in the report canvas.${counts} ` +
    'Every value is computed from the governed record; none is originated here.';
}

/** GET /runs/:id/rendered, adopted as the canvas's report; null when it did not come back. */
async function fetchRenderedRun(runId: number, type: ReportType, program: ProgramCtx | null): Promise<RenderedReport | null> {
  const target = reportTarget(type, program);
  if (!target) return null;
  try {
    const res = await apiRequest('GET', `/api/report-os/runs/${runId}/rendered`);
    const rendered = (await res.json().catch(() => null))?.data;
    if (!res.ok || !rendered || !Array.isArray(rendered.sections) || typeof rendered.generatedAt !== 'string') return null;
    return reportFromRenderedRow(rendered, { id: runId, runUuid: '', reportTypeId: type.typeId, reportTypeLabel: type.label, scopeType: target.scope, scopeId: target.scopeId, scopeLabel: target.label, status: 'partial', confidence: null, createdAt: rendered.generatedAt }, type);
  } catch {
    return null;
  }
}

/** GET /runs/:id/export.pdf through the canonical downloadBlob: what was saved, or why nothing was. */
async function downloadRunPdf(runId: number, rep: RenderedReport, current: () => boolean): Promise<{ ok: boolean; text: string } | null> {
  try {
    if (!current()) return null;
    const res = await apiRequest('GET', `/api/report-os/runs/${runId}/export.pdf`);
    if (!current()) return null;
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      if (!current()) return null;
      return { ok: false, text: `No file saved — ${serverMessage(body) ?? 'the export service did not say why'}.` };
    }
    const blob = await res.blob();
    if (!current()) return null;
    const filename = `${safeFileName(rep.reportTypeLabel || rep.reportTypeId, 'report')}_run${runId}.pdf`;
    return downloadBlob(filename, blob)
      ? { ok: true, text: `Saved ${filename}.` }
      : { ok: false, text: 'No file saved — this browser refused the download.' };
  } catch (e) {
    if (!current()) return null;
    return { ok: false, text: `No file saved — ${e instanceof Error ? e.message : String(e)}.` };
  }
}

/**
 * GET /bundles/:bundleId/export.pdf through the canonical downloadBlob.
 *
 * The bundle PDF is a governed export: the server records a chain row with the
 * export id and how many of its reports were final AT EXPORT, and prints each
 * report's bundled status beside its current one (`pdf/bundle-pdf.ts`). So the
 * only thing this has to get right is to say what was saved, or why nothing was.
 */
async function downloadBundlePdf(
  bundleId: string,
  name: string,
  content: BundlePdfContent,
  sameSessionRevision: () => boolean,
): Promise<{ ok: boolean; text: string } | null> {
  try {
    const suffix = content === 'reports' ? '?content=reports' : '';
    const res = await apiRequest('GET', `/api/report-os/bundles/${encodeURIComponent(bundleId)}/export.pdf${suffix}`);
    if (!sameSessionRevision()) return null;
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      if (!sameSessionRevision()) return null;
      return { ok: false, text: `No file saved — ${serverMessage(body) ?? 'the export service did not say why'}.` };
    }
    const blob = await res.blob();
    if (!sameSessionRevision()) return null;
    const filename = content === 'reports'
      ? `report-pack-${bundleId.slice(0, 8)}.pdf`
      : `${safeFileName(name || 'report-bundle', 'report-bundle')}_${bundleId.slice(0, 8)}.pdf`;
    return downloadBlob(filename, blob)
      ? { ok: true, text: `Saved ${filename}.` }
      : { ok: false, text: 'No file saved — this browser refused the download.' };
  } catch (e) {
    if (!sameSessionRevision()) return null;
    return { ok: false, text: `No file saved — ${e instanceof Error ? e.message : String(e)}.` };
  }
}

/**
 * A run from the history, rendered as the canvas's report.
 *
 * Distinct from {@link fetchRenderedRun}, which is keyed on the catalog type a
 * fresh run was started from. A historical run carries its own type id and
 * scope, and `GET /runs/:id/rendered` refuses with 409 when a finalized run's
 * seal no longer verifies — so a refusal is returned as its reason, never as
 * an empty report.
 */
/** Why a historical run could not be opened, in the reader's terms. 409 is the
 *  seal re-verification refusal and has to say so: it is the one case where a
 *  record EXISTS and is deliberately withheld. */
function openRunRefusal(label: string, status: number, payload: unknown): string {
  if (status === 409) {
    return `"${label}" could not be opened: its seal no longer verifies against the audit chain, ` +
      'so the sealed document is withheld.';
  }
  return `Couldn't open "${label}" — ${serverMessage(payload) ?? 'the server did not say why'}.`;
}

/** The rendered payload mapped onto the canvas's report, keyed on the run row. */
function storedScopeLabel(label: unknown, row: ReportRunRow): string {
  return typeof label === 'string' && label ? label : row.scopeLabel || row.scopeId;
}
/** The computed data boundary the rendered document carries, else the run row's. */
function storedComputedScope(scope: unknown, row: ReportRunRow): string | undefined {
  if (typeof scope === 'string' && scope) return scope;
  return row.computedScope ?? undefined;
}
function storedTypeLabel(label: unknown, row: ReportRunRow, type: ReportType | undefined): string {
  return typeof label === 'string' && label ? label : type?.label ?? row.reportTypeLabel;
}
function reportFromRenderedRow(
  rendered: Record<string, any>,
  row: ReportRunRow,
  type: ReportType | undefined,
): RenderedReport {
  const status = typeof rendered.status === 'string' ? rendered.status : row.status;
  const scopeLabel = storedScopeLabel(rendered.scopeLabel, row);
  const truthfulness = rendered.truthfulness && Array.isArray(rendered.truthfulness.reasons)
    ? rendered.truthfulness
    : { allowedStatus: status, reasons: [] };
  return {
    reportTypeId: rendered.reportTypeId ?? row.reportTypeId,
    reportTypeLabel: storedTypeLabel(rendered.reportTypeLabel, row, type),
    family: type?.family ?? '',
    scopeType: rendered.scopeType ?? row.scopeType,
    scopeId: rendered.scopeId ?? row.scopeId,
    scopeLabel,
    computedScope: storedComputedScope(rendered.computedScope, row),
    generatedAt: rendered.generatedAt ?? row.completedAt ?? row.createdAt,
    status,
    truthfulness,
    sections: rendered.sections,
  };
}

async function fetchRenderedRunRow(
  row: ReportRunRow,
  catalog: ReportType[],
): Promise<{ report: RenderedReport } | { note: string }> {
  let res: Response;
  try {
    res = await apiRequest('GET', `/api/report-os/runs/${row.id}/rendered`);
  } catch (e) {
    const err = e as { status?: unknown; payload?: unknown } | null;
    if (typeof err?.status === 'number') {
      return { note: openRunRefusal(row.reportTypeLabel, err.status, err.payload) };
    }
    return { note: `Couldn't open "${row.reportTypeLabel}" — ${e instanceof Error ? e.message : String(e)}.` };
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    return { note: openRunRefusal(row.reportTypeLabel, res.status, body) };
  }
  const rendered = body?.data;
  if (!rendered || !Array.isArray(rendered.sections)) {
    return { note: `"${row.reportTypeLabel}" returned no document, so nothing is shown in its place.` };
  }
  return { report: reportFromRenderedRow(rendered, row, catalog.find((t) => t.typeId === row.reportTypeId)) };
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
function ReportFinalizeModal({ runId, report, onClose, onSealed, current }: {
  runId: number;
  report: RenderedReport;
  onClose: () => void;
  onSealed: (seal: ReportSeal) => void;
  current: () => boolean;
}) {
  const authUser = useAuthUser();
  const signer = esignSignerOf(authUser);
  const onSign = async (input: { meaning: EsigMeaning; reason: string; password: string; totp?: string }): Promise<EsigSignedManifest> => {
    if (!current()) throw new Error(REPORT_ACCESS_CHANGED);
    const sealed = await finalizeRun(runId, input);
    if (current()) onSealed({ ...sealed, signer: signer?.name ?? null });
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
      commitRefusal={current() ? null : REPORT_ACCESS_CHANGED}
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
function ROReportActions({ report, onExport, onFinalize, exporting = false }: {
  report: RenderedReport;
  onExport: (r: RenderedReport) => void;
  onFinalize?: () => void;
  exporting?: boolean;
}) {
  return (
    <div className="ro-rep-actions">
      <button type="button" className="sp-primary" disabled={exporting} aria-busy={exporting} onClick={() => onExport(report)}>{I.download || I.fileText} {exporting ? 'Preparing PDF…' : 'Export PDF'}</button>
      {onFinalize && <button type="button" className="btn ghost" onClick={onFinalize}>{I.shieldCheck} Finalize…</button>}
    </div>
  );
}

/** A report segment (the program's recorded product type, server segment.ts) → the pack set. */
const RO_PRESET_SEGMENT: Record<string, string> = {
  pharma: 'pharma', biotech: 'biotech', device: 'medtech', ivd: 'diagnostics', cro: 'cro',
};

/** Reuse the canonical account/revision owner, retaining ordinary bearer refresh. */
export function InsightsCanvas(props: OwnedSurfaceViewProps) {
  const session = useAuthoringReadSession(authService.getUser());
  const changed = session.key > 1;
  if (changed && !authService.getUser()) return <div className="rc"><div className="rc-canvas" style={{ gridColumn: '1 / -1' }}>
    <ReportingRecoveryNotice ended />
    <EmptyState icon={I.lock} title="Sign in to read reporting" hint="Your previous reporting data has been withdrawn. Sign in again to reopen Run history." />
  </div></div>;
  return <ReportingCanvasForSession key={session.key} {...props} owner={session} reloaded={changed} />;
}

function ReportingRecoveryNotice({ ended = false }: { ended?: boolean }) {
  return <div className="ro-dash-note" role="status">{ended ? 'Your reporting session ended.' : 'Reporting was reset for the current account.'} Requests sent before the change may have completed. In the original account, check Run history, Schedules and Bundles for their stored outcomes.</div>;
}

function ReportingCanvasForSession({ onNav, segment, owner, reloaded }: OwnedSurfaceViewProps & { owner: ReturnType<typeof captureAuthoringSession>; reloaded: boolean }) {
  const search = useSearch();
  const tabsId = React.useId();

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
  /* A fallback tier does not verify an entitlement. An explicit unresolved
     result withholds generation instead of presenting a plan or upgrade claim.
     Preserve the existing absent-flag compatibility for an older server. */
  const tierResolved = data?.tierResolved !== false;
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
  const displayedRun = useRef<number | null>(reportRunId);
  displayedRun.current = reportRunId;
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, fireToast] = useToast();
  /* Every write under /api/report-os and /api/insights needs a writing role
     (requireEditorAccessForWrites). A viewer reads the canvas and is told,
     rather than offered runs the server will refuse. */
  const authUser = useAuthUser();
  const canWrite = canGovernedWrite(authUser);
  const canExecute = canWrite && tierResolved;
  const canFinalize = canFinalizeReport(authUser);
  // The displayed run's signature and seal once finalized here, and whether the signing dialog is open.
  const [seal, setSeal] = useState<ReportSeal | null>(null);
  const [signing, setSigning] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  /* Which artifact-pane view is open. 'report' is the report/dashboard/landing
     pane this surface has always shown and stays the default; the other four
     are the library panels for the routes the 2026-10-01 reporting review left
     with no screen (see the Insights*Panel modules). */
  const [paneView, setPaneView] = useState<'report' | LibraryView>('report');
  /* Runs chosen in Run history, waiting to be bundled. Held here so the choice
     survives moving between the Runs and Bundles panels. */
  const [bundlePicks, setBundlePicks] = useState<number[]>([]);
  const libraryActions = useLibraryActions();
  // The ref closes same-frame duplicate clicks; state keeps both export controls
  // disabled for this bundle, including when the reader returns to the tab.
  const bundleExportsInFlight = useRef(new Set<string>());
  const [pendingBundleExports, setPendingBundleExports] = useState<ReadonlySet<string>>(new Set());
  const reportExportsInFlight = useRef(new Set<number>());
  const [pendingReportExports, setPendingReportExports] = useState<ReadonlySet<number>>(new Set());
  const contextKey = `${openProgramId ?? ''}|${data?.organizationId ?? ''}|${program?.scope ?? ''}|${program?.scopeId ?? ''}|${seg}`;
  const activeContext = useRef(contextKey);
  activeContext.current = contextKey;
  const hasReportingContext = Boolean(data);
  const hadReportingContext = useRef(hasReportingContext);
  const requestSequence = useRef(0);
  const linkedRead = useRef<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; requestSequence.current += 1; };
  }, []);
  const reportAccessCurrent = () => mounted.current && owner.sameRevision() && activeContext.current === contextKey;
  const retainOwner = (event: React.SyntheticEvent) => {
    if (!reportAccessCurrent()) { event.preventDefault(); event.stopPropagation(); }
  };
  const ownerEvents = { onClickCapture: retainOwner, onSubmitCapture: retainOwner };
  useEffect(() => {
    const initialized = hadReportingContext.current;
    hadReportingContext.current = hasReportingContext;
    if (!initialized) return; // The first bootstrap has no prior result to invalidate.
    requestSequence.current += 1;
    displayedRun.current = null;
    setFound(null); setRunNote(null); setReport(null); setReportRunId(null); setSeal(null); setDashboard(null);
    setQuery('');
    setSigning(false); setBusy(false); setBundlePicks([]);
  }, [contextKey, hasReportingContext]);
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
    if (!reportAccessCurrent()) return;
    if (!reportTarget(type, program)) { setRunNote(type.availabilityReason || 'Choose a project or document for this report.'); return; }
    const request = ++requestSequence.current;
    const isCurrent = () => reportAccessCurrent() && request === requestSequence.current;
    /* The result said "Running the …" when the run began. Once the run ends it
       says what happened, so it never reports as current a run that finished or
       never started. A run that produced no report drops the result's sentence
       and the alert says why: one statement, not "Running" beside "wasn't run". */
    const mine = foundSeq.current;
    const settle = (next: FoundResult | null) => { if (foundSeq.current === mine) setFound(next); };
    const say = (text: string) => { if (isCurrent()) { settle(null); setRunNote(text); } };
    setRunNote(null);
    if (!tierResolved) { say(`"${type.label}" wasn't run. ${REPORT_PLAN_UNVERIFIED}`); return; }
    if (!canWrite) {
      say(`"${type.label}" wasn't run. Running a report creates a governed record, which needs an editor role in this organization.`);
      return;
    }
    const actual = actualReportDecision(catalog.find(row => row.typeId === type.typeId) ?? type, realTier);
    if (!actual.entitled) { say(`"${type.label}" wasn't run. ${actualPlanReason(actual, realTier)}`); return; }
    setBusy(true);
    setDashboard(null);
    displayedRun.current = null;
    setReport(null); setReportRunId(null); setSeal(null); setSigning(false);
    try {
      const started = await requestRun(type, program, runProgramId);
      if (!isCurrent()) return;
      if ('note' in started) { say(started.note); return; }
      const adopted = await fetchRenderedRun(started.runId, type, program);
      if (!isCurrent()) return;
      if (!adopted) { say("The run completed but its rendered document didn't come back — reload and retry."); return; }
      setReport(adopted);
      setReportRunId(started.runId);
      setSeal(null);
      settle({ text: ranReportText(type.label, adopted) });
      pushCanvasTop();
    } finally {
      if (isCurrent()) setBusy(false);
    }
  };

  /* A suggestion (an opener prompt, a result's choice) fills the field with the
     words it searches for, so the field always shows what the result answers. */
  const findReport = async (raw?: string) => {
    if (!reportAccessCurrent()) return;
    const text = (raw == null ? query : raw).trim();
    if (!text || busy || !program || !data) return;
    if (raw != null) setQuery(raw);
    setRunNote(null);
    if (!tierResolved) { setFound({ text: REPORT_PLAN_UNVERIFIED }); return; }
    // roRouteReply resolves intent, chips and the entitlement lock — all
    // deterministic. When it resolves a report type, generation goes to the REAL
    // backend via runReport, not to a client-built preview.
    const reply = roRouteReply(text, tier, { program, portfolio: { ...data.portfolio, dataScope: data.dataScope }, types: catalog, report });
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
    if (!reportAccessCurrent()) return;
    if (!preset) return;
    setRunNote(null);
    setFound({ text: `${preset.label}: ${preset.why} ${tierResolved ? 'Each tile runs a governed report against the live record; pick one to run it. Anything the plan has not unlocked shows as locked, never as an estimate.' : REPORT_PLAN_UNVERIFIED}` });
    setDashboard({ kind: 'pack', label: preset.label, why: preset.why, types: preset.types });
    setReport(null);
    setReportRunId(null);
    pushCanvasTop();
  };

  /* Run a report from a pack tile (states it as the result, then generates). */
  const runFromTile = (type: ReportType) => {
    if (!reportAccessCurrent()) return;
    setFound({ text: `Running the ${type.label} for ${program?.code ?? 'this project'} against the governed record.` });
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
    if (!reportAccessCurrent()) return;
    if (reportRunId == null) { fireToast('Only a freshly-run governed report can be exported — run one first.', 'error'); return; }
    const runId = reportRunId;
    const session = captureAuthoringSession();
    const current = () => session.sameRevision() && reportAccessCurrent() && displayedRun.current === runId;
    if (!current() || reportExportsInFlight.current.has(runId)) return;
    reportExportsInFlight.current.add(runId);
    setPendingReportExports(new Set(reportExportsInFlight.current));
    try {
      const saved = await downloadRunPdf(runId, rep, current);
      if (saved && current()) fireToast(saved.text, saved.ok ? undefined : 'error');
    } finally {
      reportExportsInFlight.current.delete(runId);
      if (mounted.current) setPendingReportExports(new Set(reportExportsInFlight.current));
    }
  };

  const onSealed = (sealed: ReportSeal) => {
    setSeal(sealed);
    setReport(r => (r ? { ...r, status: 'final' } : r));
  };

  /* ── The library panels ─────────────────────────────────────────────────
     The catalog the panels render carries each type's entitlement decided
     against the tier IN VIEW (roDecide), not the organisation's, so a preview
     unlocks the catalog exactly as it unlocks the find box. */
  const libraryCatalog: LibraryReportType[] = catalog.map((t) => {
    const d = roDecide(t.typeId, t.family, tier);
    const blockedByPlan = !tierResolved && (t.runnable || t.computedScopes.length > 0);
    return {
      typeId: t.typeId,
      label: t.label,
      family: t.family,
      scopes: t.scopes,
      computedScopes: t.computedScopes,
      segments: t.segments,
      runnable: t.runnable && tierResolved,
      entitled: tierResolved ? d.entitled : undefined,
      requiredTier: tierLabel(d.requiredTier),
      region: t.region,
      allowedPersonas: t.allowedPersonas,
      computedScope: t.computedScope,
      availabilityReason: blockedByPlan ? REPORT_PLAN_UNVERIFIED : t.availabilityReason,
      reasonCode: t.reasonCode,
      availabilityState: blockedByPlan ? 'disabled' : t.availabilityState,
      runScopeType: t.runScopeType,
      runScopeId: t.runScopeId,
    };
  });

  const unavailableRunReason = (type: LibraryReportType) => {
    if (!tierResolved) return REPORT_PLAN_UNVERIFIED;
    const actual = actualReportDecision(catalog.find(row => row.typeId === type.typeId) ?? type, realTier);
    return actual.entitled ? undefined : actualPlanReason(actual, realTier);
  };

  /* A run opened from the history replaces the artifact pane. Its seal is
     dropped: the seal state belongs to a finalize performed here, and showing
     the previous report's signature beside another report's document would
     attribute a signature to a record nobody signed. */
  const openRunFromHistory = async (row: ReportRunRow) => {
    if (!reportAccessCurrent()) return;
    const request = ++requestSequence.current;
    setBusy(true);
    setRunNote(null);
    displayedRun.current = null;
    setReport(null); setReportRunId(null); setSeal(null); setSigning(false);
    const result = await fetchRenderedRunRow(row, catalog);
    if (!reportAccessCurrent() || request !== requestSequence.current) return;
    setBusy(false);
    if ('note' in result) {
      setPaneView('report');
      setReport(null);
      setReportRunId(null);
      setSeal(null);
      setRunNote(result.note);
      return;
    }
    setDashboard(null);
    setSeal(null);
    setReport(result.report);
    setReportRunId(row.id);
    setPaneView('report');
    pushCanvasTop();
  };

  const exportBundle = async (bundleId: string, name: string, content: BundlePdfContent) => {
    if (!reportAccessCurrent()) return;
    if (bundleExportsInFlight.current.has(bundleId)) return;
    bundleExportsInFlight.current.add(bundleId);
    setPendingBundleExports(new Set(bundleExportsInFlight.current));
    const session = captureAuthoringSession();
    const current = () => session.sameRevision() && reportAccessCurrent();
    try {
      const out = await downloadBundlePdf(bundleId, name, content, current);
      if (out && current()) fireToast(out.text, out.ok ? undefined : 'error');
    } finally {
      bundleExportsInFlight.current.delete(bundleId);
      setPendingBundleExports(new Set(bundleExportsInFlight.current));
    }
  };

  /* A report run from the catalog shows its document, as a run from the find
     box does. */
  const runFromCatalog = (t: LibraryReportType) => {
    if (!reportAccessCurrent()) return;
    const type = catalog.find((c) => c.typeId === t.typeId);
    if (!type) return;
    setPaneView('report');
    void runReport({ ...type, ...t });
  };
  const linkedRun = new URLSearchParams(search).get('reportRunId');
  useEffect(() => {
    if (!linkedRun) { linkedRead.current = null; return; }
    if (overview.loading || !/^[1-9]\d*$/.test(linkedRun) || !Number.isSafeInteger(Number(linkedRun))) return;
    if (linkedRead.current === linkedRun) return;
    linkedRead.current = linkedRun;
    const request = ++requestSequence.current;
    const isCurrent = () => reportAccessCurrent() && requestSequence.current === request;
    displayedRun.current = null;
    setReport(null); setReportRunId(null); setSeal(null); setDashboard(null); setSigning(false); setRunNote(null); setPaneView('report'); setBusy(true);
    let cancelled = false;
    void (async () => {
      try {
        if (!isCurrent()) return;
        const response = await apiRequest('GET', `/api/report-os/runs/${linkedRun}`);
        const row = (await response.json().catch(() => null))?.data as ReportRunRow | undefined;
        if (cancelled || !isCurrent()) return;
        if (!response.ok || row?.id !== Number(linkedRun) || typeof row.scopeId !== 'string' || typeof row.scopeType !== 'string') {
          setRunNote('The saved report could not be opened. Its record was not returned for your organization.'); setBusy(false); return;
        }
        await openRunFromHistory(row);
      } catch (error) {
        if (!cancelled && isCurrent()) { setRunNote(`The saved report could not be opened — ${error instanceof Error ? error.message : 'the server refused the read'}.`); setBusy(false); }
      }
    })();
    return () => { cancelled = true; };
    // Catalog and current context are captured by the request; the identity is the stored run id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overview.loading, contextKey, linkedRun]);

  const openPortfolioProgram = (row: PortfolioRow) => {
    if (!reportAccessCurrent()) return;
    if (!row.programId) return;
    publishShellProject({ id: row.programId, title: row.label, code: row.code });
    onNav?.('project-home');
  };
  const libraryTabs = <ReportingTabs value={paneView} id={tabsId} onChange={view => { setPaneView(view); pushCanvasTop(); }} />;
  const libraryPane = paneView === 'catalog' ? <CatalogPanel key={contextKey} types={libraryCatalog} onRun={runFromCatalog} canRun={canExecute} runUnavailableReason={unavailableRunReason} busy={busy} programLabel={program?.code ?? null} projectId={data?.leadProgram?.projectId} />
    : paneView === 'runs' ? <RunsPanel types={libraryCatalog} scope={program ? { scopeType: program.scope, scopeId: program.scopeId, label: program.code } : null} onOpen={row => void openRunFromHistory(row)} onBundle={ids => { if (!reportAccessCurrent() || libraryActions.get(contextKey, 'bundle:create')) return; setBundlePicks(ids); setPaneView('bundles'); pushCanvasTop(); }} canBundle={canWrite && !libraryActions.get(contextKey, 'bundle:create')} />
    : paneView === 'schedules' ? <SchedulesPanel key={contextKey} types={libraryCatalog} scope={program ? { scopeType: program.scope, scopeId: program.scopeId } : null} canWrite={canWrite} canSchedule={tierResolved && ['professional', 'enterprise'].includes(realTier)} actions={libraryActions} context={contextKey} accessCurrent={reportAccessCurrent} onSaved={msg => { if (reportAccessCurrent()) fireToast(msg); }} />
    : paneView === 'bundles' ? <BundlesPanel key={contextKey} pendingRunIds={bundlePicks} canWrite={canWrite} pendingExports={pendingBundleExports} onExport={(id, name, content) => void exportBundle(id, name, content)} actions={libraryActions} context={contextKey} accessCurrent={reportAccessCurrent} onSaved={msg => { if (reportAccessCurrent()) fireToast(msg); }} onClearPending={() => { if (reportAccessCurrent()) setBundlePicks(now => now === bundlePicks ? [] : now); }} /> : null;
  const reportPane = report ? <ROReport report={report} onExport={exportRep} onFinalize={canFinalize && reportRunId != null && report.status !== 'final' ? () => { if (reportAccessCurrent()) setSigning(true); } : undefined} seal={seal} runId={reportRunId} exporting={reportRunId != null && pendingReportExports.has(reportRunId)} /> : null;
  const visibleGeneration = requestSequence.current;
  const displayedReportCurrent = () => reportAccessCurrent() && displayedRun.current === reportRunId && requestSequence.current === visibleGeneration;
  const sealForDisplayedRun = (sealed: ReportSeal) => {
    if (displayedReportCurrent()) onSealed(sealed);
  };
  const planNotice = !tierResolved && <div className="ro-dash-note" role="status" data-testid="rc-tier-unresolved">{I.alertTriangle} {REPORT_PLAN_UNVERIFIED} This is not a statement about your plan — try again in a moment, and contact your administrator if it persists.</div>;
  const recoveryNotice = reloaded && <ReportingRecoveryNotice />;
  const withoutProgram = (content: React.ReactNode) => <div className="rc" {...ownerEvents}><div className="rc-canvas" style={{ gridColumn: '1 / -1' }}>{libraryTabs}{recoveryNotice}{planNotice}<div role="tabpanel" id={`${tabsId}-panel`} aria-labelledby={`${tabsId}-${paneView}`}>{libraryPane || reportPane || content}</div>{busy && <div className="ro-dash-note" role="status">{I.clock} Opening the report…</div>}{runNote && !busy && <div className="ro-dash-note" role="alert">{I.alertTriangle} {runNote}</div>}<C2CToast msg={toast} />{signing && report && reportRunId != null && <ReportFinalizeModal runId={reportRunId} report={report} onClose={() => setSigning(false)} onSealed={sealForDisplayedRun} current={displayedReportCurrent} />}</div></div>;

  // Four-state render: loading → honest error → honest empty (no flagship
  // program) → the live canvas. No fixture stand-in in any state.
  const snapshotMatchesProgram = !openProgramId || !data?.openProgram || data.openProgram.programId === openProgramId;
  if (overview.loading || !snapshotMatchesProgram) {
    return (
      <div className="rc" {...ownerEvents}>
        <div className="rc-canvas" style={{ gridColumn: '1 / -1' }}>
          {recoveryNotice}
          <EmptyState busy icon={I.barChart} title="Loading the reporting canvas…" />
        </div>
      </div>
    );
  }
  if (overview.error) {
    return (
      <div className="rc" {...ownerEvents}>
        <div className="rc-canvas" style={{ gridColumn: '1 / -1' }}>
          {recoveryNotice}
          <ErrorState
            title="Couldn't load the reporting canvas"
            message="Your organization's plan, project readiness and portfolio rollup could not be read. Nothing is shown in their place."
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
    const name = shellProgramName() ?? 'This project';
    return withoutProgram(
          <EmptyState
            icon={I.barChart || I.fileText}
            title={`${name} has no readiness or reports here yet`}
            hint={
              openState === 'unanchored'
                ? "Readiness and governed reports are computed over a project's tracking record, and this project was created without one. Nothing from another project is shown in its place."
                : "This project's record is not among the projects whose readiness is computed for your organization (it may be archived or part of another project). Nothing from another project is shown in its place."
            }
            action={{ label: 'Audit & compliance reports', onAct: () => onNav && onNav('compliance-reports') }}
          />
    );
  }
  /* No program open: ask which, from the organisation's programs. The flagship
     stood in here, and with no readiness computed anywhere it was the lowest
     project id — every report and digest ran over project 1, a program nobody
     had chosen (QA 2026-10-08, j8). Choosing opens the program across the app,
     through the shell's one program channel, and the canvas then leads with it. */
  const choices = data?.programs ?? [];
  if (data && !program && !data.openProgram && choices.length > 0) {
    return withoutProgram(
          <div className="rc-empty" data-testid="rc-program-picker">
            <h2 className="rc-empty-h">Which project is the report for?</h2>
            <p className="rc-empty-s">Governed reports and the readiness digest run over one project. Choose it here; it stays open everywhere, as it does from Projects.</p>
            <div className="rc-empty-presets" role="group" aria-label="Projects">
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
    );
  }
  if (!program || !data || !suggest) {
    return withoutProgram(
          <EmptyState
            icon={I.barChart || I.fileText}
            title="No project readiness yet"
            hint="Once a project with a governed readiness run exists in your organization, the reporting canvas opens here — the project's readiness, the portfolio rollup, and every governed report, computed from the governed record. Nothing is estimated."
            /* Audit and compliance reports read the organisation's own records,
               not a program, so they stay reachable before any program exists. */
            action={{ label: 'Audit & compliance reports', onAct: () => onNav && onNav('compliance-reports') }}
          />
    );
  }
  const p = program; // narrowed non-null past the guards above

  return (
    <div className="rc" {...ownerEvents}>
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
              {suggest.prompts.map((q, i) => (<button key={i} className="rc-chip" disabled={!tierResolved} onClick={() => findReport(q)}>{q}</button>))}
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
            <p className="rc-op-body" role="status" style={found ? undefined : { margin: 0 }}>{found?.locked && !tierResolved ? REPORT_PLAN_UNVERIFIED : found?.text ?? ''}</p>
            {found?.locked && tierResolved && (
              <div className="rc-lock">
                <div className="rc-lock-h">{I.lock} {tierLabel(found.locked.requiredTier)} plan unlocks {found.locked.typeLabel}</div>
                <div className="rc-lock-s">{RO_FEATURE_LABEL[found.locked.feature]} requires the stated plan and an implemented report engine at the requested scope. A plan does not supply a missing engine or qualify a prediction.</div>
                <div className="rc-lock-acts">
                  <button className="rc-lock-up" onClick={() => onNav && onNav('licensing')}>{getSurfaceMeta('licensing').label} {I.right}</button>
                  <button className="rc-chip" onClick={() => setTierOverride(found.locked!.requiredTier)}>Preview on {tierLabel(found.locked.requiredTier)}</button>
                </div>
              </div>
            )}
            {found?.chips && found.chips.length ? <div className="rc-chips">{found.chips.map((c, ci) => (<button key={ci} className="rc-chip" disabled={!tierResolved} onClick={() => findReport(c[1])}>{c[0]}</button>))}</div> : null}
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
              {I.info} Previewing {tierLabel(tier)}.{' '}
              {tierResolved
                ? <>Your organization's plan is {tierLabel(realTier)}.{' '}</>
                : <>Your organization's plan could not be verified, so it is not named here.{' '}</>}
              <button type="button" className="rc-chip" onClick={() => setTierOverride(null)}>
                {tierResolved ? <>Back to {tierLabel(realTier)}</> : <>Stop previewing</>}
              </button>
            </div>
          )}
          {/* Not previewing, and the plan was never read: say so where the plan
              is shown, so a wall of locks is not read as the plan's doing. */}
          {!previewing && planNotice}
          <label className="gov-label" htmlFor={fieldId} style={{ display: 'block', marginBottom: 5 }}>Find a report</label>
          <div className="rc-input">
            {/* One line: Enter finds, as the button does. The words stay after a
                search, so the field always says what the result answers. */}
            <textarea id={fieldId} rows={1} value={query} placeholder={`A report type, market or question for ${p.code}`}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void findReport(); } }} />
            <button type="button" className="btn primary" disabled={!tierResolved || !query.trim() || busy} onClick={() => void findReport()}>Find</button>
          </div>
          <div className="rc-guardrail">{I.shieldCheck} {RO_GUARDRAIL}</div>
        </div>
      </div>

      {/* -- Right: the report / dashboard artifact, and the library beside it --
           The four library tabs are the screens for the report-os and insights
           routes the 2026-10-01 reporting review left with no caller; see
           the Insights*Panel modules and the `insights` row of
           shared/constants/ui-surface-registry.ui-v2.ts. 'Report' is the pane
           this surface has always shown and remains the default, so a reader
           who never opens a tab sees exactly what they saw before. -- */}
      <div className="rc-canvas" ref={canvasRef}>
        {libraryTabs}
        {recoveryNotice}
        <div role="tabpanel" id={`${tabsId}-panel`} aria-labelledby={`${tabsId}-${paneView}`}>
        {libraryPane || reportPane || (dashboard ? <RODashboard dashboard={dashboard} tier={tier} actualTier={realTier} tierResolved={tierResolved} onRun={runFromTile} canRun={canExecute} scope={p.scope} catalog={catalog} onOpenProgram={openPortfolioProgram} />
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
                    <div className="rc-ep-types">{pr.types.length} governed report{pr.types.length === 1 ? '' : 's'}</div>
                  </button>
                ))}
              </div>
              {/* P-26: the program's report types no engine computes, listed
                  once, here, and never as tiles inside a pack. Asking for one
                  by name says the same and runs nothing (roRouteReply). */}
              {roNotComputed(catalog).length > 0 && (
                <section aria-label="Not computed in this release" data-testid="ro-not-computed">
                  <div className="ro-rep-eyebrow">Not computed in this release</div>
                  <p className="rc-empty-s">
                    No engine produces these reports for {p.code}, so no pack offers them and none is run: {roNotComputed(catalog).join('; ')}.
                  </p>
                </section>
              )}
            </div>
          ))}
        </div>
      </div>
      {signing && report && reportRunId != null && (
        <ReportFinalizeModal runId={reportRunId} report={report} onClose={() => setSigning(false)} onSealed={sealForDisplayedRun} current={displayedReportCurrent} />
      )}
      <C2CToast msg={toast} />
    </div>
  );
}

function ReportingTabs({ id, value, onChange }: { id: string; value: 'report' | LibraryView; onChange: (view: 'report' | LibraryView) => void }) {
  const views = [{ id: 'report' as const, label: 'Report', icon: I.fileText }, ...LIBRARY_VIEWS];
  const move = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    const positions: Record<string, number> = { ArrowRight: (index + 1) % views.length, ArrowLeft: (index + views.length - 1) % views.length, Home: 0, End: views.length - 1 };
    const next = positions[event.key];
    if (next == null) return;
    event.preventDefault();
    onChange(views[next].id);
    document.getElementById(`${id}-${views[next].id}`)?.focus();
  };
  return <div className="rl-tabs" role="tablist" aria-label="Reporting views">{views.map((view, index) => <button key={view.id} id={`${id}-${view.id}`} type="button" role="tab" aria-selected={value === view.id} aria-controls={`${id}-panel`} tabIndex={value === view.id ? 0 : -1} className={'rl-tab' + (value === view.id ? ' on' : '')} onClick={() => onChange(view.id)} onKeyDown={event => move(event, index)}>{view.icon} {view.label}</button>)}</div>;
}
