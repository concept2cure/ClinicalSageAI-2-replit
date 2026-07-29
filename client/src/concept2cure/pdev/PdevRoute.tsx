/**
 * PDEV module route entry — mirrors the MdxRoute pattern.
 *
 * Imports the kit's stylesheet (verbatim, with the inline `:root` block
 * stripped during port — canonical tokens come from
 * design-system/colors_and_type.css, imported once at the v2 client
 * root). Mount path is decided by the v2 router — this component is
 * route-agnostic.
 *
 * Behind feature flag `ENABLE_PDEV_SURFACE` (see client/src/flags/featureFlags.ts).
 * The host renderer should check the flag before importing this route to keep
 * the bundle slim when the flag is off.
 */

import * as React from 'react';
import { PdevApp, type PdevAppProps } from './App';

import './app.css';

export interface PdevRouteProps extends PdevAppProps {}

export default function PdevRoute(props: PdevRouteProps = {}) {
  return <PdevApp {...props} />;
}
