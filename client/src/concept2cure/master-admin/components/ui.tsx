/** Tiny presentational primitives local to the Master Administration module. */

import * as React from 'react';

export function Badge({
  tone = 'muted',
  children,
}: {
  tone?: 'ok' | 'warn' | 'err' | 'muted' | 'accent';
  children: React.ReactNode;
}) {
  return <span className={`ma-badge ma-badge-${tone}`}>{children}</span>;
}

export function Kpi({
  label,
  value,
  unit,
  meta,
  metaTone,
}: {
  label: string;
  value: React.ReactNode;
  unit?: string;
  meta?: string;
  metaTone?: 'ok' | 'warn' | 'err' | 'muted';
}) {
  return (
    <div className="ma-kpi">
      <div className="ma-kpi-label">{label}</div>
      <div className="ma-kpi-value">
        {value}
        {unit && <span className="ma-kpi-unit">{unit}</span>}
      </div>
      {meta && <div className={`ma-kpi-meta ${metaTone ? `ma-tone-${metaTone}` : ''}`}>{meta}</div>}
    </div>
  );
}

export function SectionHeader({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="ma-section-hdr">
      <div>
        <div className="ma-section-title">{title}</div>
        {sub && <div className="ma-section-sub">{sub}</div>}
      </div>
      {children && <div className="ma-section-actions">{children}</div>}
    </div>
  );
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return <div className="ma-state">{label}</div>;
}

export function ErrorState({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return (
    <div className="ma-state ma-state-err">
      <div>Could not load data.</div>
      <div className="ma-state-detail">{error}</div>
      {onRetry && (
        <button className="ma-btn" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}

export function Empty({ label }: { label: string }) {
  return <div className="ma-state ma-state-empty">{label}</div>;
}
