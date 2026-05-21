/**
 * Global search — Phase 8.
 *
 * Cross-corpus search across every artifact, every audit entry, every
 * AnA conversation, every memory atom, every notification. Filters by
 * surface · kind · program · date · role.
 *
 * Wire shape: GET /api/mdx/search?q=&surface=&kind=&program=
 */

export const SEARCH_KINDS = [
  { id: 'artifact',     label: 'Artifacts',         icon: 'file' },
  { id: 'section',      label: 'Section content',   icon: 'pencil' },
  { id: 'audit',        label: 'Audit events',      icon: 'shield' },
  { id: 'conversation', label: 'AnA conversations', icon: 'chat' },
  { id: 'memory',       label: 'Memory atoms',      icon: 'database' },
  { id: 'notification', label: 'Notifications',     icon: 'bell' },
];

export const SEARCH_RESULTS = [
  { id: 's-1001', kind: 'artifact',     program: 'BX-204', surface: 'engineering', title: 'Risk Management Report — BX-204 (residual + benefit-risk)', snippet: 'Residual cybersecurity risk acceptable post-control. AES-128-GCM closes the BLE PHI exposure; risk drops S4P3 → S4P1.', author: 'JC', when: '2h ago', refId: 'doc-rmr-bx204' },
  { id: 's-1002', kind: 'section',      program: 'BX-204', surface: 'k510',        title: 'eSTAR §11 — Substantial Equivalence narrative', snippet: '…performance equivalence reaffirmed against K221847 (Dexcom G7). Force-curve diff < 4% from predicate. Adhesive Rev D introduces a minor change…', author: 'JC', when: '8h ago', refId: 'doc-srs-bx204' },
  { id: 's-1003', kind: 'audit',        program: 'CV-330', surface: 'admin',       title: 'MDR-0091 created · CV-330 5-day clock opened', snippet: '5-day clock opened — battery EOL alarm silent at 11 mo · ESG transmittal logged · SHA-256 chain ok', author: 'MW', when: '5h ago', refId: 'A-9924806' },
  { id: 's-1004', kind: 'conversation', program: 'BX-204', surface: 'engineering', title: 'AnA conversation · BX-204 SRS §02 drafting', snippet: '…walked through 14 candidate predicates and proposed K221847 as the primary. K252712 and K243088 are secondary…', author: 'JC + AnA', when: '12h ago', refId: 'conv-bx204-srs-2348' },
  { id: 's-1005', kind: 'memory',       program: 'MDX',    surface: 'memory',      title: 'm-2914 · Sentence case everywhere · pinned critical', snippet: 'Every heading, button, menu item, status label. We are reviewer-grade, not marketing. — pinned to every relevant conversation.', author: 'JC', when: '6d ago', refId: 'm-2914' },
  { id: 's-1006', kind: 'notification', program: 'BX-204', surface: 'postmarket',  title: 'BX-204 signal escalated to critical · SIG-2186', snippet: 'Sensor lift-off cluster grew from 22 to 28 events in 24h. AnA recommends wrapping in an MDR.', author: 'system', when: '3h ago', refId: 'SIG-2186' },
  { id: 's-1007', kind: 'artifact',     program: 'BX-204', surface: 'udi',         title: 'BX-204 IFU — US English v2.7', snippet: 'Indications for use, contraindications, warnings, precautions, intended population, sensor placement, calibration procedure…', author: 'JC', when: '6d ago', refId: 'doc-ifu-bx204-en' },
  { id: 's-1008', kind: 'section',      program: 'IV-415', surface: 'cer',         title: 'CER §4.2 — clinical evidence post-FAERS', snippet: '…Q2 FAERS signals incorporated. 3 events under adjudication: 1 likely device-related, 2 unrelated based on temporal proximity…', author: 'AM', when: '8h ago', refId: 'doc-cer-iv415' },
  { id: 's-1009', kind: 'memory',       program: 'MDX',    surface: 'memory',      title: 'm-2849 · SBOM mandatory · cybersec critical', snippet: 'SBOM is mandatory for all software-containing devices submitted after Oct 2023. Use CycloneDX or SPDX. Include all OTS, not just direct deps.', author: 'AnA + JC', when: '4d ago', refId: 'm-2849' },
  { id: 's-1010', kind: 'audit',        program: 'BX-204', surface: 'admin',       title: 'BX-204 510(k) eSTAR transmitted · FDA ESG', snippet: 'Cleared all gates · Tuesday transmittal · sealed v2.7 · audit chain hash a8e1ccd2…', author: 'JC', when: '7h ago', refId: 'A-9924807' },
];

export const SEARCH_KPIS = [
  { label: 'Search index size',  metric: '247k', meta: 'Indexed across 19 surfaces · refreshed every 4h' },
  { label: 'Today\'s searches',   metric: '38',   meta: '12 unique queries' },
  { label: 'Average latency',    metric: '120',  unit: 'ms', meta: 'p50 · cross-surface ranked retrieval', tone: 'ok' },
  { label: 'Pinned queries',     metric: '6',    meta: 'Saved across the team' },
];

export const SEARCH_SAVED = [
  { id: 'q-001', label: 'Open MDRs across portfolio',         q: 'kind:mdr status:open',          last: '14m ago' },
  { id: 'q-002', label: 'BX-204 predicate questions',          q: 'predicate K221847 BX-204',      last: '2h ago' },
  { id: 'q-003', label: 'Risk Management — residual + S4',     q: 'residual severity:S4',          last: '1d ago' },
  { id: 'q-004', label: 'Every signing event by Jordan in Q2', q: 'actor:JC action:sign date:Q2', last: '4d ago' },
];

