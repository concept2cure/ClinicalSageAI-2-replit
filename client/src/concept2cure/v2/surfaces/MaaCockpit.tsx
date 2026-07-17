import React, { useMemo, useState } from 'react';
import { I } from '../icons';
import { SampleTag, useLive } from '../dataConnect';
import type { SurfaceViewProps } from '../surfaceViews';
import { MAA_MARKETS, MAA_REQUIREMENTS, type Module1Component } from '../fixtures/maa-module1-data';
import '../styles/project-home-v2.css';

/**
 * MAA / Module-1 cockpit — non-US marketing-application administrative module.
 *
 * eCTD Module 1 (the regional/administrative module) differs by health
 * authority. This surface renders the region-accurate required Module-1 component
 * checklist for a selected market, LIVE from the deterministic global-RI
 * requirements engine (GET /api/global-ri/module1/requirements/:market), falling
 * back to the codebase fixture (marked "Sample data") when the backend is
 * unavailable. EMA + PMDA + MHRA/TGA/HC/NMPA are all served by the same engine.
 */
export function MaaCockpit({ onAsk }: SurfaceViewProps) {
  const [market, setMarket] = useState<string>('EMA');
  const active = MAA_MARKETS.find((m) => m.key === market) ?? MAA_MARKETS[0];
  const fixture = MAA_REQUIREMENTS[market] ?? [];

  // Live region requirements; useLive does not shape-guard, so validate the
  // envelope before adopting it and fall back to the fixture otherwise.
  const raw = useLive<{ requirements?: Module1Component[] }>(
    `/api/global-ri/module1/requirements/${market}`,
    { requirements: fixture },
    [market],
  );
  const liveReqs = raw.data?.requirements;
  const valid =
    !raw.sample && Array.isArray(liveReqs) && liveReqs.length > 0 && !!liveReqs[0]?.code && !!liveReqs[0]?.section;
  const requirements: Module1Component[] = valid ? (liveReqs as Module1Component[]) : fixture;
  const sample = !valid;

  const ordered = useMemo(
    () =>
      [...requirements].sort((a, b) =>
        a.section === b.section ? a.label.localeCompare(b.label) : a.section.localeCompare(b.section, undefined, { numeric: true }),
      ),
    [requirements],
  );

  return (
    <div className="page-inner">
      <div className="ph">
        <div className="ph-eyebrow">Global RI · eCTD Module 1</div>
        <h1 className="ph-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          Marketing-application Module 1 — {active.label}
          <SampleTag sample={sample} />
        </h1>
        <p className="ph-sub">
          {active.agency} · {active.procedure} · {ordered.length} required regional administrative component(s).
          Region-accurate eCTD Module-1 structure from the global-RI requirements engine.
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
        {ordered.map((r, i) => (
          <div key={r.code + i} className="sp-row">
            <span className="pg-mono" style={{ minWidth: 64 }}>{r.section}</span>
            <span className="sp-row-b">
              <span className="sp-row-t">{r.label}</span>
              <span className="sp-row-s">{r.code}</span>
            </span>
          </div>
        ))}
      </div>

      <p className="scaf-note">
        These are the mandatory Module-1 administrative components for an initial {active.label} marketing application
        (references: EU NtA Vol 2B / Reg (EC) 726/2004; PMDA eCTD JP M1; region regional specs). Which components a
        sponsor has assembled — and the resulting readiness — is assessed server-side via{' '}
        <span className="pg-mono">POST /api/global-ri/module1/assess</span>. Agency checklists remain the authority for
        edge cases; this is a readiness aid, honest-by-construction.
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
