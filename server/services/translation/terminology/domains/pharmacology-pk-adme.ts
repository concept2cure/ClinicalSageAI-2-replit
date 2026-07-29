/**
 * Terminology domain — Pharmacology, pharmacokinetics / pharmacodynamics, ADME.
 *
 * Established EN↔JA renderings for the PK/PD/ADME vocabulary that recurs across
 * nonclinical and clinical pharmacology summaries (CTD Module 2.6/2.7). DNT
 * identifiers (AUC, Cmax, CYP enzymes, EC50/IC50) keep their source form — they
 * are masked before MT and restored verbatim.
 *
 * SEED corpus: entries are 'unverified' / 'needs_review' pending qualified
 * native-linguist sign-off; not certified terminology. See ../types.
 *
 * @module server/services/translation/terminology/domains/pharmacology-pk-adme
 */

import type { DomainTerminologyModule, GlossaryCategory, TerminologyEntry } from '../types';

const DOMAIN = 'pharmacology-pk-adme';
const REF = 'ICH M3(R2)/E-series + JP clinical pharmacology standard terminology';

/** Compact entry constructor: DNT is derived from a null target. */
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

export const PHARMACOLOGY_PK_ADME_TERMS: TerminologyEntry[] = [
  // ── Core PK/PD concepts ──
  t('pharmacokinetics', '薬物動態', 'preferred_term'),
  t('pharmacodynamics', '薬力学', 'preferred_term'),
  t('bioavailability', '生物学的利用能', 'preferred_term'),
  t('absolute bioavailability', '絶対的バイオアベイラビリティ', 'preferred_term', { status: 'needs_review' }),
  t('bioequivalence', '生物学的同等性', 'preferred_term'),
  t('clearance', 'クリアランス', 'preferred_term'),
  t('renal clearance', '腎クリアランス', 'preferred_term'),
  t('hepatic clearance', '肝クリアランス', 'preferred_term'),
  t('half-life', '半減期', 'preferred_term'),
  t('elimination half-life', '消失半減期', 'preferred_term'),
  t('volume of distribution', '分布容積', 'preferred_term'),
  t('steady state', '定常状態', 'preferred_term'),
  t('accumulation', '蓄積', 'preferred_term'),
  t('linear pharmacokinetics', '線形薬物動態', 'preferred_term'),

  // ── ADME ──
  t('absorption', '吸収', 'preferred_term'),
  t('distribution', '分布', 'preferred_term'),
  t('metabolism', '代謝', 'preferred_term'),
  t('excretion', '排泄', 'preferred_term'),
  t('elimination', '消失', 'preferred_term'),
  t('first-pass effect', '初回通過効果', 'preferred_term'),
  t('hepatic metabolism', '肝代謝', 'preferred_term'),
  t('absorption rate', '吸収速度', 'preferred_term'),

  // ── Binding / interactions ──
  t('protein binding', 'タンパク結合', 'preferred_term'),
  t('plasma protein binding', '血漿タンパク結合', 'preferred_term'),
  t('drug interaction', '薬物相互作用', 'preferred_term'),
  t('drug-drug interaction', '薬物間相互作用', 'preferred_term'),
  t('inhibitor', '阻害薬', 'preferred_term'),
  t('inducer', '誘導薬', 'preferred_term'),
  t('substrate', '基質', 'preferred_term'),
  t('metabolite', '代謝物', 'preferred_term'),
  t('active metabolite', '活性代謝物', 'preferred_term'),

  // ── Concentrations / dosing ──
  t('plasma concentration', '血漿中濃度', 'preferred_term'),
  t('trough concentration', 'トラフ濃度', 'preferred_term'),
  t('dose', '用量', 'preferred_term'),
  t('dosage regimen', '用法・用量', 'preferred_term'),
  t('therapeutic window', '治療濃度域', 'preferred_term', { status: 'needs_review' }),

  // ── Pharmacodynamics ──
  t('efficacy', '有効性', 'preferred_term'),
  t('potency', '力価', 'preferred_term'),
  t('agonist', '作動薬', 'preferred_term', { notes: 'Also rendered アゴニスト in some contexts.' }),
  t('antagonist', '拮抗薬', 'preferred_term', { notes: 'Also rendered アンタゴニスト in some contexts.' }),
  t('receptor', '受容体', 'preferred_term'),
  t('dose-response relationship', '用量反応関係', 'preferred_term'),

  // ── Do-not-translate identifiers (PK parameters / enzymes / metrics) ──
  t('AUC', null, 'code', { notes: 'Area under the concentration-time curve; keep verbatim.' }),
  t('Cmax', null, 'code', { notes: 'Maximum observed concentration; keep verbatim.' }),
  t('Tmax', null, 'code', { notes: 'Time to maximum concentration; keep verbatim.' }),
  t('CYP3A4', null, 'code', { notes: 'Cytochrome P450 isoform; keep verbatim.' }),
  t('CYP2D6', null, 'code'),
  t('P-gp', null, 'code', { notes: 'P-glycoprotein transporter abbreviation; keep verbatim.' }),
  t('EC50', null, 'code'),
  t('IC50', null, 'code'),
];

/** Aggregated module export for registry consumption. */
export const pharmacologyPkAdmeModule: DomainTerminologyModule = {
  domain: DOMAIN,
  entries: PHARMACOLOGY_PK_ADME_TERMS,
};
