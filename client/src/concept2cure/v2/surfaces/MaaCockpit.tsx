import React, { useMemo, useState } from 'react';
import { I } from '../icons';
import { useLiveData, EmptyState } from '../dataConnect';
import { apiRequest } from '@/lib/queryClient';
import type { SurfaceViewProps } from '../surfaceViews';
import { usePublishSurfaceContext } from '../surfaceContext';
import { MAA_MARKETS, type Module1Component } from '../fixtures/maa-module1-data';
import '../styles/project-home-v2.css';

/**
 * MAA / Module-1 cockpit — non-US marketing-application administrative module.
 *
 * Renders the region-accurate required eCTD Module-1 components for a selected
 * market and tracks which the sponsor has ASSEMBLED, LIVE from the persisted
 * readiness route (GET/POST /api/maa-module1/:market → the deterministic
 * assessRegionalModule1 engine). Real persisted data, an honest empty state, or
 * an honest failed-load state — never a fabricated stand-in. EMA + PMDA +
 * MHRA/TGA/HC/NMPA are all served by the same engine.
 */
interface MaaPayload {
  market: string;
  /** Canonical required Module-1 components for the market (always present). */
  requirements: Module1Component[];
  /** Component codes the org has marked assembled — may legitimately be empty. */
  provided: string[];
  /** Deterministic readiness assessment (assessRegionalModule1). */
  assessment: {
    ready: boolean;
    missing: string[];
    findings: Array<{ severity: 'error' | 'warning'; code: string; message: string; component?: string }>;
    counts: { errors: number; warnings: number };
  };
}

export function MaaCockpit({ onAsk }: SurfaceViewProps) {
  const [market, setMarket] = useState<string>('EMA');
  const [refreshKey, setRefreshKey] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const active = MAA_MARKETS.find((m) => m.key === market) ?? MAA_MARKETS[0];

  // LIVE, fixture-free. The payload returns UNWRAPPED as `data` (the MaaPayload
  // object). `market` is a path param, so `path` carries the selection and drives
  // the refetch; `refreshKey` bumps after a persisted toggle to re-read.
  const path = `/api/maa-module1/${market}`;
  const { data, loading, error, empty } = useLiveData<MaaPayload>(path, [path, refreshKey]);

  // requirements are canonical (present when the market resolves); provided may
  // legitimately be empty — that is honest real data (nothing assembled yet).
  const requirements: Module1Component[] = data?.requirements ?? [];
  const provided = useMemo(() => new Set(data?.provided ?? []), [data]);

  const ordered = useMemo(
    () =>
      [...requirements].sort((a, b) =>
        a.section === b.section ? a.label.localeCompare(b.label) : a.section.localeCompare(b.section, undefined, { numeric: true }),
      ),
    [requirements],
  );
  const assembledCount = ordered.filter((r) => provided.has(r.code)).length;
  const ready = ordered.length > 0 && assembledCount === ordered.length;

  /* What AnA can see of this screen.
     `ready` is the claim a user acts on — "the Module 1 administrative set is
     complete" — and it is only meaningful once the market has actually
     resolved. `ordered.length === 0` is an unresolved market or a failed read,
     never a complete set, which is why `ready` is guarded on it here as it is
     on screen; the same guard has to reach AnA or she would report an empty
     requirement list as a finished one. */
  const anaContext = useMemo(() => {
    if (loading) {
      return { summary: `The ${market} Module 1 requirement set is still loading; nothing on screen is final yet.` };
    }
    if (error) {
      return {
        summary:
          `The ${market} Module 1 requirement set could not be read, so this screen is showing no ` +
          'components because of a failure, not because none are required.',
        availableActions: ['Retry the Module 1 read', 'Switch market'],
      };
    }
    if (empty || ordered.length === 0) {
      return {
        summary:
          `Marketing-application Module 1 for ${active.label}: no requirement set resolved for this market, ` +
          'so there is nothing assembled or outstanding to report — this is not a complete Module 1.',
        facts: { market, agency: active.agency, procedure: active.procedure },
        availableActions: ['Switch to another market'],
      };
    }
    return {
      summary:
        `Marketing-application Module 1 — ${active.label} (${active.agency}, ${active.procedure}): ` +
        `${assembledCount} of ${ordered.length} required component(s) assembled. ` +
        (ready
          ? 'The Module 1 administrative set is complete.'
          : `${ordered.length - assembledCount} component(s) outstanding.`),
      facts: {
        market,
        agency: active.agency,
        procedure: active.procedure,
        requiredComponents: ordered.length,
        assembledComponents: assembledCount,
        administrativeSetComplete: ready,
        components: ordered.slice(0, 30).map((r) => ({
          code: r.code, section: r.section, label: r.label, assembled: provided.has(r.code),
        })),
      },
      availableActions: [
        'Mark a Module 1 component assembled or not assembled (a persisted write)',
        'Switch market to see another authority\u2019s Module 1 requirement set',
      ],
    };
  }, [loading, error, empty, market, active, ordered, provided, assembledCount, ready]);
  usePublishSurfaceContext('maa-cockpit', anaContext);

  async function toggle(code: string, nowAssembled: boolean) {
    if (!data) return; // nothing loaded to persist against
    setBusy(code);
    try {
      const res = await apiRequest('POST', path, { componentCode: code, assembled: nowAssembled });
      if (res.ok) setRefreshKey((k) => k + 1);
    } catch {
      /* transient failure — nothing persisted, surface stays as-is */
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="page-inner">
      <div className="ph">
        <div className="ph-eyebrow">Global RI · eCTD Module 1</div>
        <h1 className="ph-title">Marketing-application Module 1 — {active.label}</h1>
        <p className="ph-sub">
          {active.agency} · {active.procedure}
          {ordered.length > 0 && (
            <>
              {' · '}
              <strong style={{ color: ready ? 'var(--ok-600,#1a7f4b)' : 'var(--text-300)' }}>
                {assembledCount}/{ordered.length} assembled
              </strong>
              {' · '}
              {ready ? 'Module 1 administrative set complete.' : `${ordered.length - assembledCount} required component(s) outstanding.`}
            </>
          )}
        </p>
      </div>

      {/* Region selector — every market the requirements engine models. */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '4px 0 16px' }}>
        {MAA_MARKETS.map((m) => (
          <button
            key={m.key}
            className={'rd-chip tone-' + (m.key === market ? 'ok' : 'idle')}
            style={{ cursor: 'pointer', border: 'none' }}
            onClick={() => setMarket(m.key)}
            aria-pressed={m.key === market}
          >
            {m.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div role="status" className="scaf-note" style={{ padding: '18px 10px' }}>Loading Module 1 readiness…</div>
      ) : error ? (
        <EmptyState
          tone="error"
          icon={I.alertTriangle}
          title="Couldn't load Module 1 readiness"
          hint="The MAA Module 1 readiness service didn't respond. This lists the region-accurate required eCTD Module 1 components and which your organization has assembled — sign in with an organization context and retry, or check that the service is reachable."
        />
      ) : empty ? (
        <EmptyState
          icon={I.fileText}
          title={`No Module 1 readiness to show for ${active.label}`}
          hint="The requirements service returned nothing for this market. Pick another region above, or retry."
        />
      ) : (
        <div className="sp-list">
          {ordered.map((r) => {
            const has = provided.has(r.code);
            return (
              <div key={r.code} className="sp-row">
                <span className="pg-mono" style={{ minWidth: 64 }}>{r.section}</span>
                <span className="sp-row-b">
                  <span className="sp-row-t">{r.label}</span>
                  <span className="sp-row-s">{r.code}</span>
                </span>
                <span className={'rd-chip tone-' + (has ? 'ok' : 'err')}>{has ? 'assembled' : 'missing'}</span>
                <button
                  className="btn ghost"
                  disabled={busy === r.code}
                  style={{ marginLeft: 8 }}
                  onClick={() => toggle(r.code, !has)}
                >
                  {has ? 'Mark outstanding' : 'Mark assembled'}
                </button>
              </div>
            );
          })}
        </div>
      )}

      <p className="scaf-note">
        These are the mandatory Module-1 administrative components for an initial {active.label} marketing application
        (references: EU NtA Vol 2B / Reg (EC) 726/2004; PMDA eCTD JP M1; region regional specs). Readiness is computed
        server-side by <span className="pg-mono">assessRegionalModule1</span> over the components your organization has
        marked assembled. Agency checklists remain the authority for edge cases; this is a readiness aid,
        honest-by-construction.
      </p>

      {onAsk && (
        <button
          className="btn ghost"
          onClick={() =>
            onAsk(
              `Draft the ${active.label} (${active.procedure}) eCTD Module 1 submission checklist and flag which regional administrative documents we still need to assemble.`,
            )
          }
        >
          {I.sparkles} Ask AnA to draft the Module 1 checklist
        </button>
      )}
    </div>
  );
}
