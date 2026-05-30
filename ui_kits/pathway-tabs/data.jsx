(() => {
/* Pathway sub-tabs — Audit · Correspondence · Approvals
 * ─────────────────────────────────────────────────────────────
 * One reusable 3-tab strip that drops into every program surface
 * (MDX 510k/PMA/CER, biopharma IND/NDA/BLA/MAA). Consumes:
 *   Audit         → /api/audit/logs?program=…   (21 CFR Part 11 chain)
 *   Correspondence→ /api/regulatory-correspondence/correspondence (HAQ/deficiency)
 *   Approvals     → /api/approval-workflows/pending
 * Lands at client/src/concept2cure/_shared/program/ProgramSubTabs.tsx,
 * driven by mdx/data/pathwayTabs.ts (the @kit-registry-no-consumer-yet
 * taxonomy). */

/* 21 CFR Part 11 audit chain — every governed action, hash-linked. */
const PT_AUDIT = [
  { id: 'a1', action: 'authoring.section.sign',     actor: 'Jordan Chen',  meaning: 'Approval',  target: '§2.5 Clinical overview', reason: 'Final QC pass complete; data integrity attested', when: '7 min ago',  hash: 'a8c2…f019' },
  { id: 'a2', action: 'agent.ana.section.ai_draft', actor: 'AnA 1.0',      meaning: null,        target: '§2.5.4 Clinical bridging', reason: 'Strengthen pass against FDA 2023 bridging guidance', when: '34 min ago', hash: 'b41a…7d22' },
  { id: 'a3', action: 'authoring.section.transition',actor: 'Sofia Marchetti', meaning: null,    target: '§3.2.S Drug substance', reason: 'Reviewer feedback addressed; moving to QC', when: '2 h ago',    hash: 'c7e1…9b03' },
  { id: 'a4', action: 'submission.package.transmit', actor: 'Jordan Chen',  meaning: 'Release',   target: 'NDA 212345 · seq 0001', reason: 'Authorized transmission to FDA ESG', when: 'Today 06:12', hash: 'd2f8…1a55' },
  { id: 'a5', action: 'authoring.evidence.link',     actor: 'Alex Reyes',   meaning: null,        target: '§3.2.S.7.3 → CSR-201', reason: 'Anchored stability claim to source table', when: 'Yesterday',  hash: 'e9b0…44c1' },
  { id: 'a6', action: 'authoring.section.lock',      actor: 'Brooke Kim',   meaning: 'Responsibility', target: 'PSP — pediatric study plan', reason: 'Locked to v1.0 for submission', when: '6 days ago', hash: 'f014…22ab' },
];

/* Health-authority correspondence — HAQ / deficiency / acknowledgement threads. */
const PT_CORRESPONDENCE = [
  { id: 'c1', kind: 'HAQ',          agency: 'FDA',  subject: 'CMC stability trend at 18 months', received: '2026-04-22', due: '5 days', status: 'drafting', thread: 3, owner: 'AR' },
  { id: 'c2', kind: 'HAQ',          agency: 'FDA',  subject: 'Adverse event narrative — subj 014-008', received: '2026-04-22', due: '5 days', status: 'open', thread: 1, owner: 'TP' },
  { id: 'c3', kind: 'Deficiency',   agency: 'EMA',  subject: 'Day 80 list of questions — 23 items, 4 major', received: '2026-05-26', due: '38 days', status: 'in-progress', thread: 12, owner: 'SM' },
  { id: 'c4', kind: 'Acknowledgement', agency: 'FDA', subject: 'NDA 212345 receipt — Core ID assigned', received: 'Today 06:14', due: null, status: 'closed', thread: 1, owner: 'JC' },
  { id: 'c5', kind: 'Meeting minutes', agency: 'FDA', subject: 'Type C pediatric extrapolation — aligned', received: '2026-02-28', due: null, status: 'closed', thread: 2, owner: 'JC' },
];

/* Approval workflows — pending sign-off chains. */
const PT_APPROVALS = [
  { id: 'w1', target: '§2.5 Clinical overview', step: 2, total: 3, current: 'Medical writer → Reg lead → QA', waitingOn: 'Jordan Chen', role: 'Reg lead', sla: 'Due today', tone: 'warn' },
  { id: 'w2', target: '§3.2.S Drug substance', step: 1, total: 3, current: 'CMC lead → Reg lead → QA', waitingOn: 'Alex Reyes', role: 'CMC lead', sla: '2 days', tone: 'ok' },
  { id: 'w3', target: 'NDA 212345 submission gate', step: 3, total: 3, current: 'Reg lead → QA → VP Reg', waitingOn: 'VP Regulatory', role: 'VP Reg', sla: 'Blocks filing', tone: 'err' },
];

window.PT_AUDIT          = PT_AUDIT;
window.PT_CORRESPONDENCE = PT_CORRESPONDENCE;
window.PT_APPROVALS      = PT_APPROVALS;

})();
