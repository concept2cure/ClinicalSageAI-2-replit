/**
 * ProjectInternalSearch — Cmd+F overlay, scoped to one project.
 * Mirror of design-system/ui_kits/home/ProjectsExtras.jsx (lines 661–732).
 */
import { useEffect, useMemo, useState } from 'react';
import { I } from '../icons';
import type { Project, DetailTab } from '../types';

interface SearchResult {
  kind: 'chat' | 'file' | 'memory' | 'instr';
  tab: DetailTab;
  label: string;
  sub: string;
}

interface Props {
  open: boolean;
  project: Project | null | undefined;
  onClose: () => void;
  onJump: (tab: DetailTab) => void;
}

export function ProjectInternalSearch({ open, project, onClose, onJump }: Props) {
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (open) { setQ(''); setIdx(0); }
  }, [open]);

  const learnings: import('../types').MemoryLearning[] = [];

  const results = useMemo<SearchResult[]>(() => {
    if (!project || !q) return [];
    const out: SearchResult[] = [];
    const ql = q.toLowerCase();
    project.chats.forEach(c => {
      if (c.title.toLowerCase().includes(ql)) {
        out.push({ kind: 'chat', tab: 'chats', label: c.title, sub: 'Chat · last ' + c.last });
      }
    });
    project.files.forEach(f => {
      if (f.name.toLowerCase().includes(ql)) {
        out.push({
          kind: 'file',
          tab: 'files',
          label: f.name,
          sub: 'File · ' + (f.lines || '?') + ' lines · ' + f.kind,
        });
      }
    });
    learnings.forEach(l => {
      if (l.text.toLowerCase().includes(ql) || l.kind.toLowerCase().includes(ql)) {
        out.push({
          kind: 'memory',
          tab: 'memory',
          label: l.text,
          sub: 'Memory · ' + l.kind + ' · ' + l.when,
        });
      }
    });
    if (project.instructions && project.instructions.toLowerCase().includes(ql)) {
      out.push({
        kind: 'instr',
        tab: 'instructions',
        label: 'Project instructions',
        sub: 'Instructions · ' + project.instructions.length + ' chars',
      });
    }
    if (project.memory?.summary && project.memory.summary.toLowerCase().includes(ql)) {
      out.push({
        kind: 'memory',
        tab: 'memory',
        label: 'Memory summary',
        sub: 'Memory · updated ' + project.memory.updated,
      });
    }
    return out;
  }, [project, q, learnings]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setIdx(i => Math.min(results.length - 1, i + 1));
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setIdx(i => Math.max(0, i - 1));
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const r = results[idx];
        if (r) onJump(r.tab);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, results, idx, onJump, onClose]);

  const groups = useMemo(() => {
    const g: Record<string, SearchResult[]> = {};
    for (const r of results) (g[r.kind] = g[r.kind] || []).push(r);
    return Object.entries(g);
  }, [results]);

  if (!open || !project) return null;

  return (
    <div className="pis" role="dialog" aria-label="Search this project">
      <div className="pis-scrim" onClick={onClose} />
      <div className="pis-shell">
        <div className="pis-head">
          <span className="pis-ico">{I.search}</span>
          <input
            className="pis-input"
            autoFocus
            placeholder={`Search ${project.name} — chats, files, memory, instructions…`}
            value={q}
            onChange={e => { setQ(e.target.value); setIdx(0); }}
          />
          <span className="pis-kbd">esc</span>
        </div>
        <div className="pis-list">
          {!q && (
            <div className="pis-hint">
              Start typing to search across chats, files, memory, and instructions in this project. Results group by kind.
            </div>
          )}
          {q && results.length === 0 && (
            <div className="pis-empty">No results in this project for "{q}".</div>
          )}
          {groups.map(([kind, items]) => (
            <section key={kind} className="pis-group">
              <header className="pis-group-h">
                {kind === 'chat' ? 'Chats'
                  : kind === 'file' ? 'Files'
                  : kind === 'memory' ? 'Memory'
                  : 'Instructions'} · {items.length}
              </header>
              {items.map(r => {
                const flat = results.indexOf(r);
                return (
                  <button
                    type="button"
                    key={`${kind}-${flat}`}
                    className={`pis-row ${flat === idx ? 'is-cur' : ''}`}
                    onMouseEnter={() => setIdx(flat)}
                    onClick={() => onJump(r.tab)}
                  >
                    <span className="pis-row-kind">{r.kind}</span>
                    <div className="pis-row-body">
                      <div className="pis-row-label">{r.label}</div>
                      <div className="pis-row-sub">{r.sub}</div>
                    </div>
                    <span className="pis-row-arrow">{I.right}</span>
                  </button>
                );
              })}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
