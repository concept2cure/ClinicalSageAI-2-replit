import React, { useEffect, useMemo, useRef, useState } from 'react';
import { I } from '../icons';
import { useLiveRows, EmptyState } from '../dataConnect';
import type { SurfaceViewProps } from '../surfaceViews';
import { usePublishSurfaceContext } from '../surfaceContext';
import { notifySurfaceActionReady, useSurfaceActionHandlers } from '../surfaceActions';
import { apiRequest, serverMessage } from '@/lib/queryClient';
import { getAuthHeaders } from '@/utils/authToken';
import '../styles/project-home-v2.css';
import { C2CToast, useToast } from '../toast';
import { downloadBlob, safeFileName } from '../download';

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
  // Nullable columns on c2c_template_specs — the store returns null (not a
  // fabricated value) when a template is hand-built or predates a field; the
  // render below is null-safe. Types mirror server templateStore.TemplateRecord.
  description: string | null;
  sourceFileName: string | null;
  sourceFileType: 'docx' | 'pdf' | null;
  verified: boolean;
  extractionConfidence: number | null;
  extractionWarnings: string[];
  docTypes: string[];
  updatedAt: string;
  spec: TemplateSpec;
  // client-only optimistic flag for a just-saved extraction (not a column)
  _new?: boolean;
}

/* ── Default spec — merge base for the in-browser extraction preview ── */

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

/* ── Helpers ── */

function _tlConf(c: number | null): number { return Math.round((c || 0) * 100); }
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
  // Real-data standard: the org's persisted templates, an honest empty state,
  // or an honest failed-load state — never a fixture. useLiveRows unwraps the
  // canonical { data } envelope from GET /api/c2c/templates.
  const live = useLiveRows<TemplateRecord>('/api/c2c/templates');
  // Local working copy so a just-saved extraction / verify toggle shows at once;
  // seeded from the live rows once they load. The functional updaters bail out
  // (return the same reference) when nothing changed, since useLiveRows hands
  // back a fresh [] on every not-yet-loaded render.
  const [rows, setRows] = useState<TemplateRecord[]>([]);
  const [selId, setSel] = useState('');
  useEffect(() => {
    if (live.loading) return;
    setRows((prev) =>
      prev.length === live.rows.length && prev.every((r, i) => r.id === live.rows[i].id)
        ? prev
        : live.rows,
    );
    if (live.rows[0]) setSel((cur) => cur || live.rows[0].id);
  }, [live.loading, live.rows]);
  const [tab, setTab] = useState('preview');
  const [uploading, setUploading] = useState(false);
  const [extract, setExtract] = useState<{ name: string; confidence: number; warnings: string[]; spec: TemplateSpec } | null>(null);
  const [edit, setEdit] = useState('');
  const ask = onAsk;

  const sel = rows.find((t) => t.id === selId) || rows[0];

  // The picked file is kept so Save can persist the SAME bytes the preview came
  // from (extract is preview-only server-side; from-upload extracts + saves).
  const fileRef = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [flash, note] = useToast();

  /* ── AnA's hands on this screen — the surface-action bus ──────────────────
     Registered under 'template-library' (identity-mapped nav target). Both
     handlers drive the SAME state the human's own row clicks and tab buttons
     drive (setSel + setTab); names resolve against the REAL template store
     with honest misses. Extraction, saving, verifying, rendering, and
     applying stay human acts, untouched. */
  useSurfaceActionHandlers('template-library', {
    'template-library.select-template': (params) => {
      /* An unsaved extraction preview carries a Save and an unrecoverable
         Discard — moving the selection under it is disorienting. Refuse. */
      if (extract) {
        return { ok: false, reason: 'An unsaved extraction preview is open — save or discard it first.' };
      }
      const wanted = (params.template ?? '').trim();
      if (!wanted) return { ok: false, reason: 'No template named.' };
      if (live.loading && rows.length === 0)
        return { ok: false, reason: 'The template store is still loading.', retry: true };
      if (live.error && rows.length === 0)
        return { ok: false, reason: 'The template store could not be read.' };
      if (rows.length === 0) return { ok: false, reason: 'No templates saved yet.' };
      const lower = wanted.toLowerCase();
      const exact = rows.find((t) => t.name.toLowerCase() === lower);
      const contains = exact ? [] : rows.filter((t) => t.name.toLowerCase().includes(lower));
      const match = exact ?? (contains.length === 1 ? contains[0] : null);
      if (!match) {
        return {
          ok: false,
          reason:
            contains.length > 1
              ? `"${params.template}" matches ${contains.length} templates — name one exactly.`
              : `No template named "${params.template}" in the library.`,
        };
      }
      // The human's own row handler: select and land on the preview. Selection
      // also re-points the render/verify/apply toolbar — said in the detail.
      setSel(match.id);
      setTab('preview');
      return { ok: true, detail: `Selected ${match.name} — the toolbar now acts on it` };
    },
    'template-library.open-tab': (params) => {
      const target = (params.tab ?? '').trim();
      if (!['preview', 'spec', 'fields', 'styles', 'extract'].includes(target)) {
        return { ok: false, reason: `No template tab named "${params.tab}".` };
      }
      if (live.loading && rows.length === 0)
        return { ok: false, reason: 'The template store is still loading.', retry: true };
      if (rows.length === 0 || !sel) return { ok: false, reason: 'No template is selected.' };
      setTab(target);
      return { ok: true, detail: `Opened the ${target} tab` };
    },
  });
  /* The ready signal for the retry contract above. */
  useEffect(() => {
    if (!live.loading) notifySurfaceActionReady('template-library');
  }, [live.loading]);

  const startExtract = () => fileRef.current?.click();

  // REAL extraction: POST the picked file to /api/c2c/templates/extract
  // (multipart; auth headers only — the browser sets the boundary). The
  // preview below renders the SERVER's spec/confidence/warnings, never a canned
  // spec. Failure is surfaced honestly and nothing is shown.
  const onFilePicked = async (f: File | null) => {
    if (!f) return;
    setPendingFile(f);
    setUploading(true);
    setExtract(null);
    try {
      const fd = new FormData();
      fd.append('file', f, f.name);
      const res = await fetch('/api/c2c/templates/extract', { method: 'POST', headers: getAuthHeaders(), credentials: 'include', body: fd });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.spec) {
        note(res.status === 401 ? 'Sign in to extract a template.' : 'Extraction failed — ' + (serverMessage(json) ?? 'the server did not say why') + '. Nothing was read.', 'error');
        setUploading(false);
        return;
      }
      setExtract({
        name: f.name.replace(/\.(docx|pdf)$/i, ''),
        confidence: Number(json.confidence ?? 0),
        warnings: Array.isArray(json.warnings) ? json.warnings : [],
        spec: json.spec as TemplateSpec,
      });
    } catch (e) {
      note('Extraction failed — ' + (e instanceof Error ? e.message : String(e)) + '.', 'error');
      setUploading(false);
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  // REAL persist: POST the same file to /from-upload (extract + save). Adopts
  // the SERVER's template record (real id, persisted spec) into the list.
  const saveExtract = async () => {
    if (!extract || !pendingFile) return;
    try {
      const fd = new FormData();
      fd.append('file', pendingFile, pendingFile.name);
      fd.append('name', extract.name);
      const res = await fetch('/api/c2c/templates/from-upload', { method: 'POST', headers: getAuthHeaders(), credentials: 'include', body: fd });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.template?.id) {
        note(res.status === 401 ? 'Sign in to save the template.' : 'Couldn’t save — ' + (serverMessage(json) ?? 'the server did not say why') + '. Nothing was persisted.', 'error');
        return;
      }
      const rec = { ...(json.template as TemplateRecord), _new: true };
      setRows((r) => [rec, ...r.filter((x) => x.id !== rec.id)]);
      setSel(rec.id);
      setUploading(false);
      setExtract(null);
      setPendingFile(null);
      note('Template saved · ' + rec.name);
    } catch (e) {
      note('Couldn’t save — ' + (e instanceof Error ? e.message : String(e)) + '.', 'error');
    }
  };

  // REAL verify flip: PUT /:id {verified} and adopt the server's record.
  const toggleVerify = async (t: TemplateRecord) => {
    try {
      const res = await apiRequest('PUT', '/api/c2c/templates/' + t.id, { verified: !t.verified });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.template) { note('Couldn’t update verification — ' + (serverMessage(json) ?? 'the server did not say why') + '.', 'error'); return; }
      setRows((r) => r.map((x) => (x.id === t.id ? { ...x, ...(json.template as TemplateRecord) } : x)));
    } catch (e) {
      // Only an ApiRequestError message is user copy; a browser fetch throw
      // reads "Failed to fetch", and String(e) on a non-Error gives
      // "[object Object]".
      note((e as { name?: unknown } | null)?.name === 'ApiRequestError' && (e as Error).message
        ? 'Couldn’t update verification — ' + (e as Error).message
        : 'Couldn’t update verification. Check your connection and try again.',
  'error',
);
    }
  };

  // REAL render: POST /:id/render {format, document} and download the returned
  // binary. The document is a clearly-labeled SPECIMEN (title + one section) so
  // the user can proof the template's real look; content is never presented as
  // regulatory data.
  const renderTemplate = async (t: TemplateRecord, format: 'docx' | 'pdf') => {
    try {
      const res = await apiRequest('POST', '/api/c2c/templates/' + t.id + '/render', {
        format,
        document: {
          metadata: { title: t.name + ' — specimen' },
          sections: [{
            heading: 'Template specimen',
            paragraphs: [
              'This specimen was rendered with the "' + t.name + '" template to proof its page geometry, typography, and header/footer.',
            ],
          }],
        },
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        note(res.status === 401 ? 'Sign in to render.' : 'Render failed — ' + ((json as any)?.error ?? `HTTP ${res.status}`) + '.', 'error');
        return;
      }
      downloadBlob(safeFileName(t.name) + '_specimen.' + format, await res.blob());
      note('Rendered ' + format.toUpperCase() + ' with the real template engine.');
    } catch (e) {
      note('Render failed — ' + (e instanceof Error ? e.message : String(e)) + '.', 'error');
    }
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

  /* What AnA can see of this screen. The "Adjust this template" box below sends
     her a free-text instruction about `sel` — which she could not identify.

     The VERIFIED flag and the extraction confidence travel together on purpose:
     an unverified, machine-extracted spec is a draft of a template, and an
     assistant that discusses it as the organisation's approved house style
     would launder a confidence score into an approval. */
  const anaContext = useMemo(() => {
    if (live.loading) {
      return { summary: 'The template library is still loading; nothing on screen is final yet.' };
    }
    if (live.error) {
      return {
        summary:
          'The template store could not be read, so this screen is showing no templates because of a ' +
          'failure, not because none are saved.',
        availableActions: ['Retry the template read'],
      };
    }
    return {
      summary:
        `Template library: ${rows.length} template(s), ${rows.filter((t) => t.verified).length} verified. ` +
        (sel
          ? `"${sel.name}" is selected and its "${(TABS.find((t) => t[0] === tab) ?? [])[1] ?? tab}" tab is open; ` +
            `it is ${sel.verified ? 'verified' : 'NOT verified'}` +
            (sel.extractionConfidence != null ? `, extraction confidence ${sel.extractionConfidence}` : '') +
            ((sel.extractionWarnings ?? []).length ? `, ${(sel.extractionWarnings ?? []).length} extraction warning(s)` : '') +
            '.'
          : 'No template is selected.') +
        (extract ? ` A preview extraction of "${extract.name}" is on screen and has not been saved.` : ''),
      facts: {
        totalTemplates: rows.length,
        verifiedTemplates: rows.filter((t) => t.verified).length,
        openTab: tab,
        templates: rows.slice(0, 12).map((t) => ({
          id: t.id, name: t.name, verified: t.verified,
          sourceFile: t.sourceFileName, sourceType: t.sourceFileType,
          extractionConfidence: t.extractionConfidence,
          extractionWarnings: (t.extractionWarnings ?? []).length,
          docTypes: t.docTypes, updatedAt: t.updatedAt,
        })),
        selected: sel
          ? {
              id: sel.id, name: sel.name, description: sel.description,
              verified: sel.verified, sourceFile: sel.sourceFileName,
              extractionConfidence: sel.extractionConfidence,
              extractionWarnings: sel.extractionWarnings ?? [],
              docTypes: sel.docTypes, updatedAt: sel.updatedAt,
            }
          : null,
        unsavedExtractionPreview: extract
          ? { name: extract.name, confidence: extract.confidence, warnings: extract.warnings }
          : null,
        uploading,
      },
      availableActions: [
        'Upload a DOCX or PDF and extract a template specification from it (preview first, then save)',
        'Mark a template verified or unverified (a persisted write)',
        'Render a labelled specimen document in DOCX or PDF to proof the template',
        'Describe an adjustment to the selected template in words',
      ],
    };
  }, [live.loading, live.error, rows, sel, tab, TABS, extract, uploading]);
  usePublishSurfaceContext('template-library', anaContext);

  return (
    <div className="sp" style={{ maxWidth: 1180 }}>
      <div className="sp-head">
        <div>
          <div className="sp-eyebrow">Authoring {I.dot} templates</div>
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
        <input
          ref={fileRef} type="file" aria-label="Upload a template document" accept=".docx,.pdf" style={{ display: 'none' }}
          onChange={(e) => { void onFilePicked(e.target.files?.[0] ?? null); }}
        />
      </div>

      <C2CToast msg={flash} />

      {uploading && (
        <div className="pj-card" style={{ marginBottom: 16, borderColor: 'var(--accent-muted)' }}>
          <div className="pj-card-h">
            <span className="t">{I.sparkles} AnA extraction {extract ? '- preview' : '- reading OOXML...'}</span>
            <span className="s">extraction</span>
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

      {live.loading && rows.length === 0 ? (
        <div className="pj-card">
          <div className="pj-card-b" style={{ padding: 8 }}>
            <div role="status" className="scaf-note" style={{ padding: '18px 10px' }}>Loading templates…</div>
          </div>
        </div>
      ) : live.error && rows.length === 0 ? (
        <div className="pj-card">
          <div className="pj-card-b" style={{ padding: 8 }}>
            <EmptyState
              tone="error"
              icon={I.alertTriangle}
              title="Couldn't load templates"
              hint="The template store didn't respond. These are the client formatting templates AnA extracts from your uploaded forms — sign in and retry, or check that the templates service is reachable."
            />
          </div>
        </div>
      ) : rows.length === 0 ? (
        <div className="pj-card">
          <div className="pj-card-b" style={{ padding: 8 }}>
            <EmptyState
              icon={I.template || I.fileText}
              title="No templates yet"
              hint="Upload a form and AnA reads its OOXML to recreate the exact page geometry, typography, brand colours, header/footer and named styles as a reusable, org-scoped template. Saved templates appear here."
            />
          </div>
        </div>
      ) : (
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
                  <span className="sp-row-b"><span className="sp-row-t">{t.name}</span><span className="sp-row-s">{t.sourceFileName || '—'} - {_tlConf(t.extractionConfidence)}%</span></span>
                  {t.verified ? <span className="rd-chip tone-ok">verified</span> : <span className="rd-chip tone-warn">review</span>}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="pj-card">
          {/* docTypes / spec are columns a hand-built or partially-migrated row
              can arrive without; the sibling reads above already tolerate that
              (sourceFileType, extractionWarnings), and these now do too. */}
          <div className="pj-card-h"><span className="t">{sel.name}</span><span className="s">{(sel.sourceFileType || 'template').toUpperCase()}{sel.docTypes && sel.docTypes.length ? ' - ' + sel.docTypes.join(' - ') : ''}</span></div>
          <div className="pj-card-b">
            <div className="reg-tabs" style={{ marginTop: 0 }}>
              {TABS.map(([id, lb]) => (
                <button key={id} className={'reg-tab' + (tab === id ? ' on' : '')} onClick={() => setTab(id)}>
                  {lb}{id === 'fields' && sel.spec && sel.spec.formFields && sel.spec.formFields.length ? ' - ' + sel.spec.formFields.length : ''}
                </button>
              ))}
            </div>

            {/* A row with no spec has nothing to draw a sheet from, and the one
                thing this surface must not do is fall back to DEFAULT_SPEC —
                that would show the user page geometry the template never had. */}
            {tab === 'preview' && sel.spec && (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '18px 0' }}>
                <SpecPreview spec={sel.spec} />
              </div>
            )}
            {tab === 'spec' && sel.spec && <SpecTab spec={sel.spec} />}
            {tab === 'fields' && (
              sel.spec && sel.spec.formFields && sel.spec.formFields.length ? (
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
              sel.spec && sel.spec.namedStyles && sel.spec.namedStyles.length ? (
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
                    <span style={{ width: _tlConf(sel.extractionConfidence) + '%', background: (sel.extractionConfidence || 0) >= 0.9 ? 'var(--success)' : (sel.extractionConfidence || 0) >= 0.6 ? 'var(--accent-100)' : 'var(--warning)' }} />
                  </div>
                  <span className="tl-conf-l">Extraction confidence {_tlConf(sel.extractionConfidence)}%</span>
                </div>
                <div className="pj-seclbl">Recovered from</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {([['document.xml', 'page + margins'], ['styles.xml', 'fonts, sizes, colours'], ['theme1.xml', 'font references'], ['header*.xml', 'header + logo'], ['footer*.xml', 'footer + page numbers'], ['media/*', sel.spec && sel.spec.brand.logo && sel.spec.brand.logo.present ? 'logo bytes' : '—']] as [string, string][]).map(([f, d], i) => (
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
              <button className="sp-primary" style={{ padding: '8px 14px' }} onClick={() => renderTemplate(sel, 'docx')}>
                {I.download} Render to Word
              </button>
              <button className="sp-primary" style={{ padding: '8px 14px', background: 'var(--bg-200)', color: 'var(--text-100)' }} onClick={() => renderTemplate(sel, 'pdf')}>
                {I.download} Render to PDF
              </button>
              <button className="sp-ask" onClick={() => toggleVerify(sel)}>
                {I.shieldCheck} {sel.verified ? 'Unverify' : 'Mark verified'}
              </button>
              <button className="sp-ask" onClick={() => ask('Apply the "' + sel.name + '" template to the active document.')} title="Sends this request to AnA in the rail; it does not modify the document here">
                {I.penLine} Ask AnA to apply this
              </button>
            </div>
          </div>
        </div>
      </div>
      )}
    </div>
  );
}
