/**
 * Empty-state surface used by rail items that are intentionally stubbed
 * pending their own design phase. Ported from Surfaces.jsx > InDesignSurface.
 */

import * as React from 'react';
import { I, type IconKey } from '../icons';
import type { StubInfo } from '../data/nav';

export function InDesignSurface({ stub }: { stub: StubInfo | null }) {
  if (!stub) return null;
  const icon: IconKey = (stub.icon in I ? stub.icon : 'alertCircle') as IconKey;
  return (
    <div className="indesign">
      <div className="indesign-icon">{I[icon]}</div>
      <div className="indesign-phase">In design · {stub.phase}</div>
      <h2>{stub.title}</h2>
      <div className="indesign-desc">{stub.desc}</div>
    </div>
  );
}
