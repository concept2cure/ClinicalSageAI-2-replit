/**
 * CmcRoute — mounts the Phase 10 CMC (Module 3) domain shell.
 *
 * Mirrors BiopharmaRoute: imports the MDX base stylesheet (shell chrome —
 * .rail / .topbar / .tabbar / .ana-seam) first, then the CMC overlay (which
 * itself pulls in the biopharma bp-* surface primitives). Route-agnostic —
 * ZenApp owns the nav=cmc trigger and passes the active project id through.
 *
 * @module client/src/concept2cure/cmc/CmcRoute
 */

import * as React from 'react';
import { CmcApp, type CmcAppProps } from './App';
import '../mdx/app.css';
import './app.css';

export type CmcRouteProps = CmcAppProps;

export default function CmcRoute(props: CmcRouteProps = {}) {
  return <CmcApp {...props} />;
}
