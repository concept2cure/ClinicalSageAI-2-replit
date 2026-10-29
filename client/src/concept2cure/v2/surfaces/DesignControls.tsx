import React from 'react';
import { I } from '../icons';
import type { SurfaceViewProps } from '../surfaceViews';
import { usePublishSurfaceContext } from '../surfaceContext';
import { shellProgramId, useShellProject } from '../shellProject';
import { DesignControlsTrace, useDesignControlsTrace } from './DesignControlsTrace';
import '../styles/project-home-v2.css';

/* ════ Design Controls -- DHF surface ════

   The trace (the matrix, the gap breakdown, the §7.3 checklist, New design
   input, the Ask AnA on each row) is ./DesignControlsTrace.tsx, which
   Engineering mounts as well until this screen folds into it (D2, fold F1
   slice B, 2026-10-29;
   docs/evidence/D2-ONE-ANA/2026-10-29/fold-f1b-engineering-parity/). This
   screen draws its header and publishes what AnA can see under
   `design-controls`.

   D2, fold F1 slice A (2026-10-29): with a project open, the read is that
   project's design inputs; with none, the organization's register, as before. */

export { designControlChecklistDefs } from './DesignControlsTrace';

export function DesignControls({ onAsk }: SurfaceViewProps) {
  const programId = shellProgramId(useShellProject());
  const dc = useDesignControlsTrace({ programId });
  usePublishSurfaceContext('design-controls', dc.anaContext);
  const isLive = dc.read.status === 'ready' && !dc.pendingStore;

  return (
    <div className="dc" style={{ maxWidth: 1200 }}>
      <div className="sp-head">
        <div>
          <div className="sp-eyebrow">Specialist {I.dot} device {isLive ? <> {I.dot} live</> : ''}</div>
          <h1 className="sp-title">Design controls {I.dot} DHF</h1>
          <p className="sp-state">{programId ? 'This project’s design inputs.' : 'Organization-wide design-controls register.'} Design and development — {dc.dcBasis} — inputs {'->'} outputs {'->'} verification {'->'} validation, traced end to end.</p>
        </div>
        {dc.canWrite && (
          <button
            className="sp-primary"
            onClick={() => dc.setForm(true)}
            disabled={!dc.mayAdd}
            title={dc.pendingStore ? 'The design-controls store is not provisioned in this environment.' : undefined}
          >{I.plus} New design input</button>
        )}
      </div>

      <DesignControlsTrace dc={dc} onAsk={onAsk} />
    </div>
  );
}
