import React, { useRef, useEffect, useState } from 'react';
import { I } from '../icons';

/* ----------------------------------------------------------------
   Build-with-AnA Studio pieces -- used by the RegStudio layout.
   - PdfDoc: read-only, PDF/pleading-style render of a section
     (line gutter, live streaming while AnA drafts, page badge)
   - DELIB_STEPS: the deliberation script AnA "thinks" through
   - downloadDocx: real Word-compatible download of the current section
   - SelToolbar / SEL_ACTIONS: paragraph-level selection actions
   - buildDocxScript: python-docx code block for the conversation
   ---------------------------------------------------------------- */

/* ----- Shared types ----- */

interface Section {
  id: string;
  num: string;
  label: string;
  status: string;
}

interface Pathway {
  program: string;
  code: string;
}

interface Market {
  agency: string;
  region: string;
}

interface LangInfo {
  label: string;
}

interface DelibStep {
  kind: 'thinking' | 'tool' | 'step';
  label: string;
  sub: string;
}

interface SelectionAction {
  id: string;
  label: string;
  icon: React.ReactElement;
}

interface Selection {
  left: number;
  top: number;
  text: string;
}

/* ----- Deliberation steps ----- */

export function DELIB_STEPS(sec: Section, mode: string, market: Market | null): DelibStep[] {
  return [
    { kind: 'thinking', label: 'Reading the section evidence & controlled vocabulary', sub: 'Thinking' },
    { kind: 'tool', label: 'search_precedents -- ' + (market ? market.agency : 'agency') + ' approved analogues', sub: 'Tool' },
    { kind: 'tool', label: 'retrieve_evidence -- linked sources for ' + sec.num, sub: 'Tool' },
    { kind: 'step', label: 'Drafting ' + sec.num + ' ' + sec.label, sub: 'Author -- ' + mode },
    { kind: 'tool', label: 'check_claims_vs_evidence', sub: 'Validate' },
    { kind: 'step', label: 'Reconciling citations, units & confidence', sub: 'Author' },
  ];
}

/* ----- Word-compatible download ----- */

export function downloadDocx(sec: Section, pathway: Pathway, market: Market, html: string): void {
  const styles =
    'body{font-family:Georgia,serif;font-size:11pt;line-height:1.6;color:#1a1a1a}'
    + 'h1{font-size:16pt}h2{font-size:13pt}'
    + 'table{border-collapse:collapse}td,th{border:1px solid #999;padding:5px 9px;font-family:Calibri,Arial,sans-serif;font-size:10pt}'
    + '.cite{font-family:Consolas,monospace;font-size:9pt;color:#2a5db0}'
    + 'ins{color:#2c6e1f;text-decoration:none}del{color:#b42318}';

  const head =
    '<h1>' + sec.label + '</h1>'
    + '<p style="color:#666;font-family:Calibri,Arial,sans-serif;font-size:9pt">'
    + pathway.program + ' -- ' + pathway.code + ' -- ' + sec.num + ' -- ' + market.agency
    + ' (' + market.region + ')</p><hr/>';

  const doc =
    "<html xmlns:o='urn:schemas-microsoft-com:office:office'"
    + " xmlns:w='urn:schemas-microsoft-com:office:word'"
    + " xmlns='http://www.w3.org/TR/REC-html40'>"
    + '<head><meta charset="utf-8"><style>' + styles + '</style></head>'
    + '<body>' + head + (html || '<p>(empty section)</p>') + '</body></html>';

  const blob = new Blob(['﻿' + doc], { type: 'application/msword' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = (pathway.code + '_' + sec.num + '_' + sec.label).replace(/[^\w.-]+/g, '_') + '.doc';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/* ----- PdfDoc: PDF / pleading-style renderer ----- */

interface PdfDocProps {
  pathway: Pathway & { code: string };
  sections: Section[];
  docMap: Record<string, string>;
  lang: string;
  active: string;
  onSelect: (id: string) => void;
  stream: string;
  busy: boolean;
  market: Market;
  langInfo: LangInfo;
}

export function PdfDoc({
  pathway, sections, docMap, lang, active, onSelect, stream, busy, market, langInfo,
}: PdfDocProps): React.ReactElement {
  const deskRef = useRef<HTMLDivElement | null>(null);
  const pageRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const activeIdx = Math.max(0, sections.findIndex(s => s.id === active));

  /* Scroll the active page into view when the section changes */
  useEffect(() => {
    const d = deskRef.current;
    const p = pageRefs.current[active];
    if (d && p) {
      d.scrollTop = Math.max(0, p.offsetTop - 24);
    }
  }, [active]);

  /* Follow the streaming draft on the active page */
  useEffect(() => {
    const d = deskRef.current;
    if (busy && d) {
      const p = pageRefs.current[active];
      if (p) {
        d.scrollTop = p.offsetTop + p.offsetHeight;
      }
    }
  }, [stream, busy, active]);

  const nums: number[] = [];
  for (let i = 1; i <= 26; i++) nums.push(i);

  return (
    <div className="rst-desk" ref={deskRef}>
      {sections.map((s, idx) => {
        const html = docMap[s.id + '::' + lang] || '';
        const empty = !html || !html.trim();
        const isA = s.id === active;
        return (
          <div
            key={s.id}
            className="rst-page"
            data-active={isA || undefined}
            ref={(el) => { pageRefs.current[s.id] = el; }}
          >
            <div className="rst-lines">
              {nums.map(n => <span key={n}>{n}</span>)}
            </div>
            <div className="rst-page-in">
              <button className="rst-mast" onClick={() => onSelect(s.id)}>
                <div className="num">{pathway.code} {'  '} {s.num}</div>
                <h1>{s.label}</h1>
                <div className="meta">{market.agency} {'  '} {market.region} {'  '} {langInfo.label}</div>
              </button>
              {!empty && (
                <div className="rce-body rst-read" dangerouslySetInnerHTML={{ __html: html }} />
              )}
              {isA && busy && (
                <div className="rce-gen">
                  <div className="rce-gen-lbl">
                    <span className="spin" />
                    AnA is drafting {s.num} from the section evidence...
                  </div>
                  <p>{stream}<span className="rce-caret" /></p>
                </div>
              )}
              {empty && !(isA && busy) && (
                <div className="rst-empty">
                  {isA
                    ? (
                      <>
                        <div className="rst-empty-mark">{'✻'}</div>
                        <p>
                          This page is blank. Ask AnA to draft{' '}
                          <strong>{s.num} {s.label}</strong> -- you will watch it build here.
                        </p>
                      </>
                    )
                    : (
                      <button className="rst-empty-min" onClick={() => onSelect(s.id)}>
                        {'Empty -- select to draft ' + s.num}
                      </button>
                    )}
                </div>
              )}
            </div>
            <div className="rst-pagenum">{idx + 1}</div>
          </div>
        );
      })}
      <div className="rst-pagebadge">Page {activeIdx + 1} / {sections.length}</div>
    </div>
  );
}

/* ----- python-docx build script (shown as a code block in conversation) ----- */

export function buildDocxScript(sec: Section, pathway: Pathway, market: Market): string {
  const safe = (sec.label || '').replace(/'/g, '');
  return `# author_docx_native -- python-docx runtime
from docx import Document
from docx.shared import Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH

doc = Document()
styles = doc.styles
styles['Normal'].font.name = 'Georgia'
styles['Normal'].font.size = Pt(11)

# masthead -- ${pathway.code} -- ${sec.num}
h = doc.add_heading('${safe}', level=1)
meta = doc.add_paragraph('${pathway.program} -- ${market.agency} (${market.region})')
meta.runs[0].font.size = Pt(8); meta.runs[0].font.color.rgb = RGBColor(0x6b,0x6b,0x6b)

# stream section paragraphs from the governed artifact model
for para in section_paragraphs:            # <- linked evidence + controlled vocab
    p = doc.add_paragraph(para['text'])
    if para.get('table'): _render_table(doc, para['table'])
    if para.get('cite'):  _anchor_citation(p, para['cite'])

doc.save(output_path)                       # -> base64 .docx`;
}

/* ----- Selection actions ----- */

export function SEL_ACTIONS(): SelectionAction[] {
  return [
    { id: 'strengthen', label: 'Strengthen', icon: I.wand },
    { id: 'tighten',    label: 'Tighten',    icon: I.type },
    { id: 'precedent',  label: 'Precedent',  icon: I.telescope },
    { id: 'cite',       label: 'Cite',       icon: I.quote },
    { id: 'regenerate', label: 'Regenerate', icon: I.redo },
    { id: 'comment',    label: 'Comment',    icon: I.messageSquare },
    { id: 'flag',       label: 'Flag',       icon: I.alertTriangle },
  ];
}

/* ----- Selection toolbar ----- */

interface SelToolbarProps {
  sel: Selection | null;
  onAction: (actionId: string, text: string) => void;
}

export function SelToolbar({ sel, onAction }: SelToolbarProps): React.ReactElement | null {
  const ref = useRef<HTMLDivElement | null>(null);
  const [adj, setAdj] = useState<{ left: number; top: number } | null>(null);

  useEffect(() => {
    setAdj(null);
  }, [sel && sel.left, sel && sel.top]);

  useEffect(() => {
    if (!sel || !ref.current) return;
    const w = ref.current.offsetWidth;
    const h = ref.current.offsetHeight;
    const m = 8;
    const left = Math.min(Math.max(sel.left, w / 2 + m), window.innerWidth - w / 2 - m);
    let top = sel.top - h - 10;
    if (top < m) top = sel.top + 22; // flip below if clipped at top
    setAdj({ left, top });
  }, [sel]);

  if (!sel) return null;

  const acts = SEL_ACTIONS();
  const pos = adj || { left: sel.left, top: sel.top - 46 };

  return (
    <div
      className="rce-seltb"
      ref={ref}
      style={{ top: pos.top, left: pos.left, visibility: adj ? 'visible' : 'hidden' }}
      onMouseDown={e => e.preventDefault()}
    >
      {acts.map(a => (
        <button
          key={a.id}
          className="rce-seltb-b"
          title={a.label}
          onClick={() => onAction(a.id, sel.text)}
        >
          <span className="rce-seltb-ic">{a.icon}</span>
          <span className="rce-seltb-l">{a.label}</span>
        </button>
      ))}
    </div>
  );
}
