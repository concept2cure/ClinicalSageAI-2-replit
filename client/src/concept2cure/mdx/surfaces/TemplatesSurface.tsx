/**
 * TemplatesSurface — Phase 5 doc-first (medtech corpus).
 *
 * Replaces the placeholder TemplatesSurface in workbench/Workbench.tsx.
 * Section skeletons + boilerplate for every regulatory artifact Phase 4
 * introduces (eSTAR, SRS, RMF, IFU, MDR-3500A, CAPA, FSCA, PSUR, QMS).
 *
 * Cross-program. Port basis:
 * design-system/ui_kits/mdx/surfaces/Templates.jsx.
 */

import * as React from 'react';
import { I } from '../icons';
import { DocumentsPanel } from '../components/DocumentsPanel';
import { TEMPLATES, TPL_FRAMEWORKS } from '../data/templates';
import { useTemplates } from '../hooks/useTemplates';
import type {
  KitDocFramework,
  KitDocument,
} from '../components/DocumentsPanel';

export interface TemplatesSurfaceProps {
  onAskAna: (text: string, opts?: { tool?: string }) => void;
  onOpenEditor?: (docId: string) => void;
}

export function TemplatesSurface({
  onAskAna,
  onOpenEditor,
}: TemplatesSurfaceProps) {
  const live = useTemplates();
  const templates = live.templates ?? TEMPLATES;
  const frameworks = live.frameworks ?? TPL_FRAMEWORKS;
  const docs = templates as unknown as KitDocument[];
  const docFrameworks = frameworks as unknown as KitDocFramework[];

  const totalUses = templates.reduce((s, t) => s + (t.uses ?? 0), 0);
  const ready = templates.filter((t) => t.status === 'ready').length;
  const maxUses = templates.length
    ? Math.max(...templates.map((t) => t.uses ?? 0))
    : 0;
  const topTemplate = templates.find((t) => (t.uses ?? 0) === maxUses);
  const k510Count = templates.filter((t) => t.framework === 'k510').length;
  const lastEdited = [...templates].sort((a, b) =>
    (a.lastEdit ?? '').localeCompare(b.lastEdit ?? ''),
  )[0];

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-eyebrow">Workbench</div>
          <h1 className="page-title">Templates</h1>
          <div className="page-sub">
            Org-approved section skeletons + boilerplate for every regulatory
            artifact. {templates.length} templates · {totalUses} uses across
            the portfolio · version-controlled.
          </div>
        </div>
        <div className="page-actions">
          <button
            className="btn ghost small"
            onClick={() =>
              onAskAna(
                'Find a similar template — describe what I want to author and surface the closest match from the org corpus.',
              )
            }
            type="button"
          >
            {I.search} Find template
          </button>
          <button
            className="btn primary small"
            onClick={() =>
              onAskAna(
                'Create a new org-approved template. Confirm name, owner, applicable pathways (510(k), PMA, CER, eng, udi, pv, qms), tags, and the section skeleton — then version-control it.',
              )
            }
            type="button"
          >
            {I.plus} New template
          </button>
        </div>
      </div>

      <div className="metrics-row metrics-compact">
        <div className="metric-card">
          <div className="metric-label">Templates</div>
          <div className="metric-val">{templates.length}</div>
          <div className="metric-meta">
            Across {frameworks.length} frameworks · {ready} ready
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Total uses</div>
          <div className="metric-val">{totalUses}</div>
          <div className="metric-meta">
            Lifetime
            {topTemplate
              ? ` · top: ${maxUses}× (${topTemplate.type ?? topTemplate.title.split(' ')[0]})`
              : ''}
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Top framework</div>
          <div className="metric-val">510(k)</div>
          <div className="metric-meta">
            {k510Count} templates · most used
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Last edit</div>
          <div className="metric-val" style={{ fontSize: 18 }}>
            {lastEdited?.lastEdit ?? '—'}
          </div>
          <div className="metric-meta">
            Across all templates · oldest version control
          </div>
        </div>
      </div>

      <DocumentsPanel
        title="Templates · medtech corpus"
        subtitle="Tap any template to open in the editor as a new artifact · sparkle to ask AnA to apply it to a specific program"
        docs={docs}
        frameworks={docFrameworks}
        onOpenEditor={onOpenEditor}
        onAskAna={(text) => onAskAna(text)}
      />
    </>
  );
}
