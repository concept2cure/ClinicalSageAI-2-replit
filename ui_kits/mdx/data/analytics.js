(() => {
/**
 * Analytics surface data — portfolio metrics, cycle times, reviewer velocity,
 * blocker root-cause aggregation, AnA usage.
 *
 * Read-only, aggregated. Sources Claude Code wires to:
 *   • Programs       — useMdxPrograms
 *   • Cycle times    — derived from audit_logs phase transitions
 *   • Blockers       — c2c_project_blockers grouped by cause
 *   • Reviewer       — public FDA 510(k)/PMA decision dates by product code
 *   • AnA usage      — ai_request_log aggregated by day × tool
 */

const ANL_KPIS = [
  { label: 'Portfolio cycle time',  metric: '187', unit: 'd', meta: 'Median pre-sub → clearance', tone: 'warn',  delta: '+8d vs peer p50' },
  { label: 'Submissions cleared',   metric: '14',         meta: 'Trailing 12 months · 3 first-cycle',         delta: '+2 vs LY' },
  { label: 'Median deficiencies',   metric: '4',          meta: 'Per 510(k) at AI-review',                    tone: 'ok',  delta: '−2 vs peer p50' },
  { label: 'AnA acceptance rate',   metric: '74', unit: '%', meta: 'Drafts accepted within 48h · all sections', tone: 'ok',  delta: '+11 pts QoQ' },
];

/* Cycle times broken down by phase, per pathway. Each phase has the org
   median, the peer-cohort median (FDA public decision data), and a delta. */
const ANL_CYCLE_PHASES = [
  { phase: 'Intake → predicate',      k510: { org: 18,  peer: 22, units: 'd' }, pma: { org: 26,  peer: 30, units: 'd' } },
  { phase: 'Predicate → spec',        k510: { org: 31,  peer: 28, units: 'd' }, pma: { org: 0,   peer: 0,  units: 'd' } },
  { phase: 'Spec → V&V',              k510: { org: 64,  peer: 71, units: 'd' }, pma: { org: 142, peer: 168, units: 'd' } },
  { phase: 'V&V → eSTAR / module',    k510: { org: 28,  peer: 24, units: 'd' }, pma: { org: 41,  peer: 38, units: 'd' } },
  { phase: 'Submit → RTA',            k510: { org: 12,  peer: 11, units: 'd' }, pma: { org: 14,  peer: 12, units: 'd' } },
  { phase: 'RTA → SE / approval',     k510: { org: 87,  peer: 92, units: 'd' }, pma: { org: 312, peer: 348, units: 'd' } },
];

/* Top blockers — what's stopping submissions, with frequency and median age. */
const ANL_BLOCKERS = [
  { cause: 'Predicate performance data mismatch',     count: 8, median: 21, owner: 'JC', pathway: 'k510', trend: 'up'   },
  { cause: 'Software cybersecurity SBOM not final',   count: 6, median: 34, owner: 'PS', pathway: 'mixed', trend: 'up'   },
  { cause: 'Biocompatibility report supplier signature', count: 5, median: 18, owner: 'LT', pathway: 'k510', trend: 'flat' },
  { cause: 'DSMB charter pending CRO sign-off',       count: 4, median: 41, owner: 'MW', pathway: 'pma',  trend: 'flat' },
  { cause: 'FAERS signal adjudication',                count: 4, median: 28, owner: 'AM', pathway: 'cer',  trend: 'up'   },
  { cause: 'eSTAR §11 SE narrative — predicate gap',   count: 3, median: 12, owner: 'JC', pathway: 'k510', trend: 'down' },
  { cause: 'MRI-conditional statement language',       count: 3, median: 22, owner: 'MW', pathway: 'pma',  trend: 'flat' },
  { cause: 'Clinical evaluation literature gap',       count: 2, median: 38, owner: 'AM', pathway: 'cer',  trend: 'flat' },
];

/* Reviewer velocity — public FDA decision-time data per product code, plus
   org's own first-cycle rate. */
const ANL_REVIEWERS = [
  { code: 'NBW', name: 'Glucose monitor', n: 47,  median: 87,  fastest: 64,  slowest: 142, firstCycle: 31, orgMedian: 72,  pathway: 'k510' },
  { code: 'DQK', name: 'Cardiac monitor, implantable', n: 12, median: 312, fastest: 248, slowest: 412, firstCycle: 18, orgMedian: 268, pathway: 'pma' },
  { code: 'KZO', name: 'Hematology analyzer, point-of-care', n: 22, median: 104, fastest: 71,  slowest: 188, firstCycle: 28, orgMedian: 0,   pathway: 'k510' },
  { code: 'HRX', name: 'Bone fixation appliance',  n: 88,  median: 71,  fastest: 48,  slowest: 121, firstCycle: 42, orgMedian: 81,  pathway: 'k510' },
  { code: 'OYC', name: 'Software-only diagnostic', n: 19,  median: 94,  fastest: 67,  slowest: 156, firstCycle: 24, orgMedian: 88,  pathway: 'k510' },
  { code: 'LZG', name: 'Companion in-vitro diagnostic', n: 8, median: 348, fastest: 281, slowest: 458, firstCycle: 12, orgMedian: 0,   pathway: 'pma' },
];

/* AnA usage — tool calls over the last 8 weeks. */
const ANL_ANA_USAGE = [
  { tool: 'search_predicates',    calls: 412, accepted: 318, drafts: 0,   pathway: 'k510' },
  { tool: 'get_se_matrix',        calls: 188, accepted: 161, drafts: 0,   pathway: 'k510' },
  { tool: 'draft_section',        calls: 348, accepted: 261, drafts: 348, pathway: 'mixed' },
  { tool: 'run_judgment',         calls: 142, accepted: 134, drafts: 0,   pathway: 'mixed' },
  { tool: 'search_literature',    calls: 224, accepted: 188, drafts: 0,   pathway: 'cer'  },
  { tool: 'search_adverse',       calls: 196, accepted: 174, drafts: 0,   pathway: 'cer'  },
  { tool: 'create_artifact',      calls:  88, accepted:  82, drafts: 88,  pathway: 'mixed' },
  { tool: 'get_evidence_chain',   calls:  74, accepted:  71, drafts: 0,   pathway: 'mixed' },
];

/* Pace of clearance — 24 months, count of cleared per month. Drives the
   horizon plot at the top of the page. */
const ANL_PACE_24M = [
  0,0,1,1,0,2,1,0,1,2,1,1,
  2,0,1,1,2,1,3,2,1,2,1,1,
];


// Window globals (kit harness only — codebase uses ESM imports)
window.ANL_KPIS = ANL_KPIS;
window.ANL_CYCLE_PHASES = ANL_CYCLE_PHASES;
window.ANL_BLOCKERS = ANL_BLOCKERS;
window.ANL_REVIEWERS = ANL_REVIEWERS;
window.ANL_ANA_USAGE = ANL_ANA_USAGE;
window.ANL_PACE_24M = ANL_PACE_24M;

})();
