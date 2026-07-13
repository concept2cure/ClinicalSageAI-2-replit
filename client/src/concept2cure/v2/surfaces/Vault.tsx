import React, { useState, useMemo } from 'react';
import { I } from '../icons';
import { SampleTag } from '../dataConnect';
import type { SurfaceViewProps } from '../surfaceViews';
import {
  vaultCrossCuttingFolders,
  vaultStatus,
  vaultFileIconKey,
  isVaultDoc,
  flattenDocs,
  type VaultDoc,
  type VaultFolder,
} from '../fixtures/vault-data';
import { getDossierSpine } from '../fixtures/dossier-data';
import { VAULT_BUILDS, spineForBuild, type VaultBuild } from '../fixtures/vault-sources-data';
import '../styles/project-home-v2.css';

/* ── File icon resolver (maps key to I[key]) ── */

function fileIcon(doc: VaultDoc): React.ReactNode {
  const key = vaultFileIconKey(doc);
  return (I as any)[key] || I.fileText || I.file;
}

/* ── VaultTree — recursive folder nav ── */

interface VaultTreeProps {
  nodes: (VaultDoc | VaultFolder)[];
  depth: number;
  activeFolder: string | null;
  onPick: (id: string) => void;
  expanded: Record<string, boolean>;
  toggle: (id: string) => void;
}

function VaultTree({ nodes, depth, activeFolder, onPick, expanded, toggle }: VaultTreeProps) {
  return (
    <div>
      {nodes.map((n) => {
        if (isVaultDoc(n)) return null;
        const folder = n as VaultFolder;
        const docs = flattenDocs(folder.children);
        const isOpen = expanded[folder.id] !== false;
        const ready = docs.filter((d) =>
          ['final', 'approved', 'reviewed'].includes(d.status),
        ).length;
        return (
          <div key={folder.id}>
            <button
              className="vd-folder"
              data-on={activeFolder === folder.id || undefined}
              style={{ paddingLeft: 10 + depth * 14 }}
              onClick={() => {
                onPick(folder.id);
                toggle(folder.id);
              }}
            >
              <span className="vd-caret" data-open={isOpen || undefined}>
                {I.chevronRight || '›'}
              </span>
              <span className="vd-fico">
                {isOpen ? I.folderOpen || I.folder : I.folder}
              </span>
              <span className="vd-flabel">
                {folder.code ? <b>{folder.code}</b> : null} {folder.label}
              </span>
              <span className="vd-fcount">
                {ready}/{docs.length}
              </span>
            </button>
            {isOpen &&
              folder.children &&
              folder.children.some((c) => !isVaultDoc(c)) && (
                <VaultTree
                  nodes={folder.children}
                  depth={depth + 1}
                  activeFolder={activeFolder}
                  onPick={onPick}
                  expanded={expanded}
                  toggle={toggle}
                />
              )}
          </div>
        );
      })}
    </div>
  );
}

/* ── Vault (DMS) surface ──
   Document management aligned to the real dossier structure. The folder tree
   IS the eCTD / eSTAR / IVDR spine (DOSSIER_SPINES, segment-aware) plus the
   cross-cutting DMS folders (Agency correspondence, Templates, Working
   drafts, Sources & evidence, Audit). */

export function Vault({ onAsk, onNav }: SurfaceViewProps) {
  const seg: string = (window as any).__C2C_SEGMENT || 'biotech';
  const builds: VaultBuild[] = VAULT_BUILDS;
  const defBuild = builds.find((b) => b.seg === seg) || builds[0] || null;
  const [buildId, setBuildId] = useState<string | null>(defBuild && defBuild.id);
  const build = builds.find((b) => b.id === buildId) || defBuild;

  /* Spine follows the build's filing designation; segment fixture fallback */
  const spine = (build ? spineForBuild(build) : undefined) || getDossierSpine(seg);

  const tree = useMemo(
    () => [...(spine.tree || []), ...vaultCrossCuttingFolders()],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [buildId, seg],
  );
  const allDocs = useMemo(() => flattenDocs(tree), [tree]);

  const [activeFolder, setActiveFolder] = useState<string | null>(
    (spine.tree && spine.tree[0] && spine.tree[0].id) || 'm1',
  );
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [q, setQ] = useState('');
  const [selId, setSel] = useState<string | null>(
    allDocs[0] ? allDocs[0].id : null,
  );
  const toggle = (id: string) =>
    setExpanded((e) => ({ ...e, [id]: e[id] === false ? true : false }));

  const findFolder = (
    nodes: (VaultDoc | VaultFolder)[],
    id: string | null,
  ): VaultFolder | null => {
    if (!id) return null;
    for (const n of nodes) {
      if (!isVaultDoc(n)) {
        const folder = n as VaultFolder;
        if (folder.id === id) return folder;
        if (folder.children) {
          const r = findFolder(
            folder.children.filter((c) => !isVaultDoc(c)),
            id,
          );
          if (r) return r;
        }
      }
    }
    return null;
  };

  const folder = findFolder(tree, activeFolder) || (tree[0] as VaultFolder);
  const folderDocs = folder ? flattenDocs(folder.children) : [];
  const searching = q.trim().length > 0;
  const results = searching
    ? allDocs.filter((d) =>
        (d.title + ' ' + (d.preview || '') + ' ' + (d.num || '') + ' ' + (d.type || ''))
          .toLowerCase()
          .includes(q.toLowerCase()),
      )
    : folderDocs;
  const sel =
    allDocs.find((d) => d.id === selId) || results[0] || allDocs[0] || null;

  /* Corpus metadata synthesized from doc completeness */
  const chunks = sel
    ? Math.max(
        0,
        Math.round((sel.pct || 0) * 0.9) +
          (sel.status === 'not_started' ? 0 : 6),
      )
    : 0;
  const indexed = sel && sel.status !== 'not_started';

  const st = (s: string) => vaultStatus(s);

  const openDoc = () => {
    onNav && onNav('document-authoring');
  };

  return (
    <div className="vd-wrap">
      <SampleTag sample={true} />
      <div className="vd-top">
        <div>
          <div className="sp-eyebrow">Evidence {I.dot} /api/corpus</div>
          <h1 className="vd-title">Vault (DMS)</h1>
          <div className="vd-sub">
            {builds.length > 0 && (
              <select
                className="vd-build"
                value={buildId || ''}
                title="Project build — the file structure follows the filing designation"
                onChange={(e) => {
                  setBuildId(e.target.value);
                  setActiveFolder(null);
                  setQ('');
                }}
              >
                {builds.map((b: any) => (
                  <option key={b.id} value={b.id}>
                    {b.label}
                  </option>
                ))}
              </select>
            )}
            <span className="vd-sub-x">
              {spine.spine} {I.dot} {allDocs.length} documents
            </span>
          </div>
        </div>
        <button
          className="sp-ask"
          onClick={() => onNav && onNav('project-home')}
          title="Open this project in Project management"
        >
          {I.folder} Open project
        </button>
        <button
          className="sp-ask"
          onClick={() => onNav && onNav('etmf')}
          title="TMF inspection-readiness — completeness, timeliness & QC"
        >
          {I.shieldCheck} Inspection readiness
        </button>
        <button
          className="sp-primary"
          onClick={() =>
            onAsk(
              'Upload documents to the vault and index them for semantic search.',
            )
          }
        >
          {I.upload || I.plus} Upload
        </button>
      </div>

      <div className="vd-coexist">
        <span className="vd-coexist-txt">
          {I.link || I.plug} Works alongside <b>Veeva Vault</b>,{' '}
          <b>SharePoint</b> &amp; <b>OneDrive</b> — search in place, import
          with approval (detect, classify, approve), export everything. No
          rip-and-replace.
        </span>
        <button
          className="vd-coexist-cta"
          onClick={() =>
            onAsk(
              'Import documents from Veeva Vault into this project — run detect, classify to the dossier structure, and stage for approval.',
            )
          }
        >
          Import from a connected source
        </button>
      </div>

      <div className="vd-grid">
        <aside className="vd-tree">
          <div className="vd-tree-lbl">
            {spine.standard === 'tmf'
              ? 'TMF zones - DIA RM'
              : spine.standard === 'multi'
                ? 'Submission structure'
                : 'CTD structure'}
          </div>
          <VaultTree
            nodes={tree}
            depth={0}
            activeFolder={activeFolder}
            onPick={(id) => {
              setActiveFolder(id);
              setQ('');
            }}
            expanded={expanded}
            toggle={toggle}
          />
        </aside>

        <section className="vd-list">
          <div className="vd-breadcrumb">
            <button
              className="vd-crumb"
              onClick={() => {
                setActiveFolder(
                  (spine.tree && spine.tree[0] && spine.tree[0].id) || 'm1',
                );
                setQ('');
              }}
            >
              {I.folder}{' '}
              {(build && build.program) || spine.program || 'Vault'}
            </button>
            {!searching && folder && (
              <>
                <span className="vd-crumb-sep">&rsaquo;</span>
                <span className="vd-crumb cur">
                  {folder.code ? folder.code + ' - ' : ''}
                  {folder.label}
                </span>
              </>
            )}
            {searching && (
              <>
                <span className="vd-crumb-sep">&rsaquo;</span>
                <span className="vd-crumb cur">Search &quot;{q}&quot;</span>
              </>
            )}
          </div>
          <div className="vd-cols">
            <span className="vd-col-name">Name</span>
            <span className="vd-col-type">Type</span>
            <span className="vd-col-owner">Owner</span>
            <span className="vd-col-mod">Modified</span>
            <span className="vd-col-status">Status</span>
          </div>
          <div className="vd-rows">
            {results.map((d) => (
              <button
                key={d.id}
                className="vd-row"
                data-on={selId === d.id || undefined}
                onClick={() => setSel(d.id)}
              >
                <span className="vd-col-name">
                  <span className="vd-row-ic">{fileIcon(d)}</span>
                  <span className="vd-row-t">
                    {d.num && d.num !== '—' ? (
                      <span className="vd-num">{d.num}</span>
                    ) : null}
                    {d.title}
                  </span>
                  {d.blocker && (
                    <span className="vd-blk" title="Blocks filing">
                      {I.alertTriangle}
                    </span>
                  )}
                </span>
                <span className="vd-col-type">{d.type}</span>
                <span className="vd-col-owner">{d.owner}</span>
                <span className="vd-col-mod">{d.updated}</span>
                <span className="vd-col-status">
                  <span className={'rd-chip tone-' + st(d.status).tone}>
                    {st(d.status).label}
                  </span>
                </span>
              </button>
            ))}
            {results.length === 0 && (
              <div className="vd-empty">
                No documents
                {searching ? ' match your search' : ' in this folder'}.
              </div>
            )}
          </div>
        </section>

        <aside className="vd-detail">
          {sel && (
            <>
              <div className="vd-d-hdr">
                <span className={'rd-chip tone-' + st(sel.status).tone}>
                  {st(sel.status).label}
                </span>
                {sel.ver && sel.ver !== '—' && (
                  <span className="vd-d-ver">{sel.ver}</span>
                )}
              </div>
              <div className="vd-d-title">
                {sel.num && sel.num !== '—' ? sel.num + ' - ' : ''}
                {sel.title}
              </div>
              <div className="vd-d-meta">
                {sel.type} - {sel.owner} - updated {sel.updated}
              </div>
              {sel.preview && (
                <div className="vd-d-preview">{sel.preview}</div>
              )}
              {sel.flag && (
                <div className="tl-warn-row">
                  {I.alertTriangle} {sel.flag}
                </div>
              )}

              <div className="vd-d-seclbl">Corpus indexing</div>
              <div className="vd-d-idx">
                <span className={'vd-idx-dot ' + (indexed ? 'on' : '')} />
                <span>
                  {indexed
                    ? `Indexed - ${chunks} chunks - embedded - semantic-search ready`
                    : 'Not yet indexed'}
                </span>
              </div>

              <div className="vd-d-seclbl">Version history</div>
              <div className="vd-vers">
                {[
                  {
                    v: sel.ver || 'v1.0',
                    when: sel.updated,
                    author: sel.owner,
                    note: 'Current version',
                  },
                ]
                  .slice(0, 4)
                  .map((v, i) => (
                    <div key={i} className="vd-ver">
                      <span className="vd-ver-v">{v.v}</span>
                      <span className="vd-ver-m">
                        {v.when} - {v.author}
                        {v.note ? ' - ' + v.note : ''}
                      </span>
                    </div>
                  ))}
              </div>

              <div className="vd-d-seclbl">Linked evidence</div>
              <div className="vd-ev">
                <div className="vd-ev-row">
                  {I.link || I.fileText} ADaM datasets - locked
                </div>
                <div className="vd-ev-row">
                  {I.book || I.fileText} 2 precedents - RIM matched
                </div>
              </div>

              <div className="vd-d-actions">
                <button
                  className="sp-primary"
                  style={{ padding: '8px 12px' }}
                  onClick={openDoc}
                >
                  {I.penLine || I.fileText} Open in editor
                </button>
                <button
                  className="sp-ask"
                  onClick={() =>
                    onAsk(
                      'Summarize ' +
                        sel.title +
                        ' and list the claims that still need evidence.',
                    )
                  }
                >
                  {I.sparkles} Ask AnA
                </button>
                <button
                  className="sp-ask"
                  onClick={() => onAsk('Download ' + sel.title)}
                >
                  {I.download} Download
                </button>
              </div>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
