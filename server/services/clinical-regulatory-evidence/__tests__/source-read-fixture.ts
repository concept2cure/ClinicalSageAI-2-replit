/** Real actor/sharing prerequisites for source-reader integration fixtures.
 * Permissions are seeded by the canonical Authoring trigger, not a policy mock. */
import type { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { extractTableDdl, REPO_ROOT } from '../../../../tests/golden-journeys/harness';

const migration = (file: string) => fs.readFileSync(path.join(REPO_ROOT, file), 'utf8');

export async function seedSourceReadParents(pg: PGlite, orgs: readonly [number, number], programs: readonly [string, string]): Promise<void> {
  await pg.exec(extractTableDdl('migrations/0000_sweet_joseph.sql', [
    'organizations', 'users', 'organization_users', 'client_workspaces', 'projects', 'concept2cure_artifacts',
  ]));
  await pg.exec(extractTableDdl('migrations/20260524_program_workbench_schema.sql', ['regulatory_programs']));
  await pg.exec(migration('migrations/20260814_projects_regulatory_program_anchor.sql'));
  await pg.exec(migration('db/migrations/20260401_project_sharing_visibility.sql'));
  await pg.exec(migration('db/migrations/20260314_phase12_multi_user_review.sql'));
  // tenant-isolation-safe: isolated PGlite fixture creates one actor before seeding its explicit organization memberships below; no application database is used.
  await pg.query(`INSERT INTO users(id,name,email,password_hash,status)
    VALUES(1,'Source reader fixture','source-reader@example.invalid','fixture-only-no-login','active')`);
  for (const [index, org] of orgs.entries()) {
    await pg.query("INSERT INTO organizations(id,name,slug,status) VALUES($1,'Source fixture',$2,'active')", [org, `source-fixture-${org}`]);
    await pg.query("INSERT INTO organization_users(organization_id,user_id,role) VALUES($1,1,'member')", [org]);
    await pg.query(`INSERT INTO client_workspaces(id,organization_id,name,slug,status,created_by_id)
      VALUES($1,$1,'Source workspace',$2,'active',1)`, [org, `source-workspace-${org}`]);
    await pg.query(`INSERT INTO regulatory_programs(id,organization_id,name,code,program_type,product_type,primary_agency,product_name)
      VALUES($1,$2,'Source programme',$3,'IND','drug','FDA','QA fixture')`, [programs[index], org, `SOURCE-${org}`]);
    await pg.query(`INSERT INTO projects(id,organization_id,client_workspace_id,name,type,status,owner_id,created_by_id,regulatory_program_id,settings)
      VALUES($1,$1,$1,'Source project','regulatory','active',1,1,$2,'{}')`, [org, programs[index]]);
    await pg.query("INSERT INTO project_visibility_settings(organization_id,project_id,visibility) VALUES($1,$1,'private')", [org]);
  }
}
