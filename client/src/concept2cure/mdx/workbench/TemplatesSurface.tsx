/** Optional template surface, isolated from project workflow imports.
 * The canonical template-library surface remains outside this release.
 */
import * as React from 'react';
import { I } from '../icons';
import type { Template } from '../data/workbench';
import { useWorkbenchTemplates } from '../hooks/useWorkbenchTemplates';
import { PanelState, type WorkbenchProps } from './Workbench';

const NO_TEMPLATES: Template[] = [];

// ─────────────────────────────────────────────────────────────────────────────
// Templates
// ─────────────────────────────────────────────────────────────────────────────

export function TemplatesSurface({ onAskAna }: WorkbenchProps) {
  /* Existing live template adapter; loading and failure remain distinct. */
  const live = useWorkbenchTemplates();
  const sourceTemplates = live.templates ?? NO_TEMPLATES;

  /* Shared by the header button and the empty state's CTA — see newTask. */
  const newTemplate = React.useCallback(() => {
    onAskAna(
      'Create a new org-approved template. Walk me through name, owner, applicable pathways (510(k), PMA, CER), ' +
                  'tags, and the section skeleton — then version-control it.',
    );
  }, [onAskAna]);
  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-eyebrow">Workbench</div>
          <h1 className="page-title">Templates</h1>
          <div className="page-sub">
            Reusable section skeletons and boilerplate. Org-approved, version-controlled.
          </div>
        </div>
        <div className="page-actions">
          <button className="btn primary small" onClick={newTemplate}>
            {I.plus} New template
          </button>
        </div>
      </div>
      <PanelState
        rows={sourceTemplates}
        loading={live.loading}
        error={live.error}
        refresh={live.refresh}
        icon={I.template}
        title="No templates yet"
        errorTitle="Could not load the template library"
        hint="Org-approved boilerplate appears here once it is published to the library."
        action={{ label: 'New template', onAct: newTemplate }}
        testId="workbench-no-templates"
      />
      <div className="tpl-grid">
        {sourceTemplates.map(t => (
          <button
            key={t.id}
            className="tpl-card"
            onClick={() =>
              onAskAna(
                `Open template "${t.name}" — owned by ${t.owner}, ${t.uses} uses, updated ${t.updated}. ` +
                  `Show me the section skeleton and how to apply it to a program.`,
              )
            }
          >
            <div className="tpl-head">
              <span className="tpl-ico">{I.template}</span>
              <span className="tpl-uses">{t.uses} uses</span>
            </div>
            <div className="tpl-name">{t.name}</div>
            <div className="tpl-meta">
              {t.owner} · updated {t.updated}
            </div>
            <div className="tpl-tags">
              {t.tags.map(tag => (
                <span key={tag} className="tpl-tag">
                  {tag}
                </span>
              ))}
            </div>
          </button>
        ))}
      </div>
    </>
  );
}
