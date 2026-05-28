/**
 * Phase 7 · AnA review queue.
 *
 * Every AnA-generated draft, across every surface, in one queue. Reviewers
 * see what's waiting on them, filter by author / surface / age, and
 * accept / refine / reject in bulk. Each accept fires the Phase 5
 * e-signature flow before the draft becomes part of the artifact.
 */

(() => {

const ARQ_KPIS = [
  { label: 'Drafts pending',     metric: '24', meta: '6 critical · 11 high · 7 medium',                tone: 'warn' },
  { label: 'Average wait',       metric: '14', unit: 'h', meta: 'Median time draft → first decision', tone: 'warn' },
  { label: 'Acceptance rate 30d',metric: '74', unit: '%', meta: '18 accepted · 4 refined · 2 rejected', tone: 'ok'   },
  { label: 'Drafted by AnA today',metric:'9',  meta: 'Across 7 surfaces' },
];

const ARQ_FILTERS = [
  { id: 'all',         label: 'All pending' },
  { id: 'mine',        label: 'Assigned to me' },
  { id: 'unowned',     label: 'No reviewer' },
  { id: 'stale',       label: '> 24h' },
];

const ARQ_DRAFTS = [
  { id: 'd-4218', surface: 'engineering', program: 'BX-204', section: 'Risk Management Report §8 — residual acceptability', confidence: 0.92, status: 'pending', author: 'AnA · Opus 4.5', when: '1h ago', reviewer: 'JC', priority: 'critical', evidenceN: 14, sources: ['m-2849 cybersec SBOM rule', 'VER-061 pen test', 'R-061 acceptability'], summary: 'Residual cybersecurity risk acceptable post-control. AES-128-GCM closes the BLE PHI exposure; risk drops S4P3 → S4P1.' },
  { id: 'd-4217', surface: 'udi',         program: 'BX-204', section: 'IFU §3 — German translation review',                confidence: 0.81, status: 'pending', author: 'AnA · Sonnet 4.5', when: '4h ago', reviewer: 'AM', priority: 'high',     evidenceN: 8,  sources: ['m-2733 SE first-mention rule', 'IFU baseline v2.7'], summary: '3 segments flagged where the German translation may not preserve regulatory phrasing precisely. Proposed edits attached.' },
  { id: 'd-4216', surface: 'postmarket',  program: 'CV-330', section: 'MDR-0091 Form 3500A narrative',                       confidence: 0.88, status: 'pending', author: 'AnA · Opus 4.5', when: '6h ago', reviewer: 'MW', priority: 'critical', evidenceN: 22, sources: ['SIG-2184 signal', 'device-history file', 'pacing-amp logs'], summary: 'Initial narrative for the 5-day MDR. Device-history file pull synthesized; awaits clinician sign-off on root-cause classification.' },
  { id: 'd-4215', surface: 'cer',         program: 'IV-415', section: 'CER §4.2 — clinical evidence post-FAERS',             confidence: 0.79, status: 'pending', author: 'AnA · Opus 4.5', when: '8h ago', reviewer: 'AM', priority: 'high',     evidenceN: 41, sources: ['FAERS adjudication 3 events', 'EU EUDAMED feed', '1,842 lit hits'], summary: 'Updated clinical evidence summary incorporating Q2 FAERS signals and the 3-event adjudication. Reviewer should confirm causality classification.' },
  { id: 'd-4214', surface: 'k510',        program: 'OR-801', section: 'eSTAR §11 — SE narrative refresh',                    confidence: 0.95, status: 'pending', author: 'AnA · Opus 4.5', when: '11h ago', reviewer: 'SM', priority: 'high',     evidenceN: 6,  sources: ['m-2810 K221847 predicate', 'side-by-side bench table v4'], summary: 'SE narrative regenerated after Plant 5 supplier change. Mechanical performance equivalence reaffirmed; force-curve diff < 4% from predicate.' },
  { id: 'd-4213', surface: 'engineering', program: 'PM-660', section: 'Software SRS §5 — algorithm requirements',             confidence: 0.84, status: 'pending', author: 'AnA · Opus 4.5', when: '14h ago', reviewer: 'PS', priority: 'medium',   evidenceN: 18, sources: ['m-2849 cybersec rule', 'IEC 62304 §5.2 template'], summary: 'Class C software requirements refined to specify hysteresis + dwell-time gating per CAPA-0216 algorithm.' },
  { id: 'd-4212', surface: 'quality',     program: '—',      section: 'SOP-820-50 supplier controls v3.1',                  confidence: 0.91, status: 'pending', author: 'AnA · Sonnet 4.5', when: '1d ago', reviewer: 'SM', priority: 'high',     evidenceN: 4,  sources: ['CAPA-0215 closure', 'Plant 5 quality agreement'], summary: 'SOP §4.3 updated to reflect dual-supplier risk-based audit cadence (annual for Plant 5, quarterly for Plant 2 during phase-out).' },
  { id: 'd-4211', surface: 'postmarket',  program: 'BX-204', section: 'PSUR-2025 §6 — adverse-event summary',                 confidence: 0.86, status: 'pending', author: 'AnA · Opus 4.5', when: '1d ago', reviewer: 'JC', priority: 'medium',   evidenceN: 28, sources: ['MAUDE feed', 'EUDAMED feed', 'complaint data'], summary: 'Q2 adverse-event summary aggregated. 28 events: 1 serious-injury (MDR-0090), 7 review, 20 watching. Trend chart attached.' },
  { id: 'd-4210', surface: 'cer',         program: 'IV-415', section: 'CER §7 — benefit-risk conclusion',                    confidence: 0.71, status: 'refine',  author: 'AnA · Opus 4.5', when: '2d ago', reviewer: 'AM', priority: 'high',     evidenceN: 12, sources: ['CP-001 sens/spec', 'CP-004 intended-pop pending'], summary: 'Refined per first review — benefit-risk holds, but reviewer asked for explicit acknowledgment that intended-population cohort is still enrolling.' },
];

window.ARQ_KPIS = ARQ_KPIS;
window.ARQ_FILTERS = ARQ_FILTERS;
window.ARQ_DRAFTS = ARQ_DRAFTS;

})();
