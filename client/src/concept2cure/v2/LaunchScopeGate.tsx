/**
 * LaunchScopeGate — the deep-link half of the launch boundary.
 *
 * The rail hides a surface outside the launch scope and the Apps catalog
 * names the reason, but a URL still resolves: `/concept2cure/<id>` reaches
 * V2App with `activeId` set and `SURFACE_VIEWS[activeId]` defined. Without
 * this gate the surface would render, which makes the rail's silence a lie.
 *
 * The verdict is the server's (`GET /api/module-subscriptions/navigation`,
 * source 'launch-scope'). No verdict — the catalog unreadable, the payload not
 * yet loaded — means no lock, exactly as the rail treats it: a fabricated
 * refusal is as dishonest as a fabricated permission, and the server-side
 * route gate remains the enforcement that matters.
 */
import React from 'react';
import type { UiSurface } from '@shared/constants/ui-surface-registry';
import { isLaunchScopeLocked, lockNotice, useNavEntitlements } from './navEntitlements';

export function LaunchScopeGate({
  surfaceId,
  surface,
  children,
}: {
  surfaceId: string;
  surface: UiSurface;
  children: React.ReactNode;
}) {
  const { verdictFor } = useNavEntitlements();
  const verdict = verdictFor(surfaceId);
  if (!isLaunchScopeLocked(verdict) || !verdict) return <>{children}</>;
  const notice = lockNotice(verdict, { isOrgAdmin: false });
  return (
    <div className="surface-degraded" data-launch-scope-gate role="region" aria-labelledby="launch-scope-gate-h">
      <div className="sd-mark" aria-hidden="true">
        ✻
      </div>
      <h2 id="launch-scope-gate-h">
        {surface.label}: {notice.status.toLowerCase()}
      </h2>
      <p>{notice.body}</p>
    </div>
  );
}
