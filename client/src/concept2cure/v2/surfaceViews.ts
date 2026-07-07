/**
 * SURFACE_VIEWS — the ui-v2 renderer map (kit `window.SURFACE_VIEWS`).
 *
 * Layer 2 of the 5-layer install model: each reconciled registry id maps to
 * its ported kit component plus its layout flags:
 *   full:true    → the surface owns the canvas (editor, regulatory workspace,
 *                  MDX frame)
 *   hideAna:true → collapses the global AnA rail (the surface carries its own
 *                  right pane) — honor this or the editor's doc column is
 *                  crushed.
 *
 * Phase 1 ships the map EMPTY: every id resolves to the honest
 * SurfaceScaffold fallback in V2App. Phase 3 registers each surface here as
 * it ports (kit load order in app/index.html is the port order).
 */
import type React from 'react';
import type { UiSurface } from '@shared/constants/ui-surface-registry';
import { CapabilityIndex } from './intelligence/Intelligence';
import { CodebaseCoverage } from './surfaces/Coverage';
import { CommunicationCenter } from './surfaces/CommunicationCenter';
import { PyramidShell } from './surfaces/Pyramid';
import { SubmissionCenter } from './surfaces/SubmissionCenter';
import { GlobalRiBrowser } from './surfaces/Surfaces';

export interface SurfaceViewProps {
  surface: UiSurface;
  onAsk: (text: string) => void;
  onNav: (id: string) => void;
  segment: string;
}

export interface SurfaceView {
  component: React.ComponentType<SurfaceViewProps>;
  full?: boolean;
  hideAna?: boolean;
}

/* Kit load order (app/index.html) is the port order; flags mirror the kit's
   window.SURFACE_VIEWS registrations exactly. */
export const SURFACE_VIEWS: Record<string, SurfaceView> = {
  'global-ri': { component: GlobalRiBrowser, full: true },
  'intelligence-catalog': { component: CapabilityIndex },
  coverage: { component: CodebaseCoverage },
  'submission-center': { component: SubmissionCenter },
  pyramid: { component: PyramidShell },
  'communication-center': { component: CommunicationCenter },
};
