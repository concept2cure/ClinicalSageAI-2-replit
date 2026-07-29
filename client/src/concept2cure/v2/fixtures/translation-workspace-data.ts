/**
 * Fixture data for the Translation Workspace surface
 * (kit app/translation-workspace.jsx).
 *
 * Bilingual EN->JA regulatory translation seed data for BX-204 Module 2.5.
 * Shapes mirror shared/types/translation.ts (PR #966) so the surface
 * swaps to live hooks with no UI change.
 */

/* ---- Status key type ---- */

export type TxwStatusKey =
  | 'pending'
  | 'mt_draft'
  | 'in_progress'
  | 'back_translation'
  | 'review'
  | 'approved'
  | 'rejected';

/* ---- Method key type ---- */

export type TxwMethodKey = 'human' | 'mt_postedited' | 'machine';

/* ---- Category key type ---- */

export type TxwCategoryKey =
  | 'regulatory_citation'
  | 'agency_name'
  | 'evidence_label'
  | 'slash_command'
  | 'json_block'
  | 'inn_drug_name'
  | 'meddra_term'
  | 'code'
  | 'preferred_term';

/* ---- Do-not-translate token ---- */

export interface DntToken {
  dnt: string;
  cat: TxwCategoryKey;
}

/** A span element is either a plain string or a DNT token object. */
export type SpanPart = string | DntToken;

/* ---- Interfaces ---- */

export interface TxwStatusMeta {
  label: string;
  short: string;
}

export interface TxwMethodMeta {
  label: string;
}

export interface TxwStep {
  id: string;
  label: string;
  statuses: TxwStatusKey[];
}

export interface TxwProject {
  id: number;
  name: string;
  sourceLanguage: string;
  targetLanguages: string[];
  status: string;
  submissionContext: string;
}

export interface TxwSegment {
  id: number;
  projectId: number;
  targetLanguage: string;
  segmentKey: string;
  source: SpanPart[];
  target: SpanPart[];
  method: TxwMethodKey;
  status: TxwStatusKey;
  engine?: string;
  postEditor?: number;
  reviewer?: number | null;
  backTranslationVerified: boolean;
  backTranslationText: string | null;
  approvedBy?: number;
  approvedAt?: string;
}

export interface TxwGlossaryEntry {
  id: number;
  src: string;
  tgt: string | null;
  dnt: boolean;
  cat: TxwCategoryKey;
  scope: 'org' | 'project';
}

export interface TxwQaFinding {
  checkId: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  sourceExcerpt?: string;
  targetExcerpt?: string;
}

export interface TxwTeamMember {
  id: number;
  name: string;
  role: string;
}

/* ---- Status + method metadata (display only -- order matches the pipeline) ---- */

export const TXW_STATUSES: TxwStatusKey[] = [
  'pending',
  'mt_draft',
  'in_progress',
  'back_translation',
  'review',
  'approved',
  'rejected',
];

export const TXW_STATUS_META: Record<TxwStatusKey, TxwStatusMeta> = {
  pending:          { label: 'Pending',          short: 'Pending'    },
  mt_draft:         { label: 'Machine draft',    short: 'MT draft'   },
  in_progress:      { label: 'Post-editing',     short: 'Editing'    },
  back_translation: { label: 'Back-translation', short: 'Back-trans' },
  review:           { label: 'In review',        short: 'Review'     },
  approved:         { label: 'Approved',         short: 'Approved'   },
  rejected:         { label: 'Rejected',         short: 'Rejected'   },
};

export const TXW_METHODS: Record<TxwMethodKey, TxwMethodMeta> = {
  human:         { label: 'Human'                },
  mt_postedited: { label: 'MT + post-edited'     },
  machine:       { label: 'Machine (unverified)' },
};

export const TXW_APPROVABLE_METHODS: TxwMethodKey[] = ['human', 'mt_postedited'];

/* The 5 stepper buckets shown in the segment header (collapses
   back_translation + review into one "verify" node for narrow dock). */
export const STEPS: TxwStep[] = [
  { id: 'draft',   label: 'Draft',     statuses: ['pending', 'mt_draft'] },
  { id: 'edit',    label: 'Post-edit', statuses: ['in_progress']         },
  { id: 'verify',  label: 'Verify',    statuses: ['back_translation']    },
  { id: 'review',  label: 'Review',    statuses: ['review']              },
  { id: 'approve', label: 'Approve',   statuses: ['approved']            },
];

/* ---- Seed data (BX-204 S2.5 Clinical Overview, EN->JA for PMDA) ---- */

export const TXW_PROJECTS: TxwProject[] = [{
  id: 1,
  name: 'BX-204 · Module 2.5 — PMDA',
  sourceLanguage: 'en',
  targetLanguages: ['ja-JP'],
  status: 'in_translation',
  submissionContext: 'BX-204 J-NDA — PMDA Q4 2025',
}];

/* Each source span is either a plain string, or an object describing
   a do-not-translate token (rendered as a locked chip). */
export const TXW_SEGMENTS: TxwSegment[] = [
  {
    id: 101, projectId: 1, targetLanguage: 'ja-JP', segmentKey: '2.5.1#p1',
    source: [
      'Bextrelimab ',
      { dnt: 'BX-204', cat: 'inn_drug_name' },
      ' is being developed in accordance with ',
      { dnt: '21 CFR 312', cat: 'regulatory_citation' },
      ' for the IND, and the Japanese application will follow the ',
      { dnt: 'ICH M4', cat: 'regulatory_citation' },
      ' common technical document organization required by ',
      { dnt: 'PMDA', cat: 'agency_name' },
      '.',
    ],
    target: [
      'ベクストレリマブ ',
      { dnt: 'BX-204', cat: 'inn_drug_name' },
      ' は治験申請に関して ',
      { dnt: '21 CFR 312', cat: 'regulatory_citation' },
      ' に従って開発されており、日本における申請は ',
      { dnt: 'PMDA', cat: 'agency_name' },
      ' が要求する ',
      { dnt: 'ICH M4', cat: 'regulatory_citation' },
      ' のコモン・テクニカル・ドキュメントの構成に従う。',
    ],
    method: 'mt_postedited', status: 'review',
    engine: 'C2C-RIM-MT · v2.4', postEditor: 7, reviewer: null,
    backTranslationVerified: true,
    backTranslationText: 'Bextrelimab BX-204 is being developed in accordance with 21 CFR 312 for the IND, and the Japanese application will follow the ICH M4 common technical document organization required by PMDA.',
  },
  {
    id: 102, projectId: 1, targetLanguage: 'ja-JP', segmentKey: '2.5.4#p2',
    source: [
      'In the pivotal trial ',
      { dnt: 'BX204-301', cat: 'code' },
      ', the primary endpoint was met with an overall response rate of 47.3% (95% CI 39.2–55.5), with manageable safety; the most common Grade ≥3 adverse event was neutropenia (',
      { dnt: 'MedDRA PT: Neutropenia', cat: 'meddra_term' },
      ') observed in 18 of 142 treated patients.',
    ],
    target: [
      'ピボタル試験 ',
      { dnt: 'BX204-301', cat: 'code' },
      ' において、主要評価項目は奏効率 47.3% (95% CI 39.2–55.5) で達成され、安全性は管理可能であった。最も多く認められた Grade ≥3 の有害事象は好中球減少症 (',
      { dnt: 'MedDRA PT: Neutropenia', cat: 'meddra_term' },
      ') であり、治療を受けた 142 例中 18 例で認められた。',
    ],
    method: 'mt_postedited', status: 'in_progress',
    engine: 'C2C-RIM-MT · v2.4', postEditor: 7, reviewer: null,
    backTranslationVerified: false, backTranslationText: null,
  },
  {
    id: 103, projectId: 1, targetLanguage: 'ja-JP', segmentKey: '2.5.5#p1',
    source: [
      'The benefit-risk assessment supports approval for the proposed indication. The labeling proposal aligns with ',
      { dnt: 'PMDA', cat: 'agency_name' },
      ' guidance for oncology biologics and references the Japanese SmPC (',
      { dnt: 'Iyakuhin Youran', cat: 'regulatory_citation' },
      ').',
    ],
    target: [
      '本剤の有効性と安全性のバランスは、提案された効能・効果に対する承認を支持する。添付文書案は ',
      { dnt: 'PMDA', cat: 'agency_name' },
      ' のがん領域バイオ医薬品ガイダンスに沿うものであり、日本の医薬品要覧 (',
      { dnt: 'Iyakuhin Youran', cat: 'regulatory_citation' },
      ') を参照している。',
    ],
    method: 'mt_postedited', status: 'approved',
    engine: 'C2C-RIM-MT · v2.4', postEditor: 7, reviewer: 12,
    backTranslationVerified: true,
    backTranslationText: 'The benefit-risk balance supports approval for the proposed indication. The proposed package insert aligns with PMDA oncology biologic guidance and references the Japanese SmPC (Iyakuhin Youran).',
    approvedBy: 12, approvedAt: '2025-06-12T14:22:00Z',
  },
  {
    id: 104, projectId: 1, targetLanguage: 'ja-JP', segmentKey: '2.5.6#p1',
    source: [
      'A post-marketing pharmacovigilance plan will be implemented per ',
      { dnt: 'ICH E2E', cat: 'regulatory_citation' },
      ' including a Japan-specific post-marketing surveillance commitment.',
    ],
    target: [
      'A post-marketing pharmacovigilance plan will be implemented per ',
      { dnt: 'ICH E2E', cat: 'regulatory_citation' },
      ' including a Japan-specific post-marketing surveillance commitment.',
    ],
    method: 'machine', status: 'mt_draft',
    engine: 'C2C-RIM-MT · v2.4',
    backTranslationVerified: false, backTranslationText: null,
  },
  {
    id: 105, projectId: 1, targetLanguage: 'ja-JP', segmentKey: '2.5.7#p1',
    source: ['This section will summarize the global development strategy and reference to the ICH common technical document.'],
    target: [''],
    method: 'machine', status: 'pending',
    backTranslationVerified: false, backTranslationText: null,
  },
];

export const TXW_GLOSSARY: TxwGlossaryEntry[] = [
  { id: 1,  src: 'PMDA',                   tgt: null,                              dnt: true,  cat: 'agency_name',         scope: 'org'     },
  { id: 2,  src: '21 CFR 312',             tgt: null,                              dnt: true,  cat: 'regulatory_citation', scope: 'org'     },
  { id: 3,  src: 'ICH M4',                 tgt: null,                              dnt: true,  cat: 'regulatory_citation', scope: 'org'     },
  { id: 4,  src: 'ICH E2E',                tgt: null,                              dnt: true,  cat: 'regulatory_citation', scope: 'org'     },
  { id: 5,  src: 'Iyakuhin Youran',        tgt: null,                              dnt: true,  cat: 'regulatory_citation', scope: 'org'     },
  { id: 6,  src: 'BX-204',                 tgt: null,                              dnt: true,  cat: 'inn_drug_name',       scope: 'project' },
  { id: 7,  src: 'BX204-301',              tgt: null,                              dnt: true,  cat: 'code',                scope: 'project' },
  { id: 8,  src: 'MedDRA PT: Neutropenia', tgt: null,                              dnt: true,  cat: 'meddra_term',         scope: 'org'     },
  { id: 9,  src: 'pivotal trial',          tgt: 'ピボタル試験',              dnt: false, cat: 'preferred_term',      scope: 'org'     },
  { id: 10, src: 'objective response rate', tgt: '奏効率',                        dnt: false, cat: 'preferred_term',      scope: 'org'     },
  { id: 11, src: 'benefit-risk assessment', tgt: '有効性と安全性のバランス', dnt: false, cat: 'preferred_term',      scope: 'org'     },
  { id: 12, src: 'package insert',         tgt: '添付文書',                      dnt: false, cat: 'preferred_term',      scope: 'org'     },
  { id: 13, src: 'post-marketing surveillance', tgt: '製造販売後調査',              dnt: false, cat: 'preferred_term',      scope: 'project' },
];

/* Findings keyed by segmentId */
export const TXW_QA: Record<number, TxwQaFinding[]> = {
  102: [
    { checkId: 'numeric-number-consistency', severity: 'warning', message: '95% CI bounds (39.2-55.5) present in source -- verify identical bounds in target.', sourceExcerpt: '39.2-55.5', targetExcerpt: '39.2-55.5' },
  ],
  104: [
    { checkId: 'untranslated-copy', severity: 'error', message: 'Target appears identical to source -- no translation performed.' },
    { checkId: 'empty-target', severity: 'error', message: 'Target language requires at least one Japanese character.' },
  ],
  105: [
    { checkId: 'empty-target', severity: 'error', message: 'Target is empty.' },
  ],
};

export const TXW_CATEGORIES: Record<TxwCategoryKey, string> = {
  regulatory_citation: 'Regulatory citation',
  agency_name:         'Agency',
  evidence_label:      'Evidence label',
  slash_command:        'Slash command',
  json_block:          'JSON block',
  inn_drug_name:       'INN / drug name',
  meddra_term:         'MedDRA',
  code:                'Code / ID',
  preferred_term:      'Preferred term',
};

export const TXW_TEAM: Record<number, TxwTeamMember> = {
  7:  { id: 7,  name: 'Yamamoto R.', role: 'Post-editor (JP)' },
  12: { id: 12, name: 'Sato N.',     role: 'Reviewer (RA)'    },
};
