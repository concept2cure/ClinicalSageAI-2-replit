/**
 * IntelligenceRoute — mounts the Phase 11 Intelligence cluster shell.
 *
 * Mirrors BiopharmaRoute / PdevRoute: imports the stylesheet, re-exports the
 * App. Route-agnostic — the host (ZenApp) decides the mount and the
 * nav=protocol|cmc|biostat|reporting trigger.
 *
 * @module client/src/concept2cure/intelligence/IntelligenceRoute
 */

import * as React from 'react';
import { IntelligenceApp, type IntelligenceAppProps } from './App';
import './app.css';

export type IntelligenceRouteProps = IntelligenceAppProps;

export default function IntelligenceRoute(props: IntelligenceRouteProps = {}) {
  return <IntelligenceApp {...props} />;
}
