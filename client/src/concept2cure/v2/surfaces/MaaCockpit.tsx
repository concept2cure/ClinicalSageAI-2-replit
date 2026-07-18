import React, { useMemo, useState } from 'react';
import { I } from '../icons';
import { SampleTag, useLive } from '../dataConnect';
import { apiRequest } from '@/lib/queryClient';
import type { SurfaceViewProps } from '../surfaceViews';
import { MAA_MARKETS, MAA_REQUIREMENTS, type Module1Component } from '../fixtures/maa-module1-data';
import '../styles/project-home-v2.css';

/**
 * MAA / Module-1 cockpit — non-US marketing-application administrative module.
 *
 * Renders the region-accurate required eCTD Module-1 components for a selected
 * market and tracks which the sponsor has ASSEMBLED, LIVE from the persisted
 * readiness route (GET/POST /api/maa-module1/:market → the deterministic
 * assessRegionalModule1 engine). Falls back to the codebase fixture (all
 * components missing) with a "Sample data" pill when the backend is unavailable.
 * EMA + PMDA + MHRA/TGA/HC/NMPA are all served by the same engine.
 */
interface MaaPayload {
  market: string;
  requirements: Module1Component[];
  provided: string[];
}

export function MaaCockpit({ onAsk }: SurfaceViewProps) {
  const [market, setMarket] = useState<string>('EMA');
  const [refreshKey, setRefreshKey] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const active = MAA_MARKETS.find((m) => m.key === market) ?? MAA_MARKETS[0];

  const fixture: MaaPayload = { market, requirements: MAA_REQUIREMENTS[market] ?? [], provided: [] };

  // useLive does not shape-guard; validate the { data: { requirements, provided } }
  // envelope before adopting it and fall back to the fixture otherwise.
  const raw = useLive<{ data?: MaaPayload }>(
    `/api/maa-module1/${market}`,
    { data: fixture },
    [market, refreshKey],
  );
  const payload = raw.data?.data;
  const valid =
    !raw.sample &&
    !!payload &&
    Array.isArray(payload.requirements) &&
    payload.requirements.length > 0 &&
    !!payload.requirements[0]?.code &&
    Array.isArray(payload.provided);
  const requirements: Module1Component[] = valid ? payload!.requirements : fixture.requirements;
  const provided = useMemo(() => new Set(valid ? payload!.provided : []), [valid, payload]);
  const sample = !valid;

  const ordered = useMemo(
    () =>
      [...requirements].sort((a, b) =>
        a.section === b.section ? a.label.localeCompare(b.label) : a.section.localeCompare(b.section, undefined, { numeric: true }),
      ),
    [requirements],
  );
  const assembledCount = ordered.filter((r) => provided.has(r.code)).length;
  const ready = ordered.length > 0 && assembledCount === ordered.length;

  async function toggle(code: string, nowAssembled: boolean) {
    if (sample) return; // no persistence offline — keep it honest
    setBusy(code);
    try {
      const res = await apiRequest('POST', `/api/maa-module1/${market}`, { componentCode: code, assembled: nowAssembled });
      if (res.ok) setRefreshKey((k) => k + 1);
    } catch {
      /* offline — nothing persisted, surface stays as-is */
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="page-inner">
      <div className="ph">
        <div className="ph-eyebrow">Global RI · eCTD Module 1</div>
        <h1 className="ph-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          Marketing-application Module 1 — {active.label}
          <SampleTag sample={sample} />
        </h1>
        <p className="ph-sub">
          {active.agency} · {active.procedure} ·{' '}
          <strong style={{ color: ready ? 'var(--ok-600,#1a7f4b)' : 'var(--text-300)' }}>
            {assembledCount}/{ordered.length} assembled
          </strong>
          {' '}· {ready ? 'Module 1 administrative set complete.' : `${ordered.length - assembledCount} required component(s) outstanding.`}
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
              {!sample && (
                <button
                  className="btn ghost"
                  disabled={busy === r.code}
                  style={{ marginLeft: 8 }}
                  onClick={() => toggle(r.code, !has)}
                >
                  {has ? 'Mark outstanding' : 'Mark assembled'}
                </button>
              )}
            </div>
          );
        })}
      </div>

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
