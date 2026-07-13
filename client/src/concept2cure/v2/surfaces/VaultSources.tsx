/**
 * Vault sources UI -- SourceBar, DmsSearch, FileExplorer, VaultProjectStrip.
 *
 * Ported from kit vault-sources.jsx. Data and helpers live in
 * ../fixtures/vault-sources-data.ts; this file holds only React components.
 */

import React, { useState, useMemo, useEffect } from 'react';
import { I } from '../icons';
import { useLive, SampleTag } from '../dataConnect';
import {
  VAULT_SOURCES,
  vaultSourceConnected,
  feIsDoc,
  feFlatten,
  feFileIcon,
  feSt,
  type VaultSource,
  type Spine,
  type SpineNode,
  type SpineDoc,
} from '../fixtures/vault-sources-data';

/* ── Source icon resolver ── */

function srcIcon(kind: string): React.ReactNode {
  if (kind === 'veeva') return (I as any).vault || I.database || I.folder;
  if (kind === 'sharepoint') return I.grid || I.folder;
  if (kind === 'onedrive') return I.cloud || I.upload;
  if (kind === 'gdrive') return I.cloud || I.folder;
  return I.database || I.search;
}

(window as any)._vaultSrcIcon = srcIcon;

/* ── SourceBar ── */

interface SourceBarProps {
  searchPlaceholder?: string;
  onSearch?: (q: string) => void;
  standardLabel?: string;
  filingLabel?: string;
}

export function SourceBar({ searchPlaceholder, onSearch, standardLabel, filingLabel }: SourceBarProps) {
  const [q, setQ] = useState('');
  const [panel, setPanel] = useState<string | null>(null);
  const sources = VAULT_SOURCES;
  const active = sources.find((s) => s.id === panel) || null;
  const submit = () => { if (onSearch) onSearch(q); };

  return (
    <div className="vsrc-wrap">
      <div className="vsrc-bar">
        <div className="vsrc-search">
          <span className="ic">{I.search}</span>
          <input
            value={q}
            onChange={(e) => { setQ(e.target.value); if (onSearch) onSearch(e.target.value); }}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
            placeholder={searchPlaceholder || 'Search across the Vault and connected sources…'}
          />
          {q && <button className="vsrc-x" onClick={() => { setQ(''); if (onSearch) onSearch(''); }}>{I.close || '×'}</button>}
        </div>
        {(standardLabel || filingLabel) && (
          <div className="vsrc-desig" title="Structure adapts to the client segment and the project's filing designation">
            {I.layers || I.grid} <b>{standardLabel}</b>{filingLabel ? <> · {filingLabel}</> : null}
          </div>
        )}
      </div>
      <div className="vsrc-chips">
        <span className="vsrc-chips-lbl">Sources</span>
        {sources.map((s) => {
          const on = vaultSourceConnected(s);
          return (
            <button key={s.id} className={'vsrc-chip' + (s.gap ? ' gap' : (on ? ' on' : ''))} title={s.desc}
              onClick={() => { setPanel(panel === s.id ? null : s.id); }}>
              <span className="vsrc-cic">{srcIcon(s.kind)}</span>
              <span className="vsrc-cl">{s.label}</span>
              <span className={'vsrc-cst' + (s.gap ? ' gap' : (on ? ' on' : ''))}>{s.gap ? 'Not available' : on ? 'Connected' : 'Connect'}</span>
            </button>
          );
        })}
      </div>
      {active && (
        <div className="vsrc-panel">
          <div className="vsrc-panel-h">
            <span className="vsrc-cic">{srcIcon(active.kind)}</span>
            <b>{active.label}</b>
            <span className={'vsrc-cst' + (active.gap ? ' gap' : (vaultSourceConnected(active) ? ' on' : ''))}>
              {active.gap ? 'No backend connector' : vaultSourceConnected(active) ? 'Connected' : 'Not linked'}
            </span>
            <button className="vsrc-x" onClick={() => { setPanel(null); }}>{I.close || '×'}</button>
          </div>
          <div className="vsrc-panel-b">{active.desc}</div>
          {active.gap ? (
            <div className="vsrc-gap">{I.alertTriangle} Google Drive is not wired in the platform yet. I can flag it as a requested connector — I won't pretend it's connected.</div>
          ) : active.native ? (
            <div className="vsrc-flow">Semantic search runs live over this project's corpus. Upload new documents and AnA classifies them into the dossier structure.</div>
          ) : (
            <div className="vsrc-flow">
              {vaultSourceConnected(active)
                ? <>Search {active.label} and import documents. On import AnA runs <b>detect → classify to the dossier structure → findings</b>, then you approve to file them as governed artifacts <span className="vsrc-ep">POST /api/mdx/imports</span>.</>
                : <>Link your {active.label} account to search and import. Import runs <b>detect → classify → approve</b> into governed artifacts <span className="vsrc-ep">POST /api/mdx/imports</span>.</>}
            </div>
          )}
          {/* window.openAna (opens the AnA rail) has no typed provider and
              SourceBar takes no onAsk prop; GAP RULE — optional call stays. */}
          <div className="vsrc-panel-acts">
            {active.gap ? (
              <button className="btn ghost sm" onClick={() => { ((window as any).openAna || (() => {}))('Flag Google Drive as a requested Vault connector for our org.'); }}>{I.flag || I.plus} Request this connector</button>
            ) : active.native ? (
              <button className="btn primary sm" onClick={() => { ((window as any).openAna || (() => {}))('Upload documents to the Vault and index them for semantic search.'); }}>{I.upload} Upload to Vault</button>
            ) : vaultSourceConnected(active) ? (
              <button className="btn primary sm" onClick={() => { ((window as any).openAna || (() => {}))('Search ' + active.label + ' and import matching documents into this project.'); }}>{I.search} Search &amp; import</button>
            ) : (
              <button className="btn primary sm" onClick={() => { ((window as any).openAna || (() => {}))('Connect our ' + active.label + ' account to the Vault.'); }}>{I.link || I.plus} Connect {active.label}</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

(window as any).SourceBar = SourceBar;

/* ── DmsSearch ── */

interface DmsDoc {
  url?: string;
  connector: string;
  title: string;
  summary?: string;
  relevanceScore?: number;
}

interface DmsSkipped {
  connector: string;
  reason: string;
}

interface DmsResult {
  documents: DmsDoc[];
  skipped: DmsSkipped[];
  sample?: boolean;
}

interface DmsSearchProps {
  q?: string;
  onNav?: (target: string) => void;
}

export function DmsSearch({ q, onNav }: DmsSearchProps) {
  const [res, setRes] = useState<DmsResult | null>(null);
  const [loading, setLoading] = useState(false);
  const query = (q || '').trim();

  useEffect(() => {
    if (!query) { setRes(null); return; }
    let cancel = false;
    setLoading(true);
    const t = setTimeout(() => {
      /* window.C2C_DMS has no typed provider yet (kit data-connect.jsx
         C2C_DMS is unported); GAP RULE — the empty sample result stays. */
      ((window as any).C2C_DMS
        ? (window as any).C2C_DMS.search(query)
        : Promise.resolve({ documents: [], skipped: [], sample: true }))
        .then((r: DmsResult) => { if (!cancel) { setRes(r); setLoading(false); } })
        .catch(() => { if (!cancel) { setRes(null); setLoading(false); } });
    }, 320);
    return () => { cancel = true; clearTimeout(t); };
  }, [query]);

  if (!query) return null;
  const docs = (res && res.documents) || [];
  const skipped = (res && res.skipped) || [];
  const sample = !res || res.sample;

  return (
    <div className="dms">
      <div className="dms-head">
        <span className="dms-title">{I.search} Connected systems</span>
        {loading && <span className="dms-load">searching…</span>}
        {!loading && <span className="dms-count">{docs.length} result{docs.length === 1 ? '' : 's'}{skipped.length ? ' · ' + skipped.length + ' skipped' : ''}</span>}
        <span className={'dms-src ' + (sample ? 'sample' : 'live')}>{sample ? 'Sample data' : 'Live'}</span>
      </div>
      {docs.length > 0 && (
        <div className="dms-results">
          {docs.map((d, i) => (
            <a key={i} className="dms-doc" href={d.url || '#'} target={d.url ? '_blank' : undefined} rel="noopener">
              <span className="dms-conn">{d.connector}</span>
              <span className="dms-doc-main">
                <span className="dms-doc-title">{d.title}</span>
                {d.summary && <span className="dms-doc-sum">{d.summary}</span>}
              </span>
              {d.relevanceScore != null && <span className="dms-rel">{Math.round(d.relevanceScore * 100)}%</span>}
              {d.url && <span className="dms-open">{I.externalLink || I.arrowUpRight || '↗'}</span>}
            </a>
          ))}
        </div>
      )}
      {docs.length === 0 && !loading && (
        <div className="dms-empty">
          {skipped.length
            ? 'No connected systems to search yet. Link a system below and its documents become searchable here — nothing is fabricated in the meantime.'
            : 'No matches in the connected systems.'}
        </div>
      )}
      {skipped.length > 0 && (
        <div className="dms-skipped">
          {skipped.map((s, i) => (
            <div key={i} className="dms-skip">
              <span className="dms-skip-name">{s.connector}</span>
              <span className="dms-skip-reason">{s.reason}</span>
              <button className="dms-skip-cta" onClick={() => { (onNav || (() => {}))('setup'); }}>Connect →</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

(window as any).DmsSearch = DmsSearch;

/* ── FeTree (recursive folder navigator) ── */

interface FeTreeProps {
  nodes: any[];
  depth: number;
  active: string | null;
  onPick: (id: string) => void;
  expanded: Record<string, boolean>;
  toggle: (id: string) => void;
}

function FeTree({ nodes, depth, active, onPick, expanded, toggle }: FeTreeProps) {
  return (
    <div>{nodes.map((n) => {
      if (feIsDoc(n)) return null;
      const docs = feFlatten(n.children);
      const isOpen = expanded[n.id] !== false;
      const ready = docs.filter((d: any) => ['final', 'approved', 'reviewed', 'complete'].indexOf(d.status) >= 0).length;
      return (
        <div key={n.id}>
          <button className="vd-folder" data-on={active === n.id || undefined} style={{ paddingLeft: 10 + depth * 14 }}
            onClick={() => { onPick(n.id); toggle(n.id); }}>
            <span className="vd-caret" data-open={isOpen || undefined}>{I.chevronRight || '›'}</span>
            <span className="vd-fico">{isOpen ? (I.folderOpen || I.folder) : I.folder}</span>
            <span className="vd-flabel">{n.code ? <b>{n.code}</b> : null} {n.label}</span>
            <span className="vd-fcount">{ready}/{docs.length}</span>
          </button>
          {isOpen && n.children && n.children.some((c: any) => !feIsDoc(c)) &&
            <FeTree nodes={n.children} depth={depth + 1} active={active} onPick={onPick} expanded={expanded} toggle={toggle} />}
        </div>
      );
    })}</div>
  );
}

/* ── FileExplorer ── */

interface FileExplorerProps {
  spine?: Spine | null;
  onOpenDoc?: (doc: any) => void;
}

export function FileExplorer({ spine, onOpenDoc }: FileExplorerProps) {
  const tree = (spine && spine.tree) || [];
  const allDocs = useMemo(() => feFlatten(tree), [spine]);
  const [active, setActive] = useState<string | null>((tree[0] && tree[0].id) || null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [selId, setSel] = useState<string | undefined>(allDocs[0] && allDocs[0].id);
  const [q, setQ] = useState('');

  const toggle = (id: string) => {
    setExpanded((e) => {
      const n = Object.assign({}, e);
      n[id] = e[id] === false ? true : false;
      return n;
    });
  };

  const find = (nodes: any[], id: string): any => {
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      if (n.id === id) return n;
      if (n.children) {
        const r = find(n.children.filter((c: any) => !feIsDoc(c)), id);
        if (r) return r;
      }
    }
    return null;
  };

  const folder = find(tree, active!) || tree[0];
  const folderDocs = folder ? feFlatten(folder.children) : [];
  const searching = q.trim().length > 0;
  const results = searching
    ? allDocs.filter((d: any) => (d.title + ' ' + (d.type || '') + ' ' + (d.num || '')).toLowerCase().indexOf(q.toLowerCase()) >= 0)
    : folderDocs;
  const sel = allDocs.find((d: any) => d.id === selId) || results[0] || allDocs[0];

  return (
    <div className="fe">
      <aside className="vd-tree fe-tree">
        <div className="fe-tree-search">
          <span className="ic">{I.search}</span>
          <input value={q} onChange={(e) => { setQ(e.target.value); }} placeholder="Filter files…" />
        </div>
        <FeTree nodes={tree} depth={0} active={active} onPick={(id) => { setActive(id); setQ(''); }} expanded={expanded} toggle={toggle} />
      </aside>
      <section className="vd-list fe-list">
        <div className="vd-breadcrumb">
          <button className="vd-crumb" onClick={() => { setActive((tree[0] && tree[0].id)); setQ(''); }}>{I.folder} {(spine && spine.program) || 'Files'}</button>
          {!searching && folder && <><span className="vd-crumb-sep">{'›'}</span><span className="vd-crumb cur">{folder.code ? folder.code + ' · ' : ''}{folder.label}</span></>}
          {searching && <><span className="vd-crumb-sep">{'›'}</span><span className="vd-crumb cur">Search "{q}"</span></>}
        </div>
        <div className="vd-cols">
          <span className="vd-col-name">Name</span>
          <span className="vd-col-type">Type</span>
          <span className="vd-col-owner">Owner</span>
          <span className="vd-col-mod">Modified</span>
          <span className="vd-col-status">Status</span>
        </div>
        <div className="vd-rows">
          {results.map((d: any) => (
            <button key={d.id} className="vd-row" data-on={selId === d.id || undefined} onClick={() => { setSel(d.id); }}>
              <span className="vd-col-name">
                <span className="vd-row-ic">{feFileIcon(d, I as any)}</span>
                <span className="vd-row-t">{d.num && d.num !== '—' ? <span className="vd-num">{d.num}</span> : null}{d.title}</span>
                {d.blocker && <span className="vd-blk" title="Blocks filing">{I.alertTriangle}</span>}
              </span>
              <span className="vd-col-type">{d.type}</span>
              <span className="vd-col-owner">{d.owner}</span>
              <span className="vd-col-mod">{d.updated}</span>
              <span className="vd-col-status"><span className={'rd-chip tone-' + feSt(d.status).tone}>{feSt(d.status).label}</span></span>
            </button>
          ))}
          {results.length === 0 && <div className="vd-empty">No documents{searching ? ' match your filter' : ' in this folder'}.</div>}
        </div>
      </section>
      {sel && <aside className="vd-detail fe-detail">
        <div className="fe-det-ic">{feFileIcon(sel, I as any)}</div>
        <div className="fe-det-t">{sel.title}</div>
        <div className="fe-det-m">{sel.num && sel.num !== '—' ? sel.num + ' · ' : ''}{sel.type}</div>
        {sel.preview && <div className="fe-det-p">{sel.preview}</div>}
        <div className="fe-det-rows">
          <div><span>Status</span><span className={'rd-chip tone-' + feSt(sel.status).tone}>{feSt(sel.status).label}</span></div>
          <div><span>Owner</span><b>{sel.owner || '—'}</b></div>
          <div><span>Version</span><b>{sel.ver || '—'}</b></div>
          <div><span>Modified</span><b>{sel.updated || '—'}</b></div>
          {typeof sel.pct === 'number' && <div><span>Complete</span><b>{sel.pct}%</b></div>}
        </div>
        {sel.flag && <div className="fe-det-flag">{I.alertTriangle} {sel.flag}</div>}
        {onOpenDoc && <button className="btn primary sm" onClick={() => { onOpenDoc(sel); }}>{I.edit || I.fileText} Open in editor</button>}
      </aside>}
    </div>
  );
}

(window as any).FileExplorer = FileExplorer;

/* ── VaultProjectStrip ── */

interface VaultProjectStripProps {
  onNav?: (target: string, label?: string) => void;
  onAsk?: (q: string) => void;
}

export function VaultProjectStrip({ onNav, onAsk }: VaultProjectStripProps) {
  /* C2C_PROJECT, PD_FIXTURES and PD_MODULE_LABELS are runtime window channels
     with no typed provider yet (kit project-detail.jsx is unported); GAP RULE
     — the reads keep their fixture fallbacks rather than inventing one. */
  const proj = (window as any).C2C_PROJECT || null;
  const pid = (proj && proj.id && proj.id !== 'new') ? proj.id : 'bx-301';
  const fx = ((window as any).PD_FIXTURES ? (window as any).PD_FIXTURES(proj) : { project: {}, workstreams: [], drafts: [] });
  const base = '/api/c2c/projects/' + encodeURIComponent(pid);
  const P = useLive(base, fx.project, [pid]);
  const WS = useLive(base + '/workstreams', fx.workstreams, [pid]);
  const DR = useLive(base + '/drafts', fx.drafts, [pid]);
  const project = P.data || fx.project || {};
  const workstreams: any[] = WS.data || [];
  const drafts: any[] = DR.data || [];
  const sample = P.sample || WS.sample;

  const ready = (typeof project.completion_percentage === 'number')
    ? project.completion_percentage
    : (workstreams.length
      ? Math.round(workstreams.reduce((s: number, w: any) => s + (w.completion_pct || 0), 0) / workstreams.length)
      : 0);
  const labels: Record<string, any> = (window as any).PD_MODULE_LABELS || {};
  const draftTone = (s: string) => s === 'approved' ? 'good' : s === 'review' ? 'warn' : s === 'locked' ? 'info' : 'info';

  const openDraft = (d: any) => {
    try {
      (window as any).C2C_SECTION = { documentId: d.document_id, sectionKey: d.section_key, label: d.label };
    } catch (_e) { /* ignore */ }
    if (onNav) onNav('document-authoring', d.label || d.section_key);
  };

  const _rel = (iso: string) => {
    if (!iso) return '';
    const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (m < 60) return m + 'm ago';
    const h = Math.round(m / 60);
    if (h < 24) return h + 'h ago';
    return Math.round(h / 24) + 'd ago';
  };

  return (
    <div className="vps">
      <div className="vps-head">
        <div className="vps-t">{I.folder} From Project management
          <span className="vps-x">— {(project.code || project.program_type || 'Project')} · {ready}% ready <SampleTag sample={sample} /></span>
        </div>
        <button className="btn ghost sm" onClick={() => { if (onNav) onNav('project-home'); }}>Open project workspace {I.arrowRight || I.chevronRight}</button>
      </div>
      <div className="vps-body">
        <div className="vps-mods">
          {workstreams.map((ws: any) => {
            const info = labels[String(ws.module).toLowerCase()] || { label: String(ws.module).toUpperCase(), surface: null };
            return (
              <button key={ws.module} className="vps-mod" onClick={() => { if (info.surface && onNav) onNav(info.surface, info.label); }} title={info.desc || ''}>
                <div className="vps-mod-h"><span className="l">{info.label}</span><span className="pct">{ws.completion_pct}%</span></div>
                <div className="vps-bar"><div className={'fill s-' + (ws.completion_pct >= 100 ? 'ok' : ws.completion_pct >= 75 ? 'review' : ws.completion_pct >= 25 ? 'drafted' : 'todo')} style={{ width: ws.completion_pct + '%' }} /></div>
                <div className="vps-mod-m">{ws.approved}/{ws.total} approved{ws.review ? ' · ' + ws.review + ' in review' : ''}</div>
              </button>
            );
          })}
        </div>
        <div className="vps-drafts">
          <div className="vps-drafts-h">Authored documents <span className="n">{drafts.length}</span></div>
          {drafts.length === 0 ? <div className="vps-empty">No sections authored yet.</div> : drafts.slice(0, 6).map((d: any, i: number) => (
            <button key={d.id != null ? d.id : i} className="vps-draft" onClick={() => { openDraft(d); }}>
              <span className="ic">{I.fileText || I.file}</span>
              <span className="vps-draft-b">
                <span className="t">{d.label || d.section_key}</span>
                <span className="s">{d.document_title || d.doc_type} · {d.section_key} · {d.draft_source === 'ai' ? 'AnA' : 'Human'} {_rel(d.updated_at)}</span>
              </span>
              <span className={'rd-chip tone-' + draftTone(d.status)}>{d.status}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

(window as any).VaultProjectStrip = VaultProjectStrip;
