/* RegEditor.tsx -- Regulatory document editor render shell.
   Owns all state; delegates action logic to RegEditorActions. */
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { I } from '../icons';
import { SampleTag } from '../dataConnect';
import type { SurfaceViewProps } from '../surfaceViews';
import { SectionTree } from './EditorTree';
import { AnaCopilot } from './EditorAnaCopilot';
import { CommentsPane, SourcesPane, FactDriftPane, VersionsPane, GovernancePane } from './EditorPanes';
import { PresenceCluster, Outline, TablePicker, MarginCommentPins, buildSeedMessages, Tb, escRe, RCE_TEAM } from './EditorWidgets';
import { SectionHealth, DossierReadiness } from './EditorHealth';
import { PreflightPane, SignModal, ProvenancePane, computePreflight, deriveReadiness } from './EditorGov';
import { EditorCockpit } from './EditorCockpit';
import { SelToolbar, PdfDoc, downloadDocx, DELIB_STEPS, buildDocxScript } from './EditorStudio';
import { TranslationPane } from './EditorTranslate';
import { type ActionDeps, doFullBuild, doAction, doGenerate, doExport, doAuthorDocx, onSend as sendAction, onAttach as attachAction, runDelib, applyVerbDraft, resolveComment, assignComment, replyComment, commentToTask, saveVersion, toggleLock, signSection, onSign as signAction } from './RegEditorActions';
import { REG_PATHWAYS } from '../fixtures/editor-pathways';
import { REG_READINESS_META, REG_LANGS, type PathwayId, type LangCode, type VersionEntry, type AuditEntry, type ApprovalPath } from '../fixtures/editor-data-types';
import { REG_DOC, REG_GEN, REG_SURFACE_PATHWAY, REG_COMMENTS, REG_VERSIONS, REG_AUDIT, REG_MARKETS, REG_DOC_I18N, REG_GEN_I18N } from '../fixtures/editor-data';
import { REG_TA, REG_TEMPLATES } from '../fixtures/editor-ta-templates';
import '../styles/editor-core.css';
import '../styles/editor-panels.css';

/* ── Local constants ── */
const STATUS_META: Record<string, { label: string; dot: string }> = {
  draft: { label: 'Draft', dot: 'draft' }, review: { label: 'In review', dot: 'review' },
  complete: { label: 'Complete', dot: 'complete' },
};
const _MKT: any = { id: 'us', agency: 'FDA', region: 'United States', lang: 'en' };

const DOCK_TABS: { id: string; icon: string; label: string }[] = [
  { id: 'health', icon: 'heartPulse', label: 'Health' }, { id: 'device', icon: 'cpu', label: 'Device' },
  { id: 'pharma', icon: 'pill', label: 'Pharma' }, { id: 'protocol', icon: 'clipboard', label: 'Protocol' },
  { id: 'ana', icon: 'sparkles', label: 'AnA' }, { id: 'dossier', icon: 'layoutPanels', label: 'Dossier' },
  { id: 'preflight', icon: 'shieldCheck', label: 'Preflight' }, { id: 'review', icon: 'eye', label: "Reviewer's eye" },
  { id: 'drift', icon: 'gitCompare', label: 'Fact drift' }, { id: 'sources', icon: 'link', label: 'Sources' },
  { id: 'trans', icon: 'languages', label: 'Translation' }, { id: 'comments', icon: 'messageSquare', label: 'Comments' },
  { id: 'versions', icon: 'history', label: 'Versions' }, { id: 'outline', icon: 'list', label: 'Outline' },
  { id: 'governance', icon: 'lock', label: 'Governance' }, { id: 'prov', icon: 'fingerprint', label: 'Provenance' },
];

/* Expose studio utilities for inter-surface access */
(window as any).RCE_STUDIO = { ...((window as any).RCE_STUDIO || {}), deliberate: DELIB_STEPS, docxScript: buildDocxScript };

/* ══════════════════════════════════════════════════════════════════════ */

export function RegEditor({ surface, onNav, onAsk, segment }: SurfaceViewProps) {
  /* ── Pathway resolution ── */
  const lsPw = typeof localStorage !== 'undefined' ? localStorage.getItem('rce-pathway') : null;
  const _surfPw = (window as any).REG_SURFACE_PATHWAY?.[surface.id]
    || REG_SURFACE_PATHWAY[surface.id as keyof typeof REG_SURFACE_PATHWAY];
  const _allowLs = surface.id === 'document-authoring' || surface.id === 'ectd-coauthor';
  const pid = ((_allowLs && lsPw && REG_PATHWAYS[lsPw as PathwayId])
    ? lsPw : (_surfPw && REG_PATHWAYS[_surfPw as PathwayId] ? _surfPw : 'ctd')) as PathwayId;
  const pathway = REG_PATHWAYS[pid];
  const allSecs = useMemo(() => pathway.tree.flatMap(v => [...v.items]), [pathway]);

  /* ── State ── */
  const [active, setActive] = useState(pathway.active);
  const [marketByPid, setMarketByPid] = useState<Record<string, string>>({});
  const [curPid, setCurPid] = useState(pid); const [curSurfId, setCurSurfId] = useState(surface.id);
  const [treeOpen, setTreeOpen] = useState(true); const [narrow, setNarrow] = useState(false);
  const [dockOpen, setDockOpen] = useState(false); const [dockTab, setDockTab] = useState('health');
  const [compareOpen, setCompareOpen] = useState(false); const [query, setQuery] = useState('');
  const [track, setTrack] = useState(false); const [findOpen, setFindOpen] = useState(false);
  const [focusMode, setFocusMode] = useState(false); const [tablePickerOpen, setTablePickerOpen] = useState(false);
  const [findText, setFindText] = useState(''); const [replaceText, setReplaceText] = useState('');
  const [mode, setMode] = useState('Maximum'); const [busy, setBusy] = useState(false);
  const [stream, setStream] = useState('');
  const [messages, setMessages] = useState<any[]>(() =>
    buildSeedMessages(allSecs.find(s => s.id === pathway.active) || null, pathway, 'Maximum'));
  const [comments, setComments] = useState<Record<string, any[]>>(() => ({ ...(REG_COMMENTS as any) }));
  const [versionsAll, setVersionsAll] = useState<Record<string, VersionEntry[]>>(() => ({ ...REG_VERSIONS }));
  const [auditAll, setAuditAll] = useState<Record<string, AuditEntry[]>>(() => ({ ...REG_AUDIT }));
  const [locked, setLocked] = useState<Record<string, boolean>>({});
  const [redline, setRedline] = useState<{ before: string; after: string; label: string } | null>(null);
  const [rev, setRev] = useState(0);
  const [taByPid, setTaByPid] = useState<Record<string, string>>({});
  const [addedByPid, setAddedByPid] = useState<Record<string, any[]>>({});
  const [sigByKey, setSigByKey] = useState<Record<string, { meaning?: string; stamp?: string; hash?: string; who?: string }>>({});
  const [signAfterEdit, setSignAfterEdit] = useState<Record<string, boolean>>({});
  const [showSign, setShowSign] = useState(false);
  const [approvalPath, setApprovalPath] = useState<ApprovalPath>('regulated_dual_review');
  const [view, setView] = useState<'cockpit' | 'studio' | 'editor'>('editor');
  const [editMode, setEditMode] = useState<'edit' | 'suggest'>('edit');
  const [sel, setSel] = useState<{ left: number; top: number; text: string } | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [ctx, setCtx] = useState<{ x: number; y: number } | null>(null);

  /* ── Derived ── */
  const sec = allSecs.find(s => s.id === active) || allSecs[0]
    || { id: '', num: '', label: '', status: 'draft' as const, conf: 0, words: 0 };
  const markets = (REG_MARKETS[pid] || [_MKT]) as any[];
  const marketId = marketByPid[pid] || markets[0]?.id || 'us';
  const market = markets.find((m: any) => m.id === marketId) || markets[0] || _MKT;
  const lang = (market.lang || 'en') as LangCode;
  const langInfo = REG_LANGS[lang] || REG_LANGS.en;
  const taForPid = taByPid[pid] || pathway.ta;
  const taItem = REG_TA.find(t => t.id === taForPid);
  const taLabel = taItem ? taItem.label : String(taForPid);
  const docKey = pid + ':' + sec.id + ':' + lang;
  const isLocked = !!locked[docKey]; const isSigned = !!sigByKey[docKey];
  const sigInfo = sigByKey[docKey]; const editedAfterSign = !!signAfterEdit[docKey];
  const curComments = (comments[docKey] || comments[sec.id] || []) as any[];
  const curVersions = (versionsAll[docKey] || versionsAll[sec.id] || []) as VersionEntry[];
  const curAudit = (auditAll[docKey] || auditAll[sec.id] || []) as AuditEntry[];

  /* ── Refs ── */
  const rootRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const storeRef = useRef<Record<string, string>>({ ...REG_DOC });
  const delibTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stateRef = useRef<any>(null);

  /* ── Surface / pathway change detection (in-render) ── */
  if (pid !== curPid) {
    setCurPid(pid); setActive(pathway.active);
    setMessages(buildSeedMessages(allSecs.find(s => s.id === pathway.active) || null, pathway, mode));
  }
  if (surface.id !== curSurfId) setCurSurfId(surface.id);

  /* ── Effects ── */
  useEffect(() => {
    const el = rootRef.current; if (!el) return;
    const ro = new ResizeObserver(([e]) => setNarrow(e.contentRect.width < 1040));
    ro.observe(el); return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const el = bodyRef.current; if (!el) return;
    const i18n = REG_DOC_I18N[sec.id]; const genI18n = REG_GEN_I18N[sec.id];
    const html = storeRef.current[docKey] || (i18n && i18n[lang])
      || REG_DOC[sec.id] || (genI18n && genI18n[lang]) || REG_GEN[sec.id] || '';
    if (el.innerHTML !== html) el.innerHTML = html;
  }, [docKey, rev]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Computed values ── */
  const wordCount = useMemo(() => {
    const html = storeRef.current[docKey] || REG_DOC[sec.id] || '';
    const d = document.createElement('div'); d.innerHTML = html;
    const t = (d.textContent || '').trim();
    return t ? t.split(/\s+/).length : 0;
  }, [docKey, rev]); // eslint-disable-line react-hooks/exhaustive-deps

  const changeCount = useMemo(() => {
    const html = storeRef.current[docKey] || '';
    return (html.match(/<(ins|del)\b/gi) || []).length;
  }, [docKey, rev]); // eslint-disable-line react-hooks/exhaustive-deps

  const bodyEmpty = !storeRef.current[docKey] && !REG_DOC[sec.id];

  /* ── Utility functions (read state via stateRef) ── */
  const saveCurrent = () => {
    const el = bodyRef.current; if (!el) return;
    const dk = stateRef.current?.docKey || docKey;
    storeRef.current[dk] = el.innerHTML;
    if (stateRef.current?.isSigned) setSignAfterEdit(p => ({ ...p, [dk]: true }));
    setSavedAt(new Date().toLocaleTimeString());
  };
  const persist = () => { try { localStorage.setItem('rce-store', JSON.stringify(storeRef.current)); } catch { /* noop */ } };
  const pushAudit = (entry: AuditEntry) => {
    const dk = stateRef.current?.docKey || docKey;
    const sid = stateRef.current?.sec?.id || sec.id;
    setAuditAll(p => ({ ...p, [dk]: [...(p[dk] || p[sid] || []), entry] }));
  };
  const exec = (cmd: string, val?: string) => {
    const el = bodyRef.current; if (!el) return;
    el.focus(); document.execCommand(cmd, false, val); saveCurrent();
  };
  const insertHTML = (html: string) => {
    const el = bodyRef.current; if (!el) return;
    el.focus(); document.execCommand('insertHTML', false, html); saveCurrent();
  };
  const addCitation = () => insertHTML('<span class="cite">[Citation needed]</span>');
  const nav = (id: string) => { saveCurrent(); setActive(id); setRev(r => r + 1); setSel(null); setCtx(null); };
  const switchMarket = (id: string) => { saveCurrent(); setMarketByPid(p => ({ ...p, [pid]: id })); setRev(r => r + 1); };
  const finishDelib = () => { if (delibTimerRef.current) { clearTimeout(delibTimerRef.current); delibTimerRef.current = null; } };

  /* ── Governance derivations ── */
  const govCtx = useMemo(() => ({ approvalPath, ...((window as any).RCE_GOV || {}) }), [approvalPath]);
  const preCtx = { conf: sec.conf ?? 0, status: sec.status as any, blocker: !!(sec as any).blocker, words: wordCount, cites: 0, locked: isLocked, signed: isSigned, empty: bodyEmpty, wordCount, warnFlags: 0, errFlags: 0, changeCount, changeAfterSign: editedAfterSign };
  const preflight = useMemo(() => computePreflight(preCtx), [sec, wordCount, isLocked, isSigned]); // eslint-disable-line
  const readyLevel = useMemo(() => deriveReadiness(preCtx), [sec, wordCount, isLocked, isSigned]); // eslint-disable-line
  const readyMeta = REG_READINESS_META[readyLevel] || { label: 'Draft', tone: 'idle' };
  const statusMeta = STATUS_META[sec.status] || STATUS_META.draft;

  useEffect(() => { // Reviewer's Eye
    const lint = (window as any).c2cMedicalLint;
    if (lint && bodyRef.current) try { lint(bodyRef.current, { pathway: pid, section: sec.id, market: market.id }); } catch { /* noop */ }
  }, [docKey, rev]); // eslint-disable-line

  /* ── stateRef + ActionDeps ── */
  stateRef.current = {
    busy, isLocked, isSigned, sec, pathway, market, mode, langInfo, active, lang,
    docKey, wordCount, pid, approvalPath, ta: taForPid, taLabel, changeCount,
    preflight, readyMeta, statusMeta, govCtx, curVersions, curComments, bodyEmpty, editedAfterSign,
  };
  const deps: ActionDeps = useMemo(() => ({
    getState: () => stateRef.current,
    setBusy, setStream, setDockOpen, setDockTab, setMessages, setRev,
    setComments: setComments as any, setRedline, setVersionsAll: setVersionsAll as any,
    setLocked: setLocked as any, setSigByKey: setSigByKey as any,
    setSignAfterEdit: setSignAfterEdit as any, setShowSign, setMarketByPid: setMarketByPid as any,
    setCompareOpen, bodyRef: bodyRef as any, storeRef, delibTimerRef,
    saveCurrent, persist, pushAudit, exec, insertHTML, addCitation, nav, switchMarket, finishDelib,
  }), []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Selection toolbar ── */
  const onBodySelect = () => {
    const s = window.getSelection();
    if (!s || s.isCollapsed || !bodyRef.current?.contains(s.anchorNode)) { setSel(null); return; }
    const r = s.getRangeAt(0).getBoundingClientRect();
    const pr = bodyRef.current.getBoundingClientRect();
    setSel({ left: r.left - pr.left + r.width / 2, top: r.top - pr.top - 44, text: s.toString() });
  };

  /* ── Context menu ── */
  const onContextMenu = (e: React.MouseEvent) => {
    if (!bodyRef.current?.contains(e.target as Node)) return;
    e.preventDefault();
    const pr = bodyRef.current.getBoundingClientRect();
    setCtx({ x: e.clientX - pr.left, y: e.clientY - pr.top });
  };

  /* ── Ribbon toolbar ── */
  const renderRibbon = () => (
    <div className="rce-ribbon">
      <Tb icon="panelLeft" title="Toggle tree" on={treeOpen} onClick={() => setTreeOpen(o => !o)} />
      <div className="rce-tb-sep" />
      <div className="rce-tb-group">
        <Tb icon="bold" title="Bold" onClick={() => exec('bold')} />
        <Tb icon="italic" title="Italic" onClick={() => exec('italic')} />
        <Tb icon="underline" title="Underline" onClick={() => exec('underline')} />
        <Tb icon="strikethrough" title="Strikethrough" onClick={() => exec('strikethrough')} />
      </div>
      <div className="rce-tb-sep" />
      <div className="rce-tb-group">
        <Tb icon="heading1" label="H1" title="Heading 1" onClick={() => exec('formatBlock', 'h1')} />
        <Tb icon="heading2" label="H2" title="Heading 2" onClick={() => exec('formatBlock', 'h2')} />
        <Tb icon="heading3" label="H3" title="Heading 3" onClick={() => exec('formatBlock', 'h3')} />
        <Tb icon="pilcrow" label="P" title="Paragraph" onClick={() => exec('formatBlock', 'p')} />
      </div>
      <div className="rce-tb-sep" />
      <div className="rce-tb-group">
        <Tb icon="list" title="Bullet list" onClick={() => exec('insertUnorderedList')} />
        <Tb icon="listOrdered" title="Numbered list" onClick={() => exec('insertOrderedList')} />
        <Tb icon="indent" title="Indent" onClick={() => exec('indent')} />
        <Tb icon="outdent" title="Outdent" onClick={() => exec('outdent')} />
      </div>
      <div className="rce-tb-sep" />
      <div className="rce-tb-group" style={{ position: 'relative' }}>
        <Tb icon="table2" title="Insert table" onClick={() => setTablePickerOpen(o => !o)} />
        {tablePickerOpen && <TablePicker onInsert={(r, c) => {
          const rows = Array.from({ length: r }, () =>
            '<tr>' + Array.from({ length: c }, () => '<td>&nbsp;</td>').join('') + '</tr>').join('');
          insertHTML('<table class="doctab"><tbody>' + rows + '</tbody></table>');
        }} onClose={() => setTablePickerOpen(false)} />}
        <Tb icon="link" title="Insert link" onClick={() => { const u = prompt('URL:'); if (u) exec('createLink', u); }} />
        <Tb icon="quote" title="Blockquote" onClick={() => exec('formatBlock', 'blockquote')} />
      </div>
      <div className="rce-tb-sep" />
      <div className="rce-tb-group">
        <Tb icon="undo" title="Undo" onClick={() => exec('undo')} />
        <Tb icon="redo" title="Redo" onClick={() => exec('redo')} />
      </div>
      <div style={{ flex: 1 }} />
      <div className="rce-tb-group">
        <Tb icon="search" title="Find & replace" on={findOpen} onClick={() => setFindOpen(o => !o)} />
        <Tb icon="eye" label={track ? 'Track' : undefined} title="Track changes" on={track} onClick={() => setTrack(t => !t)} />
        <Tb icon="maximize" title="Focus mode" on={focusMode} onClick={() => setFocusMode(f => !f)} />
      </div>
    </div>
  );

  /* ── Dock content ── */
  const renderDockContent = () => {
    const W = window as any;
    switch (dockTab) {
      case 'health': return <SectionHealth section={sec as any} pathway={pathway as any} govCtx={govCtx}
        preflight={preflight} onAction={(id: string) => doAction(deps, id)}
        onVerb={(v: string) => applyVerbDraft(deps, v, '', {})} market={market as any} />;
      case 'device': { const P = W.DeviceIntelPanel; return P ? <P section={sec} pathway={pathway} />
        : <div className="rce-pane" style={{ padding: 40, textAlign: 'center', color: 'var(--text-400)', fontSize: 12 }}>Device intelligence not loaded</div>; }
      case 'pharma': { const P = W.PharmaIntelPanel; return P ? <P section={sec} pathway={pathway} />
        : <div className="rce-pane" style={{ padding: 40, textAlign: 'center', color: 'var(--text-400)', fontSize: 12 }}>Pharma intelligence not loaded</div>; }
      case 'protocol': { const P = W.ProtocolIntelPanel; return P ? <P section={sec} pathway={pathway} />
        : <div className="rce-pane" style={{ padding: 40, textAlign: 'center', color: 'var(--text-400)', fontSize: 12 }}>Protocol intelligence not loaded</div>; }
      case 'ana': return <AnaCopilot pathway={pathway as any} section={sec as any} busy={busy}
        onGenerate={() => doGenerate(deps)} onAction={(id: string) => doAction(deps, id)}
        onVerbApply={(v: string) => applyVerbDraft(deps, v, '', {})} onAttach={(p: any) => attachAction(deps, p)}
        messages={messages} onSend={(t: string, o: any) => sendAction(deps, t, o)} mode={mode} setMode={setMode}
        market={market as any} markets={markets} lang={lang} langInfo={langInfo} taLabel={taLabel} pid={pid}
        defaultFolder={sec.num} />;
      case 'dossier': return <DossierReadiness pathway={pathway as any} docMap={storeRef.current}
        allSecs={allSecs as any} lang={lang} />;
      case 'preflight': return <PreflightPane pre={preflight} sec={sec as any}
        onRun={() => doAction(deps, 'preflight')} onAction={(id: string) => doAction(deps, id)} />;
      case 'review': { const P = W.ReviewersEye; return P ? <P section={sec} pathway={pathway}
        html={storeRef.current[docKey] || ''} /> : <div className="rce-pane" style={{ padding: 40,
        textAlign: 'center', color: 'var(--text-400)', fontSize: 12 }}>Reviewer&apos;s Eye not loaded</div>; }
      case 'drift': return <FactDriftPane section={sec.id} />;
      case 'sources': return <SourcesPane section={sec.id} />;
      case 'trans': return <TranslationPane />;
      case 'comments': return <CommentsPane comments={curComments}
        onStatus={(id, s) => resolveComment(deps, id, s === 'resolved')}
        onAssign={(id, w) => assignComment(deps, id, w)} onReply={(id, t) => replyComment(deps, id, t)}
        onTask={(c: any, t: any) => commentToTask(deps, c, t)} team={RCE_TEAM} />;
      case 'versions': return <VersionsPane versions={curVersions} onSave={() => saveVersion(deps)}
        audit={curAudit} />;
      case 'outline': return <Outline html={storeRef.current[docKey] || REG_DOC[sec.id] || ''}
        onJump={(i: number) => { const h = bodyRef.current?.querySelectorAll('h1,h2,h3,h4')[i];
          if (h) h.scrollIntoView({ behavior: 'smooth', block: 'center' }); }} />;
      case 'governance': return <GovernancePane locked={isLocked} onLock={() => toggleLock(deps)}
        onSign={() => signSection(deps)} signed={isSigned}
        sigInfo={sigInfo ? { signer: sigInfo.who, meaning: sigInfo.meaning, when: sigInfo.stamp } : undefined}
        audit={curAudit} approvalPath={approvalPath} setApprovalPath={setApprovalPath} />;
      case 'prov': return <ProvenancePane sec={sec as any} html={storeRef.current[docKey] || ''}
        audit={curAudit} signed={isSigned} sigInfo={sigInfo} />;
      default: return null;
    }
  };

  if (view === 'cockpit') {
    const Ck = (window as any).RegCockpit || EditorCockpit;
    return (<div className="rce" ref={rootRef}>
      <Ck pathway={pathway as any} sections={allSecs as any} docMap={storeRef.current} lang={lang}
        market={market as any} langInfo={langInfo} taLabel={taLabel}
        onOpenSection={(id: string) => { setActive(id); setView('editor'); }} onNav={onNav}
        onAuthor={() => setView('studio')}
        onValidate={() => { setView('editor'); setDockOpen(true); setDockTab('preflight'); }} />
    </div>);
  }

  /* ── Studio view ── */
  if (view === 'studio') {
    return (
      <div className="rce rce-studio" ref={rootRef} style={{ display: 'flex' }}>
        <div className="rce-ana" style={{ flex: '0 0 380px', minWidth: 320, display: 'flex', flexDirection: 'column' }}>
          <AnaCopilot pathway={pathway as any} section={sec as any} busy={busy}
            onGenerate={() => doGenerate(deps)} onAction={(id: string) => doAction(deps, id)}
            onVerbApply={(v: string) => applyVerbDraft(deps, v, '', {})}
            onAttach={(p: any) => attachAction(deps, p)} messages={messages}
            onSend={(t: string, o: any) => sendAction(deps, t, o)} mode={mode} setMode={setMode}
            market={market as any} markets={markets} lang={lang} langInfo={langInfo}
            taLabel={taLabel} pid={pid} defaultFolder={sec.num} />
        </div>
        <div className="rce-desk" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderBottom: '1px solid var(--border)' }}>
            <button className="btn ghost" onClick={() => setView('editor')}>{I.arrowLeft} Editor</button>
            <span style={{ fontWeight: 600 }}>{sec.num} {sec.label}</span>
            <span style={{ flex: 1 }} />
            <button className="btn ghost" onClick={() => setView('cockpit')}>{I.layoutGrid} Cockpit</button>
          </div>
          <PdfDoc pathway={pathway as any} sections={allSecs as any} docMap={storeRef.current} lang={lang}
            active={active} onSelect={nav} stream={stream} busy={busy} market={market as any} langInfo={langInfo} />
        </div>
      </div>
    );
  }

  /* ── Editor view (default) ── */
  return (
    <div className="rce" data-tree={treeOpen || undefined} data-dock={dockOpen || undefined}
      data-narrow={narrow || undefined} data-focus={focusMode || undefined}
      ref={rootRef} onContextMenu={onContextMenu}>

      {/* Section tree */}
      <SectionTree pathway={pathway as any} active={active} onNav={nav} query={query} setQuery={setQuery}
        ta={taForPid} taList={REG_TA as any} onTa={(id: string) => setTaByPid(p => ({ ...p, [pid]: id }))}
        templates={(REG_TEMPLATES[pid] || []) as any}
        onAddTemplate={(t) => setAddedByPid(p => ({ ...p, [pid]: [...(p[pid] || []), t] }))}
        added={addedByPid[pid]} />

      {/* Canvas desk */}
      <div className="rce-desk">
        {/* Governance bar */}
        <div className="rce-gov-bar" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 16px', borderBottom: '1px solid var(--border)', fontSize: 12, flexWrap: 'wrap' }}>
          <span className="rce-ready" data-tone={readyMeta.tone}>{readyMeta.label}</span>
          <span className="rce-status-dot" data-dot={statusMeta.dot}>{statusMeta.label}</span>
          <PresenceCluster />
          <MarginCommentPins comments={curComments} onOpen={() => { setDockOpen(true); setDockTab('comments'); }} />
          {editedAfterSign && <span style={{ color: 'var(--warning)', fontWeight: 600, fontSize: 11 }}>Edited after sign</span>}
          <span style={{ flex: 1 }} />
          <SampleTag sample={true} />
          <button className="btn ghost" style={{ height: 26, fontSize: 11 }} onClick={() => setView('cockpit')}>{I.layoutGrid} Cockpit</button>
          <button className="btn ghost" style={{ height: 26, fontSize: 11 }} onClick={() => setView('studio')}>{I.sparkles} Studio</button>
        </div>

        {/* Toolbar */}
        {renderRibbon()}

        {/* Context bar */}
        <div className="rce-ctx-bar" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 16px', borderBottom: '1px solid var(--border)', fontSize: 12, color: 'var(--text-400)', flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 600, color: 'var(--text-100)' }}>{sec.num}</span>
          <span>{sec.label}</span>
          <span>{pathway.program} {'·'} {pathway.code}</span>
          <span>{market.agency} ({market.region})</span>
          {langInfo && <span>{langInfo.label}</span>}
          <span>{wordCount.toLocaleString()} words</span>
          {changeCount > 0 && <span>{changeCount} changes</span>}
          {savedAt && <span>Saved {savedAt}</span>}
          <span style={{ flex: 1 }} />
          <select value={editMode} onChange={e => setEditMode(e.target.value as any)} style={{ fontSize: 11, padding: '2px 6px' }}>
            <option value="edit">Editing</option><option value="suggest">Suggesting</option>
          </select>
          {markets.length > 1 && (
            <select value={marketId} onChange={e => switchMarket(e.target.value)} style={{ fontSize: 11, padding: '2px 6px' }}>
              {markets.map((m: any) => <option key={m.id} value={m.id}>{m.agency} ({m.region})</option>)}
            </select>
          )}
        </div>

        {/* Find & replace */}
        {findOpen && (
          <div style={{ display: 'flex', gap: 6, padding: '6px 16px', borderBottom: '1px solid var(--border)', fontSize: 12, alignItems: 'center' }}>
            <input placeholder="Find..." value={findText} onChange={e => setFindText(e.target.value)} style={{ flex: 1, height: 26 }} />
            <input placeholder="Replace..." value={replaceText} onChange={e => setReplaceText(e.target.value)} style={{ flex: 1, height: 26 }} />
            <button className="btn ghost" style={{ height: 26 }} onClick={() => {
              if (!findText || !bodyRef.current) return;
              bodyRef.current.innerHTML = bodyRef.current.innerHTML.replace(new RegExp(escRe(findText), 'g'), replaceText);
              saveCurrent();
            }}>Replace all</button>
            <button className="btn ghost" style={{ height: 26 }} onClick={() => setFindOpen(false)}>{I.x}</button>
          </div>
        )}

        {/* Document page */}
        <div className="rce-page" style={{ position: 'relative', flex: 1, overflow: 'auto' }}>
          {stream && <div className="rce-stream" style={{ padding: 16, whiteSpace: 'pre-wrap', color: 'var(--text-300)', fontStyle: 'italic', borderBottom: '1px solid var(--border)' }}>{stream}</div>}
          <div className="rce-body" ref={bodyRef} contentEditable={!isLocked} suppressContentEditableWarning
            onInput={saveCurrent} onMouseUp={onBodySelect} onKeyUp={onBodySelect}
            data-placeholder="Start writing or ask AnA to draft this section..." />
          {sel && <SelToolbar sel={sel} onAction={(id: string) => doAction(deps, id)} />}
          {ctx && (
            <div className="rce-ctx-menu" style={{ position: 'absolute', left: ctx.x, top: ctx.y, background: 'var(--bg-000)',
              border: '1px solid var(--border)', borderRadius: 8, padding: 4, boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
              zIndex: 200, minWidth: 160, display: 'flex', flexDirection: 'column', gap: 2 }} onClick={() => setCtx(null)}>
              <button className="rce-ctx-item" onClick={() => doAction(deps, 'refine')}>{I.sparkles} Refine with AnA</button>
              <button className="rce-ctx-item" onClick={() => addCitation()}>{I.link} Add citation</button>
              <button className="rce-ctx-item" onClick={() => exec('bold')}>{I.bold} Bold</button>
              <button className="rce-ctx-item" onClick={() => { setDockOpen(true); setDockTab('comments'); }}>{I.messageSquare} Comment</button>
              <button className="rce-ctx-item" onClick={() => downloadDocx(sec as any, pathway as any, market as any,
                bodyRef.current?.innerHTML || '')}>{I.download} Export DOCX</button>
            </div>
          )}
        </div>

        {/* Bottom action bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 16px', borderTop: '1px solid var(--border)', fontSize: 11, flexWrap: 'wrap' }}>
          <button className="btn primary" style={{ height: 28, fontSize: 11 }} disabled={busy || isLocked} onClick={() => doFullBuild(deps)}>{I.sparkles} Full build</button>
          <button className="btn ghost" style={{ height: 28, fontSize: 11 }} disabled={busy || isLocked} onClick={() => doGenerate(deps)}>{I.penLine} Draft</button>
          <button className="btn ghost" style={{ height: 28, fontSize: 11 }} disabled={busy} onClick={() => doExport(deps)}>{I.download} Export</button>
          <button className="btn ghost" style={{ height: 28, fontSize: 11 }} onClick={() => saveVersion(deps)}>{I.save} Save version</button>
          <span style={{ flex: 1 }} />
          <button className="btn ghost" style={{ height: 28, fontSize: 11 }} onClick={() => toggleLock(deps)}>{isLocked ? I.lock : I.unlock} {isLocked ? 'Unlock' : 'Lock'}</button>
          <button className="btn ghost" style={{ height: 28, fontSize: 11 }} onClick={() => signSection(deps)}>{I.shieldCheck} Sign</button>
          <button className={'btn ghost' + (dockOpen ? ' active' : '')} style={{ height: 28, fontSize: 11 }} onClick={() => setDockOpen(o => !o)}>{I.panelRight} Dock</button>
        </div>
      </div>

      {/* Dock panel */}
      {dockOpen && (
        <div className="rce-dock">
          <div className="rce-dock-tabs" style={{ display: 'flex', flexWrap: 'wrap', gap: 2, padding: '6px 8px', borderBottom: '1px solid var(--border)' }}>
            {DOCK_TABS.map(t => (
              <button key={t.id} className={'tbtn' + (dockTab === t.id ? ' active' : '')} title={t.label}
                onClick={() => setDockTab(t.id)}>
                {(I as Record<string, React.ReactNode>)[t.icon]}
                {!narrow && <span style={{ fontSize: 10 }}>{t.label}</span>}
              </button>
            ))}
          </div>
          <div className="rce-dock-body" style={{ flex: 1, overflow: 'auto' }}>
            {renderDockContent()}
          </div>
        </div>
      )}

      {compareOpen && redline && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => { setCompareOpen(false); setRedline(null); }}>
          <div style={{ background: 'var(--bg-000)', borderRadius: 12, padding: 24, maxWidth: 800, maxHeight: '80vh', overflow: 'auto', width: '90%' }} onClick={e => e.stopPropagation()}>
            <h3>Baseline comparison: {redline.label}</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
              <div><h4>Approved baseline</h4><div dangerouslySetInnerHTML={{ __html: redline.before || '<em>No baseline</em>' }} /></div>
              <div><h4>Current draft</h4><div dangerouslySetInnerHTML={{ __html: redline.after || '<em>Empty</em>' }} /></div>
            </div>
          </div>
        </div>
      )}

      {/* Sign modal */}
      {showSign && <SignModal sec={sec as any} pathway={pathway as any}
        onCancel={() => setShowSign(false)} onSign={(d: any) => signAction(deps, d)} />}
    </div>
  );
}
