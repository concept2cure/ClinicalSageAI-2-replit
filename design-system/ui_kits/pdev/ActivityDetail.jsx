(() => {
const {
  PdevI: I,
  PDEV_STATE_LABELS, PDEV_ACTIVITY_STATES, PDEV_COMPLETED_STATES, PDEV_BLOCKED_STATES,
  PDEV_DOCUMENTS, PDEV_WORKFLOW, PDEV_PROVENANCE,
} = window;

function statePillClass(state) {
  if (PDEV_COMPLETED_STATES.includes(state)) return 'state-done';
  if (PDEV_BLOCKED_STATES.includes(state))   return 'state-blocked';
  if (state === 'ai_draft_generated' || state === 'evidence_linked') return 'state-ai';
  if (state === 'changes_requested') return 'state-warn-strong';
  if (state === 'human_review_required' || state === 'in_review' || state === 'agency_feedback_received') return 'state-warn';
  if (state === 'drafting') return 'state-flight';
  if (state === 'superseded') return 'state-neutral';
  return 'state-idle';
}

const TABS = [
  { id: 'state', label: 'State' },
  { id: 'documents', label: 'Documents' },
  { id: 'evidence', label: 'Evidence' },
  { id: 'workflow', label: 'Workflow' },
  { id: 'provenance', label: 'Provenance' },
  { id: 'audit', label: 'Audit' },
];

function PdevActivityDetail({ activity, onClose, openDraft, openEvidence, openConfirm, onAskAna }) {
  const [tab, setTab] = React.useState('state');
  if (!activity) return null;

  const docs = PDEV_DOCUMENTS[activity.key] || [];
  const wf = activity.key === 'nonclinical.glp_tox' ? PDEV_WORKFLOW : null;
  const prov = activity.key === 'nonclinical.glp_tox' ? PDEV_PROVENANCE : null;

  return (
    <div className="pdev-sheet-backdrop" onClick={onClose}>
      <aside className="pdev-sheet" onClick={e => e.stopPropagation()}>
        <div className="pdev-sheet-head">
          <div>
            <div className="pdev-sheet-eyebrow mono">{activity.key}</div>
            <div className="pdev-sheet-title">{activity.title}</div>
            <div className="pdev-sheet-meta">
              <span className={`pdev-state-pill ${statePillClass(activity.state)}`}>{PDEV_STATE_LABELS[activity.state]}</span>
              <span className="dot-sep">·</span>
              <span>{activity.docs} doc{activity.docs !== 1 ? 's' : ''}</span>
              <span className="dot-sep">·</span>
              <span>{activity.evidenceN} evidence</span>
              {activity.owner && <><span className="dot-sep">·</span><span>{activity.owner}</span></>}
            </div>
          </div>
          <button className="pdev-sheet-close" onClick={onClose}>{I.close}</button>
        </div>

        <div className="pdev-sheet-tabs">
          {TABS.map(t => (
            <button key={t.id} className="pdev-sheet-tab" aria-current={tab === t.id || undefined} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="pdev-sheet-body">
          {tab === 'state' && (
            <>
              <div className="pdev-sheet-section">
                <div className="lbl">Current state</div>
                <div className="val"><span className={`pdev-state-pill ${statePillClass(activity.state)}`}>{PDEV_STATE_LABELS[activity.state]}</span></div>
              </div>
              <div className="pdev-sheet-section">
                <div className="lbl">Due</div>
                <div className="val mono">{activity.due}</div>
              </div>
              <div className="pdev-sheet-section">
                <div className="lbl">Owner · reviewer</div>
                <div className="val">{activity.owner || 'Unassigned'} {activity.owner && '· JC'}</div>
              </div>
              <div className="pdev-sheet-section">
                <div className="lbl">Dependencies</div>
                <div className="val">{activity.hasDeps ? 'Has dependency chain · check Workflow tab' : 'No upstream dependencies'}</div>
              </div>
              <div className="pdev-sheet-section">
                <div className="lbl">Change state</div>
                <div className="pdev-state-grid">
                  {PDEV_ACTIVITY_STATES.map(s => (
                    <button key={s} className={`pdev-state-chip ${activity.state === s ? 'on' : ''}`} onClick={() => openConfirm({
                      action: 'Change activity state',
                      target: `${activity.key} · ${PDEV_STATE_LABELS[activity.state]} → ${PDEV_STATE_LABELS[s]}`,
                      resource: activity.key,
                      minReason: 10,
                      confirmWord: 'yes',
                    })}>
                      {PDEV_STATE_LABELS[s]}
                    </button>
                  ))}
                </div>
                <div className="pdev-sheet-hint">Promotion to a completed state will be refused if dependencies aren't satisfied. Force-with-reason override is audit-flagged.</div>
              </div>
            </>
          )}

          {tab === 'documents' && (
            <>
              {docs.length === 0 && <div className="pdev-empty">No documents specified in the registry for this activity.</div>}
              {docs.map(d => (
                <div key={d.code} className="pdev-doc-row" data-state={d.state}>
                  <div className="pdev-doc-body">
                    <div className="pdev-doc-head">
                      <span className="mono pdev-doc-code">{d.code}</span>
                      {d.mandatoryForInd && <span className="pdev-mandatory-chip">mandatory · IND</span>}
                      <span className="mono pdev-doc-ectd">eCTD {d.ectd}</span>
                    </div>
                    <div className="pdev-doc-title">{d.title}</div>
                    <div className="pdev-doc-meta">
                      <span className={`pdev-state-pill ${statePillClass(d.state === 'missing' ? 'not_started' : d.state)}`}>{d.state === 'missing' ? 'Missing' : PDEV_STATE_LABELS[d.state] || d.state}</span>
                      {d.artifactId && <span className="mono small">artifact {d.artifactId}</span>}
                    </div>
                  </div>
                  <div className="pdev-doc-actions">
                    {!d.artifactId
                      ? <button className="pdev-btn primary small" onClick={() => openDraft(activity, d)}>{I.sparkles} Generate draft</button>
                      : <button className="pdev-btn ghost small" onClick={() => onAskAna(`Open ${d.code} for ${activity.key}`)}>{I.eye} Open</button>}
                  </div>
                </div>
              ))}
            </>
          )}

          {tab === 'evidence' && (
            <>
              {!prov && <div className="pdev-empty">No evidence attached yet.</div>}
              {prov && prov.evidence.map(e => (
                <div key={e.id} className="pdev-evidence-row" data-link={e.linkType}>
                  <span className={`pdev-link-pill pdev-link-${e.linkType}`}>{e.linkType}</span>
                  <div className="pdev-evidence-body">
                    <div className="pdev-evidence-title">{e.title}</div>
                    <div className="pdev-evidence-meta mono small">{e.type} · {e.category} · {e.source} · {e.strength}</div>
                  </div>
                  <button className="pdev-btn ghost small" onClick={() => openConfirm({
                    action: 'Detach evidence',
                    target: `${e.id} from ${activity.key}`,
                    resource: activity.key,
                    minReason: 10,
                    confirmWord: 'yes',
                  })}>{I.close} Detach</button>
                </div>
              ))}
              <button className="pdev-btn primary" onClick={() => openEvidence(activity)}>{I.plus} Attach evidence</button>
            </>
          )}

          {tab === 'workflow' && (
            <>
              {!wf && (
                <>
                  <div className="pdev-empty">No approval chain in flight.</div>
                  <button className="pdev-btn primary" onClick={() => openConfirm({
                    action: 'Kick off approval chain',
                    target: `${activity.key} → approved`,
                    resource: activity.key,
                    minReason: 10,
                    confirmWord: 'yes',
                  })}>{I.rocket} Kick off approval</button>
                </>
              )}
              {wf && (
                <div className="pdev-workflow-chain">
                  <div className="pdev-workflow-chain-head">
                    <span className="mono">{wf.runId}</span>
                    <span className="pdev-workflow-target">→ {PDEV_STATE_LABELS[wf.targetState]}</span>
                    <span className={`pdev-workflow-status pdev-workflow-status-${wf.workflowStatus.replace(/_/g,'-')}`}>{wf.workflowStatus.replace(/_/g,' ')}</span>
                  </div>
                  {wf.steps.map(s => (
                    <div key={s.stepIdx} className="pdev-workflow-step" data-status={s.status}>
                      <div className="pdev-workflow-step-num mono">{s.stepIdx}</div>
                      <div className="pdev-workflow-step-body">
                        <div className="pdev-workflow-step-name">{s.name}</div>
                        <div className="pdev-workflow-step-meta mono small">requires: {s.requiredRoles.join(', ')}</div>
                        {s.approvals.map((a, i) => (
                          <div key={i} className="pdev-workflow-approval">
                            <span className="mono">{a.approver}</span> · {a.role} · {a.when}
                            {a.comment && <div className="pdev-workflow-comment">"{a.comment}"</div>}
                          </div>
                        ))}
                        {s.status === 'awaiting_review' && (
                          <div className="pdev-workflow-actions">
                            <button className="pdev-btn ghost small" onClick={() => openConfirm({
                              action: 'Reject checkpoint',
                              target: `${wf.runId} step ${s.stepIdx}`,
                              resource: activity.key,
                              minReason: 10,
                              confirmWord: 'yes',
                            })}>{I.x} Reject</button>
                            <button className="pdev-btn primary small" onClick={() => openConfirm({
                              action: 'Approve checkpoint',
                              target: `${wf.runId} step ${s.stepIdx}`,
                              resource: activity.key,
                              minReason: 10,
                              confirmWord: 'yes',
                            })}>{I.check} Approve</button>
                          </div>
                        )}
                      </div>
                      <span className={`pdev-workflow-step-pill pdev-workflow-step-${s.status.replace(/_/g,'-')}`}>{s.status.replace(/_/g,' ')}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {tab === 'provenance' && (
            <>
              {!prov && <div className="pdev-empty">No provenance trace yet.</div>}
              {prov && (
                <>
                  <div className="pdev-prov-counts">
                    <div className="pdev-prov-count"><span className="num">{prov.artifacts.length}</span><span className="lbl">artifacts</span></div>
                    <div className="pdev-prov-count"><span className="num">{prov.evidence.length}</span><span className="lbl">evidence</span></div>
                    <div className="pdev-prov-count"><span className="num">{prov.lineage.length}</span><span className="lbl">lineage edges</span></div>
                    <div className="pdev-prov-count"><span className="num">{prov.audit.length}</span><span className="lbl">audit events</span></div>
                  </div>
                  <div className="pdev-prov-section-lbl">Artifacts</div>
                  {prov.artifacts.map(a => (
                    <div key={a.id} className="pdev-prov-row">
                      <span className="mono small">{a.id}</span>
                      <span className="pdev-prov-title">{a.title}</span>
                      <span className="mono small">{a.version}</span>
                      <span className="mono small">{a.ctdSection}</span>
                      <span className="mono tiny">{a.contentHash}</span>
                    </div>
                  ))}
                  <div className="pdev-prov-section-lbl">Lineage</div>
                  {prov.lineage.map(l => (
                    <div key={l.id} className="pdev-prov-row">
                      <span className="mono small">{l.linkageType.replace(/_/g,' ')}</span>
                      <span className="pdev-prov-title">{l.sourceTitle}</span>
                      <span className="mono small">{l.transformationType}</span>
                      <span className="mono small">{Math.round(l.confidenceScore * 100)}%</span>
                      <span className="mono tiny">{l.aiModelUsed || '—'}</span>
                    </div>
                  ))}
                  <button className="pdev-btn ghost" onClick={() => onAskAna(`Export provenance for ${activity.key} as a regulated PDF report`)}>{I.download} Export PDF</button>
                </>
              )}
            </>
          )}

          {tab === 'audit' && (
            <>
              {!prov && <div className="pdev-empty">No audit events yet.</div>}
              {prov && prov.audit.map(a => (
                <div key={a.id} className="pdev-audit-row-detail">
                  <span className="mono small">{a.id}</span>
                  <span className="mono small">{a.when}</span>
                  <span className="mono small">{a.actor}</span>
                  <span className="pdev-audit-action mono">{a.action}</span>
                  <span className="pdev-audit-detail">{a.detail}</span>
                </div>
              ))}
            </>
          )}
        </div>
      </aside>
    </div>
  );
}

window.PdevActivityDetail = PdevActivityDetail;
})();
