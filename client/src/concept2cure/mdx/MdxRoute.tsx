/**
 * MDX module route entry. Imports the kit's stylesheet (verbatim, with the
 * inline `:root` and `.dark` blocks stripped during port — canonical tokens
 * come from `design-system/colors_and_type.css`, imported once at the v2
 * client root in `client/src/index.css`).
 *
 * Mount path is decided by the v2 router. This component is route-agnostic.
 */

import * as React from 'react';
import { App } from './App';

import './app.css';
import './pathway-tabs.css';

export interface MdxRouteProps {
  /** Initial workstream tab — k510 / pma / cer / project-home / overview / etc. */
  initialNav?: string;
  /** Project name to render in the topbar context, when mounted under a project. */
  projectName?: string | null;
}

export default function MdxRoute({ initialNav, projectName }: MdxRouteProps = {}) {
  return <App initialNav={initialNav} projectName={projectName} />;
}
