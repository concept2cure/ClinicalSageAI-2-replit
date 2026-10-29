/**
 * Engineering's two panels, the project's risk register and design-control
 * trace (v2/surfaces/RiskRegister.tsx, v2/surfaces/DesignControlsTrace.tsx,
 * mounted by fold F1 slice B), each compute what AnA may see of them. The host
 * publishes device-engineering's context (mdx/MdxSurfaceHost.tsx), and the
 * store holds one context at a time, so a second publish from the screen would
 * replace the host's. The screen hands the panels' context up instead, and the
 * host merges it into its one publish for the project in context (D2,
 * 2026-10-29, docs/evidence/D2-ONE-ANA/2026-10-29/device-vault-admits-project/).
 *
 * Its own module because EngineeringSurface.tsx is at the file-length limit.
 *
 * @module client/src/concept2cure/mdx/surfaces/engineeringPanelsContext
 */
import { useEffect, useRef } from 'react';
import type { SurfaceContext } from '../../v2/surfaceContext';
import type { Program } from '../data/programs';

type PanelContext = Omit<SurfaceContext, 'surfaceId'>;

/** What AnA may see of the risk register and the trace, and the project they were read for. */
export interface EngineeringPanelsContext {
  programId: string;
  risk: PanelContext;
  designControls: PanelContext;
}

export interface EngineeringPanelsContextProps {
  /** Receives the panels' AnA context when its content changes, and null on unmount. */
  onPanelsContext?: (ctx: EngineeringPanelsContext | null) => void;
}

/**
 * Report the panels' context to the host: in every state, refusal and loading
 * included, since each panel's context says itself why it holds no rows; null
 * with no project, and null on unmount.
 *
 * Only a change of content is reported. The effect is keyed on the context's
 * serialization, as usePublishSurfaceContext is (v2/surfaceContext.ts). The
 * host stores what it receives, which re-renders the screen with the same
 * content, so reporting on every render would never settle.
 */
export function useReportPanelsContext(
  report: EngineeringPanelsContextProps['onPanelsContext'],
  program: Program | null,
  risk: PanelContext,
  designControls: PanelContext,
): void {
  const ctx: EngineeringPanelsContext | null = program ? { programId: String(program.id), risk, designControls } : null;
  const key = ctx ? JSON.stringify(ctx) : '';
  const latest = useRef({ report, ctx });
  latest.current = { report, ctx };
  useEffect(() => {
    latest.current.report?.(latest.current.ctx);
  }, [key]);
  useEffect(() => {
    const box = latest;
    return () => box.current.report?.(null);
  }, []);
}
