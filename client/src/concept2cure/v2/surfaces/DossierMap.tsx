/**
 * Dossier Map -- kit app/Project2.jsx `DossierMap` ported.
 *
 * Registry id: `dossier-map`
 *
 * CTD / eCTD module map with completeness and readiness overlay.
 */
import React from 'react';
import { I } from '../icons';
import { SampleTag, useLiveList } from '../dataConnect';
import type { SurfaceViewProps } from '../surfaceViews';
import { DOSSIER } from '../fixtures/project2-data';
import type { DossierModule } from '../fixtures/project2-data';
import '../styles/project-home-v2.css';

/* ── Inline helpers ── */

function PageHead({ eyebrow, title, sub, actions, sample }: {
  eyebrow: string;
  title: string;
  sub?: string;
  actions?: React.ReactNode;
  sample?: boolean;
}) {
  return (
    <div className="ph">
      <div>
        <div className="ph-eyebrow">{eyebrow}{sample !== undefined && <> <SampleTag sample={sample} /></>}</div>
        <h1 className="ph-title">{title}</h1>
        {sub && <div className="ph-sub">{sub}</div>}
      </div>
      {actions && <div style={{ display: 'flex', gap: 8 }}>{actions}</div>}
    </div>
  );
}

/* ════ Dossier Map surface ════ */

export function DossierMap({ onAsk }: SurfaceViewProps) {
  /* live ?? fixture — adopt the org's seeded CTD module map when the store
     returns the full DossierModule shape ({ m, label, pct, tone, sections }),
     else keep the codebase fixture so the map is never empty (fixture also
     renders while the fetch is in flight). Never fabricates. */
  const { data: modules, sample } = useLiveList<DossierModule>('/api/dossier-map', DOSSIER);

  return (
    <div className="page-inner">
      <PageHead
        eyebrow="Project · submission"
        title="Dossier map"
        sub="CTD / eCTD module map with completeness and readiness overlay."
        sample={sample}
        actions={
          <button className="btn ghost" onClick={() => onAsk('What is the critical path to filing?')}>
            {I.sparkles} Ask AnA
          </button>
        }
      />

      <div className="dossier">
        {modules.map((m) => (
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
