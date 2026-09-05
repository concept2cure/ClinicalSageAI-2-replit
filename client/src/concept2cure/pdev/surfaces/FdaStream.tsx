/**
 * PDEV FDA interactions surface — timeline + commitment rollup.
 *
 * Per PHASE_7_INSTALL.md §8 Phase 7.3:
 *   - 6 interaction kinds with correct chip colors
 *   - Feedback rollup shows match confidence; Apply opens governed confirmation
 *
 * Port basis: ui_kits/pdev/Surfaces.jsx > PdevFdaStream.
 */

import * as React from 'react';
import { PdevIcon } from '../icons';
import type {
  PdevFdaInteraction,
  PdevFdaStreamPayload,
  PdevFdaProposalsPayload,
} from '../data/types';
import { usePdevFdaFeedbackApply } from '../hooks/usePdevData';
import {
  GovernedConfirmDialog,
  type ConfirmConfig,
} from '../../_shared/components/GovernedConfirmDialog';

interface FdaStreamProps {
  programId: string;
  programCode: string;
  stream: PdevFdaStreamPayload;
  proposals: PdevFdaProposalsPayload | null;
  onAskAna: (text: string) => void;
  onApplied: () => void;
}

function kindLabel(kind: PdevFdaInteraction['kind']): string {
  return kind.replace(/^q_sub_/, '').replace(/_/g, ' ');
}

export function PdevFdaStreamSurface({
  programId,
  programCode,
  stream,
  proposals,
  onAskAna,
  onApplied,
}: FdaStreamProps) {
  const [pending, setPending] = React.useState<{
    config: ConfirmConfig;
    interactionId: string;
    proposedActivityKey: string;
  } | null>(null);
  const [confirmError, setConfirmError] = React.useState<string | null>(null);
  const apply = usePdevFdaFeedbackApply();

  const interactions = stream.interactions;
  const proposalList = proposals?.proposals.filter((p) => !p.rolled && p.proposedKey) ?? [];

  const onConfirm = async ({ reason }: { reason: string }) => {
    if (!pending) return;
    setConfirmError(null);
    try {
      await apply.run({
        programId,
        interactionId: pending.interactionId,
        proposedActivityKey: pending.proposedActivityKey,
        reason,
      });
      setPending(null);
      onApplied();
    } catch (err) {
      setConfirmError(err instanceof Error ? err.message : 'Apply failed');
    }
  };

  return (
    <>
      <div className="pdev-page-header">
        <div>
          <div className="pdev-page-eyebrow">PDEV · {programCode}</div>
          <h1 className="pdev-page-title">FDA interactions</h1>
          <div className="pdev-page-sub">
            {interactions.length} touchpoints
            {proposalList.length > 0 &&
              ` · ${proposalList.length} commitments awaiting rollup into PDEV`}
          </div>
        </div>
        <div className="pdev-page-actions">
          <button
            className="pdev-btn ghost"
            onClick={() => onAskAna('Show only commitments that block IND filing')}
            type="button"
          >
            <PdevIcon name="filter" /> Blockers only
          </button>
        </div>
      </div>

      <section className="pdev-section">
        <div className="pdev-section-head">
          <h2>Timeline</h2>
        </div>
        {interactions.length === 0 ? (
          <div className="pdev-empty">No FDA touchpoints yet.</div>
        ) : (
          <div className="pdev-fda-stream">
            {interactions.map((f) => (
              <div
                key={f.id}
                className="pdev-fda-row"
                data-status={f.status}
              >
                <div className="pdev-fda-row-l">
                  <span className={`pdev-fda-kind pdev-fda-kind-${f.kind}`}>
                    {kindLabel(f.kind)}
                  </span>
                  <span className="pdev-fda-when mono">
                    {new Date(f.when).toLocaleDateString()}
                  </span>
                </div>
                <div className="pdev-fda-row-body">
                  <div className="pdev-fda-title">
                    {f.title}
                    {f.blocker && (
                      <span className="pdev-blocker-chip">blocker</span>
                    )}
                  </div>
                  <div className="pdev-fda-summary">{f.summary}</div>
                </div>
                <div className="pdev-fda-row-r">
                  <span
                    className={`pdev-fda-status pdev-fda-status-${f.status.replace(/_/g, '-')}`}
                  >
                    {f.status.replace(/-/g, ' ')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {proposalList.length > 0 && (
        <section className="pdev-section">
          <div className="pdev-section-head">
            <h2>Roll up FDA feedback into PDEV activities</h2>
            <span className="pdev-section-sub">
              AnA-proposed activity matches · governed apply
            </span>
          </div>
          <div className="pdev-fda-rollup">
            {proposalList.map((p) => (
              <div
                key={p.id}
                className="pdev-fda-rollup-row"
                data-blocker={p.blocker || undefined}
              >
                <div className="pdev-fda-rollup-l">
                  <span className="mono pdev-fda-rollup-id">{p.id}</span>
                  {p.blocker && (
                    <span className="pdev-blocker-chip">blocker</span>
                  )}
                </div>
                <div className="pdev-fda-rollup-text">{p.title}</div>
                <div className="pdev-fda-rollup-arrow">
                  <PdevIcon name="arrowRight" />
                </div>
                <div className="pdev-fda-rollup-proposed">
                  <span className="mono">{p.proposedKey}</span>
                  <span className="pdev-fda-rollup-conf mono">
                    {p.confidence !== null ? `${Math.round(p.confidence * 100)}%` : '—'}
                  </span>
                </div>
                <button
                  className="pdev-btn primary small"
                  onClick={() =>
                    setPending({
                      interactionId: p.id,
                      proposedActivityKey: p.proposedKey!,
                      config: {
                        action: 'Apply rollup',
                        target: `${p.id} → ${p.proposedKey}`,
                        resource: programCode,
                        minReason: 10,
                        confirmWord: 'yes',
                      },
                    })
                  }
                  type="button"
                >
                  <PdevIcon name="check" /> Apply
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {pending && (
        <GovernedConfirmDialog
          open={true}
          {...pending.config}
          onCancel={() => {
            setPending(null);
            setConfirmError(null);
          }}
          onConfirm={onConfirm}
          submitError={confirmError}
        />
      )}
    </>
  );
}
