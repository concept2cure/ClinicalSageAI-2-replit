/**
 * CommunicationRoute — mounts the Communication Center (regulated-handoff hub).
 *
 * Mirrors TaskingRoute: imports the MDX base stylesheet (shell chrome —
 * .rail / .topbar / .tabbar / .ana-seam / .panel / .tbl) first, then the
 * tasking overlay (which pulls in the biopharma bp-* + AnA dock primitives the
 * shell reuses). Route-agnostic — ZenApp owns the nav=communication trigger.
 *
 * @module client/src/concept2cure/communication/CommunicationRoute
 */

import * as React from 'react';
import { CommunicationApp, type CommunicationAppProps } from './App';
import '../mdx/app.css';
import '../tasking/app.css';

export type CommunicationRouteProps = CommunicationAppProps;

export default function CommunicationRoute(props: CommunicationRouteProps = {}) {
  return <CommunicationApp {...props} />;
}
