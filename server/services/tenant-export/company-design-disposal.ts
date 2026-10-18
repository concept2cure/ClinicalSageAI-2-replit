import type { PoolClient } from 'pg';

/** Each company design creates its own canonical template. Dispose those
 * referenced tenant-owned rows with their design children, preserving the
 * template store's FK guards and every unrelated template. Legal holds and
 * eligible platform scope remain enforced by the design's DELETE trigger. */
export async function disposeCompanyDesigns(client: PoolClient, organizationId: number): Promise<{ designs: number; templates: number } | null> {
  const exists = await client.query<{ relation: string | null }>("SELECT to_regclass('public.company_document_designs') AS relation");
  if (!exists.rows[0]?.relation) return null;
  const { rows } = await client.query<{ designs: number; templates: number }>(`WITH designs AS (
    DELETE FROM public.company_document_designs WHERE organization_id=$1 RETURNING template_id
  ), templates AS (
    DELETE FROM public.c2c_template_specs t WHERE t.org_id=$1
      AND t.id IN (SELECT template_id FROM designs) RETURNING id
  ) SELECT (SELECT count(*)::int FROM designs) AS designs,
      (SELECT count(*)::int FROM templates) AS templates`, [organizationId]);
  if (rows.length !== 1) throw new Error('Company presentation disposal could not be verified.');
  return rows[0];
}
