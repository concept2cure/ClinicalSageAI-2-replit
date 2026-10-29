/** One Quality KPI tile (change control and the quality records). */
import * as React from 'react';

export function Kpi({
  label, val, sub, tone,
}: { label: string; val: string; sub: string; tone?: 'ok' | 'warn' | 'err' }) {
  return (
    <div className="qms-kpi" data-tone={tone === 'ok' ? '' : tone || ''}>
      <div className="lbl">{label}</div>
      <div className="val">{val}</div>
      <div className="sub">{sub}</div>
    </div>
  );
}
