/**
 * What a characterisation study ESTABLISHES — the rule shared by the write-
 * through mapper, §3.2.S.3's generator and the register surface.
 *
 * §3.2.S.3.1 asks three separate questions: what the structure is, what the
 * physicochemical properties are, and what the biological activity is. They are
 * answered by different experiments, so the register types each study by which
 * of the three it speaks to and the mapper emits only that one field. A
 * solubility measurement is not structural elucidation, and the composer must
 * never read it as if it were: without the stored type, three studies of the
 * same kind would have greened all three required fields.
 *
 * Shared for the same reason the material scope is: the register surface prints
 * the CTD subsection a study files under, and it must never name a different
 * one than the composer reaches.
 */

export type CmcCharacterizationType = 'structural' | 'physicochemical' | 'biological';

/** The values the register form offers, in the order it offers them. */
export const CMC_CHARACTERIZATION_TYPES: CmcCharacterizationType[] = [
  'structural',
  'physicochemical',
  'biological',
];

/** The composer field each type — and only that type — can answer. */
export const CHARACTERIZATION_TYPE_FIELD: Record<CmcCharacterizationType, string> = {
  structural: 'structuralElucidation',
  physicochemical: 'physicochemicalProperties',
  biological: 'biologicalActivity',
};

/** How each type reads in a rendered section. */
export const CHARACTERIZATION_TYPE_LABEL: Record<CmcCharacterizationType, string> = {
  structural: 'Structural elucidation',
  physicochemical: 'Physicochemical properties',
  biological: 'Biological activity',
};

/**
 * Read a stored type tolerantly, without inventing one. An unstated type
 * resolves to `structural`, matching the column's default.
 */
export function normalizeCharacterizationType(raw: unknown): CmcCharacterizationType {
  const v = String(raw ?? '').trim().toLowerCase().replace(/[\s_-]+/g, '');
  if (!v) return 'structural';
  if (v === 'structural' || v === 'structure' || v === 'structuralelucidation' || v === 'spectroscopy') {
    return 'structural';
  }
  if (
    v === 'physicochemical' || v === 'physchem' || v === 'physical' ||
    v === 'physicochemicalproperties' || v === 'solidstate'
  ) {
    return 'physicochemical';
  }
  if (
    v === 'biological' || v === 'bioactivity' || v === 'biologicalactivity' ||
    v === 'potency' || v === 'functional'
  ) {
    return 'biological';
  }
  return 'structural';
}

/**
 * The CTD subsection a study files under, for display next to a row.
 *
 * All three types file under §3.2.S.3.1 — the section asks all three questions
 * — so the SIDE is what moves a study, not the type. A drug-product study is
 * pharmaceutical development evidence (§3.2.P.2); the CTD has no
 * "characterisation of the drug product" section to file it under.
 */
export function characterizationTypeSection(rawScope: unknown): string {
  const side = String(rawScope ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (side === 'drug_product' || side === 'product' || side === 'dp' || side === 'finished_product') {
    return '3.2.P.2';
  }
  return '3.2.S.3.1';
}
