/**
 * AnA conversation history archive — Phase 8.
 *
 * Per-program threaded record of every AnA conversation. Search, pin,
 * export to PDF for the regulatory record. Linkage from a section's
 * audit log back to the conversation that produced the draft.
 *
 * Wire shape: GET /api/mdx/conversations?program=&pinned=&from=&to=&q=
 */

export const CONV_KPIS = [
  { label: 'Total conversations',  metric: '1,847', meta: 'Across all programs · 12-month retention' },
  { label: 'Pinned',                metric: '24',    meta: 'Across 8 programs · marked as canonical' },
  { label: 'Active today',          metric: '14',    meta: '6 reviewers · 7 programs · 3 surfaces' },
  { label: 'Drafts produced',       metric: '342',   meta: 'Conversations that resulted in an artifact change' },
];

export const CONVERSATIONS = [
  { id: 'conv-bx204-srs-2348', program: 'BX-204', surface: 'engineering', topic: 'SRS §02 — design inputs walkthrough', turns: 38, lastActive: '12h ago', participants: ['JC', 'AK', 'AnA'], pinned: true,  draftedDocs: 2, summary: 'Walked through 14 candidate predicates; settled on K221847 primary, K252712/K243088 secondary. Identified rapid-drop hysteresis as minor SE difference.' },
  { id: 'conv-cv330-dsmb-2347', program: 'CV-330', surface: 'pma',         topic: 'DSMB charter — interim analysis criteria', turns: 22, lastActive: '1d ago', participants: ['MW', 'AnA'],            pinned: true,  draftedDocs: 1, summary: 'Aligned on interim-analysis triggers: stopping rule at n=300 if SAE rate > 8%. CRO sign-off pending.' },
  { id: 'conv-iv415-per-2345', program: 'IV-415', surface: 'cer',         topic: 'EU IVDR PER — clinical evidence sec 4.2', turns: 31, lastActive: '3h ago', participants: ['AM', 'JC', 'AnA'],      pinned: false, draftedDocs: 3, summary: 'Drafted CER §4.2 clinical evidence incorporating Q2 FAERS signals. 3 events adjudicated.' },
  { id: 'conv-or801-cap-2344', program: 'OR-801', surface: 'postmarket',  topic: 'CAPA-0215 root-cause investigation',    turns: 18, lastActive: '6h ago', participants: ['SM', 'AK', 'AnA'],      pinned: false, draftedDocs: 1, summary: 'Confirmed Plant 2 → Plant 5 supplier change resolves the screw-head stripping issue. Effectiveness verification scheduled.' },
  { id: 'conv-bx204-mdr-2342', program: 'BX-204', surface: 'postmarket',  topic: 'MDR-0090 narrative draft',               turns: 14, lastActive: '8h ago', participants: ['JC', 'AnA'],            pinned: false, draftedDocs: 1, summary: 'AnA drafted FDA Form 3500A narrative based on 3 events from FAERS signal SIG-2181. Causality classification pending clinician sign-off.' },
  { id: 'conv-pm660-pccp-2340',program: 'PM-660', surface: 'engineering', topic: 'PCCP scope for adaptive algorithm',      turns: 24, lastActive: '2d ago', participants: ['PS', 'AK', 'AnA'],      pinned: true,  draftedDocs: 0, summary: 'Scoped PCCP boundaries: adaptive threshold within ±5% of validated baseline, hold-out cohort gate at sens > 92%.' },
];

export const CONV_FILTERS = [
  { id: 'all',     label: 'All' },
  { id: 'pinned',  label: 'Pinned' },
  { id: 'today',   label: 'Today' },
  { id: 'drafted', label: 'Produced a draft' },
];

