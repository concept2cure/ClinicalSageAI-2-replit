/**
 * Pathway panes fixture data -- audit trail, correspondence/HAQ, approvals.
 * Verbatim from the kit's pathway-panes.jsx: Part-11 hash-chained audit
 * events, FDA HAQ/IR correspondence with triage, and e-sign approvals
 * for the BX-204 program.
 */

/* ── Types ── */

export interface AuditKindMeta {
  label: string;
  tone: string;
}

export interface AuditEvent {
  id: string;
  when: string;
  kind: string;
  actor: string;
  role: string;
  target: string;
  target_id?: string;
  ip: string;
  signed?: boolean;
  sig?: string;
  reason?: string;
  diff?: string;
  file?: string;
  body?: string;
  hash: string;
  prev: string;
}

export interface CorrespondenceRef {
  section: string;
  label: string;
}

export interface CorrespondenceTriage {
  ana: string;
  owner: string;
  priority: string;
  tasks: number;
}

export interface CorrespondenceItem {
  id: string;
  kind: string;
  channel: string;
  from: string;
  received: string;
  due: string | null;
  status: string;
  ai: boolean;
  subject: string;
  refs: CorrespondenceRef[];
  summary: string;
  triage: CorrespondenceTriage | null;
}

export interface ApprovalItem {
  id: string;
  stage: string;
  target: string;
  target_id?: string;
  target_kind: string;
  requested: string;
  requested_by: string;
  signer: string;
  role: string;
  status: string;
  due?: string;
  meaning?: string;
  signed_at?: string;
}

export interface PathwayData {
  audit: AuditEvent[];
  correspondence: CorrespondenceItem[];
  approvals: ApprovalItem[];
  corrLabel: string;
}

export interface BioPathwaySurfaceConfig {
  pathway: string;
  sub: string;
}

/* ── Audit kind meta ── */

export const AUDIT_KIND_META: Record<string, AuditKindMeta> = {
  'section.edit':    { label: 'Edit',     tone: 'neutral' },
  'section.lock':    { label: 'Lock',     tone: 'neutral' },
  'section.unlock':  { label: 'Unlock',   tone: 'warn'    },
  'review.start':    { label: 'Review',   tone: 'neutral' },
  'review.complete': { label: 'Verified', tone: 'success' },
  'sign':            { label: 'E-sign',   tone: 'accent'  },
  'comment':         { label: 'Comment',  tone: 'neutral' },
  'attach':          { label: 'Attach',   tone: 'neutral' },
  'export':          { label: 'Export',   tone: 'neutral' },
  'access':          { label: 'Access',   tone: 'neutral' },
};

/* ── Hash-chain synthesizer -- visually links prev to this per row ── */

interface HashEntry {
  hash: string;
  prev: string;
}

export function ppChain(seed: number, n: number): HashEntry[] {
  const out: HashEntry[] = [];
  let prev = seed >>> 0;
  for (let i = 0; i < n; i++) {
    const cur = (prev * 2654435761 + 0x9e3779b9) >>> 0;
    out.push({
      hash: cur.toString(16).padStart(8, '0') + '…' + (cur ^ 0xa5a5a5a5).toString(16).padStart(4, '0'),
      prev: prev.toString(16).padStart(8, '0'),
    });
    prev = cur;
  }
  return out;
}

/* ── Time / date helpers ── */

export function ppFmtTime(iso: string, opts: { full?: boolean } = {}): string {
  const d = new Date(iso);
  const now = Date.now();
  const ageH = (now - d.getTime()) / 3.6e6;
  if (opts.full || ageH > 24 * 14) {
    return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  }
  if (ageH < 1) return `${Math.max(1, Math.round(ageH * 60))}m ago`;
  if (ageH < 24) return `${Math.round(ageH)}h ago`;
  return `${Math.round(ageH / 24)}d ago`;
}

export function ppFmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric' });
}

export function ppDaysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const d = new Date(iso + 'T00:00:00Z');
  return Math.round((d.getTime() - Date.now()) / 86400000);
}

/* ── Program-bound biopharma pathway data ── */

interface ProgramArg {
  code?: string;
  app?: string;
}

export function bioPathwayData(program?: ProgramArg | null): PathwayData {
  const code = (program && program.code) || 'BX-204';
  const app = (program && program.app) || 'NDA 212345';
  const agency = 'FDA · CDER';

  /* Audit -- Part-11 events across the CTD, hash-chained. */
  const auditRaw = [
    { id: 'a-012', when: '2026-05-08T15:20:11Z', kind: 'sign',            actor: 'Jordan Chen',     role: 'Reg Lead',      target: 'Form FDA 356h — Application to Market', ip: '10.0.4.21', signed: true, sig: 'WP-8841', reason: 'Application approved for submission' },
    { id: 'a-011', when: '2026-05-08T11:04:47Z', kind: 'review.complete', actor: 'Priya Shah',      role: 'QA',            target: '§2.5 Clinical Overview', target_id: '2.5', ip: '10.0.4.88' },
    { id: 'a-010', when: '2026-05-07T16:41:02Z', kind: 'sign',            actor: 'Dr. Lee Hartman', role: 'Medical',       target: '§2.7.4 Summary of Clinical Safety', target_id: '2.7.4', ip: '10.0.4.62', signed: true, sig: 'WP-8830', reason: 'Reviewed and medically approved' },
    { id: 'a-009', when: '2026-05-07T14:33:48Z', kind: 'section.edit',    actor: 'Raj Nair',        role: 'Biostatistics', target: '§5.3.5.1 ISS — integrated safety', target_id: '5.3.5.1', diff: '+142 / −18', ip: '10.0.4.55' },
    { id: 'a-008', when: '2026-05-07T09:12:30Z', kind: 'comment',         actor: 'Priya Shah',      role: 'QA',            target: '§3.2.S.4.4 Comparability', target_id: '3.2.S.4.4', body: 'Acceptance criteria must reconcile with the 3 post-change lots before promotion.', ip: '10.0.4.88' },
    { id: 'a-007', when: '2026-05-06T17:50:10Z', kind: 'section.lock',    actor: 'Marcus Webb',     role: 'CMC',           target: '§3.2.S.4.1 Specification', target_id: '3.2.S.4.1', ip: '10.0.4.44' },
    { id: 'a-006', when: '2026-05-06T13:22:00Z', kind: 'export',          actor: 'Jordan Chen',     role: 'Reg Lead',      target: 'eCTD backbone — Module 1–5', file: 'ectd-' + code + '-backbone.zip · signed manifest', ip: '10.0.4.21' },
    { id: 'a-005', when: '2026-05-05T15:09:41Z', kind: 'review.start',    actor: 'Dr. Lee Hartman', role: 'Medical',       target: '§2.5 Clinical Overview', target_id: '2.5', ip: '10.0.4.62' },
    { id: 'a-004', when: '2026-05-05T10:31:18Z', kind: 'section.edit',    actor: 'Ana Müller',      role: 'Medical Writer', target: '§2.7.4 Summary of Clinical Safety', target_id: '2.7.4', diff: '+318 / −44', ip: '10.0.4.71' },
    { id: 'a-003', when: '2026-05-04T16:44:55Z', kind: 'attach',          actor: 'Raj Nair',        role: 'Biostatistics', target: '§5.3.5.1 ISS', target_id: '5.3.5.1', file: 'ADaM-ADAE.xpt · define.xml', ip: '10.0.4.55' },
    { id: 'a-002', when: '2026-05-04T09:02:12Z', kind: 'access',          actor: 'External — FDA reviewer', role: 'CDER', target: 'Pre-submission package · ' + app, ip: 'fda-eub.fda.gov' },
    { id: 'a-001', when: '2026-05-01T08:30:00Z', kind: 'review.start',    actor: 'Jordan Chen',     role: 'Reg Lead',      target: 'Filing readiness review', ip: '10.0.4.21' },
  ];
  const hashes = ppChain(0x4f3a91c2, auditRaw.length);
  const audit: AuditEvent[] = auditRaw.map((r, i) => ({ ...r, hash: hashes[i].hash, prev: hashes[i].prev }));

  /* Correspondence and HAQ -- from FIXTURE_IND.fdaInteractions (verbatim topics). */
  const correspondence: CorrespondenceItem[] = [
    { id: 'haq-cmc', kind: 'HAQ · CMC', channel: 'FDA eCTD', from: agency, received: '2026-05-06T10:14:00Z', due: '2026-05-13', status: 'in_review', ai: true,
      subject: 'CMC stability trend at 18 months', refs: [{ section: '3.2.S.7.3', label: '§3.2.S.7.3 Stability' }],
      summary: 'The Agency requests justification for the 18-month stability trend and the basis for the proposed 24-month shelf-life projection, including the regression model and the lots included.',
      triage: { ana: 'AnA drafted v0.3 · awaiting reviewer', owner: 'Marcus Webb', priority: 'high', tasks: 2 } },
    { id: 'haq-clin', kind: 'HAQ · Clinical', channel: 'FDA eCTD', from: agency, received: '2026-05-06T10:16:00Z', due: '2026-05-13', status: 'open', ai: false,
      subject: 'Adverse event narrative — subject 014-008', refs: [{ section: '10.4', label: 'CSR-201 §10.4' }],
      summary: 'Provide the complete AE narrative for subject 014-008, including concomitant medications, temporal relationship to dosing, and causality assessment. 14-day response window — day 9 of 14.',
      triage: { ana: 'Draft from CSR-201 §10.4 narrative set', owner: 'Dr. Lee Hartman', priority: 'high', tasks: 1 } },
    { id: 'haq-nc', kind: 'HAQ · Nonclinical', channel: 'FDA eCTD', from: agency, received: '2026-05-06T10:18:00Z', due: '2026-05-13', status: 'open', ai: false,
      subject: 'Genotoxicity follow-up rationale', refs: [{ section: '2.6.5', label: '§2.6.5 Pharmacology tabulated' }],
      summary: 'Clarify the rationale for not conducting an additional in vivo genotoxicity study; AnA suggests bridging from the 13-week toxicology package.',
      triage: { ana: 'Bridge from 13-week tox; propose no new study', owner: 'Ana Müller', priority: 'med', tasks: 1 } },
    { id: 'pred-cmc', kind: 'HAQ · predicted', channel: 'AnA · pre-submission', from: 'AnA simulator', received: '2026-05-02T09:00:00Z', due: null, status: 'open', ai: true,
      subject: 'Comparability protocol for the forthcoming DS supplier change', refs: [{ section: '3.2.S.4.4', label: '§3.2.S.4.4 Comparability' }],
      summary: 'Predicted from BLA 761987 D60 LoQ (confidence 0.86). AnA suggests pre-empting with a comparability protocol; a response is draftable now.',
      triage: { ana: 'Pre-draft comparability protocol response', owner: 'Marcus Webb', priority: 'med', tasks: 0 } },
    { id: 'pred-ped', kind: 'HAQ · predicted', channel: 'AnA · pre-submission', from: 'AnA simulator', received: '2026-05-02T09:00:00Z', due: null, status: 'open', ai: true,
      subject: 'Rationale for the 12–17 age-range exclusion in the pivotal', refs: [{ section: '1.9', label: 'M1 §1.9 Pediatric' }],
      summary: 'Predicted from 4 prior oncology pediatric LoQs (confidence 0.91). AnA proposes citing the PIP modification + the Type C meeting outcome (2026-02-04).',
      triage: { ana: 'Cite PIP modification + Type C minutes', owner: 'Jordan Chen', priority: 'med', tasks: 0 } },
    { id: 'typeb', kind: 'Type B · Pre-IND', channel: 'FDA meeting', from: agency, received: '2025-11-12T00:00:00Z', due: null, status: 'closed', ai: false,
      subject: 'Nonclinical package adequacy', refs: [{ section: '4.2.3', label: 'IND 178902 §4.2.3' }],
      summary: 'FDA aligned on the toxicology package. Minutes received; no further action.', triage: null },
    { id: 'susar', kind: 'Safety report', channel: 'FDA expedited', from: agency, received: '2026-05-08T00:00:00Z', due: null, status: 'closed', ai: false,
      subject: 'SUSAR · BX115-202 subject 014-008 — 7-day expedited', refs: [],
      summary: '7-day expedited SUSAR filed and acknowledged.', triage: null },
  ];

  /* Approvals -- e-sign workflow across governed CTD components. */
  const approvals: ApprovalItem[] = [
    { id: 'ap-1', stage: 'regulatory', target: 'Form FDA 356h — Application to Market ' + code, target_kind: 'Submission', requested: '2026-05-08T14:00:00Z', requested_by: 'Jordan Chen', signer: 'You', role: 'Reg Lead', status: 'pending', due: '2026-05-12', meaning: 'Approved for submission' },
    { id: 'ap-2', stage: 'medical', target: '§2.5 Clinical Overview', target_id: '2.5', target_kind: 'Section', requested: '2026-05-08T11:10:00Z', requested_by: 'Priya Shah', signer: 'Dr. Lee Hartman', role: 'Medical', status: 'pending', due: '2026-05-11' },
    { id: 'ap-3', stage: 'qa', target: '§3.2.S.4.4 Comparability protocol', target_id: '3.2.S.4.4', target_kind: 'Section', requested: '2026-05-07T09:20:00Z', requested_by: 'Marcus Webb', signer: 'Priya Shah', role: 'QA', status: 'pending', due: '2026-05-10' },
    { id: 'ap-4', stage: 'medical', target: '§2.7.4 Summary of Clinical Safety', target_id: '2.7.4', target_kind: 'Section', requested: '2026-05-06T00:00:00Z', requested_by: 'Ana Müller', signer: 'Dr. Lee Hartman', role: 'Medical', status: 'signed', signed_at: '2026-05-07T16:41:02Z' },
    { id: 'ap-5', stage: 'review', target: 'Module 4 — Nonclinical study reports', target_kind: 'Module', requested: '2026-05-03T00:00:00Z', requested_by: 'Ana Müller', signer: 'Jordan Chen', role: 'Reg Lead', status: 'signed', signed_at: '2026-05-04T10:00:00Z' },
  ];

  return { audit, correspondence, approvals, corrLabel: 'HAQ / IR' };
}

/* ── Which biopharma surfaces get the pathway shell ── */

export const BIO_PATHWAY_SURFACES: Record<string, BioPathwaySurfaceConfig> = {
  'nda-cockpit':      { pathway: 'nda', sub: 'CTD · M1 · PDUFA · RTF' },
  'ind-checklist':    { pathway: 'ind', sub: 'IND readiness' },
  'cmc':              { pathway: 'cmc', sub: 'Module 3 · CMC' },
  'csr-workflow':     { pathway: 'csr', sub: 'Clinical study report' },
  'labeling-pi':      { pathway: 'label', sub: 'Prescribing information' },
  'pediatric':        { pathway: 'ped', sub: 'PIP / iPSP' },
  'orphan':           { pathway: 'orphan', sub: 'Orphan & rare' },
  'lifecycle-mgmt':   { pathway: 'lifecycle', sub: 'Post-approval' },
  'pharmacovigilance':{ pathway: 'pv', sub: 'Safety surveillance' },
};
