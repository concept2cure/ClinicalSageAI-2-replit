/**
 * PUT /api/tenant-users/:organizationId/:userId/qms-approver — designate a
 * member as a QMS approver, or remove the designation (decision D-Q of
 * docs/design/REVIEW_ROUTING_2026-10-23.md, §7.8; RR4). Body:
 * { designated: boolean, reason }.
 *
 * A membership act beside the role change and the removal in tenant-users.ts,
 * mounted there and gated the same way: the target organization's
 * administrator (authorizeOrgAccess), a stated reason (memberChangeReason),
 * and the change with its governed ledger pair on one transaction in the
 * verified organization's scope (services/qms/qms-approver-designation.ts).
 * A refusal writes nothing and is said in the service's words.
 *
 * @module server/routes/tenant-users-qms-approver
 */
import type { Request, Response, Router } from 'express';
import { z } from 'zod';
import { transaction } from '../db';
import { inVerifiedOrgScope } from '../services/tenant/verified-org-scope';
import { memberChangeReason } from '../services/tenant/membership-change';
import { designateQmsApprover, removeQmsApproverDesignation, QmsApproverDesignationRefusal } from '../services/qms/qms-approver-designation';
import { createScopedLogger } from '../utils/logger.js';

const log = createScopedLogger('tenant-users-qms-approver');

const qmsApproverSchema = z.object({ designated: z.boolean(), reason: memberChangeReason });

/** What the membership router already holds: its admin gate, the caller, and its reason refusal. */
export interface QmsApproverRouteDeps {
  authorizeOrgAccess: (req: Request, res: Response, organizationId: number, opts: { requireAdmin: boolean }) => Promise<string | false>;
  getCallerId: (req: Request) => number | null;
  reasonRequired: (res: Response, change: string) => unknown;
}

export function mountQmsApproverDesignation(router: Router, deps: QmsApproverRouteDeps): void {
  router.put('/:organizationId/:userId/qms-approver', async (req, res) => {
    const organizationId = parseInt(req.params.organizationId);
    const userId = parseInt(req.params.userId);
    if (isNaN(organizationId) || isNaN(userId)) return res.status(400).json({ error: 'Invalid organization ID or user ID' });
    try {
      const verifiedRole = await deps.authorizeOrgAccess(req, res, organizationId, { requireAdmin: true });
      if (!verifiedRole) return;
      const parsed = qmsApproverSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        if (parsed.error.issues.every(i => i.path[0] === 'reason')) return deps.reasonRequired(res, "change a member's QMS approver designation");
        return res.status(400).json({ error: 'INVALID_DESIGNATION', message: 'Say whether the member is designated (true or false). Nothing was changed.' });
      }
      const actorId = deps.getCallerId(req);
      if (actorId === null) return res.status(401).json({ error: 'AUTH_REQUIRED' });
      const { designated, reason } = parsed.data;
      const change = designated ? designateQmsApprover : removeQmsApproverDesignation;
      const done = await inVerifiedOrgScope(req, organizationId, verifiedRole, () =>
        transaction(client => change(client as never, { organizationId, actorId, userId, reason })));
      return res.json({ ok: true, designated, actionId: done.actionId, name: done.name });
    } catch (error) {
      if (error instanceof QmsApproverDesignationRefusal) return res.status(error.status).json({ error: error.code, message: error.message });
      log.error('Error changing a QMS approver designation:', error);
      return res.status(500).json({ error: 'The QMS approver designation was not changed.' });
    }
  });
}
