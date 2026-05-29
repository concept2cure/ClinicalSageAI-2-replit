/**
 * LabelingRoute — mounts the labeling workstream domain shell.
 *
 * Mirrors CmcRoute: imports the MDX base stylesheet (shell chrome —
 * .rail / .topbar / .tabbar / .ana-seam) first, then the labeling overlay
 * (which itself pulls in the biopharma bp-* surface primitives). Route-agnostic
 * — ZenApp owns the nav=labeling trigger and passes the active project id
 * through.
 *
 * @module client/src/concept2cure/labeling/LabelingRoute
 */

import * as React from 'react';
import { LabelingApp, type LabelingAppProps } from './App';
import '../mdx/app.css';
import './app.css';

export type LabelingRouteProps = LabelingAppProps;

export default function LabelingRoute(props: LabelingRouteProps = {}) {
  return <LabelingApp {...props} />;
}
