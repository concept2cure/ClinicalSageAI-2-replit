import React, { useMemo, useState } from 'react';
import { I } from '../icons';
import { useLiveData, EmptyState } from '../dataConnect';
import type { SurfaceViewProps } from '../surfaceViews';
import { usePublishSurfaceContext } from '../surfaceContext';
import '../styles/project-home-v2.css';

/* ── IVD Completeness -- IVDR technical-file / Performance-Evaluation readiness.

   Real-data standard (no fixture in a shipped surface). This board previously
   built its requirement checklist from a fabricated diagnostics dossier spine
   (`../fixtures/dossier-data` -> DOSSIER_SPINES.diagnostics, flattened to
   leaves) plus a hardcoded post-market family (IVD_POSTMARKET) with invented
   statuses, labelled "Sample data".

   It is now anchored to the REAL org-scoped read-model:
     GET /api/ivd-completeness/completeness   (server/routes/ivd-completeness-routes.ts)
   which returns this surface's exact display shape, computed from the org's
   IVDR records: ivdr_classifications, ivd_analytical_performance,
   ivd_clinical_performance, ivdr_per_documents and ivdr_gspr_assessments.
   Real data -> honest empty (no records) -> honest error (unreachable / IVD
   read-model not provisioned). The IVDR requirement TAXONOMY (family
   id/label/annex-ref/blurb) is regulatory reference structure supplied BY the
   backend, so the surface no longer carries a client-side seed. ── */

/* ── Display types -- mirror the /completeness read-model shape. The backend
   never fabricates a per-item evidence `flag`, an owner, a version or a
   free-text note, and `summary.flags` is always 0 (no such field is stored);
   `program` is null until a device is recorded. All rendered null-safe. ── */

type IvdItemStatus = 'complete' | 'review' | 'draft' | 'not_started';

interface IvdItem {
  code: string;
  title: string;
  ref: string;
  status: IvdItemStatus;
  pct: number;
  flag?: string; // not populated by the backend today; kept null-safe at render
}

interface IvdFamily {
  id: string;
  label: string;
  ref: string;
  blurb: string;
  pct: number;
  items: IvdItem[];
}

interface IvdCompletenessData {
  program: string | null;
  spine: string;
  standard: string;
  overall: number;
  summary: {
    total: number;
    evidenced: number;
    inProgress: number;
    notStarted: number;
    flags: number;
  };
  families: IvdFamily[];
  gsprSourced: boolean;
  perDocumentPresent: boolean;
}

/* Default-open the first four requirement families (canonical IVDR taxonomy
   order returned by the read-model: gspr, anal, clin, valid, per, desc, pmpf). */
const DEFAULT_OPEN_FAMILIES = ['gspr', 'anal', 'clin', 'valid'];

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
  /* IVD-only board; the read-model is org-scoped, so only fetch on the IVD
     segment (a null path idles the hook without a request). */
  const path = seg === 'diagnostics' ? '/api/ivd-completeness/completeness' : null;
  const { data, loading, error } = useLiveData<IvdCompletenessData>(path);

  const [open, setOpen] = useState<string[]>(DEFAULT_OPEN_FAMILIES);
  const toggle = (id: string) => { setOpen(p => p.indexOf(id) >= 0 ? p.filter(x => x !== id) : p.concat([id])); };

  /* Derived read-model projections -- safe when data is absent (loading/error);
     the real board below only renders once data has at least one item.

     Hoisted ABOVE the wrong-segment guard because the surface-context hook
     below reads them, and a hook cannot run after an early return. They were
     already null-safe, so nothing about them changes. */
  const families = data?.families ?? [];
  const allItems = families.reduce<IvdItem[]>((a, f) => a.concat(f.items ?? []), []);
  const overall = data?.overall ?? 0;
  const missing = allItems.filter(i => (i.pct || 0) === 0);
  const inflight = allItems.filter(i => (i.pct || 0) > 0 && (i.pct || 0) < 100);
  const done = allItems.filter(i => (i.pct || 0) >= 100);
  const flags = allItems.filter(i => i.flag);

  const blocker = missing.length
    ? 'The gate to a CE certificate is the ' + (missing.find(m => /PER|performance evaluation/i.test(m.title)) ? 'Performance Evaluation Report' : missing[0].title) + ' -- ' + missing.length + ' requirement' + (missing.length === 1 ? '' : 's') + ' not yet started.'
    : inflight.length ? inflight.length + ' requirements are still in progress before the technical file is Notified-Body ready.' : 'Every IVDR requirement is evidenced.';

  /* What AnA can see of this screen. Published BEFORE the wrong-segment early
     return below — that return is a legitimate screen state ("this board is
     IVD-only, you are on another segment") and it is exactly the state a user
     would ask about, so it must not be the one state AnA cannot see. React
     would refuse the conditional call anyway.

     A FAILED read publishes the failure: `families` is [] when the read threw,
     and reporting 0% technical-file completeness over an outage is a
     Notified-Body readiness claim nobody computed. */
  const anaContext = useMemo(() => {
    if (seg !== 'diagnostics') {
      return {
        summary:
          `The IVDR technical-file completeness board applies to In-Vitro Diagnostic programs only, and the ` +
          `active segment is "${seg}" — so no completeness data is on screen. This is a segment mismatch, ` +
          'not an empty technical file.',
        availableActions: ['Switch to the Diagnostics / IVD segment to see this board'],
      };
    }
    if (loading) {
      return { summary: 'The IVDR technical-file completeness is still loading; nothing on screen is final yet.' };
    }
    if (error || !data) {
      return {
        summary:
          'The IVDR completeness read-model could not be read, so this screen is showing no requirement ' +
          'coverage because of a failure, not because nothing is evidenced.',
        availableActions: ['Retry the IVDR completeness read'],
      };
    }
    return {
      summary:
        `IVDR technical file for ${data.program || 'this IVD program'} (${data.spine}): ` +
        `${overall}% complete over ${allItems.length} requirement(s) — ${done.length} evidenced, ` +
        `${inflight.length} in progress, ${missing.length} not started, ${flags.length} flagged. ${blocker}`,
      facts: {
        program: data.program,
        spine: data.spine,
        standard: data.standard,
        overallPercent: overall,
        summary: data.summary,
        families: families.map((f) => ({ id: f.id, label: f.label, ref: f.ref, percent: f.pct, requirements: (f.items ?? []).length })),
        notStarted: missing.slice(0, 12).map((i) => ({ code: i.code, title: i.title, ref: i.ref })),
        inProgress: inflight.slice(0, 12).map((i) => ({ code: i.code, title: i.title, ref: i.ref, percent: i.pct })),
        expandedFamilies: open,
      },
      availableActions: [
        'Expand a requirement family to read its individual IVDR requirements',
        'Read which requirements are not started, in progress or evidenced',
      ],
    };
  }, [seg, loading, error, data, overall, allItems.length, done.length, inflight, missing, flags.length, blocker, families, open]);
  usePublishSurfaceContext('ivd-completeness', anaContext);

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

  return (
    <div className="ivd">
      <div className="ivd-head">
        <div className="ivd-eyebrow">
          <span className="ivd-kicker">IVDR technical file — performance evaluation</span>
        </div>
        <h1 className="ivd-title">{data?.program || 'IVD program'}</h1>
        <div className="ivd-sub">{data?.spine || 'EU IVDR 2017/746 · Annex II/III · Annex XIII'} -- technical-file completeness</div>
      </div>

      {loading ? (
        <div role="status" className="scaf-note" style={{ padding: '18px 10px' }}>Loading the IVDR technical-file completeness…</div>
      ) : error || !data ? (
        <EmptyState
          tone="error"
          icon={I.alertTriangle}
          title="Couldn't load the IVDR completeness board"
          hint="The IVDR completeness read-model didn't respond. It's computed from this organization's IVDR records — Annex VIII classifications, analytical and clinical performance studies, the Performance Evaluation Report and the GSPR checklist. Sign in and retry, or check the IVD read-model is provisioned."
        />
      ) : allItems.length === 0 ? (
        <EmptyState
          icon={I.fileText}
          title="No IVDR technical-file records yet"
          hint="Record an Annex VIII classification, analytical or clinical performance studies, or a Performance Evaluation Report for this organization and the IVDR requirement families (GSPR, analytical + clinical performance, scientific validity, PER, PMPF) will populate here with live completeness."
        />
      ) : (
        <>
          <div className="ivd-lead">
            <div className="ivd-lead-ic">{I.sparkles}</div>
            <div>
              <p className="ivd-lead-h">Your IVDR technical file is {overall}% complete. {blocker}</p>
              <p className="ivd-lead-b">These are IVDR requirements — General Safety &amp; Performance (Annex I), the Performance Evaluation Report (Annex XIII), analytical and clinical performance, scientific validity and post-market follow-up — not the 510(k)/device checklist. {done.length} of {allItems.length} evidenced -- {inflight.length} in progress -- {missing.length} not started{flags.length ? ' -- ' + flags.length + ' open flag' + (flags.length === 1 ? '' : 's') : ''}.</p>
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

          <p className="ivd-foot">Completeness is computed live from this organization's IVDR records — Annex VIII classifications, analytical and clinical performance studies, the latest Performance Evaluation Report, and the GSPR checklist. Requirements with no recorded evidence show as not started; no owner, version or evidence flag is shown unless it is stored.</p>
        </>
      )}
    </div>
  );
}
