import React, { useState, useMemo, useEffect } from 'react';
import { I } from '../icons';
import { SampleTag, useLive } from '../dataConnect';
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

/* ── Live board types -- GET /api/ivd-completeness/completeness returns
   { success, data: <board> }; useLive assigns the whole HTTP body to `.data`, so
   the display payload is at `.data.data`. Mirrors the route's display shape. The
   live families carry no `match` predicate (server display shape), hence
   Omit<IvdFamily, 'match'>. ── */
interface IvdBoardSummary { total: number; evidenced: number; inProgress: number; notStarted: number; flags: number; }
interface IvdBoardData {
  program: string | null;
  spine: string;
  standard: string;
  overall: number;
  summary: IvdBoardSummary;
  families: Omit<IvdFamily, 'match'>[];
  gsprSourced: boolean;
  perDocumentPresent: boolean;
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

  /* FIXTURE FALLBACK -- build the family checklist from the REAL spine leaves.
     Kept as the fail-closed source that renders whenever the live read-model is
     unreachable, unprovisioned (503) or shape-mismatched. */
  const fixtureFamilies = useMemo<IvdFamily[]>(() => {
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

  /* Shape-exact { data: <board> } fixture so `.data.data` is uniform whether the
     response is live or the sample fallback (mirrors the route's display shape).
     Only ever used as the useLive fallback -- the surface renders fixtureFamilies
     directly in sample mode, so this content is never presented as live. */
  const fixtureBoard = useMemo<IvdBoardData>(() => {
    const its = fixtureFamilies.reduce<IvdItem[]>((a, f) => a.concat(f.items), []);
    const ov = its.length ? Math.round(its.reduce((a, b) => a + (b.pct || 0), 0) / its.length) : 0;
    return {
      program: spine.program || null,
      spine: spine.spine || 'EU IVDR Annex II/III',
      standard: 'IVDR',
      overall: ov,
      summary: {
        total: its.length,
        evidenced: its.filter(i => (i.pct || 0) >= 100).length,
        inProgress: its.filter(i => (i.pct || 0) > 0 && (i.pct || 0) < 100).length,
        notStarted: its.filter(i => (i.pct || 0) === 0).length,
        flags: its.filter(i => i.flag).length,
      },
      families: fixtureFamilies.map(f => ({ id: f.id, label: f.label, ref: f.ref, blurb: f.blurb, pct: f.pct, items: f.items })),
      gsprSourced: false,
      perDocumentPresent: false,
    };
  }, [fixtureFamilies, spine.program, spine.spine]);

  /* LIVE read-model -- GET /api/ivd-completeness/completeness -> { success, data }.
     useLive assigns the whole body to `.data`, so the board is at `.data.data`.
     Fetched only on the IVD segment. Trust live ONLY when it is not the sample
     fallback AND the families array structurally matches the display contract
     (the route fail-closes with 503 when unprovisioned, which useLive already
     turns into the sample fallback -- there is no separate provisioned flag to
     gate on). Otherwise fail closed to the derived fixture, shown as "Sample data". */
  const livePath = seg === 'diagnostics' ? '/api/ivd-completeness/completeness' : null;
  const raw = useLive<{ data?: IvdBoardData }>(livePath, { data: fixtureBoard });
  const board = raw.data?.data;
  const familiesLive = Boolean(
    !raw.sample &&
    board &&
    Array.isArray(board.families) &&
    board.families.length > 0 &&
    typeof board.families[0]?.id === 'string' &&
    typeof board.families[0]?.label === 'string' &&
    Array.isArray(board.families[0]?.items),
  );
  const liveFamilies = familiesLive ? board!.families : null;
  const familiesSample = !familiesLive;

  /* Selected families: live when trusted, else the derived fixture. Live board
     families carry no `match` predicate, so add an inert one to satisfy the local
     IvdFamily contract -- exactly as the post-market fixture family does. */
  const families: IvdFamily[] = liveFamilies
    ? liveFamilies.map(f => ({ ...f, match: () => false }))
    : fixtureFamilies;

  /* Honest nulls: the live program is string | null (the route emits null when no
     device/PER record names the program) -- fall back to the generic label rather
     than fabricate a name, mirroring the existing sample behaviour. */
  const program = familiesLive ? board!.program : (spine.program || null);
  const spineLabel = (familiesLive ? board!.spine : spine.spine) || 'EU IVDR Annex II/III';

  const allItems = families.reduce<IvdItem[]>((a, f) => a.concat(f.items), []);
  const overall = allItems.length ? Math.round(allItems.reduce((a, b) => a + (b.pct || 0), 0) / allItems.length) : 0;
  const missing = allItems.filter(i => (i.pct || 0) === 0);
  const inflight = allItems.filter(i => (i.pct || 0) > 0 && (i.pct || 0) < 100);
  const done = allItems.filter(i => (i.pct || 0) >= 100);
  const flags = allItems.filter(i => i.flag);

  /* Open state seeds the first four requirement families, then re-seeds to the
     first four LIVE families once the live board arrives. Family ids are stable
     across seed and server, so this is a no-op in practice but stays correct if
     the server's order or ids differ. */
  const [open, setOpen] = useState<string[]>(IVD_FAMILIES_SEED.slice(0, 4).map(f => f.id));
  useEffect(() => {
    if (liveFamilies) setOpen(liveFamilies.slice(0, 4).map(f => f.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [familiesLive]);
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
          <SampleTag sample={familiesSample} />
        </div>
        <h1 className="ivd-title">{program || 'IVD program'}</h1>
        <div className="ivd-sub">{spineLabel} -- validate-completeness (IVDR branch)</div>
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
                  <p className="ivd-fam-blurb">{f.blurb} <SampleTag sample={familiesSample} /></p>
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

      <p className="ivd-foot">{familiesSample
        ? "Requirements and status derive from this project's IVDR technical file (Annex II/III). Connect the backend to compute completeness live from the validate-completeness engine's IVDR branch."
        : "Requirements and status are computed live from your organization's IVDR records (Annex II/III) via the validate-completeness engine's IVDR branch."}</p>
    </div>
  );
}
