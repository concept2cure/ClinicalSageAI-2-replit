/**
 * RBM surfaces 1-5: Overview, Risk review report, Risk assessment (RACT),
 * Key risk indicators, Quality tolerance limits.
 *
 * Every surface reads its slice from the live board
 * (GET /api/mdx-rbm/rbm-board/:programId) passed as `board`, and every edit
 * flow — add/edit CtQ factor, configure a KRI, append a reading, configure a
 * QTL, document a breach, approve the assessment — performs the real write
 * against /api/mdx/rbm-* and then re-fetches the board. Nothing is held in
 * local optimistic state: what is on screen is what the server stored.
 *
 * Only fields the RBM store actually persists are offered. Attributes the
 * schema has no column for (risk category, a separate "risk control" narrative,
 * KRI threshold method / analysis level / per-site drilldown, QTL unit) are not
 * collected — a form that captured them would silently drop them on save.
 */
import React, { useState } from 'react';
import { apiRequest, serverMessage } from '@/lib/queryClient';
import { I } from '../icons';
import type { RbmBoard, RbmBoardItem, RbmBoardKri, RbmBoardQtl, RbmBoardFreshness } from './rbmBoard';
import {
  RbmChip, RbmScore, RiskMatrix, Sparkline, ThresholdGauge, TrendTable,
  RbmFormModal, GovernedApprovalDialog, type FormField,
} from './RbmSurfaces';
import { ErrorState } from '../dataConnect';
import { useRbmMutation, useRbmOwners, ownerId, rbmWrite } from './rbmWrites';
import { RbmIngestDialog } from './RbmIngest';
import '../styles/rbm-v2.css';

interface SubProps {
  board: RbmBoard;
  onTab?: (id: string) => void;
  onAsk?: (t: string) => void;
  onNav?: (id: string) => void;
  /** Re-fetch the live board after a persisted write, so the surface re-derives
      from server truth instead of local optimistic state. */
  onReload?: () => void;
}

/* The persisted CtQ categories — the rbm_risk_items.category enum, not a
   free-form list. The previous UI offered labels ("Endpoint", "Enrollment",
   "Site operations", "IP handling") that no column accepts. */
const CTQ_CATEGORIES = ['safety', 'efficacy', 'data_integrity', 'compliance', 'operational'];
const CTQ_CATEGORY_LABEL: Record<string, string> = {
  safety: 'Safety', efficacy: 'Efficacy', data_integrity: 'Data integrity',
  compliance: 'Compliance', operational: 'Operational',
};
/* The persisted KRI data sources — the rbm_kris.data_source enum. */
const KRI_SOURCES = ['edc', 'ctms', 'site_intel', 'central_stats', 'manual'];
const KRI_SOURCE_LABEL: Record<string, string> = {
  edc: 'EDC', ctms: 'CTMS', site_intel: 'Site intelligence',
  central_stats: 'Central statistics', manual: 'Manual entry',
};
const SCALE = ['1', '2', '3', '4', '5'];

/* ── Board-row → editable view-model coercions ──
   The board is the source of truth; these map its rows into the surfaces' view
   types, stringifying numeric ids. A not-yet-scored/configured KRI or QTL leaves
   its thresholds and current value NULL — never coerced to 0, which would
   fabricate a real-looking limit and drive a false red/breached state. Nulls are
   carried through and rendered as an honest "not yet scored". */
interface ItemView {
  id: number; category: string; factor: string; l: number; i: number;
  det: number | null; critical: boolean; mitigation: string;
  residual: number | null; status: string; owner: string | null;
}
interface KriView {
  id: number; name: string; metric: string; source: string; unit: string;
  dir: string; amber: number | null; red: number | null; current: number | null;
  status: string; at: string; spark: number[];
}
interface QtlView {
  id: number; parameter: string; rationale: string;
  secondary: number | null; threshold: number | null; current: number | null;
  status: string; breachAction: string | null;
}

function itemView(it: RbmBoardItem): ItemView {
  return {
    id: it.id, category: it.category, factor: it.factor,
    l: it.l, i: it.i, det: it.det, critical: it.critical,
    mitigation: it.mitigation, residual: it.residual,
    status: it.status, owner: it.owner,
  };
}
function kriView(k: RbmBoardKri): KriView {
  return {
    id: k.id, name: k.name, metric: k.metric, source: k.source, unit: k.unit,
    dir: k.dir, amber: k.amber, red: k.red, current: k.current,
    status: k.status, at: k.at ?? '', spark: k.spark,
  };
}
function qtlView(q: RbmBoardQtl): QtlView {
  return {
    id: q.id, parameter: q.parameter, rationale: q.rationale,
    secondary: q.secondary, threshold: q.threshold, current: q.current,
    status: q.status, breachAction: q.breachActionTaken,
  };
}

/** Optional numeric form field → number | null (never a silent 0). */
function optNum(v: string | undefined): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Per-source data currency. Rendered above the tiles because every number
 * below it is only as good as the feed behind it: a green KRI computed from an
 * export that last landed three weeks ago is not evidence of control. An
 * untracked study says so outright rather than showing nothing, which would
 * let hand-entered numbers read as monitored data.
 */
function DataFreshness({ sources, onLoad }: { sources: RbmBoardFreshness[]; onLoad: () => void }) {
  if (sources.length === 0) {
    return (
      <div className="rbm-fresh-strip" data-empty>
        <span className="rbm-fresh-l">{I.database}Data sources</span>
        <span className="rbm-fresh-none">
          No source feeds are tracked for this study — the values below were entered by hand and their currency is unrecorded.
        </span>
        <button className="rbm-btn pri rbm-fresh-load" onClick={onLoad}>{I.arrowUp}Load extract…</button>
      </div>
    );
  }
  return (
    <div className="rbm-fresh-strip">
      <span className="rbm-fresh-l">{I.database}Data sources</span>
      {sources.map(s => (
        <span key={s.source} className="rbm-fresh-src" data-stale={s.stale || undefined}
          title={`${s.rowsAccepted} row(s) accepted${s.rowsRejected ? `, ${s.rowsRejected} rejected` : ''}${s.dataCutoff ? ` — cutoff ${s.dataCutoff}` : ''}`}>
          <b>{s.source}</b>
          <em>
            {s.ageDays === null ? 'never loaded'
              : s.ageDays === 0 ? 'today'
                : `${s.ageDays}d old`}
            {s.status === 'failed' ? ' — failed' : s.status === 'partial' ? ' — partial' : ''}
          </em>
        </span>
      ))}
      <button className="rbm-btn rbm-fresh-load" onClick={onLoad}>{I.arrowUp}Load extract…</button>
    </div>
  );
}

/* 1 -- Overview */
export function RbmOverview({ board, onTab, onReload }: SubProps) {
  const [ingesting, setIngesting] = useState(false);
  const S = board.summary;
  // Unevaluated KRIs/QTLs are shown on the tile, not hidden in the remainder:
  // an indicator nobody has read is an oversight gap, not a healthy one.
  const kriUneval = S.kris.notEvaluated ?? 0;
  const qtlUneval = S.qtls.notEvaluated ?? 0;
  const tiles = [
    { k: 'Overall risk', v: null as string | null, chip: <RbmChip vocab="band" value={S.overallRisk ?? 'unknown'} />, sub: 'rbm-engine — L x I banding', nav: 'ract' },
    { k: 'Critical CtQ factors', v: String(S.riskItems.critical), chip: null, sub: `${S.riskItems.open} of ${S.riskItems.total} open`, nav: 'ract' },
    { k: 'KRIs red / amber', v: `${S.kris.red} / ${S.kris.amber}`, chip: null, sub: `${S.kris.total} indicators -- ${kriUneval} not evaluated`, nav: 'kris', warn: S.kris.red > 0 || kriUneval > 0 },
    { k: 'QTLs breached', v: String(S.qtls.breached), chip: null, sub: `${S.qtls.approaching} approaching -- ${qtlUneval} not evaluated`, nav: 'qtls', err: S.qtls.breached > 0 },
    { k: 'Open signals', v: String(S.signals.open), chip: null, sub: `${S.signals.high} high severity`, nav: 'signals', warn: S.signals.high > 0 },
    { k: 'Enhanced-tier sites', v: String(S.sites.enhanced), chip: null, sub: `of ${S.sites.total} sites`, nav: 'sites' },
  ];
  return (
    <div>
      <DataFreshness sources={board.freshness ?? []} onLoad={() => setIngesting(true)} />
      {ingesting && (
        <RbmIngestDialog programId={board.programId} onClose={() => setIngesting(false)} onReload={onReload} />
      )}
      <div className="rbm-tiles">
        {tiles.map((t, i) => (
          <button key={i} className="rbm-tile" data-warn={(t as Record<string, unknown>).warn || undefined} data-err={(t as Record<string, unknown>).err || undefined} onClick={() => onTab?.(t.nav)}>
            <span className="rbm-tile-k">{t.k}</span>
            {t.chip ? <span className="rbm-tile-chip">{t.chip}</span> : <span className="rbm-tile-v">{t.v}</span>}
            <span className="rbm-tile-s">{t.sub}</span>
          </button>
        ))}
      </div>
      <div className="rbm-sec-h"><h2>Needs attention now</h2><span className="rbm-sec-sub">buildAttentionFeed — ordered by severity — as of {S.asOf}</span></div>
      <div className="rbm-att">
        {board.attention.map((a, i) => (
          <button key={i} className="rbm-att-row" data-sev={a.sev} onClick={() => onTab?.(a.nav)}>
            <RbmChip vocab="severity" value={a.sev} />
            <span className="rbm-att-kind">{a.kind}</span>
            <span className="rbm-att-body"><b>{a.t}</b><em>{a.d}</em></span>
            <span className="rbm-att-go">{I.chevRight}</span>
          </button>
        ))}
        {board.attention.length === 0 && <div className="rbm-inbox-empty">Nothing needs attention right now for this study.</div>}
      </div>
    </div>
  );
}

/* 2 -- Report */
export function RbmReport({ board, onAsk }: SubProps) {
  const R = board.report;
  if (!R) {
    return (
      <div className="rbm-report">
        <div className="rbm-note">{I.info}No risk review is available for this study yet — it is generated from the risk assessment, KRIs, QTLs, signals and sites once they exist.</div>
      </div>
    );
  }
  return (
    <div className="rbm-report">
      <div className="rbm-report-h">
        <div>
          <div className="rbm-report-fw">{R.framework}</div>
          <h2 className="rbm-report-t">Risk review</h2>
          <div className="rbm-report-m">As of {R.asOf} -- overall risk <RbmChip vocab="band" value={R.overallRisk} /> -- {R.attentionCount} attention items -- {R.approved ? 'assessment approved' : 'assessment approval pending'}</div>
        </div>
        <div className="rbm-report-acts">
          <button className="rbm-btn" onClick={() => onAsk?.('Export the risk review report as markdown')}>{I.download}Export markdown</button>
          <button className="rbm-btn" onClick={() => window.print()}>{I.fileText}Print</button>
        </div>
      </div>
      <p className="rbm-report-headline">{R.headline}</p>
      {R.sections.map((s, i) => (
        <div key={i} className="rbm-report-sec" data-st={s.status}>
          <div className="rbm-report-sec-h"><span className="t">{s.title}</span><RbmChip vocab="section" value={s.status} /></div>
          <ul>{s.items.map((it, j) => <li key={j}>{it}</li>)}</ul>
        </div>
      ))}
      <div className="rbm-note">{I.info}This report renders the same buildRiskReview output AnA returns from generate_rbm_report — the on-screen and in-chat answers are identical by construction. It is generated live from the current data; it is not yet a versioned, filed review record.</div>
    </div>
  );
}

/* 3 -- RACT */
export function RbmRact({ board, onReload }: SubProps) {
  const [sel, setSel] = useState<{ l: number; i: number } | null>(null);
  const [signFor, setSignFor] = useState(false);
  const [edit, setEdit] = useState<{ mode: string; item?: ItemView } | null>(null);
  const [amending, setAmending] = useState(false);
  const mut = useRbmMutation(onReload);
  const owners = useRbmOwners();

  const asmt = board.assessment;
  const history = asmt?.history ?? [];

  /** Open a versioned amendment. The signed version is left untouched; the new
      draft starts from a copy of its register and needs its own signature. */
  const amend = async (f: Record<string, string>) => {
    const done = await mut.run(async () => {
      await rbmWrite('POST', `/rbm-assessments/${asmt!.id}/amend`, { reason: f.reason });
    });
    if (done) setAmending(false);
  };

  const items = board.items.map(itemView);
  const shown = items.filter(it => !sel || (it.l === sel.l && it.i === sel.i));

  /**
   * An approved assessment is frozen here. Its e-signature attests to specific
   * CtQ content; editing a factor underneath it would leave the approval block
   * still showing the original signer, time and reason for content they never
   * saw. Revising it goes through "Amend", which opens a new draft version
   * carrying a copy of the register — so the signed version stays as signed and
   * the revision is approved in its own right.
   */
  const locked = asmt?.status === 'active';

  /**
   * Persist a CtQ factor. The inherent score and the residual score are both
   * computed server-side from likelihood × impact (rbm-engine scoreRisk), so
   * the form collects the components and never posts a score the engine did
   * not derive. `critical` follows the engine's own high band (>= 15).
   *
   * On edit, fields the board does not carry (risk description, the assigned
   * user, the residual components) are OMITTED rather than sent as null. The
   * form cannot show their stored values, so posting a blank would silently
   * erase whatever was there — an edit to the mitigation text must not wipe
   * the owner. The server's buildPatch skips undefined keys, so omitting is a
   * true no-op on those columns. The cost is that they cannot be cleared from
   * this dialog, only replaced; that is the safer failure.
   *
   * The residual components are sent only as a pair, because the engine
   * derives residual_score from both and half a pair would leave the stored
   * score inconsistent with its inputs.
   */
  const saveItem = async (form: Record<string, string>) => {
    const likelihood = Number(form.l);
    const impact = Number(form.i);
    const isEdit = edit?.mode === 'edit' && !!edit.item;
    const residualL = optNum(form.residualL);
    const residualI = optNum(form.residualI);

    const body: Record<string, unknown> = {
      category: form.category,
      ctqFactor: form.factor,
      likelihood,
      impact,
      detectability: optNum(form.det),
      isCritical: likelihood * impact >= 15,
      mitigation: form.mitigation || null,
      status: form.status,
    };
    // Only include what the operator actually supplied on an edit.
    if (form.riskDescription) body.riskDescription = form.riskDescription;
    else if (!isEdit) body.riskDescription = null;
    const owner = ownerId(form.owner);
    if (owner !== null) body.assignedTo = owner;
    else if (!isEdit) body.assignedTo = null;
    if (residualL !== null && residualI !== null) {
      body.residualLikelihood = residualL;
      body.residualImpact = residualI;
    }

    const done = await mut.run(async () => {
      if (isEdit) {
        await rbmWrite('PATCH', `/rbm-risk-items/${edit!.item!.id}`, body);
      } else {
        await rbmWrite('POST', '/rbm-risk-items', {
          ...body,
          programId: board.programId,
          assessmentId: board.assessment?.id ?? null,
        });
      }
    });
    if (done) setEdit(null);
  };

  const fields: FormField[] = [
    { key: 'category', label: 'Category', type: 'select', options: CTQ_CATEGORIES, labels: CTQ_CATEGORY_LABEL },
    { key: 'factor', label: 'Critical-to-quality factor', type: 'textarea' },
    { key: 'riskDescription', label: 'Risk description (what could go wrong)', type: 'textarea', optional: true },
    { key: 'l', label: 'Likelihood (1-5)', type: 'select', options: SCALE },
    { key: 'i', label: 'Impact (1-5)', type: 'select', options: SCALE },
    { key: 'det', label: 'Detectability (1 easy - 5 hard)', type: 'select', options: SCALE, optional: true, hint: 'Recorded against the factor for review. The governing risk score is likelihood x impact; detectability is not multiplied into it.' },
    { key: 'mitigation', label: 'Mitigation / monitoring control', type: 'textarea' },
    { key: 'residualL', label: 'Residual likelihood after mitigation (1-5)', type: 'select', options: ['', ...SCALE], optional: true, labels: { '': 'Not assessed', '1': '1', '2': '2', '3': '3', '4': '4', '5': '5' } },
    { key: 'residualI', label: 'Residual impact after mitigation (1-5)', type: 'select', options: ['', ...SCALE], optional: true, labels: { '': 'Not assessed', '1': '1', '2': '2', '3': '3', '4': '4', '5': '5' } },
    { key: 'owner', label: 'Risk owner', type: 'select', options: owners.options, labels: owners.labels, optional: true },
    { key: 'status', label: 'Status', type: 'select', options: ['open', 'mitigating', 'accepted', 'closed'], labels: { open: 'Open', mitigating: 'Mitigating', accepted: 'Accepted', closed: 'Closed' } },
  ];

  return (
    <div>
      {mut.error && (
        <ErrorState
          variant="inline"
          title="The change was not saved"
          message={mut.error}
          onDismiss={mut.clearError}
        />
      )}
      {asmt ? (
        <div className="rbm-asmt">
          <div className="rbm-asmt-l">
            <b>{asmt.framework}</b>
            <span>Version {asmt.version} -- <RbmChip vocab={asmt.status === 'active' ? 'action' : 'item'} value={asmt.status === 'active' ? 'done' : 'open'} /> {asmt.status === 'active' ? 'active' : 'draft — approval pending'} -- {items.length} CtQ factors, {items.filter(x => x.critical).length} critical</span>
            {asmt.approval ? <span className="rbm-audit">{I.check}Approved by {asmt.approval.by} -- {asmt.approval.when} -- &quot;{asmt.approval.reason}&quot;</span> : null}
          </div>
          {history.length > 1 && (
            <div className="rbm-asmt-hist">
              {history.map(h => (
                <span key={h.id} className="rbm-hist-row" data-cur={h.id === asmt.id || undefined}>
                  v{h.v} — {h.status}
                  {h.when ? ` — approved ${h.when}${h.by ? ` by ${h.by}` : ''}` : ''}
                  {h.reason ? ` — "${h.reason}"` : h.amendmentReason ? ` — opened: "${h.amendmentReason}"` : ''}
                </span>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7, alignItems: 'flex-end' }}>
            {asmt.status !== 'active' && <button className="rbm-btn pri" disabled={mut.busy} onClick={() => setSignFor(true)}>{I.lock}Approve assessment</button>}
            {/* An approved RACT is frozen, but a study's risks change. Amending
                opens a new draft version carrying a copy of the register, so the
                signed version stays exactly as signed. */}
            {locked && <button className="rbm-btn" disabled={mut.busy} onClick={() => setAmending(true)}>{I.penLine}Amend — new version</button>}
          </div>
        </div>
      ) : (
        <div className="rbm-note">{I.info}No formal risk-assessment record exists for this study yet — the critical-to-quality register below reflects the live risk items; create and approve a framework version to govern it.</div>
      )}
      <div className="rbm-ract-cols">
        <div className="rbm-card">
          <div className="rbm-card-h">Likelihood x impact{sel ? <button className="rbm-clear" onClick={() => setSel(null)}>{I.close}Clear filter L{sel.l} x I{sel.i}</button> : <span className="rbm-card-sub">click a cell to filter</span>}</div>
          <RiskMatrix items={items} sel={sel} onSel={setSel} />
          <div className="rbm-mx-legend"><span><i data-band="low" />Low &lt;8</span><span><i data-band="medium" />Medium 8-14</span><span><i data-band="high" />High 15+</span></div>
        </div>
        <div className="rbm-card grow">
          <div className="rbm-card-h">Critical-to-quality register -- {shown.length} of {items.length}
            <button className="rbm-add" disabled={locked || mut.busy}
              title={locked ? 'This assessment is approved — its CtQ content is fixed under the signature' : undefined}
              onClick={() => setEdit({ mode: 'new' })}>{I.zap}Add CtQ factor</button></div>
          <table className="rbm-tbl"><thead><tr><th>Category</th><th>CtQ factor</th><th>L x I</th><th>Inherent</th><th>Detect.</th><th>Mitigation</th><th>Residual</th><th>Status</th><th></th></tr></thead>
            <tbody>{shown.map(it => (
              <tr key={it.id} data-crit={it.critical || undefined}>
                <td className="cat">{CTQ_CATEGORY_LABEL[it.category] ?? it.category}{it.critical && <span className="rbm-crit" title="Critical CtQ (likelihood x impact 15+)">critical</span>}</td>
                <td className="fac">{it.factor}{it.owner && <span className="rbm-owner">owner: {it.owner}</span>}</td>
                <td className="mono">{it.l}x{it.i}</td>
                <td><RbmScore v={it.l * it.i} /></td>
                <td className="mono">{it.det ?? <span className="mut">—</span>}</td>
                <td className="mit">{it.mitigation}</td>
                <td>{it.residual != null ? <RbmScore v={it.residual} /> : <span className="mut">Not assessed</span>}</td>
                <td><RbmChip vocab="item" value={it.status} /></td>
                <td><button className="rbm-rowedit" disabled={locked || mut.busy}
                  title={locked ? 'Approved assessment — CtQ content is fixed under the signature' : 'Edit'}
                  onClick={() => setEdit({ mode: 'edit', item: it })}>{I.penLine}</button></td>
              </tr>
            ))}
            {items.length === 0 && <tr><td colSpan={9} className="rbm-col-empty">No critical-to-quality factors for this study yet.</td></tr>}
            </tbody></table>
        </div>
      </div>
      <div className="rbm-note">{I.info}The governing risk score is <b>likelihood x impact</b> (rbm-engine scoreRisk), banded low &lt;8 / medium 8-14 / high 15+. Detectability is recorded against each factor for review but is <b>not</b> multiplied into the score — one scoring method, applied consistently. Residual score is derived the same way from the post-mitigation likelihood and impact.</div>
      {locked && (
        <div className="rbm-note">{I.lock}This assessment is <b>approved</b>, so its critical-to-quality content is fixed: the e-signature above attests to these factors as they stand. To revise it, use <b>Amend</b> — that opens the next version as a draft carrying a copy of this register, leaving v{asmt?.version} and its signature intact as the historical record. The amendment governs nothing until it is approved in its own right.</div>
      )}
      {edit && <RbmFormModal title={edit.mode === 'edit' ? 'Edit CtQ factor' : 'Add CtQ factor'}
        intro="Score likelihood and impact (1-5 each); the engine derives the inherent score and flags 15+ as critical. Record the mitigation, the residual likelihood/impact after it, and the risk owner."
        fields={fields}
        initial={edit.item ? {
          category: edit.item.category, factor: edit.item.factor, riskDescription: '',
          l: String(edit.item.l), i: String(edit.item.i), det: edit.item.det != null ? String(edit.item.det) : '',
          mitigation: edit.item.mitigation ?? '', residualL: '', residualI: '', owner: '', status: edit.item.status,
        } : null}
        busy={mut.busy} error={mut.error}
        submitLabel={edit.mode === 'edit' ? 'Save changes' : 'Add factor'} onCancel={() => { setEdit(null); mut.clearError(); }} onSubmit={saveItem} />}
      {amending && asmt && <RbmFormModal title={`Amend risk assessment v${asmt.version}`}
        intro={`This creates version ${asmt.version + 1} as a draft, carrying a copy of the ${items.length} current CtQ factor(s). Version ${asmt.version} and its e-signature are left exactly as approved — they become the historical record. The new version governs nothing until it is approved in its own right.`}
        fields={[{ key: 'reason', label: 'Why is the assessment being amended?', type: 'textarea' }]}
        busy={mut.busy} error={mut.error}
        submitLabel="Open amendment" onCancel={() => { setAmending(false); mut.clearError(); }} onSubmit={amend} />}
      {signFor && asmt && <GovernedApprovalDialog what={`Risk assessment v${asmt.version}`}
        meaning="The RACT becomes the governing risk basis for monitoring-tier assignment and the risk review report."
        onCancel={() => setSignFor(false)}
        onSigned={async ({ reason, password, mfaToken }) => {
          const res = await apiRequest('POST', `/api/mdx/rbm-assessments/${asmt.id}/approve`, { reason, password, mfaToken });
          if (res.ok) { setSignFor(false); onReload?.(); return; }
          const body = await res.json().catch(() => null) as { error?: string } | null;
          // `body?.error` first rendered the refusal's enum token instead of
          // the sentence beside it. The domain fallback stays — it says what
          // did NOT happen, which a generic sentence would lose.
          return serverMessage(body) || `Approval failed (HTTP ${res.status}). The assessment was not activated.`;
        }} />}
    </div>
  );
}

/* 4 -- KRIs */
export function RbmKris({ board, onReload }: SubProps) {
  const kris = board.kris.map(kriView);
  const [tableFor, setTableFor] = useState<Record<number, boolean>>({});
  const [entryFor, setEntryFor] = useState<number | null>(null);
  const [cfg, setCfg] = useState<{ mode: string; kri?: KriView } | null>(null);
  const mut = useRbmMutation(onReload);

  /** Append a reading. The server appends to rbm_kri_values, rolls the value
   *  onto the KRI and recomputes its status via kriStatus() — the UI never
   *  bands the value itself. */
  const addReading = async (id: number, val: string) => {
    const done = await mut.run(async () => {
      await rbmWrite('POST', `/rbm-kris/${id}/values`, { value: Number(val) });
    });
    if (done) setEntryFor(null);
  };

  const saveCfg = async (f: Record<string, string>) => {
    const body = {
      name: f.name,
      metricDefinition: f.metric || null,
      dataSource: f.source,
      unit: f.unit || null,
      direction: f.dir,
      thresholdAmber: optNum(f.amber),
      thresholdRed: optNum(f.red),
    };
    const done = await mut.run(async () => {
      if (cfg?.mode === 'edit' && cfg.kri) {
        await rbmWrite('PATCH', `/rbm-kris/${cfg.kri.id}`, body);
      } else {
        await rbmWrite('POST', '/rbm-kris', { ...body, programId: board.programId, assessmentId: board.assessment?.id ?? null });
      }
    });
    if (done) setCfg(null);
  };

  const cfgFields: FormField[] = [
    { key: 'name', label: 'Indicator name', type: 'text' },
    { key: 'metric', label: 'Metric definition', type: 'textarea' },
    { key: 'source', label: 'Data source', type: 'select', options: KRI_SOURCES, labels: KRI_SOURCE_LABEL },
    { key: 'unit', label: 'Unit', type: 'text' },
    { key: 'dir', label: 'Direction', type: 'select', options: ['higher_worse', 'lower_worse'], labels: { higher_worse: 'Higher is worse', lower_worse: 'Lower is worse' } },
    { key: 'amber', label: 'Amber threshold', type: 'number', optional: true },
    { key: 'red', label: 'Red threshold', type: 'number', optional: true },
  ];

  return (
    <div>
      {mut.error && (
        <ErrorState
          variant="inline"
          title="The change was not saved"
          message={mut.error}
          onDismiss={mut.clearError}
        />
      )}
      <div className="rbm-bar">
        <span className="rbm-bar-info">{kris.length} indicators — seed from the TransCelerate library or define study-specific KRIs</span>
        <button className="rbm-btn pri" disabled={mut.busy} onClick={() => setCfg({ mode: 'new' })}>{I.zap}New KRI</button>
      </div>
      <div className="rbm-kri-grid">{kris.map(k => (
        <div key={k.id} className="rbm-kri" data-st={k.status}>
          <div className="rbm-kri-h"><b>{k.name}</b><RbmChip vocab="kri" value={k.status} /></div>
          <div className="rbm-kri-m">{k.metric} -- {KRI_SOURCE_LABEL[k.source] ?? k.source} -- {k.dir === 'higher_worse' ? 'higher is worse' : 'lower is worse'}</div>
          <div className="rbm-kri-body">
            <div className="rbm-kri-v" data-st={k.status}>{k.current ?? '—'}<em>{k.unit}</em></div>
            {tableFor[k.id] ? <TrendTable kri={k} /> : <Sparkline values={k.spark} amber={k.amber} red={k.red} />}
          </div>
          <div className="rbm-kri-thr">amber {k.amber ?? '—'}{k.unit} -- red {k.red ?? '—'}{k.unit} -- {k.at ? `evaluated ${k.at}` : 'never evaluated'}</div>
          <div className="rbm-kri-acts">
            <button className="rbm-linkbtn" disabled={mut.busy} onClick={() => setEntryFor(k.id)}>{I.zap}Add reading</button>
            <button className="rbm-linkbtn" disabled={mut.busy} onClick={() => setCfg({ mode: 'edit', kri: k })}>{I.penLine}Configure</button>
            <button className="rbm-linkbtn" aria-pressed={!!tableFor[k.id]} onClick={() => setTableFor(t => ({ ...t, [k.id]: !t[k.id] }))}>{I.table}{tableFor[k.id] ? 'Trend' : 'Table'}</button>
          </div>
        </div>
      ))}
        {kris.length === 0 && <div className="rbm-inbox-empty">No key risk indicators for this study yet.</div>}
      </div>
      <div className="rbm-note">{I.info}KRIs are seeded from the TransCelerate library or defined per study, with fixed amber/red limits. Appending a reading recomputes status server-side via kriStatus() -- the UI never bands a value itself. An indicator with no reading, or with no threshold to read against, is <b>not evaluated</b>, never green. Every trend has a data-table equivalent (WCAG 2.2 AA). Thresholds are study-level and fixed: statistically-derived limits and per-site/country drilldown are not implemented.</div>
      {entryFor != null && (() => { const k = kris.find(x => x.id === entryFor)!; return (
        <RbmFormModal title={`Add reading -- ${k.name}`}
          intro={`Current ${k.current ?? '—'}${k.unit}. Amber ${k.amber ?? '—'}${k.unit}, red ${k.red ?? '—'}${k.unit} (${k.dir === 'higher_worse' ? 'higher is worse' : 'lower is worse'}). The server appends the reading and recomputes status.`}
          fields={[{ key: 'value', label: `New reading (${k.unit})`, type: 'number' }]} submitLabel="Append reading"
          busy={mut.busy} error={mut.error}
          onCancel={() => { setEntryFor(null); mut.clearError(); }} onSubmit={v => addReading(entryFor, v.value)} />
      ); })()}
      {cfg && <RbmFormModal title={cfg.mode === 'edit' ? 'Configure KRI' : 'New key risk indicator'}
        intro="Define what the indicator measures, its source and direction, and the amber/red limits. Status is computed from these server-side — never entered directly. Leave a threshold blank and the indicator stays 'not evaluated' against it."
        fields={cfgFields}
        initial={cfg.kri ? {
          name: cfg.kri.name, metric: cfg.kri.metric ?? '', source: cfg.kri.source, unit: cfg.kri.unit ?? '',
          dir: cfg.kri.dir, amber: cfg.kri.amber != null ? String(cfg.kri.amber) : '', red: cfg.kri.red != null ? String(cfg.kri.red) : '',
        } : { dir: 'higher_worse', source: 'edc', unit: '%' }}
        busy={mut.busy} error={mut.error}
        submitLabel={cfg.mode === 'edit' ? 'Save configuration' : 'Create KRI'} onCancel={() => { setCfg(null); mut.clearError(); }} onSubmit={saveCfg} />}
    </div>
  );
}

/* 5 -- QTLs */
export function RbmQtls({ board, onReload }: SubProps) {
  const qtls = board.qtls.map(qtlView);
  const [cfg, setCfg] = useState<{ mode: string; qtl?: QtlView } | null>(null);
  const [breach, setBreach] = useState<QtlView | null>(null);
  const mut = useRbmMutation(onReload);

  const saveCfg = async (f: Record<string, string>) => {
    const body = {
      parameter: f.parameter,
      rationale: f.rationale || null,
      secondaryLimit: optNum(f.secondary),
      threshold: optNum(f.threshold),
      currentValue: optNum(f.current),
    };
    const done = await mut.run(async () => {
      if (cfg?.mode === 'edit' && cfg.qtl) {
        await rbmWrite('PATCH', `/rbm-qtls/${cfg.qtl.id}`, body);
      } else {
        await rbmWrite('POST', '/rbm-qtls', { ...body, programId: board.programId });
      }
    });
    if (done) setCfg(null);
  };

  /**
   * Record the breach response. rbm_qtls carries one narrative column
   * (breach_action_taken), so the three parts are written into it under
   * explicit headings rather than being collected into fields the store would
   * drop. A structured breach record — participants, estimand impact,
   * effectiveness check, closure sign-off — is not modelled yet, and the note
   * below says so instead of implying otherwise.
   */
  const saveBreach = async (f: Record<string, string>) => {
    const text = [
      `Root cause: ${f.justification}`,
      `Evidence: ${f.evidence}`,
      `CAPA: ${f.capa}`,
    ].join('\n');
    const done = await mut.run(async () => {
      await rbmWrite('PATCH', `/rbm-qtls/${breach!.id}`, { breachActionTaken: text });
    });
    if (done) setBreach(null);
  };

  const cfgFields: FormField[] = [
    { key: 'parameter', label: 'Parameter', type: 'text' },
    { key: 'rationale', label: 'Rationale (required for a QTL)', type: 'textarea' },
    { key: 'secondary', label: 'Secondary (early-warning) limit', type: 'number', optional: true },
    { key: 'threshold', label: 'Primary tolerance limit', type: 'number', optional: true },
    { key: 'current', label: 'Current value', type: 'number', optional: true, hint: 'Leave blank until the parameter is measured — the QTL then reads "not evaluated" rather than "within".' },
  ];

  return (
    <div>
      {mut.error && (
        <ErrorState
          variant="inline"
          title="The change was not saved"
          message={mut.error}
          onDismiss={mut.clearError}
        />
      )}
      <div className="rbm-bar">
        <span className="rbm-bar-info">{qtls.length} tolerance limits — study-level — secondary limit is the RBQM early warning</span>
        <button className="rbm-btn pri" disabled={mut.busy} onClick={() => setCfg({ mode: 'new' })}>{I.zap}New QTL</button>
      </div>
      <div className="rbm-card">
        <table className="rbm-tbl qtl"><thead><tr><th>Parameter</th><th>Rationale</th><th style={{ width: 260 }}>Current vs limits</th><th>Status</th><th></th></tr></thead>
          <tbody>{qtls.map(q => (
            <tr key={q.id}>
              <td className="fac"><b>{q.parameter}</b></td>
              <td className="mit">{q.rationale}{q.breachAction
                ? <span className="rbm-control">{I.check}Breach response recorded</span> : null}</td>
              <td>{q.threshold != null && q.current != null
                ? <ThresholdGauge current={q.current} secondary={q.secondary ?? q.threshold} threshold={q.threshold} unit="" />
                : <span className="mut">Not yet measured</span>}</td>
              <td><RbmChip vocab="qtl" value={q.status} /></td>
              <td><div className="rbm-qtl-acts">
                <button className="rbm-rowedit" title="Configure" disabled={mut.busy} onClick={() => setCfg({ mode: 'edit', qtl: q })}>{I.penLine}</button>
                {q.status === 'breached' && !q.breachAction && <button className="rbm-linkbtn" disabled={mut.busy} onClick={() => setBreach(q)}>Document breach</button>}
              </div></td>
            </tr>
          ))}
          {qtls.length === 0 && <tr><td colSpan={5} className="rbm-col-empty">No quality tolerance limits for this study yet.</td></tr>}
          </tbody></table>
      </div>
      <div className="rbm-note">{I.info}The secondary limit (50-75% of threshold) is the RBQM early-warning band: crossing it triggers review before the tolerance itself is at stake. A parameter with no current value reads <b>not evaluated</b> -- it has not been shown to be within tolerance. Limits are upper-bound only (higher = worse); lower-bound and two-sided QTLs are not supported yet. The breach response is stored as a single narrative on the QTL: a structured breach record (review participants, estimand impact, effectiveness check, closure sign-off) is not modelled.</div>
      {cfg && <RbmFormModal title={cfg.mode === 'edit' ? 'Configure QTL' : 'New quality tolerance limit'}
        intro="A QTL governs a study-level parameter. Rationale is mandatory. Status is computed server-side from the current value against the secondary and primary limits."
        fields={cfgFields}
        initial={cfg.qtl ? {
          parameter: cfg.qtl.parameter, rationale: cfg.qtl.rationale ?? '',
          secondary: cfg.qtl.secondary != null ? String(cfg.qtl.secondary) : '',
          threshold: cfg.qtl.threshold != null ? String(cfg.qtl.threshold) : '',
          current: cfg.qtl.current != null ? String(cfg.qtl.current) : '',
        } : null}
        busy={mut.busy} error={mut.error}
        submitLabel={cfg.mode === 'edit' ? 'Save limit' : 'Create QTL'} onCancel={() => { setCfg(null); mut.clearError(); }} onSubmit={saveCfg} />}
      {breach && <RbmFormModal title={`Document breach -- ${breach.parameter}`}
        intro={`${breach.current ?? '—'} exceeds the ${breach.threshold ?? '—'} tolerance. Record the root-cause justification, the supporting evidence and the CAPA. All three are stored together on the QTL as the breach response.`}
        fields={[{ key: 'justification', label: 'Root-cause justification', type: 'textarea' }, { key: 'evidence', label: 'Supporting evidence (documents, datasets)', type: 'textarea' }, { key: 'capa', label: 'CAPA / corrective action', type: 'textarea' }]}
        busy={mut.busy} error={mut.error}
        submitLabel="Record breach response" onCancel={() => { setBreach(null); mut.clearError(); }} onSubmit={saveBreach} />}
    </div>
  );
}
