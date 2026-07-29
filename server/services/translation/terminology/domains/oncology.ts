/**
 * Terminology domain — Oncology.
 *
 * Established EN↔JA renderings for tumor biology, staging, treatment modalities,
 * and response assessment recurring in oncology protocols, CSRs, and labelling.
 * Gene/protein symbols (EGFR, HER2, TP53, …), response criteria (RECIST), and
 * performance-status scales (ECOG) are do-not-translate identifiers.
 *
 * SEED corpus: entries are 'unverified' / 'needs_review' pending qualified
 * native-linguist sign-off; not certified terminology. See ../types.
 *
 * @module server/services/translation/terminology/domains/oncology
 */

import type { DomainTerminologyModule, GlossaryCategory, TerminologyEntry } from '../types';

const DOMAIN = 'oncology';
const REF = 'JSCO / JP oncology standard terminology + ICH E-series';

function t(
  source: string,
  target: string | null,
  category: GlossaryCategory,
  opts: { status?: TerminologyEntry['verificationStatus']; notes?: string; ref?: string } = {},
): TerminologyEntry {
  return {
    source,
    target,
    domain: DOMAIN,
    category,
    doNotTranslate: target === null,
    sourceRef: opts.ref ?? REF,
    verificationStatus: opts.status ?? 'unverified',
    ...(opts.notes ? { notes: opts.notes } : {}),
  };
}

export const ONCOLOGY_TERMS: TerminologyEntry[] = [
  // ── Tumor biology ──
  t('tumor', '腫瘍', 'preferred_term'),
  t('malignant', '悪性', 'preferred_term'),
  t('benign', '良性', 'preferred_term'),
  t('metastasis', '転移', 'preferred_term'),
  t('carcinoma', '癌腫', 'preferred_term'),
  t('sarcoma', '肉腫', 'preferred_term'),
  t('lymphoma', 'リンパ腫', 'preferred_term'),
  t('leukemia', '白血病', 'preferred_term'),
  t('neoplasm', '新生物', 'preferred_term'),
  t('solid tumor', '固形がん', 'preferred_term', { notes: 'Also 固形腫瘍.' }),
  t('hematologic malignancy', '造血器腫瘍', 'preferred_term', { notes: 'Also 血液悪性腫瘍.' }),
  t('cytotoxic', '細胞傷害性', 'preferred_term'),
  t('apoptosis', 'アポトーシス', 'preferred_term'),
  t('angiogenesis', '血管新生', 'preferred_term'),
  t('tumor microenvironment', '腫瘍微小環境', 'preferred_term'),
  t('immune checkpoint', '免疫チェックポイント', 'preferred_term'),

  // ── Staging / assessment ──
  t('tumor staging', '腫瘍病期分類', 'preferred_term'),
  t('histological grade', '組織学的異型度', 'preferred_term', { status: 'needs_review' }),
  t('biomarker', 'バイオマーカー', 'preferred_term'),
  t('minimal residual disease', '微小残存病変', 'preferred_term'),

  // ── Response / outcome ──
  t('overall survival', '全生存期間', 'preferred_term'),
  t('progression-free survival', '無増悪生存期間', 'preferred_term'),
  t('disease-free survival', '無病生存期間', 'preferred_term'),
  t('objective response rate', '奏効率', 'preferred_term'),
  t('complete response', '完全奏効', 'preferred_term'),
  t('partial response', '部分奏効', 'preferred_term'),
  t('stable disease', '安定', 'preferred_term', { notes: 'RECIST category SD; often kept as SD in tables.' }),
  t('progressive disease', '進行', 'preferred_term', { notes: 'RECIST category PD; often kept as PD in tables.' }),
  t('relapse', '再発', 'preferred_term'),
  t('remission', '寛解', 'preferred_term'),
  t('resistance', '耐性', 'preferred_term'),

  // ── Treatment modalities ──
  t('chemotherapy', '化学療法', 'preferred_term'),
  t('radiotherapy', '放射線療法', 'preferred_term'),
  t('immunotherapy', '免疫療法', 'preferred_term'),
  t('targeted therapy', '分子標的療法', 'preferred_term'),
  t('neoadjuvant therapy', '術前補助療法', 'preferred_term'),
  t('adjuvant therapy', '術後補助療法', 'preferred_term'),

  // ── Do-not-translate identifiers (criteria, scales, gene/protein symbols) ──
  t('RECIST', null, 'code', { notes: 'Response Evaluation Criteria in Solid Tumors; keep verbatim.' }),
  t('ECOG', null, 'code', { notes: 'ECOG performance status scale; keep verbatim.' }),
  t('EGFR', null, 'code', { notes: 'Gene/protein symbol; never translate.' }),
  t('HER2', null, 'code', { notes: 'Gene/protein symbol; never translate.' }),
  t('PD-L1', null, 'code', { notes: 'Gene/protein symbol; never translate.' }),
  t('TP53', null, 'code', { notes: 'Gene symbol; never translate.' }),
  t('BRAF', null, 'code', { notes: 'Gene symbol; never translate.' }),
];

/** Aggregated module export for registry consumption. */
export const oncologyModule: DomainTerminologyModule = {
  domain: DOMAIN,
  entries: ONCOLOGY_TERMS,
};
