/**
 * Access requests, across every workspace — the platform owner's view.
 *
 * A tab body for the Master Licensing console, so it takes no props: the
 * console mounts it and it reads its own scope.
 *
 * WHY IT IS A THIN WRAPPER AND MUST STAY ONE. This is the same queue the
 * org administrator sees, with the same governed answer, plus a workspace
 * column. The whole implementation therefore lives in ../AccessRequests and is
 * parameterised by scope. A second copy here would be a second approval flow —
 * one reason floor, one audit call and one grant path to keep in step by hand —
 * and the one that drifted would be the one nobody was watching.
 *
 * The scope itself is enforced by the server, not by this file: the
 * all-workspaces read is refused for anybody without the platform-owner grant,
 * so mounting this in the wrong place shows an error, never another customer's
 * requests.
 */
import React from 'react';
import { AccessRequestQueue } from '../AccessRequests';

export function AccessRequestsPanel() {
  return <AccessRequestQueue scope="all" />;
}

export default AccessRequestsPanel;
