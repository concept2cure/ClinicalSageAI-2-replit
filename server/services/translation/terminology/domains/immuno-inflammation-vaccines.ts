/**
 * Terminology domain — Immunology, inflammation & vaccines.
 *
 * Established EN↔JA renderings for immunology/inflammation/vaccine vocabulary
 * recurring in nonclinical, clinical, and immunogenicity sections. Surface
 * markers and assay abbreviations (IgG, TNF, IL-6, CD4, MHC, ELISA) are
 * do-not-translate identifiers.
 *
 * SEED corpus: entries are 'unverified' / 'needs_review' pending qualified
 * native-linguist sign-off; not certified terminology. See ../types.
 *
 * @module server/services/translation/terminology/domains/immuno-inflammation-vaccines
 */

import type { DomainTerminologyModule, GlossaryCategory, TerminologyEntry } from '../types';

const DOMAIN = 'immuno-inflammation-vaccines';
const REF = 'JP immunology/vaccinology standard terminology + ICH';

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

export const IMMUNO_INFLAMMATION_VACCINES_TERMS: TerminologyEntry[] = [
  // ── Core immunology ──
  t('antibody', '抗体', 'preferred_term'),
  t('antigen', '抗原', 'preferred_term'),
  t('monoclonal antibody', 'モノクローナル抗体', 'preferred_term'),
  t('neutralizing antibody', '中和抗体', 'preferred_term'),
  t('immunoglobulin', '免疫グロブリン', 'preferred_term'),
  t('epitope', 'エピトープ', 'preferred_term'),
  t('cytokine', 'サイトカイン', 'preferred_term'),
  t('interleukin', 'インターロイキン', 'preferred_term'),
  t('interferon', 'インターフェロン', 'preferred_term'),
  t('complement', '補体', 'preferred_term'),
  t('T cell', 'T細胞', 'preferred_term'),
  t('B cell', 'B細胞', 'preferred_term'),
  t('antigen-presenting cell', '抗原提示細胞', 'preferred_term'),

  // ── Immune response / mechanisms ──
  t('immune response', '免疫応答', 'preferred_term'),
  t('innate immunity', '自然免疫', 'preferred_term'),
  t('adaptive immunity', '獲得免疫', 'preferred_term'),
  t('humoral immunity', '液性免疫', 'preferred_term'),
  t('cell-mediated immunity', '細胞性免疫', 'preferred_term'),
  t('immunogenicity', '免疫原性', 'preferred_term'),
  t('immunosuppression', '免疫抑制', 'preferred_term'),
  t('hypersensitivity', '過敏症', 'preferred_term'),
  t('allergen', 'アレルゲン', 'preferred_term'),
  t('antibody-dependent enhancement', '抗体依存性増強', 'preferred_term', { status: 'needs_review' }),

  // ── Inflammation / autoimmune ──
  t('inflammation', '炎症', 'preferred_term'),
  t('autoimmune', '自己免疫', 'preferred_term'),
  t('rheumatoid arthritis', '関節リウマチ', 'preferred_term'),
  t('systemic lupus erythematosus', '全身性エリテマトーデス', 'preferred_term'),

  // ── Vaccines ──
  t('vaccine', 'ワクチン', 'preferred_term'),
  t('vaccination', '予防接種', 'preferred_term'),
  t('adjuvant', 'アジュバント', 'preferred_term'),
  t('antibody titer', '抗体価', 'preferred_term'),
  t('seroconversion', '血清転換', 'preferred_term'),
  t('booster', '追加免疫', 'preferred_term', { notes: 'Also ブースター接種.' }),
  t('attenuated', '弱毒化', 'preferred_term'),
  t('inactivated', '不活化', 'preferred_term'),

  // ── Do-not-translate markers / assays ──
  t('IgG', null, 'code', { notes: 'Immunoglobulin G; keep verbatim.' }),
  t('IgM', null, 'code'),
  t('IgE', null, 'code'),
  t('TNF', null, 'code', { notes: 'Tumor necrosis factor; keep verbatim.' }),
  t('IL-6', null, 'code', { notes: 'Interleukin-6; keep verbatim.' }),
  t('CD4', null, 'code'),
  t('CD8', null, 'code'),
  t('MHC', null, 'code', { notes: 'Major histocompatibility complex; keep verbatim.' }),
  t('ELISA', null, 'code', { notes: 'Assay method; keep verbatim.' }),
];

/** Aggregated module export for registry consumption. */
export const immunoInflammationVaccinesModule: DomainTerminologyModule = {
  domain: DOMAIN,
  entries: IMMUNO_INFLAMMATION_VACCINES_TERMS,
};
