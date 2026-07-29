/**
 * Intelligent grant opportunity matching (Capability C2C-14, finder upgrade)
 *
 * Pure, DB-free, LLM-free, transparent scoring of a funding opportunity against
 * an organization's funding profile. Replaces the naive positional relevance
 * (1 - i*0.03) with an explainable fit score: keyword overlap, agency fit,
 * mechanism fit, deadline window, award-size fit, and an eligibility gate. Every
 * point is traceable to a `reason`, so the recommendation is defensible.
 *
 * @module server/services/grants/opportunity-matching
 */

export type FundingAgencyCode = 'nih' | 'nsf' | 'barda' | 'dod' | 'cdc' | 'arpa_h' | 'foundation' | 'industry' | 'other';
export type FundingMechanismCode = 'sbir' | 'sttr' | 'r01' | 'r21' | 'u01' | 'p01' | 'contract' | 'cooperative_agreement' | 'other';

export interface FundingProfile {
  keywords: string[];
  agencies: FundingAgencyCode[];
  mechanisms: FundingMechanismCode[];
  /** Applicant institution type, matched against opportunity eligibility. */
  institutionType?: string | null;
  minAward?: number | null;
  maxAward?: number | null;
}

export interface MatchableOpportunity {
  externalId: string;
  title: string;
  opportunityNumber?: string | null;
  agency?: string | null;
  agencyCode?: string | null;
  closeDate?: string | null;
  synopsis?: string | null;
  awardCeiling?: number | null;
  /** Applicant types the opportunity is open to (free text from Grants.gov). */
  eligibilities?: string[] | null;
}

export interface MatchReason { factor: string; points: number; detail: string }
export interface OpportunityMatch {
  externalId: string;
  title: string;
  fitScore: number; // 0–100
  eligible: boolean;
  keywordHits: string[];
  agencyMatch: boolean;
  mechanismMatch: boolean;
  daysToDeadline: number | null;
  reasons: MatchReason[];
}

/** Map free-text agency strings to a canonical code for matching. */
const AGENCY_TOKENS: Record<FundingAgencyCode, string[]> = {
  nih: ['nih', 'national institutes of health'],
  nsf: ['nsf', 'national science foundation'],
  barda: ['barda', 'biomedical advanced research'],
  dod: ['dod', 'department of defense', 'army', 'navy', 'air force', 'darpa', 'cdmrp'],
  cdc: ['cdc', 'centers for disease control'],
  arpa_h: ['arpa-h', 'arpa h', 'advanced research projects agency for health'],
  foundation: ['foundation'],
  industry: ['industry'],
  other: [],
};

/** Map mechanism codes to tokens that appear in titles / opportunity numbers. */
const MECHANISM_TOKENS: Record<FundingMechanismCode, string[]> = {
  sbir: ['sbir', 'small business innovation'],
  sttr: ['sttr', 'small business technology transfer'],
  r01: ['r01'],
  r21: ['r21'],
  u01: ['u01'],
  p01: ['p01'],
  contract: ['contract', 'baa', 'rfp'],
  cooperative_agreement: ['cooperative agreement', 'uc2', 'coop'],
  other: [],
};

const norm = (s: string): string => s.toLowerCase().replace(/\s+/g, ' ').trim();

/** ISO (YYYY-MM-DD) or US (MM/DD/YYYY) → epoch days, or null. Pure. */
export function dateToDays(value: string | null | undefined): number | null {
  if (!value) return null;
  let y: number, mo: number, d: number;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(value);
  if (iso) { y = +iso[1]; mo = +iso[2]; d = +iso[3]; }
  else if (us) { mo = +us[1]; d = +us[2]; y = +us[3]; }
  else return null;
  const t = Date.UTC(y, mo - 1, d);
  return Number.isFinite(t) ? Math.floor(t / 86_400_000) : null;
}

function agencyCodeFor(opp: MatchableOpportunity): FundingAgencyCode | null {
  const hay = norm([opp.agency, opp.agencyCode].filter(Boolean).join(' '));
  if (!hay) return null;
  for (const [code, tokens] of Object.entries(AGENCY_TOKENS) as [FundingAgencyCode, string[]][]) {
    if (tokens.some((t) => t && hay.includes(t))) return code;
  }
  return null;
}

function matchedMechanisms(opp: MatchableOpportunity, wanted: FundingMechanismCode[]): FundingMechanismCode[] {
  const hay = norm([opp.title, opp.opportunityNumber, opp.synopsis].filter(Boolean).join(' '));
  return wanted.filter((m) => (MECHANISM_TOKENS[m] ?? []).some((t) => t && hay.includes(t)));
}

// Scoring weights (sum of positives caps at 100).
const W_KEYWORD_MAX = 50;
const W_AGENCY = 20;
const W_MECHANISM = 15;
const W_DEADLINE = 10;
const W_AWARD = 5;
const DEADLINE_WINDOW_DAYS = 180;

/**
 * Score one opportunity against a funding profile. Returns an explainable fit
 * score (0–100), eligibility verdict, and per-factor reasons. Pure; `today` is
 * passed so the deadline factor is deterministic.
 */
export function scoreOpportunity(profile: FundingProfile, opp: MatchableOpportunity, today: string): OpportunityMatch {
  const reasons: MatchReason[] = [];
  const hay = norm([opp.title, opp.synopsis].filter(Boolean).join(' '));

  // Keyword overlap (proportional, capped).
  const keywords = (profile.keywords ?? []).map(norm).filter(Boolean);
  const keywordHits = keywords.filter((k) => hay.includes(k));
  let keywordPts = 0;
  if (keywords.length > 0 && keywordHits.length > 0) {
    keywordPts = Math.round((keywordHits.length / keywords.length) * W_KEYWORD_MAX);
    reasons.push({ factor: 'keywords', points: keywordPts, detail: `Matched ${keywordHits.length}/${keywords.length} profile keywords: ${keywordHits.join(', ')}.` });
  } else if (keywords.length > 0) {
    reasons.push({ factor: 'keywords', points: 0, detail: 'No profile keywords found in the opportunity.' });
  }

  // Agency fit.
  const oppAgency = agencyCodeFor(opp);
  const agencyMatch = oppAgency != null && (profile.agencies ?? []).includes(oppAgency);
  if (agencyMatch) reasons.push({ factor: 'agency', points: W_AGENCY, detail: `Agency ${oppAgency!.toUpperCase()} is on the profile's target list.` });

  // Mechanism fit.
  const mechHits = matchedMechanisms(opp, profile.mechanisms ?? []);
  const mechanismMatch = mechHits.length > 0;
  if (mechanismMatch) reasons.push({ factor: 'mechanism', points: W_MECHANISM, detail: `Matches funding mechanism(s): ${mechHits.join(', ')}.` });

  // Deadline window.
  const due = dateToDays(opp.closeDate);
  const now = dateToDays(today);
  let daysToDeadline: number | null = null;
  let deadlinePts = 0;
  if (due != null && now != null) {
    daysToDeadline = due - now;
    if (daysToDeadline < 0) {
      reasons.push({ factor: 'deadline', points: 0, detail: `Closed ${-daysToDeadline} day(s) ago.` });
    } else if (daysToDeadline <= DEADLINE_WINDOW_DAYS) {
      deadlinePts = W_DEADLINE;
      reasons.push({ factor: 'deadline', points: deadlinePts, detail: `Open with ${daysToDeadline} day(s) to the deadline (actionable window).` });
    } else {
      reasons.push({ factor: 'deadline', points: 0, detail: `Deadline is ${daysToDeadline} days out (beyond the ${DEADLINE_WINDOW_DAYS}-day window).` });
    }
  }

  // Award-size fit.
  let awardPts = 0;
  if (opp.awardCeiling != null && (profile.minAward != null || profile.maxAward != null)) {
    const aboveMin = profile.minAward == null || opp.awardCeiling >= profile.minAward;
    const belowMax = profile.maxAward == null || opp.awardCeiling <= profile.maxAward;
    if (aboveMin && belowMax) {
      awardPts = W_AWARD;
      reasons.push({ factor: 'award', points: awardPts, detail: `Award ceiling ${opp.awardCeiling} fits the profile's range.` });
    }
  }

  // Eligibility gate (only when the opportunity declares eligibilities and the profile sets an institution type).
  let eligible = true;
  if (profile.institutionType && Array.isArray(opp.eligibilities) && opp.eligibilities.length > 0) {
    const want = norm(profile.institutionType.replace(/_/g, ' '));
    eligible = opp.eligibilities.some((e) => norm(e).includes(want) || want.includes(norm(e)));
    if (!eligible) reasons.push({ factor: 'eligibility', points: 0, detail: `Institution type "${profile.institutionType}" is not in the opportunity's eligible applicants.` });
  }

  const raw = keywordPts + (agencyMatch ? W_AGENCY : 0) + (mechanismMatch ? W_MECHANISM : 0) + deadlinePts + awardPts;
  const fitScore = eligible ? Math.min(100, raw) : Math.max(0, Math.round(raw * 0.25));

  return {
    externalId: opp.externalId,
    title: opp.title,
    fitScore,
    eligible,
    keywordHits,
    agencyMatch,
    mechanismMatch,
    daysToDeadline,
    reasons,
  };
}

/** Score and rank opportunities by fit (descending), tie-broken by nearest deadline. Pure. */
export function rankOpportunities(profile: FundingProfile, opportunities: MatchableOpportunity[], today: string): OpportunityMatch[] {
  return opportunities
    .map((o) => scoreOpportunity(profile, o, today))
    .sort((a, b) => b.fitScore - a.fitScore || (a.daysToDeadline ?? Infinity) - (b.daysToDeadline ?? Infinity));
}
