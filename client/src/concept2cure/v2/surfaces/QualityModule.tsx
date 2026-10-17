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
import {consumeNavParams,NAV_PARAMS_EVENT} from '../navParams';

export function QualityModule({ onAsk, onNav }: SurfaceViewProps) {
  const [target,setTarget]=React.useState(()=>({id:consumeNavParams('quality')?.qmsDocumentId,request:0}));
  React.useEffect(()=>{
    const receive=()=>{const params=consumeNavParams('quality');if(params?.qmsDocumentId)setTarget(current=>({id:params.qmsDocumentId,request:current.request+1}));};
    window.addEventListener(NAV_PARAMS_EVENT,receive);return()=>window.removeEventListener(NAV_PARAMS_EVENT,receive);
  },[]);
  return <QualityRoute onAskAna={onAsk} onNavigate={onNav} qmsDocumentId={target.id} qmsTargetRequest={target.request} />;
}
