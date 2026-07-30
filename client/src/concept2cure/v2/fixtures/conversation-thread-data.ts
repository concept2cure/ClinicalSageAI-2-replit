/* Conversation thread fixture data — ported from kit conversation-thread.jsx.
   Contains thread scenarios, artifact builders, and the live responder stub.
   No JSX — all data and functions return plain objects. */

/* ---- Types ---- */

export interface CtToolCall {
  name: string;
  arg: string;
  result: string;
}

export interface CtLink {
  label: string;
  kind: string;
}

export interface CtGrounding {
  src: string;
  ok: boolean;
}

export interface CtProposal {
  status: string;
  section: string;
  title: string;
  delta: string;
  before: string;
  after: string;
  ver?: string;
}

export interface CtTurn {
  role: string;
  text?: string;
  thinking?: string;
  tools?: CtToolCall[];
  answer?: string;
  proposal?: CtProposal;
  links?: CtLink[];
  grounding?: CtGrounding[];
  artifactRef?: { id: string; type: string } | null;
  doc?: any;
}

export interface CtArtRow {
  k: string;
  v: string;
  conf: number | null;
}

export interface CtArtPred {
  k: string;
  name: string;
  match: number;
  role: string | null;
  safety: string;
}

export interface CtArtOutlineRow {
  code: string;
  heading: string;
  required: boolean;
  targetWords?: [number, number];
  st: string;
}

export interface CtArtSection {
  n: string;
  label: string;
  st: string;
}

export interface CtArtProv {
  by: string;
  model: string;
  inputs: string;
  evidence: string[];
  /** Server-issued audit id. Absent when the artifact was not governed-written. */
  audit?: string;
}

export interface CtArtifact {
  id: string;
  kind: string;
  type: string;
  title: string;
  status: string;
  when: string;
  prov: CtArtProv;
  rows?: CtArtRow[];
  preds?: CtArtPred[];
  sections?: CtArtSection[];
  outline?: CtArtOutlineRow[];
  note?: string;
}

export interface CtWorkItem {
  label: string;
  kind: string;
  meta: string;
}

export interface CtThread {
  title: string;
  section: string;
  when: string;
  turns: CtTurn[];
  artifacts?: CtArtifact[];
  work?: CtWorkItem[];
}

/* ---- Link maps ---- */

export const CT_LINKMAP: Record<string, string> = {
  doc: 'document-authoring', file: 'vault', task: 'task-board',
  module: 'dossier-map', evidence: 'evidence-search',
  review: 'review', submission: 'submission-center',
};

export const CT_LINKIC: Record<string, string> = {
  doc: 'fileText', file: 'vault', task: 'checkSquare',
  module: 'network', evidence: 'search',
  review: 'checkCircle', submission: 'rocket',
};

/* ---- Artifact builders ---- */

let _ctSeq = 100;
const _ctId = () => 'ART-' + (++_ctSeq);
// Was: `() => 'AUD-' + Math.random()...` — a fabricated Part 11 audit
// identifier, rendered by ConversationThread.tsx behind a padlock icon as
// "Audit AUD-X7K2P9". These artifacts are built client-side from this fixture;
// no governed action was recorded and the id referred to nothing. Real audit
// ids are issued server-side by recordGovernedAction, which writes a
// hash-chained audit_logs row and returns its id.
//
// Returning undefined rather than a placeholder string so the renderer can omit
// the provenance chip entirely — an absent claim is honest, a decorative one is
// not.
const _ctAudit = (): string | undefined => undefined;

export function buildClassification(): CtArtifact {
  return {
    id: _ctId(), kind: 'classification', type: 'Device classification report',
    title: 'Aurora CGM -- Class II (US) / multi-market', status: 'draft', when: 'just now',
    prov: { by: 'AnA', model: 'Maximum', inputs: 'device description + intended use', evidence: ['FDA product code QBJ', '21 CFR 862.1355', 'EU MDR Annex VIII Rule 11'], audit: _ctAudit() },
    rows: [
      { k: 'United States (FDA)', v: 'Class II / 510(k) / product code QBJ', conf: 0.94 },
      { k: 'European Union (MDR)', v: 'Class IIb / Rule 11 (software) / NB route', conf: 0.88 },
      { k: 'Pathway recommendation', v: 'Traditional 510(k) + parallel EU MDR technical file', conf: 0.91 },
    ],
    note: 'Special controls under 21 CFR 862.1355 (integrated CGM) apply. Confidence reflects intended-use match to the product code definition.',
  };
}

export function buildPredicate(): CtArtifact {
  return {
    id: _ctId(), kind: 'predicate', type: 'Predicate intelligence report',
    title: 'Predicate analysis -- 6 candidates / 2 selected', status: 'draft', when: 'just now',
    prov: { by: 'AnA', model: 'Maximum', inputs: 'FDA 510(k) DB + MAUDE + recall DB', evidence: ['openFDA 510(k)', 'MAUDE', 'FDA recall database'], audit: _ctAudit() },
    preds: [
      { k: 'K221847', name: 'Dexcom G7', match: 94, role: 'primary', safety: 'clean' },
      { k: 'K213163', name: 'FreeStyle Libre 3', match: 88, role: 'reference', safety: 'clean' },
      { k: 'K162625', name: 'Medtronic Enlite', match: 54, role: null, safety: 'recall' },
    ],
    note: 'Recall-chain screen flags K162625 (Class II recall on record -- 6.4x elevated risk); excluded from the SE basis.',
  };
}

export function buildEstar(): CtArtifact {
  return {
    id: _ctId(), kind: 'estar', type: 'eSTAR submission / nIVD v7.0',
    title: '510(k) eSTAR -- 19 sections pre-populated', status: 'draft', when: 'just now',
    prov: { by: 'AnA', model: 'Maximum', inputs: 'classification + predicates + device description', evidence: ['FDA eSTAR nIVD v7.0', 'project artifacts'], audit: _ctAudit() },
    sections: [
      { n: '04', label: 'Indications for Use', st: 'complete' },
      { n: '10', label: 'Device Description', st: 'draft' },
      { n: '11', label: 'Substantial Equivalence Discussion', st: 'draft' },
      { n: '12', label: 'Proposed Labeling', st: 'review' },
      { n: '14', label: 'Biocompatibility', st: 'review' },
      { n: '19', label: 'Performance Testing -- Clinical', st: 'draft' },
    ],
    note: '19 sections assembled from project data. Clinical performance (section 19) is the open item before promotion to review.',
  };
}

export function buildPrimedDoc(tpl: any): CtArtifact {
  return {
    id: _ctId(), kind: 'doc',
    type: (tpl.authority ? tpl.authority + ' / ' : '') + (tpl.submissionFamily || 'Document'),
    title: tpl.displayName, status: 'pending_structure', when: 'just now',
    prov: {
      by: 'AnA', model: 'Maximum',
      inputs: 'document-type detection / ' + Math.round((tpl.confidence || 0) * 100) + '% confidence',
      evidence: (tpl.regulatoryReferences || []).slice(0, 3), audit: _ctAudit(),
    },
    outline: (tpl.sections || []).map((s: any) => ({ code: s.code, heading: s.heading, required: s.required, targetWords: s.targetWords, st: 'pending' })),
    note: 'Primed from detection -- the structure AnA will draft to, shown before any content. Rows flip to drafting then final as sections stream; nothing is written without your acceptance.',
  };
}

export const CT_ARTIFACT_BUILDERS: Record<string, () => CtArtifact> = {
  classification: buildClassification,
  predicate: buildPredicate,
  estar: buildEstar,
};

/* ---- Artifact icon + status maps ---- */

export const CT_ARTIC: Record<string, string> = {
  classification: 'shieldCheck', predicate: 'search', estar: 'fileCheck', doc: 'fileText',
};

export const CT_STATUS_LABEL: Record<string, string> = {
  draft: 'Draft', 'in-review': 'In review', approved: 'Approved',
  submitted: 'Submitted', pending_structure: 'Pending structure',
};

/* ---- Live composer responder ---- */

export function ctRespond(text: string): CtTurn {
  const t = (text || '').toLowerCase();
  const wantsDraft = /draft|write|rewrite|tighten|revise|scaffold|compose/.test(t);
  if (wantsDraft) return {
    role: 'ana',
    thinking: 'This is an authoring request. I will ground it in the locked datasets, draft the change, and propose it as a governed artifact mutation for your sign-off -- never a silent edit.',
    tools: [{ name: 'search_evidence', arg: 'locked datasets + section context', result: 'sources resolved' }, { name: 'draft_section', arg: 'requested change', result: 'revision drafted' }],
    proposal: { status: 'pending', section: '2.5.4', title: 'Proposed change / ' + (text.length > 54 ? text.slice(0, 54) + '...' : text), delta: '+-- / ---',
      before: '(current section text)', after: '(AnA-drafted revision grounded in the locked dataset)' },
    answer: 'Drafted. Review the proposed change below -- Accept to write it in with an immutable version + audit entry, or Refine and I will adjust.',
    grounding: [{ src: 'Locked dataset', ok: true }, { src: 'Project instructions', ok: true }],
  };
  return {
    role: 'ana',
    thinking: 'A question, not a mutation. I will retrieve the grounded answer from the project knowledge and cite sources.',
    tools: [{ name: 'search_evidence', arg: text.length > 48 ? text.slice(0, 48) + '...' : text, result: 'evidence retrieved' }],
    answer: 'Here is what the project evidence shows. Ask me to draft any change and I will propose it as a governed edit you can accept into the document.',
    grounding: [{ src: 'Project knowledge', ok: true }],
  };
}

/* ---- Thread scenarios ---- */

export const CONVO_THREADS: Record<string, CtThread> = {
  c0: {
    title: 'Strengthen section 2.5.4 efficacy claim vs CSR-201',
    section: '2.5.4', when: '2h ago',
    turns: [
      { role: 'user', text: 'Is the section 2.5.4 efficacy claim defensible against the locked CSR-201 dataset?' },
      { role: 'ana',
        thinking: 'The claim asserts ORR. CSR-201 is locked, so the number must trace to the locked ADaM ADRS, not be re-derived. Let me pull the source ORR and the current claim text and compare.',
        tools: [
          { name: 'search_evidence', arg: 'CSR-201 section 7.4 -- primary efficacy (ORR)', result: 'ORR 42.1% (95% CI 35.8-48.6), n=214, locked 2026-04-18' },
          { name: 'get_artifact', arg: 'section 2.5.4 Clinical Overview -- efficacy', result: 'current text cites "approximately 42%"' },
        ],
        answer: 'Largely defensible, with one gap. The locked CSR-201 reads ORR 42.1% (95% CI 35.8-48.6, n=214). Your section 2.5.4 says "approximately 42%" and omits the confidence interval -- agency reviewers expect the exact point estimate and CI traced to the locked dataset. The DoR supportive figure is consistent. Recommend tightening to the locked values.',
        links: [{ label: 'CSR-201 section 7.4 -- primary efficacy', kind: 'evidence' }, { label: 'section 2.5.4 Clinical Overview', kind: 'doc' }, { label: 'CSR -- BX204-201.pdf', kind: 'file' }],
        grounding: [{ src: 'CSR-201 section 7.4', ok: true }, { src: 'ADaM ADRS (locked)', ok: true }, { src: 'section 2.5.4 current', ok: false }] },
      { role: 'user', text: 'Draft a tightened version that cites the exact locked ORR and CI.' },
      { role: 'ana',
        thinking: 'Replace the soft "approximately 42%" with the locked point estimate + CI, and add the explicit traceability to the locked ADaM. Keep it declarative and agency-idiomatic per project instructions. I will propose this as an artifact mutation, not apply it silently -- it needs your sign-off.',
        tools: [{ name: 'draft_section', arg: 'section 2.5.4 -- efficacy paragraph', result: 'revision drafted (+128 / -86)' }],
        proposal: { status: 'pending', section: '2.5.4', title: 'Tighten section 2.5.4 efficacy claim to locked CSR-201 values', delta: '+128 / -86',
          before: 'In the pivotal study, the objective response rate was approximately 42%, supporting a meaningful clinical benefit.',
          after: 'In pivotal study BX204-201, the objective response rate was 42.1% (95% CI 35.8-48.6; n=214), per the locked CSR-201 primary analysis (ADaM ADRS, data lock 18 Apr 2026), supporting durable clinical benefit.' },
        answer: 'Here is the proposed revision. It swaps the soft figure for the locked point estimate and CI and adds explicit traceability to the locked ADaM. Accept to write it into section 2.5.4 (creates an immutable version + audit entry), or Refine and I will adjust.',
        links: [{ label: 'section 2.5.4 Clinical Overview', kind: 'doc' }, { label: 'T-204-22 -- reconcile section 2.5.4', kind: 'task' }],
        grounding: [{ src: 'CSR-201 section 7.4', ok: true }, { src: 'ADaM ADRS (locked)', ok: true }, { src: 'Project instructions', ok: true }] },
    ],
    artifacts: [
      { id: 'ART-2054', kind: 'doc', type: 'CTD section / Module 2.5', title: 'section 2.5.4 Clinical Overview -- efficacy', status: 'in-review', when: '2h ago',
        prov: { by: 'AnA', model: 'Maximum', inputs: 'CSR-201 section 7.4 + ADaM ADRS (locked)', evidence: ['CSR-201 section 7.4', 'ADaM ADRS (locked)'], audit: 'AUD-2F4K9A' },
        rows: [{ k: 'Change', v: 'Tighten ORR claim to locked point estimate + CI', conf: 0.96 }, { k: 'Delta', v: '+128 / -86 / 1 paragraph', conf: null }],
        note: 'Revision proposed; pending your acceptance to write an immutable version.' },
    ],
    work: [{ label: 'section 2.5.4 Clinical Overview -- efficacy', kind: 'doc', meta: 'revision proposed / +128/-86' }, { label: 'CSR -- BX204-201.pdf', kind: 'file', meta: 'cited / section 7.4' }, { label: 'T-204-22 reconcile section 2.5.4 to CSR-201', kind: 'task', meta: 'in review / J. Chen' }],
  },
  c1: {
    title: 'ISS strategy -- pooling BX204-201 + -102', section: '5.3.5.3', when: 'Yesterday',
    turns: [
      { role: 'user', text: 'What is the cleanest pooling strategy for the ISS across BX204-201 and -102?' },
      { role: 'ana',
        thinking: 'Pooling hinges on dose comparability and population overlap. -201 is pivotal (n=214), -102 is the dose-finding (n=88). Check exposure overlap and adverse-event harmonization before recommending a pool.',
        tools: [
          { name: 'get_dataset', arg: 'ADaM ADSL -- -201 + -102 exposure', result: 'overlapping RP2D cohort n=176; -102 sub-therapeutic arm n=44 excluded' },
          { name: 'search_evidence', arg: 'ICH E3 / FDA ISS pooling guidance', result: 'pool at RP2D; present sub-therapeutic separately' },
        ],
        answer: 'Pool the RP2D cohorts (n=176 combined) for the primary safety analysis and present the -102 sub-therapeutic arm (n=44) separately as supportive. This keeps the integrated safety population exposure-comparable and pre-empts a reviewer question on dose heterogeneity. I can scaffold the 5.3.5.3 ISS shell with this structure.',
        links: [{ label: '5.3.5.3 ISS', kind: 'doc' }, { label: 'ADaM ADSL dataset', kind: 'evidence' }, { label: 'T-204-40 -- compile ISS', kind: 'task' }],
        grounding: [{ src: 'ADaM ADSL', ok: true }, { src: 'FDA ISS guidance', ok: true }] },
    ],
    work: [{ label: '5.3.5.3 Integrated Summary of Safety', kind: 'doc', meta: 'pooling strategy drafted' }, { label: 'T-204-40 compile ISS from CSR-201 + -102', kind: 'task', meta: 'to do / A. Mueller' }],
  },
  c2: {
    title: 'Module 3 comparability gap before freeze', section: '3.2.S.4', when: 'Jun 11',
    turns: [
      { role: 'user', text: 'What is blocking the Module 3 freeze?' },
      { role: 'ana',
        thinking: 'The freeze gate is the pre/post process-change comparability protocol. Check whether the comparability acceptance criteria are reconciled against the released lots.',
        tools: [{ name: 'get_artifact', arg: '3.2.S.4 comparability protocol', result: 'acceptance criteria unreconciled vs 3 post-change lots' }],
        answer: 'One blocker: the comparability protocol acceptance criteria are not yet reconciled against the three post-change lots. Until that closes, the Module 3 freeze gate stays red. This is on the critical path (T-204-31). Marcus Webb owns it; I can draft the reconciliation table from the lot release data.',
        links: [{ label: '3.2.S.4 Control of Drug Substance', kind: 'doc' }, { label: 'T-204-31 -- reconcile comparability', kind: 'task' }, { label: 'Module 3 freeze gate', kind: 'module' }],
        grounding: [{ src: '3.2.S.4 protocol', ok: true }, { src: 'Lot release data', ok: false }] },
    ],
    work: [{ label: '3.2.S.4 comparability reconciliation', kind: 'doc', meta: 'table drafted' }, { label: 'T-204-31 reconcile M3 comparability', kind: 'task', meta: 'critical path / M. Webb' }],
  },
  c3: {
    title: 'Draft Pediatric Study Plan section 1.9', section: '1.9', when: 'Jun 9',
    turns: [
      { role: 'user', text: 'Start the Pediatric Study Plan for section 1.9.' },
      { role: 'ana',
        thinking: 'iPSP follows the FDA template. It is currently blocked on SPL labeling (T-204-44 depends on T-204-12). I can draft the non-labeling sections now and flag the dependency.',
        tools: [{ name: 'get_template', arg: 'FDA Initial Pediatric Study Plan', result: 'template loaded / 6 sections' }],
        answer: 'I can draft the overview, the planned pediatric studies, and the deferral/waiver request now. The labeling-dependent section must wait on SPL conversion (T-204-12) -- I have flagged that dependency. Want me to scaffold the iPSP shell?',
        links: [{ label: 'section 1.9 Pediatric Study Plan', kind: 'doc' }, { label: 'T-204-44 -- iPSP section 1.9 (blocked)', kind: 'task' }],
        grounding: [{ src: 'FDA iPSP template', ok: true }] },
    ],
    work: [{ label: 'section 1.9 Initial Pediatric Study Plan', kind: 'doc', meta: 'shell scaffolded' }, { label: 'T-204-44 iPSP section 1.9', kind: 'task', meta: 'blocked on SPL labeling' }],
  },
};
