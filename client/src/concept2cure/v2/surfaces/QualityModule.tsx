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
  // A training task's notice says `qmsIntent: 'read'` (MR-12 Stage 4 slice 4b): the register opens the reader, not the editor.
  const intentOf=(params:Record<string,string>|null)=>params?.qmsIntent==='read'?'read' as const:undefined;
  const [target,setTarget]=React.useState(()=>{const params=consumeNavParams('quality');return {id:params?.qmsDocumentId,intent:intentOf(params),request:0};});
  React.useEffect(()=>{
    const receive=()=>{const params=consumeNavParams('quality');if(params?.qmsDocumentId)setTarget(current=>({id:params.qmsDocumentId,intent:intentOf(params),request:current.request+1}));};
    window.addEventListener(NAV_PARAMS_EVENT,receive);return()=>window.removeEventListener(NAV_PARAMS_EVENT,receive);
  },[]);
  return <QualityRoute onAskAna={onAsk} onNavigate={onNav} qmsDocumentId={target.id} qmsIntent={target.intent} qmsTargetRequest={target.request} />;
}
