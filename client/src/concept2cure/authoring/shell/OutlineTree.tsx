/**
 * Universal Authoring — outline tree (left column, shared by both modes).
 * Port of ui_kits/authoring/OutlineTree.jsx.
 *
 * @module client/src/concept2cure/authoring/shell/OutlineTree
 */

import * as React from 'react';
import { I } from '../icons';
import { countLeaves, type AuthSection } from '../data';

function StatusDot({ status }: { status?: string }) {
  const cls =
    status === 'approved' ? 'ok' :
    status === 'review' ? 'review' :
    status === 'drafted' ? 'draft' :
    status === 'locked' ? 'locked' :
    status === 'fail' ? 'fail' :
    'todo';
  return <span className={`dot ${cls}`} />;
}

function OutlineLeaf({ node, activeId, onPick }: { node: AuthSection; activeId: string; onPick: (id: string) => void }) {
  return (
    <div className="au-tree-leaf" data-active={node.id === activeId || undefined} onClick={() => onPick(node.id)}>
      <StatusDot status={node.status || 'todo'} />
      <span className="path">{node.path}</span>
      <span className="label">{node.label}</span>
      {node.owner && <span className="owner" title={`Owner ${node.owner}`}>{node.owner}</span>}
    </div>
  );
}

function OutlineGroup({ node, activeId, onPick, defaultOpen = true }: { node: AuthSection; activeId: string; onPick: (id: string) => void; defaultOpen?: boolean }) {
  const [open, setOpen] = React.useState(defaultOpen);
  const counts = React.useMemo(() => countLeaves(node.children || []), [node]);
  const total = counts.todo + counts.drafted + counts.review + counts.approved + counts.locked + counts.fail;
  const ready = counts.approved + counts.locked;
  return (
    <div className="au-tree-grp" data-open={open}>
      <div className="au-tree-grp-head" onClick={() => setOpen((o) => !o)}>
        <span className="chev">{I.chevronDn}</span>
        <span className="path">{node.path}</span>
        <span>{node.label}</span>
        {total > 0 && <span className="meta">{ready}/{total}</span>}
      </div>
      <div className="au-tree-grp-body">
        {(node.children || []).map((c) =>
          c.children
            ? <OutlineGroup key={c.id} node={c} activeId={activeId} onPick={onPick} defaultOpen={false} />
            : <OutlineLeaf key={c.id} node={c} activeId={activeId} onPick={onPick} />,
        )}
      </div>
    </div>
  );
}

function ReadinessFoot({ outline, version, state }: { outline: AuthSection[]; version: string; state: string }) {
  const counts = React.useMemo(() => countLeaves(outline), [outline]);
  const total = Math.max(1, counts.todo + counts.drafted + counts.review + counts.approved + counts.locked + counts.fail);
  const ready = counts.approved + counts.locked;
  const pct = Math.round((ready / total) * 100);
  return (
    <div className="au-tree-foot">
      <div className="row">
        <span className="label">Submission readiness</span>
        <span style={{ fontSize: 10, color: 'var(--text-400)', fontWeight: 600 }}>{state}</span>
      </div>
      <div className="row" style={{ alignItems: 'baseline' }}>
        <span className="pct">{pct}%</span>
        <span style={{ fontSize: 11, color: 'var(--text-400)' }}>{ready}/{total} sections</span>
      </div>
      <div className="bar"><div className="fill" style={{ width: pct + '%' }} /></div>
      <div className="row" style={{ marginTop: 8, fontSize: 11 }}>
        <span style={{ color: 'var(--text-400)' }}>Version</span>
        <span style={{ color: 'var(--text-100)', fontWeight: 500 }}>{version}</span>
      </div>
    </div>
  );
}

export interface OutlineTreeProps {
  outline: AuthSection[];
  activeId: string;
  onPick: (id: string) => void;
  version: string;
  state: string;
}

export function OutlineTree({ outline, activeId, onPick, version, state }: OutlineTreeProps) {
  const [q, setQ] = React.useState('');
  const filtered = React.useMemo(() => {
    if (!q.trim()) return outline;
    const needle = q.toLowerCase();
    const filterTree = (nodes: AuthSection[]): AuthSection[] =>
      nodes
        .map((n): AuthSection | null => {
          if (n.children) {
            const kids = filterTree(n.children);
            if (kids.length) return { ...n, children: kids };
            if (n.label.toLowerCase().includes(needle)) return n;
            return null;
          }
          return n.label.toLowerCase().includes(needle) || (n.path || '').toLowerCase().includes(needle) ? n : null;
        })
        .filter((n): n is AuthSection => Boolean(n));
    return filterTree(outline);
  }, [outline, q]);

  return (
    <aside className="au-tree" data-screen-label="Authoring · outline">
      <div className="au-tree-head">
        <span className="label">Outline</span>
        <span className="meta">Rule pack</span>
      </div>
      <div className="au-tree-search">
        <span style={{ display: 'inline-flex' }}>{I.search}</span>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find section" />
      </div>
      {filtered.length === 0
        ? <div style={{ padding: '10px 6px', color: 'var(--text-400)', fontSize: 12 }}>No matching sections.</div>
        : filtered.map((n) =>
            n.children
              ? <OutlineGroup key={n.id} node={n} activeId={activeId} onPick={onPick} />
              : <OutlineLeaf key={n.id} node={n} activeId={activeId} onPick={onPick} />,
          )}
      <ReadinessFoot outline={outline} version={version} state={state} />
    </aside>
  );
}
