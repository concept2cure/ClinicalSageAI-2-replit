/**
 * DocumentPreview — full-screen modal that shows the live assembled
 * 510(k) document. Two views:
 *
 *   - "Sections": numbered list with status pills + completion bars +
 *     click-to-jump (calls onJumpToSection if provided).
 *   - "Document": the assembled Markdown rendered as a reading view.
 *
 * Reachable from any MDX surface via a "Preview document" affordance.
 *
 * No new design invented — uses existing .surface-card, .pill-status,
 * .stat-row tokens. Calm-motion + sentence-case + 13px body preserved.
 *
 * Per CLAUDE.md the canonical UI lives in design-system/ui_kits/. This
 * component is the minimum-viable preview surface so the user can see
 * the document at any point during the build. When the design system
 * ships a hi-fi document-preview kit, this component is replaced.
 */

import * as React from 'react';
import { I } from '../icons';
import { useDocumentPreview, type DocumentPreviewSection } from '../hooks/useDocumentPreview';

export interface DocumentPreviewProps {
  /**
   * Project identifier. Accepts a numeric `fda510kProjects.id`, a UUID
   * `regulatoryPrograms.id`, or a code string (e.g. 'OR-801'). The
   * BFF endpoint resolves all three forms.
   */
  projectId: number | string | null;
  open: boolean;
  onClose: () => void;
  /** Optional: jump the editor to a specific section. */
  onJumpToSection?: (sectionId: number) => void;
}

const STATUS_LABELS: Record<string, string> = {
  todo: 'To do',
  drafting: 'Drafting',
  validated: 'Validated',
  approved: 'Approved',
};

const STATUS_TONE: Record<string, string> = {
  todo: 'tone-neutral',
  drafting: 'tone-warn',
  validated: 'tone-ok',
  approved: 'tone-ok',
};

export function DocumentPreview({
  projectId,
  open,
  onClose,
  onJumpToSection,
}: DocumentPreviewProps) {
  const { preview, loading, error, refresh } = useDocumentPreview(open ? projectId : null);
  const [view, setView] = React.useState<'sections' | 'document'>('sections');

  if (!open) return null;

  return (
    <div
      className="doc-preview-scrim"
      role="dialog"
      aria-label="510(k) document preview"
      onClick={onClose}
    >
      <div className="doc-preview" onClick={e => e.stopPropagation()}>
        <header className="doc-preview-hdr">
          <div className="doc-preview-title">
            {preview?.documentTitle ?? 'Document preview'}
            {preview && (
              <span className="doc-preview-sub">
                {preview.approvedCount}/{preview.totalSections} approved · overall {preview.completionPercentage}%
              </span>
            )}
          </div>
          <div className="doc-preview-actions">
            <div className="doc-preview-tabs">
              <button
                className={`doc-preview-tab${view === 'sections' ? ' on' : ''}`}
                onClick={() => setView('sections')}
              >
                Sections
              </button>
              <button
                className={`doc-preview-tab${view === 'document' ? ' on' : ''}`}
                onClick={() => setView('document')}
              >
                Document
              </button>
            </div>
            <button className="tb-btn" onClick={refresh} title="Refresh from live state" disabled={loading}>
              {I.clock}
            </button>
            <button className="tb-btn" onClick={onClose} title="Close (Esc)">
              {I.close}
            </button>
          </div>
        </header>

        <div className="doc-preview-body">
          {loading && !preview && (
            <div className="doc-preview-state">Loading live state…</div>
          )}
          {error && (
            <div className="doc-preview-state doc-preview-error">
              Failed to load: {error}. Try refresh.
            </div>
          )}

          {preview && view === 'sections' && (
            <SectionsList sections={preview.sections} onJumpToSection={onJumpToSection} />
          )}

          {preview && view === 'document' && (
            <DocumentView markdown={preview.assembledMarkdown} />
          )}
        </div>

        {preview && (
          <footer className="doc-preview-foot">
            <span className="doc-preview-foot-label">Assembled at</span>
            <code className="doc-preview-foot-time">{preview.assembledAt}</code>
            <span className="doc-preview-foot-spacer" />
            <a
              className="doc-preview-foot-link"
              href={`/api/cerv2-export/pdf?projectId=${preview.projectId}`}
              onClick={e => {
                // Existing endpoint expects a POST with content; this
                // anchor is a placeholder for the kit-side download UX.
                // For BETA the user uses the Sections view's per-section
                // export. The "Generate full PDF" affordance lands with
                // the kit + a wrapper endpoint.
                e.preventDefault();
              }}
              title="Full PDF download — wired alongside the design-system kit"
            >
              Generate PDF (coming with the document-preview kit)
            </a>
          </footer>
        )}
      </div>
    </div>
  );
}

function SectionsList({
  sections,
  onJumpToSection,
}: {
  sections: DocumentPreviewSection[];
  onJumpToSection?: (id: number) => void;
}) {
  return (
    <div className="doc-preview-sections">
      {sections.map(s => {
        const statusKey = s.status in STATUS_LABELS ? s.status : 'todo';
        return (
          <button
            key={s.id}
            className="doc-preview-section"
            onClick={() => onJumpToSection?.(s.id)}
            disabled={!onJumpToSection}
          >
            <div className="doc-preview-section-num">§{s.sectionNumber}</div>
            <div className="doc-preview-section-body">
              <div className="doc-preview-section-title">{s.sectionTitle}</div>
              <div className="doc-preview-section-meta">
                <span className={`pill-status ${STATUS_TONE[statusKey]}`}>
                  {STATUS_LABELS[statusKey]}
                </span>
                <span className="doc-preview-section-pct">{s.completionPercentage}%</span>
                {s.isRequired && (
                  <span className="doc-preview-section-required">required</span>
                )}
                <span className="doc-preview-section-len">
                  {s.contentLength === 0
                    ? 'empty'
                    : s.contentLength > 999
                      ? `${Math.round(s.contentLength / 100) / 10}k chars`
                      : `${s.contentLength} chars`}
                </span>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function DocumentView({ markdown }: { markdown: string }) {
  // Minimal Markdown rendering — heading + paragraph shape only.
  // The full Markdown→HTML pipeline lives in the eSTAR editor; this
  // surface is a read-only preview that shows the assembled state, so
  // we keep it simple. When the design-system kit ships with a richer
  // canvas, that replaces this view.
  const blocks = markdown.split('\n').reduce<Array<{ kind: string; body: string }>>(
    (acc, line) => {
      if (line.startsWith('# ')) acc.push({ kind: 'h1', body: line.slice(2) });
      else if (line.startsWith('## ')) acc.push({ kind: 'h2', body: line.slice(3) });
      else if (line.startsWith('_') && line.endsWith('_')) acc.push({ kind: 'em', body: line.slice(1, -1) });
      else if (line.length > 0) acc.push({ kind: 'p', body: line });
      else acc.push({ kind: 'br', body: '' });
      return acc;
    },
    [],
  );

  return (
    <div className="doc-preview-doc">
      {blocks.map((b, i) => {
        if (b.kind === 'h1') return <h1 key={i}>{b.body}</h1>;
        if (b.kind === 'h2') return <h2 key={i}>{b.body}</h2>;
        if (b.kind === 'em') return <p key={i} className="em">{b.body}</p>;
        if (b.kind === 'br') return <div key={i} className="br" />;
        return <p key={i}>{b.body}</p>;
      })}
    </div>
  );
}
