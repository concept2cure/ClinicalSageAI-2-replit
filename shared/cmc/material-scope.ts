/**
 * Which material a CMC record is evidence for — the ONE rule, shared by the
 * server that composes Module 3 and the register surfaces that display it.
 *
 * ── Why this is shared rather than duplicated ────────────────────────────────
 * The CTD files the same kind of record in two different places depending on
 * the material: a drug-substance container closure system is §3.2.S.6 and a
 * drug-product one is §3.2.P.7; a drug-substance reference standard is §3.2.S.5
 * and a drug-product one is §3.2.P.6. The composer resolves the stored scope
 * tolerantly (an integration may write 'ds' or 'finished_product'), so a
 * register table that matched the three canonical strings EXACTLY showed "--"
 * for a record the composer was at that moment filing into §3.2.S.6 — the
 * screen and the dossier disagreeing about the same row. One function, both
 * sides.
 */

export type CmcMaterialScope = 'drug_substance' | 'drug_product' | 'both';

/** The values the register forms offer, in the order they are offered. */
export const CMC_MATERIAL_SCOPES: CmcMaterialScope[] = ['drug_substance', 'drug_product', 'both'];

/**
 * Read a stored scope, tolerantly, without ever inventing a side.
 *
 * The `fallback` is what an UNSTATED scope means for that register (each table's
 * column is NOT NULL with a default, so this only fires for a payload written
 * before the column existed or by a caller that omitted it). It resolves to the
 * caller's fallback rather than to "no side", so a record is never silently
 * absent from every section — and because the write-through mapper resolves the
 * scope ONCE through this function and emits the side-scoped completeness keys
 * from the result, what renders and what counts cannot disagree.
 */
export function normalizeMaterialScope(raw: unknown, fallback: CmcMaterialScope): CmcMaterialScope {
  const v = String(raw ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (!v) return fallback;
  if (v === 'drug_substance' || v === 'substance' || v === 'ds' || v === 'api') return 'drug_substance';
  if (v === 'drug_product' || v === 'product' || v === 'dp' || v === 'finished_product') return 'drug_product';
  if (v === 'both' || v === 'drug_substance_and_drug_product' || v === 'ds_and_dp') return 'both';
  return fallback;
}

/** Does a stored scope cover this side? `both` covers either. */
export function scopeCovers(scope: CmcMaterialScope, side: 'drug_substance' | 'drug_product'): boolean {
  return scope === 'both' || scope === side;
}

/**
 * The CTD section(s) a stored scope files a record under, for display next to
 * the row. Resolved through the same normalizer the composer uses, so the
 * register can never name a different section than the one the record reaches.
 */
export function materialScopeSections(
  raw: unknown,
  fallback: CmcMaterialScope,
  substanceSection: string,
  productSection: string,
): string {
  const scope = normalizeMaterialScope(raw, fallback);
  if (scope === 'both') return `${substanceSection} + ${productSection}`;
  return scope === 'drug_substance' ? substanceSection : productSection;
}


/* ─────────────────────────────────────────────────────────────────────────────
 * Material ROLE, and what counts as an origin §3.2.A.3 must ask about.
 *
 * Both rules were written twice: once on the server, where the write-through
 * decides whether a material becomes an `excipient` or a `raw_material_spec`
 * source and §3.2.A.3 decides whether an origin is animal or human, and once on
 * the register surface, in weaker form — the card resolved the role with
 * `String(role).includes('material')` and recognised two origins where the
 * section recognises twelve. So a material recorded as a "reagent" was filed by
 * the dossier as a raw material and labelled §3.2.P.4 by the screen, and an
 * excipient recorded as `bovine` rendered as ordinary grey text next to a
 * section that treats it as animal-derived.
 * ────────────────────────────────────────────────────────────────────────── */

/** The material roles that are §3.2.P.4 excipient content. */
export const EXCIPIENT_ROLES = ['excipient', 'capsule-shell', 'coating', 'processing-aid'];

/** Read a stored material role without inventing one. */
export function normalizeMaterialRole(raw: unknown): string {
  const v = String(raw ?? '').trim().toLowerCase().replace(/[\s_]+/g, '-');
  if (!v) return 'excipient';
  if (v === 'raw-material' || v === 'raw' || v === 'reagent') return 'raw-material';
  if (v === 'starting-material' || v === 'starting') return 'starting-material';
  if (EXCIPIENT_ROLES.includes(v)) return v;
  return 'excipient';
}

/** Is this role §3.2.P.4 excipient content, rather than §3.2.S.2.3 material? */
export function isExcipientRole(raw: unknown): boolean {
  return EXCIPIENT_ROLES.includes(normalizeMaterialRole(raw));
}

/** The CTD section a material role files under, for display next to a row. */
export function materialRoleSection(raw: unknown): string {
  return isExcipientRole(raw) ? '3.2.P.4' : '3.2.S.2.3';
}

/**
 * The origins that put a material under §3.2.A.3 — the ONE list, shared by the
 * mapper, the appendix generator and the register surface.
 */
export const HUMAN_OR_ANIMAL_ORIGINS = [
  'animal', 'human', 'bovine', 'porcine', 'ovine', 'equine',
  'murine', 'hamster', 'fish', 'egg', 'milk',
];

const HUMAN_OR_ANIMAL_ORIGIN_RE = new RegExp(`^(${HUMAN_OR_ANIMAL_ORIGINS.join('|')})$`, 'i');

/** Is a recorded origin one that puts a material under §3.2.A.3? */
export function isHumanOrAnimalOrigin(raw: unknown): boolean {
  return HUMAN_OR_ANIMAL_ORIGIN_RE.test(String(raw ?? '').trim());
}

/**
 * Origins that are neither an animal origin nor an exclusion. A
 * fermentation-derived excipient is precisely the EMEA/410/01 and ICH Q5A
 * question, because the culture media can carry animal-derived components.
 */
export const REVIEW_REQUIRED_ORIGINS = ['fermentation', 'biotechnological', 'biotech', 'cell-culture'];

export function isReviewRequiredOrigin(raw: unknown): boolean {
  const v = String(raw ?? '').trim().toLowerCase().replace(/[\s_]+/g, '-');
  return REVIEW_REQUIRED_ORIGINS.includes(v);
}
