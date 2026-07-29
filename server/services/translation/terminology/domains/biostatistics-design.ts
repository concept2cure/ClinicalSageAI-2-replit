/**
 * Terminology domain — Biostatistics & clinical trial design.
 *
 * Established EN↔JA renderings for the study-design and statistical vocabulary
 * recurring in protocols, SAPs, and CSRs (CTD Module 2.5/2.7). Analysis-set and
 * method abbreviations (ITT, PPS, LOCF, ANOVA) are do-not-translate identifiers.
 *
 * SEED corpus: entries are 'unverified' / 'needs_review' pending qualified
 * native-linguist sign-off; not certified terminology. See ../types.
 *
 * @module server/services/translation/terminology/domains/biostatistics-design
 */

import type { DomainTerminologyModule, GlossaryCategory, TerminologyEntry } from '../types';

const DOMAIN = 'biostatistics-design';
const REF = 'ICH E9 + JP biostatistics standard terminology';

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

export const BIOSTATISTICS_DESIGN_TERMS: TerminologyEntry[] = [
  // ── Design ──
  t('randomization', '無作為化', 'preferred_term', { notes: 'Also ランダム化.' }),
  t('double-blind', '二重盲検', 'preferred_term'),
  t('single-blind', '単盲検', 'preferred_term'),
  t('open-label', '非盲検', 'preferred_term', { notes: 'Also オープンラベル.' }),
  t('placebo', 'プラセボ', 'preferred_term'),
  t('crossover design', 'クロスオーバー試験', 'preferred_term'),
  t('stratification', '層別化', 'preferred_term'),
  t('sample size', '症例数', 'preferred_term', { notes: 'Also サンプルサイズ.' }),
  t('interim analysis', '中間解析', 'preferred_term'),
  t('subgroup analysis', '部分集団解析', 'preferred_term', { notes: 'Also サブグループ解析.' }),
  t('analysis population', '解析対象集団', 'preferred_term'),

  // ── Endpoints / hypotheses ──
  t('endpoint', '評価項目', 'preferred_term'),
  t('primary endpoint', '主要評価項目', 'preferred_term'),
  t('secondary endpoint', '副次評価項目', 'preferred_term'),
  t('null hypothesis', '帰無仮説', 'preferred_term'),
  t('alternative hypothesis', '対立仮説', 'preferred_term'),
  t('non-inferiority', '非劣性', 'preferred_term'),
  t('superiority', '優越性', 'preferred_term'),
  t('equivalence', '同等性', 'preferred_term'),

  // ── Inference / estimands ──
  t('confidence interval', '信頼区間', 'preferred_term'),
  t('p-value', 'P値', 'preferred_term'),
  t('significance level', '有意水準', 'preferred_term'),
  t('statistical significance', '統計学的有意性', 'preferred_term'),
  t('statistical power', '検出力', 'preferred_term'),
  t('hazard ratio', 'ハザード比', 'preferred_term'),
  t('odds ratio', 'オッズ比', 'preferred_term'),
  t('relative risk', '相対リスク', 'preferred_term'),
  t('covariate', '共変量', 'preferred_term'),

  // ── Summary statistics ──
  t('mean', '平均', 'preferred_term'),
  t('median', '中央値', 'preferred_term'),
  t('standard deviation', '標準偏差', 'preferred_term'),
  t('standard error', '標準誤差', 'preferred_term'),
  t('variance', '分散', 'preferred_term'),
  t('regression analysis', '回帰分析', 'preferred_term'),

  // ── Do-not-translate analysis-set / method abbreviations ──
  t('ITT', null, 'code', { notes: 'Intention-to-treat analysis set; keep verbatim.' }),
  t('PPS', null, 'code', { notes: 'Per-protocol set; keep verbatim.' }),
  t('LOCF', null, 'code', { notes: 'Last observation carried forward; keep verbatim.' }),
  t('ANOVA', null, 'code', { notes: 'Analysis of variance; keep verbatim.' }),
];

/** Aggregated module export for registry consumption. */
export const biostatisticsDesignModule: DomainTerminologyModule = {
  domain: DOMAIN,
  entries: BIOSTATISTICS_DESIGN_TERMS,
};
