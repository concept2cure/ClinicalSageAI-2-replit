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

/* ── Read contract (rolled up from the real project_sections store) ── */

/**
 * One row of GET /api/dossier-map?projectId=<id> — a single CTD module (M1–M5) for the
 * project in context, rolled up from the real, project-scoped project_sections tracking
 * store by server/services/dossier/dossier-map-view-assembler.ts (via
 * server/routes/dossier-map.routes.ts). `m` is the bare module digit ('1'..'5',
 * printed as "M{m}"). `label` is the canonical CTD module title. `pct` is the
 * derived completeness (complete sections / total, rounded) and `tone` is derived
 * from it ('ok' / 'warn' / 'idle') — never a stored number, never fabricated.
 * `sections` is the module's distinct tracked section labels.
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

/* The project currently in context — set on the window by the projects surface,
   the same grounding source the shell reads for ANA (V2App.readShellProjectId).
   The dossier map is a project-readiness view, so it is scoped to THIS project and
   never falls back to an org-wide roll-up that would mix programs' readiness. */
function readShellProjectId(): string | undefined {
  try {
    const p = (window as unknown as { C2C_PROJECT?: { id?: unknown } }).C2C_PROJECT;
    return p && p.id != null ? String(p.id) : undefined;
  } catch {
    return undefined;
  }
}

export function DossierMap({ onAsk }: SurfaceViewProps) {
  /* Real-data anchor — the current project's CTD / eCTD module map from
     GET /api/dossier-map?projectId=<id> (server/routes/dossier-map.routes.ts → the
     project_sections tracking store, rolled up to module grain, scoped to this one
     project). Renders the real rows, an honest empty state when the project tracks no
     CTD sections yet, or an honest error — never a fixture, never org-wide. */
  const projectId = readShellProjectId();
  const { rows: modules, loading, error, empty } = useLiveRows<DossierModule>(
    projectId ? `/api/dossier-map?projectId=${encodeURIComponent(projectId)}` : null,
    [projectId],
  );

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

      {!projectId ? (
        <EmptyState
          icon={I.fileText}
          title="Open a project to see its dossier map"
          hint="The dossier map is scoped to a single program's CTD / eCTD filing. Open a project first — its per-module (M1–M5) completeness and readiness overlay appears here, for that project only."
        />
      ) : loading ? (
        <div className="scaf-note" style={{ marginTop: 18 }}>Loading the dossier map…</div>
      ) : error ? (
        <EmptyState
          tone="error"
          icon={I.alertTriangle}
          title="Couldn't load the dossier map"
          hint="The CTD / eCTD module map didn't respond. It's this project's per-module (M1–M5) completeness and readiness — sign in and retry, or check the service is reachable."
        />
      ) : empty ? (
        <EmptyState
          icon={I.fileText}
          title="No dossier map yet"
          hint="This project isn't tracking any CTD sections yet. Once its M1–M5 sections are being authored, they appear here with their section readiness overlay."
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
