import React, { useState, useMemo } from 'react';
import { I } from '../icons';
import { SampleTag } from '../dataConnect';
import type { SurfaceViewProps } from '../surfaceViews';
import { DOSSIER_SPINES, flattenDocs } from '../fixtures/dossier-data';
import type { DossierDoc } from '../fixtures/dossier-data';
import '../styles/project-home-v2.css';

/* ── IVDR requirement families -- the regulator's structure for a Performance
   Evaluation / technical file. Each maps to the spine leaves that evidence it
   (by section code) + carries the governing IVDR reference. ── */

interface IvdFamily {
  id: string;
  label: string;
  ref: string;
  blurb: string;
  match: (s: DossierDoc) => boolean;
  items: IvdItem[];
  pct: number;
}

interface IvdItem {
  code: string;
  title: string;
  ref: string;
  status: string;
  pct: number;
  flag?: string;
}

const IVD_FAMILIES_SEED: { id: string; label: string; ref: string; blurb: string; match: (s: DossierDoc) => boolean }[] = [
  { id: 'gspr', label: 'General Safety & Performance Requirements', ref: 'IVDR Annex I',
    blurb: 'Conformity of the device against each applicable GSPR -- the backbone of the technical file.',
    match: (s) => /gspr/i.test(s.title) || s.num === 'II.4' },
  { id: 'anal', label: 'Analytical performance', ref: 'IVDR Annex I §9.1 -- Annex XIII Part A',
    blurb: 'Sensitivity, specificity, LoD, linearity, precision, trueness, cross-reactivity.',
    match: (s) => /analytical performance/i.test(s.title) },
  { id: 'clin', label: 'Clinical performance', ref: 'IVDR Annex XIII Part A',
    blurb: 'Diagnostic sensitivity/specificity, predictive values, likelihood ratios vs a reference.',
    match: (s) => /clinical performance/i.test(s.title) },
  { id: 'valid', label: 'Scientific validity', ref: 'IVDR Annex XIII Part A',
    blurb: 'Association of the analyte with the targeted clinical condition/physiological state.',
    match: (s) => /scientific validity/i.test(s.title) },
  { id: 'per', label: 'Performance Evaluation Report (PER)', ref: 'IVDR Annex XIII',
    blurb: 'The consolidated report tying scientific validity + analytical + clinical performance together.',
    match: (s) => /performance evaluation report|\bPER\b/i.test(s.title) },
  { id: 'desc', label: 'Device description & classification', ref: 'IVDR Annex II -- Annex VIII',
    blurb: 'Intended purpose, target markers/population, and the Annex VIII risk-class rule.',
    match: (s) => /device description|classification|intended purpose|companion-diagnostic linkage/i.test(s.title) },
];

/* Post-market family -- grounded in the app's IVD post-market filing types. */
const IVD_POSTMARKET: { id: string; label: string; ref: string; blurb: string; items: IvdItem[]; pct: number } = {
  id: 'pmpf', label: 'Post-market performance & surveillance', ref: 'IVDR Annex III -- Art. 78-81',
  blurb: 'PMPF plan/report, PMS plan, trend reporting and the periodic safety update (PSUR).',
  items: [
    { code: 'PMPF', title: 'Post-Market Performance Follow-Up plan & report', ref: 'IVDR Annex XIII Part B', status: 'not_started', pct: 0 },
    { code: 'PMS', title: 'Post-market surveillance plan', ref: 'IVDR Art. 79', status: 'not_started', pct: 0 },
    { code: 'PSUR', title: 'Periodic Safety Update Report', ref: 'IVDR Art. 81', status: 'not_started', pct: 0 },
  ],
  pct: 0,
};

function ivdTone(pct: number, status: string): string {
  if (status === 'complete' || status === 'approved' || pct >= 100) return 'done';
  if (status === 'not_started' || pct === 0) return 'missing';
  if (pct >= 60) return 'review';
  return 'draft';
}

const IVD_STLABEL: Record<string, string> = { done: 'Complete', review: 'In review', draft: 'Drafting', missing: 'Not started' };

/* ════ IVD Completeness -- IVDR technical file surface ════ */

export function IvdCompleteness({ onAsk, segment }: SurfaceViewProps) {
  const seg = segment || 'diagnostics';
  const spine = DOSSIER_SPINES.diagnostics || { tree: [], program: '', spine: '' };
  const leaves = useMemo(() => flattenDocs(spine.tree), [spine.tree]);

  /* build the family checklist from the REAL spine leaves */
  const families = useMemo<IvdFamily[]>(() => {
    const used: Record<string, boolean> = {};
    const fam = IVD_FAMILIES_SEED.map(f => {
      const items: IvdItem[] = leaves.filter(s => {
        if (used[s.id]) return false;
        const m = f.match(s);
        if (m) used[s.id] = true;
        return m;
      }).map(s => ({
        code: s.num && s.num !== '--' ? s.num : (s.type || ''),
        title: s.title,
        ref: f.ref,
        status: s.status,
        pct: s.pct == null ? 0 : s.pct,
        flag: s.flag,
      }));
      const pct = items.length ? Math.round(items.reduce((a, b) => a + (b.pct || 0), 0) / items.length) : 0;
      return { ...f, items, pct } as IvdFamily;
    });
    const pm: IvdFamily = { ...IVD_POSTMARKET, match: () => false };
    return [...fam, pm];
  }, [leaves]);

  const allItems = families.reduce<IvdItem[]>((a, f) => a.concat(f.items), []);
  const overall = allItems.length ? Math.round(allItems.reduce((a, b) => a + (b.pct || 0), 0) / allItems.length) : 0;
  const missing = allItems.filter(i => (i.pct || 0) === 0);
  const inflight = allItems.filter(i => (i.pct || 0) > 0 && (i.pct || 0) < 100);
  const done = allItems.filter(i => (i.pct || 0) >= 100);
  const flags = allItems.filter(i => i.flag);

  const [open, setOpen] = useState<string[]>(IVD_FAMILIES_SEED.slice(0, 4).map(f => f.id));
  const toggle = (id: string) => { setOpen(p => p.indexOf(id) >= 0 ? p.filter(x => x !== id) : p.concat([id])); };

  /* wrong-segment guard: this view is IVD-only */
  if (seg !== 'diagnostics') {
    return (
      <div className="ivd">
        <div className="ivd-lead">
          <div className="ivd-lead-ic">{I.alertTriangle}</div>
          <div>
            <p className="ivd-lead-h">The IVD completeness view applies to In-Vitro Diagnostic programs.</p>
            <p className="ivd-lead-b">Switch to the Diagnostics / IVD segment to see the IVDR requirements (GSPR Annex I, Performance Evaluation Report, analytical + clinical performance, PMPF/PMS).</p>
          </div>
        </div>
      </div>
    );
  }

  const blocker = missing.length
    ? 'The gate to a CE certificate is the ' + (missing.find(m => /PER|performance evaluation/i.test(m.title)) ? 'Performance Evaluation Report' : missing[0].title) + ' -- ' + missing.length + ' requirement' + (missing.length === 1 ? '' : 's') + ' not yet started.'
    : inflight.length ? inflight.length + ' requirements are still in progress before the technical file is Notified-Body ready.' : 'Every IVDR requirement is evidenced.';

  return (
    <div className="ivd">
      <div className="ivd-head">
        <div className="ivd-eyebrow">
          <span className="ivd-kicker">IVDR technical file -- performance evaluation</span>
          <span className="ivd-src sample">Sample data</span>
        </div>
        <h1 className="ivd-title">{spine.program || 'IVD program'}</h1>
        <div className="ivd-sub">{spine.spine || 'EU IVDR Annex II/III'} -- validate-completeness (IVDR branch)</div>
      </div>

      <div className="ivd-lead">
        <div className="ivd-lead-ic">{I.sparkles}</div>
        <div>
          <p className="ivd-lead-h">Your IVDR technical file is {overall}% complete. {blocker}</p>
          <p className="ivd-lead-b">These are IVDR requirements -- General Safety &amp; Performance (Annex I), the Performance Evaluation Report (Annex XIII), analytical and clinical performance, scientific validity and post-market follow-up -- not the 510(k)/device checklist. {done.length} of {allItems.length} evidenced -- {inflight.length} in progress -- {missing.length} not started{flags.length ? ' -- ' + flags.length + ' open flag' + (flags.length === 1 ? '' : 's') : ''}.</p>
        </div>
      </div>

      <div className="ivd-stats">
        <div className="ivd-stat"><span className="ivd-stat-n">{overall}%</span><span className="ivd-stat-l">Technical file complete</span></div>
        <div className="ivd-stat"><span className="ivd-stat-n">{done.length}<span className="ivd-stat-d">/{allItems.length}</span></span><span className="ivd-stat-l">Requirements evidenced</span></div>
        <div className="ivd-stat"><span className="ivd-stat-n ivd-warn">{missing.length}</span><span className="ivd-stat-l">Not yet started</span></div>
        <div className="ivd-stat"><span className="ivd-stat-n">{flags.length}</span><span className="ivd-stat-l">Open evidence flags</span></div>
      </div>

      <div className="ivd-families">
        {families.map(f => {
          const isOpen = open.indexOf(f.id) >= 0;
          const tone = f.pct >= 100 ? 'done' : (f.pct === 0 ? 'missing' : (f.pct >= 60 ? 'review' : 'draft'));
          return (
            <div key={f.id} className={'ivd-fam tone-' + tone}>
              <button className="ivd-fam-head" onClick={() => toggle(f.id)}>
                <span className="ivd-fam-caret" data-open={isOpen}>{I.chevronRight}</span>
                <span className="ivd-fam-main">
                  <span className="ivd-fam-label">{f.label}</span>
                  <span className="ivd-fam-ref">{f.ref}</span>
                </span>
                <span className="ivd-fam-bar"><span className="ivd-fam-fill" style={{ width: f.pct + '%' }} /></span>
                <span className="ivd-fam-pct">{f.pct}%</span>
              </button>
              {isOpen && (
                <div className="ivd-items">
                  <p className="ivd-fam-blurb">{f.blurb}</p>
                  {f.items.map((it, i) => {
                    const t = ivdTone(it.pct, it.status);
                    return (
                      <div key={i} className="ivd-item">
                        <span className={'ivd-dot tone-' + t} />
                        {it.code && <span className="mono ivd-item-code">{it.code}</span>}
                        <span className="ivd-item-title">{it.title}{it.flag && <span className="ivd-item-flag">{I.alertTriangle} {it.flag}</span>}</span>
                        <span className="ivd-item-ref">{it.ref}</span>
                        <span className={'ivd-item-st tone-' + t}>{IVD_STLABEL[t]}</span>
                        <span className="ivd-item-pct">{it.pct}%</span>
                      </div>
                    );
                  })}
                  {!f.items.length && <div className="ivd-item ivd-item-empty">No evidence filed against this requirement yet.</div>}
                  <div className="ivd-fam-act">
                    <button className="ivd-btn" onClick={() => (onAsk || (() => {}))('Draft the ' + f.label + ' section for the IVDR technical file (' + f.ref + '), grounded on the linked performance evidence.')}>{I.sparkles} Ask AnA to build this requirement</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="ivd-foot">Requirements and status derive from this project's IVDR technical file (Annex II/III). Connect the backend to compute completeness live from the validate-completeness engine's IVDR branch.</p>
    </div>
  );
}
