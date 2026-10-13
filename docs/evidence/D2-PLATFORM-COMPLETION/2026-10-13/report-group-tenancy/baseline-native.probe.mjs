/** Isolated, rolled-back proof of the deployed pre-repair table, not a CI test. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
const client = await pool.connect();
const tag = `report-group-native-baseline-${randomUUID()}`;
let red = 0;
try {
  await client.query('BEGIN');
  const organizations = [];
  const projects = [];
  for (const suffix of ['a', 'b']) {
    const organization = (await client.query(
      "INSERT INTO organizations(name,slug,status) VALUES($1,$1,'active') RETURNING id",
      [`${tag}-${suffix}`],
    )).rows[0];
    organizations.push(Number(organization.id));
    const workspace = (await client.query(
      "INSERT INTO client_workspaces(organization_id,name,slug,status) VALUES($1,$2,$2,'active') RETURNING id",
      [organization.id, `${tag}-${suffix}`],
    )).rows[0];
    const project = (await client.query(
      "INSERT INTO projects(organization_id,client_workspace_id,name,type,status) VALUES($1,$2,$3,'regulatory','active') RETURNING id",
      [organization.id, workspace.id, `${tag}-${suffix}`],
    )).rows[0];
    projects.push(Number(project.id));
  }
  const group = (await client.query(
    'INSERT INTO report_program_groups(organization_id,name) VALUES($1,$2) RETURNING id',
    [organizations[0], tag],
  )).rows[0];
  const control = await client.query(
    'INSERT INTO report_program_group_projects(program_group_id,project_id) VALUES($1,$2) RETURNING id',
    [group.id, projects[0]],
  );
  assert.equal(control.rowCount, 1);
  console.log('PASS: same-organization link is accepted on the installed canonical table.');
  try {
    await assert.rejects(
      client.query('INSERT INTO report_program_group_projects(program_group_id,project_id) VALUES($1,$2)', [group.id, projects[1]]),
      { code: '23503' },
    );
  } catch (error) {
    red++;
    console.log(`EXPECTED RED: a group in organization A accepted a project in organization B; ${error.message}`);
  }
  const column = (await client.query(
    "SELECT data_type,is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='report_program_group_projects' AND column_name='organization_id'",
  )).rows[0];
  try {
    assert.deepEqual(column, { data_type: 'integer', is_nullable: 'NO' });
  } catch {
    red++;
    console.log('EXPECTED RED: the installed link table has no organization_id integer NOT NULL column.');
  }
  console.log(`Baseline: one positive control; ${red} expected failures. All fixture writes rolled back.`);
} finally {
  await client.query('ROLLBACK');
  client.release();
  await pool.end();
}
process.exitCode = red ? 1 : 0;
