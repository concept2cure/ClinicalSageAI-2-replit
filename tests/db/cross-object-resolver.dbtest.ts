/**
 * F-23: the readiness review assesses what it read, or refuses, on the real
 * schema under the only RLS posture production accepts.
 *
 * ── The defect this pins (found 2026-09-23 by the D4 execution) ─────────────
 * OQ-SRDY-05 executed the submission readiness review for the program its
 * protocol had created. The engine reads the integer-keyed project spine and a
 * program's id is a uuid, so the project, document, artifact, placement and
 * last-signal reads all failed. Each resolver caught its own failure and
 * answered with an empty result, and the review completed all five steps for
 * "Project" with 0 documents and recommended "No critical issues found … All
 * analyzers returned no critical or high findings". The step passed.
 *
 * The unit test (server/services/orchestration/__tests__/
 * cross-object-resolver.fail-closed.test.ts) pins the rule with the database
 * mocked. This file pins it where it matters: every read the payload makes has
 * to succeed on the migrated schema as the runtime role, or failing closed
 * would refuse every review in production. So it shows both directions:
 *   - a project the organisation holds is assessed, and the review names it;
 *   - a program's uuid, and a project another organisation holds, are refused,
 *     and the review run that asked fails and says why.
 *
 * ── Posture ─────────────────────────────────────────────────────────────────
 * server/db connects as a freshly minted non-superuser, NOBYPASSRLS runtime
 * role through APP_DATABASE_URL with RLS_ENFORCE=on, the posture of
 * sign-in-audit-trail.dbtest.ts. Reads run in the member's tenant scope, as an
 * authenticated request's do.
 *
 * ── Isolation ───────────────────────────────────────────────────────────────
 * Lane "dbtcr": organisations 91900 and 91901 (range 91900–91949). Every row
 * this file writes belongs to them and is removed afterwards. The resolver and
 * the orchestrator write nothing.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { databaseUrl } from '../setup.db';
import {
  provisionAppServiceRole,
  resolveAppServiceRole,
} from '../../scripts/db/provision-app-role.mjs';
import { runWithTenantScope } from '../../server/db/tenantStore';

type Runtime = typeof import('../../server/db/runtime');
type Orchestration = typeof import('../../server/services/orchestration');
type Resolver = typeof import('../../server/services/orchestration/cross-object-resolver');

const ORG = 91900;
const OTHER_ORG = 91901;
const TAG = 'dbtcr';
const RUN = `${process.pid}_${Date.now().toString(36)}`;
const RUNTIME_PASSWORD = 'dbtcr-cross-object-runtime-password';
const runtimeRole = resolveAppServiceRole({ APP_SERVICE_DB_ROLE: `dbtcr_rt_${RUN}` });

/** A program id of the kind intake returns. */
const PROGRAM_UUID = '1d3cc4a5-5ffa-4ff1-ae79-6e3a4222b6dc';
const PROJECT_NAME = `${TAG} lead project ${RUN}`;

let owner: Pool;
let runtime: Runtime;
let orchestration: Orchestration;
let resolver: Resolver;
let projectId: number;
let otherProjectId: number;

/** Run `fn` in the member's tenant scope, as an authenticated request does. */
function asMember<T>(fn: () => Promise<T>): Promise<T> {
  return runWithTenantScope({ tenantId: String(ORG), role: 'admin', source: 'test', caller: 'dbtcr' }, fn);
}

function review(project: number | string) {
  return asMember(() =>
    orchestration.executeWorkflow({
      templateId: 'submission_readiness_review',
      projectId: project as number,
      organizationId: ORG,
      module: 'ind',
      requestedBy: { userId: 1, userName: 'dbtcr@example.invalid', userRole: 'admin', organizationId: ORG },
      sourceSurface: 'api',
    } as Parameters<Orchestration['executeWorkflow']>[0]),
  );
}

async function cleanup(): Promise<void> {
  const orgs = [ORG, OTHER_ORG];
  await owner.query('DELETE FROM concept2cure_artifacts WHERE organization_id = ANY($1::int[])', [orgs]);
  await owner.query('DELETE FROM projects WHERE organization_id = ANY($1::int[])', [orgs]);
  await owner.query('DELETE FROM client_workspaces WHERE organization_id = ANY($1::int[])', [orgs]);
  const rows = (
    await owner.query(`SELECT id, uuid::text AS uuid FROM organizations WHERE id = ANY($1::int[])`, [orgs])
  ).rows as Array<{ id: number; uuid: string }>;
  await owner.query('DELETE FROM organizations WHERE id = ANY($1::int[])', [orgs]);
  if (rows.length > 0) {
    // trg_sync_org_to_identity mirrors every organizations INSERT.
    await owner
      .query(`DELETE FROM identity.organizations WHERE id = ANY($1::uuid[]) AND created_by = 'c48-stage1-sync'`, [
        rows.map((o) => o.uuid),
      ])
      .catch(() => {/* mirror absent or referenced: a harmless leftover */});
  }
}

/** One organisation with one client workspace and one project on the integer spine. */
async function seedOrganisation(org: number, projectName: string): Promise<number> {
  await owner.query(
    `INSERT INTO organizations (id, name, slug, tier, industry_mode, status)
     VALUES ($1, $2, $2, 'free', 'biotech', 'active')`,
    [org, `${TAG}-${org}-${RUN}`],
  );
  const ws = await owner.query(
    `INSERT INTO client_workspaces (organization_id, name, slug) VALUES ($1, $2, $2) RETURNING id`,
    [org, `${TAG}-ws-${org}-${RUN}`],
  );
  const project = await owner.query(
    `INSERT INTO projects (organization_id, client_workspace_id, name, type, status)
     VALUES ($1, $2, $3, 'regulatory', 'active') RETURNING id`,
    [org, ws.rows[0].id, projectName],
  );
  return project.rows[0].id as number;
}

beforeAll(async () => {
  owner = new Pool({ connectionString: databaseUrl, max: 4 });
  await cleanup();

  // 1. The non-superuser runtime role, minted by the real provisioning script.
  let provisioned: { skipped: boolean } | undefined;
  for (let attempt = 1; ; attempt++) {
    try {
      provisioned = await provisionAppServiceRole(owner, {
        env: { APP_SERVICE_DB_ROLE: runtimeRole, APP_SERVICE_DB_PASSWORD: RUNTIME_PASSWORD },
      });
      break;
    } catch (err) {
      if (attempt >= 5 || !/tuple concurrently updated/.test((err as Error).message)) throw err;
      await new Promise((r) => setTimeout(r, 250 * attempt));
    }
  }
  if (provisioned!.skipped) throw new Error('[dbtcr] provisionAppServiceRole skipped — no runtime role.');

  // 2. Route server/db through it before server/db/runtime.ts is first imported.
  const runtimeUrl = new URL(databaseUrl);
  runtimeUrl.username = runtimeRole;
  runtimeUrl.password = RUNTIME_PASSWORD;
  process.env.APP_DATABASE_URL = runtimeUrl.toString();
  process.env.RLS_ENFORCE = 'on';

  runtime = await import('../../server/db/runtime');
  orchestration = await import('../../server/services/orchestration');
  resolver = await import('../../server/services/orchestration/cross-object-resolver');

  // 3. The member's organisation, with one routed artifact on its project; and a
  //    second organisation whose project the member must not be able to assess.
  projectId = await seedOrganisation(ORG, PROJECT_NAME);
  otherProjectId = await seedOrganisation(OTHER_ORG, `${TAG} foreign project ${RUN}`);
  await owner.query(
    `INSERT INTO concept2cure_artifacts
       (artifact_id, project_id, organization_id, type, category, title, content, ctd_section, status)
     VALUES ($1, $2, $3, 'markdown', 'document', 'Clinical overview', '# Overview', '2.5', 'draft')`,
    [`artifact_${TAG}_${RUN}`, projectId, ORG],
  );
}, 180_000);

afterAll(async () => {
  if (runtime) await runtime.getPool().end().catch(() => {});
  if (owner) {
    await cleanup().catch((err) => console.warn('[dbtcr] cleanup left rows:', err?.message));
    for (let attempt = 1; ; attempt++) {
      try {
        await owner.query(`REASSIGN OWNED BY ${runtimeRole} TO CURRENT_USER; DROP OWNED BY ${runtimeRole}`);
        await owner.query(`DROP ROLE IF EXISTS ${runtimeRole}`);
        break;
      } catch (err) {
        if (attempt >= 5) {
          console.warn('[dbtcr] runtime role left behind:', (err as Error).message);
          break;
        }
        await new Promise((r) => setTimeout(r, 250 * attempt));
      }
    }
    await owner.end();
  }
});

describe('the posture is the one production runs in', () => {
  it('connects as a non-superuser runtime role with RLS enforcing', async () => {
    const who = await asMember(async () => {
      const { rows } = await runtime.getPool().query(
        `SELECT current_user AS role, r.rolsuper AS super, r.rolbypassrls AS bypass
           FROM pg_roles r WHERE r.rolname = current_user`,
      );
      return rows[0] as { role: string; super: boolean; bypass: boolean };
    });
    expect(who).toEqual({ role: runtimeRole, super: false, bypass: false });
  });
});

describe('a project the organisation holds', () => {
  it('is assembled from reads that all succeed, and names the project', async () => {
    const payload = await asMember(() => resolver.assembleCrossObjectPayload({ organizationId: ORG, projectId }));

    expect(payload.project).toMatchObject({ id: projectId, name: PROJECT_NAME, totalDocuments: 1 });
    expect(payload.documents.map((d) => d.title)).toEqual(['Clinical overview']);
    expect(payload.moduleMap.find((m) => m.module === 'Module 2')?.documentCount).toBe(1);
    expect(payload.lastSignalAt).not.toBeNull();
  });

  it('is reviewed to completion, and the review says which project it read', async () => {
    const run = await review(projectId);

    expect(run.status).toBe('completed');
    expect(run.steps[0]).toMatchObject({
      stepId: 'inspect_project_state',
      status: 'completed',
      result: expect.objectContaining({ projectName: PROJECT_NAME, artifactCount: 1 }),
    });
  });
});

describe('what the review cannot read', () => {
  it('a program uuid fails the payload, naming every read it broke', async () => {
    const outcome = await asMember(() =>
      resolver.assembleCrossObjectPayload({ organizationId: ORG, projectId: PROGRAM_UUID as unknown as number }),
    ).then(() => 'assembled', (err: unknown) => err);

    expect(outcome).toBeInstanceOf(resolver.CrossObjectReadError);
    expect((outcome as InstanceType<Resolver['CrossObjectReadError']>).failedReads).toEqual(
      expect.arrayContaining(['project', 'documents', 'artifacts', 'module placements', 'last signal']),
    );
  });

  it('a program uuid ends the review run as failed, with no step completed and the reason recorded', async () => {
    const run = await review(PROGRAM_UUID);

    expect(run.status).toBe('failed');
    expect(run.steps.filter((s) => s.status === 'completed')).toHaveLength(0);
    expect(run.auditTrail.at(-1)).toMatchObject({
      action: 'context_assembly_failed',
      detail: expect.stringMatching(/could not be read/),
    });
  });

  it('a project another organisation holds is refused, not assessed as empty', async () => {
    await expect(
      asMember(() => resolver.assembleCrossObjectPayload({ organizationId: ORG, projectId: otherProjectId })),
    ).rejects.toMatchObject({ name: 'CrossObjectReadError', failedReads: ['project'] });
  });
});
