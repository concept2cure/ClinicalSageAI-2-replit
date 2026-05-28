/**
 * BiopharmaRoute — mounts the Phase 10 biopharma domain shell.
 *
 * Mirrors PdevRoute: imports stylesheet, re-exports App. Route-agnostic —
 * the host (ZenApp) decides the mount path and nav=biopharma trigger.
 *
 * @module client/src/concept2cure/biopharma/BiopharmaRoute
 */

import * as React from 'react';
import { BiopharmaApp, type BiopharmaAppProps } from './App';
import './app.css';

export type BiopharmaRouteProps = BiopharmaAppProps;

export default function BiopharmaRoute(props: BiopharmaRouteProps = {}) {
  return <BiopharmaApp {...props} />;
}
