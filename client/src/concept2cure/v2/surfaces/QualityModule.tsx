/**
 * QualityModule — the Quality & Assurance domain surface for the ui-v2 shell.
 *
 * Thin adapter that mounts the self-contained quality module
 * (client/src/concept2cure/quality) inside the v2 `.page`, mapping the shell's
 * SurfaceViewProps onto the module's host contract: `onAsk` → the real AnA
 * conversation, `onNav` → shell navigation. The module carries its own topbar,
 * tab bar (SOP register · Change control) and scoped stylesheet, so it renders
 * full-bleed (SURFACE_VIEWS `full: true`).
 *
 * @module client/src/concept2cure/v2/surfaces/QualityModule
 */

import React from 'react';
import type { SurfaceViewProps } from '../surfaceViews';
import QualityRoute from '../../quality/QualityRoute';

export function QualityModule({ onAsk, onNav }: SurfaceViewProps) {
  return <QualityRoute onAskAna={onAsk} onNavigate={onNav} />;
}
