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
import QualityRoute, { type QualityRouteProps } from '../../quality/QualityRoute';
import { resolveSurfaceAction } from '@shared/navigation/surface-actions';
import { applySurfaceAction, type SurfaceActionOutcome } from '../surfaceActions';
import { C2CToast, useToast } from '../toast';
import {consumeNavParams,NAV_PARAMS_EVENT} from '../navParams';
import { keepWorkProjectBinding } from './ProjectWorkTasks';

export function QualityModule({ onAsk, onNav }: SurfaceViewProps) {
  const [notice, notify] = useToast();
  const intentOf = (params: Record<string,string> | null) => params?.qmsIntent === 'read' ? 'read' as const : undefined;
  const tabOf = (params: Record<string,string> | null): QualityRouteProps['initialTab'] =>
    params?.qmsTab && resolveSurfaceAction('quality.open-tab', { tab: params.qmsTab }).ok
      ? params.qmsTab as QualityRouteProps['initialTab'] : undefined;
  const [target, setTarget] = React.useState(() => {
    const params = consumeNavParams('quality');
    keepWorkProjectBinding(params); // P-111: a Quality work project's door binds the area (ProjectWorkTasks.tsx)
    return { id: params?.qmsDocumentId, intent: intentOf(params), tab: tabOf(params), request: 0 };
  });
  React.useEffect(() => {
    const outcome = (result: SurfaceActionOutcome) => {
      if (result.status === 'failed' || result.status === 'unavailable') notify(result.reason, 'error');
    };
    const receive = () => {
      const params = consumeNavParams('quality');
      keepWorkProjectBinding(params);
      if (params?.qmsDocumentId) {
        setTarget(current => ({ ...current, id: params.qmsDocumentId, intent: intentOf(params), request: current.request + 1 }));
      } else if (tabOf(params)) {
        const action = resolveSurfaceAction('quality.open-tab', { tab: params!.qmsTab });
        if (action.ok) outcome(applySurfaceAction(action.directive, onNav, outcome));
      }
    };
    window.addEventListener(NAV_PARAMS_EVENT, receive);
    return () => window.removeEventListener(NAV_PARAMS_EVENT, receive);
  }, [onNav, notify]);
  return <><QualityRoute onAskAna={onAsk} onNavigate={onNav} initialTab={target.tab}
    qmsDocumentId={target.id} qmsIntent={target.intent} qmsTargetRequest={target.request} /><C2CToast msg={notice} /></>;
}
