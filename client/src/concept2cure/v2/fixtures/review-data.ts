/**
 * Fixture data for the Review & Approval surface (kit app/project-data.jsx).
 *
 * Shapes mirror the server contracts (approval-workflow, review-queue)
 * so the surface swaps to live hooks with no UI change.
 */

/* ---- Types ---- */

export interface ReviewItem {
  id: string;
  doc: string;
  prog: string;
  pid: string;
  secKey: string;
  reviewer: string;
  role: string;
  due: string;
  tone: string;
  state: string;
  comments: number;
  esig: string;
  conf: number;
  prov: string;
  passage: string;
}

export interface WorkflowStep {
  id: number;
  order: number;
  name: string;
  approverType: string;
  approver: string;
  requiredActions: string[];
  status: string;
  at: string | null;
}

export interface ReviewWorkflow {
  templateId: string;
  template: string;
  steps: WorkflowStep[];
}

export interface ReviewComment {
  id: string;
  author: string;
  role: string;
  when: string;
  state: string;
  body: string;
  ai?: boolean;
}

/* ---- Status tone map ---- */

export const STATUS_TONE: Record<string, string> = {
  draft: 'idle',
  review: 'warn',
  approved: 'ok',
  'in-review': 'warn',
  active: 'ai',
  blocked: 'err',
  complete: 'ok',
  'changes-requested': 'warn',
};

/* ---- E-signature meanings (21 CFR Part 11) ---- */

export const ESIGN_MEANINGS: string[] = [
  'APPROVER',
  'REVIEWER',
  'AUTHOR',
  'VERIFIER',
];

/* ---- Review queue ---- */

export const REVIEW_QUEUE: ReviewItem[] = [
  {
    id: 'rv1',
    doc: 'OR-801 SE discussion §11',
    prog: 'OR-902',
    pid: 'k510',
    secKey: 'se',
    reviewer: 'J. Chen',
    role: 'Reg lead',
    due: 'Today',
    tone: 'err',
    state: 'in-review',
    comments: 3,
    esig: 'pending',
    conf: 0.74,
    prov: 'Drafted by AnA from predicate K221847 + SE matrix · audit AUD-7K2P',
    passage:
      'The subject device and predicate (K221847) share the same intended use and fundamental technological characteristics. Differences in wear duration (14 vs 10 days) do not raise different questions of safety or effectiveness; extended wear is supported by ISO 10993-11 biocompatibility testing conducted per the predicate methodology.',
  },
  {
    id: 'rv2',
    doc: 'Biocompatibility §14',
    prog: 'OR-902',
    pid: 'k510',
    secKey: 'biocomp',
    reviewer: 'P. Shah',
    role: 'Quality',
    due: 'Tomorrow',
    tone: 'warn',
    state: 'in-review',
    comments: 1,
    esig: 'queued',
    conf: 0.81,
    prov: 'Drafted by AnA from ISO 10993 endpoint matrix · audit AUD-9F4Q',
    passage:
      'Biological evaluation was conducted in accordance with ISO 10993-1. Cytotoxicity (-5), sensitization and irritation (-10), and material-mediated pyrogenicity (-11) endpoints were addressed for the 14-day wear duration. The -11 report is pending internal sign-off.',
  },
  {
    id: 'rv3',
    doc: 'Cover letter',
    prog: 'OR-902',
    pid: 'k510',
    secKey: 'cover',
    reviewer: 'S. Marchetti',
    role: 'Author',
    due: 'In 2 days',
    tone: 'ok',
    state: 'approved',
    comments: 0,
    esig: 'signed',
    conf: 0.97,
    prov: 'Drafted by AnA from administrative package · audit AUD-3B1X',
    passage:
      'This Traditional 510(k) premarket notification is submitted for the Aurora Continuous Glucose Monitor, requesting a determination of substantial equivalence to predicate device K221847.',
  },
  {
    id: 'rv4',
    doc: 'Clinical overview §2.5',
    prog: 'NDA 212345',
    pid: 'ctd',
    secKey: '2.5.4',
    reviewer: 'A. Müller',
    role: 'Clinical',
    due: 'In 3 days',
    tone: 'ok',
    state: 'in-review',
    comments: 5,
    esig: 'pending',
    conf: 0.9,
    prov: 'Drafted by AnA from CSR-201 §7.4 + locked ADaM ADRS · audit AUD-2F4K',
    passage:
      'In pivotal study BX204-201, the objective response rate was 42.1% (95% CI 35.8–48.6; n=214), per the locked CSR-201 primary analysis (ADaM ADRS, data lock 18 Apr 2026), supporting durable clinical benefit.',
  },
];

/* ---- Multi-step approval workflows (keyed by queue id) ---- */

export const REVIEW_WORKFLOWS: Record<string, ReviewWorkflow> = {
  rv1: {
    templateId: 'wft_510k_section',
    template: '510(k) section sign-off',
    steps: [
      { id: 1, order: 1, name: 'Author self-review', approverType: 'user', approver: 'S. Marchetti', requiredActions: ['review'], status: 'approved', at: '2 d ago' },
      { id: 2, order: 2, name: 'Peer review', approverType: 'user', approver: 'P. Shah', requiredActions: ['review', 'comment'], status: 'approved', at: 'yesterday' },
      { id: 3, order: 3, name: 'Regulatory sign-off', approverType: 'role', approver: 'Reg lead', requiredActions: ['review', 'approve', 'sign'], status: 'current', at: null },
    ],
  },
  rv2: {
    templateId: 'wft_510k_section',
    template: '510(k) section sign-off',
    steps: [
      { id: 4, order: 1, name: 'Author self-review', approverType: 'user', approver: 'S. Marchetti', requiredActions: ['review'], status: 'approved', at: 'yesterday' },
      { id: 5, order: 2, name: 'Quality review', approverType: 'role', approver: 'Quality', requiredActions: ['review', 'approve'], status: 'current', at: null },
      { id: 6, order: 3, name: 'Regulatory sign-off', approverType: 'role', approver: 'Reg lead', requiredActions: ['review', 'approve', 'sign'], status: 'pending', at: null },
    ],
  },
  rv3: {
    templateId: 'wft_admin',
    template: 'Administrative sign-off',
    steps: [
      { id: 7, order: 1, name: 'Author review', approverType: 'user', approver: 'S. Marchetti', requiredActions: ['review'], status: 'approved', at: '2 d ago' },
      { id: 8, order: 2, name: 'Regulatory sign-off', approverType: 'role', approver: 'Reg lead', requiredActions: ['review', 'approve', 'sign'], status: 'approved', at: '1 d ago' },
    ],
  },
  rv4: {
    templateId: 'wft_ctd_section',
    template: 'CTD section sign-off',
    steps: [
      { id: 9, order: 1, name: 'Author self-review', approverType: 'user', approver: 'A. Müller', requiredActions: ['review'], status: 'approved', at: '2 d ago' },
      { id: 10, order: 2, name: 'Biostatistics review', approverType: 'role', approver: 'Biostat', requiredActions: ['review', 'comment'], status: 'approved', at: 'yesterday' },
      { id: 11, order: 3, name: 'Clinical review', approverType: 'role', approver: 'Clinical', requiredActions: ['review', 'approve'], status: 'current', at: null },
      { id: 12, order: 4, name: 'Regulatory sign-off', approverType: 'role', approver: 'Reg lead', requiredActions: ['review', 'approve', 'sign'], status: 'pending', at: null },
    ],
  },
};

/* ---- Review comments thread ---- */

export const REVIEW_THREAD: ReviewComment[] = [
  {
    id: 'c1',
    author: 'Linh Tran',
    role: 'Reg Affairs',
    when: '2 h ago',
    state: 'open',
    body: 'Biocompat -11 report is still in internal review — soften the §11 claim to “testing conducted per…” and move the conclusion to §14.',
  },
  {
    id: 'c2',
    author: 'AnA',
    role: 'Maximum',
    when: '2 h ago',
    state: 'open',
    ai: true,
    body: 'Suggested rewrite drafted. Confidence rises to 0.90 once §14 locks. Apply from the editor?',
  },
  {
    id: 'c3',
    author: 'Jordan Chen',
    role: 'Reg lead',
    when: 'yesterday',
    state: 'resolved',
    body: 'Pull-out numbers verified. Attach TR-OR801-009 before locking §17.',
  },
];
