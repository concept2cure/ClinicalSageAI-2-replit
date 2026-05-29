/**
 * RiskRoute — mounts the risk-management workstream domain shell.
 *
 * Mirrors LabelingRoute: imports the MDX base stylesheet (shell chrome —
 * .rail / .topbar / .tabbar / .ana-seam) first, then the risk overlay
 * (which itself pulls in the biopharma bp-* surface primitives). Route-agnostic
 * — ZenApp owns the nav=risk trigger and passes the active project id through.
 *
 * @module client/src/concept2cure/risk/RiskRoute
 */

import * as React from 'react';
import { RiskApp, type RiskAppProps } from './App';
import '../mdx/app.css';
import './app.css';

export type RiskRouteProps = RiskAppProps;

export default function RiskRoute(props: RiskRouteProps = {}) {
  return <RiskApp {...props} />;
}
