/**
 * migrations/20261015c_sentinel_queued_ai_analysis_rows.sql removes the
 * sentinel rows the rules engine wrote for AI analyses nothing performed —
 * and only those.
 *
 * The table is the shape drizzle provisions from shared/schema.ts
 * (sentinelFindings: metadata is `json`, not jsonb).
 */
import { describe, it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';

const CORRECTION = fs.readFileSync(
  path.join(process.cwd(), 'migrations/20261015c_sentinel_queued_ai_analysis_rows.sql'), 'utf8');

const TABLE = `
  CREATE TABLE sentinel_findings (
    id serial PRIMARY KEY, finding_id text NOT NULL UNIQUE, organization_id integer NOT NULL,
    project_id integer, analyzer_type text NOT NULL, severity text NOT NULL DEFAULT 'medium',
    title text NOT NULL, summary text NOT NULL, details json, recommendations json,
    affected_items json, status text NOT NULL DEFAULT 'open', resolved_at timestamp,
    resolved_by_id integer, ai_request_id text, metadata json,
    created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now())`;

async function row(pg: PGlite, id: string, analyzer: string, title: string, metadata: object | null, aiRequestId: string | null = null) {
  await pg.query(
    `INSERT INTO sentinel_findings (finding_id, organization_id, project_id, analyzer_type, title, summary, ai_request_id, metadata)
     VALUES ($1, 3, 12, $2, $3, 's', $4, $5::json)`,
    [id, analyzer, title, aiRequestId, metadata === null ? null : JSON.stringify(metadata)],
  );
}

describe('the queued-AI-analysis sentinel rows', () => {
  it('are removed; real findings stay; a second deploy changes nothing', async () => {
    const pg = new PGlite();
    try {
      await pg.exec(TABLE);
      // What TriggerAIAnalysisHandler wrote.
      await row(pg, 'fake-1', 'quality_drift', 'AI Analysis Requested: risk_assessment',
        { ruleId: 'r-1', priority: 'high', queued: true });
      // A real quality-drift finding, and a real AI analysis.
      await row(pg, 'real-1', 'quality_drift', 'Section 2.7.3 diverged from its approved baseline',
        { ruleId: 'r-9', queued: true });
      await row(pg, 'real-2', 'quality_drift', 'AI Analysis Requested: summary',
        { ruleId: 'r-2', queued: true }, 'air_123');
      await row(pg, 'real-3', 'deadline_risk', 'AI Analysis Requested: risk_assessment',
        { ruleId: 'r-3', queued: true });

      for (let deploy = 0; deploy < 2; deploy++) {
        await pg.exec(CORRECTION);
        const { rows } = await pg.query<{ finding_id: string }>('SELECT finding_id FROM sentinel_findings ORDER BY finding_id');
        expect(rows.map((r) => r.finding_id)).toEqual(['real-1', 'real-2', 'real-3']);
      }
    } finally {
      await pg.close();
    }
  }, 60_000);

  it('is a no-op where the table does not exist', async () => {
    const pg = new PGlite();
    try {
      await expect(pg.exec(CORRECTION)).resolves.toBeDefined();
    } finally {
      await pg.close();
    }
  }, 60_000);
});
