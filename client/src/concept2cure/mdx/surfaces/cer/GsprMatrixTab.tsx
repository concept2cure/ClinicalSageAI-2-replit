/**
 * GsprMatrixTab — the Annex I GSPR conformity matrix, backed by the real
 * /api/gspr backend (catalog + per-program mappings + deterministic coverage
 * report). A clause with no applicability decision renders as `unmapped` —
 * real information, not a fabricated status. The kit's 23-row GSPR fixture
 * renders ONLY under the explicit sample-mode guard and only when the live
 * catalog is unavailable or empty.
 */

import * as React from 'react';
import { I } from '../../icons';
import { EmptyState, ErrorState } from '../../../v2/dataConnect';
import { AskAnaChip } from '../AskAnaChip';
import { CER_GSPR } from '../../data/cer';
import {
  groupGsprRowsByChapter,
  useCerGspr,
  type GsprMatrixRow,
  type GsprRegulation,
  type GsprRowStatus,
} from '../../hooks/useCerGspr';
import { SampleDataBanner } from '../../components/SampleDataBanner';
import { useSampleMode } from '../../components/DataGate';

export interface GsprMatrixTabProps {
  programId: string | null;
  /** Program pathway hint — 'ivdr' programs default the catalog to IVDR. */
  defaultRegulation: GsprRegulation;
  onAskAna: (text: string) => void;
}

const STATUS_LABEL: Record<GsprRowStatus, string> = {
  applies: 'applies',
  not_applicable: 'n/a',
  partial: 'partial',
  tbd: 'tbd',
  unmapped: 'unmapped',
};

const STATUS_PILL: Record<GsprRowStatus, string> = {
  applies: 'complete',
  not_applicable: 'na',
  partial: 'review',
  tbd: 'draft',
  unmapped: 'empty',
};

type Filter = 'all' | 'open' | 'applies' | 'na';

function rowMatchesFilter(row: GsprMatrixRow, filter: Filter): boolean {
  switch (filter) {
    case 'open':
      return row.status === 'unmapped' || row.status === 'tbd' || row.status === 'partial';
    case 'applies':
      return row.status === 'applies';
    case 'na':
      return row.status === 'not_applicable';
    default:
      return true;
  }
}

export function GsprMatrixTab({ programId, defaultRegulation, onAskAna }: GsprMatrixTabProps) {
  const [regulation, setRegulation] = React.useState<GsprRegulation>(defaultRegulation);
  const [filter, setFilter] = React.useState<Filter>('all');
  const sampleOn = useSampleMode();
  const { rows, coverage, loading, error, refresh } = useCerGspr(programId, regulation);

  const liveAvailable = rows !== null && rows.length > 0;
  const usingSample = !liveAvailable && sampleOn;

  const summary = loading
    ? 'Loading the GSPR catalog and this program’s mappings…'
    : liveAvailable && coverage
      ? `${coverage.totalApplicable} in-scope requirements · ${coverage.coveragePercent}% decided · ` +
        `${coverage.unmapped} unmapped · ${coverage.nonConformantCount} non-conformant · ` +
        (coverage.passesGate ? 'gate passes' : 'gate blocked')
      : liveAvailable
        ? `${rows!.length} requirements in the ${regulation} catalog · coverage report unavailable${programId ? '' : ' — coverage is reported per program'}`
        : error
          ? `GSPR backend unavailable — ${error}`
          : rows !== null
            ? `The ${regulation} GSPR catalog has not been loaded for this workspace`
            : 'Loading…';

  const visibleGroups = React.useMemo(() => {
    if (!liveAvailable) return [];
    const filtered = rows!.filter((r) => rowMatchesFilter(r, filter));
    return groupGsprRowsByChapter(filtered);
  }, [rows, filter, liveAvailable]);

  return (
    <>
      <div className="section-hdr">
        <div>
          <div className="section-title">GSPR conformity · Annex I</div>
          <div className="section-sub" role="status" aria-live="polite">{summary}</div>
        </div>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-300)' }}>
          Regulation
          <select
            value={regulation}
            onChange={(e) => setRegulation(e.target.value as GsprRegulation)}
            style={{
              fontSize: 12,
              padding: '4px 8px',
              background: 'var(--bg-050)',
              border: '1px solid var(--border-control)',
              borderRadius: 6,
              color: 'var(--text-200)',
            }}
          >
            <option value="MDR">MDR</option>
            <option value="IVDR">IVDR</option>
          </select>
        </label>
      </div>

      {coverage && (
        <div className="metrics-row">
          <div className="metric-card" data-tone={coverage.unmapped === 0 ? 'ok' : 'err'}>
            <div className="metric-label">Unmapped</div>
            <div className="metric-val">{coverage.unmapped}</div>
            <div className="metric-meta">No applicability decision yet — each one blocks the gate</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Applies</div>
            <div className="metric-val">
              {coverage.mappedApplies}
              <span className="unit">/ {coverage.totalApplicable}</span>
            </div>
            <div className="metric-meta">{coverage.needsEvidenceCount} still need evidence linked</div>
          </div>
          <div className="metric-card" data-tone={coverage.mappedTbd + coverage.mappedPartial > 0 ? 'warn' : undefined}>
            <div className="metric-label">Partial or tbd</div>
            <div className="metric-val">{coverage.mappedPartial + coverage.mappedTbd}</div>
            <div className="metric-meta">Confirm and revisit before notified-body review</div>
          </div>
          <div className="metric-card" data-tone={coverage.nonConformantCount > 0 ? 'err' : 'ok'}>
            <div className="metric-label">Non-conformant</div>
            <div className="metric-val">{coverage.nonConformantCount}</div>
            <div className="metric-meta">
              {coverage.passesGate ? 'Gate passes' : 'Gate blocked'} at {coverage.coveragePercent}% coverage
            </div>
          </div>
        </div>
      )}

      <SampleDataBanner show={usingSample} loading={loading} label="GSPR requirements" />

      {liveAvailable && (
        <div className="panel">
          <div className="panel-hdr">
            <div>
              <div className="t">Requirement-by-requirement status</div>
              <div className="s">
                {visibleGroups.reduce((n, g) => n + g.rows.length, 0)} of {rows!.length} shown
              </div>
            </div>
            <div className="actions" style={{ display: 'flex', gap: 6 }}>
              {(
                [
                  { id: 'all', label: 'All' },
                  { id: 'open', label: 'Open' },
                  { id: 'applies', label: 'Applies' },
                  { id: 'na', label: 'N/A' },
                ] as Array<{ id: Filter; label: string }>
              ).map((f) => (
                <button
                  key={f.id}
                  className={`audit-filter ${filter === f.id ? 'active' : ''}`}
                  aria-pressed={filter === f.id}
                  onClick={() => setFilter(f.id)}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          <div className="tbl-scroll">
            {visibleGroups.map((g) => (
              <div key={g.chapter}>
                <div
                  style={{
                    padding: '10px 16px 4px',
                    fontSize: 11,
                    fontWeight: 600,
                    color: 'var(--text-300)',
                    letterSpacing: '0.02em',
                  }}
                >
                  Chapter {g.chapter}
                </div>
                <table className="tbl">
                  <thead>
                    <tr>
                      <th style={{ width: '7%' }}>§</th>
                      <th style={{ width: '38%' }}>Requirement</th>
                      <th style={{ width: '13%' }}>Applicability</th>
                      <th style={{ width: '14%' }}>Conformance</th>
                      <th style={{ width: '10%' }}>Evidence</th>
                      <th>Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.rows.map((r) => (
                      <tr key={r.requirementId}>
                        <td>
                          <span className="k-num">{r.clause}</span>
                        </td>
                        <td>
                          <div className="k-name" style={{ fontWeight: 400, fontSize: 12 }}>
                            {r.title}
                          </div>
                        </td>
                        <td>
                          <span className={`status-pill ${STATUS_PILL[r.status]}`}>
                            {STATUS_LABEL[r.status]}
                          </span>
                        </td>
                        <td style={{ fontSize: 11, color: 'var(--text-300)' }}>
                          {r.conformance ? r.conformance.replace(/_/g, ' ') : '—'}
                        </td>
                        <td style={{ fontSize: 11, color: 'var(--text-300)' }}>
                          {r.hasEvidence ? 'linked' : 'none'}
                        </td>
                        <td style={{ fontSize: 11, color: 'var(--text-300)', lineHeight: 1.5 }}>
                          {r.note || '—'}
                          {(r.status === 'unmapped' || r.conformance === 'non_conformant') && (
                            <AskAnaChip
                              onAsk={() =>
                                onAskAna(
                                  `Help me close the GSPR §${r.clause} gap (${regulation} Annex I): ${r.title}`,
                                )
                              }
                              label={`Ask AnA about §${r.clause}`}
                            />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
            {visibleGroups.length === 0 && (
              <div
                role="status"
                style={{ padding: '16px', fontSize: 12, color: 'var(--text-300)', textAlign: 'center' }}
              >
                No requirements match this filter.
              </div>
            )}
          </div>
        </div>
      )}

      {usingSample && (
        <div className="panel">
          <div className="panel-hdr">
            <div>
              <div className="t">Sample requirement-by-requirement status</div>
              <div className="s">Canonical example content · 23 requirements</div>
            </div>
          </div>
          <div className="tbl-scroll">
            <table className="tbl">
              <thead>
                <tr>
                  <th style={{ width: '7%' }}>§</th>
                  <th style={{ width: '40%' }}>Requirement</th>
                  <th style={{ width: '13%' }}>Status</th>
                  <th style={{ width: '22%' }}>Evidence</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {CER_GSPR.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <span className="k-num">{r.id}</span>
                    </td>
                    <td>
                      <div className="k-name" style={{ fontWeight: 400, fontSize: 12 }}>
                        {r.title}
                      </div>
                    </td>
                    <td>
                      <span className={`status-pill ${r.status === 'conform' ? 'complete' : r.status === 'partial' ? 'review' : r.status === 'gap' ? 'blocked' : 'na'}`}>
                        {r.status}
                      </span>
                    </td>
                    <td style={{ fontSize: 11, color: 'var(--text-300)' }}>{r.evidence}</td>
                    <td style={{ fontSize: 11, color: 'var(--text-300)', lineHeight: 1.5 }}>
                      {r.note || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!liveAvailable && !usingSample && !loading && (
        <div className="panel">
          {/* A FAILURE AND AN EMPTY CATALOG WERE ONE POLITE PANEL.
              `role="status"` on a backend failure means a screen reader is told
              nothing went wrong; `${error}` rode along verbatim; there was no
              retry although the hook has returned `refresh` since it was
              written; and the empty branch instructed the reader to "seed the
              GSPR catalog", which is an operator action no one on this screen
              can take. Two panels now, each honest about which case it is. */}
          {error ? (
            <ErrorState
              variant="panel"
              title="Couldn't load the GSPR requirements"
              retry={refresh}
              testId="gspr-error"
            />
          ) : (
            <EmptyState
              icon={I.alertCircle}
              title="No GSPR requirements to show"
              hint={`The ${regulation} catalog has not been loaded for this workspace.`}
              action={{ label: 'Check again', onAct: refresh }}
              regulation={`Serves the ${regulation} Annex I general safety and performance requirements`}
              testId="gspr-empty"
            />
          )}
        </div>
      )}
    </>
  );
}
