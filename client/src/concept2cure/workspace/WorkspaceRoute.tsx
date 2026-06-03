/**
 * Workspace module route entry. Mirrors MdxRoute's pattern: imports the
 * stylesheet once (canonical tokens come from design-system/colors_and_type.css
 * via client/src/main.tsx), then renders the shell. Mounted at
 * /concept2cure/workspace by ZenRouter. Additive — does NOT replace the live
 * /concept2cure/mdx route in this commit.
 */

import * as React from 'react';
import { WorkspaceShell } from './WorkspaceShell';

import './workspace.css';

export default function WorkspaceRoute() {
  return <WorkspaceShell />;
}
