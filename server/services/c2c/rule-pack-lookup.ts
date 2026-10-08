/**
 * The active rule pack for a governed document class: the one read of
 * c2c_rule_packs that decides whether an outline exists.
 *
 * "Active" is one rule, held here: the pack not superseded, latest
 * `effective_from` first. The scaffolder (scaffold-project-documents.ts), which
 * binds a project's document to a pack, and the market line
 * (server/services/regulatory/market-support.ts, FILING_SPINE.md F19), which
 * states whether a market has an outline, read through this module so they
 * cannot disagree about which pack is live.
 */

/** The query surface both node-postgres and PGlite satisfy. */
export interface RulePackQueryable {
  query(sql: string, params?: unknown[]): Promise<{ rows: unknown[] }>;
}

export interface ActiveRulePack {
  version: string;
  label: string;
  required_sections: unknown;
}

const ACTIVE = 'superseded_by IS NULL';

/** The active pack for exactly (docType, agency), or null. No fallback agency is tried here. */
export async function findActiveRulePack(
  client: RulePackQueryable,
  docType: string,
  agency: string,
): Promise<ActiveRulePack | null> {
  const { rows } = await client.query(
    `SELECT version, label, required_sections
       FROM c2c_rule_packs
      WHERE doc_type = $1 AND agency = $2 AND ${ACTIVE}
      ORDER BY effective_from DESC
      LIMIT 1`,
    [docType, agency],
  );
  return (rows[0] as ActiveRulePack | undefined) ?? null;
}

/** Every active pack, one per (doc_type, agency), in one read. */
export async function listActiveRulePacks(
  client: RulePackQueryable,
): Promise<Array<{ doc_type: string; agency: string; version: string; label: string }>> {
  const { rows } = await client.query(
    `SELECT DISTINCT ON (doc_type, agency) doc_type, agency, version, label
       FROM c2c_rule_packs
      WHERE ${ACTIVE}
      ORDER BY doc_type, agency, effective_from DESC`,
  );
  return rows as Array<{ doc_type: string; agency: string; version: string; label: string }>;
}
