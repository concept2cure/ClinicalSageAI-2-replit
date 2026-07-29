(() => {
/* Global Tasking + Project Messaging — kit data
 * ─────────────────────────────────────────────────────────────
 * Cross-program task management + internal client/team messaging.
 * Wires the `tasking` rail item. Consumes (v2):
 *   tasks    → /api/submission-ops/workload + /api/approval-workflows/pending
 *   messages → /api/c2c/projects/:id/threads (new — needs a brief)
 * Lands at client/src/concept2cure/tasking/. */

const TK_COLUMNS = [
  { id: 'todo',    label: 'To do' },
  { id: 'doing',   label: 'In progress' },
  { id: 'review',  label: 'In review' },
  { id: 'blocked', label: 'Blocked' },
  { id: 'done',    label: 'Done' },
];

/* Tasks across every program — mine, my team's, what I owe, what's owed me. */
const TK_TASKS = [
  { id: 'T-4811', col: 'todo',    program: 'BX-204', title: 'Reconcile K221847 performance mismatch', assignee: 'JC', due: '1 wk',     tone: 'warn', kind: 'Reg analysis', mine: true },
  { id: 'T-4816', col: 'doing',   program: 'BX-204', title: 'Strengthen §2.5.4 against FDA 2023 bridging', assignee: 'JC', due: '2 days', tone: 'warn', kind: 'Authoring', mine: true },
  { id: 'T-4820', col: 'doing',   program: 'BX-301', title: 'CMC comparability protocol — new DS supplier', assignee: 'AR', due: '4 days', tone: 'warn', kind: 'CMC', mine: false },
  { id: 'T-4818', col: 'review',  program: 'BX-204', title: '§2.7 clinical summary — your sign-off', assignee: 'JC', due: 'Today',   tone: 'err',  kind: 'Review', mine: true },
  { id: 'T-4812', col: 'todo',    program: 'BX-099', title: 'PSUR §15 risk evaluation first draft', assignee: 'TP', due: '18 days',  tone: 'ok',   kind: 'PV', mine: false },
  { id: 'T-4805', col: 'blocked', program: 'BX-290', title: 'EMA scientific advice outcome — overdue', assignee: 'TP', due: 'Overdue', tone: 'err',  kind: 'Meeting', mine: false },
  { id: 'T-4822', col: 'review',  program: 'BX-D2',  title: 'RK-003 dual-algorithm control verification', assignee: 'AM', due: '3 days', tone: 'warn', kind: 'Risk', mine: false },
  { id: 'T-4801', col: 'done',    program: 'BX-204', title: 'NDA 212345 transmitted to FDA ESG', assignee: 'JC', due: 'Today',   tone: 'ok',   kind: 'Submission', mine: true },
  { id: 'T-4799', col: 'done',    program: 'BX-620', title: 'Annual report CMC variation filed', assignee: 'MS', due: 'Yesterday', tone: 'ok',  kind: 'Lifecycle', mine: false },
];

/* Internal project message threads — team + (optionally) the client. */
const TK_THREADS = [
  { id: 'th-1', program: 'BX-204', topic: 'Day-150 LoQ projection', unread: 2, members: ['JC','SM','BK'], last: 'Sofia: queued the strengthen pass on §2.5.4', when: '38m' },
  { id: 'th-2', program: 'BX-301', topic: 'New DS supplier comparability', unread: 0, members: ['AR','TP','JC'], last: 'Alex: PPQ run 2 of 3 complete, CQAs in range', when: '2h' },
  { id: 'th-3', program: 'BX-204', topic: 'CMO standup — daily', unread: 5, members: ['JC','MS','TP','AR','BK'], last: 'You: building one-line status per program', when: '4h' },
  { id: 'th-4', program: 'BX-290', topic: 'EMA advice escalation', unread: 1, members: ['TP','JC'], last: 'Theo: advice outcome is overdue, escalating to rapporteur', when: '1d' },
];

/* Open thread messages (for the BX-204 Day-150 thread). */
const TK_MESSAGES = [
  { who: 'Jordan Chen', init: 'JC', text: 'AnA flagged the §2.5.4 bridging argument and §2.5.5 subgroup as the two most likely to draw a Day-150 query. Can we get ahead of both?', when: '2h ago', me: true },
  { who: 'Brooke Kim',  init: 'BK', text: 'Subgroup is on me — I can have the pre-specified analysis cross-referenced to SAP §9.4 by EOD.', when: '1h ago', me: false },
  { who: 'AnA 1.0',     init: 'A',  text: 'Pulled the FDA 2023 bridging guidance and EMEA/H/C/005612 precedent (RIM 0.91). Drafted a strengthen pass for §2.5.4 — pending Sofia\u2019s review in the authoring workbench.', when: '45m ago', ana: true },
  { who: 'Sofia Marchetti', init: 'SM', text: 'Queued the strengthen pass on §2.5.4. Will sign off once Brooke\u2019s subgroup cross-ref lands.', when: '38m ago', me: false },
];

const TK_SUGGESTIONS = [
  'Show everything assigned to me, sorted by urgency',
  'What am I blocking for other people right now?',
  'Summarize the BX-204 Day-150 thread and what\u2019s left to do',
  'Reassign the overdue BX-290 EMA task and notify the owner',
];

window.TK_COLUMNS = TK_COLUMNS;
window.TK_TASKS = TK_TASKS;
window.TK_THREADS = TK_THREADS;
window.TK_MESSAGES = TK_MESSAGES;
window.TK_SUGGESTIONS = TK_SUGGESTIONS;

})();
