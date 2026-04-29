/**
 * Single placeholder used by the four surfaces whose source files are absent
 * from the current design-system kit drop:
 *   - CER 7-tab workbench (CerWorkbench.jsx)
 *   - Pre-Sub manager   (PreSub.jsx + data-presub.jsx)
 *   - PMA editor        (EditorSurfaces.jsx + DocumentEditor.jsx + data-editors.jsx)
 *   - CER editor        (same as above)
 *
 * Reuses the kit's `.indesign` style so the layout is consistent with the
 * existing rail-stub empty state. No emoji, no exclamation, sentence case.
 */

import * as React from 'react';
import { I, type IconKey } from '../icons';

export interface ComingSoonProps {
  title: string;
  description: string;
  icon?: IconKey;
}

export function ComingSoon({ title, description, icon = 'sparkles' }: ComingSoonProps) {
  return (
    <div className="indesign">
      <div className="indesign-icon">{I[icon]}</div>
      <div className="indesign-phase">In design · waiting on next kit drop</div>
      <h2>{title}</h2>
      <div className="indesign-desc">{description}</div>
    </div>
  );
}
