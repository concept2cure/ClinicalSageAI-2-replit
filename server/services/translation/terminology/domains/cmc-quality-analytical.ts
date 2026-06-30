/**
 * Terminology domain — CMC, quality & analytical (CTD Module 3).
 *
 * Established EN↔JA renderings for chemistry-manufacturing-controls, quality,
 * and analytical vocabulary recurring in Module 3 / quality dossiers. Analytical
 * technique and compendial abbreviations (HPLC, GC, NMR, USP, API) are
 * do-not-translate identifiers.
 *
 * SEED corpus: entries are 'unverified' / 'needs_review' pending qualified
 * native-linguist sign-off; not certified terminology. See ../types.
 *
 * @module server/services/translation/terminology/domains/cmc-quality-analytical
 */

import type { DomainTerminologyModule, GlossaryCategory, TerminologyEntry } from '../types';

const DOMAIN = 'cmc-quality-analytical';
const REF = 'ICH Q-series + Japanese Pharmacopoeia (JP18) standard terminology';

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

export const CMC_QUALITY_ANALYTICAL_TERMS: TerminologyEntry[] = [
  // ── Substance / product ──
  t('drug substance', '原薬', 'preferred_term'),
  t('drug product', '製剤', 'preferred_term'),
  t('active pharmaceutical ingredient', '有効成分', 'preferred_term', { notes: 'API; often kept as the abbreviation in tables.' }),
  t('excipient', '添加剤', 'preferred_term'),
  t('reference standard', '標準品', 'preferred_term'),
  t('container closure system', '容器施栓系', 'preferred_term'),

  // ── Quality attributes ──
  t('specification', '規格', 'preferred_term'),
  t('acceptance criteria', '判定基準', 'preferred_term'),
  t('impurity', '不純物', 'preferred_term'),
  t('degradation product', '分解生成物', 'preferred_term'),
  t('residual solvent', '残留溶媒', 'preferred_term'),
  t('assay', '含量', 'preferred_term'),
  t('potency', '力価', 'preferred_term'),
  t('dissolution', '溶出', 'preferred_term'),
  t('uniformity of dosage units', '製剤均一性', 'preferred_term'),
  t('water content', '水分', 'preferred_term'),
  t('particle size', '粒子径', 'preferred_term'),
  t('polymorphism', '結晶多形', 'preferred_term'),
  t('viscosity', '粘度', 'preferred_term'),
  t('sterility', '無菌性', 'preferred_term'),
  t('endotoxin', 'エンドトキシン', 'preferred_term'),
  t('microbial limit', '微生物限度', 'preferred_term'),

  // ── Stability ──
  t('stability', '安定性', 'preferred_term'),
  t('shelf life', '有効期間', 'preferred_term', { notes: 'Also 使用期限 (use-by) on labelling.' }),
  t('forced degradation', '強制分解', 'preferred_term'),
  t('storage condition', '保存条件', 'preferred_term'),

  // ── Manufacturing / control ──
  t('manufacturing process', '製造工程', 'preferred_term'),
  t('in-process control', '工程内管理', 'preferred_term'),
  t('batch', 'バッチ', 'preferred_term', { notes: 'Also ロット (lot) / 製造番号.' }),
  t('process validation', '製造工程バリデーション', 'preferred_term'),
  t('qualification', '適格性評価', 'preferred_term'),
  t('certificate of analysis', '試験成績書', 'preferred_term'),

  // ── Analytical ──
  t('analytical method', '分析法', 'preferred_term'),
  t('method validation', '分析法バリデーション', 'preferred_term'),
  t('validation', 'バリデーション', 'preferred_term'),
  t('limit of detection', '検出限界', 'preferred_term'),
  t('limit of quantitation', '定量限界', 'preferred_term'),

  // ── Do-not-translate analytical / compendial identifiers ──
  t('HPLC', null, 'code', { notes: 'High-performance liquid chromatography; keep verbatim.' }),
  t('GC', null, 'code', { notes: 'Gas chromatography; keep verbatim.' }),
  t('NMR', null, 'code', { notes: 'Nuclear magnetic resonance; keep verbatim.' }),
  t('XRD', null, 'code', { notes: 'X-ray diffraction; keep verbatim.' }),
  t('API', null, 'code', { notes: 'Active pharmaceutical ingredient (abbrev.); keep verbatim in tables.' }),
  t('USP', null, 'agency_name', { notes: 'United States Pharmacopeia; keep verbatim.' }),
];

/** Aggregated module export for registry consumption. */
export const cmcQualityAnalyticalModule: DomainTerminologyModule = {
  domain: DOMAIN,
  entries: CMC_QUALITY_ANALYTICAL_TERMS,
};
