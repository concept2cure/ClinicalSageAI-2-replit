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
