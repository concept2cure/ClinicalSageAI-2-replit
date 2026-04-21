import { useEffect, useMemo, useRef, useState } from 'react';
import { HomeIcon, type IconName } from './icons';
import { NAV_ITEMS } from './data';
import styles from './styles.module.css';

export interface PaletteItem {
  kind: 'Ask AnA' | 'Module' | 'Recent';
  id: string;
  label: string;
  icon: IconName;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onNavigate: (item: PaletteItem) => void;
}

const ASK_ANA: PaletteItem[] = [
  { kind: 'Ask AnA', id: 'ana.draft25',  label: 'Draft CTD Section 2.5',      icon: 'file' },
  { kind: 'Ask AnA', id: 'ana.510k',     label: 'Find 510(k) predicates',     icon: 'search' },
  { kind: 'Ask AnA', id: 'ana.sap',      label: 'Review biostat SAP',         icon: 'flask' },
  { kind: 'Ask AnA', id: 'ana.ready',    label: 'Submission readiness check', icon: 'clip' },
  { kind: 'Ask AnA', id: 'ana.cross',    label: 'Cross-agency precedent',     icon: 'globe' },
];

const RECENT_ITEMS: PaletteItem[] = [
  { kind: 'Recent', id: 'r.25',  label: 'NDA 212345 · §2.5 Clinical overview', icon: 'pencil' },
  { kind: 'Recent', id: 'r.510', label: '510(k) predicate search — Q1',        icon: 'search' },
  { kind: 'Recent', id: 'r.ema', label: 'EMA scientific advice prep',          icon: 'globe' },
];

const SECTION_ORDER: PaletteItem['kind'][] = ['Ask AnA', 'Module', 'Recent'];

export function CommandPalette({ open, onClose, onNavigate }: Props) {
  const [q, setQ] = useState('');
  const [focusIdx, setFocusIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const pool = useMemo<PaletteItem[]>(() => {
    const nav: PaletteItem[] = NAV_ITEMS.map(n => ({
      kind: 'Module', id: n.id, label: n.label, icon: n.icon,
    }));
    return [...nav, ...ASK_ANA, ...RECENT_ITEMS];
  }, []);

  const filtered = useMemo(() => {
    if (!q.trim()) return pool;
    const ql = q.toLowerCase();
    return pool.filter(p => p.label.toLowerCase().includes(ql) || p.kind.toLowerCase().includes(ql));
  }, [q, pool]);

  const grouped = useMemo(() => {
    const g: Partial<Record<PaletteItem['kind'], PaletteItem[]>> = {};
    filtered.forEach(f => { (g[f.kind] = g[f.kind] ?? []).push(f); });
    return g;
  }, [filtered]);

  const flat = useMemo(() => {
    const out: PaletteItem[] = [];
    SECTION_ORDER.forEach(k => { (grouped[k] ?? []).forEach(it => out.push(it)); });
    return out;
  }, [grouped]);

  useEffect(() => {
    if (open) {
      setQ('');
      setFocusIdx(0);
      const t = window.setTimeout(() => inputRef.current?.focus(), 40);
      return () => window.clearTimeout(t);
    }
  }, [open]);

  useEffect(() => { setFocusIdx(0); }, [q]);

  if (!open) return null;

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusIdx(i => Math.min(flat.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusIdx(i => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const it = flat[focusIdx];
      if (it) { onNavigate(it); onClose(); }
    }
  };

  return (
    <div className={styles.paletteBackdrop} onClick={onClose}>
      <div className={styles.palette} onClick={e => e.stopPropagation()} role="dialog" aria-label="Command palette">
        <div className={styles.paletteInputRow}>
          <span className={styles.ico}><HomeIcon name="search" size={16} /></span>
          <input
            ref={inputRef}
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Ask AnA, jump to a module, search recents…"
          />
          <kbd>Esc</kbd>
        </div>
        <div className={styles.paletteList}>
          {flat.length === 0 && (
            <div className={styles.paletteEmpty}>No matches for "{q}"</div>
          )}
          {SECTION_ORDER.map(section => {
            const items = grouped[section];
            if (!items || items.length === 0) return null;
            return (
              <div key={section}>
                <div className={styles.paletteSection}>{section}</div>
                {items.map(it => {
                  const globalIdx = flat.indexOf(it);
                  const focused = globalIdx === focusIdx;
                  return (
                    <button
                      type="button"
                      key={it.id}
                      className={styles.paletteItem}
                      data-focused={focused || undefined}
                      onMouseEnter={() => setFocusIdx(globalIdx)}
                      onClick={() => { onNavigate(it); onClose(); }}
                    >
                      <span className={styles.pIco}><HomeIcon name={it.icon} size={16} /></span>
                      <span className={styles.pLabel}>{it.label}</span>
                      <span className={styles.pHint}>
                        {it.kind === 'Module' ? 'Open' : it.kind === 'Ask AnA' ? '↵ Ask' : 'Resume'}
                      </span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
        <div className={styles.paletteFoot}>
          <span><kbd>↑↓</kbd>navigate</span>
          <span><kbd>↵</kbd>select</span>
          <span><kbd>Esc</kbd>close</span>
        </div>
      </div>
    </div>
  );
}
