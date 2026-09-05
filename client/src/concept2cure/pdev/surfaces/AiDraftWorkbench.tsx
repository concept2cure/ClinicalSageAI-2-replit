/**
 * PDEV AI drafting workbench — 2-pane governed-draft sheet.
 *
 * Left pane: context + target document + optional user prompt. Right pane:
 * the governed record the drafting service returns — metadata ONLY (quality
 * grade, word count, title, document code, target eCTD section, artifact id).
 *
 * Generating a draft persists it as a versioned, quality-gated artifact in
 * concept2cure_artifacts and promotes the activity to `ai_draft_generated`.
 * The service returns that record's metadata, NOT a section-by-section preview
 * of prose — so this surface renders no client-side preview. The draft body
 * lives in the artifact, opened from the activity's Provenance tab.
 *
 * Port basis: ui_kits/pdev/AiDraft.jsx (the kit's fabricated
 * `preview.sections[].preview` prose has been retired — it was content the
 * server never produced).
 */

import * as React from 'react';
import { PdevIcon } from '../icons';
import type { PdevActivityView } from '../data/types';
import { usePdevAiDraft } from '../hooks/usePdevData';

interface AiDraftWorkbenchProps {
  programId: string;
  /** Backing project id for ESG / submission gateway routing. */
  projectId: number;
  activity: PdevActivityView;
  /** When the user opens the workbench from the Documents tab, the
   *  document code is pre-filled. Null when they opened from the
   *  activity-level header. */
  documentCode: string | null;
  onClose: () => void;
}

export function PdevAiDraftWorkbench({
  programId,
  projectId,
  activity,
  documentCode,
  onClose,
}: AiDraftWorkbenchProps) {
  const [prompt, setPrompt] = React.useState('');
  const draft = usePdevAiDraft();
  const result = draft.lastResult?.data ?? null;
  const targetDoc = documentCode
    ? activity.registry.requiredDocuments.find((d) => d.code === documentCode)
    : null;

  const generate = () => {
    draft
      .run({
        programId,
        activityKey: activity.registry.key,
        projectId,
        documentCode: documentCode ?? undefined,
        userPrompt: prompt.trim() || undefined,
      })
      .catch(() => {
        /* error stored in draft.error */
      });
  };

  return (
    <div
      className="pdev-sheet-backdrop"
      onClick={onClose}
      role="presentation"
    >
      <aside
        className="pdev-sheet pdev-sheet-wide"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="AI drafting workbench"
      >
        <div className="pdev-sheet-head">
          <div>
            <div className="pdev-sheet-eyebrow">
              AI drafting workbench · governed
            </div>
            <div className="pdev-sheet-title">
              Draft {targetDoc?.title ?? activity.registry.title}
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

        <div className="pdev-aidraft-grid">
          <div className="pdev-aidraft-left">
            <div className="pdev-sheet-section">
              <div className="lbl">Context</div>
              <div className="val mono small">
                {activity.registry.key}
                {targetDoc?.ectdSection && ` · ${targetDoc.ectdSection}`}
              </div>
            </div>
            <div className="pdev-sheet-section">
              <div className="lbl">Target document</div>
              <div className="val">
                {targetDoc?.title ?? 'Activity-level summary'}
              </div>
            </div>
            <div className="pdev-sheet-section">
              <div className="lbl">Optional prompt</div>
              <textarea
                rows={3}
                placeholder="Anything you want AnA to emphasize, exclude, or follow…"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
              />
            </div>
            {draft.error && (
              <div className="pdev-confirm-error" role="alert">
                {draft.error}
              </div>
            )}
            <button
              className="pdev-btn primary"
              onClick={generate}
              disabled={draft.loading}
              type="button"
            >
              {draft.loading ? (
                'Drafting…'
              ) : (
                <>
                  <PdevIcon name="sparkles" /> Generate draft
                </>
              )}
            </button>
          </div>

          <div className="pdev-aidraft-right">
            {!result && !draft.loading && (
              <div className="pdev-empty">
                Generate a governed draft to file it against this activity. The
                draft is persisted as a versioned, quality-gated artifact — its
                governed record appears here. No preview is fabricated
                client-side.
              </div>
            )}
            {draft.loading && (
              <div className="pdev-aidraft-streaming" aria-busy="true">
                Generating the governed draft…
              </div>
            )}
            {result && (
              <div className="pdev-aidraft-result">
                <div className="pdev-aidraft-result-head">
                  <PdevIcon name="check" />
                  <div>
                    <div className="pdev-aidraft-result-title">
                      Draft generated
                    </div>
                    <div className="pdev-aidraft-result-sub">
                      Filed as a versioned, quality-gated artifact — it entered
                      the governed lifecycle. The activity is now AI draft ready.
                    </div>
                  </div>
                </div>

                <div className="pdev-aidraft-grade">
                  {result.qualityGrade && (
                    <span
                      className={`pdev-grade-pill pdev-grade-${result.qualityGrade.toLowerCase()}`}
                    >
                      Quality gate: {result.qualityGrade}
                    </span>
                  )}
                  <span className="mono small">{result.wordCount} words</span>
                </div>

                <dl className="pdev-aidraft-meta">
                  <div className="pdev-aidraft-meta-row">
                    <dt>Title</dt>
                    <dd>{result.title}</dd>
                  </div>
                  <div className="pdev-aidraft-meta-row">
                    <dt>Document code</dt>
                    <dd className="mono">{result.documentCode}</dd>
                  </div>
                  <div className="pdev-aidraft-meta-row">
                    <dt>Target eCTD section</dt>
                    <dd className="mono">
                      {result.ectdSection ??
                        'Working document — no eCTD destination'}
                    </dd>
                  </div>
                  <div className="pdev-aidraft-meta-row">
                    <dt>Artifact</dt>
                    <dd className="mono">{result.artifactId}</dd>
                  </div>
                </dl>

                <div className="pdev-aidraft-openhint">
                  Open the governed artifact from this activity's Provenance tab
                  to review, version, or route it for approval.
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="pdev-sheet-foot">
          <button className="pdev-btn ghost" onClick={onClose} type="button">
            Close
          </button>
        </div>
      </aside>
    </div>
  );
}
