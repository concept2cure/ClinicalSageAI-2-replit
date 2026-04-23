/**
 * Fail-closed mount helper for static-data route families.
 *
 * When a feature flag disables a static-data family (e.g. GCC seed data
 * that shouldn't be shipped outside demo builds), the family's mount
 * point is still reserved — we install a guard middleware that returns
 * a structured `FEATURE_DISABLED` response instead of leaving the path
 * unrouted.
 *
 * Extracted from `server/startup/routes.ts` during Phase 6 to keep the
 * composition root free of any `app.use(...)` calls. Kept identical to
 * the pre-refactor helper, including the warning log.
 *
 * @module server/bootstrap/static-data-guard
 */

import type { Express } from 'express';
import { sendStaticDataDisabled } from '../middleware/staticDataGuard';

export type MountStaticBusinessDataGuard = (
  path: string,
  routeName: string,
  requiredFlag: string
) => void;

export function buildStaticBusinessDataGuard(app: Express): MountStaticBusinessDataGuard {
  return function mountStaticBusinessDataGuard(path, routeName, requiredFlag) {
    app.use(path, (_req, res) => {
      return sendStaticDataDisabled(res, routeName, requiredFlag);
    });
    console.warn(
      `⚠️ ${routeName} mounted in fail-closed mode (set ${requiredFlag}=true to re-enable).`
    );
  };
}
