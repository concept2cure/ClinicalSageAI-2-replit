import React, { useState } from 'react';
import { I } from '../icons';
import { useLiveRows, EmptyState } from '../dataConnect';
import type { SurfaceViewProps } from '../surfaceViews';
import '../styles/project-home-v2.css';

/* ── Inline fixture types ── */

interface LpContent {
  heading: string;
  body: string[];
  hl?: boolean;
  warn?: boolean;
}

interface LpNegotiation {
  round: string;
  cycle: string;
  sponsor: string;
  agency: string;
  rationale: string;
}

/* One row per label section — the live read shape (GET /api/labeling-pi,
   assembled from the REAL org-scoped labeling_pi_sections store written via
   POST /api/labeling-pi). The section number + label are catalog; `st`, `flag`,
   `content`, and `negotiation` are per-org instance state. `content`/
   `negotiation` arrive as JSONB and are null for sections without them. */
interface LpRow {
  n: string;
  label: string;
  st: string;
  flag: string | null;
  content: LpContent | null;
  negotiation: LpNegotiation | null;
}

/* Display metadata (fixed regulatory stage ladder — not per-org data). */
const LP_STAGES = ['Draft', 'FDA labeling review', 'Negotiation', 'Approved'];

/* ════ Labeling PI -- prescribing information surface ════ */

export function LabelingPI({ onAsk }: SurfaceViewProps) {
  const [fmt, setFmt] = useState('uspi');
  const [active, setActive] = useState('1');
  const [stage, setStage] = useState('Negotiation');

  /* Fixture-free (real-data standard): the org's label worklist is read live
     from the REAL labeling_pi_sections store (written via POST /api/labeling-pi).
     Real rows, an honest empty state, or an honest error — never a fixture. */
  const { rows, loading, error, empty } = useLiveRows<LpRow>('/api/labeling-pi');

  const stIdx = LP_STAGES.indexOf(stage);
  const numberedSections = rows.filter(s => /^\d/.test(s.n)).length;
  const boxedProposed = rows.filter(s => s.n === 'BW' && s.st !== 'na').length;
  const sec = rows.find(s => s.n === active) || rows[2] || rows[0];
  const content = sec?.content || { heading: (sec?.n ?? active) + '  ' + (sec?.label ?? ''), body: ['Section content is maintained in the structured label and rendered here. Open in the editor to author, or ask AnA to draft from the clinical and safety files.'] };
  const neg = sec?.negotiation ?? null;
  const agencyOpen = rows.filter(s => s.flag === 'agency').length;

  return (
    <div className="reg-wrap lp">
      <div className="reg-head">
        <div>
          <div className="reg-eyebrow">Platform — authoring</div>
          <h1 className="reg-title">Labeling — prescribing information</h1>
          <p className="reg-sub">The label itself — PLLR / 21 CFR 201.57 (USPI), EU SmPC (QRD), and SPL for submission. The highest-stakes document of the review, negotiated with the agency at end of cycle.</p>
        </div>
        <button className="reg-cta" onClick={() => onAsk && onAsk('Draft the BX-204 USPI from the clinical studies, safety file, and CMC')}>{I.sparkles} Draft with AnA</button>
      </div>

      <div className="reg-kpis">
        <div className="reg-kpi"><div className="reg-kpi-v">PLLR</div><div className="reg-kpi-l">USPI format — 21 CFR 201.57</div></div>
        <div className="reg-kpi"><div className="reg-kpi-v">{loading ? '--' : numberedSections}</div><div className="reg-kpi-l">Full PI sections</div></div>
        <div className="reg-kpi" data-tone="warn"><div className="reg-kpi-v">{loading ? '--' : agencyOpen}</div><div className="reg-kpi-l">Open agency edits</div></div>
        <div className="reg-kpi" data-tone={boxedProposed ? 'err' : undefined}><div className="reg-kpi-v">{loading ? '--' : boxedProposed}</div><div className="reg-kpi-l">Boxed warning proposed</div></div>
      </div>

      <div className="lp-fmt">
        {([['uspi', 'USPI — PLLR'], ['smpc', 'EU SmPC — QRD'], ['spl', 'SPL — submission']] as [string, string][]).map(([id, l]) => (
          <button key={id} className={'lp-fmt-b' + (fmt === id ? ' on' : '')} onClick={() => setFmt(id)}>{l}</button>
        ))}
        <div className="lp-stages">
          {LP_STAGES.map((s, i) => (
            <button key={s} className={'lp-stage' + (i === stIdx ? ' on' : '') + (i < stIdx ? ' done' : '')} onClick={() => setStage(s)}>
              <span className="lp-stage-dot">{i < stIdx ? I.check : i + 1}</span>{s}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="scaf-note" style={{ padding: '18px 10px' }}>Loading the label worklist…</div>
      ) : error ? (
        <EmptyState
          tone="error"
          icon={I.alertTriangle}
          title="Couldn't load the label"
          hint="The org's structured product label (USPI) didn't respond — sign in and retry, or check the service is reachable."
        />
      ) : empty ? (
        <EmptyState
          icon={I.fileText}
          title="No label sections yet"
          hint="Record or author USPI sections and the section tree, rendered label text, and agency negotiation appear here."
        />
      ) : (
      <div className="lp-split">
        <aside className="lp-tree">
          <div className="lp-tree-h">Label sections</div>
          {rows.map(s => (
            <button key={s.n} className={'lp-sec' + (s.n === active ? ' on' : '')} data-st={s.st} onClick={() => setActive(s.n)}>
              <span className="lp-sec-n">{s.n}</span>
              <span className="lp-sec-l">{s.label}</span>
              {s.flag === 'agency' && <span className="lp-sec-flag" title="FDA proposed an edit">{I.gitBranch || I.alertTriangle}</span>}
              <span className="lp-sec-dot" data-st={s.st} />
            </button>
          ))}
        </aside>

        <div className="lp-main">
          <div className="lp-doc">
            <div className="lp-doc-bar">
              <span className="lp-doc-id">BX-204 (rezatinib) -- USPI — v3.2</span>
              <div className="lp-doc-acts">
                <button className="reg-mini">{I.fileText} PDF</button>
                <button className="reg-mini">{I.download} Word</button>
                <button className="reg-mini" onClick={() => onAsk && onAsk('Open §' + active + ' of the BX-204 USPI in the editor')}>{I.penLine} Open in editor</button>
              </div>
            </div>
            <div className={'lp-page' + (content.hl ? ' hl' : '')}>
              {content.warn && <div className="lp-bw">{content.body[0]}</div>}
              {!content.warn && <>
                <div className="lp-page-h">{content.heading}</div>
                {content.body.map((p, i) => <p key={i} className="lp-page-p">{p}</p>)}
              </>}
              {content.hl && <div className="lp-hl-note">Highlights are a concise summary; see the numbered full prescribing information for complete labeling.</div>}
            </div>
          </div>

          {neg && (
            <div className="lp-neg">
              <div className="lp-neg-h">
                <span className="lp-neg-t">{I.gitBranch || I.alertTriangle} Agency labeling negotiation -- §{active}</span>
                <span className="lp-neg-m">{neg.round} -- {neg.cycle}</span>
              </div>
              <div className="lp-neg-diff">
                <div className="lp-neg-row sponsor"><span className="lp-neg-tag">Sponsor</span><p>{neg.sponsor}</p></div>
                <div className="lp-neg-row agency"><span className="lp-neg-tag">FDA proposed</span><p>{neg.agency}</p></div>
              </div>
              <div className="lp-neg-rat"><span>{I.sparkles}</span><p>{neg.rationale}</p></div>
              <div className="lp-neg-acts">
                <button className="reg-btn pri">{I.check} Accept FDA text</button>
                <button className="reg-btn" onClick={() => onAsk && onAsk('Draft a counter-proposal to FDA labeling edit on §' + active)}>Counter with AnA</button>
                <button className="reg-btn ghost">View full redline</button>
              </div>
            </div>
          )}
        </div>
      </div>
      )}
    </div>
  );
}
