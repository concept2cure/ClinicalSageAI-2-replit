/**
 * PDEV Activity detail sheet — full 6-tab view + governed mutations.
 *
 * Tabs: State · Documents · Evidence · Workflow · Provenance · Audit.
 * State, Documents tabs read from the workstream payload (registry +
 * per-program state); Evidence/Workflow/Provenance/Audit tabs fetch
 * from their dedicated endpoints. Every mutation routes through
 * <PdevConfirmDialog>.
 *
 * Port basis: design-system/ui_kits/pdev/ActivityDetail.jsx.
 */

import * as React from 'react';
import { PdevIcon } from '../icons';
import {
  PDEV_ACTIVITY_STATES,
  PDEV_STAGE_LABELS,
  PDEV_STATE_LABELS,
  PDEV_WORKSTREAM_LABELS,
  statePillTone,
} from '../data/enums';
import type { PdevActivityState } from '../data/enums';
import type { PdevActivityView } from '../data/types';
import {
  usePdevActivityEvidence,
  usePdevActivityProvenance,
  usePdevActivityStateChange,
  usePdevActivityWorkflow,
  usePdevEvidenceDetach,
  usePdevWorkflowDecision,
  usePdevWorkflowKickoff,
} from '../hooks/usePdevData';
import {
  PdevConfirmDialog,
  type ConfirmConfig,
} from '../components/ConfirmDialog';

type TabId = 'state' | 'documents' | 'evidence' | 'workflow' | 'provenance' | 'audit';

const TABS: ReadonlyArray<{ id: TabId; label: string }> = [
  { id: 'state', label: 'State' },
  { id: 'documents', label: 'Documents' },
  { id: 'evidence', label: 'Evidence' },
  { id: 'workflow', label: 'Workflow' },
  { id: 'provenance', label: 'Provenance' },
  { id: 'audit', label: 'Audit' },
];

interface ActivityDetailProps {
  programId: string;
  activity: PdevActivityView;
  onClose: () => void;
  onAskAna: (text: string) => void;
  /** Called after a successful mutation so the parent can refresh upstream data. */
  onMutated: () => void;
  /** Open the AI drafting workbench for the given document code. */
  onOpenDraft: (documentCode: string | null) => void;
  /** Open the evidence picker. */
  onOpenEvidencePicker: () => void;
}

type PendingMutation =
  | { kind: 'state'; targetState: PdevActivityState; config: ConfirmConfig }
  | { kind: 'evidence-detach'; evidenceLinkId: string; config: ConfirmConfig }
  | { kind: 'workflow-kickoff'; targetState: PdevActivityState; config: ConfirmConfig }
  | { kind: 'workflow-decision'; runId: string; checkpointId: string; decision: 'approve' | 'reject'; config: ConfirmConfig };

export function PdevActivityDetail({
  programId,
  activity,
  onClose,
  onAskAna,
  onMutated,
  onOpenDraft,
  onOpenEvidencePicker,
}: ActivityDetailProps) {
  const [tab, setTab] = React.useState<TabId>('state');
  const [pending, setPending] = React.useState<PendingMutation | null>(null);
  const [confirmError, setConfirmError] = React.useState<string | null>(null);

  const state = (activity.state?.state ?? 'not_started') as PdevActivityState;
  const tone = statePillTone(state);
  const due = activity.state?.dueAt
    ? new Date(activity.state.dueAt).toISOString().slice(0, 10)
    : 'no due date';
  const reqDocs = activity.registry.requiredDocuments;

  // ── Per-tab fetches (gated by tab selection so we don't waste requests) ─
  const evidence = usePdevActivityEvidence(
    tab === 'evidence' ? programId : null,
    tab === 'evidence' ? activity.registry.key : null,
  );
  const workflow = usePdevActivityWorkflow(
    tab === 'workflow' ? programId : null,
    tab === 'workflow' ? activity.registry.key : null,
  );
  const provenance = usePdevActivityProvenance(
    tab === 'provenance' || tab === 'audit' ? programId : null,
    tab === 'provenance' || tab === 'audit' ? activity.registry.key : null,
  );

  const stateChange = usePdevActivityStateChange();
  const evidenceDetach = usePdevEvidenceDetach();
  const workflowKickoff = usePdevWorkflowKickoff();
  const workflowDecision = usePdevWorkflowDecision();

  const handleConfirm = async ({ reason }: { reason: string }) => {
    if (!pending) return;
    setConfirmError(null);
    try {
      if (pending.kind === 'state') {
        await stateChange.run({
          programId,
          activityKey: activity.registry.key,
          state: pending.targetState,
          reason,
        });
      } else if (pending.kind === 'evidence-detach') {
        await evidenceDetach.run({
          programId,
          activityKey: activity.registry.key,
          evidenceLinkId: pending.evidenceLinkId,
          reason,
        });
        evidence.refresh();
      } else if (pending.kind === 'workflow-kickoff') {
        await workflowKickoff.run({
          programId,
          activityKey: activity.registry.key,
          targetState: pending.targetState,
          reason,
        });
        workflow.refresh();
      } else if (pending.kind === 'workflow-decision') {
        await workflowDecision.run({
          runId: pending.runId,
          checkpointId: pending.checkpointId,
          decision: pending.decision,
          reason,
        });
        workflow.refresh();
      }
      setPending(null);
      onMutated();
    } catch (err) {
      setConfirmError(err instanceof Error ? err.message : 'Action failed');
    }
  };

  return (
    <div className="pdev-sheet-backdrop" onClick={onClose} role="presentation">
      <aside
        className="pdev-sheet"
        onClick={(e) => e.stopPropagation()}
        aria-label={`${activity.registry.title} detail`}
        role="dialog"
        aria-modal="true"
      >
        <div className="pdev-sheet-head">
          <div>
            <div className="pdev-sheet-eyebrow mono">{activity.registry.key}</div>
            <div className="pdev-sheet-title">{activity.registry.title}</div>
            <div className="pdev-sheet-meta">
              <span className={`pdev-state-pill state-${tone}`}>
                {PDEV_STATE_LABELS[state]}
              </span>
              <span className="dot-sep">·</span>
              <span>{PDEV_WORKSTREAM_LABELS[activity.registry.workstream]}</span>
              <span className="dot-sep">·</span>
              <span>{PDEV_STAGE_LABELS[activity.registry.stage]}</span>
            </div>
          </div>
          <button
            className="pdev-sheet-close"
            onClick={onClose}
            type="button"
            aria-label="Close"
          >
            <PdevIcon name="close" />
          </button>
        </div>

        <div className="pdev-sheet-tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              className="pdev-sheet-tab"
              aria-current={tab === t.id ? 'page' : undefined}
              onClick={() => setTab(t.id)}
              type="button"
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="pdev-sheet-body">
          {tab === 'state' && (
            <>
              <div className="pdev-sheet-section">
                <div className="lbl">Current state</div>
                <div className="val">
                  <span className={`pdev-state-pill state-${tone}`}>
                    {PDEV_STATE_LABELS[state]}
                  </span>
                </div>
              </div>
              <div className="pdev-sheet-section">
                <div className="lbl">Description</div>
                <div className="val">{activity.registry.description}</div>
              </div>
              <div className="pdev-sheet-section">
                <div className="lbl">Due</div>
                <div className="val mono">{due}</div>
              </div>
              <div className="pdev-sheet-section">
                <div className="lbl">Dependencies</div>
                <div className="val">
                  {activity.registry.dependsOn.length === 0 ? (
                    'No upstream dependencies'
                  ) : (
                    <ul className="pdev-deps-list">
                      {activity.registry.dependsOn.map((k) => (
                        <li key={k} className="mono">
                          {k}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
              <div className="pdev-sheet-section">
                <div className="lbl">Change state</div>
                <div className="pdev-state-grid">
                  {PDEV_ACTIVITY_STATES.map((s) => (
                    <button
                      key={s}
                      className={`pdev-state-chip ${state === s ? 'on' : ''}`}
                      onClick={() =>
                        setPending({
                          kind: 'state',
                          targetState: s,
                          config: {
                            action: 'Change activity state',
                            target: `${activity.registry.key} · ${PDEV_STATE_LABELS[state]} → ${PDEV_STATE_LABELS[s]}`,
                            resource: activity.registry.key,
                            minReason: 10,
                            confirmWord: 'yes',
                          },
                        })
                      }
                      type="button"
                      disabled={state === s}
                    >
                      {PDEV_STATE_LABELS[s]}
                    </button>
                  ))}
                </div>
                <div className="pdev-sheet-hint">
                  Promotion to a completed state will be refused if dependencies
                  aren't satisfied. Force-with-reason override is audit-flagged.
                </div>
              </div>
            </>
          )}

          {tab === 'documents' && (
            <>
              {reqDocs.length === 0 && (
                <div className="pdev-empty">
                  No documents specified in the registry for this activity.
                </div>
              )}
              {reqDocs.map((d) => (
                <div key={d.code} className="pdev-doc-row">
                  <div className="pdev-doc-body">
                    <div className="pdev-doc-head">
                      <span className="mono pdev-doc-code">{d.code}</span>
                      {d.mandatoryForInd && (
                        <span className="pdev-mandatory-chip">mandatory · IND</span>
                      )}
                      <span className="mono pdev-doc-ectd">
                        {d.ectdModule === 'none'
                          ? 'working doc'
                          : `eCTD ${d.ectdSection ?? d.ectdModule}`}
                      </span>
                    </div>
                    <div className="pdev-doc-title">{d.title}</div>
                  </div>
                  <div className="pdev-doc-actions">
                    <button
                      className="pdev-btn primary small"
                      onClick={() => onOpenDraft(d.code)}
                      type="button"
                    >
                      <PdevIcon name="sparkles" /> Generate draft
                    </button>
                  </div>
                </div>
              ))}
            </>
          )}

          {tab === 'evidence' && (
            <>
              {evidence.loading && !evidence.payload && (
                <div className="pdev-empty">Loading evidence…</div>
              )}
              {evidence.payload?.links.length === 0 && (
                <div className="pdev-empty">No evidence attached yet.</div>
              )}
              {evidence.payload?.links.map((e) => (
                <div
                  key={e.id}
                  className="pdev-evidence-row"
                  data-link={e.linkType}
                >
                  <span className={`pdev-link-pill pdev-link-${e.linkType}`}>
                    {e.linkType}
                  </span>
                  <div className="pdev-evidence-body">
                    <div className="pdev-evidence-title">{e.title}</div>
                    <div className="pdev-evidence-meta mono small">
                      {e.type} · {e.category} · {e.source} · {e.strength}
                    </div>
                  </div>
                  <button
                    className="pdev-btn ghost small"
                    onClick={() =>
                      setPending({
                        kind: 'evidence-detach',
                        evidenceLinkId: e.id,
                        config: {
                          action: 'Detach evidence',
                          target: `${e.evidenceObjectId} from ${activity.registry.key}`,
                          resource: activity.registry.key,
                          minReason: 10,
                          confirmWord: 'yes',
                        },
                      })
                    }
                    type="button"
                  >
                    <PdevIcon name="close" /> Detach
                  </button>
                </div>
              ))}
              <button
                className="pdev-btn primary"
                onClick={onOpenEvidencePicker}
                type="button"
              >
                <PdevIcon name="link" /> Attach evidence
              </button>
            </>
          )}

          {tab === 'workflow' && (
            <>
              {workflow.loading && !workflow.payload && (
                <div className="pdev-empty">Loading workflow…</div>
              )}
              {workflow.payload && !workflow.payload.run && (
                <>
                  <div className="pdev-empty">No approval chain in flight.</div>
                  <button
                    className="pdev-btn primary"
                    onClick={() =>
                      setPending({
                        kind: 'workflow-kickoff',
                        targetState: 'approved',
                        config: {
                          action: 'Kick off approval chain',
                          target: `${activity.registry.key} → approved`,
                          resource: activity.registry.key,
                          minReason: 10,
                          confirmWord: 'yes',
                        },
                      })
                    }
                    type="button"
                  >
                    <PdevIcon name="rocket" /> Kick off approval
                  </button>
                </>
              )}
              {workflow.payload?.run && (
                <div className="pdev-workflow-chain">
                  <div className="pdev-workflow-chain-head">
                    <span className="mono">{workflow.payload.run.runId}</span>
                    <span className="pdev-workflow-target">
                      → {PDEV_STATE_LABELS[workflow.payload.run.targetState]}
                    </span>
                    <span
                      className={`pdev-workflow-status pdev-workflow-status-${workflow.payload.run.status.replace(/_/g, '-')}`}
                    >
                      {workflow.payload.run.status.replace(/_/g, ' ')}
                    </span>
                  </div>
                  {workflow.payload.run.checkpoints.map((cp) => (
                    <div
                      key={cp.id}
                      className="pdev-workflow-step"
                      data-status={cp.status}
                    >
                      <div className="pdev-workflow-step-num mono">{cp.stepIndex}</div>
                      <div className="pdev-workflow-step-body">
                        <div className="pdev-workflow-step-name">{cp.name}</div>
                        <div className="pdev-workflow-step-meta mono small">
                          requires: {cp.requiredRoles.join(', ')}
                        </div>
                        {cp.approvals.map((a) => (
                          <div key={a.id} className="pdev-workflow-approval">
                            <span className="mono">{a.approverDisplay}</span> ·{' '}
                            {a.role} · {new Date(a.decidedAt).toLocaleString()}
                            {a.comment && (
                              <div className="pdev-workflow-comment">
                                "{a.comment}"
                              </div>
                            )}
                          </div>
                        ))}
                        {cp.status === 'awaiting_review' && workflow.payload?.run && (
                          <div className="pdev-workflow-actions">
                            <button
                              className="pdev-btn ghost small"
                              onClick={() =>
                                setPending({
                                  kind: 'workflow-decision',
                                  runId: workflow.payload!.run!.runId,
                                  checkpointId: cp.id,
                                  decision: 'reject',
                                  config: {
                                    action: 'Reject checkpoint',
                                    target: `${workflow.payload!.run!.runId} step ${cp.stepIndex}`,
                                    resource: activity.registry.key,
                                    minReason: 10,
                                    confirmWord: 'yes',
                                  },
                                })
                              }
                              type="button"
                            >
                              <PdevIcon name="close" /> Reject
                            </button>
                            <button
                              className="pdev-btn primary small"
                              onClick={() =>
                                setPending({
                                  kind: 'workflow-decision',
                                  runId: workflow.payload!.run!.runId,
                                  checkpointId: cp.id,
                                  decision: 'approve',
                                  config: {
                                    action: 'Approve checkpoint',
                                    target: `${workflow.payload!.run!.runId} step ${cp.stepIndex}`,
                                    resource: activity.registry.key,
                                    minReason: 10,
                                    confirmWord: 'yes',
                                  },
                                })
                              }
                              type="button"
                            >
                              <PdevIcon name="check" /> Approve
                            </button>
                          </div>
                        )}
                      </div>
                      <span
                        className={`pdev-workflow-step-pill pdev-workflow-step-${cp.status.replace(/_/g, '-')}`}
                      >
                        {cp.status.replace(/_/g, ' ')}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {tab === 'provenance' && (
            <>
              {provenance.loading && !provenance.payload && (
                <div className="pdev-empty">Loading provenance…</div>
              )}
              {provenance.payload && (
                <>
                  <div className="pdev-prov-counts">
                    <div className="pdev-prov-count">
                      <span className="num">
                        {provenance.payload.artifacts.length}
                      </span>
                      <span className="lbl">artifacts</span>
                    </div>
                    <div className="pdev-prov-count">
                      <span className="num">
                        {provenance.payload.evidence.length}
                      </span>
                      <span className="lbl">evidence</span>
                    </div>
                    <div className="pdev-prov-count">
                      <span className="num">
                        {provenance.payload.lineage.length}
                      </span>
                      <span className="lbl">lineage edges</span>
                    </div>
                    <div className="pdev-prov-count">
                      <span className="num">
                        {provenance.payload.audit.length}
                      </span>
                      <span className="lbl">audit events</span>
                    </div>
                  </div>
                  <div className="pdev-prov-section-lbl">Artifacts</div>
                  {provenance.payload.artifacts.map((a) => (
                    <div key={a.id} className="pdev-prov-row">
                      <span className="mono small">{a.id}</span>
                      <span className="pdev-prov-title">{a.title}</span>
                      <span className="mono small">{a.version}</span>
                      <span className="mono small">{a.ctdSection}</span>
                      <span className="mono tiny">{a.contentHash}</span>
                    </div>
                  ))}
                  <div className="pdev-prov-section-lbl">Lineage</div>
                  {provenance.payload.lineage.map((l) => (
                    <div key={l.id} className="pdev-prov-row">
                      <span className="mono small">
                        {l.linkageType.replace(/_/g, ' ')}
                      </span>
                      <span className="pdev-prov-title">{l.sourceTitle}</span>
                      <span className="mono small">{l.transformationType}</span>
                      <span className="mono small">
                        {Math.round(l.confidenceScore * 100)}%
                      </span>
                      <span className="mono tiny">{l.aiModelUsed ?? '—'}</span>
                    </div>
                  ))}
                  <button
                    className="pdev-btn ghost"
                    onClick={() =>
                      onAskAna(
                        `Export provenance for ${activity.registry.key} as a regulated PDF report`,
                      )
                    }
                    type="button"
                  >
                    Export PDF
                  </button>
                </>
              )}
            </>
          )}

          {tab === 'audit' && (
            <>
              {provenance.loading && !provenance.payload && (
                <div className="pdev-empty">Loading audit…</div>
              )}
              {provenance.payload?.audit.length === 0 && (
                <div className="pdev-empty">No audit events yet.</div>
              )}
              {provenance.payload?.audit.map((a) => (
                <div key={a.id} className="pdev-audit-row-detail">
                  <span className="mono small">{a.id}</span>
                  <span className="mono small">
                    {new Date(a.when).toLocaleString()}
                  </span>
                  <span className="mono small">{a.actor}</span>
                  <span className="pdev-audit-action mono">{a.action}</span>
                  <span className="pdev-audit-detail">{a.detail}</span>
                </div>
              ))}
            </>
          )}
        </div>
      </aside>

      {pending && (
        <PdevConfirmDialog
          open={true}
          {...pending.config}
          onCancel={() => {
            setPending(null);
            setConfirmError(null);
          }}
          onConfirm={handleConfirm}
          submitError={confirmError}
        />
      )}
    </div>
  );
}
