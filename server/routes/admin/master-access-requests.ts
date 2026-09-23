/**
 * Access requests across every workspace — the platform owner's queue.
 * Mounted under /api/admin/master, inside the Master Administration guard.
 *
 *   GET  /access-requests                every workspace's requests (?status=open|all)
 *   POST /access-requests/:id/decision   approve or decline any workspace's request
 *
 * WHY THIS MOUNT EXISTS (2026-09-22). The owner's cross-workspace view used to
 * be `?scope=all` on /api/module-access-requests. That prefix runs under the
 * CALLER'S organization scope, and module_access_requests is RLS enabled +
 * FORCED, so on the production posture the read answered 200 with only the
 * owner's own workspace — rendered by the licensing console as "no requests
 * waiting" for every other one — and approving another workspace's request
 * returned 404, because the row was invisible to the connection that looked
 * for it. Both were reproduced on real PostgreSQL as the non-superuser runtime
 * role by tests/db/module-access-requests.dbtest.ts.
 *
 * /api/admin/master is in SYSTEM_SCOPE_PREFIXES, so establishRequestTenantScope
 * runs everything here under the system scope: the one scope in which RLS lets
 * a read see, and a grant be written for, a workspace other than the caller's.
 * /api/module-access-requests is deliberately NOT added to that list — members
 * and org administrators must stay scoped to their own workspace.
 *
 * NO SECOND IMPLEMENTATION. Both endpoints are the handlers exported by
 * ../module-access-requests — the same queue read, the same decision, the same
 * reason floor, the same `writeModuleGrant` call and the same audit record the
 * org administrator's queue uses. Only the mount, and so the scope, differs.
 *
 * AUTHORITY. The guard in ./master-admin admits platform staff (super_admin,
 * platform_admin, support). That is route access, not the owner grant: the pure
 * rules still decide, so `denyQueueRead(actor, 'all')` and `denyDecision`
 * refuse a staff role that does not hold it. No endpoint here does its own
 * authorization, and none may.
 *
 * @module server/routes/admin/master-access-requests
 */

import { Router } from 'express';
import { decideAccessRequest, readAccessRequestQueue } from '../module-access-requests.js';

const router = Router();

router.get('/access-requests', readAccessRequestQueue('all'));
router.post('/access-requests/:id/decision', decideAccessRequest);

export default router;
