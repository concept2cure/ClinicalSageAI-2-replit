// Pre-flight surface — pick a transmittal, see its validation findings
// (errors / warnings / oks) with rule + section refs, and resolve them. The
// transmittals list comes from GET /api/mdx/gateways/transmittals; the findings
// come from GET /api/mdx/gateways/transmittals/:id (which embeds findings).
// Resolving calls PATCH /api/mdx/gateways/findings/:id/resolve. No demo arrays.

import * as React from 'react';
import { useTransmittals, useTransmittal, useResolveFinding } from '../../hooks/useSubmission';
import { gatewayLabel } from '../data/nav';
import type { RegionFilter } from '../shell/TopBar';
import { SubmissionIcon } from '../icons';
import {
  Loading, ErrorState, Empty, FindingIcon, findingTone, severityLabel,
} from './state';

interface Props {
  region: RegionFilter;
  onAskAna: (t: string) => void;
}

export function SubmissionValidation({ region, onAskAna }: Props) {
  const filter = React.useMemo(
    () => (region === 'all' ? {} : { region }),
    [region],
  );
  const listQuery = useTransmittals(filter);
  const transmittals = listQuery.data ?? [];

  const [selectedId, setSelectedId] = React.useState<number | null>(null);
  // Default the selection to the first transmittal once the list loads.
  React.useEffect(() => {
    if (selectedId == null && transmittals.length > 0) {
      setSelectedId(transmittals[0].id);
    }
  }, [selectedId, transmittals]);

  const detailQuery = useTransmittal(selectedId);
  const detail = detailQuery.data ?? null;
  const findings = detail?.findings ?? [];
  const open = findings.filter(f => !f.resolved && findingTone(String(f.severity)) !== 'ok');

  const resolveFinding = useResolveFinding();

  const onResolve = (findingId: number) => {
    if (selectedId == null) return;
    resolveFinding.mutate({ findingId, transmittalId: selectedId });
  };

  return (
    <div className="bp-surface">
      <div className="bp-page-head">
        <div>
          <div className="bp-kicker">Submission gateway · pre-flight</div>
          <h1 className="bp-title">Pre-flight validation</h1>
          <div className="bp-meta">
            {detail
              ? `${open.length} open to clear · ${findings.length} total findings`
              : `${transmittals.length} transmittals to inspect`}
          </div>
        </div>
      </div>

      {listQuery.isLoading ? (
        <Loading label="Loading transmittals…" />
      ) : listQuery.isError ? (
        <ErrorState message="Could not load transmittals." />
      ) : transmittals.length === 0 ? (
        <Empty>No transmittals to validate yet.</Empty>
      ) : (
        <div className="sub-preflight">
          {/* Transmittal picker */}
          <div className="bp-card sub-pf-list">
            <div className="bp-card-head">
              <span>Transmittals</span>
              <span className="bp-meta">{transmittals.length}</span>
            </div>
            <div className="sub-pf-rows" role="listbox" aria-label="Transmittals">
              {transmittals.map(t => (
                <button key={t.id} type="button"
                        className="sub-pf-row"
                        role="option"
                        aria-selected={selectedId === t.id}
                        data-active={selectedId === t.id || undefined}
                        onClick={() => setSelectedId(t.id)}>
                  <div className="sub-pf-row-title">{gatewayLabel(String(t.gateway))} · {t.submissionType ?? String(t.format ?? '')}</div>
                  <div className="sub-pf-row-sub">{t.transmissionId ?? `#${t.id}`}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Findings for the selected transmittal */}
          <div className="bp-card sub-pf-detail">
            <div className="bp-card-head">
              <span>Findings{detail ? ` · ${gatewayLabel(String(detail.gateway))}` : ''}</span>
              <span className="bp-meta">{open.length} to clear</span>
            </div>
            {selectedId == null ? (
              <Empty>Select a transmittal to see its findings.</Empty>
            ) : detailQuery.isLoading ? (
              <Loading label="Loading findings…" />
            ) : detailQuery.isError ? (
              <ErrorState message="Could not load findings." />
            ) : findings.length === 0 ? (
              <Empty>No findings recorded for this transmittal.</Empty>
            ) : (
              <div className="sub-find-list">
                {findings.map(f => {
                  const tone = findingTone(String(f.severity));
                  const ref = [f.ruleTitle ?? f.ruleId, f.filePath].filter(Boolean).join(' · ');
                  return (
                    <div key={f.id} className={`sub-find-row${f.resolved ? ' sub-find-resolved' : ''}`}>
                      <FindingIcon severity={String(f.severity)} />
                      <div className="sub-find-body">
                        <div className="sub-find-msg">
                          <span className="sub-find-sev">{severityLabel(String(f.severity))}</span>
                          {f.message}
                        </div>
                        {ref && <div className="sub-find-ref">{ref}</div>}
                        {f.resolved && f.resolutionNote && (
                          <div className="sub-find-ref">Resolved · {f.resolutionNote}</div>
                        )}
                      </div>
                      {f.resolved ? (
                        <span className="sub-pill sub-pill-ok">
                          <SubmissionIcon name="checkCircle" size={12} />Resolved
                        </span>
                      ) : tone !== 'ok' ? (
                        <button className="bp-btn-tert" type="button"
                                disabled={resolveFinding.isPending}
                                onClick={() => onResolve(f.id)}>
                          Resolve
                        </button>
                      ) : (
                        <span className="sub-pill sub-pill-ok">
                          <SubmissionIcon name="checkCircle" size={12} />Pass
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            {detail && open.length > 0 && (
              <div className="bp-card-foot">
                <button className="bp-btn-tert" type="button"
                        onClick={() => onAskAna(`Clear the open pre-flight validation findings on transmittal ${detail.transmissionId ?? detail.id} (${gatewayLabel(String(detail.gateway))}) and explain each fix`)}>
                  <SubmissionIcon name="sparkles" size={13} /> Clear findings with AnA
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
