/**
 * TaskingRoute — mounts the cross-program tasking workstream domain shell.
 *
 * Mirrors RiskRoute: imports the MDX base stylesheet (shell chrome —
 * .rail / .topbar / .tabbar / .ana-seam) first, then the tasking overlay
 * (which itself pulls in the biopharma bp-* surface primitives). Route-agnostic
 * — ZenApp owns the nav=tasking trigger.
 *
 * @module client/src/concept2cure/tasking/TaskingRoute
 */

import * as React from 'react';
import { TaskingApp, type TaskingAppProps } from './App';
import '../mdx/app.css';
import './app.css';

export type TaskingRouteProps = TaskingAppProps;

export default function TaskingRoute(props: TaskingRouteProps = {}) {
  return <TaskingApp {...props} />;
}
