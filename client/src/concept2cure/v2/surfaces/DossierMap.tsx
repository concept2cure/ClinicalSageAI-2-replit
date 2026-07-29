/**
 * Dossier Map -- kit app/Project2.jsx `DossierMap` ported.
 *
 * Registry id: `dossier-map`
 *
 * CTD / eCTD module map with completeness and readiness overlay.
 */
import React from 'react';
import { I } from '../icons';
import { useLiveRows, EmptyState } from '../dataConnect';
import type { SurfaceViewProps } from '../surfaceViews';
import '../styles/project-home-v2.css';

/* ── Read contract (aligned to the real c2c_dossier_map columns) ── */

/**
 * One row of GET /api/dossier-map — a single CTD module (M1–M5) for the org,
 * read straight from c2c_dossier_map (server/routes/dossier-map.routes.ts).
 * `m` is TEXT NOT NULL (module id / primary key). `label`, `pct` and `tone`
 * are nullable columns returned raw from the table — rendered null-safe and
 * never fabricated. `sections` is JSONB NOT NULL DEFAULT '[]', coerced to a
 * string array by the route.
 */
interface DossierModule {
  m: string;
  label: string | null;
  pct: number | null;
  tone: string | null;
  sections: string[];
}

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
  /* Real-data anchor — the org's CTD / eCTD module map from
     GET /api/dossier-map (server/routes/dossier-map.routes.ts → c2c_dossier_map,
     org-scoped). Renders the real rows, an honest empty state when the store has
     no modules for the org, or an honest error — never a fixture. */
  const { rows: modules, loading, error, empty } = useLiveRows<DossierModule>('/api/dossier-map');

  return (
    <div className="page-inner">
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

      {loading ? (
        <div className="scaf-note" style={{ marginTop: 18 }}>Loading the dossier map…</div>
      ) : error ? (
        <EmptyState
          tone="error"
          icon={I.alertTriangle}
          title="Couldn't load the dossier map"
          hint="The CTD / eCTD module map didn't respond. It's the organization's per-module (M1–M5) completeness and readiness — sign in and retry, or check the service is reachable."
        />
      ) : empty ? (
        <EmptyState
          icon={I.fileText}
          title="No dossier map yet"
          hint="The CTD / eCTD module map hasn't been provisioned for this organization. Once the M1–M5 modules are seeded, they appear here with their section readiness overlay."
        />
      ) : (
        <>
          <div className="dossier">
            {modules.map((m) => (
              <div key={m.m} className="dmod">
                <div className="dmod-h">
                  <span className="dmod-m">M{m.m}</span>
                  <span className="dmod-l">{m.label}</span>
                  {m.pct != null && (
                    <span className={`rd-chip tone-${m.tone ?? 'idle'}`}>{m.pct}%</span>
                  )}
                </div>
                <div className="dmod-bar">
                  <div className="dmod-bar-f" data-tone={m.tone ?? undefined} style={{ width: (m.pct ?? 0) + '%' }} />
                </div>
                <div className="dmod-sec">
                  {m.sections.map((s) => (
                    <span key={s} className="dmod-chip">{s}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Capability note — softened from fixture-coupled prose that asserted
              specific below-target modules (2.5 / 3.2.P) and a Q3 filing as fact;
              those specifics came from the removed DOSSIER fixture, not the org's
              real data. No per-module critical-path claim is made here. */}
          <div className="scaf-note" style={{ marginTop: 18, maxWidth: 760 }}>
            AnA can sequence the remaining sections by reviewer-risk and surface the modules on the critical path to filing.
          </div>
        </>
      )}
    </div>
  );
}
