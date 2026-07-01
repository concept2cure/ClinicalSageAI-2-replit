/**
 * RbmRoute — mounts the Risk-Based Monitoring (RBM / RBQM) workstream.
 *
 * ZenApp owns the nav=rbm trigger and passes the active project id through.
 * The shell is self-styled (design-system tokens), so no overlay stylesheet is
 * required. See docs/rbm/RBM_DESIGN_SOW.md for the design hand-off.
 *
 * @module client/src/concept2cure/rbm/RbmRoute
 */

import * as React from 'react';
import { RbmApp, type RbmAppProps } from './App';

export type RbmRouteProps = RbmAppProps;

export default function RbmRoute(props: RbmRouteProps = {}) {
  return <RbmApp {...props} />;
}
