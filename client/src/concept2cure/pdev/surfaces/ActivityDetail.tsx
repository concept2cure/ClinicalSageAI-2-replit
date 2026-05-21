/**
 * PDEV Activity detail sheet — read-only.
 *
 * Sub-phase 7.1 ships the State tab against data already present in the
 * workstream payload (registry + per-program state row).
 *
 * The kit's full sheet has six tabs (State · Documents · Evidence ·
 * Workflow · Provenance · Audit). Documents needs per-document state
 * which isn't returned by the four allowed routes; Audit needs the
 * provenance endpoint (5th route → 7.2 territory). Both are logged in
 * HANDOFF.md > Open questions.
 *
 * Port basis: design-system/ui_kits/pdev/ActivityDetail.jsx — State tab only.
 */

import * as React from 'react';
import { PdevIcon } from '../icons';
import {
  PDEV_STAGE_LABELS,
  PDEV_STATE_LABELS,
  PDEV_WORKSTREAM_LABELS,
  statePillTone,
} from '../data/enums';
import type { PdevActivityState } from '../data/enums';
import type { PdevActivityView } from '../data/types';

interface ActivityDetailProps {
  activity: PdevActivityView;
  onClose: () => void;
  onAskAna: (text: string) => void;
}

export function PdevActivityDetail({
  activity,
  onClose,
  onAskAna,
}: ActivityDetailProps) {
  const state = (activity.state?.state ?? 'not_started') as PdevActivityState;
  const tone = statePillTone(state);
  const due = activity.state?.dueAt
    ? new Date(activity.state.dueAt).toISOString().slice(0, 10)
    : 'no due date';
  const reqDocs = activity.registry.requiredDocuments;

  return (
    <div
      className="pdev-sheet-backdrop"
      onClick={onClose}
      role="presentation"
    >
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
          <button className="pdev-sheet-tab" aria-current="page" type="button">
            State
          </button>
          <button className="pdev-sheet-tab" aria-disabled type="button" disabled>
            Documents
            <span className="pdev-sheet-tab-soon">soon</span>
          </button>
          <button className="pdev-sheet-tab" aria-disabled type="button" disabled>
            Audit
            <span className="pdev-sheet-tab-soon">soon</span>
          </button>
        </div>

        <div className="pdev-sheet-body">
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
            <div className="lbl">Required documents</div>
            <div className="val">
              {reqDocs.length === 0 ? (
                <span className="pdev-sheet-empty">None defined in the registry</span>
              ) : (
                <ul className="pdev-required-doc-list">
                  {reqDocs.map((d) => (
                    <li key={d.code}>
                      <span className="mono pdev-required-doc-code">{d.code}</span>
                      <span>{d.title}</span>
                      <span className="mono pdev-required-doc-ectd">
                        {d.ectdModule === 'none'
                          ? 'working doc'
                          : d.ectdSection ?? d.ectdModule}
                      </span>
                      {d.mandatoryForInd && (
                        <span className="pdev-required-doc-mandatory">mandatory</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
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
            <div className="lbl">Blocks IND assembly</div>
            <div className="val">
              {activity.registry.blocksIndAssembly ? 'Yes' : 'No'}
            </div>
          </div>

          <div className="pdev-sheet-section">
            <div className="lbl">Counts</div>
            <div className="val">
              {activity.state?.documentCount ?? 0} documents ·{' '}
              {activity.state?.evidenceLinkCount ?? 0} evidence links
            </div>
          </div>

          <div className="pdev-sheet-actions">
            <button
              className="pdev-btn ghost"
              onClick={() =>
                onAskAna(`What's blocking ${activity.registry.key}?`)
              }
              type="button"
            >
              <PdevIcon name="sparkles" /> Ask AnA
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}
