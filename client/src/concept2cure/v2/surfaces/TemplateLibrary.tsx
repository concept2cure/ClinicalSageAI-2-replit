import React, { useState } from 'react';
import { I } from '../icons';
import { SampleTag } from '../dataConnect';
import type { SurfaceViewProps } from '../surfaceViews';
import '../styles/project-home-v2.css';

/* ── TemplateSpec types (templateSpec.ts) ── */

interface PageSpec {
  size: string;
  orientation: string;
  marginsInches: { top: number; bottom: number; left: number; right: number };
}

interface TypographySpec {
  bodyFont: string;
  headingFont: string;
  monoFont: string;
  bodySizePt: number;
  heading1SizePt: number;
  heading2SizePt: number;
  heading3SizePt: number;
  lineSpacing: number;
  paragraphSpaceAfterPt: number;
}

interface ColorSpec {
  text: string;
  muted: string;
  accent: string;
  tableHeaderBg: string;
  tableBorder: string;
}

interface BrandSpec {
  organizationName: string;
  confidentialityNotice: string;
  logo: { present: boolean; placement: string };
}

interface HeaderSpec { text: string; showLogo: boolean; alignment: string }
interface FooterSpec { text: string; showPageNumbers: boolean; pageNumberFormat: string }
interface TableSpec { headerBold: boolean; borderSizePt: number }
interface FormField { key: string; label: string; type: string; required: boolean }
interface NamedStyle { styleId: string; name: string; font: string; sizePt: number; bold?: boolean; italic?: boolean; color?: string }

interface TemplateSpec {
  specVersion: number;
  page: PageSpec;
  typography: TypographySpec;
  colors: ColorSpec;
  brand: BrandSpec;
  header: HeaderSpec;
  footer: FooterSpec;
  table: TableSpec;
  formFields: FormField[];
  namedStyles: NamedStyle[];
}

interface TemplateRecord {
  id: string;
  name: string;
  description: string;
  sourceFileName: string;
  sourceFileType: string;
  verified: boolean;
  extractionConfidence: number;
  extractionWarnings: string[];
  docTypes: string[];
  updatedAt: string;
  spec: TemplateSpec;
  _new?: boolean;
}

/* ── Fixture data — real TemplateSpec shape ── */

const DEFAULT_SPEC: TemplateSpec = {
  specVersion: 1,
  page: { size: 'letter', orientation: 'portrait', marginsInches: { top: 1, bottom: 1, left: 1.25, right: 1 } },
  typography: { bodyFont: 'Times New Roman', headingFont: 'Arial', monoFont: 'Courier New', bodySizePt: 12, heading1SizePt: 16, heading2SizePt: 14, heading3SizePt: 12, lineSpacing: 1.15, paragraphSpaceAfterPt: 6 },
  colors: { text: '1A1A1A', muted: '666666', accent: 'D97757', tableHeaderBg: 'E2E8F0', tableBorder: 'BBBBBB' },
  brand: { organizationName: 'Concept2Cure', confidentialityNotice: 'CONFIDENTIAL — For Regulatory Use Only', logo: { present: true, placement: 'header' } },
  header: { text: 'Concept2Cure - {docType}', showLogo: true, alignment: 'right' },
  footer: { text: '', showPageNumbers: true, pageNumberFormat: 'Page {PAGE} of {PAGES}' },
  table: { headerBold: true, borderSizePt: 0.5 },
  formFields: [], namedStyles: [],
};

const TL_FIXTURE: TemplateRecord[] = [
  { id: 'tpl-house-ctd', name: 'Concept2Cure House Style — CTD', description: 'Corporate CTD/eCTD body template', sourceFileName: 'C2C_CTD_house_style.docx', sourceFileType: 'docx', verified: true, extractionConfidence: 0.95, extractionWarnings: [], docTypes: ['CTD', 'eCTD', 'NDA', 'BLA'], updatedAt: '2026-04-30',
    spec: { specVersion: 1, page: { size: 'letter', orientation: 'portrait', marginsInches: { top: 1, bottom: 1, left: 1.25, right: 1 } }, typography: { bodyFont: 'Times New Roman', headingFont: 'Arial', monoFont: 'Consolas', bodySizePt: 12, heading1SizePt: 16, heading2SizePt: 14, heading3SizePt: 12, lineSpacing: 1.15, paragraphSpaceAfterPt: 6 }, colors: { text: '1A1A1A', muted: '666666', accent: '2A6FDB', tableHeaderBg: 'E8EDF3', tableBorder: 'BBBBBB' }, brand: { organizationName: 'Concept2Cure', confidentialityNotice: 'CONFIDENTIAL — For Regulatory Use Only', logo: { present: true, placement: 'header' } }, header: { text: 'Concept2Cure - {docType} - Confidential', showLogo: true, alignment: 'left' }, footer: { text: '{program}', showPageNumbers: true, pageNumberFormat: 'Page {PAGE} of {PAGES}' }, table: { headerBold: true, borderSizePt: 0.5 }, formFields: [], namedStyles: [{ styleId: 'Normal', name: 'Normal', font: 'Times New Roman', sizePt: 12 }, { styleId: 'Heading1', name: 'Heading 1', font: 'Arial', sizePt: 16, bold: true, color: '2A6FDB' }, { styleId: 'Heading2', name: 'Heading 2', font: 'Arial', sizePt: 14, bold: true }, { styleId: 'Caption', name: 'Caption', font: 'Arial', sizePt: 9, italic: true, color: '666666' }] } },
  { id: 'tpl-estar-cover', name: 'FDA eSTAR Cover Letter', description: '510(k) cover letter, CDRH format', sourceFileName: 'eSTAR_cover_letter.docx', sourceFileType: 'docx', verified: true, extractionConfidence: 0.9, extractionWarnings: [], docTypes: ['510(k)', 'eSTAR'], updatedAt: '2026-04-22',
    spec: { specVersion: 1, page: { size: 'letter', orientation: 'portrait', marginsInches: { top: 1, bottom: 1, left: 1.25, right: 1.25 } }, typography: { bodyFont: 'Calibri', headingFont: 'Calibri', monoFont: 'Consolas', bodySizePt: 11, heading1SizePt: 13, heading2SizePt: 12, heading3SizePt: 11, lineSpacing: 1.08, paragraphSpaceAfterPt: 8 }, colors: { text: '1A1A1A', muted: '5A5A5A', accent: '1F8A5B', tableHeaderBg: 'EAF3EE', tableBorder: 'CCCCCC' }, brand: { organizationName: '{sponsor}', confidentialityNotice: '', logo: { present: true, placement: 'header' } }, header: { text: '{sponsor}', showLogo: true, alignment: 'center' }, footer: { text: '{kNumber}', showPageNumbers: true, pageNumberFormat: '{PAGE}' }, table: { headerBold: true, borderSizePt: 0.5 }, formFields: [{ key: 'sponsor', label: 'Sponsor / applicant', type: 'text', required: true }, { key: 'kNumber', label: '510(k) number', type: 'text', required: false }, { key: 'contactDate', label: 'Date', type: 'date', required: true }, { key: 'deviceName', label: 'Device name', type: 'text', required: true }, { key: 'signature', label: 'Authorized signatory', type: 'signature', required: true }], namedStyles: [{ styleId: 'Normal', name: 'Normal', font: 'Calibri', sizePt: 11 }, { styleId: 'Title', name: 'Title', font: 'Calibri', sizePt: 18, bold: true }] } },
  { id: 'tpl-csr-e3', name: 'CSR — ICH E3 House Format', description: 'Clinical study report, ICH E3 structure', sourceFileName: 'CSR_E3_house.docx', sourceFileType: 'docx', verified: true, extractionConfidence: 0.93, extractionWarnings: [], docTypes: ['CSR'], updatedAt: '2026-03-18',
    spec: { specVersion: 1, page: { size: 'a4', orientation: 'portrait', marginsInches: { top: 0.98, bottom: 0.98, left: 1.18, right: 0.79 } }, typography: { bodyFont: 'Times New Roman', headingFont: 'Arial', monoFont: 'Courier New', bodySizePt: 11, heading1SizePt: 14, heading2SizePt: 13, heading3SizePt: 11, lineSpacing: 1.2, paragraphSpaceAfterPt: 6 }, colors: { text: '000000', muted: '555555', accent: '8250C4', tableHeaderBg: 'EFEAF6', tableBorder: 'AAAAAA' }, brand: { organizationName: '{study}', confidentialityNotice: 'Confidential', logo: { present: true, placement: 'header' } }, header: { text: '{study} - Clinical Study Report', showLogo: true, alignment: 'left' }, footer: { text: 'Confidential', showPageNumbers: true, pageNumberFormat: 'Page {PAGE}' }, table: { headerBold: true, borderSizePt: 0.5 }, formFields: [], namedStyles: [{ styleId: 'Normal', name: 'Normal', font: 'Times New Roman', sizePt: 11 }, { styleId: 'Heading1', name: 'Heading 1', font: 'Arial', sizePt: 14, bold: true }, { styleId: 'TOC1', name: 'TOC 1', font: 'Arial', sizePt: 11 }] } },
  { id: 'tpl-chmp-resp', name: 'EMA CHMP Response Template', description: 'Day-120 / Day-180 LoQ response', sourceFileName: 'CHMP_response.docx', sourceFileType: 'docx', verified: false, extractionConfidence: 0.72, extractionWarnings: ['Heading font not found; using Arial.', 'No embedded logo image found.'], docTypes: ['MAA', 'CHMP'], updatedAt: '2026-05-02',
    spec: { specVersion: 1, page: { size: 'a4', orientation: 'portrait', marginsInches: { top: 0.79, bottom: 0.79, left: 0.98, right: 0.98 } }, typography: { bodyFont: 'Verdana', headingFont: 'Arial', monoFont: 'Consolas', bodySizePt: 10, heading1SizePt: 12, heading2SizePt: 11, heading3SizePt: 10, lineSpacing: 1.15, paragraphSpaceAfterPt: 6 }, colors: { text: '1A1A1A', muted: '666666', accent: 'D97757', tableHeaderBg: 'E2E8F0', tableBorder: 'BBBBBB' }, brand: { organizationName: '', confidentialityNotice: 'CONFIDENTIAL — For Regulatory Use Only', logo: { present: false, placement: 'header' } }, header: { text: 'Response to CHMP List of Questions', showLogo: false, alignment: 'right' }, footer: { text: '{procedure}', showPageNumbers: true, pageNumberFormat: 'Page {PAGE} of {PAGES}' }, table: { headerBold: true, borderSizePt: 0.5 }, formFields: [{ key: 'procedure', label: 'Procedure number', type: 'text', required: true }, { key: 'question', label: 'Question reference', type: 'text', required: false }], namedStyles: [{ styleId: 'Normal', name: 'Normal', font: 'Verdana', sizePt: 10 }] } },
  { id: 'tpl-ib-legacy', name: 'Investigator Brochure — Legacy (PDF)', description: 'Imported from a scanned PDF', sourceFileName: 'IB_v6_signed.pdf', sourceFileType: 'pdf', verified: false, extractionConfidence: 0.28, extractionWarnings: ['PDF carries no style sheet — fonts, margins, header and footer cannot be recovered reliably. Page size was detected; everything else uses defaults. Upload the Word (.docx) source for full fidelity.'], docTypes: ['IB'], updatedAt: '2026-05-01',
    spec: { ...DEFAULT_SPEC, brand: { ...DEFAULT_SPEC.brand, organizationName: '' }, header: { text: '', showLogo: false, alignment: 'right' }, footer: { text: '', showPageNumbers: true, pageNumberFormat: 'Page {PAGE} of {PAGES}' } } },
];

/* ── Helpers ── */

function _tlConf(c: number): number { return Math.round((c || 0) * 100); }
const _tlHex = (h: string) => '#' + String(h || '000000').replace(/^#/, '');
const PAGE_IN: Record<string, { w: number; h: number }> = {
  letter: { w: 8.5, h: 11 }, a4: { w: 8.27, h: 11.69 }, legal: { w: 8.5, h: 14 },
};

/* ── Spec preview sheet ── */

function SpecPreview({ spec }: { spec: TemplateSpec }) {
  const pg = PAGE_IN[spec.page.size] || PAGE_IN.letter;
  const land = spec.page.orientation === 'landscape';
  const wIn = land ? pg.h : pg.w;
  const hIn = land ? pg.w : pg.h;
  const SHEET_W = 460;
  const perIn = SHEET_W / wIn;
  const m = spec.page.marginsInches;
  const t = spec.typography;
  const c = spec.colors;
  const pt = (p: number) => Math.max(6, (p / 72) * perIn);
  const align = (spec.header && spec.header.alignment) || 'right';

  return (
    <div className="tl-preview-wrap">
      <div
        style={{
          width: SHEET_W, height: hIn * perIn, background: '#fff',
          boxShadow: '0 2px 14px rgba(0,0,0,0.12)', position: 'relative',
          color: _tlHex(c.text), fontFamily: 'Georgia, serif', overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute', top: m.top * perIn * 0.34, left: m.left * perIn,
            right: m.right * perIn, display: 'flex', alignItems: 'center', gap: 6,
            justifyContent: align === 'center' ? 'center' : align === 'left' ? 'flex-start' : 'flex-end',
            fontFamily: t.headingFont + ', sans-serif', fontSize: pt(8.5), color: _tlHex(c.muted),
          }}
        >
          {spec.brand.logo && spec.brand.logo.present && spec.header && spec.header.showLogo && (
            <span style={{ width: pt(22), height: pt(12), background: _tlHex(c.accent), borderRadius: 2, opacity: 0.85, order: align === 'right' ? 2 : 0 }} />
          )}
          {spec.header && spec.header.text && <span>{spec.header.text}</span>}
        </div>
        <div style={{ position: 'absolute', top: m.top * perIn, bottom: m.bottom * perIn, left: m.left * perIn, right: m.right * perIn, display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontFamily: t.headingFont + ', sans-serif', fontSize: pt(t.heading1SizePt), fontWeight: 700, color: _tlHex(c.accent), marginBottom: pt(4) }}>1. Heading One</div>
          <div style={{ fontFamily: t.bodyFont + ', serif', fontSize: pt(t.bodySizePt), lineHeight: t.lineSpacing, marginBottom: pt(t.paragraphSpaceAfterPt) }}>
            The quick brown fox jumps over the lazy dog. This sample paragraph renders in {t.bodyFont} {t.bodySizePt}pt at {t.lineSpacing}x line spacing, exactly as extracted from the source.
          </div>
          <div style={{ fontFamily: t.headingFont + ', sans-serif', fontSize: pt(t.heading2SizePt), fontWeight: 700, marginBottom: pt(3) }}>1.1 Heading Two</div>
          <div style={{ fontFamily: t.bodyFont + ', serif', fontSize: pt(t.bodySizePt), lineHeight: t.lineSpacing, marginBottom: pt(t.paragraphSpaceAfterPt), color: _tlHex(c.text) }}>
            Body copy continues here with the client's exact typography and margins preserved.
          </div>
          <div style={{ border: '1px solid ' + _tlHex(c.tableBorder), fontSize: pt(t.bodySizePt * 0.92), fontFamily: t.bodyFont + ', serif' }}>
            <div style={{ display: 'flex', background: _tlHex(c.tableHeaderBg), fontWeight: spec.table.headerBold ? 700 : 400, borderBottom: '1px solid ' + _tlHex(c.tableBorder) }}>
              <span style={{ flex: 1, padding: pt(2.5) }}>Parameter</span>
              <span style={{ flex: 1, padding: pt(2.5), borderLeft: '1px solid ' + _tlHex(c.tableBorder) }}>Result</span>
            </div>
            <div style={{ display: 'flex' }}>
              <span style={{ flex: 1, padding: pt(2.5) }}>Purity</span>
              <span style={{ flex: 1, padding: pt(2.5), borderLeft: '1px solid ' + _tlHex(c.tableBorder) }}>&#8805; 98.0%</span>
            </div>
          </div>
        </div>
        <div style={{ position: 'absolute', bottom: m.bottom * perIn * 0.34, left: m.left * perIn, right: m.right * perIn, display: 'flex', justifyContent: 'space-between', fontFamily: t.headingFont + ', sans-serif', fontSize: pt(8), color: _tlHex(c.muted) }}>
          <span>{spec.footer && spec.footer.text}</span>
          <span>{spec.footer && spec.footer.showPageNumbers ? (spec.footer.pageNumberFormat || '').replace('{PAGE}', '1').replace('{PAGES}', '12') : ''}</span>
        </div>
      </div>
    </div>
  );
}

/* ── Spec detail tab ── */

function SpecTab({ spec }: { spec: TemplateSpec }) {
  const t = spec.typography;
  const c = spec.colors;
  const m = spec.page.marginsInches;

  const row = (k: string, v: string) => (
    <div className="tl-spec-row">
      <span className="tl-spec-k">{k}</span>
      <span className="tl-spec-v">{v}</span>
    </div>
  );
  const sw = (k: string, hex: string) => (
    <div className="tl-swatch">
      <span className="tl-swatch-c" style={{ background: _tlHex(hex) }} />
      <span className="tl-swatch-l">{k}<b>#{hex}</b></span>
    </div>
  );

  return (
    <div className="tl-cols">
      <div>
        <div className="pj-seclbl" style={{ marginTop: 0 }}>Page</div>
        <div className="tl-spec-grid">
          {row('Size', spec.page.size.toUpperCase() + ' - ' + spec.page.orientation)}
          {row('Margins', `T ${m.top}" - B ${m.bottom}" - L ${m.left}" - R ${m.right}"`)}
        </div>
        <div className="pj-seclbl">Typography</div>
        <div className="tl-spec-grid">
          {row('Body', `${t.bodyFont} ${t.bodySizePt}pt`)}
          {row('Heading', `${t.headingFont} ${t.heading1SizePt}/${t.heading2SizePt}/${t.heading3SizePt}pt`)}
          {row('Mono', t.monoFont)}
          {row('Line spacing', `${t.lineSpacing}x - ${t.paragraphSpaceAfterPt}pt after`)}
        </div>
        <div className="pj-seclbl">Brand colours</div>
        <div className="tl-swatches">
          {sw('Text', c.text)}{sw('Muted', c.muted)}{sw('Accent', c.accent)}{sw('Table header', c.tableHeaderBg)}{sw('Table border', c.tableBorder)}
        </div>
      </div>
      <div>
        <div className="pj-seclbl" style={{ marginTop: 0 }}>Brand</div>
        <div className="tl-spec-grid">
          {row('Organization', spec.brand.organizationName || '—')}
          {row('Logo', spec.brand.logo && spec.brand.logo.present ? 'Present - ' + spec.brand.logo.placement : 'None detected')}
          {row('Confidentiality', spec.brand.confidentialityNotice || '—')}
        </div>
        <div className="pj-seclbl">Running header / footer</div>
        <div className="tl-spec-grid">
          {row('Header', (spec.header && spec.header.text) || '—')}
          {row('Header align', (spec.header && spec.header.alignment) || '—')}
          {row('Footer', (spec.footer && spec.footer.text) || '—')}
          {row('Page numbers', spec.footer && spec.footer.showPageNumbers ? spec.footer.pageNumberFormat : 'off')}
        </div>
        <div className="pj-seclbl">Table style</div>
        <div className="tl-spec-grid">
          {row('Header', spec.table.headerBold ? 'Bold, shaded' : 'Plain')}
          {row('Border', spec.table.borderSizePt + 'pt')}
        </div>
      </div>
    </div>
  );
}

/* ── Template library surface ── */

export function TemplateLibrary({ onAsk }: SurfaceViewProps) {
  const [rows, setRows] = useState<TemplateRecord[]>(TL_FIXTURE);
  const [selId, setSel] = useState(TL_FIXTURE[0].id);
  const [tab, setTab] = useState('preview');
  const [uploading, setUploading] = useState(false);
  const [extract, setExtract] = useState<{ name: string; confidence: number; warnings: string[]; spec: TemplateSpec } | null>(null);
  const [edit, setEdit] = useState('');
  const ask = onAsk;

  const sel = rows.find((t) => t.id === selId) || rows[0];

  const startExtract = () => {
    setUploading(true);
    setExtract(null);
    setTimeout(() => {
      setExtract({
        name: 'Uploaded form', confidence: 0.85, warnings: ['Heading font not found; using Arial.'],
        spec: { ...DEFAULT_SPEC, typography: { ...DEFAULT_SPEC.typography, bodyFont: 'Calibri', bodySizePt: 11, headingFont: 'Calibri' }, header: { text: '{sponsor} - {docType}', showLogo: true, alignment: 'left' }, formFields: [{ key: 'sponsor', label: 'Sponsor', type: 'text', required: true }], namedStyles: [{ styleId: 'Normal', name: 'Normal', font: 'Calibri', sizePt: 11 }] },
      });
    }, 1100);
  };

  const saveExtract = () => {
    if (!extract) return;
    const rec: TemplateRecord = {
      id: 'tpl-' + Date.now(), name: extract.name, description: 'Extracted from upload',
      sourceFileName: 'upload.docx', sourceFileType: 'docx', verified: false,
      extractionConfidence: extract.confidence, extractionWarnings: extract.warnings,
      docTypes: ['—'], updatedAt: 'just now', spec: extract.spec, _new: true,
    };
    setRows((r) => [rec, ...r]);
    setSel(rec.id);
    setUploading(false);
    setExtract(null);
  };

  const toggleVerify = (t: TemplateRecord) => {
    setRows((r) => r.map((x) => (x.id === t.id ? { ...x, verified: !x.verified } : x)));
  };

  const applyEdit = () => {
    if (!edit.trim()) return;
    ask('Adjust the "' + sel.name + '" template: ' + edit.trim());
    setEdit('');
  };

  const TABS: [string, string][] = [
    ['preview', 'Live preview'], ['spec', 'Specification'], ['fields', 'Form fields'],
    ['styles', 'Named styles'], ['extract', 'Extraction'],
  ];

  return (
    <div className="sp" style={{ maxWidth: 1180 }}>
      <SampleTag sample={true} />
      <div className="sp-head">
        <div>
          <div className="sp-eyebrow">Authoring {I.dot} /api/c2c/templates</div>
          <h1 className="sp-title">Template library</h1>
          <p className="sp-state">
            Upload a form and AnA reads its OOXML to recreate the exact page
            geometry, typography, brand colours, logo, header/footer, table
            style, form fields and named styles — then renders matching Word
            &amp; PDF from any document. Edit any template just by asking AnA.
          </p>
        </div>
        <button className="sp-primary" onClick={startExtract}>
          {I.upload || I.plus} Upload a form
        </button>
      </div>

      {uploading && (
        <div className="pj-card" style={{ marginBottom: 16, borderColor: 'var(--accent-muted)' }}>
          <div className="pj-card-h">
            <span className="t">{I.sparkles} AnA extraction {extract ? '- preview' : '- reading OOXML...'}</span>
            <span className="s">POST /extract</span>
          </div>
          <div className="pj-card-b">
            {!extract && (
              <div className="scaf-note">
                Reading document.xml (page + margins), styles.xml + theme (fonts, sizes, colours),
                header/footer (text, logo, page numbers) and media (logo bytes)...
              </div>
            )}
            {extract && (
              <div className="tl-cols" style={{ gridTemplateColumns: '1fr 480px' }}>
                <div>
                  <SpecTab spec={extract.spec} />
                  <div className="tl-conf" style={{ marginTop: 12 }}>
                    <div className="tl-conf-bar">
                      <span style={{ width: _tlConf(extract.confidence) + '%', background: extract.confidence >= 0.9 ? 'var(--success)' : extract.confidence >= 0.6 ? 'var(--accent-100)' : 'var(--warning)' }} />
                    </div>
                    <span className="tl-conf-l">Confidence {_tlConf(extract.confidence)}%</span>
                  </div>
                  {extract.warnings.map((w, i) => (
                    <div key={i} className="tl-warn-row">{I.alertTriangle} {w}</div>
                  ))}
                  <div className="cm-pushbar" style={{ marginTop: 14 }}>
                    <button className="sp-primary" style={{ padding: '8px 14px' }} onClick={saveExtract}>{I.check} Save template</button>
                    <button className="sp-ask" onClick={() => { setUploading(false); setExtract(null); }}>Discard</button>
                  </div>
                </div>
                <SpecPreview spec={extract.spec} />
              </div>
            )}
          </div>
        </div>
      )}

      <div className="sp-2col" style={{ gridTemplateColumns: '320px 1fr' }}>
        <div className="pj-card">
          <div className="pj-card-h"><span className="t">Templates</span><span className="s">{rows.length}</span></div>
          <div className="pj-card-b" style={{ padding: 8 }}>
            <div className="sp-list">
              {rows.map((t) => (
                <button key={t.id} className="sp-row" data-new={t._new || undefined}
                  style={{ width: '100%', textAlign: 'left', borderRadius: 8, padding: '9px 10px', border: selId === t.id ? '1px solid var(--accent-muted)' : '1px solid transparent', background: selId === t.id ? 'var(--accent-000)' : 'transparent' }}
                  onClick={() => { setSel(t.id); setTab('preview'); }}>
                  <span className="sp-q-ic">{t.sourceFileType === 'pdf' ? I.fileText : (I.template || I.fileText)}</span>
                  <span className="sp-row-b"><span className="sp-row-t">{t.name}</span><span className="sp-row-s">{t.sourceFileName} - {_tlConf(t.extractionConfidence)}%</span></span>
                  {t.verified ? <span className="rd-chip tone-ok">verified</span> : <span className="rd-chip tone-warn">review</span>}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="pj-card">
          <div className="pj-card-h"><span className="t">{sel.name}</span><span className="s">{sel.sourceFileType.toUpperCase()} - {sel.docTypes.join(' - ')}</span></div>
          <div className="pj-card-b">
            <div className="reg-tabs" style={{ marginTop: 0 }}>
              {TABS.map(([id, lb]) => (
                <button key={id} className={'reg-tab' + (tab === id ? ' on' : '')} onClick={() => setTab(id)}>
                  {lb}{id === 'fields' && sel.spec.formFields && sel.spec.formFields.length ? ' - ' + sel.spec.formFields.length : ''}
                </button>
              ))}
            </div>

            {tab === 'preview' && (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '18px 0' }}>
                <SpecPreview spec={sel.spec} />
              </div>
            )}
            {tab === 'spec' && <SpecTab spec={sel.spec} />}
            {tab === 'fields' && (
              sel.spec.formFields && sel.spec.formFields.length ? (
                <div className="sp-list">
                  {sel.spec.formFields.map((f, i) => (
                    <div key={i} className="sp-row">
                      <span className="sp-tag2">{f.type}</span>
                      <span className="sp-row-b"><span className="sp-row-t">{f.label}</span><span className="sp-row-s" style={{ fontFamily: 'var(--font-mono)' }}>{f.key}</span></span>
                      {f.required ? <span className="rd-chip tone-warn">required</span> : <span className="rd-chip tone-idle">optional</span>}
                    </div>
                  ))}
                </div>
              ) : <div className="scaf-note">No form fields detected in this template.</div>
            )}
            {tab === 'styles' && (
              sel.spec.namedStyles && sel.spec.namedStyles.length ? (
                <div className="sp-list">
                  {sel.spec.namedStyles.map((s, i) => (
                    <div key={i} className="sp-row">
                      <span className="sp-row-b"><span className="sp-row-t">{s.name || s.styleId}</span><span className="sp-row-s">{[s.font, s.sizePt && s.sizePt + 'pt', s.bold && 'bold', s.italic && 'italic'].filter(Boolean).join(' - ')}</span></span>
                      {s.color && <span className="tl-swatch-c" style={{ background: _tlHex(s.color) }} title={'#' + s.color} />}
                    </div>
                  ))}
                </div>
              ) : <div className="scaf-note">No named styles recovered (PDF source or flat document).</div>
            )}
            {tab === 'extract' && (
              <div>
                <div className="tl-conf" style={{ marginTop: 4 }}>
                  <div className="tl-conf-bar">
                    <span style={{ width: _tlConf(sel.extractionConfidence) + '%', background: sel.extractionConfidence >= 0.9 ? 'var(--success)' : sel.extractionConfidence >= 0.6 ? 'var(--accent-100)' : 'var(--warning)' }} />
                  </div>
                  <span className="tl-conf-l">Extraction confidence {_tlConf(sel.extractionConfidence)}%</span>
                </div>
                <div className="pj-seclbl">Recovered from</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {([['document.xml', 'page + margins'], ['styles.xml', 'fonts, sizes, colours'], ['theme1.xml', 'font references'], ['header*.xml', 'header + logo'], ['footer*.xml', 'footer + page numbers'], ['media/*', sel.spec.brand.logo && sel.spec.brand.logo.present ? 'logo bytes' : '—']] as [string, string][]).map(([f, d], i) => (
                    <span key={i} className="cv-ep" title={d}>{f}</span>
                  ))}
                </div>
                {sel.extractionWarnings && sel.extractionWarnings.length > 0 ? (
                  <>
                    <div className="pj-seclbl">Warnings</div>
                    {sel.extractionWarnings.map((w, i) => (
                      <div key={i} className="tl-warn-row">{I.alertTriangle} {w}</div>
                    ))}
                  </>
                ) : (
                  <div className="scaf-note" style={{ marginTop: 12 }}>
                    Clean extraction — every part recovered from the source.
                  </div>
                )}
              </div>
            )}

            <div className="tl-edit">
              <span className="tl-edit-ic">{I.sparkles}</span>
              <input
                className="tl-edit-in"
                placeholder={'Ask AnA to adjust this template — e.g. "headings in Calibri 13, 1.15 spacing, accent #1F8A5B"'}
                value={edit}
                onChange={(e) => setEdit(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') applyEdit(); }}
              />
              <button className="tl-edit-go" onClick={applyEdit} disabled={!edit.trim()}>
                {I.arrowUp || I.right}
              </button>
            </div>

            <div className="cm-pushbar" style={{ marginTop: 14 }}>
              <button className="sp-primary" style={{ padding: '8px 14px' }}>
                {I.download} Render to Word
              </button>
              <button className="sp-primary" style={{ padding: '8px 14px', background: 'var(--bg-200)', color: 'var(--text-100)' }}>
                {I.download} Render to PDF
              </button>
              <button className="sp-ask" onClick={() => toggleVerify(sel)}>
                {I.shieldCheck} {sel.verified ? 'Unverify' : 'Mark verified'}
              </button>
              <button className="sp-ask" onClick={() => ask('Apply the "' + sel.name + '" template to the active document.')}>
                {I.penLine} Apply to document
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
