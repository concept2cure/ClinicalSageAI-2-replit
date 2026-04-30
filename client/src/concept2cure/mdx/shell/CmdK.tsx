/**
 * ⌘K command palette — first keystroke routes:
 *   "/"  → navigate (surfaces, programs)
 *   ">"  → run a RIM tool
 *   else → ask AnA
 * Ported from Shell.jsx > CmdK.
 */

import * as React from 'react';
import { I } from '../icons';
import { ANA_MODES, ANA_TOOLS, MDX_SUGGESTIONS, type AnaMode } from '../data/nav';
import type { Program } from '../data/programs';

const NAV_ROUTES = [
  { id: 'overview',    label: 'Overview',                hint: 'Portfolio health · programs' },
  { id: 'k510',        label: '510(k) submissions',      hint: 'Predicate, SE matrix, eSTAR' },
  { id: 'pma',         label: 'PMA submissions',         hint: '10-phase workflow · modules' },
  { id: 'cer',         label: 'CER generator',           hint: 'Signals · literature · Article 61' },
  { id: 'predicate',   label: 'Precedent intelligence',  hint: 'Cross-agency patterns' },
  { id: 'tasks',       label: 'Tasks and reviews',       hint: 'Kanban + list' },
  { id: 'vault',       label: 'Document vault',          hint: 'Files · versions · audit' },
  { id: 'validation',  label: 'Validation center',       hint: 'Rules · blockers · readiness' },
  { id: 'submissions', label: 'Submission center',       hint: 'Pipeline · ESG · receipts' },
  { id: 'templates',   label: 'Templates',               hint: 'Reusable boilerplate' },
];

interface PaletteItem {
  id: string;
  label: string;
  hint: string;
  kind: 'nav' | 'tool' | 'ask' | 'suggest' | 'hint';
}

export interface CmdKProps {
  open: boolean;
  onClose: () => void;
  activeNav: string;
  program: Program | null;
  setActiveNav: (id: string) => void;
  onAskAna: (text: string, opts?: { tool?: string }) => void;
  mode: AnaMode['id'];
  setMode: (m: AnaMode['id']) => void;
}

export function CmdK({
  open,
  onClose,
  activeNav,
  program,
  setActiveNav,
  onAskAna,
  mode,
  setMode,
}: CmdKProps) {
  const [q, setQ] = React.useState('');
  const [sel, setSel] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    if (open) {
      setQ('');
      setSel(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const promptMode: 'nav' | 'tool' | 'ask' | 'mixed' = q.startsWith('/')
    ? 'nav'
    : q.startsWith('>')
    ? 'tool'
    : q.trim()
    ? 'ask'
    : 'mixed';
  const term = q.replace(/^[/>]\s?/, '').toLowerCase();

  const items: PaletteItem[] = React.useMemo(() => {
    if (promptMode === 'nav') {
      return NAV_ROUTES.filter(
        r =>
          !term ||
          r.label.toLowerCase().includes(term) ||
          r.hint.toLowerCase().includes(term),
      ).map(r => ({ ...r, kind: 'nav' as const }));
    }
    if (promptMode === 'tool') {
      return ANA_TOOLS.filter(
        t =>
          !term ||
          t.label.toLowerCase().includes(term) ||
          t.desc.toLowerCase().includes(term) ||
          t.group.toLowerCase().includes(term),
      ).map(t => ({
        id: t.id,
        label: t.label,
        hint: `${t.group} · ${t.desc}`,
        kind: 'tool' as const,
      }));
    }
    const activeMode = ANA_MODES.find(m => m.id === mode)!;
    if (promptMode === 'ask') {
      return [
        {
          id: 'ask',
          label: `Ask AnA: "${q.trim()}"`,
          hint: `Runs in ${activeMode.label} · ${activeMode.model}`,
          kind: 'ask' as const,
        },
        ...(MDX_SUGGESTIONS[activeNav] || []).map((s, i) => ({
          id: `sg-${i}`,
          label: s,
          hint: 'Suggested for this surface',
          kind: 'suggest' as const,
        })),
      ];
    }
    return [
      ...(MDX_SUGGESTIONS[activeNav] || []).slice(0, 3).map((s, i) => ({
        id: `sg-${i}`,
        label: s,
        hint: 'Suggested for this surface',
        kind: 'suggest' as const,
      })),
      { id: 'hint-nav',  label: 'Type "/" to jump to a surface',                    hint: 'Navigation', kind: 'hint' as const },
      { id: 'hint-tool', label: 'Type ">" to run a RIM tool',                       hint: 'Tools',      kind: 'hint' as const },
      { id: 'hint-ask',  label: 'Or just type a question — AnA routes via gateway', hint: 'Ask',        kind: 'hint' as const },
    ];
  }, [q, promptMode, term, activeNav, mode]);

  const run = (item: PaletteItem | undefined) => {
    if (!item) return;
    if (item.kind === 'nav')          setActiveNav(item.id);
    else if (item.kind === 'tool')    onAskAna(`>${item.id}`, { tool: item.id });
    else if (item.kind === 'ask')     onAskAna(q.trim());
    else if (item.kind === 'suggest') onAskAna(item.label);
    else if (item.kind === 'hint')    return;
    onClose();
  };

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSel(s => Math.min(s + 1, items.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSel(s => Math.max(s - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        run(items[sel]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, items, sel]);

  if (!open) return null;
  const activeMode = ANA_MODES.find(m => m.id === mode)!;

  return (
    <div className="cmdk-backdrop" onClick={onClose} role="dialog" aria-label="Command palette">
      <div className="cmdk" onClick={e => e.stopPropagation()}>
        <div className="cmdk-input-row">
          <span className="cmdk-leading">{I.search}</span>
          <input
            ref={inputRef}
            className="cmdk-input"
            value={q}
            onChange={e => {
              setQ(e.target.value);
              setSel(0);
            }}
            placeholder='Ask AnA, "/" to navigate, ">" for a tool…'
          />
          <div
            className="cmdk-mode-chip"
            title={`${activeMode.label} · ${activeMode.model}`}
          >
            <span className="dot" />
            {activeMode.label}
          </div>
        </div>

        <div className="cmdk-context">
          {program ? (
            <>
              <span className="lbl">Context</span>{' '}
              <span className="val">
                {program.code} · {program.title}
              </span>
            </>
          ) : (
            <>
              <span className="lbl">Context</span>{' '}
              <span className="val">Medical Device and Diagnostics · {activeNav}</span>
            </>
          )}
        </div>

        <div className="cmdk-list" role="listbox">
          {items.map((item, i) => (
            <button
              key={item.id}
              className={`cmdk-item${sel === i ? ' on' : ''}`}
              role="option"
              aria-selected={sel === i}
              onMouseEnter={() => setSel(i)}
              onClick={() => run(item)}
            >
              <span className="cmdk-kind" data-kind={item.kind}>
                {item.kind === 'nav'     && I.arrowRight}
                {item.kind === 'tool'    && I.zap}
                {item.kind === 'ask'     && I.sparkles}
                {item.kind === 'suggest' && I.sparkles}
                {item.kind === 'hint'    && I.help}
              </span>
              <span className="cmdk-label">{item.label}</span>
              <span className="cmdk-hint">{item.hint}</span>
            </button>
          ))}
        </div>

        <div className="cmdk-foot">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> navigate
          </span>
          <span>
            <kbd>↵</kbd> select
          </span>
          <span>
            <kbd>esc</kbd> close
          </span>
          <div className="cmdk-foot-spacer" />
          <span>
            Mode:{' '}
            {ANA_MODES.map(m => (
              <button
                key={m.id}
                className={`cmdk-mode-btn${mode === m.id ? ' on' : ''}`}
                onClick={() => setMode(m.id)}
                title={`${m.desc} · routes to ${m.model}`}
              >
                {m.label}
              </button>
            ))}
          </span>
        </div>
      </div>
    </div>
  );
}
