/* ================================================================
   EditorCanvas.tsx -- DocCanvas: shared live document editing canvas
   Used by DeviceSubmission, ProtocolWorkspace, and any surface that
   needs a Word-class editing area without the full RegEditor shell.
   ================================================================ */

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
// Select any passage, right-click, see where it came from.
import { DataOriginsMenu } from '../../lineage';

/* ── Interfaces ────────────────────────────────────────────────── */

interface ProvBlock {
  src?: string;
  source?: string;
  conf?: string;
  audit?: string;
}

interface ContentBlock {
  h?: string;
  p?: string;
  prov?: ProvBlock;
}

interface Section {
  id?: string;
  num?: string;
  number?: string;
  title?: string;
  label?: string;
  status?: string;
  guidance?: string;
  ref?: string;
}

interface Market {
  agency: string;
  region: string;
}

interface DocCanvasProps {
  sec?: Section;
  blocks?: ContentBlock[];
  code?: string;
  context?: string;
  onAsk?: (prompt: string) => void;
  storageKey?: string;
  market?: Market;
  onExport?: () => void;
  /* Optional durable-persistence seam. When a parent that owns a real backend
     document supplies this, edits are written through it (e.g. PATCH
     /api/c2c/documents/:id/sections/:key) and the footer reports true save
     state. Without it the canvas caches to localStorage only and says so
     honestly ("Saved on this device") rather than implying server persistence. */
  onSave?: (html: string) => void | Promise<void>;
  /* The exact text this section's data lineage was recorded against.
     Supplied so "Data Origins" can REFUSE when the canvas is rendering
     something else — this editor persists HTML while lineage offsets are
     recorded against the saved content, and answering from mismatched text
     would report the provenance of the wrong words. Omitted, the drift check
     is simply inactive. */
  lineageCanonicalText?: string;
}

/* ── Helpers ───────────────────────────────────────────────────── */

function blocksToHtml(blocks: ContentBlock[]): string {
  if (!blocks || !blocks.length) return '';
  return blocks.map(b => {
    const heading = b.h ? `<h2>${b.h}</h2>` : '';
    const body    = b.p ? `<p>${b.p}</p>` : '';
    const prov    = b.prov
      ? `<div class="dc-prov"><span class="dc-prov-src">${b.prov.src || b.prov.source || ''}</span><span class="dc-prov-conf" data-c="${(b.prov.conf || '').toLowerCase()}">${b.prov.conf || ''}</span><span class="dc-prov-audit">${b.prov.audit || ''}</span></div>`
      : '';
    return heading + body + prov;
  }).join('\n');
}

function countWords(el: HTMLElement | null): number {
  if (!el) return 0;
  const txt = (el.textContent || el.innerText || '').trim();
  return txt ? txt.split(/\s+/).filter(Boolean).length : 0;
}

/* Honest save-state labels. 'saved' and 'local' are both durable-green, but only
   a backend-persisted write may claim "All changes saved"; localStorage-only
   work is labelled device-local so a regulated author is never misled into
   thinking a draft reached the server. */
type SaveState = 'saved' | 'saving' | 'error' | 'local';
const SAVE_META: Record<SaveState, { dot: string; label: string }> = {
  saved:  { dot: 'var(--success)', label: 'All changes saved' },
  saving: { dot: 'var(--warning)', label: 'Saving…' },
  error:  { dot: 'var(--error)',   label: 'Save failed — kept on this device' },
  local:  { dot: 'var(--success)', label: 'Saved on this device' },
};

/* ── DocCanvas ─────────────────────────────────────────────────── */

export function DocCanvas({ sec, blocks, code, context, onAsk, storageKey, market, onExport, onSave, lineageCanonicalText }: DocCanvasProps) {
  const bodyRef  = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [saveState, setSaveState] = useState<SaveState>(onSave ? 'saved' : 'local');
  const [words,  setWords]  = useState(0);
  const [track,  setTrack]  = useState(false);
  const [style,  setStyle]  = useState('p');

  const key      = storageKey || (sec && (sec.id || sec.num)) || 'dc-default';
  const secNum   = (sec && (sec.num   || sec.number || '')) || '';
  const secTitle = (sec && (sec.title || sec.label  || '')) || '';
  const guidance = (sec && (sec.guidance || sec.ref || '')) || '';
  const isLocked = !!(sec && sec.status === 'approved');

  /* ── Mount: load persisted or seed from blocks ────────────── */
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const persisted = localStorage.getItem('dc::' + key);
    if (persisted) {
      el.innerHTML = persisted;
    } else if (blocks && blocks.length) {
      el.innerHTML = blocksToHtml(blocks);
    } else {
      el.innerHTML = '';
    }
    setWords(countWords(el));
    setStyle('p');
  }, [key]);

  /* ── Save (debounced 800 ms) ─────────────────────────────── */
  const save = useCallback(() => {
    setSaveState('saving');
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      const el = bodyRef.current;
      if (!el) return;
      const html = el.innerHTML;
      // Always keep a local cache so a reload never loses in-progress work.
      try { localStorage.setItem('dc::' + key, html); } catch { /* storage full */ }
      setWords(countWords(el));
      if (onSave) {
        // A real backend document is wired — write through and report the truth.
        try { await onSave(html); setSaveState('saved'); }
        catch { setSaveState('error'); }
      } else {
        // No backend binding for this surface yet — cached on this device only.
        setSaveState('local');
      }
    }, 800);
  }, [key, onSave]);

  /* ── Formatting ─────────────────────────────────────────── */
  const exec = (cmd: string, val?: string) => {
    document.execCommand(cmd, false, val || undefined);
    bodyRef.current?.focus();
    save();
  };
  const setBlock = (tag: string) => { exec('formatBlock', tag); setStyle(tag); };

  /* ── AnA draft ─────────────────────────────────────────────
     Sends a real drafting request to the live AnA co-author (onAsk → the
     shell's /api/ana-ri/stream rail), which streams the grounded draft in the
     conversation. No canned content is fabricated into the page or persisted —
     the previous local SEED + simulated progress claimed provenance that never
     existed. */
  const generate = () => {
    if (!onAsk) return;
    onAsk(`Draft §${secNum} — ${secTitle}${guidance ? ' per ' + guidance : ''}${context ? ' for ' + context : ''}.`);
  };

  const isEmpty = useMemo(() => {
    const el = bodyRef.current;
    if (!el) return !blocks || !blocks.length;
    return el.innerHTML.replace(/<[^>]+>/g, '').trim().length < 5;
  }, [words, blocks]);

  /* ── Style dropdown tracking ─────────────────────────────── */
  const onSelChange = () => {
    try {
      const sel = window.getSelection();
      const node = sel?.focusNode;
      if (!node) return;
      const el = node.nodeType === 1 ? (node as HTMLElement) : (node as Text).parentElement;
      const block = el?.closest('h1,h2,h3,h4,p');
      if (block) setStyle(block.tagName.toLowerCase());
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="dc-root" style={{display:'flex',flexDirection:'column',height:'100%',background:'var(--bg-100)',overflow:'hidden'}}>

      {/* ── Mini ribbon ───────────────────────────────────────── */}
      {!isLocked && (
        <div className="dc-ribbon" style={{display:'flex',alignItems:'center',gap:2,padding:'4px 8px',background:'var(--bg-000)',borderBottom:'1px solid var(--border)',flexShrink:0,flexWrap:'wrap'}}>
          <select value={style} onChange={e => setBlock(e.target.value)}
            style={{fontSize:11,border:'1px solid var(--border)',borderRadius:4,padding:'2px 6px',background:'var(--bg-50)',color:'var(--text-100)',cursor:'pointer',height:24}}>
            <option value="p">Paragraph</option>
            <option value="h1">Heading 1</option>
            <option value="h2">Heading 2</option>
            <option value="h3">Heading 3</option>
          </select>
          <span style={{width:1,height:18,background:'var(--border)',margin:'0 3px'}}/>
          {([['bold','B',{fontWeight:700}],['italic','I',{fontStyle:'italic' as const}],['underline','U',{textDecoration:'underline'}]] as const).map(([cmd,lbl,st]) => (
            <button key={cmd} onMouseDown={e => { e.preventDefault(); exec(cmd); }}
              style={{width:24,height:24,fontSize:12,fontFamily:'Georgia,serif',border:'1px solid transparent',borderRadius:4,background:'transparent',cursor:'pointer',color:'var(--text-200)',display:'flex',alignItems:'center',justifyContent:'center',...st}}>
              {lbl}
            </button>
          ))}
          <span style={{width:1,height:18,background:'var(--border)',margin:'0 3px'}}/>
          <button onMouseDown={e => { e.preventDefault(); exec('undo'); }} title="Undo" style={{width:24,height:24,fontSize:11,border:'1px solid transparent',borderRadius:4,background:'transparent',cursor:'pointer',color:'var(--text-300)'}}>
            {'↩'}
          </button>
          <button onMouseDown={e => { e.preventDefault(); exec('redo'); }} title="Redo" style={{width:24,height:24,fontSize:11,border:'1px solid transparent',borderRadius:4,background:'transparent',cursor:'pointer',color:'var(--text-300)'}}>
            {'↪'}
          </button>
          <span style={{width:1,height:18,background:'var(--border)',margin:'0 3px'}}/>
          <button onMouseDown={e => { e.preventDefault(); exec('insertUnorderedList'); }} title="Bullet list" style={{width:24,height:24,fontSize:13,border:'1px solid transparent',borderRadius:4,background:'transparent',cursor:'pointer',color:'var(--text-300)'}}>
            {'☰'}
          </button>
          <button onMouseDown={e => { e.preventDefault(); }} onClick={() => {
            const s = window.getSelection()?.toString();
            if (s && onAsk) onAsk('Cite this claim: "' + s + '"');
          }} title="Insert citation" style={{fontSize:10,padding:'0 6px',height:24,border:'1px solid transparent',borderRadius:4,background:'transparent',cursor:'pointer',color:'var(--text-300)'}}>
            Cite
          </button>
          <span style={{flex:1}}/>
          <label style={{display:'flex',alignItems:'center',gap:4,fontSize:10,color:'var(--text-400)',cursor:'pointer'}}>
            <input type="checkbox" checked={track} onChange={e => setTrack(e.target.checked)} style={{width:12,height:12}}/> Track
          </label>
          {onExport && (
            <button onClick={onExport} style={{fontSize:10,padding:'0 8px',height:24,border:'1px solid var(--border)',borderRadius:4,background:'var(--bg-100)',color:'var(--text-300)',cursor:'pointer'}}>Export</button>
          )}
        </div>
      )}

      {/* ── White page on gray desk ───────────────────────────── */}
      <div className="dc-desk" style={{flex:1,overflowY:'auto',background:'var(--bg-100)',padding:'24px 20px',display:'flex',justifyContent:'center',alignItems:'flex-start'}}>
        <div className="dc-page" style={{width:'100%',maxWidth:820,minHeight:480,background:'var(--bg-000)',borderRadius:3,boxShadow:'0 2px 12px rgba(0,0,0,0.08)',padding:'40px 52px 60px'}}>

          {/* Page masthead */}
          <div className="dc-mast" style={{marginBottom:28,paddingBottom:16,borderBottom:'1px solid var(--bg-100)'}}>
            <div style={{fontSize:10,color:'var(--text-400)',fontWeight:500,letterSpacing:0.5,textTransform:'uppercase',marginBottom:6}}>
              {code && <span>{code} {'·'} </span>}{context && <span>{context} {'·'} </span>}
              {market && <span>{market.agency} {'·'} {market.region}</span>}
            </div>
            <div style={{display:'flex',alignItems:'flex-start',gap:12}}>
              <div>
                {secNum && <div style={{fontSize:11,fontWeight:600,color:'var(--text-400)',marginBottom:4}}>{'§'} {secNum}</div>}
                <h1 style={{fontSize:20,fontWeight:700,margin:0,lineHeight:1.25,color:'var(--text-100)'}}>{secTitle}</h1>
              </div>
              <div style={{marginLeft:'auto',flexShrink:0}}>
                {sec && sec.status && (
                  <span style={{fontSize:10,padding:'3px 8px',borderRadius:10,fontWeight:600,
                    background: sec.status === 'approved' ? 'oklch(0.96 0.05 145)' : sec.status === 'complete' ? 'oklch(0.96 0.05 145)' : sec.status === 'review' ? 'oklch(0.96 0.04 90)' : 'var(--bg-200)',
                    color: sec.status === 'approved' || sec.status === 'complete' ? 'var(--success)' : sec.status === 'review' ? 'var(--warning)' : 'var(--text-400)'}}>
                    {sec.status.replace(/_/g, ' ')}
                  </span>
                )}
              </div>
            </div>
            {guidance && (
              <div style={{display:'flex',alignItems:'center',gap:6,marginTop:10,padding:'6px 10px',background:'var(--bg-50)',borderRadius:5,border:'1px solid var(--bg-200)'}}>
                <span style={{fontSize:10,color:'var(--text-400)'}}>Per</span>
                <span style={{fontSize:10,fontWeight:600,color:'var(--text-300)'}}>{guidance}</span>
              </div>
            )}
          </div>

          {/* Body -- contentEditable */}
          {isEmpty && !isLocked ? (
            <div style={{padding:'32px 0 16px',borderTop:'1px solid var(--bg-100)'}}>
              <p style={{fontSize:12,color:'var(--text-400)',margin:'0 0 12px',lineHeight:1.6}}>
                No content for {secNum ? '§' + secNum : secTitle}.{guidance ? ' Per ' + guidance + '.' : ''} Begin drafting or use AnA.
              </p>
              <button onClick={generate} style={{fontSize:11,padding:'5px 12px',borderRadius:4,border:'1px solid var(--border)',background:'var(--bg-50)',color:'var(--text-300)',cursor:'pointer'}}>
                Draft with AnA
              </button>
            </div>
          ) : null}

          {/* Right-click any selection here for its data origins. Wrapping the
              body rather than the whole canvas keeps the toolbar and status
              chrome out of the offset arithmetic. */}
          <DataOriginsMenu
            documentTable="authoring_sections"
            documentId={String((sec && sec.id) || key)}
            documentTitle={secTitle || undefined}
            canonicalText={lineageCanonicalText}
          >
            <div
              ref={bodyRef}
              contentEditable={!isLocked}
              suppressContentEditableWarning={true}
              spellCheck={false}
              onInput={save}
              onBlur={save}
              onKeyUp={onSelChange}
              onClick={onSelChange}
              data-track={track || undefined}
              style={{
                outline:'none',
                fontSize:14,
                lineHeight:1.75,
                color:'var(--text-100)',
                minHeight: isEmpty ? 0 : 320,
                fontFamily:'Georgia, "Times New Roman", serif',
                display: (isEmpty && !isLocked) ? 'none' : 'block',
              }}
            />
          </DataOriginsMenu>

          {isLocked && (
            <div style={{marginTop:16,display:'flex',alignItems:'center',gap:8,padding:'8px 12px',background:'oklch(0.97 0.02 145)',borderRadius:6,border:'1px solid oklch(0.92 0.04 145)'}}>
              <span style={{fontSize:11,fontWeight:700,color:'var(--success)'}}>Locked</span>
              <span style={{fontSize:11,color:'var(--success)',fontWeight:500}}>Section approved — locked for editing</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Footer ────────────────────────────────────────────── */}
      <div className="dc-foot" style={{display:'flex',alignItems:'center',gap:10,padding:'6px 16px',background:'var(--bg-000)',borderTop:'1px solid var(--border)',flexShrink:0,fontSize:10,color:'var(--text-400)'}}>
        <span style={{display:'flex',alignItems:'center',gap:5}}>
          <span style={{width:6,height:6,borderRadius:'50%',background:SAVE_META[saveState].dot,display:'inline-block'}}/>
          {SAVE_META[saveState].label}
        </span>
        <span style={{color:'var(--bg-200)'}}>{'·'}</span>
        <span>{words.toLocaleString()} words</span>
        <span style={{color:'var(--bg-200)'}}>{'·'}</span>
        <span>{Math.max(1, Math.round(words / 200))} min read</span>
        {track && <><span style={{color:'var(--bg-200)'}}>{'·'}</span><span style={{color:'var(--warning)',fontWeight:600}}>Track changes on</span></>}
        <span style={{flex:1}}/>
        {!isLocked && !isEmpty && onAsk && (
          <button onClick={generate} style={{fontSize:10,padding:'3px 10px',borderRadius:4,border:'1px solid var(--accent-100)',color:'var(--accent-100)',background:'rgba(37,99,235,0.06)',cursor:'pointer',fontWeight:600}}>
            Regenerate
          </button>
        )}
      </div>

      <style>{`
        .dc-page h1 { font-size:18px; font-weight:700; margin:0 0 4px; color:var(--text-100); }
        .dc-page h2 { font-size:15px; font-weight:700; margin:20px 0 8px; color:var(--text-100); }
        .dc-page h3 { font-size:13px; font-weight:600; margin:16px 0 6px; color:var(--text-200); }
        .dc-page p  { margin:0 0 12px; font-size:14px; line-height:1.75; color:var(--text-100); }
        .dc-page ul,.dc-page ol { margin:0 0 12px 24px; }
        .dc-page li { margin-bottom:6px; font-size:14px; line-height:1.6; }
        .dc-page table { width:100%; border-collapse:collapse; margin:16px 0; font-size:13px; }
        .dc-page th { padding:8px 12px; background:var(--bg-50); border:1px solid var(--border); font-weight:600; text-align:left; }
        .dc-page td { padding:7px 12px; border:1px solid var(--border); }
        .dc-prov { display:flex; gap:8px; align-items:center; padding:3px 8px; background:var(--bg-50); border-left:2px solid var(--accent-100); border-radius:0 4px 4px 0; margin:4px 0 12px; font-size:10px; color:var(--text-400); }
        .dc-prov-src { font-weight:500; color:var(--text-300); }
        .dc-prov-conf[data-c="hi"] { color:var(--success); font-weight:600; }
        .dc-prov-conf[data-c="med"] { color:var(--warning); font-weight:600; }
        .dc-prov-conf[data-c="lo"] { color:var(--error); font-weight:600; }
        .dc-prov-audit { font-family:monospace; font-size:9px; }
        [data-track] ins { background:color-mix(in srgb,var(--success) 18%,transparent); text-decoration:underline; color:var(--success); }
        [data-track] del { background:color-mix(in srgb,var(--error) 14%,transparent); text-decoration:line-through; color:var(--error); }
        @keyframes pulse { 0%,100%{opacity:.5} 50%{opacity:1} }
        @keyframes slide { 0%{transform:translateX(-100%)} 100%{transform:translateX(200%)} }
      `}</style>
    </div>
  );
}
