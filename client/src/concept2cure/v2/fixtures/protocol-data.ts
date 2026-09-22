/* Protocol Development + Research Administration fixture data.
   Ported from kit protocol-data.jsx (window globals). */

/* ---- Shared sub-types ---- */

export interface Provenance { src: string; conf: string; audit: string; }
export interface SevText { sev: string; text: string; }

/* ---- Protocol document (C2C-17) ---- */

export interface PdevSection {
  id: string; num: string; title: string; status: string; required: boolean; tab?: string;
}
export interface ContentBlock {
  h: string; p: string; prov: Provenance;
}
export interface PdevObjective {
  id: string; type: string; text: string; endpoint: string;
}
export interface EligibilityItem { id: string; text: string; }
export interface PdevEligibility {
  inclusion: EligibilityItem[]; exclusion: EligibilityItem[];
}
export interface SoaVisit {
  id: string; label: string; day: string; window: string;
}
export interface SoaAssessment {
  id: string; label: string; cat: string;
}
export interface PdevSoa {
  visits: SoaVisit[];
  assessments: SoaAssessment[];
  cells: Record<string, string[]>;
  issues: SevText[];
}
export interface PdevRisk {
  id: string; hazard: string; cat: string;
  l: number; i: number; mitigation: string;
  rl: number; ri: number; status: string;
}
export interface PdevMilestone {
  id: string; label: string; date: string; status: string; urgency: string;
}
export interface BudgetItem {
  id: string; cat: string; label: string; perSubject: number;
}
export interface BudgetParams {
  enrollment: number; sponsorPerSubject: number; faRate: number;
}
export interface PdevBudget { params: BudgetParams; items: BudgetItem[]; }
export interface AmendmentChange { sec: string; from: string; to: string; }
export interface PdevAmendment {
  id: string; num: string; summary: string; status: string;
  /** true = a declared consent or risk impact needs an IRB re-consent determination; null = not declared. */
  reconsent: boolean | null; path: string; changes: AmendmentChange[];
}
export interface CapaAction { id: string; action: string; status: string; }
export interface PdevDeviation {
  id: string; title: string; sev: string; cat: string;
  reportable: boolean; status: string; capa: CapaAction[];
}
export interface ReviewComment {
  id: string; sec: string; sev: string; text: string; resolved: boolean;
}
export interface PdevReview {
  id: string; reviewer: string; role: string; status: string; comments: ReviewComment[];
}
export interface ConsentElement { id: string; el: string; present: boolean; }

/** A design-gate finding, as `validateDesign()` produced it on the server.
 *  `sev` / `text` match the shape every other register's findings use. */
export interface PdevDesignFinding {
  code: string; section: string; sev: string; title: string; text: string;
  standard: string; endpoint: string; fix: string;
}

/** The study design this protocol is a projection of, or null when none is
 *  bound. Never an empty report: an unbound protocol has been checked against
 *  nothing, and `resolved: false` says the link names a design this
 *  organisation cannot read. */
export interface PdevStudyDesign {
  studyId: string;
  resolved: boolean;
  title: string; phase: string; indication: string; status: string;
  linkedAt: string;
  riskLevel: string; canAdvance: boolean; blocksApproval: boolean;
  counts: { critical: number; major: number; minor: number; info: number };
  summary: string; standardsChecked: string[];
  findings: PdevDesignFinding[];
}

export interface PdevDoc {
  id: string; title: string; shortTitle: string; kind: string;
  version: string; status: string; sponsor: string; pi: string;
  updated: string; completeness: number;
  sections: PdevSection[];
  openSection: string;
  content: Record<string, ContentBlock[]>;
  objectives: PdevObjective[];
  eligibility: PdevEligibility;
  soa: PdevSoa;
  risks: PdevRisk[];
  milestones: PdevMilestone[];
  budget: PdevBudget;
  amendments: PdevAmendment[];
  deviations: PdevDeviation[];
  reviews: PdevReview[];
  consent: ConsentElement[];
  completenessFindings: SevText[];
  /** The bound study design and the design gates' findings, or null. */
  studyDesign: PdevStudyDesign | null;
  /**
   * Deterministic regulatory findings from `protocol-rule-pack.ts` — one per
   * rule, each citing its clause. This is depth alongside `completenessFindings`
   * (the five checks the finalize gate enforces), not a replacement for it.
   *
   * `notAssessed` is a first-class count, not a rounding error: a rule the
   * protocol does not record enough to decide is reported as not-assessed and
   * is NEVER folded into `assessed`. A percentage over rules that did not run
   * is the defect this platform has already been burned by.
   */
  ruleFindings: PdevRuleFindings;
}

export interface PdevRuleFinding {
  ruleId: string;
  standard: string;
  clause: string;
  title: string;
  status: 'met' | 'unmet' | 'attention' | 'not-assessed';
  sev: 'critical' | 'warning' | 'info';
  message: string;
  remediation: string;
}

export interface PdevRuleFindings {
  findings: PdevRuleFinding[];
  /** Rules that reached a verdict. */
  assessed: number;
  unmet: number;
  /** Rules that could not be decided from what the protocol records. */
  notAssessed: number;
}


/* ---- C2C-16 Research Committee Governance ---- */

export interface CommitteeType { id: string; label: string; full: string; }
export interface CommitteeMember {
  id: string; name: string; role: string; kind: string;
  affiliated: boolean; citi: string; privileges: string[];
}
export interface MeetingListItem {
  id: string; committee: string; date: string; title: string; status: string; agendaCount: number;
}
export interface AgendaItem {
  id: string; kind: string; protocol: string; status: string; risk: string;
  votes: Record<string, string | null>;
}
export interface OpenMeeting {
  id: string; committee: string; title: string; date: string;
  quorumRequired: number; present: string[];
  agenda: AgendaItem[];
}
export interface PortfolioItem {
  id: string; protocol: string; committee: string; risk: string;
  status: string; next: string; flag: string;
}
export interface PdevCommittees {
  active: string;
  types: CommitteeType[];
  members: Record<string, CommitteeMember[]>;
  composition: Record<string, SevText[]>;
  meetings: MeetingListItem[];
  openMeeting: OpenMeeting;
  portfolio: PortfolioItem[];
}


/* ---- C2C-15 Medicare Coverage Analysis ---- */

export interface CoverageLineItem {
  id: string; item: string; soc: boolean; sponsorPaid: boolean;
  designation: string; ncd: string; icd10: string; valid: boolean;
}
export interface CoverageSuggestion { item: string; suggest: string; }
export interface CoverageQualifying {
  therapeuticIntent: boolean; enrollsMedicare: boolean; principalPurpose: boolean;
  deemed: boolean; desirableCount: number;
  determination: string; rationale: string;
}
export interface CoverageAnalysis {
  id: string; title: string; study: string; nct: string; sponsor: string; status: string;
  qualifying: CoverageQualifying;
  items: CoverageLineItem[];
  suggestions: CoverageSuggestion[];
  disclaimer: string;
}
export interface PdevCoverage { analysis: CoverageAnalysis; }


/* ---- C2C-14 Intelligent Grant Finder ---- */

export interface GrantProfile {
  keywords: string[]; agencies: string[]; mechanisms: string[];
  institutionType: string; awardMin: number; awardMax: number;
}
export interface GrantOpportunity {
  id: string; title: string; agency: string; mech: string;
  fit: number; eligible: boolean; deadlineDays: number;
  ceiling: string; reasons: string[];
}
export interface PdevGrants { profile: GrantProfile; opportunities: GrantOpportunity[]; }


/* ---- C2C-01/02 CITI Training matrix ---- */

export interface CitiPerson {
  id: string; name: string; role: string; cells: string[];
}
export interface ExpiringTraining { name: string; training: string; days: number; }
export interface PdevCiti {
  trainings: string[];
  personnel: CitiPerson[];
  expiring: ExpiringTraining[];
}


/* ---- C2C-16 Portfolio analytics (continuing-review expiration) ---- */

export interface PortfolioAnalyticsBuckets {
  expired: number; due_30: number; due_90: number; current: number;
}
export interface NeedsAttentionItem {
  protocol: string; committee: string; issue: string; citation: string; urgency: string;
}
export interface PdevPortfolioAnalytics {
  buckets: PortfolioAnalyticsBuckets;
  needsAttention: NeedsAttentionItem[];
}


/* ---- Severity-to-tone map ---- */


/* ---- Helpers ---- */

