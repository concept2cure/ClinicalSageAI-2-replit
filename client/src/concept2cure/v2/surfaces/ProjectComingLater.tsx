/** A stage's coming-later line (FILING_SPINE.md §2). Moved unchanged from
 *  ProjectHome.tsx on 2026-10-15, when the Respond tab (F15) became its own
 *  file and needed it too. */
import React from 'react';
import { PJ_LIFECYCLE } from '../fixtures/project-home-data';

/** What this stage does not do in this release: one line of words and no
 *  button (FILING_SPINE.md §2). It replaced a "Not in this release" panel that
 *  stood where a stage's tools would be. */
export function ComingLater({ stage, device = false }: { stage: string; device?: boolean }) {
  const meta = PJ_LIFECYCLE.find((s) => s.id === stage);
  /* A device project's line does not promise IND or variation tracking. */
  const words = (device && meta?.laterDevice) || meta?.later;
  if (!words) return null;
  return (
    <p className="pj-desc pj-later" data-testid="pj-coming-later">
      <b>Coming later:</b> {words}
    </p>
  );
}

