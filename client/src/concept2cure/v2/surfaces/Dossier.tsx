import React, { useEffect, useMemo, useState } from 'react';
import { I } from '../icons';
import type { SurfaceViewProps } from '../surfaceViews';
import { usePublishSurfaceContext } from '../surfaceContext';
import { EmptyState } from '../dataConnect';
import { apiRequest } from '@/lib/queryClient';
import '../styles/project-home-v2.css';

/* ════ Dossier — document-first workspace ════

   Real-data standard (no fixture in a shipped surface). This workspace
   previously rendered a hardcoded submission architecture; the fixture spine,
   document bodies, and mock actions were removed in the honesty sweep.

   WIRED NOW: GET /api/dossier-readiness/:projectId — per-CTD-section artifact
   readiness rollups from concept2cure_artifacts (raw JSON, numeric projectId,
   org from the tenant context). When a program with a numeric id is open the
   section readiness table below is live; otherwise the surface says so.

   STILL OPEN (documented, not fabricated): the nested folder/document tree
   with per-document owner/version/preview — no backend returns that contract
   yet, so no tree is rendered. The module-level map lives in DossierMap. */

interface ReadinessSection {
  ctdSection: string;
  status: 'draft' | 'review' | 'approved' | 'locked' | string;
  artifactCount: number;
  draftCount: number;
  reviewCount: number;
  approvedCount: number;
  lockedCount: number;
  lastUpdated: string | null;
}
interface ReadinessPayload {
  projectId: number;
  sections: ReadinessSection[];
  summary: { totalSections: number; readySections: number; inProgressSections: number; draftSections: number };
}

function statusTone(s: string) {
  return s === 'locked' || s === 'approved' ? 'ok' : s === 'review' ? 'warn' : 'dim';
}

function readNumericProjectId(): number | null {
  const p = (window as unknown as { C2C_PROJECT?: { id?: unknown } }).C2C_PROJECT;
  // The route itself strips a `proj_` prefix before parseInt; mirror that so a
  // prefixed shell id still resolves.
  const raw = String(p?.id ?? '').replace(/^proj_/, '');
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function Dossier({ onNav }: SurfaceViewProps) {
  const projectId = readNumericProjectId();
  const [payload, setPayload] = useState<ReadinessPayload | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'error' | 'unprovisioned'>('idle');

  useEffect(() => {
    if (projectId == null) { setState('idle'); return; }
    let cancelled = false;
    void (async () => {
      setState('loading');
      try {
        const res = await apiRequest('GET', `/api/dossier-readiness/${projectId}`);
        const body = (await res.json().catch(() => null)) as ReadinessPayload | null;
        if (cancelled) return;
        if (res.status === 503) { setState('unprovisioned'); return; }
        if (!res.ok || !body || !Array.isArray(body.sections)) { setState('error'); return; }
        setPayload(body);
        setState('ready');
      } catch {
        if (!cancelled) setState('error');
      }
    })();
    return () => { cancelled = true; };
  }, [projectId]);

  /* What AnA can see of this screen.
     Each of the five states is published as itself. "No program open", "the
     artifact store is not provisioned in this environment" and "the read
     failed" are three different reasons for an empty screen, and collapsing
     them into "0 sections ready" would have AnA report a filing readiness
     figure that nothing computed. */
  const anaContext = useMemo(() => {
    if (projectId == null) {
      return {
        summary:
          'Dossier readiness is scoped to one program and no program with a numeric project id is open, ' +
          'so there is no section readiness on screen — this is not an empty dossier.',
        availableActions: ['Open a program, then its per-CTD-section readiness appears here'],
      };
    }
    if (state === 'loading' || state === 'idle') {
      return { summary: 'Dossier section readiness is still loading; nothing on screen is final yet.' };
    }
    if (state === 'unprovisioned') {
      return {
        summary:
          'The governed artifact store is not provisioned in this environment, so no CTD-section readiness ' +
          'can be rolled up — the screen is empty for that reason, not because the program has no artifacts.',
      };
    }
    if (state === 'error' || !payload) {
      return {
        summary:
          'Dossier readiness could not be read, so this screen is showing no CTD sections because of a ' +
          'failure, not because the program has none.',
        availableActions: ['Retry the dossier-readiness read'],
      };
    }
    return {
      summary:
        `Dossier readiness for project ${payload.projectId}: ${payload.summary.totalSections} CTD section(s) — ` +
        `${payload.summary.readySections} ready, ${payload.summary.inProgressSections} in progress, ` +
        `${payload.summary.draftSections} still draft.`,
      facts: {
        projectId: payload.projectId,
        summary: payload.summary,
        // Enough to name a section back to the user, not every artifact count.
        sections: payload.sections.slice(0, 20).map((sec) => ({
          ctdSection: sec.ctdSection, status: sec.status, artifacts: sec.artifactCount,
          draft: sec.draftCount, inReview: sec.reviewCount,
          approved: sec.approvedCount, locked: sec.lockedCount,
          lastUpdated: sec.lastUpdated,
        })),
      },
      availableActions: [
        'Read per-CTD-section readiness rolled up from the program\u2019s governed artifacts',
        'Open a section to work on its artifacts',
      ],
    };
  }, [projectId, state, payload]);
  usePublishSurfaceContext('dossier', anaContext);

  return (
    <div className="dsr">
      <div className="dsr-head">
        <div>
          <div className="reg-eyebrow">Workspace · documents</div>
          <h1 className="dsr-title">Dossier</h1>
          <p className="dsr-sub">
            The document-first workspace — per-CTD-section readiness rolled up
            from the program’s governed artifacts.
          </p>
        </div>
      </div>

      <div style={{ padding: '0 24px 24px' }}>
        {projectId == null ? (
          <EmptyState
            icon={I.folder}
            title="Open a program to see its dossier readiness"
            hint="Per-CTD-section readiness is rolled up from the program's governed artifacts. Open a program with a numeric project id, then its section states appear here."
          />
        ) : state === 'loading' ? (
          <EmptyState icon={I.folder} title="Loading section readiness…" />
        ) : state === 'unprovisioned' ? (
          <EmptyState icon={I.folder} title="Artifact store not provisioned"
            hint="The governed artifact schema isn’t migrated for this environment yet, so no readiness can be reported — nothing is shown rather than a sample dossier." />
        ) : state === 'error' ? (
          <EmptyState tone="error" icon={I.alertTriangle} title="Couldn’t load dossier readiness"
            hint="The section-readiness rollup didn’t respond. Sign in to your tenant and retry." />
        ) : !payload || payload.sections.length === 0 ? (
          <EmptyState icon={I.folder} title="No sectioned artifacts yet"
            hint="Artifacts tagged with a CTD section roll up here (draft → review → approved → locked). Author and tag artifacts, then their section readiness appears." />
        ) : (
          <>
            <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', margin: '14px 0' }}>
              <div><div style={{ fontSize: 24, fontWeight: 700 }}>{payload.summary.totalSections}</div><div style={{ fontSize: 12, color: 'var(--c2c-dim,#667085)' }}>Sections</div></div>
              <div><div style={{ fontSize: 24, fontWeight: 700, color: 'var(--c2c-ok,#12b76a)' }}>{payload.summary.readySections}</div><div style={{ fontSize: 12, color: 'var(--c2c-dim,#667085)' }}>Ready</div></div>
              <div><div style={{ fontSize: 24, fontWeight: 700 }}>{payload.summary.inProgressSections}</div><div style={{ fontSize: 12, color: 'var(--c2c-dim,#667085)' }}>In progress</div></div>
              <div><div style={{ fontSize: 24, fontWeight: 700 }}>{payload.summary.draftSections}</div><div style={{ fontSize: 12, color: 'var(--c2c-dim,#667085)' }}>Draft</div></div>
            </div>
            <div className="pj-card">
              <div className="pj-card-h"><span className="t">Section readiness</span><span className="s">weakest-artifact rollup</span></div>
              <div className="pj-card-b" style={{ padding: 0 }}>
                <table className="reg-tbl"><thead><tr><th>CTD section</th><th>Artifacts</th><th>Draft / Review / Approved / Locked</th><th>Updated</th><th style={{ textAlign: 'right' }}>Status</th></tr></thead>
                  <tbody>{payload.sections.map((s) => (
                    <tr key={s.ctdSection}>
                      <td className="mono" style={{ fontWeight: 600 }}>{s.ctdSection}</td>
                      <td>{s.artifactCount}</td>
                      <td className="mono">{s.draftCount} / {s.reviewCount} / {s.approvedCount} / {s.lockedCount}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>{s.lastUpdated ? new Date(s.lastUpdated).toLocaleDateString() : '—'}</td>
                      <td style={{ textAlign: 'right' }}><span className={'rd-chip tone-' + statusTone(s.status)}>{s.status}</span></td>
                    </tr>))}</tbody></table>
              </div>
            </div>
          </>
        )}

        <div style={{ marginTop: 14, fontSize: 13, color: 'var(--c2c-dim,#667085)' }}>
          The nested folder/document tree isn’t connected yet (no backend serves that contract), so none is shown.{' '}
          <button type="button" onClick={() => onNav && onNav('dossier-map')}
            style={{ background: 'none', border: 'none', padding: 0, color: 'var(--accent-200)', font: 'inherit', cursor: 'pointer', textDecoration: 'underline' }}>
            Open the module-level dossier map {I.arrowRight}
          </button>
        </div>
      </div>
    </div>
  );
}
