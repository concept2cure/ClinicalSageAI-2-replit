/**
 * RBM fixture data -- ported from kit app/rbm-data.jsx.
 * Risk-Based Monitoring / RBQM domain data for BX204-301.
 * All engine bands, status vocabularies, navigation, studies, and
 * fixture records for the 10-surface RBM shell.
 */

/* -- Interfaces -- */

export interface RbmVocabEntry { l: string; tone: string }

export interface RbmNavItem {
  id: string; label: string; icon: string; tool: string; starters: string[];
}

export interface RbmStudy {
  id: string; label: string; program: string; sites: number; subjects: number; hasData: boolean;
}

export interface RbmLinkDef {
  surface: string; label: string; value: string; note: string;
}

export interface RbmSummary {
  overallRisk: string; asOf: string;
  riskItems: { total: number; critical: number; open: number; high: number };
  kris: { total: number; red: number; amber: number };
  qtls: { total: number; breached: number; approaching: number };
  signals: { total: number; open: number; high: number };
  sites: { total: number; enhanced: number };
  patients: { scored: number; flagged: number; review: number };
}

export interface RbmAttentionItem {
  sev: string; kind: string; nav: string; t: string; d: string;
}

export interface RbmAssessmentHistory { v: number; status: string; by: string; when: string; reason: string }
export interface RbmApproval { by: string; when: string; reason: string; audit: string }
export interface RbmAssessment {
  id: string; framework: string; version: number; status: string; updated: string;
  history: RbmAssessmentHistory[]; approval?: RbmApproval;
}

export interface RbmRiskItem {
  id: string; category: string; factor: string; l: number; i: number;
  critical: boolean; mitigation: string; residual: number; status: string;
  riskCat?: string; det?: number; control?: string; owner?: string; _new?: boolean;
}

export interface RbmKri {
  id: string; name: string; metric: string; source: string; unit: string;
  dir: string; amber: number; red: number; current: number; status: string;
  at: string; spark: number[]; bySite?: [string, number][];
  method?: string; level?: string; _new?: boolean;
}

export interface RbmQtl {
  id: string; parameter: string; rationale: string; unit: string;
  secondary: number; threshold: number; current: number; status: string;
  breachDoc?: { justification: string; evidence: string; capa: string; when: string; by: string };
}

export interface RbmSignalInvestigation {
  owner: string; rootCause: string; action: string; notes: string; evidence?: string; when: string;
}
export interface RbmSignal {
  id: string; source: string; type: string; severity: string; title: string;
  site: string; detail: string; detected: string; status: string;
  resolution?: string; investigation?: RbmSignalInvestigation;
}

export interface RbmCsmFinding { site: string; metric: string; z: number; sev: string; note: string }
export interface RbmCsmRun { method: string; cohort: string; findings: RbmCsmFinding[] }

export interface RbmSiteRisk {
  n: string; name: string; country: string; composite: number;
  enr: number; qual: number; ops: number; tier: string; drivers: string[]; at: string;
}

export interface RbmOversightCount { open: number; high: number }

export interface RbmPatientMetric { k: string; z: number }
export interface RbmPatient {
  sid: string; site: string; anomaly: number; top: string; status: string;
  at: string; metrics: RbmPatientMetric[];
}

export interface RbmPlanData {
  id: string; title: string; strategy: string; status: string; version: number;
  updated: string; anaDraft: boolean; basis: string;
  tiers: Record<string, string>; approval?: RbmApproval;
}

export interface RbmAction {
  id: string; type: string; title: string; priority: string; owner: string;
  due: string; status: string; overdue?: boolean; origin: string; ana?: boolean;
}

export interface RbmReportSection { title: string; status: string; items: string[] }
export interface RbmReportData {
  framework: string; asOf: string; overallRisk: string; approved: boolean;
  attentionCount: number; headline: string; sections: RbmReportSection[];
}

/* -- Pure helper functions (engine banding) -- */

export function rbmBand(score: number): string {
  return score >= 15 ? 'high' : score >= 8 ? 'medium' : 'low';
}

export function kriStatusOf(kri: { dir: string; amber: number; red: number }, value: number): string {
  const v = Number(value);
  if (kri.dir === 'lower_worse') return v <= kri.red ? 'red' : v <= kri.amber ? 'amber' : 'green';
  return v >= kri.red ? 'red' : v >= kri.amber ? 'amber' : 'green';
}

export function qtlStatusOf(q: { current: number; secondary: number; threshold: number }): string {
  const v = Number(q.current);
  return v >= q.threshold ? 'breached' : v >= q.secondary ? 'approaching' : 'within';
}

/* -- Status vocabularies -- */

export const RBM_VOCAB: Record<string, Record<string, RbmVocabEntry>> = {
  band:     { low: { l: 'Low', tone: 'ok' }, medium: { l: 'Medium', tone: 'warn' }, high: { l: 'High', tone: 'err' } },
  item:     { open: { l: 'Open', tone: 'warn' }, mitigating: { l: 'Mitigating', tone: 'ai' }, accepted: { l: 'Accepted', tone: 'neutral' }, closed: { l: 'Closed', tone: 'ok' } },
  kri:      { green: { l: 'Green', tone: 'ok' }, amber: { l: 'Amber', tone: 'warn' }, red: { l: 'Red', tone: 'err' } },
  qtl:      { within: { l: 'Within', tone: 'ok' }, approaching: { l: 'Approaching', tone: 'warn' }, breached: { l: 'Breached', tone: 'err' } },
  severity: { low: { l: 'Low', tone: 'neutral' }, medium: { l: 'Medium', tone: 'ai' }, high: { l: 'High', tone: 'warn' }, critical: { l: 'Critical', tone: 'err' } },
  signal:   { new: { l: 'New', tone: 'warn' }, triaged: { l: 'Triaged', tone: 'ai' }, investigating: { l: 'Investigating', tone: 'ai' }, resolved: { l: 'Resolved', tone: 'ok' }, dismissed: { l: 'Dismissed', tone: 'neutral' } },
  tier:     { reduced: { l: 'Reduced', tone: 'ok' }, standard: { l: 'Standard', tone: 'neutral' }, enhanced: { l: 'Enhanced', tone: 'err' } },
  patient:  { normal: { l: 'Normal', tone: 'ok' }, review: { l: 'Review', tone: 'warn' }, flagged: { l: 'Flagged', tone: 'err' } },
  strategy: { centralized: { l: 'Centralized', tone: 'ai' }, risk_based: { l: 'Risk-based', tone: 'ok' }, on_site: { l: 'On-site', tone: 'neutral' }, hybrid: { l: 'Hybrid', tone: 'ai' } },
  action:   { open: { l: 'Open', tone: 'warn' }, in_progress: { l: 'In progress', tone: 'ai' }, done: { l: 'Done', tone: 'ok' } },
  atype:    { issue: { l: 'Issue', tone: 'neutral' }, capa: { l: 'CAPA', tone: 'neutral' }, site_visit: { l: 'Site visit', tone: 'neutral' }, query: { l: 'Query', tone: 'neutral' }, escalation: { l: 'Escalation', tone: 'neutral' } },
  section:  { ok: { l: 'Ok', tone: 'ok' }, attention: { l: 'Attention', tone: 'warn' }, critical: { l: 'Critical', tone: 'err' } },
};

/* -- Navigation -- */

export const RBM_NAV: RbmNavItem[] = [
  { id: 'overview', label: 'Overview', icon: 'barChart', tool: 'get_rbm_attention',
    starters: ['Summarize the risk-based monitoring posture for this study', 'Which critical-to-quality factors are still open', 'What needs my attention across KRIs, QTLs and signals'] },
  { id: 'report', label: 'Risk review report', icon: 'fileText', tool: 'generate_rbm_report',
    starters: ['Generate the ICH E6(R3) risk review report', 'Summarize the overall risk posture for an inspection', 'What would a regulator flag'] },
  { id: 'ract', label: 'Risk assessment (RACT)', icon: 'clipboardList', tool: 'run_rbm_assessment',
    starters: ['Seed a default ICH E6(R3) risk assessment', 'Rank the critical-to-quality factors by risk score', 'Which risks have no mitigation'] },
  { id: 'kris', label: 'Key risk indicators', icon: 'sigma', tool: 'evaluate_kris_qtls',
    starters: ['Which KRIs are amber or red right now', 'Seed the standard KRI library', 'Explain each red KRI and its driver'] },
  { id: 'qtls', label: 'Quality tolerance limits', icon: 'scale', tool: 'evaluate_kris_qtls',
    starters: ['Which QTLs are approaching or breached', 'Propose quality tolerance limits for this study', 'What action does a breached QTL require'] },
  { id: 'signals', label: 'Central monitoring', icon: 'zap', tool: 'run_central_monitoring',
    starters: ['Prioritize the open signals by urgency', 'Which sites carry the most high-severity signals', 'Draft an action for the most critical signal'] },
  { id: 'patients', label: 'Patient profiles', icon: 'search', tool: 'scan_patient_profiles',
    starters: ['Scan the patient cohort for atypical subjects', 'Which patients are flagged for medical review', 'Explain why subject 1104-014 is an anomaly'] },
  { id: 'sites', label: 'Site risk', icon: 'network', tool: 'assess_site_risk',
    starters: ['Recompute site risk and show the enhanced-tier sites', 'Which sites should move to enhanced monitoring and why', 'Explain the drivers behind the highest-risk site'] },
  { id: 'oversight', label: 'Site oversight', icon: 'eye', tool: 'run_central_monitoring',
    starters: ['Show site oversight ranked by risk', 'Which sites carry the most open high-severity signals', 'Summarize what each enhanced-tier site needs'] },
  { id: 'plan', label: 'Monitoring plan', icon: 'checkSquare', tool: 'generate_rbm_plan',
    starters: ['Generate a risk-based monitoring plan from the assessment', 'Recommend a monitoring strategy for this risk level', 'Turn the critical risks into monitoring actions'] },
];

/* -- Studies -- */

export const RBM_STUDIES: RbmStudy[] = [
  { id: 'bx204-301', label: 'BX204-301 -- Phase 3 pivotal', program: 'BX-204 (NDA 212345)', sites: 24, subjects: 412, hasData: true },
  { id: 'bx204-102', label: 'BX204-102 -- Phase 1b dose-expansion', program: 'BX-204 (NDA 212345)', sites: 6, subjects: 48, hasData: false },
];

/* -- Cross-app links -- */

export const RBM_LINKS: Record<string, RbmLinkDef> = {
  project: { surface: 'projects', label: 'Project management', value: 'BX-204 -- NDA 212345', note: 'Scoped to this program; posture rolls up to the project home.' },
  vault: { surface: 'vault', label: 'Vault', value: '14 records', note: 'Monitoring reports, CAPAs and site-visit records filed to the DMS.' },
  tasks: { surface: 'tasks', label: 'Tasking', value: '8 actions', note: 'Monitoring actions sync to the org-wide unified task board.' },
  biostats: { surface: 'biostatistics', label: 'Biostatistics', value: 'estimand -- power', note: 'Breached QTLs route here for ICH E9(R1) estimand and power/sample-size impact.' },
};

/* -- Summary -- */

export const RBM_SUMMARY: RbmSummary = {
  overallRisk: 'medium', asOf: '2026-07-02 06:10 UTC',
  riskItems: { total: 12, critical: 4, open: 5, high: 3 },
  kris: { total: 6, red: 1, amber: 2 },
  qtls: { total: 5, breached: 1, approaching: 1 },
  signals: { total: 9, open: 5, high: 2 },
  sites: { total: 24, enhanced: 3 },
  patients: { scored: 412, flagged: 2, review: 3 },
};

/* -- Attention feed -- */

export const RBM_ATTENTION: RbmAttentionItem[] = [
  { sev: 'critical', kind: 'QTL breached', nav: 'qtls', t: 'Premature discontinuation 12.4% -- primary threshold 12% breached', d: 'Secondary limit (9%) passed 2026-05-20; study-level tolerance now exceeded. CAPA required.' },
  { sev: 'high', kind: 'Signal', nav: 'signals', t: 'Site 1104 -- AE under-reporting outlier (|z| 4.1)', d: 'central_stat -- robust modified z-score vs 23-site cohort. Status: investigating.' },
  { sev: 'high', kind: 'Signal', nav: 'signals', t: 'Site 1109 -- 100% query agreement, zero deviations', d: 'central_stat -- too-perfect-data pattern (|z| 3.4). Status: new.' },
  { sev: 'high', kind: 'KRI red', nav: 'kris', t: 'AE reporting lag 6.8 days -- red threshold 5 days', d: 'Direction higher-worse. Driven by sites 1104 and 1117; trend rising 4 cycles.' },
  { sev: 'medium', kind: 'Patient flagged', nav: 'patients', t: 'Subject 1104-014 -- anomaly score 4.6, top dimension AE count', d: '2 dimensions >3 MAD from cohort. Flagged for medical review.' },
  { sev: 'medium', kind: 'Action overdue', nav: 'plan', t: 'Triggered visit at site 1104 -- due 2026-06-25', d: 'site_visit -- high priority -- owner M. Torres. 7 days overdue.' },
  { sev: 'medium', kind: 'Approval pending', nav: 'ract', t: 'Risk assessment v3 is draft -- active study without approved RACT', d: 'Approval requires reason-for-change + e-signature (21 CFR Part 11).' },
];

/* -- Assessment -- */

export const RBM_ASSESSMENT: RbmAssessment = {
  id: 'ract-bx204-301', framework: 'ICH E6(R3) -- TransCelerate RACT', version: 3, status: 'draft', updated: '2026-06-28',
  history: [
    { v: 2, status: 'active', by: 'S. Okafor', when: '2026-03-14', reason: 'Annual review -- added decentralized-visit data-flow risk after protocol amendment 4.' },
    { v: 1, status: 'superseded', by: 'S. Okafor', when: '2025-09-02', reason: 'Initial risk assessment at study start.' },
  ],
};

/* -- Risk items (CtQ register) -- */

export const RBM_ITEMS: RbmRiskItem[] = [
  { id: 'ctq-01', category: 'Safety', factor: 'AE/SAE capture completeness at high-enrolling sites', l: 4, i: 5, critical: true, mitigation: 'AE reconciliation vs pharmacy + lab data each cycle; central review', residual: 8, status: 'mitigating' },
  { id: 'ctq-02', category: 'Endpoint', factor: 'ORR assessment consistency (RECIST reads) across sites', l: 3, i: 5, critical: true, mitigation: 'Central independent imaging review; reader drift monitoring', residual: 5, status: 'mitigating' },
  { id: 'ctq-03', category: 'Data integrity', factor: 'Primary-endpoint data entry lag beyond visit window', l: 4, i: 4, critical: true, mitigation: 'KRI-04 entry-lag watch; weekly site follow-up at amber', residual: 8, status: 'open' },
  { id: 'ctq-04', category: 'Enrollment', factor: 'Screen-failure clustering masking eligibility drift', l: 3, i: 4, critical: false, mitigation: 'Central eligibility re-check on 10% sample', residual: 6, status: 'mitigating' },
  { id: 'ctq-05', category: 'Safety', factor: 'Dose-modification rules misapplied after grade-3 events', l: 2, i: 5, critical: false, mitigation: 'Targeted SDV on dose-mod pages at enhanced-tier sites', residual: 6, status: 'open' },
  { id: 'ctq-06', category: 'Site operations', factor: 'PI oversight gaps at sites with staff turnover', l: 4, i: 3, critical: false, mitigation: 'Oversight log review at every visit; tier escalation', residual: 8, status: 'open' },
  { id: 'ctq-07', category: 'IP handling', factor: 'Cold-chain excursions unreported at depot transfer', l: 2, i: 4, critical: false, mitigation: 'Temperature-log central reconciliation', residual: 4, status: 'closed' },
  { id: 'ctq-08', category: 'Data integrity', factor: 'Unreported protocol deviations (visit-window)', l: 4, i: 4, critical: true, mitigation: 'Deviation-rate KRI + central visit-window scan', residual: 9, status: 'open' },
  { id: 'ctq-09', category: 'Endpoint', factor: 'Missing primary-endpoint assessments in ITT', l: 3, i: 4, critical: false, mitigation: 'QTL-02 tolerance watch; retrieval outreach SOP', residual: 6, status: 'mitigating' },
  { id: 'ctq-10', category: 'Enrollment', factor: 'Slow accrual concentrating exposure at 3 sites', l: 3, i: 3, critical: false, mitigation: 'Enrollment-risk dimension in site composite', residual: 5, status: 'accepted' },
  { id: 'ctq-11', category: 'Site operations', factor: 'Informed-consent version control at re-consent', l: 2, i: 4, critical: false, mitigation: 'Consent audit in routine visit checklist', residual: 4, status: 'closed' },
  { id: 'ctq-12', category: 'Safety', factor: 'ILD class-signal follow-up assessments missed', l: 2, i: 5, critical: false, mitigation: 'Safety-signal watch tied to FAERS adjudication', residual: 6, status: 'open' },
];

/* -- KRIs -- */

export const RBM_KRIS: RbmKri[] = [
  { id: 'kri-01', name: 'Protocol deviation rate', metric: 'Deviations per subject-visit', source: 'EDC', unit: '%', dir: 'higher_worse', amber: 4, red: 7, current: 5.2, status: 'amber', at: '2026-07-01',
    spark: [3.1, 3.4, 3.2, 3.9, 4.4, 4.8, 5.0, 5.2], bySite: [['1104', 8.1], ['1117', 6.9], ['1109', 5.4], ['1121', 4.2], ['1102', 3.1], ['1113', 2.8], ['1106', 2.1], ['1111', 1.9]] },
  { id: 'kri-02', name: 'AE reporting lag', metric: 'Median days, onset to EDC entry', source: 'EDC + safety DB', unit: 'days', dir: 'higher_worse', amber: 3, red: 5, current: 6.8, status: 'red', at: '2026-07-01',
    spark: [2.9, 3.2, 3.8, 4.1, 4.9, 5.6, 6.2, 6.8], bySite: [['1104', 11.2], ['1117', 8.4], ['1121', 5.1], ['1109', 4.0], ['1102', 3.2], ['1113', 2.6], ['1106', 2.2], ['1111', 1.8]] },
  { id: 'kri-03', name: 'Query aging', metric: 'Open queries >30 days', source: 'EDC', unit: '%', dir: 'higher_worse', amber: 10, red: 20, current: 8.4, status: 'green', at: '2026-07-01',
    spark: [14, 12, 11, 10.5, 9.8, 9.1, 8.8, 8.4] },
  { id: 'kri-04', name: 'Data entry lag', metric: 'Median days, visit to eCRF entry', source: 'EDC', unit: 'days', dir: 'higher_worse', amber: 5, red: 10, current: 5.9, status: 'amber', at: '2026-07-01',
    spark: [4.2, 4.4, 4.1, 4.8, 5.1, 5.4, 5.7, 5.9], bySite: [['1104', 9.8], ['1117', 7.2], ['1109', 6.1], ['1121', 5.4], ['1102', 4.6], ['1113', 4.1], ['1106', 3.3], ['1111', 2.9]] },
  { id: 'kri-05', name: 'Screen failure rate', metric: 'Screen fails / screened', source: 'CTMS', unit: '%', dir: 'higher_worse', amber: 35, red: 50, current: 28, status: 'green', at: '2026-07-01',
    spark: [31, 33, 30, 29, 28, 29, 28, 28] },
  { id: 'kri-06', name: 'Missed visit rate', metric: 'Missed / scheduled visits', source: 'CTMS', unit: '%', dir: 'higher_worse', amber: 5, red: 10, current: 3.7, status: 'green', at: '2026-07-01',
    spark: [4.8, 4.5, 4.6, 4.2, 4.0, 3.9, 3.8, 3.7] },
];

/* -- QTLs -- */

export const RBM_QTLS: RbmQtl[] = [
  { id: 'qtl-01', parameter: 'Premature discontinuation', rationale: 'Discontinuation above tolerance threatens ITT power for the ORR primary analysis.', unit: '%', secondary: 9, threshold: 12, current: 12.4, status: 'breached' },
  { id: 'qtl-02', parameter: 'ITT missing primary endpoint', rationale: 'Missing RECIST assessments above tolerance biases the treatment-policy estimand.', unit: '%', secondary: 5, threshold: 8, current: 6.1, status: 'approaching' },
  { id: 'qtl-03', parameter: 'Randomization errors', rationale: 'Mis-randomization above tolerance undermines strata-adjusted analysis.', unit: '%', secondary: 0.5, threshold: 1, current: 0.2, status: 'within' },
  { id: 'qtl-04', parameter: 'Eligibility violations enrolled', rationale: 'Ineligible subjects dilute the per-protocol sensitivity analysis.', unit: '%', secondary: 2, threshold: 4, current: 1.4, status: 'within' },
  { id: 'qtl-05', parameter: 'Unblinding events', rationale: 'Open-label bias tolerance for the blinded independent review.', unit: 'events', secondary: 3, threshold: 6, current: 1, status: 'within' },
];

/* -- Signals -- */

export const RBM_SIGNALS: RbmSignal[] = [
  { id: 'sig-01', source: 'qtl', type: 'qtl_breach', severity: 'critical', title: 'QTL breached -- premature discontinuation 12.4% vs 12%', site: '—', detail: 'Study-level tolerance exceeded. CAPA and impact assessment on the primary estimand required.', detected: '2026-06-30', status: 'triaged' },
  { id: 'sig-02', source: 'central_stat', type: 'site_outlier', severity: 'high', title: 'Site 1104 -- AE under-reporting outlier', site: '1104', detail: 'AE rate |z| = 4.1 below cohort (robust modified z-score, MAD). Correlates with red AE-lag KRI.', detected: '2026-06-28', status: 'investigating' },
  { id: 'sig-03', source: 'central_stat', type: 'data_pattern', severity: 'high', title: 'Site 1109 -- too-perfect data pattern', site: '1109', detail: 'Zero deviations, 100% first-pass queries, uniform visit intervals (|z| 3.4). Pattern consistent with transcription.', detected: '2026-06-27', status: 'new' },
  { id: 'sig-04', source: 'kri', type: 'kri_red', severity: 'high', title: 'AE reporting lag crossed red threshold', site: '—', detail: 'KRI-02 at 6.8 days vs red 5. Rising 4 consecutive cycles; drivers sites 1104, 1117.', detected: '2026-06-25', status: 'triaged' },
  { id: 'sig-05', source: 'site_score', type: 'tier_change', severity: 'medium', title: 'Site 1117 moved to enhanced tier', site: '1117', detail: 'Composite risk 16.2 after PI departure; operational-risk dimension doubled.', detected: '2026-06-24', status: 'triaged' },
  { id: 'sig-06', source: 'central_stat', type: 'variance_outlier', severity: 'medium', title: 'Site 1121 -- lab variance outlier (ALT)', site: '1121', detail: 'Within-site ALT variance |z| 3.1 above cohort; possible unit or calibration issue.', detected: '2026-06-22', status: 'investigating' },
  { id: 'sig-07', source: 'manual', type: 'manual', severity: 'medium', title: 'CRA report -- consent re-versioning backlog at 1104', site: '1104', detail: '6 subjects pending re-consent to amendment 4 at last visit.', detected: '2026-06-18', status: 'resolved', resolution: 'Re-consent completed 2026-06-26; verified in visit report.' },
  { id: 'sig-08', source: 'kri', type: 'kri_amber', severity: 'low', title: 'Protocol deviation rate entered amber', site: '—', detail: 'KRI-01 at 5.2% vs amber 4%. Visit-window deviations dominate.', detected: '2026-06-15', status: 'triaged' },
  { id: 'sig-09', source: 'central_stat', type: 'enrollment', severity: 'low', title: 'Site 1102 -- enrollment pace outlier (high)', site: '1102', detail: 'Accrual 2.8x cohort median; eligibility re-check sample scheduled.', detected: '2026-06-12', status: 'dismissed', resolution: 'Re-check clean -- competitive catchment, no eligibility drift.' },
];

/* -- Central statistical monitoring run -- */

export const RBM_CSM_RUN: RbmCsmRun = {
  method: 'Robust modified z-score (Iglewicz-Hoaglin, MAD; z fallback) -- MIN_COHORT 5',
  cohort: '24 sites -- 9 metrics -- data cut 2026-07-01',
  findings: [
    { site: '1104', metric: 'AE rate per subject-visit', z: -4.1, sev: 'high', note: 'Under-reporting vs cohort' },
    { site: '1109', metric: 'Deviation rate', z: -3.4, sev: 'high', note: 'Too-perfect pattern' },
    { site: '1121', metric: 'ALT within-site variance', z: 3.1, sev: 'medium', note: 'Variance outlier' },
    { site: '1117', metric: 'Query response time', z: 2.9, sev: 'medium', note: 'Slowing 3 cycles' },
  ],
};

/* -- Site risk -- */

export const RBM_SITES: RbmSiteRisk[] = [
  { n: '1104', name: 'Northside Cancer Center', country: 'US', composite: 17.4, enr: 9, qual: 18, ops: 16, tier: 'enhanced', drivers: ['Red AE-lag KRI', 'AE under-reporting signal', '12 open queries >30d'], at: '2026-07-01' },
  { n: '1117', name: 'St. Anders University Hosp.', country: 'SE', composite: 16.2, enr: 11, qual: 13, ops: 19, tier: 'enhanced', drivers: ['PI departure -- oversight gap', 'Query response slowing', 'Staff turnover 40%'], at: '2026-07-01' },
  { n: '1109', name: 'Bayview Clinical Research', country: 'US', composite: 15.1, enr: 8, qual: 17, ops: 12, tier: 'enhanced', drivers: ['Too-perfect data pattern', 'Zero reported deviations'], at: '2026-07-01' },
  { n: '1121', name: 'Ospedale San Rocco', country: 'IT', composite: 12.8, enr: 10, qual: 14, ops: 11, tier: 'standard', drivers: ['ALT variance outlier', 'Consent backlog cleared'], at: '2026-07-01' },
  { n: '1102', name: 'Meridian Oncology Group', country: 'US', composite: 10.9, enr: 15, qual: 8, ops: 9, tier: 'standard', drivers: ['Enrollment 2.8x median -- re-check clean'], at: '2026-07-01' },
  { n: '1113', name: 'Hopital de la Colline', country: 'FR', composite: 9.6, enr: 9, qual: 10, ops: 10, tier: 'standard', drivers: ['Stable across dimensions'], at: '2026-07-01' },
  { n: '1106', name: 'Lakeshore Medical Research', country: 'CA', composite: 7.2, enr: 7, qual: 7, ops: 8, tier: 'reduced', drivers: ['Green on all KRIs 6 cycles'], at: '2026-07-01' },
  { n: '1111', name: 'Kyowa Daiichi Clinic', country: 'JP', composite: 6.8, enr: 8, qual: 6, ops: 6, tier: 'reduced', drivers: ['Low volume, clean data'], at: '2026-07-01' },
];

/* -- Site oversight counts -- */

export const RBM_OVERSIGHT_COUNTS: Record<string, RbmOversightCount> = {
  '1104': { open: 3, high: 2 }, '1117': { open: 2, high: 1 }, '1109': { open: 1, high: 1 },
  '1121': { open: 1, high: 0 }, '1102': { open: 0, high: 0 }, '1113': { open: 0, high: 0 },
  '1106': { open: 0, high: 0 }, '1111': { open: 0, high: 0 },
};

/* -- Patient profiles -- */

export const RBM_PATIENTS: RbmPatient[] = [
  { sid: '1104-014', site: '1104', anomaly: 4.6, top: 'AE count', status: 'flagged', at: '2026-07-01', metrics: [{ k: 'AE count', z: 4.6 }, { k: 'Visit interval', z: 3.2 }, { k: 'Lab variance (ALT)', z: 1.1 }, { k: 'Con-med count', z: 0.8 }, { k: 'Dose modifications', z: 2.4 }] },
  { sid: '1109-003', site: '1109', anomaly: 4.1, top: 'Visit interval', status: 'flagged', at: '2026-07-01', metrics: [{ k: 'Visit interval', z: 4.1 }, { k: 'AE count', z: -3.0 }, { k: 'Query rate', z: -2.8 }, { k: 'Lab variance (ALT)', z: 0.4 }, { k: 'Dose modifications', z: -0.6 }] },
  { sid: '1117-022', site: '1117', anomaly: 3.4, top: 'Dose modifications', status: 'review', at: '2026-07-01', metrics: [{ k: 'Dose modifications', z: 3.4 }, { k: 'AE count', z: 2.1 }, { k: 'Visit interval', z: 0.9 }, { k: 'Lab variance (ALT)', z: 1.6 }, { k: 'Con-med count', z: 1.2 }] },
  { sid: '1121-008', site: '1121', anomaly: 3.2, top: 'Lab variance (ALT)', status: 'review', at: '2026-07-01', metrics: [{ k: 'Lab variance (ALT)', z: 3.2 }, { k: 'AE count', z: 0.6 }, { k: 'Visit interval', z: 0.3 }, { k: 'Dose modifications', z: 0.9 }, { k: 'Con-med count', z: 0.2 }] },
  { sid: '1104-031', site: '1104', anomaly: 3.1, top: 'Con-med count', status: 'review', at: '2026-07-01', metrics: [{ k: 'Con-med count', z: 3.1 }, { k: 'AE count', z: 2.6 }, { k: 'Visit interval', z: 1.4 }, { k: 'Lab variance (ALT)', z: 0.7 }, { k: 'Dose modifications', z: 1.8 }] },
  { sid: '1102-019', site: '1102', anomaly: 2.2, top: 'Visit interval', status: 'normal', at: '2026-07-01', metrics: [{ k: 'Visit interval', z: 2.2 }, { k: 'AE count', z: 0.4 }, { k: 'Lab variance (ALT)', z: 0.9 }, { k: 'Dose modifications', z: 0.3 }, { k: 'Con-med count', z: 0.5 }] },
  { sid: '1113-005', site: '1113', anomaly: 1.8, top: 'Query rate', status: 'normal', at: '2026-07-01', metrics: [{ k: 'Query rate', z: 1.8 }, { k: 'AE count', z: 0.8 }, { k: 'Visit interval', z: 0.6 }, { k: 'Lab variance (ALT)', z: 0.5 }, { k: 'Con-med count', z: 0.1 }] },
  { sid: '1106-011', site: '1106', anomaly: 1.2, top: 'AE count', status: 'normal', at: '2026-07-01', metrics: [{ k: 'AE count', z: 1.2 }, { k: 'Visit interval', z: 0.4 }, { k: 'Lab variance (ALT)', z: 0.3 }, { k: 'Dose modifications', z: 0.6 }, { k: 'Con-med count', z: 0.4 }] },
];

/* -- Monitoring plan -- */

export const RBM_PLAN: RbmPlanData = {
  id: 'plan-bx204-301', title: 'BX204-301 risk-based monitoring plan', strategy: 'risk_based', status: 'draft', version: 2, updated: '2026-06-29',
  anaDraft: true, basis: 'Drafted by AnA (generate_rbm_plan) from RACT v3 -- pending human review and Part 11 approval.',
  tiers: { enhanced: 'Monthly on-site + 100% SDV on critical data', standard: 'Quarterly on-site + targeted SDV', reduced: 'Remote + central monitoring only' },
};

/* -- Monitoring actions -- */

export const RBM_ACTIONS: RbmAction[] = [
  { id: 'act-01', type: 'site_visit', title: 'Triggered visit -- site 1104 (AE reconciliation focus)', priority: 'high', owner: 'M. Torres', due: '2026-06-25', status: 'open', overdue: true, origin: 'plan' },
  { id: 'act-02', type: 'capa', title: 'QTL-01 breach CAPA -- discontinuation root-cause + retrieval plan', priority: 'critical', owner: 'S. Okafor', due: '2026-07-10', status: 'in_progress', origin: 'qtl' },
  { id: 'act-03', type: 'escalation', title: 'Escalate site 1109 data pattern to QA for for-cause review', priority: 'high', owner: 'J. Chen', due: '2026-07-08', status: 'open', origin: 'signal' },
  { id: 'act-04', type: 'query', title: 'Central queries -- visit-window deviations at 1104/1117', priority: 'medium', owner: 'CRA pool', due: '2026-07-15', status: 'in_progress', origin: 'plan' },
  { id: 'act-05', type: 'site_visit', title: 'Onboarding oversight visit -- site 1117 new PI', priority: 'high', owner: 'M. Torres', due: '2026-07-20', status: 'open', origin: 'oversight' },
  { id: 'act-06', type: 'issue', title: 'ALT calibration check at site 1121 local lab', priority: 'medium', owner: 'E. Ruiz', due: '2026-07-18', status: 'in_progress', origin: 'signal' },
  { id: 'act-07', type: 'query', title: 'Retrieval outreach -- 9 subjects missing RECIST week-24', priority: 'high', owner: 'CRA pool', due: '2026-07-12', status: 'open', origin: 'plan' },
  { id: 'act-08', type: 'issue', title: 'Update oversight log SOP acknowledgment -- all sites', priority: 'low', owner: 'S. Okafor', due: '2026-06-20', status: 'done', origin: 'plan' },
];

/* -- Shared action store (cross-surface persistence) -- */

export interface RbmActionStore {
  getActions: () => RbmAction[];
  addAction: (a: Partial<RbmAction>) => RbmAction;
  updateAction: (id: string, patch: Partial<RbmAction>) => void;
  subscribe: (fn: () => void) => () => void;
}

export function createRbmStore(): RbmActionStore {
  let actions = RBM_ACTIONS.slice();
  let seq = 100;
  let listeners: (() => void)[] = [];
  const emit = () => listeners.forEach((f) => f());
  return {
    getActions: () => actions,
    addAction: (a) => {
      const action: RbmAction = { id: `act-${++seq}`, status: 'open', overdue: false, origin: 'plan', type: '', title: '', priority: 'medium', owner: '', due: '—', ...a } as RbmAction;
      actions = [action, ...actions];
      emit();
      return action;
    },
    updateAction: (id, patch) => { actions = actions.map((x) => (x.id === id ? { ...x, ...patch } : x)); emit(); },
    subscribe: (fn) => { listeners.push(fn); return () => { listeners = listeners.filter((l) => l !== fn); }; },
  };
}

/* -- Risk review report -- */

export const RBM_REPORT: RbmReportData = {
  framework: 'ICH E6(R3) -- risk-based quality management', asOf: '2026-07-02 06:10 UTC', overallRisk: 'medium', approved: false, attentionCount: 7,
  headline: 'Study risk posture is medium and actively managed. One quality tolerance limit is breached (premature discontinuation) with a CAPA in progress; central statistical monitoring has isolated two high-severity site outliers now under investigation. Three of 24 sites carry enhanced-tier monitoring. The risk assessment is at v3 draft and requires approval.',
  sections: [
    { title: 'Risk assessment (RACT)', status: 'attention', items: [
      '12 critical-to-quality factors assessed; 4 critical (score >=15), 5 open.',
      'Highest inherent risk: AE/SAE capture completeness (L4xI5 = 20), mitigated to residual 8.',
      'Assessment v3 is draft -- approval with reason-for-change and e-signature is pending.',
    ] },
    { title: 'Key risk indicators', status: 'attention', items: [
      '6 KRIs active: 1 red (AE reporting lag 6.8d vs red 5d), 2 amber, 3 green.',
      'AE-lag trend rising 4 consecutive cycles; drivers isolated to sites 1104 and 1117.',
    ] },
    { title: 'Quality tolerance limits', status: 'critical', items: [
      'QTL-01 premature discontinuation breached: 12.4% vs 12% threshold (secondary 9% passed 2026-05-20).',
      'CAPA act-02 in progress; estimand impact assessment routed to biostatistics.',
      'QTL-02 ITT missing primary endpoint approaching: 6.1% vs secondary 5%, threshold 8%.',
    ] },
    { title: 'Central statistical monitoring', status: 'attention', items: [
      'Robust modified z-score run 2026-07-01 across 24 sites, 9 metrics.',
      '2 high-severity outliers: site 1104 AE under-reporting (|z| 4.1), site 1109 too-perfect pattern (|z| 3.4).',
      '412 patient profiles scored; 2 flagged, 3 in review.',
    ] },
    { title: 'Site oversight', status: 'attention', items: [
      '3 of 24 sites at enhanced tier (1104, 1117, 1109) -- drivers documented per site.',
      'Triggered visit at 1104 is 7 days overdue; for-cause QA review requested for 1109.',
    ] },
    { title: 'Monitoring plan', status: 'ok', items: [
      'Risk-based strategy v2 aligned to tier assignments; 8 actions tracked (1 overdue, 1 done).',
      'Plan is AnA-drafted and pending Part 11 approval before activation.',
    ] },
  ],
};
