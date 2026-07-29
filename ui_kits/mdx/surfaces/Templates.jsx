/**
 * Templates browser (medtech corpus) — Phase 5 · doc-first.
 *
 * Replaces the generic TemplatesSurface in Workbench.tsx. Section
 * skeletons + boilerplate for every regulatory artifact Phase 4
 * introduces (eSTAR, SRS, RMF, IFU, MDR-3500A, CAPA, FSCA, PSUR, QMS).
 */

(() => {

const { I, DocumentsPanel } = window;
const { TPL_FRAMEWORKS, TEMPLATES } = window;

function TemplatesSurface({ onAskAna, onOpenEditor }) {
  const totalUses = TEMPLATES.reduce((s, t) => s + (t.uses || 0), 0);

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-eyebrow">Workbench</div>
          <h1 className="page-title">Templates</h1>
          <div className="page-sub">
            Org-approved section skeletons + boilerplate for every regulatory artifact.
            {TEMPLATES.length} templates · {totalUses} uses across the portfolio · version-controlled.
          </div>
        </div>
        <div className="page-actions">
          <button className="btn ghost small" onClick={() => onAskAna('Find a similar template — describe what I want to author and surface the closest match from the org corpus.')}>
            {I.search} Find template
          </button>
          <button className="btn primary small" onClick={() => onAskAna('Create a new org-approved template. Confirm name, owner, applicable pathways (510(k), PMA, CER, eng, udi, pv, qms), tags, and the section skeleton — then version-control it.')}>
            {I.plus} New template
          </button>
        </div>
      </div>

      <div className="metrics-row metrics-compact">
        <div className="metric-card">
          <div className="metric-label">Templates</div>
          <div className="metric-val">{TEMPLATES.length}</div>
          <div className="metric-meta">Across 7 frameworks · {TEMPLATES.filter(t => t.status === 'ready').length} ready</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Total uses</div>
          <div className="metric-val">{totalUses}</div>
          <div className="metric-meta">Lifetime · top: {Math.max(...TEMPLATES.map(t => t.uses))}× ({TEMPLATES.find(t => t.uses === Math.max(...TEMPLATES.map(t => t.uses))).type})</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Top framework</div>
          <div className="metric-val">{TPL_FRAMEWORKS.find(f => f.id === '510k') ? '510(k)' : 'eng'}</div>
          <div className="metric-meta">{TEMPLATES.filter(t => t.framework === 'k510').length} templates · most used</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Last edit</div>
          <div className="metric-val" style={{ fontSize: 18 }}>{TEMPLATES.sort((a, b) => a.lastEdit.localeCompare(b.lastEdit))[0]?.lastEdit || '—'}</div>
          <div className="metric-meta">Across all templates · oldest version control</div>
        </div>
      </div>

      <DocumentsPanel
        title="Templates · medtech corpus"
        subtitle="Tap any template to open in the editor as a new artifact · sparkle to ask AnA to apply it to a specific program"
        docs={TEMPLATES}
        frameworks={TPL_FRAMEWORKS}
        onOpenEditor={onOpenEditor}
        onAskAna={onAskAna}
      />
    </>
  );
}

window.TemplatesSurface = TemplatesSurface;

})();
