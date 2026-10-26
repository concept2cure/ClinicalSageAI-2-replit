/** Explicit local historical tracking fixture; application writes stay governed. */
import pg from 'pg';

export interface HistoricalTrackingRow { code: string; module: string; title: string; status: string }

export async function seedHistoricalTracking(anchor: number, programId: string, rows: HistoricalTrackingRow[]) {
  const fixtureUrl = process.env.DOSSIER_PARITY_DATABASE_URL;
  if (!fixtureUrl) throw new Error('Set DOSSIER_PARITY_DATABASE_URL to the explicit local concept_handoff fixture database.');
  const target = new URL(fixtureUrl);
  if (!['localhost', '127.0.0.1'].includes(target.hostname) || target.pathname !== '/concept_handoff') {
    throw new Error('Dossier tracking fixtures require the local concept_handoff database.');
  }
  const fixture = new pg.Client({ connectionString: fixtureUrl });
  await fixture.connect();
  try {
    const result = await fixture.query(`INSERT INTO project_sections
      (organization_id, project_id, section_code, module, title, status)
      SELECT p.organization_id, p.id, s.code, s.module, s.title, s.status
      FROM projects p CROSS JOIN jsonb_to_recordset($3::jsonb)
        AS s(code text,module text,title text,status text)
      WHERE p.id=$1 AND p.regulatory_program_id=$2 RETURNING id`,
    [anchor, programId, JSON.stringify(rows)]);
    if (result.rowCount !== rows.length) throw new Error('Synthetic tracking fixture did not match the newly created project anchor.');
    return result.rowCount;
  } finally { await fixture.end(); }
}
