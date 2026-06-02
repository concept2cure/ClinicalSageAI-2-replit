(() => {
const { PdevI: I } = window;

const POOL = [
  { id: 'ev-3001', title: 'Vorelinib rat plasma PK · GLP run 11', type: 'study-data', category: 'nonclinical', source: 'In-vivo lab' },
  { id: 'ev-3002', title: 'Vorelinib rat brain TK · GLP run 12', type: 'study-data', category: 'nonclinical', source: 'In-vivo lab' },
  { id: 'ev-3003', title: 'Hepatocellular vacuolation findings', type: 'finding', category: 'nonclinical', source: 'Pathology' },
  { id: 'ev-3004', title: 'ICH M3(R2) §5.1 duration guidance', type: 'reference', category: 'regulatory', source: 'ICH' },
  { id: 'ev-3014', title: 'Dexcom G7 predicate clearance K221847', type: 'precedent', category: 'regulatory', source: 'FDA database' },
  { id: 'ev-3022', title: 'In-vitro hERG IC50 measurement', type: 'study-data', category: 'nonclinical', source: 'Safety pharm lab' },
];

function PdevEvidencePicker({ activity, onClose, openConfirm }) {
  const [selected, setSelected] = React.useState(null);
  const [linkType, setLinkType] = React.useState('supports');
  const [strength, setStrength] = React.useState('strong');
  const [rationale, setRationale] = React.useState('');
  const [query, setQuery] = React.useState('');

  if (!activity) return null;
  const visible = POOL.filter(e => !query || e.title.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="pdev-sheet-backdrop" onClick={onClose}>
      <aside className="pdev-sheet" onClick={e => e.stopPropagation()}>
        <div className="pdev-sheet-head">
          <div>
            <div className="pdev-sheet-eyebrow">Attach evidence · governed</div>
            <div className="pdev-sheet-title">Attach to {activity.key}</div>
          </div>
          <button className="pdev-sheet-close" onClick={onClose}>{I.close}</button>
        </div>

        <div className="pdev-sheet-body">
          <div className="pdev-search-input">
            <span className="ico">{I.search}</span>
            <input placeholder="Search evidence objects…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>

          <div className="pdev-evidence-list">
            {visible.map(e => (
              <button key={e.id} className="pdev-evidence-pick-row" data-on={selected?.id === e.id} onClick={() => setSelected(e)}>
                <div className="pdev-evidence-pick-body">
                  <div className="pdev-evidence-title">{e.title}</div>
                  <div className="pdev-evidence-meta mono small">{e.type} · {e.category} · {e.source}</div>
                </div>
                {selected?.id === e.id && <span className="ico">{I.check}</span>}
              </button>
            ))}
          </div>

          {selected && (
            <>
              <div className="pdev-sheet-section">
                <div className="lbl">Link type</div>
                <div className="pdev-seg">
                  {['supports','contradicts','references','supersedes'].map(t => (
                    <button key={t} className="pdev-seg-btn" data-on={linkType === t} onClick={() => setLinkType(t)}>{t}</button>
                  ))}
                </div>
              </div>
              <div className="pdev-sheet-section">
                <div className="lbl">Strength</div>
                <div className="pdev-seg">
                  {['strong','moderate','weak'].map(s => (
                    <button key={s} className="pdev-seg-btn" data-on={strength === s} onClick={() => setStrength(s)}>{s}</button>
                  ))}
                </div>
              </div>
              <div className="pdev-sheet-section">
                <div className="lbl">Rationale</div>
                <textarea rows={3} placeholder="Why this evidence applies here…" value={rationale} onChange={(e) => setRationale(e.target.value)} />
              </div>
            </>
          )}
        </div>

        <div className="pdev-sheet-foot">
          <button className="pdev-btn ghost" onClick={onClose}>Cancel</button>
          <button className="pdev-btn primary" disabled={!selected} onClick={() => openConfirm({
            action: 'Attach evidence',
            target: `${selected?.id} → ${activity.key} (${linkType}, ${strength})`,
            resource: activity.key,
            minReason: 10,
            confirmWord: 'yes',
          })}>{I.link} Attach</button>
        </div>
      </aside>
    </div>
  );
}

window.PdevEvidencePicker = PdevEvidencePicker;
})();
