(() => {
const { PdevI: I } = window;

function PdevAiDraftSheet({ activity, doc, onClose, openConfirm }) {
  const [prompt, setPrompt] = React.useState('');
  const [streaming, setStreaming] = React.useState(false);
  const [draft, setDraft] = React.useState(null);

  if (!activity) return null;

  const generate = () => {
    setStreaming(true);
    setTimeout(() => {
      setStreaming(false);
      setDraft({
        title: doc?.title || `Draft · ${activity.title}`,
        sections: [
          { num: '1', label: 'Background', preview: 'Vorelinib is a selective KIT-mutant inhibitor under development for…' },
          { num: '2', label: 'Methodology', preview: 'GLP study conducted per ICH M3(R2) §5.1 with 28-day repeat-dose…' },
          { num: '3', label: 'Results', preview: 'NOAEL determined at 50 mg/kg/day in rats. Hepatocellular vacuolation…' },
          { num: '4', label: 'Discussion', preview: 'Vacuolation appears reversible based on recovery cohort. FIH dose…' },
          { num: '5', label: 'Conclusion', preview: 'Toxicology profile supports a Phase 1 starting dose of 50 mg/kg…' },
        ],
        citations: 14,
        grade: 'A',
        model: 'Opus 4.5',
      });
    }, 1400);
  };

  return (
    <div className="pdev-sheet-backdrop" onClick={onClose}>
      <aside className="pdev-sheet pdev-sheet-wide" onClick={e => e.stopPropagation()}>
        <div className="pdev-sheet-head">
          <div>
            <div className="pdev-sheet-eyebrow">AI drafting workbench · governed</div>
            <div className="pdev-sheet-title">Draft {doc?.title || activity.title}</div>
          </div>
          <button className="pdev-sheet-close" onClick={onClose}>{I.close}</button>
        </div>

        <div className="pdev-aidraft-grid">
          <div className="pdev-aidraft-left">
            <div className="pdev-sheet-section">
              <div className="lbl">Context</div>
              <div className="val mono small">{activity.key}{doc && ` · ${doc.ectd}`}</div>
            </div>
            <div className="pdev-sheet-section">
              <div className="lbl">Target document</div>
              <div className="val">{doc?.title || 'Activity-level summary'}</div>
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
            <div className="pdev-sheet-section">
              <div className="lbl">Evidence sources</div>
              <div className="pdev-aidraft-evidence">
                <div className="pdev-aidraft-ev-row"><span className="pdev-link-pill pdev-link-supports">supports</span><span>GLP run 11 plasma PK</span></div>
                <div className="pdev-aidraft-ev-row"><span className="pdev-link-pill pdev-link-supports">supports</span><span>GLP run 12 brain TK</span></div>
                <div className="pdev-aidraft-ev-row"><span className="pdev-link-pill pdev-link-contradicts">contradicts</span><span>Hepatocellular vacuolation</span></div>
                <div className="pdev-aidraft-ev-row"><span className="pdev-link-pill pdev-link-references">references</span><span>ICH M3(R2) §5.1</span></div>
              </div>
            </div>
            <button className="pdev-btn primary" onClick={generate} disabled={streaming}>
              {streaming ? 'Drafting…' : <>{I.sparkles} Generate draft</>}
            </button>
          </div>

          <div className="pdev-aidraft-right">
            {!draft && !streaming && <div className="pdev-empty">Streaming preview will appear here after Generate.</div>}
            {streaming && <div className="pdev-aidraft-streaming">Streaming from Opus 4.5…</div>}
            {draft && (
              <>
                <div className="pdev-aidraft-grade">
                  <span className={`pdev-grade-pill pdev-grade-${draft.grade.toLowerCase()}`}>Quality gate: {draft.grade}</span>
                  <span className="mono small">{draft.citations} citations · {draft.model}</span>
                </div>
                <div className="pdev-aidraft-title">{draft.title}</div>
                {draft.sections.map(s => (
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
          <button className="pdev-btn ghost" onClick={onClose}>Discard</button>
          <button className="pdev-btn primary" disabled={!draft} onClick={() => openConfirm({
            action: 'File draft and advance activity',
            target: `${activity.key} · ai_draft_generated`,
            resource: activity.key,
            minReason: 10,
            confirmWord: 'yes',
          })}>{I.check} File draft and advance</button>
        </div>
      </aside>
    </div>
  );
}

window.PdevAiDraftSheet = PdevAiDraftSheet;
})();
