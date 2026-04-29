/**
 * Precedent Intelligence — saved queries + cross-agency narrative.
 * Ported from Surfaces.jsx > PrecedentSurface.
 */

import * as React from 'react';
import { I } from '../icons';

const QUERIES = [
  { q: 'CGM sensor 14-day wear',                          hits: 47 },
  { q: 'IVD cartridge 14 analytes',                       hits: 23 },
  { q: 'Implantable cardiac monitor',                     hits: 182 },
  { q: 'SaMD Class II — clinical decision support',       hits: 419 },
];

export interface PrecedentSurfaceProps {
  onAskAna: (text: string) => void;
}

export function PrecedentSurface(_props: PrecedentSurfaceProps) {
  return (
    <>
      <div className="section-hdr">
        <div>
          <div className="section-title">Precedent intelligence</div>
          <div className="section-sub">
            Cross-pathway predicate and precedent search across FDA, EMA and PMDA
          </div>
        </div>
      </div>
      <div className="col2">
        <div className="panel">
          <div className="panel-hdr">
            <div>
              <div className="t">Saved queries</div>
            </div>
          </div>
          <div className="estar">
            {QUERIES.map((p, i) => (
              <div key={i} className="estar-row">
                <div className="estar-num">{String(i + 1).padStart(2, '0')}</div>
                <div className="estar-label">{p.q}</div>
                <span
                  style={{
                    fontSize: 11,
                    color: 'var(--text-300)',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {p.hits} hits
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="panel">
          <div className="panel-hdr">
            <div>
              <div className="t">Cross-agency precedent patterns</div>
            </div>
          </div>
          <div
            className="panel-body pad"
            style={{ fontSize: 12, color: 'var(--text-200)', lineHeight: 1.6 }}
          >
            <p style={{ margin: '0 0 12px' }}>Trends AnA has surfaced across your portfolio:</p>
            <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <li>
                CGM 14-day wear clearances: <b>12 of 14</b> cleared via 510(k) since 2022. Common
                additional test: <b>ISO 10993-11</b>.
              </li>
              <li>
                FDA feedback pattern: 78% of first-round AI-responses on CGMs cite{' '}
                <b>accuracy sub-analyses by age band</b>.
              </li>
              <li>
                EU MDR Article 61 literature thresholds: notified bodies flag &lt;250 hits as
                "insufficient clinical evidence".
              </li>
            </ul>
          </div>
        </div>
      </div>
      <div style={{ display: 'none' }}>{I.help}</div>
    </>
  );
}
