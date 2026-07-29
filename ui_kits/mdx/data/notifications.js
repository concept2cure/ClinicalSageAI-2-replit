/**
 * Notifications inbox — Phase 5
 *
 * Cross-surface signal feed: overdue items, gate failures, AnA drafts,
 * vigilance signals, Q-Sub feedback, CAPA escalations, member changes.
 *
 * Wire shape: GET /api/mdx/notifications?unread=true
 */

(() => {

const NOTIF_KINDS = [
  { id: 'overdue',  label: 'Overdue',         tone: 'err' },
  { id: 'gate',     label: 'Gate failure',    tone: 'err' },
  { id: 'ana',      label: 'AnA draft',       tone: 'warn' },
  { id: 'vigil',    label: 'Vigilance signal',tone: 'warn' },
  { id: 'qsub',     label: 'Q-Sub feedback',  tone: 'info' },
  { id: 'capa',     label: 'CAPA escalation', tone: 'err' },
  { id: 'access',   label: 'Access change',   tone: 'info' },
  { id: 'agency',   label: 'Agency comms',    tone: 'info' },
];

const NOTIF_KPIS = [
  { label: 'Unread',          metric: '14', meta: '4 critical · 7 important · 3 info',  tone: 'warn' },
  { label: 'Today',           metric: '37', meta: 'Across 8 surfaces' },
  { label: 'Action required', metric: '6',  meta: 'Sign · accept · transmit · review',  tone: 'err' },
  { label: 'Mute rules',      metric: '4',  meta: 'Filter rules · per surface' },
];

const NOTIFS = [
  { id: 'N-7821', kind: 'overdue',  unread: true,  when: '4m ago',  surface: 'postmarket',   ref: 'MDR-0091',          who: 'system', title: 'FDA 5-day clock — 23h remaining',                        body: 'CV-330 malfunction MDR is in draft at 62% completion. Device-history file pull pending.', cta: 'Open MDR' },
  { id: 'N-7820', kind: 'gate',     unread: true,  when: '14m ago', surface: 'submissions',  ref: 'sub-bx204-k510',    who: 'system', title: 'BX-204 510(k) gate failure',                              body: 'eSTAR validation found 2 errors on §11 SE narrative. Cover letter signed but cannot transmit.', cta: 'Open gate' },
  { id: 'N-7819', kind: 'ana',      unread: true,  when: '1h ago',  surface: 'engineering',  ref: 'doc-rmr-bx204',     who: 'AnA',    title: 'Draft ready · Risk Management Report §8',                 body: 'AnA drafted the residual-acceptability section based on R-061 + R-071 closure status. Awaiting your review.', cta: 'Review draft' },
  { id: 'N-7818', kind: 'capa',     unread: true,  when: '2h ago',  surface: 'postmarket',   ref: 'CAPA-0217',         who: 'system', title: 'CAPA-0217 SLA at 50% — investigation incomplete',          body: 'Root cause not yet identified for CV-330 battery EOL alarm. 30d of 60d SLA elapsed.', cta: 'Open CAPA' },
  { id: 'N-7817', kind: 'vigil',    unread: true,  when: '3h ago',  surface: 'postmarket',   ref: 'SIG-2186',          who: 'system', title: 'BX-204 signal escalated to critical',                     body: 'Sensor lift-off cluster grew from 22 to 28 events in 24h. AnA recommends wrapping in an MDR.', cta: 'Review signal' },
  { id: 'N-7816', kind: 'ana',      unread: true,  when: '4h ago',  surface: 'udi',          ref: 'doc-ifu-bx204-de',  who: 'AnA',    title: 'Draft ready · BX-204 IFU translation review (DE)',         body: 'AnA flagged 3 segments where the German translation may not preserve the regulatory phrasing precisely.', cta: 'Review draft' },
  { id: 'N-7815', kind: 'qsub',     unread: false, when: '8h ago',  surface: 'pre-sub',      ref: 'qsub-bx204-q2',     who: 'FDA',    title: 'FDA Q-Sub feedback received',                              body: 'CDRH responded to your Pre-Sub on BX-204 predicate strategy. 4 points of feedback.', cta: 'Open Q-Sub' },
  { id: 'N-7814', kind: 'overdue',  unread: false, when: '1d ago',  surface: 'k510',         ref: 'doc-srs-bx204',     who: 'system', title: 'Section §02 review past due',                              body: 'Design Input Specification was due for peer review 2d ago. Owner: AK; reviewer: JC.',  cta: 'Open section' },
  { id: 'N-7813', kind: 'agency',   unread: false, when: '1d ago',  surface: 'predicate',    ref: 'K254481',           who: 'FDA',    title: 'CV-117 clearance letter received',                         body: 'FDA cleared CV-117 ECG Patch under K254481 · 87-day review cycle. Letter filed in vault.', cta: 'View letter' },
  { id: 'N-7812', kind: 'access',   unread: false, when: '2d ago',  surface: 'admin',        ref: 'u-pb',              who: 'JC',     title: 'New member onboarded · Phoebe Brennan',                    body: 'Phoebe Brennan (Editor, Reg Affairs) invited with access to BX-204 + OR-801 programs.', cta: 'View member' },
  { id: 'N-7811', kind: 'capa',     unread: false, when: '2d ago',  surface: 'postmarket',   ref: 'CAPA-0215',         who: 'SM',     title: 'CAPA-0215 effectiveness verification scheduled',           body: 'OR-801 supplier change CAPA enters verify stage. Effectiveness check scheduled for 2026-05-18.', cta: 'View CAPA' },
];

window.NOTIF_KINDS = NOTIF_KINDS;
window.NOTIF_KPIS = NOTIF_KPIS;
window.NOTIFS = NOTIFS;

})();
