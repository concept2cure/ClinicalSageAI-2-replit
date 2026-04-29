/**
 * ProjectQuickSwitcher — ⌘K palette scoped to projects.
 * Mirror of design-system/ui_kits/home/ProjectsExtras.jsx (lines 516–581).
 */
import { useEffect, useState } from 'react';
import { I } from '../icons';
import type { Project } from '../types';

interface Props {
  open: boolean;
  projects: Project[];
  onPick: (id: string) => void;
  onClose: () => void;
  onCreate: (queryHint?: string) => void;
}

export function ProjectQuickSwitcher({ open, projects, onPick, onClose, onCreate }: Props) {
  const [query, setQuery] = useState('');
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (open) { setQuery(''); setIdx(0); }
  }, [open]);

  const filtered = projects.filter(p =>
    !query
      || (p.name + ' ' + p.product + ' ' + p.sponsor + ' ' + p.submissionTypeLabel)
        .toLowerCase()
        .includes(query.toLowerCase())
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setIdx(i => Math.min(filtered.length - 1, i + 1));
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setIdx(i => Math.max(0, i - 1));
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const p = filtered[idx];
        if (p) onPick(p.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, filtered, idx, onPick, onClose]);

  if (!open) return null;

  return (
    <div className="pqs" role="dialog" aria-label="Quick switch project">
      <div className="pqs-scrim" onClick={onClose} />
      <div className="pqs-shell">
        <div className="pqs-head">
          <span className="pqs-search-ico">{I.search}</span>
          <input
            className="pqs-input"
            placeholder="Jump to project — search by name, sponsor, or product…"
            value={query}
            onChange={e => { setQuery(e.target.value); setIdx(0); }}
            autoFocus
          />
          <span className="pqs-kbd">esc</span>
        </div>
        <div className="pqs-list">
          {filtered.length === 0 && (
            <div className="pqs-empty">
              No projects match "{query}".
              <button type="button" className="pqs-empty-cta" onClick={() => onCreate(query)}>
                Create "{query}" as a new project
              </button>
            </div>
          )}
          {filtered.map((p, i) => (
            <button
              type="button"
              key={p.id}
              className={`pqs-row ${i === idx ? 'is-cur' : ''}`}
              onMouseEnter={() => setIdx(i)}
              onClick={() => onPick(p.id)}
            >
              <span className="pqs-row-type">{p.submissionTypeLabel}</span>
              <div className="pqs-row-body">
                <span className="pqs-row-name">{p.name}</span>
                <span className="pqs-row-meta">{p.product} · {p.sponsor}</span>
              </div>
              {p.starred && <span className="pqs-row-star">{I.star}</span>}
              <span className="pqs-row-arrow">{I.right}</span>
            </button>
          ))}
        </div>
        <footer className="pqs-foot">
          <span className="pqs-foot-kbd">↑↓</span><span className="pqs-foot-lbl">navigate</span>
          <span className="pqs-foot-kbd">↵</span><span className="pqs-foot-lbl">open</span>
          <span className="pqs-foot-kbd">esc</span><span className="pqs-foot-lbl">close</span>
          <span className="pqs-foot-spacer" />
          <span className="pqs-foot-meta">{filtered.length} of {projects.length}</span>
        </footer>
      </div>
    </div>
  );
}
