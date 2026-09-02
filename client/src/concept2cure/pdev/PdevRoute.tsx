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
/* LAST, deliberately. `surface-text-ramp.css` re-bases `--text-400` /
   `--text-300` on every element that establishes a tinted surface, so it has to
   load after the sheets that declare those surfaces — a custom property set
   earlier in the cascade would be overwritten by the rule it is correcting.
   This is the pdev/ slice: one generated sheet per shell tree, because Vite keeps
   every shell CSS chunk in <head> for the session and a class defined in two
   trees is a page-wide collision (ci:check-shell-css-collisions).
   GENERATED: scripts/design/generate-surface-text-ramp.mjs, drift-checked by
   ci:surface-text-ramp. See GA ledger L102. */
import './surface-text-ramp.css';

export interface PdevRouteProps extends PdevAppProps {}

export default function PdevRoute(props: PdevRouteProps) {
  return <PdevApp {...props} />;
}
