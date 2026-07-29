/**
 * PDEV AI drafting workbench — 2-pane streaming sheet.
 *
 * Left pane: context + target document + optional user prompt + evidence
 * sources. Right pane: streaming preview with quality grade + citation
 * count + model attribution. Filing the draft promotes the activity to
 * `ai_draft_generated` via <PdevConfirmDialog>.
 *
 * Port basis: design-system/ui_kits/pdev/AiDraft.jsx.
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
                Streaming preview will appear here after Generate.
              </div>
            )}
            {draft.loading && (
              <div className="pdev-aidraft-streaming">
                Streaming from {result?.model ?? 'AnA model'}…
              </div>
            )}
            {result && (
              <>
                <div className="pdev-aidraft-grade">
                  {result.grade && (
                    <span
                      className={`pdev-grade-pill pdev-grade-${result.grade.toLowerCase()}`}
                    >
                      Quality gate: {result.grade}
                    </span>
                  )}
                  <span className="mono small">
                    {result.citations} citations · {result.model}
                  </span>
                </div>
                <div className="pdev-aidraft-title">{result.preview.title}</div>
                {result.preview.sections.map((s) => (
                  <div key={s.num} className="pdev-aidraft-section">
                    <span className="pdev-aidraft-section-num mono">§{s.num}</span>
                    <div>
                      <div className="pdev-aidraft-section-label">{s.label}</div>
                      <div className="pdev-aidraft-section-preview">{s.preview}</div>
                    </div>
                  </div>
                ))}
              </>
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
