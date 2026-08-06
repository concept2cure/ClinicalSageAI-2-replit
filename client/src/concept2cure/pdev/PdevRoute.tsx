/**
 * PDEV entry point — imports the kit's stylesheet and renders one surface.
 *
 * No longer a route. It was one, and the v2 `pdev` surface was a stub that
 * navigated the browser to it, unmounting the shell so the kit could draw its
 * own Rail, TopBar and AnA dock. `v2/surfaces/PdevSurfaces` mounts this inside
 * the shell instead, once per destination.
 *
 * `nav` and `onNav` are required rather than optional: a surface that does not
 * know which surface it is would silently fall back to the overview, which is
 * how a mis-wired registry entry becomes a screen that looks fine and shows the
 * wrong thing.
 */

import * as React from 'react';
import { PdevApp, type PdevAppProps } from './App';

import './app.css';

export interface PdevRouteProps extends PdevAppProps {}

export default function PdevRoute(props: PdevRouteProps) {
  return <PdevApp {...props} />;
}
