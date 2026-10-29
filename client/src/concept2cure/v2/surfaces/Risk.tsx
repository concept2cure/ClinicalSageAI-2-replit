import React from 'react';

import { usePublishSurfaceContext } from '../surfaceContext';
import { I } from '../icons';
import type { SurfaceViewProps } from '../surfaceViews';
import { shellProgramId, useShellProject } from '../shellProject';
import { RiskRegister, useRiskRegister } from './RiskRegister';
import '../styles/project-home-v2.css';

/* ---- Risk management (ISO 14971) ----

   The register (the matrix, the drawer, the metrics, the hazard and control
   forms, the signed Accept residual, AnA's matrix actions) is
   ./RiskRegister.tsx, which Engineering mounts as well until this screen folds
   into it (D2, fold F1 slice B, 2026-10-29;
   docs/evidence/D2-ONE-ANA/2026-10-29/fold-f1b-engineering-parity/). This
   screen draws its header and publishes what AnA can see under `risk`.

   With a project open the register is that project's; with none, the
   organization's, as before. */

export { mapRiskItems, postResidualAcceptance } from './RiskRegister';

export function Risk({ onAsk }: SurfaceViewProps) {
  const programId = shellProgramId(useShellProject());
  const register = useRiskRegister({ programId, surfaceId: 'risk' });
  usePublishSurfaceContext('risk', register.anaContext);

  return (
    <div className="page-inner">
      <div className="ph">
        <div>
          <div className="ph-eyebrow">Specialist / device</div>
          <h1 className="ph-title">Risk management</h1>
          <div className="ph-sub">
            {programId
              ? 'This project’s risk register. ISO 14971 hazard analysis, 5x5 risk matrix, risk controls, residual risk and benefit-risk.'
              : 'Organization-wide risk register. ISO 14971 hazard analysis, 5x5 risk matrix, risk controls, residual risk and benefit-risk. Use the project’s evidence for its risk file.'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn ghost" onClick={() => onAsk('Summarize the open risk evaluations')}>{I.sparkles} Ask AnA</button>
          {register.canWrite && (
            <button className="btn primary" onClick={() => register.setForm(true)} disabled={!register.mayAdd}>{I.plus} New hazard</button>
          )}
        </div>
      </div>

      <RiskRegister register={register} onAsk={onAsk} />
    </div>
  );
}
