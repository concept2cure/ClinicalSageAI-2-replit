import { IvdAssessmentWorkbench } from './IvdAssessmentWorkbench';
import { IvdReadinessBoard, ivdReadinessContext, ivdReadinessView, useIvdReadiness } from './IvdReadinessBoard';
import React, { useMemo } from 'react';
import { I } from '../icons';
import type { SurfaceViewProps } from '../surfaceViews';
import { usePublishSurfaceContext } from '../surfaceContext';
import { shellProgramId, useShellProject } from '../shellProject';
import '../styles/project-home-v2.css';

/* ── IVD Completeness -- IVDR technical-file / Performance-Evaluation readiness.

   Real-data standard (no fixture in a shipped surface). This board previously
   built its requirement checklist from a fabricated diagnostics dossier spine
   (`../fixtures/dossier-data` -> DOSSIER_SPINES.diagnostics, flattened to
   leaves) plus a hardcoded post-market family (IVD_POSTMARKET) with invented
   statuses, labelled "Sample data".

   It is anchored to the REAL read-model:
     GET /api/ivd-completeness/completeness   (server/routes/ivd-completeness-routes.ts)

   D2, 2026-10-29 (docs/evidence/D2-ONE-ANA/2026-10-29/fold-f2-ivd-completeness/):
   the family board moved to ./IvdReadinessBoard.tsx, which device-diagnostics
   (mdx/surfaces/IvdSurface.tsx) draws as its readiness panel. This screen mounts
   the same board until it folds into device-diagnostics. It reads the open
   project, and the organization only when no project is open, and says which. ── */

export function IvdCompleteness({ onAsk, segment, onNav }: SurfaceViewProps) {
  const seg = segment || 'diagnostics';
  /* IVD-only board: only read on the IVD segment (a null path idles the read). */
  const readiness = useIvdReadiness(shellProgramId(useShellProject()), seg === 'diagnostics');
  const { read, open, programId } = readiness;
  const data = read.data;

  /* What AnA can see of this screen. Published BEFORE the wrong-segment early
     return below — that return is a legitimate screen state ("this board is
     IVD-only, you are on another segment") and it is exactly the state a user
     would ask about, so it must not be the one state AnA cannot see. React
     would refuse the conditional call anyway.

     A FAILED or refused read publishes the failure: reporting 0% technical-file
     completeness over an outage is a Notified-Body readiness claim nobody
     computed. */
  const anaContext = useMemo(() => {
    if (seg !== 'diagnostics') {
      return {
        summary:
          `The IVDR technical-file completeness board applies to In-Vitro Diagnostic projects only, and the ` +
          `active segment is "${seg}" — so no completeness data is on screen. This is a segment mismatch, ` +
          'not an empty technical file.',
        availableActions: ['Switch to the Diagnostics / IVD segment to see this board'],
      };
    }
    return ivdReadinessContext(ivdReadinessView({ programId, read }), open);
  }, [seg, programId, read, open]);
  usePublishSurfaceContext('ivd-completeness', anaContext);

  /* wrong-segment guard: this view is IVD-only */
  if (seg !== 'diagnostics') {
    return (
      <div className="ivd">
        <div className="ivd-lead">
          <div className="ivd-lead-ic">{I.alertTriangle}</div>
          <div>
            <p className="ivd-lead-h">The IVD completeness view applies to In-Vitro Diagnostic projects.</p>
            <p className="ivd-lead-b">Switch to the Diagnostics / IVD segment to see the IVDR requirements (GSPR Annex I, Performance Evaluation Report, analytical + clinical performance, PMPF/PMS).</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="ivd">
      <div className="ivd-head">
        <div className="ivd-eyebrow">
          <span className="ivd-kicker">IVDR technical file — performance evaluation</span>
        </div>
        <h1 className="ivd-title">{data?.program || 'IVD project'}</h1>
        <div className="ivd-sub">{data?.spine || 'EU IVDR 2017/746 · Annex II/III · Annex XIII'} — technical-file completeness</div>
      </div>

      <IvdAssessmentWorkbench onNav={onNav} />
      <IvdReadinessBoard readiness={readiness} onAsk={onAsk} />
    </div>
  );
}
