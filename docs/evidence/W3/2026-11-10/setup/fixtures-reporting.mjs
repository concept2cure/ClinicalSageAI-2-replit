/**
 * OQ-007's one fixture, after setup/fixtures.mjs:
 *
 *   OWNER_DATABASE_URL=… OQ_FOREIGN_PROJECT_ID=… node docs/evidence/W3/2026-11-10/setup/fixtures-reporting.mjs <out.env> <transcript.txt>
 *
 * OQ-RPT-06 needs another organisation's report run and another organisation's project tracking record. Organisation 1
 * ("Default") has no member to run a report, so one `report_runs` row is written into it AS THE DATABASE OWNER, over
 * the tracking record of the foreign program setup/fixtures.mjs wrote (OQ_FOREIGN_PROJECT_ID). It is a completed run
 * with no figures: the step asserts that the run identity cannot find it, never what it says. The two ids are
 * appended to the fixtures file as OQ_FOREIGN_REPORT_RUN_ID and OQ_FOREIGN_TRACKING_PROJECT_ID.
 */
import fs from 'node:fs';
import pg from 'pg';

const OWNER = process.env.OWNER_DATABASE_URL;
const foreignProgram = process.env.OQ_FOREIGN_PROJECT_ID;
const [outEnv, transcriptPath] = process.argv.slice(2);
if (!OWNER || !foreignProgram || !outEnv || !transcriptPath) {
  console.error('usage: OWNER_DATABASE_URL=… OQ_FOREIGN_PROJECT_ID=… node fixtures-reporting.mjs <out.env> <transcript.txt>');
  process.exit(2);
}
const lines = ['# Reporting fixtures, 2026-11-10 (setup/fixtures-reporting.mjs)'];
const say = (line) => { lines.push(line); console.info(line); };

const db = new pg.Client({ connectionString: OWNER });
await db.connect();
try {
  const tracking = await db.query('SELECT id, organization_id FROM projects WHERE regulatory_program_id = $1', [foreignProgram]);
  const project = tracking.rows[0];
  if (!project) throw new Error('the foreign program has no tracking record');
  const existing = await db.query(
    "SELECT id FROM report_runs WHERE organization_id = $1 AND scope_type = 'project' AND scope_id = $2 ORDER BY id LIMIT 1",
    [project.organization_id, String(project.id)],
  );
  let runId = existing.rows[0]?.id;
  if (!runId) {
    const inserted = await db.query(
      `INSERT INTO report_runs (organization_id, scope_type, scope_id, report_type_id, status, completed_at)
       VALUES ($1, 'project', $2, 'readiness.executive_digest', 'completed', now()) RETURNING id`,
      [project.organization_id, String(project.id)],
    );
    runId = inserted.rows[0].id;
  }
  say(`foreign tracking record: project ${project.id} in organisation ${project.organization_id}`);
  say(`foreign report run: report_runs ${runId} in organisation ${project.organization_id}, ${existing.rows[0] ? 'already present' : 'written as the database owner'}`);
  const kept = fs.existsSync(outEnv)
    ? fs.readFileSync(outEnv, 'utf8').split('\n').filter((l) => l && !/^OQ_FOREIGN_(REPORT_RUN_ID|TRACKING_PROJECT_ID)=/.test(l))
    : [];
  fs.writeFileSync(outEnv, `${[...kept, `OQ_FOREIGN_REPORT_RUN_ID=${runId}`, `OQ_FOREIGN_TRACKING_PROJECT_ID=${project.id}`].join('\n')}\n`);
  fs.writeFileSync(transcriptPath, `${lines.join('\n')}\n`);
} finally {
  await db.end();
}
