/**
 * Engineering's risk register and design-control trace, mounted the way
 * mdx/surfaces/EngineeringSurface.tsx mounts them: for the open project, read
 * only for it (`requireProject`), with the register's AnA actions under
 * device-engineering, each in its section with the section head's write button.
 *
 * Test support, not a test. The suites that pinned the Risk and Design controls
 * screens (v2/surfaces/Risk.tsx, v2/surfaces/DesignControls.tsx) pin the panels
 * those screens drew, which are these components; the screens folded into
 * device-engineering (D2, fold F1c, 2026-10-29;
 * docs/evidence/D2-ONE-ANA/2026-10-29/grant-continuity-and-f1c-f2/), so their
 * cases now run against the panels as Engineering mounts them. That
 * Engineering mounts them is pinned by its own suites
 * (mdx/surfaces/__tests__/EngineeringSurface.riskRegister.test.tsx,
 * EngineeringSurface.designControls.test.tsx), and that it is reached by
 * foldRiskDesignControls.test.ts.
 */
import React from 'react';

import { RiskRegister, useRiskRegister } from '../surfaces/RiskRegister';
import { DesignControlsTrace, useDesignControlsTrace } from '../surfaces/DesignControlsTrace';
import type { SurfaceContext } from '../surfaceContext';
import { useReportToHost } from '../../mdx/surfaces/hostContextReport';

type PanelContext = Omit<SurfaceContext, 'surfaceId'>;

/** The open project the panels are mounted for. */
export const PANEL_PROGRAM_ID = '0b6f1c1e-4d2a-4c55-9a1e-3f7b2d9c8e10';
/** The register's read, as Engineering makes it. */
export const RISK_READ = `/api/mdx/risk-items?program_id=${PANEL_PROGRAM_ID}`;
/** The trace's read, as Engineering makes it. */
export const DC_READ = `/api/design-controls?program_id=${PANEL_PROGRAM_ID}`;

/** A list answer keyed to the panels' project, as the routes answer an admitted project. */
export function keyedToPanelProject(data: unknown[], meta: Record<string, unknown> = {}) {
  return { data, meta: { count: data.length, ...meta, scope: 'program', programId: PANEL_PROGRAM_ID } };
}

interface PanelProps {
  onAsk?: (text: string) => void;
  /** Receives what AnA may see of the panel when it changes, null on unmount (the host merges it into device-engineering's context). */
  onContext?: (ctx: PanelContext | null) => void;
}

/** The risk register, as Engineering's "Risk management · ISO 14971" section draws it. */
export function EngineeringRiskPanel({ onAsk = () => {}, onContext }: PanelProps) {
  const risk = useRiskRegister({ programId: PANEL_PROGRAM_ID, requireProject: true, surfaceId: 'device-engineering' });
  useReportToHost(onContext, risk.anaContext);
  return (
    <section className="section" data-testid="eng-risk-register">
      <div className="section-head">
        <h2>Risk management · ISO 14971</h2>
        {risk.canWrite && (
          <button className="btn ghost small" onClick={() => risk.setForm(true)} disabled={!risk.mayAdd} type="button">
            New hazard
          </button>
        )}
      </div>
      <RiskRegister register={risk} onAsk={onAsk} />
    </section>
  );
}

/** The design-control trace, as Engineering's "Design controls · DHF" section draws it. */
export function EngineeringDesignControlsPanel({ onAsk = () => {}, onContext }: PanelProps) {
  const dc = useDesignControlsTrace({ programId: PANEL_PROGRAM_ID, requireProject: true });
  useReportToHost(onContext, dc.anaContext);
  return (
    <section className="section" data-testid="eng-design-controls">
      <div className="section-head">
        <h2>Design controls · DHF</h2>
        {dc.canWrite && (
          <button className="btn ghost small" onClick={() => dc.setForm(true)} disabled={!dc.mayAdd} type="button">
            New design input
          </button>
        )}
      </div>
      <DesignControlsTrace dc={dc} onAsk={onAsk} />
    </section>
  );
}
