/**
 * AnaStrip — the 3-prompt scoped suggestion footer shared by all four
 * Intelligence surfaces. Port of ui_kits/intelligence/surfaces.jsx AnaStrip.
 *
 * @module client/src/concept2cure/intelligence/AnaStrip
 */

import * as React from 'react';
import { I } from './icons';
import { INT_SUGGESTIONS } from './data';

export interface AnaStripProps {
  activeNav: string;
  onAsk: (q: string) => void;
}

export function AnaStrip({ activeNav, onAsk }: AnaStripProps) {
  const items = INT_SUGGESTIONS[activeNav] ?? [];
  return (
    <div className="in-ana-strip">
      <div className="av">A</div>
      <div className="chips">
        {items.map((q) => (
          <button key={q} className="chip" type="button" onClick={() => onAsk(q)}>
            <span className="ico">{I.sparkle}</span>
            <span>{q}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
