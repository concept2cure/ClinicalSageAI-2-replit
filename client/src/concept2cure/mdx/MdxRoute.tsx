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

export interface MdxRouteProps {
  /** Initial workstream tab — k510 / pma / cer / project-home / overview / etc. */
  initialNav?: string;
  /** Project name to render in the topbar context, when mounted under a project. */
  projectName?: string | null;
  /** Open the Phase 9 Universal Authoring shell on a doc type (ind/pma/cer/…).
   *  The host (ZenApp) switches to the authoring layout — the MDX shell no
   *  longer owns per-pathway editors (Phase 9 consolidation). */
  onOpenAuthoring?: (docType?: string) => void;
  /** Active project id from the host, forwarded so AnA chat uploads scope into
   *  that project's memory. */
  projectId?: string;
}

export default function MdxRoute({ initialNav, projectName, onOpenAuthoring, projectId }: MdxRouteProps = {}) {
  return (
    <App
      initialNav={initialNav}
      projectName={projectName}
      onOpenAuthoring={onOpenAuthoring}
      projectId={projectId}
    />
  );
}
