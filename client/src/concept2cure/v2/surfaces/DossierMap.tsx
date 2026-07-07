/**
 * Dossier Map -- kit app/Project2.jsx `DossierMap` ported.
 *
 * Registry id: `dossier-map`
 *
 * CTD / eCTD module map with completeness and readiness overlay.
 */
import React from 'react';
import { I } from '../icons';
import { SampleTag } from '../dataConnect';
import type { SurfaceViewProps } from '../surfaceViews';
import { DOSSIER } from '../fixtures/project2-data';
import '../styles/project-home-v2.css';

/* ── Inline helpers ── */

function PageHead({ eyebrow, title, sub, actions }: {
  eyebrow: string;
  title: string;
  sub?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="ph">
      <div>
        <div className="ph-eyebrow">{eyebrow}</div>
        <h1 className="ph-title">{title}</h1>
        {sub && <div className="ph-sub">{sub}</div>}
      </div>
      {actions && <div style={{ display: 'flex', gap: 8 }}>{actions}</div>}
    </div>
  );
}

/* ════ Dossier Map surface ════ */

export function DossierMap({ onAsk }: SurfaceViewProps) {
  return (
    <div className="page-inner">
      <SampleTag sample={true} />
      <PageHead
        eyebrow="Project · submission"
        title="Dossier map"
        sub="CTD / eCTD module map with completeness and readiness overlay."
        actions={
          <button className="btn ghost" onClick={() => onAsk('What is the critical path to filing?')}>
            {I.sparkles} Ask AnA
          </button>
        }
      />

      <div className="dossier">
        {DOSSIER.map((m) => (
          <div key={m.m} className="dmod">
            <div className="dmod-h">
              <span className="dmod-m">M{m.m}</span>
              <span className="dmod-l">{m.label}</span>
              <span className={`rd-chip tone-${m.tone}`}>{m.pct}%</span>
            </div>
            <div className="dmod-bar">
              <div className="dmod-bar-f" data-tone={m.tone} style={{ width: m.pct + '%' }} />
            </div>
            <div className="dmod-sec">
              {m.sections.map((s) => (
                <span key={s} className="dmod-chip">{s}</span>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="scaf-note" style={{ marginTop: 18, maxWidth: 760 }}>
        Critical path: Module 2.5 (clinical overview) and 3.2.P (drug product) are the two below-target modules gating the Q3 filing. AnA can sequence the remaining sections by reviewer-risk.
      </div>
    </div>
  );
}
