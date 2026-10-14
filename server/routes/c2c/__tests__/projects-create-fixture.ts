/** Test-only setup for the native project-creation route contract. */
import express, { type Router } from 'express';

type FixtureQuery = (...args: unknown[]) => unknown;
type MembershipQuery = (sql: string, params: unknown[]) => unknown;

/** The real admission service remains in use. Only its exact active actor
 * reads are separated from positional business-SQL results. */
export function executeProjectFixtureQuery(query: FixtureQuery, membershipQuery: MembershipQuery, ...args: unknown[]) {
  const [sql, params] = args;
  const statement = String(sql).trim().replace(/\s+/g, ' ');
  const actorRead = "SELECT ou.role FROM organization_users ou JOIN users u ON u.id=ou.user_id JOIN organizations o ON o.id=ou.organization_id WHERE ou.organization_id=$1 AND ou.user_id=$2 AND u.status='active' AND o.status='active'";
  if (statement !== actorRead && statement !== `${actorRead} FOR SHARE OF ou,u,o`) return query(...args);
  if (!Array.isArray(params) || params.length !== 2
    || !params.every(value => Number.isSafeInteger(value) && Number(value) > 0)) {
    throw new Error('The actor fixture requires the exact organization and user SQL parameters.');
  }
  return membershipQuery(statement, params);
}

export function projectFixtureApp(router: Router, org: number | null, userId?: number, requestId?: string) {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    if (requestId) res.setHeader('X-Request-Id', requestId);
    if (org !== null) (req as unknown as { organizationId: number }).organizationId = org;
    if (userId !== undefined) (req as unknown as { userId: number }).userId = userId;
    next();
  });
  app.use('/api/c2c/projects', router);
  return app;
}

/** Program anchor preflight, no existing anchor, then INSERT. These unchanged
 * results belong to the program transaction, not current actor admission. */
export const ANCHOR = [
  { rows: [{ has_column: 1, workspace_count: 1, workspace_id: 55, default_workspace_id: null }] },
  { rows: [] },
  { rows: [{ id: 9001 }] },
];
export const KEYS = ['id', 'title', 'ws', 'code', 'stage', 'readiness', 'status', 'lead', 'blocker', 'due', 'activity'];
export const shapedRow = () => Object.fromEntries(KEYS.map((k) => [k, k === 'readiness' ? 0 : k === 'blocker' ? null : 'x']));
export const validBody = {
  name: 'BX-204 — NDA',
  productName: 'BX-204',
  programType: 'nda',
  productType: 'drug',
  primaryAgency: 'FDA',
  indication: 'Solid tumors',
  targetSubmissionDate: '2026-12-01',
  teamMembers: ['Jordan Chen'],
};
