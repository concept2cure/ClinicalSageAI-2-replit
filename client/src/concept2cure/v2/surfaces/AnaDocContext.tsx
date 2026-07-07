import React, { useState } from 'react';
import { I } from '../icons';

interface SectionOutline {
  heading: string;
  code?: string;
  required?: boolean;
  guidance?: string;
  targetWords?: [number, number];
}

interface DocumentDetection {
  displayName: string;
  confidence?: number;
  sections?: SectionOutline[];
  sectionsSource?: string;
  authority?: string;
  submissionFamily?: string;
  primaryCode?: string;
  chipLabel?: string;
}

interface DocumentContextCardProps {
  doc: DocumentDetection | null;
  defaultOpen?: boolean;
}

interface DocTypeChipProps {
  doc: DocumentDetection | null;
}

interface MetaLensChipProps {
  label?: string;
  icon?: string;
}

export function DocumentContextCard({ doc, defaultOpen }: DocumentContextCardProps) {
  const [open, setOpen] = useState(defaultOpen !== false);
  if (!doc) return null;

  const conf = typeof doc.confidence === 'number' ? doc.confidence : 1;
  const uncertain = conf < 0.4;
  const sections = doc.sections || [];
  const required = sections.filter(function (s) { return s.required; });
  const authorityLabel = doc.authority || '';
  const fixtureSections = doc.sectionsSource === 'fixture';

  return (
    <div className={'adc' + (uncertain ? ' uncertain' : '')}>
      <div className="adc-head">
        <span className="adc-ic">{I.fileText || I.file || '§'}</span>
        <div className="adc-head-main">
          <div className="adc-kicker">{uncertain ? 'Likely — confirm before I draft' : 'Understood — drafting to this structure'}</div>
          <div className="adc-name">{uncertain ? 'Likely: ' + doc.displayName : doc.displayName}</div>
        </div>
        <span className={'adc-conf ' + (uncertain ? 'low' : 'high')} title={'Detection confidence ' + Math.round(conf * 100) + '%'}>
          {uncertain ? (I.alertTriangle || '?') : (I.check || '✓')}
          <span className="adc-conf-n">{Math.round(conf * 100)}%</span>
        </span>
      </div>

      <div className="adc-meta">
        {authorityLabel && <span className="adc-chip">{authorityLabel}</span>}
        {doc.submissionFamily && <span className="adc-chip">{doc.submissionFamily}</span>}
        {doc.primaryCode && <span className="adc-chip mono">{doc.primaryCode}</span>}
      </div>

      {uncertain && (
        <div className="adc-uncertain">
          {I.alertTriangle || '!'} I'm not fully certain this is a <b>{doc.displayName}</b>. If that's right I'll follow its structure; if not, tell me the document type so I don't draft against the wrong outline.
        </div>
      )}

      {sections.length > 0 && (
        <div className="adc-outline">
          <button className="adc-outline-hd" onClick={() => setOpen(o => !o)} aria-expanded={open}>
            <span className="adc-caret" data-open={open}>{I.chevRight || '›'}</span>
            <span className="adc-outline-t">{sections.length} sections</span>
            <span className="adc-outline-s">{required.length} required{sections.length > required.length ? ' · ' + (sections.length - required.length) + ' optional' : ''}</span>
          </button>
          {open && (
            <ol className="adc-sections">
              {sections.map(function (s, i) {
                return (
                  <li key={i} className={'adc-sec' + (s.required ? '' : ' optional')} title={s.guidance || ''}>
                    <span className={'adc-sec-dot' + (s.required ? '' : ' opt')}></span>
                    {s.code && <span className="adc-sec-code mono">{s.code}</span>}
                    <span className="adc-sec-h">{s.code ? s.heading.replace(new RegExp('^' + s.code.replace(/[.]/g, '\\.') + '\\s*'), '') : s.heading}</span>
                    {s.targetWords && <span className="adc-sec-w">{s.targetWords[0]}{'–'}{s.targetWords[1]}w</span>}
                    {!s.required && <span className="adc-sec-opt">optional</span>}
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      )}

      {open && sections.length > 0 && fixtureSections && (
        <div className="adc-note">{I.info || 'ⓘ'} Offline — outline from the ICH/FDA template registry (same shape as the live <span className="mono">{'sections[]'}</span> on the orchestration event, merged PR #1005).</div>
      )}
    </div>
  );
}

export function DocTypeChip({ doc }: DocTypeChipProps) {
  if (!doc) return null;
  const conf = typeof doc.confidence === 'number' ? doc.confidence : 1;
  const uncertain = conf < 0.4;
  return (
    <span className={'meta-chip ' + (uncertain ? 'uncertain' : 'doc')}
      title={(uncertain ? 'Likely: ' : 'Drafting: ') + doc.displayName + ' · detection confidence ' + Math.round(conf * 100) + '%'}>
      <span className="ico">{uncertain ? (I.alertTriangle || '!') : (I.fileText || '§')}</span>
      {!uncertain && doc.primaryCode && <span className="meta-chip-code">{doc.primaryCode}</span>}
      <span>{uncertain ? 'Likely: ' + doc.chipLabel : doc.chipLabel}</span>
    </span>
  );
}

export function MetaLensChip({ label, icon }: MetaLensChipProps) {
  if (!label) return null;
  return (
    <span className="meta-chip lens" title={'Lens: ' + label}>
      <span className="ico">{(icon && I[icon]) || I.search || '◎'}</span>
      <span>{label}</span>
    </span>
  );
}
