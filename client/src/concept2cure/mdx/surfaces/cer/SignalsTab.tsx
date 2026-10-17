/**
 * SignalsTab — the CER workbench's safety-signal register, backed by the
 * live /api/regulatory-programs/:id/safety-signals feed (fetched once by
 * CerSurface via useProgramExtras and passed down). A program with no signals
 * shows the honest empty state. (The kit's example signals, CER_SIGNALS, were
 * removed with sample mode on 2026-10-14.)
 */

import * as React from 'react';
import { I } from '../../icons';
import { AskAnaChip } from '../AskAnaChip';
import type { SafetySignal } from '../../hooks/useProgramExtras';

export interface SignalsTabProps {
  /** Live signals from useProgramExtras; null while unresolved. */
  signals: SafetySignal[] | null;
  loading: boolean;
  programTitle: string | null;
  onAskAna: (text: string) => void;
}

export function SignalsTab({ signals, loading, programTitle, onAskAna }: SignalsTabProps) {
  const [includedOnly, setIncludedOnly] = React.useState(false);
  const sourceSignals: SafetySignal[] = signals ?? [];
  const visibleSignals = includedOnly
    ? sourceSignals.filter((s) => s.status === 'included')
    : sourceSignals;
  const includedCount = sourceSignals.filter((s) => s.status === 'included').length;
  const excludedCount = sourceSignals.filter((s) => s.status === 'excluded').length;
  const reviewCount = sourceSignals.filter((s) => s.status === 'review').length;

  return (
    <>
      <div className="panel">
        <div className="panel-hdr">
          <div>
            <div className="t">Safety signals</div>
            <div className="s">
              {sourceSignals.length} signal{sourceSignals.length === 1 ? '' : 's'} ·{' '}
              {includedCount} included · {excludedCount} excluded · {reviewCount} under review
            </div>
          </div>
          <div className="actions">
            <button
              className={`tb-btn${includedOnly ? ' on' : ''}`}
              title={includedOnly ? 'Show all signals' : 'Show included only'} aria-label={includedOnly ? 'Show all signals' : 'Show included only'}
              aria-pressed={includedOnly}
              onClick={() => setIncludedOnly((v) => !v)}
            >
              {I.filter}
            </button>
            <button
              className="tb-btn"
              title="Run a fresh signal scan with AnA" aria-label="Run a fresh signal scan with AnA"
              onClick={() =>
                onAskAna(
                  `Run a fresh signal scan for ${programTitle ?? 'this program'} across FAERS, MAUDE, Eudamed and the literature corpus. ` +
                    'Flag anything that should be re-included or escalated.',
                )
              }
            >
              {I.zap}
            </button>
          </div>
        </div>
        {signals === null ? (
          /* null is "not read": still loading, or the feed failed (useProgramExtras
             degrades a failed field to null). Neither is "no signals". */
          <div role="status" style={{ padding: '24px 16px', textAlign: 'center', fontSize: 12, color: 'var(--text-300)' }}>
            {loading ? 'Loading safety signals…' : 'Safety signals could not be loaded for this program.'}
          </div>
        ) : signals.length === 0 ? (
          <div
            role="status"
            style={{
              padding: '24px 16px',
              textAlign: 'center',
              fontSize: 12,
              color: 'var(--text-300)',
            }}
          >
            <div style={{ fontWeight: 600, color: 'var(--text-200)', marginBottom: 4 }}>
              No safety signals reported yet
            </div>
            Signals appear here once your pharmacovigilance feed is connected and adverse events
            from FAERS · MAUDE · Eudamed · literature start landing.
          </div>
        ) : (
          <div className="tbl-scroll">
            <table className="tbl">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Source</th>
                  <th>Event</th>
                  <th>N</th>
                  <th>Severity</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {visibleSignals.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <span className="k-num">{s.id}</span>
                    </td>
                    <td style={{ color: 'var(--text-400)', fontSize: 11 }}>{s.source}</td>
                    <td>
                      <div className="k-name" style={{ fontWeight: 400, fontSize: 12 }}>
                        {s.event}
                      </div>
                    </td>
                    <td
                      style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text-200)' }}
                      title={
                        typeof s.count === 'number'
                          ? 'Adverse-event cases sharing this signal’s MedDRA PT code in this program’s scope'
                          : 'No MedDRA PT linkage on this signal — supporting cases cannot be counted'
                      }
                    >
                      {typeof s.count === 'number' ? s.count : '—'}
                    </td>
                    <td>
                      <span className={`status-pill ${s.severity}`}>{s.severity}</span>
                    </td>
                    <td>
                      <span className={`status-pill ${s.status}`}>{s.status}</span>
                      <AskAnaChip
                        onAsk={() =>
                          onAskAna(
                            `Assess safety signal ${s.id} (${s.event} · ${s.source}) for ${programTitle ?? 'this program'} — ` +
                              'pull current adverse-event context with search_device_adverse_events and recommend include, exclude, or keep under review, with the reasoning.',
                          )
                        }
                        label={`Ask AnA to assess ${s.id}`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
