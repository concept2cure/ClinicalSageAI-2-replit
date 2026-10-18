import React, { useState } from 'react';
import type { CompanyDocumentProfile } from '@shared/company-documents';

/** Relative luminance and contrast against white stationery, per the WCAG sRGB definition. */
export function stationeryContrast(hex: string): number {
  const channels = hex.replace(/^#/, '').match(/.{2}/g);
  if (!channels || channels.length !== 3) return 1;
  const linear = channels.map(value => {
    const channel = parseInt(value, 16) / 255;
    return channel <= .04045 ? channel / 12.92 : Math.pow((channel + .055) / 1.055, 2.4);
  });
  const luminance = linear[0] * .2126 + linear[1] * .7152 + linear[2] * .0722;
  return 1.05 / (luminance + .05);
}

function ContrastGuidance({ profile }: { profile: CompanyDocumentProfile }) {
  const colors = profile.letterhead.colors;
  const rows = [{ label: 'Body text', color: colors.text }, { label: 'Footer text', color: colors.muted }, { label: 'Accent', color: colors.accent }];
  return <details className="company-preview-contrast"><summary>Check text contrast on white stationery</summary>
    <ul>{rows.map(row => { const ratio = stationeryContrast(row.color); return <li key={row.label}>{row.label}: {ratio.toFixed(2)}:1 · {ratio >= 4.5 ? 'Meets the normal-text contrast guideline' : 'Below the normal-text contrast guideline'}</li>; })}</ul>
    <p className="company-hint">Aim for at least 4.5:1 for normal text. A 3:1 ratio is sufficient only for large text. These checks do not evaluate image content or establish accessibility of the final document.</p>
  </details>;
}

function PreviewHeader({ profile, scale }: { profile: CompanyDocumentProfile; scale: number }) {
  const s = profile.letterhead;
  return <header style={{ textAlign: s.header?.alignment ?? 'left', borderColor: `#${s.colors.accent}`, fontSize: 8 * scale, paddingBottom: 10 * scale }}>
    {s.brand.logo && (s.header?.showLogo || s.brand.logo.placement === 'cover') && <img alt="Company logo preview" style={{ maxHeight: 45 * scale, maxWidth: 120 * scale }} src={`data:${s.brand.logo.mimeType};base64,${s.brand.logo.dataBase64}`} />}
    <strong style={{ color: `#${s.colors.accent}`, fontFamily: s.typography.headingFont, fontSize: 15 * scale }}>{profile.companyName || 'Your company name'}</strong>
    <div>{profile.address}</div><div>{profile.contact}</div><div>{profile.registrationDetails}</div>
    {s.header?.text && <div>{s.header.text}</div>}
  </header>;
}

function PreviewFooter({ profile, scale }: { profile: CompanyDocumentProfile; scale: number }) {
  const s = profile.letterhead;
  return <footer style={{ color: `#${s.colors.muted}`, fontSize: 7 * scale }}>
    <div>{s.brand.confidentialityNotice}</div><div>{s.footer?.text}</div>
    {s.footer?.showPageNumbers && <div>{(s.footer.pageNumberFormat || 'Page {PAGE} of {PAGES}').replaceAll('{PAGE}', '1').replaceAll('{PAGES}', '1')}</div>}
  </footer>;
}

function TextPreview({ profile }: { profile: CompanyDocumentProfile }) {
  const s = profile.letterhead;
  const rows = [
    ['Company name', profile.companyName || 'Not provided'], ['Address', profile.address || 'Not provided'],
    ['Contact details', profile.contact || 'Not provided'], ['Registration details', profile.registrationDetails || 'Not provided'],
    ['Header', s.header?.text || 'No additional header'], ['Footer', s.footer?.text || 'No additional footer'],
    ['Confidentiality notice', s.brand.confidentialityNotice || 'No notice'],
    ['Page numbers', s.footer?.showPageNumbers ? s.footer.pageNumberFormat || 'Page {PAGE} of {PAGES}' : 'Company page numbers off'],
  ];
  return <section className="company-text-preview" aria-label="Readable letterhead text"><h3>Letterhead text</h3>
    <dl>{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    <p>Sample correspondence: recipient and submission reference, followed by your document content.</p>
  </section>;
}

function VisualPreview({ profile, zoom }: { profile: CompanyDocumentProfile; zoom: number }) {
  const s = profile.letterhead;
  const scale = zoom / 100;
  const ratio = s.page.size === 'a4' ? 210 / 297 : s.page.size === 'legal' ? 8.5 / 14 : 8.5 / 11;
  const margin = s.page.marginsInches;
  return <div className="company-preview-viewport" tabIndex={0} role="region" aria-label="Scrollable letterhead visual preview">
    <article className="company-preview" aria-label="Letterhead preview" style={{
      width: `${zoom}%`, aspectRatio: s.page.orientation === 'landscape' ? 1 / ratio : ratio,
      fontFamily: s.typography.bodyFont, color: `#${s.colors.text}`,
      padding: `${margin.top * 25 * scale}px ${margin.right * 25 * scale}px ${margin.bottom * 25 * scale}px ${margin.left * 25 * scale}px`,
    }}>
      <PreviewHeader profile={profile} scale={scale} />
      <main style={{ fontSize: Math.max(9, s.typography.bodySizePt * .75) * scale, lineHeight: s.typography.lineSpacing, padding: `${12 * scale}px 0` }}>
        <h3 style={{ fontFamily: s.typography.headingFont, fontSize: 13 * scale }}>Regulatory correspondence</h3>
        <p>Recipient and submission reference</p><p>This space contains the correspondence you prepare for the selected recipient.</p>
        <p className="company-preview-placeholder">Your document content</p>
      </main>
      <PreviewFooter profile={profile} scale={scale} />
    </article>
  </div>;
}

/** An illustrative draft, with independent readable review controls; it never modifies the saved design. */
export function CompanyLetterheadPreview({ profile }: { profile: CompanyDocumentProfile }) {
  const [mode, setMode] = useState<'visual' | 'text'>('visual');
  const [zoom, setZoom] = useState(100);
  return <div className="company-preview-shell">
    <div className="company-preview-caption">Live design preview · {profile.letterhead.page.size.toUpperCase()} · {profile.letterhead.page.orientation}</div>
    <div className="company-preview-toolbar">
      <div role="group" aria-label="Letterhead preview mode"><button className="btn ghost small" type="button" aria-pressed={mode === 'visual'} onClick={() => setMode('visual')}>Visual preview</button><button className="btn ghost small" type="button" aria-pressed={mode === 'text'} onClick={() => setMode('text')}>Readable text</button></div>
      <label className="company-field"><span>Preview zoom</span><select value={zoom} disabled={mode === 'text'} onChange={e => setZoom(Number(e.target.value))}>{[100, 125, 150, 200].map(value => <option key={value} value={value}>{value}%</option>)}</select></label>
    </div>
    {mode === 'visual' ? <VisualPreview profile={profile} zoom={zoom} /> : <TextPreview profile={profile} />}
    <p className="company-hint">Preview uses sample correspondence. Zoom or choose readable text to review every line. Download a rendered Word proof to check final pagination. Agency forms and original legal files keep their original format.</p>
    <ContrastGuidance profile={profile} />
  </div>;
}
