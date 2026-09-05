/**
 * Biopharma specialty surfaces -- kit app/biopharma-specialty.jsx ported.
 *
 * Contains 4 surfaces:
 *   - Pediatric   (registry id `pediatric`)
 *   - Orphan      (registry id `orphan`)
 *   - Lifecycle   (registry id `lifecycle-mgmt`)
 *   - Pharmacovigilance (registry id `pharmacovigilance`)
 *
 * Fixture-free (GA real-data standard): every list on these surfaces reads its
 * real, org-scoped store (the /api/biopharma/* read routes, /api/lifecycle/
 * renewals, /api/cmc-changes, /api/pharmacovigilance/board) through
 * useLiveRows / useLiveData and renders REAL rows, an honest EMPTY state, or an
 * honest ERROR state — never a fabricated stand-in. The kit's `live ?? fixture`
 * seeds (invented BX-* programs, sNDA numbers, orphan designations, voucher
 * sales, safety signals) are deleted; v2 has no sample-mode guard to move them
 * behind. The intake drawers still prepend a saved record locally for immediate
 * feedback, and the toast says the write is local-only — these stores expose no
 * write route yet, so claiming persistence would be a lie.
 */
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { I } from '../icons';
import { useLiveData, useLiveRows, EmptyState } from '../dataConnect';
import { AnswerLead, UnresolvedLead } from '../AnswerLead';
import { assessmentStateFor, hasAnswer } from '../assessmentState';
import type { SurfaceViewProps } from '../surfaceViews';
import { usePublishSurfaceContext } from '../surfaceContext';
import { C2CForm } from '../C2CForm';
import type { C2CFormConfig } from '../C2CForm';
import '../styles/project-home-v2.css';
import { C2CToast, useToast } from '../toast';

/* ── Inline shared kit helpers (Nonclinical.tsx pattern) ── */

interface BpComposerProps {
  eyebrow: string;
  title: string;
  state: React.ReactNode;
  starters: string[];
  primary?: React.ReactNode;
  onAsk: (text: string) => void;
  lead?: React.ReactNode;
  children?: React.ReactNode;
}

function BpComposer({ eyebrow, title, state, starters, primary, onAsk, lead, children }: BpComposerProps) {
  return (
    <div className="sp">
      <div className="sp-head">
        <div>
          <div className="sp-eyebrow">{eyebrow}</div>
          <h1 className="sp-title">{title}</h1>
          <p className="sp-state">{state}</p>
        </div>
        {primary}
      </div>
      {lead}
      <div className="sp-starters">
        {starters.map((s, i) => (
          <button key={i} className="sp-starter" onClick={() => onAsk(s)}>
            <span className="sk">{I.sparkles}</span>
            <span>{s}</span>
          </button>
        ))}
      </div>
      {children}
    </div>
  );
}

interface SpCardProps {
  title: string;
  meta?: React.ReactNode;
  action?: React.ReactNode;
  children?: React.ReactNode;
  foot?: React.ReactNode;
}

function SpCard({ title, meta, action, children, foot }: SpCardProps) {
  return (
    <div className="pj-card">
      <div className="pj-card-h">
        <span className="t">{title}</span>
        <span className="s" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {meta}
          {action}
        </span>
      </div>
      <div className="pj-card-b">
        {children}
        {foot}
      </div>
    </div>
  );
}

interface AddBtnProps {
  onClick: () => void;
  label: string;
}

function AddBtn({ onClick, label }: AddBtnProps) {
  return (
    <button className="sp-addbtn" onClick={onClick}>
      {I.plus} {label}
    </button>
  );
}

interface SpAskProps {
  onAsk: (text: string) => void;
  cmd: string;
  label: string;
}

function SpAsk({ onAsk, cmd, label }: SpAskProps) {
  return (
    <div className="sp-foot">
      <button className="sp-ask" onClick={() => onAsk(cmd)}>
        {I.sparkles} {label}
      </button>
    </div>
  );
}

function pill(status: string) {
  const map: Record<string, string> = {
    active: 'ai', review: 'warn', drafted: 'idle', draft: 'idle',
    designated: 'ok', approved: 'ok', requested: 'warn', evaluating: 'warn',
    planned: 'idle', implemented: 'ok', monitoring: 'ai', watch: 'idle',
    drafting: 'warn', queued: 'idle', filed: 'ai', eligible: 'warn',
    awarded: 'ok', agreed: 'ok', submitted: 'ai', 'in draft': 'idle',
    received: 'ok',
  };
  return <span className={'rd-chip tone-' + (map[status] || 'idle')}>{status}</span>;
}

function rowcls(r: { _new?: boolean }): string {
  return 'sp-row' + (r._new ? ' de-row-new' : '');
}

/**
 * Locally mutable list seeded ONCE from a fixture-free live read when it
 * settles (the NdaCockpit seeding pattern): a record saved in the drawer
 * appears immediately without re-fetching, and the live rows are never
 * silently re-clobbered.
 */
function useSeededRows<T extends { _new?: boolean }>(live: {
  rows: T[];
  loading: boolean;
}): readonly [T[], (r: T) => void] {
  const [rows, setRows] = useState<T[]>([]);
  const seeded = useRef(false);
  useEffect(() => {
    if (!live.loading && !seeded.current) {
      seeded.current = true;
      setRows(live.rows.map((r) => ({ ...r })));
    }
  }, [live.loading, live.rows]);
  const add = (r: T) => {
    const row: T = { ...r, _new: true };
    setRows((rs) => [row, ...rs]);
    setTimeout(() => setRows((rs) => rs.map((x) => (x === row ? { ...x, _new: false } : x))), 1500);
  };
  return [rows, add] as const;
}

/**
 * The three honest non-row states a card list renders — loading note, error
 * panel, or genuine empty panel. (Rows themselves are rendered by the caller,
 * and locally-added rows still show when the read had failed.)
 */
function SpListState({
  loading,
  error,
  errorTitle,
  emptyTitle,
  emptyHint,
}: {
  loading: boolean;
  error?: string;
  errorTitle: string;
  emptyTitle: string;
  emptyHint: string;
}) {
  if (loading) {
    return (
      <div className="sp-row">
        <span className="sp-row-s">Loading…</span>
      </div>
    );
  }
  if (error) {
    return (
      <EmptyState
        tone="error"
        icon={I.alertTriangle}
        title={errorTitle}
        hint="The read failed — sign in and retry, or check that the service is reachable."
      />
    );
  }
  return <EmptyState icon={I.fileText} title={emptyTitle} hint={emptyHint} />;
}

/* ═══════════════════════════════════════════════════════════════════
   Pediatric -- PREA / iPSP / EMA PIP
   ═══════════════════════════════════════════════════════════════════ */

interface PedPlan {
  id?: string | number;
  product: string;
  kind: string;
  ageRange: string;
  deferrals: number;
  waivers: number;
  milestones: number;
  due: string;
  status: string;
  _new?: boolean;
}

interface PedPrea {
  product: string;
  ms: string;
  due: string;
}

/**
 * How a live read is doing, for the context published to AnA.
 *
 * These four surfaces each stack two or three independent reads, and any one of
 * them can fail on its own. Collapsing "the store did not answer" into "there
 * are no rows" is the exact substitution `assessmentState` exists to prevent on
 * screen — the same rule has to hold for what AnA is told, because she speaks
 * the result back to the user as fact. So each read publishes its own state and
 * an unreadable one publishes NULL rows plus the reason, never an empty list.
 */
function readContext<T>(
  read: { loading: boolean; error?: string | null },
  rows: T[],
  project: (r: T) => Record<string, unknown>,
  cap = 12,
): { state: 'loading' | 'unreadable' | 'ready'; count: number | null; rows: Record<string, unknown>[] | null } {
  if (read.loading) return { state: 'loading', count: null, rows: null };
  if (read.error) return { state: 'unreadable', count: null, rows: null };
  return { state: 'ready', count: rows.length, rows: rows.slice(0, cap).map(project) };
}

/** One sentence for a read that has not produced an answer yet. */
function readLine(label: string, c: { state: string; count: number | null }): string {
  if (c.state === 'loading') return `${label} are still loading`;
  if (c.state === 'unreadable') return `${label} could not be read`;
  return `${c.count} ${label}`;
}

export function Pediatric({ onAsk }: SurfaceViewProps) {
  const ask = onAsk;
  /* Real rows — org-scoped pediatric plans and PREA/PIP milestones. */
  const livePlans = useLiveRows<PedPlan>('/api/biopharma/pediatric');
  const [plans, addPlan] = useSeededRows<PedPlan>(livePlans);
  const livePrea = useLiveRows<PedPrea>('/api/biopharma/prea-milestones');
  const prea = livePrea.rows;
  const [form, setForm] = useState(false);
  const [toast, fireToast] = useToast();

  const FORM: C2CFormConfig = {
    eyebrow: 'Pediatric · new plan',
    title: 'Open a pediatric plan',
    governed: 'Pediatric plans are governed — saving writes an audit entry; AnA drafts the rationale for review.',
    submitLabel: 'Add plan',
    fields: [
      { key: 'product', label: 'Product', type: 'text', placeholder: 'Product code', required: true, half: true },
      { key: 'kind', label: 'Plan type', type: 'select', options: ['FDA iPSP', 'EMA PIP', 'FDA PREA waiver'], required: true, half: true },
      { key: 'ageRange', label: 'Age range', type: 'text', placeholder: 'e.g. 12--17', required: true },
      { key: 'deferrals', label: 'Deferrals', type: 'number', min: 0, default: '0', half: true },
      { key: 'waivers', label: 'Waivers', type: 'number', min: 0, default: '0', half: true },
      { key: 'milestones', label: 'Milestones', type: 'number', min: 0, default: '0', half: true },
      { key: 'due', label: 'Next milestone due', type: 'date', half: true },
      { key: 'status', label: 'Status', type: 'seg', options: ['draft', 'review', 'active'], default: 'draft' },
      { key: 'rationale', label: 'Extrapolation rationale', type: 'textarea', placeholder: 'Basis for age-range selection / extrapolation...' },
    ],
  };

  const onSubmit = (v: Record<string, string>) => {
    addPlan({
      product: v.product, kind: v.kind, ageRange: v.ageRange,
      deferrals: +v.deferrals || 0, waivers: +v.waivers || 0,
      milestones: +v.milestones || 0, due: v.due ? ('due ' + v.due) : '--',
      status: v.status,
    });
    setForm(false);
    fireToast('Pediatric plan added · ' + v.product + ' · shown locally, not persisted', 'error');
  };

  /* AnswerLead computation — from the REAL rows only. Field-level access is
     null-safe: a live row with an absent column must degrade, not crash. */
  const drafts = plans.filter((p) => String(p.status).includes('draft'));
  const nextMs = prea[0];
  const topDraft = drafts[0];
  const nextMsLabel = nextMs && typeof nextMs.ms === 'string' ? nextMs.ms.toLowerCase() : 'upcoming milestone';
  /* The milestone read's OWN state, not `prea.length`. An empty `prea` is in
     flight, failed, or genuinely empty, and only the third may say "nothing is
     recorded" — see assessmentStateFor. `assessmentRan: false` because nothing
     screens PREA milestones; they are recorded or they are not. */
  const plansState = assessmentStateFor(livePlans, {
    scopeExists: true,
    findingCount: plans.length,
    assessmentRan: false,
  });
  const preaState = assessmentStateFor(livePrea, {
    scopeExists: plans.length > 0,
    findingCount: prea.length,
    assessmentRan: false,
  });

  /* What AnA can see of this screen. Two independent reads, published
     independently — see `readContext`. */
  const anaContext = useMemo(() => {
    const p = readContext(livePlans, plans, (x) => ({
      id: x.id ?? null, product: x.product, planType: x.kind, ageRange: x.ageRange,
      deferrals: x.deferrals, waivers: x.waivers, milestones: x.milestones,
      due: x.due, status: x.status,
    }));
    const m = readContext(livePrea, prea, (x) => ({ product: x.product, milestone: x.ms, due: x.due }));
    return {
      summary:
        `Pediatric strategy (\u00a7505B PREA, EMA PIP): ${readLine('pediatric plan(s)', p)}; ` +
        `${readLine('PREA/PIP milestone(s)', m)}.` +
        (p.state === 'ready' && drafts.length ? ` ${drafts.length} plan(s) are still in draft.` : ''),
      facts: {
        plans: p.rows, planCount: p.count, plansReadState: p.state,
        draftPlans: p.state === 'ready' ? drafts.length : null,
        preaMilestones: m.rows, preaReadState: m.state,
      },
      availableActions: [
        'Open a pediatric plan (iPSP, PIP or PREA waiver) — note the add form is local, not persisted',
        'Read PREA / PIP milestones and their due dates',
      ],
    };
  }, [livePlans, plans, livePrea, prea, drafts.length]);
  usePublishSurfaceContext('pediatric', anaContext);

  return (
    <BpComposer
      eyebrow="Pediatric · §505B PREA · EMA PIP"
      title="Pediatric strategy"
      state={<>FDA iPSP and EMA PIP plans, deferrals, waivers and PREA milestones across the portfolio.</>}
      lead={
        /* The plan read's own state first. `plans.length === 0` was answering
           "nothing on file" while the request was still in flight and while it
           had FAILED — the most prominent sentence on the surface asserting a
           fact about the org's regulatory record that nobody had established. */
        !hasAnswer(plansState) ? (
          <UnresolvedLead state={plansState} eyebrow="Where do your pediatric obligations stand" subject="pediatric plans" />
        ) : plans.length === 0 ? (
          <AnswerLead
            tone="calm"
            eyebrow="Where do your pediatric obligations stand"
            headline={<>No pediatric plans are on file for this organization yet.</>}
            body={<>Open a pediatric plan to track FDA iPSP and EMA PIP obligations. Plans, deferrals, waivers and PREA milestones appear here once they're recorded — nothing is invented in the meantime.</>}
            reassure="Once a plan exists I'll watch its milestones and flag anything before it slips."
            action={{ label: 'Open a pediatric plan', onClick: () => setForm(true) }}
            secondary="Or ask AnA about PREA / PIP strategy below."
          />
        ) : (
          <AnswerLead
            tone="calm"
            eyebrow="Where do your pediatric obligations stand — and what's next"
            headline={drafts.length && topDraft
              ? <>{drafts.length} pediatric {drafts.length === 1 ? 'plan is' : 'plans are'} still in draft — the closest gate is <b>{topDraft.kind} for {topDraft.product}</b> ({topDraft.due}).</>
              : <>Your pediatric plans are filed — the next thing to watch is the {nextMsLabel}.</>}
            body={drafts.length && topDraft
              ? <>A pediatric plan usually gates the parent submission, so finishing the {topDraft.kind} rationale keeps your main program on track. The age-range extrapolation is the part reviewers scrutinize most — get that right and the plan moves.</>
              /* BP-W0-3: `prea` being empty means no PREA milestone has been
                 RECORDED, which is not the same as none being overdue. The old
                 copy read "No milestones are overdue -- you're in good standing",
                 which is a clearance claim derived from an empty list.
                 Then: `prea` is ALSO empty while the read is in flight and when
                 it has failed, and this branch spoke the recorded-nothing
                 sentence in all three. The state now comes from the read. */
              : <>{preaState === 'loading'
                  ? <>Reading the PREA and PIP milestones recorded against {plans.length === 1 ? 'this plan' : 'these plans'}…</>
                  : preaState === 'unreadable'
                    ? <>The PREA milestone record could not be read, so nothing is claimed about milestone standing here. The table below reports the failure.</>
                    : nextMs
                      ? <>The {nextMsLabel} for {nextMs.product} is due {nextMs.due}. Staying ahead of PREA milestones avoids deferral slippage.</>
                      : <>No PREA milestones have been recorded against {plans.length === 1 ? 'this plan' : 'these plans'} yet, so milestone standing is unknown rather than clear. Record the deferral and study-completion dates and they are tracked here.</>}</>}
            reassure={drafts.length
              ? "You don't have to draft the extrapolation rationale from scratch — I'll write the first pass with you."
              : nextMs
                ? "I'll watch each milestone and flag anything before it slips."
                : undefined}
            action={{
              label: drafts.length ? 'Draft the extrapolation rationale' : 'Check upcoming milestones',
              onClick: () => ask(drafts.length && topDraft
                ? ('Draft the age-range extrapolation rationale for the ' + topDraft.kind + ' for ' + topDraft.product)
                : ('Surface every PREA/PIP milestone due in the next 90 days')),
            }}
            secondary="Or work the plans and milestones below."
          />
        )
      }
      starters={[
        'Draft the PSP rationale for adolescent extrapolation',
        'Compare PIP modifications across the portfolio',
        'Surface every PIP milestone due in the next 90 days',
        'Draft a PREA waiver justification against the extrapolation framework',
      ]}
      primary={<button className="sp-primary" onClick={() => setForm(true)}>{I.plus} Open pediatric plan</button>}
      onAsk={ask}
    >
      <div className="sp-sec">
        <SpCard title="Pediatric investigation plans" meta="FDA · EMA" action={<AddBtn onClick={() => setForm(true)} label="Add plan" />}>
          <div className="sp-list">
            {plans.length > 0 ? plans.map((p, i) => (
              <div key={i} className={rowcls(p)}>
                <span className="sp-tag">{p.product}</span>
                <span className="sp-row-b">
                  <span className="sp-row-t">{p.kind} · ages {p.ageRange}</span>
                  <span className="sp-row-s">{p.deferrals} deferral{p.deferrals === 1 ? '' : 's'} · {p.waivers} waiver{p.waivers === 1 ? '' : 's'} · {p.milestones} milestones · {p.due}</span>
                </span>
                {pill(p.status)}
              </div>
            )) : (
              <SpListState
                loading={livePlans.loading}
                error={livePlans.error}
                errorTitle="Couldn't load pediatric plans"
                emptyTitle="No pediatric plans yet"
                emptyHint="Add a plan to track an FDA iPSP or EMA PIP — each appears here org-scoped with its deferrals, waivers and milestones."
              />
            )}
          </div>
        </SpCard>
      </div>
      <div className="sp-sec">
        <SpCard title="Upcoming PREA milestones" foot={prea.length > 0 ? <SpAsk onAsk={ask} cmd="Draft a PREA waiver justification against the pediatric extrapolation framework." label="Draft PREA waiver justification" /> : undefined}>
          <div className="sp-list">
            {prea.length > 0 ? prea.map((u, i) => (
              <button key={i} className="sp-row" style={{ width: '100%', textAlign: 'left' }} onClick={() => ask(`Status of the ${u.product} milestone "${u.ms}" due ${u.due}`)}>
                <span className="sp-tag">{u.product}</span>
                <span className="sp-row-b">
                  <span className="sp-row-t">{u.ms}</span>
                  <span className="sp-row-s">Due {u.due}</span>
                </span>
                <span className="sp-go">{I.right}</span>
              </button>
            )) : (
              <SpListState
                loading={livePrea.loading}
                error={livePrea.error}
                errorTitle="Couldn't load PREA milestones"
                emptyTitle="No PREA milestones recorded"
                emptyHint="Milestones appear here once they're recorded against a pediatric plan."
              />
            )}
          </div>
        </SpCard>
      </div>
      {form && <C2CForm config={FORM} onCancel={() => setForm(false)} onSubmit={onSubmit} />}
      <C2CToast msg={toast} />
    </BpComposer>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Orphan & rare
   ═══════════════════════════════════════════════════════════════════ */

interface OrphDes {
  product: string;
  agency: string;
  indication: string;
  date: string;
  prevalence: string;
  benefit: string;
  status: string;
  _new?: boolean;
}

interface OrphRpd {
  product: string;
  kind: string;
  value: string;
  notes: string;
  status: string;
}

interface OrphAdv {
  product: string;
  org: string;
  engagement: string;
}

export function Orphan({ onAsk }: SurfaceViewProps) {
  const ask = onAsk;
  /* Real rows — org-scoped designations, RPD vouchers/grants, advocacy. */
  const liveDes = useLiveRows<OrphDes>('/api/biopharma/orphan');
  const [des, addDes] = useSeededRows<OrphDes>(liveDes);
  const liveRpd = useLiveRows<OrphRpd>('/api/biopharma/orphan-rpd');
  const rpd = liveRpd.rows;
  const liveAdv = useLiveRows<OrphAdv>('/api/biopharma/orphan-advocacy');
  const adv = liveAdv.rows;
  const [form, setForm] = useState(false);
  const [toast, fireToast] = useToast();

  const FORM: C2CFormConfig = {
    eyebrow: 'Orphan · designation request',
    title: 'Open a designation application',
    governed: 'A designation request is a governed submission — prevalence evidence and rationale are captured for the application package.',
    submitLabel: 'Create request',
    fields: [
      { key: 'product', label: 'Product', type: 'text', placeholder: 'Product code', required: true, half: true },
      { key: 'agency', label: 'Agency', type: 'select', options: ['FDA', 'EMA', 'PMDA'], required: true, half: true },
      { key: 'indication', label: 'Orphan indication', type: 'text', placeholder: 'e.g. rare inherited retinal dystrophy', required: true },
      { key: 'prevalence', label: 'Prevalence', type: 'text', placeholder: 'e.g. <20k US', required: true, half: true },
      { key: 'benefit', label: 'Primary benefit sought', type: 'select', options: ['7-yr exclusivity + fee waiver', '10-yr market exclusivity', 'exclusivity + RPD voucher eligible', 'tax credits'], half: true },
      { key: 'rationale', label: 'Scientific rationale', type: 'textarea', placeholder: 'Medical plausibility / disease seriousness / unmet need...' },
    ],
  };

  const onSubmit = (v: Record<string, string>) => {
    addDes({
      product: v.product, agency: v.agency, indication: v.indication,
      date: 'pending', prevalence: v.prevalence,
      benefit: v.benefit || 'exclusivity', status: 'requested',
    });
    setForm(false);
    fireToast('Designation request created · ' + v.product + ' ' + v.agency + ' · shown locally, not persisted', 'error');
  };

  /* AnswerLead computation — from the REAL rows only. Field-level access is
     null-safe: a live row with an absent column must degrade, not crash. */
  const pending = des.filter((d) => d.status === 'requested' || d.status === 'planned' || String(d.date).includes('pending'));
  const designated = des.filter((d) => d.status === 'designated');
  const topPending = pending[0];
  const topPendingIndication = topPending ? String(topPending.indication ?? 'the recorded indication').toLowerCase() : '';
  /* A designation is GRANTED or it is not — nothing screens for one — so the
     positive evidence is a `designated` record, never an empty list. */
  const desState = assessmentStateFor(liveDes, {
    scopeExists: true,
    findingCount: des.length,
    assessmentRan: false,
  });

  /* What AnA can see of this screen. Three independent reads, published
     independently — see `readContext`. */
  const anaContext = useMemo(() => {
    const d = readContext(liveDes, des, (x) => ({
      product: x.product, agency: x.agency, indication: x.indication,
      requestedOrGranted: x.date, prevalence: x.prevalence, benefit: x.benefit, status: x.status,
    }));
    // `notes` and `engagement` are user-authored free-text — their presence
    // travels, the prose stays on screen, uniform with the rest of the subsystem.
    const r = readContext(liveRpd, rpd, (x) => ({ product: x.product, kind: x.kind, value: x.value, status: x.status, hasNotes: Boolean(x.notes) }));
    const v = readContext(liveAdv, adv, (x) => ({ product: x.product, organisation: x.org, hasEngagement: Boolean(x.engagement) }));
    return {
      summary:
        `Orphan and rare disease: ${readLine('designation record(s)', d)}; ` +
        `${readLine('RPD voucher / grant record(s)', r)}; ${readLine('advocacy engagement(s)', v)}.` +
        (d.state === 'ready'
          ? ` ${designated.length} designated, ${pending.length} still pending.`
          : ''),
      facts: {
        designations: d.rows, designationCount: d.count, designationsReadState: d.state,
        designated: d.state === 'ready' ? designated.length : null,
        pending: d.state === 'ready' ? pending.length : null,
        rpdVouchersAndGrants: r.rows, rpdReadState: r.state,
        advocacy: v.rows, advocacyReadState: v.state,
      },
      availableActions: [
        'Open an orphan designation application — note the add form is local, not persisted',
        'Read RPD voucher / grant records and advocacy engagements',
      ],
    };
  }, [liveDes, des, liveRpd, rpd, liveAdv, adv, designated.length, pending.length]);
  usePublishSurfaceContext('orphan', anaContext);

  return (
    <BpComposer
      eyebrow="Orphan drug · rare disease"
      title="Orphan and rare programs"
      state={<>Designations across FDA / EMA / PMDA, RPD vouchers and grants, and patient-advocacy engagements.</>}
      lead={
        !hasAnswer(desState) ? (
          <UnresolvedLead state={desState} eyebrow="Where do your rare-disease designations stand" subject="orphan and rare-disease designations" />
        ) : des.length === 0 ? (
          <AnswerLead
            tone="calm"
            eyebrow="Where do your rare-disease designations stand"
            headline={<>No orphan or rare-disease designations are on file for this organization yet.</>}
            body={<>Open a designation application to track orphan status across FDA, EMA and PMDA. Designations, RPD vouchers and advocacy engagements appear here once recorded — nothing is invented in the meantime.</>}
            reassure="Designation narratives follow a pattern reviewers recognize — when you start one I'll draft the prevalence and rationale sections with you."
            action={{ label: 'Open a designation application', onClick: () => setForm(true) }}
            secondary="Or ask AnA about orphan strategy below."
          />
        ) : (
          <AnswerLead
            tone="calm"
            eyebrow="Where do your rare-disease designations stand"
            /* BP-W0-3: `des.length > 0` only says a designation RECORD exists.
               With every record withdrawn, denied or still requested,
               `designated.length` is 0 and the old copy read "You hold 0 orphan
               designations -- the exclusivity and incentives are secured", which
               claims an entitlement the org does not have. "ready to file" was
               likewise asserted over a merely planned application that nothing
               had assessed. */
            headline={topPending
              /* "awaiting an agency decision" is a claim that a submission
                 reached an agency, and it was being inferred from the literal
                 substring 'pending' in a DISPLAY date. onSubmit above hardcodes
                 exactly `date: 'pending'` for a row it then reports as "shown
                 locally, not persisted" — so opening a designation request made
                 the headline announce it was with the agency awaiting a
                 decision, while the toast three lines away said it had not even
                 been saved. Only an explicitly recorded 'submitted' status may
                 carry that sentence; everything else reads as not yet filed. */
              ? <>Your closest opportunity is <b>{topPending.product}</b> -- {topPendingIndication} -- {topPending.status === 'submitted' ? 'awaiting an agency decision' : 'not yet submitted'}.</>
              : designated.length > 0
                ? <>You hold <b>{designated.length} orphan {designated.length === 1 ? 'designation' : 'designations'}</b> -- the exclusivity and incentives are secured.</>
                : <>None of the <b>{des.length}</b> recorded {des.length === 1 ? 'designation has' : 'designations have'} been granted.</>}
            body={topPending
              ? <>Orphan status brings 7-year exclusivity, fee waivers, and RPD-voucher eligibility — real value worth getting right. The prevalence evidence and scientific rationale are what carry the application; that's where I can help most.</>
              : designated.length > 0
                ? <>Across the portfolio these designations translate to years of exclusivity and priority review. The next move is keeping the patient-advocacy engagements and any RPD-voucher opportunities warm.</>
                : <>No exclusivity or incentive entitlement follows from these records in their current state. Their dispositions are below.</>}
            reassure={topPending
              ? "Designation narratives follow a pattern reviewers recognize — I'll draft the prevalence and rationale sections with you."
              : designated.length > 0
                ? "Your designations are in hand. I'll help you make the most of the incentives that come with them."
                : undefined}
            action={{
              label: topPending ? 'Draft the designation narrative' : 'Review the incentive value',
              onClick: () => ask(topPending
                ? ('Draft the ' + topPending.agency + ' orphan designation application for ' + topPending.product + ' -- prevalence + scientific rationale for ' + topPending.indication)
                : 'Compare exclusivity and incentive benefits across our orphan designations'),
            }}
            secondary="Or work designations, vouchers and advocacy below."
          />
        )
      }
      starters={[
        'Find orphan precedents for our lead rare-disease indication',
        'Draft the FDA orphan application narrative',
        'Pull every RPD voucher transaction 2022--2025',
        'Compare exclusivity benefits across FDA, EMA and PMDA designations',
      ]}
      primary={<button className="sp-primary" onClick={() => setForm(true)}>{I.plus} Open designation application</button>}
      onAsk={ask}
    >
      <div className="sp-sec">
        <SpCard title="Designations" meta="FDA · EMA · PMDA" action={<AddBtn onClick={() => setForm(true)} label="New request" />}>
          <div className="sp-list">
            {des.length > 0 ? des.map((d, i) => (
              <div key={i} className={rowcls(d)}>
                <span className="sp-tag">{d.product}</span><span className="sp-tag2">{d.agency}</span>
                <span className="sp-row-b">
                  <span className="sp-row-t">{d.indication}</span>
                  <span className="sp-row-s">{d.date} · {d.prevalence} · {d.benefit}</span>
                </span>
                {pill(d.status)}
              </div>
            )) : (
              <SpListState
                loading={liveDes.loading}
                error={liveDes.error}
                errorTitle="Couldn't load designations"
                emptyTitle="No designations yet"
                emptyHint="Open a designation application to track orphan status — each appears here org-scoped with its agency, prevalence basis and benefit."
              />
            )}
          </div>
        </SpCard>
      </div>
      <div className="sp-2col">
        <SpCard title="RPD vouchers & grants">
          <div className="sp-list">
            {rpd.length > 0 ? rpd.map((g, i) => (
              <div key={i} className="sp-row">
                <span className="sp-tag">{g.product}</span>
                <span className="sp-row-b">
                  <span className="sp-row-t">{g.kind} · {g.value}</span>
                  <span className="sp-row-s">{g.notes}</span>
                </span>
                {pill(g.status)}
              </div>
            )) : (
              <SpListState
                loading={liveRpd.loading}
                error={liveRpd.error}
                errorTitle="Couldn't load vouchers and grants"
                emptyTitle="No vouchers or grants recorded"
                emptyHint="RPD vouchers and rare-disease grants appear here once recorded for this organization."
              />
            )}
          </div>
        </SpCard>
        <SpCard title="Patient advocacy">
          <div className="sp-list">
            {adv.length > 0 ? adv.map((a, i) => (
              <button key={i} className="sp-row" style={{ width: '100%', textAlign: 'left' }} onClick={() => ask(`Summarize our engagement history with ${a.org}`)}>
                <span className="sp-tag">{a.product}</span>
                <span className="sp-row-b">
                  <span className="sp-row-t">{a.org}</span>
                  <span className="sp-row-s">{a.engagement}</span>
                </span>
                <span className="sp-go">{I.right}</span>
              </button>
            )) : (
              <SpListState
                loading={liveAdv.loading}
                error={liveAdv.error}
                errorTitle="Couldn't load advocacy engagements"
                emptyTitle="No advocacy engagements recorded"
                emptyHint="Patient-advocacy engagements appear here once recorded for this organization."
              />
            )}
          </div>
        </SpCard>
      </div>
      {form && <C2CForm config={FORM} onCancel={() => setForm(false)} onSubmit={onSubmit} />}
      <C2CToast msg={toast} />
    </BpComposer>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Lifecycle management
   ═══════════════════════════════════════════════════════════════════ */

interface LcmSupp {
  agency: string;
  product: string;
  subject: string;
  id: string | number;
  filed: string | null;
  due: string | null;
  status: string;
  _new?: boolean;
}

interface LcmCmc {
  risk: string;
  title: string;
  area: string;
  programs: string;
  status: string;
  /** Present when live: the classifier's computed FDA reporting category. */
  fdaCategory?: string;
  emaCategory?: string;
}

/** Short display label for the classifier's FDA reporting category. */
const FDA_CAT_LABEL: Record<string, string> = {
  pas: 'PAS', cbe_30: 'CBE-30', cbe_0: 'CBE-0', annual_report: 'Annual Report', no_filing: 'No filing',
};

interface LcmRen {
  authority: string;
  product: string;
  next: string;
  interval: string;
  due: string;
}

export function Lifecycle({ onAsk }: SurfaceViewProps) {
  const ask = onAsk;
  /* Real rows — org-scoped supplements/variations. */
  const liveSupp = useLiveRows<LcmSupp>('/api/biopharma/supplements');
  const [supp, addSupp] = useSeededRows<LcmSupp>(liveSupp);
  /* Real rows — the governed recurring-obligation store projected through the
     tested lifecycle composer (region→authority, recurrence→interval). */
  const liveRen = useLiveRows<LcmRen>('/api/lifecycle/renewals');
  const ren = liveRen.rows;
  /* Fixture-free (real-data standard): the "CMC change control" card reads the org's
     REAL proposed-change store (cmc_change_controls, written via POST /api/cmc-changes)
     projected on read through the deterministic SUPAC/variations classifier (FDA
     reporting category → risk band). Real rows, an honest empty, or an honest error —
     never a fixture. `rows` is a fresh [] while loading/on error, so the derivations
     below are null-safe. */
  const liveCmc = useLiveRows<LcmCmc>('/api/cmc-changes');
  const cmc = liveCmc.rows;
  const [form, setForm] = useState(false);
  const [toast, fireToast] = useToast();

  const FORM: C2CFormConfig = {
    eyebrow: 'Lifecycle · new supplement',
    title: 'New supplement / variation',
    governed: 'Supplements are governed submissions — classification and pathway are recorded; dispatch requires e-signature.',
    submitLabel: 'Create supplement',
    fields: [
      { key: 'agency', label: 'Agency & type', type: 'select', options: ['FDA sBLA', 'FDA sNDA', 'FDA CBE-30', 'FDA CBE-0', 'EMA Type IA', 'EMA Type IB', 'EMA Type II', 'PMDA partial change'], required: true },
      { key: 'product', label: 'Product', type: 'text', placeholder: 'Product code', required: true, half: true },
      { key: 'id', label: 'Sequence / ID', type: 'text', placeholder: 'e.g. sBLA-005', half: true },
      { key: 'subject', label: 'Subject of change', type: 'text', placeholder: 'e.g. New indication — 2L expansion', required: true },
      { key: 'due', label: 'Target / due', type: 'text', placeholder: 'e.g. PDUFA Feb 2027', half: true },
      { key: 'status', label: 'Status', type: 'seg', options: ['drafted', 'review', 'approved'], default: 'drafted', half: true },
      { key: 'justification', label: 'Change justification', type: 'textarea', placeholder: 'Basis for the change and supporting data...' },
    ],
  };

  const onSubmit = (v: Record<string, string>) => {
    addSupp({
      agency: v.agency, product: v.product, subject: v.subject,
      id: v.id || '--', filed: '--', due: v.due || 'drafting', status: v.status,
    });
    setForm(false);
    fireToast('Supplement created · ' + v.agency + ' · ' + v.product + ' · shown locally, not persisted', 'error');
  };

  /* AnswerLead computation — from the REAL rows only. Field-level access is
     null-safe: a live row with an absent column must degrade, not crash. */
  const inReview = supp.filter((s) => s.status === 'review');
  const highChg = cmc.filter((c) => c.risk === 'high');
  const nextRen = [...ren].sort((a, b) => String(a.due).localeCompare(String(b.due)))[0];
  const topChg = highChg[0];
  const topChgTitle = topChg ? String(topChg.title ?? 'the proposed change').toLowerCase() : '';
  const nothingOnFile = supp.length === 0 && cmc.length === 0 && ren.length === 0;
  /* Three reads feed this one narrative, so it may only speak once ALL THREE
     have answered — a supplement list that arrived while the renewal read is
     still in flight is not grounds for "your post-approval portfolio is
     steady". Any one of them failing makes the whole lead unreadable rather
     than partially true. */
  const lcmRead = {
    loading: liveSupp.loading || liveCmc.loading || liveRen.loading,
    error: liveSupp.error ?? liveCmc.error ?? liveRen.error,
  };
  const lcmState = assessmentStateFor(lcmRead, {
    scopeExists: true,
    findingCount: supp.length + cmc.length + ren.length,
    assessmentRan: false,
  });

  /* What AnA can see of this screen. Three independent reads, published
     independently — see `readContext`. Unlike the narrative above, which may
     only speak once all three have answered, the context reports each read's
     own state, so a question about supplements is still answerable while the
     renewals read is in flight. */
  const anaContext = useMemo(() => {
    const sp = readContext(liveSupp, supp, (x) => ({
      id: x.id, agency: x.agency, product: x.product, subject: x.subject,
      filed: x.filed, due: x.due, status: x.status,
    }));
    const ch = readContext(liveCmc, cmc, (x) => ({
      title: x.title, area: x.area, programs: x.programs, riskBand: x.risk,
      fdaReportingCategory: x.fdaCategory ?? null, emaCategory: x.emaCategory ?? null, status: x.status,
    }));
    const rn = readContext(liveRen, ren, (x) => ({
      authority: x.authority, product: x.product, next: x.next, interval: x.interval, due: x.due,
    }));
    return {
      summary:
        `Lifecycle management (post-approval): ${readLine('supplement(s) / variation(s)', sp)}; ` +
        `${readLine('proposed CMC change(s)', ch)}; ${readLine('recurring renewal obligation(s)', rn)}.` +
        (sp.state === 'ready' && inReview.length ? ` ${inReview.length} supplement(s) are in review.` : '') +
        (ch.state === 'ready' && highChg.length ? ` ${highChg.length} CMC change(s) are classified high risk.` : '') +
        (rn.state === 'ready' && nextRen ? ` The next renewal is ${nextRen.product} with ${nextRen.authority}, due ${nextRen.due}.` : ''),
      facts: {
        supplements: sp.rows, supplementsReadState: sp.state,
        supplementsInReview: sp.state === 'ready' ? inReview.length : null,
        cmcChanges: ch.rows, cmcChangesReadState: ch.state,
        highRiskCmcChanges: ch.state === 'ready' ? highChg.length : null,
        renewals: rn.rows, renewalsReadState: rn.state,
        nextRenewal: rn.state === 'ready' && nextRen
          ? { authority: nextRen.authority, product: nextRen.product, next: nextRen.next, due: nextRen.due }
          : null,
      },
      availableActions: [
        'Create a supplement or variation — note the add form is local, not persisted',
        'Read a proposed CMC change and its classified FDA reporting category and risk band',
        'Read the recurring renewal obligations and their due dates',
      ],
    };
  }, [liveSupp, supp, liveCmc, cmc, liveRen, ren, inReview.length, highChg.length, nextRen]);
  usePublishSurfaceContext('lifecycle-mgmt', anaContext);

  return (
    <BpComposer
      eyebrow="Post-approval · supplements · variations"
      title="Lifecycle management"
      state={<>Supplements, variations, CMC change control and renewal cycles across the approved portfolio.</>}
      lead={
        !hasAnswer(lcmState) ? (
          <UnresolvedLead state={lcmState} eyebrow="What needs your attention across the approved portfolio" subject="post-approval records" />
        ) : nothingOnFile ? (
          <AnswerLead
            tone="calm"
            eyebrow="What needs your attention across the approved portfolio"
            headline={<>No post-approval records are on file for this organization yet.</>}
            body={<>Create a supplement or propose a CMC change to start tracking the post-approval lifecycle. Supplements, variations, change control and renewal cycles appear here once recorded — nothing is invented in the meantime.</>}
            reassure="When a change is in play I'll classify it against ICH Q12 and draft the justification with you."
            action={{ label: 'New supplement', onClick: () => setForm(true) }}
            secondary="Or ask AnA about post-approval strategy below."
          />
        ) : (
          <AnswerLead
            tone={highChg.length ? 'urgent' : 'calm'}
            eyebrow="What needs your attention across the approved portfolio"
            headline={highChg.length && topChg
              ? <>A <b>high-risk CMC change</b> is in play -- {topChgTitle} -- and it decides your filing path.</>
              : <>Your post-approval portfolio is steady -- {inReview.length} {inReview.length === 1 ? 'supplement' : 'supplements'} in agency review{nextRen ? <>, next renewal {nextRen.due}</> : null}.</>}
            body={highChg.length && topChg
              ? <>Under ICH Q12 this is the difference between a PACMP and a prior-approval supplement — get the classification right and you avoid a costly re-file. {inReview.length ? <>{inReview.length} {inReview.length === 1 ? 'supplement is' : 'supplements are'} already in review.</> : null}</>
              /* BP-W0-3: "Nothing is overdue" was asserted whether or not any
                 renewal cycle existed to be overdue. With no renewal records the
                 truthful statement is that nothing is TRACKED, not that nothing
                 is late — and with no CMC change records, "you're on top of
                 this" was clearance derived from an empty change log. */
              : <>{nextRen
                  ? <>Nothing recorded is overdue. The next thing on the horizon is the {nextRen.authority} {nextRen.next} for {nextRen.product}, due {nextRen.due}.</>
                  : <>No renewal cycle is recorded, so renewal standing is untracked rather than clear.</>}{cmc.length === 0 ? <> No CMC changes have been assessed either.</> : null}</>}
            reassure={highChg.length
              ? "You don't have to guess the pathway — I'll classify it against Q12 and draft the justification with you."
              : cmc.length > 0 && nextRen
                ? "I'll prep the next renewal whenever you want to start."
                : undefined}
            action={{
              label: highChg.length ? 'Classify the change against ICH Q12' : (nextRen ? 'Prepare the next renewal' : 'Review the portfolio'),
              onClick: () => ask(highChg.length && topChg
                ? ('Assess ' + topChg.title + ' against ICH Q12 — PACMP eligible or prior-approval supplement?')
                : (nextRen
                  ? ('Prepare the ' + nextRen.authority + ' ' + nextRen.next + ' renewal for ' + nextRen.product)
                  : 'Summarize the post-approval portfolio and any upcoming obligations')),
            }}
            secondary="Or work supplements and change control below."
          />
        )
      }
      starters={[
        'Compare CMC change-control across the approved portfolio',
        'Draft a Type II variation against the current EMA guidance',
        'Open every supplement filed in the last 90 days',
        'Which changes are PACMP-eligible under ICH Q12?',
      ]}
      primary={<button className="sp-primary" onClick={() => setForm(true)}>{I.plus} New supplement</button>}
      onAsk={ask}
    >
      <div className="sp-sec">
        <SpCard title="Supplements and variations" meta="FDA · EMA · PMDA" action={<AddBtn onClick={() => setForm(true)} label="New supplement" />}>
          <div className="sp-list">
            {supp.length > 0 ? supp.map((s, i) => (
              <div key={i} className={rowcls(s)}>
                <span className="sp-tag">{s.agency}</span>
                <span className="sp-row-b">
                  <span className="sp-row-t">{s.product} · {s.subject}</span>
                  <span className="sp-row-s" style={{ fontFamily: 'var(--font-mono)' }}>{s.id} · filed {s.filed || '--'} · {s.due || '--'}</span>
                </span>
                {pill(s.status)}
              </div>
            )) : (
              <SpListState
                loading={liveSupp.loading}
                error={liveSupp.error}
                errorTitle="Couldn't load supplements"
                emptyTitle="No supplements or variations yet"
                emptyHint="Create a supplement to track a post-approval change — each appears here org-scoped with its agency pathway and status."
              />
            )}
          </div>
        </SpCard>
      </div>
      <div className="sp-2col">
        <SpCard title="CMC change control" meta={cmc.length + ' tracked'} foot={cmc.length > 0 ? <SpAsk onAsk={ask} cmd="Classify the open CMC changes against ICH Q12 — flag which are PACMP-eligible and which need a prior-approval supplement." label="Classify against ICH Q12" /> : undefined}>
          <div className="sp-list">
            {liveCmc.loading ? (
              <div className="sp-row"><span className="sp-row-s">Loading CMC changes…</span></div>
            ) : liveCmc.error ? (
              <div className="sp-row"><span className="sp-row-s">Couldn’t load CMC changes — sign in and retry, or check the service.</span></div>
            ) : cmc.length === 0 ? (
              <div className="sp-row"><span className="sp-row-s">No CMC changes tracked yet. Propose one to classify its FDA reporting category (SUPAC / ICH Q12).</span></div>
            ) : cmc.map((c, i) => (
              <div key={i} className="sp-row">
                <span className="sp-sev" data-s={c.risk === 'high' ? 'high' : c.risk === 'low' ? 'low' : 'med'}>{c.risk}</span>
                <span className="sp-row-b">
                  <span className="sp-row-t">{c.title}</span>
                  <span className="sp-row-s">{c.area} · {c.programs}{c.fdaCategory ? ' · ' + (FDA_CAT_LABEL[c.fdaCategory] ?? c.fdaCategory) : ''}</span>
                </span>
                {pill(c.status)}
              </div>
            ))}
          </div>
        </SpCard>
        <SpCard title="Renewal cycles" meta="PADER · 5-yr · re-exam">
          <div className="sp-list">
            {ren.length > 0 ? ren.map((r, i) => (
              <button key={i} className="sp-row" style={{ width: '100%', textAlign: 'left' }} onClick={() => ask(`Prepare the ${r.authority} ${r.next} renewal for ${r.product}`)}>
                <span className="sp-tag">{r.authority}</span>
                <span className="sp-row-b">
                  <span className="sp-row-t">{r.product} · {r.next}</span>
                  <span className="sp-row-s">{r.interval} cycle · due {r.due}</span>
                </span>
                <span className="sp-go">{I.right}</span>
              </button>
            )) : (
              <SpListState
                loading={liveRen.loading}
                error={liveRen.error}
                errorTitle="Couldn't load renewal cycles"
                emptyTitle="No renewal cycles recorded"
                emptyHint="Recurring obligations (PADER, EMA renewal, PMDA re-exam) appear here once recorded in the governed obligation store."
              />
            )}
          </div>
        </SpCard>
      </div>
      {form && <C2CForm config={FORM} onCancel={() => setForm(false)} onSubmit={onSubmit} />}
      <C2CToast msg={toast} />
    </BpComposer>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Pharmacovigilance surveillance
   ═══════════════════════════════════════════════════════════════════ */

interface PvSignal {
  product: string;
  term: string;
  count: number;
  prr: number;
  /** Null from live: adverse_events / safety_signals carry no owner/assignee. */
  owner: string | null;
  /** Null from live: no contributing-case date to derive recency from. */
  age: string | null;
  status: string;
  _new?: boolean;
}

interface PvAgg {
  /** Null from live: periodic reports are project-scoped, carry no product label. */
  product: string | null;
  cycle: string;
  due: string;
  /** Null from live: PeriodicSafetyReport has no author field. */
  by: string | null;
  /** Null from live: PeriodicSafetyReport has no reviewer roster. */
  reviewers: string | null;
  status: string;
}

/**
 * GET /api/pharmacovigilance/board returns { success, data: { signals,
 * aggregateReports } }; useLiveData unwraps the envelope, so the payload here
 * is the inner object. Both cards derive from real, org-scoped stores
 * (adverse_events → disproportionality screen; periodic_safety_reports).
 */
interface PvBoard {
  signals?: PvSignal[] | null;
  aggregateReports?: PvAgg[] | null;
}

export function Pharmacovigilance({ onAsk }: SurfaceViewProps) {
  const ask = onAsk;
  /* Fixture-free board read — real rows, an honest empty, or an honest error. */
  const board = useLiveData<PvBoard>('/api/pharmacovigilance/board');
  const liveSignals = useMemo<PvSignal[]>(
    () => (Array.isArray(board.data?.signals) ? board.data!.signals! : []),
    [board.data],
  );
  const aggs = useMemo<PvAgg[]>(
    () => (Array.isArray(board.data?.aggregateReports) ? board.data!.aggregateReports! : []),
    [board.data],
  );
  /* Locally mutable signal list so a logged signal appears immediately. */
  const [sigs, addSig] = useSeededRows<PvSignal>({ rows: liveSignals, loading: board.loading });

  const [form, setForm] = useState(false);
  const [toast, fireToast] = useToast();

  const FORM: C2CFormConfig = {
    eyebrow: 'Pharmacovigilance · log signal',
    title: 'Log a safety signal',
    governed: 'Signals are governed safety records — logging creates a §11 audit entry and routes causality assessment.',
    submitLabel: 'Log signal',
    fields: [
      { key: 'product', label: 'Product', type: 'text', placeholder: 'Product code', required: true, half: true },
      { key: 'source', label: 'Detection source', type: 'select', options: ['FAERS', 'EudraVigilance', 'Both', 'Literature', 'Clinical'], default: 'FAERS', half: true },
      { key: 'term', label: 'MedDRA preferred term', type: 'text', placeholder: 'e.g. Immune-mediated pneumonitis', required: true },
      { key: 'count', label: 'Case count', type: 'number', min: 0, placeholder: '0', required: true, half: true },
      { key: 'prr', label: 'PRR', type: 'number', min: 0, placeholder: 'e.g. 2.4', half: true },
      { key: 'status', label: 'Disposition', type: 'seg', options: ['watch', 'monitoring', 'evaluating'], default: 'watch' },
      { key: 'note', label: 'Assessment note', type: 'textarea', placeholder: 'Initial causality read / action...' },
    ],
  };

  const onSubmit = (v: Record<string, string>) => {
    const prr = parseFloat(v.prr) || 0;
    addSig({
      product: v.product, term: v.term, count: +v.count || 0,
      prr, owner: 'PV', age: 'new · ' + (v.source || 'FAERS'), status: v.status,
    });
    setForm(false);
    fireToast('Signal logged · ' + v.product + ' · ' + v.term + ' · shown locally, not persisted', 'error');
  };

  /* AnswerLead computation — from the REAL rows only. Field-level access is
     null-safe: a live row with an absent column must degrade, not crash. */
  const prrOf = (s: PvSignal | undefined) => Number(s?.prr) || 0;
  const ranked = [...sigs].sort((a, b) => prrOf(b) - prrOf(a));
  const top = ranked[0];
  const topTerm = top ? String(top.term ?? 'the top signal') : '';
  const agg = aggs.find((a) => a.status === 'drafting') || aggs[0];
  /* The sharpest one. `top` is the highest SCREENED signal, so its absence is
     positive evidence that no disproportionality screen has run — that part was
     already right. What was missing is that `top` is equally absent while the
     board read is in flight and when it has failed, and the surface then said
     "Safety standing is unknown … no screen has been run" about a record it had
     not read. On a pharmacovigilance surface that is a claim about patient
     safety derived from a network state. */
  const pvState = assessmentStateFor(board, {
    scopeExists: true,
    findingCount: sigs.length + aggs.length,
    assessmentRan: false,
  });
  const highPrr = Boolean(top && prrOf(top) >= 3);
  const nothingOnFile = sigs.length === 0 && aggs.length === 0;

  /* What AnA can see of this screen.
     One read feeds both lists, so both share its state — and on a safety
     surface the distinction matters more than anywhere else in the product: a
     board that did not load must never be published as "no signals", because
     the assistant will say it back as an absence of safety findings. That is
     the same substitution the lead above was fixed for. */
  const anaContext = useMemo(() => {
    const sg = readContext(board, sigs, (x) => ({
      product: x.product, meddraTerm: x.term, cases: x.count, prr: x.prr,
      owner: x.owner, age: x.age, disposition: x.status,
    }));
    const ag = readContext(board, aggs, (x) => ({
      product: x.product, cycle: x.cycle, due: x.due, author: x.by, reviewers: x.reviewers, status: x.status,
    }));
    return {
      summary:
        `Safety surveillance (PSUR / PBRER, signal management): ${readLine('safety signal(s)', sg)}; ` +
        `${readLine('aggregate report(s)', ag)}.` +
        (sg.state === 'ready' && top
          ? ` The highest-PRR signal is "${topTerm}" at PRR ${prrOf(top)}${highPrr ? ' — at or above the PRR 3 disproportionality threshold' : ''}.`
          : sg.state === 'ready'
            ? ' No disproportionality screen has produced a signal.'
            : ''),
      facts: {
        signals: sg.rows, signalCount: sg.count, boardReadState: sg.state,
        topSignal: sg.state === 'ready' && top
          ? { product: top.product, meddraTerm: top.term, cases: top.count, prr: prrOf(top), disposition: top.status }
          : null,
        aggregateReports: ag.rows,
        aggregateInFlight: ag.state === 'ready' && agg
          ? { product: agg.product, cycle: agg.cycle, due: agg.due, status: agg.status }
          : null,
      },
      availableActions: [
        'Log a safety signal (a governed record — creates a \u00a711 audit entry and routes causality assessment)',
        'Read the ranked signals with their case counts and PRR',
        'Read the aggregate report cycle, its due date and status',
      ],
    };
  }, [board, sigs, aggs, top, topTerm, highPrr, agg]);
  usePublishSurfaceContext('pharmacovigilance', anaContext);

  return (
    <BpComposer
      eyebrow="Pharmacovigilance · PSUR / PBRER · signals"
      title="Safety surveillance"
      state={<>Signal detection, aggregate reports in cycle and expedited submissions across approved products.</>}
      lead={
        !hasAnswer(pvState) ? (
          <UnresolvedLead state={pvState} eyebrow="Is anything in your safety data asking for action right now" subject="safety-surveillance records" />
        ) : nothingOnFile ? (
          <AnswerLead
            tone="calm"
            eyebrow="Is anything in your safety data asking for action right now"
            headline={<>No safety-surveillance data is on file for this organization yet.</>}
            body={<>Signals derive from the organization's adverse-event store and the aggregate-report cycle from its periodic safety reports. Log a signal, or record cases and reports, and they appear here — nothing is invented in the meantime.</>}
            reassure="Once surveillance data exists I'll flag the moment anything crosses the line."
            action={{ label: 'Log a signal', onClick: () => setForm(true) }}
            secondary="Or ask AnA about surveillance setup below."
          />
        ) : (
          <AnswerLead
            tone={highPrr ? 'urgent' : 'calm'}
            eyebrow="Is anything in your safety data asking for action right now"
            /* BP-W0-3 — the sharpest instance of the pattern in this file.
               `nothingOnFile` is `sigs.length === 0 && aggs.length === 0`, so an
               org holding aggregate reports but ZERO screened signals fell into
               this branch and read:

                 "Nothing is alarming today -- the highest signal is within
                  expected range (PRR --) … You're keeping watch across FAERS and
                  EudraVigilance and nothing crosses the threshold for expedited
                  action. Your surveillance is doing its job."

               with "PRR --" printed where the number should be. Nothing was
               screened; an empty signal set is not a negative screen, and on a
               pharmacovigilance surface that distinction is the whole point.
               Clearance copy now requires `top` to exist — a real screened
               signal to have been the highest one. */
            headline={highPrr && top
              ? <>Yes -- <b>{topTerm.toLowerCase()}</b> on {top.product} is the one to look at: PRR <b>{prrOf(top)}</b> across {top.count} cases.</>
              : top
                ? <>Nothing is alarming today — the highest screened signal is {topTerm.toLowerCase()} (PRR {prrOf(top)}), still within routine monitoring.</>
                : <>No signals have been screened for this organization.</>}
            body={highPrr && top
              ? <>A PRR above 3 with this many cases is worth a real causality read, not a wait-and-see. This is about patients on the drug now — pulling the case narratives and running the assessment tells you whether a label change is warranted. {agg ? <>The {agg.cycle} is also in {agg.status} for the {agg.due} window.</> : null}</>
              : top
                ? <>You're keeping watch across FAERS and EudraVigilance and nothing crosses the threshold for expedited action. {agg ? <>The {agg.cycle} is in {agg.status} for its {agg.due} window — that's the next scheduled obligation.</> : null}</>
                : <>Safety standing is unknown, not clear: no disproportionality screen has been run against the adverse-event store, so there is no highest signal to report. {agg ? <>The {agg.cycle} is in {agg.status} for its {agg.due} window — that obligation is tracked independently of signal screening.</> : null}</>}
            reassure={highPrr
              ? "You caught this early — that's the system working. I'll pull every case narrative and draft the causality assessment with you."
              : top
                ? "Your surveillance is doing its job. I'll flag the moment anything crosses the line."
                : undefined}
            action={{
              label: highPrr ? 'Adjudicate this signal now' : (agg ? 'Continue the aggregate report' : 'Review the signal log'),
              onClick: () => ask(highPrr && top
                ? ('Adjudicate the ' + topTerm + ' signal on ' + top.product + ' -- pull every case narrative, run causality assessment, and advise whether a label update is warranted')
                : (agg
                  ? ('Continue drafting the ' + agg.cycle + ' -- focus on the §15 risk evaluation')
                  : 'Review the active safety signals and their dispositions')),
              alt: highPrr && agg ? { label: 'Work the ' + agg.cycle, onClick: () => ask('Continue drafting the ' + agg.cycle + ' §15 risk evaluation') } : undefined,
            }}
            secondary="Or work signals and aggregate reports below."
          />
        )
      }
      starters={[
        'Adjudicate the highest-PRR signal across the portfolio',
        'Draft the PSUR §15 risk evaluation',
        'Cross-reference EudraVigilance and FAERS for active signals',
        'List every expedited report filed this quarter',
      ]}
      primary={<button className="sp-primary" onClick={() => setForm(true)}>{I.plus} Log a signal</button>}
      onAsk={ask}
    >
      <div className="sp-sec">
        <SpCard title="Active signals" meta="FAERS + EudraVigilance · 90d" action={<AddBtn onClick={() => setForm(true)} label="Log signal" />} foot={top ? <SpAsk onAsk={ask} cmd={'Adjudicate the ' + topTerm + ' signal on ' + top.product + ' -- pull every case narrative, run causality assessment, suggest label update.'} label={'Adjudicate the ' + topTerm + ' signal'} /> : undefined}>
          <div className="sp-list">
            {sigs.length > 0 ? sigs.map((s, i) => (
              <div key={i} className={rowcls(s)}>
                <span className="sp-tag">{s.product}</span>
                <span className="sp-row-b">
                  <span className="sp-row-t">{s.term}</span>
                  <span className="sp-row-s">{s.count} cases · <span className={prrOf(s) >= 3 ? 'sp-tone-err' : prrOf(s) >= 2 ? 'sp-tone-warn' : ''}>PRR {prrOf(s).toFixed(1)}</span>{s.owner ? <> · owner {s.owner}</> : null}{s.age ? <> · {s.age}</> : null}</span>
                </span>
                {pill(s.status)}
              </div>
            )) : (
              <SpListState
                loading={board.loading}
                error={board.error}
                errorTitle="Couldn't load safety signals"
                emptyTitle="No active signals"
                emptyHint="Signals derive from the organization's adverse-event store via the disproportionality screen. Log a signal above, or record adverse events, and they appear here."
              />
            )}
          </div>
        </SpCard>
      </div>
      <div className="sp-sec">
        <SpCard title="Aggregate reports in cycle" meta="PSUR + PBRER">
          <div className="sp-list">
            {aggs.length > 0 ? aggs.map((r, i) => (
              <div key={i} className="sp-row">
                {r.product ? <span className="sp-tag">{r.product}</span> : null}
                <span className="sp-row-b">
                  <span className="sp-row-t">{r.cycle}</span>
                  <span className="sp-row-s">Due {r.due}{r.by ? <> · drafted by {r.by}</> : null}{r.reviewers ? <> · reviewers {r.reviewers}</> : null}</span>
                </span>
                {pill(r.status)}
              </div>
            )) : (
              <SpListState
                loading={board.loading}
                error={board.error}
                errorTitle="Couldn't load aggregate reports"
                emptyTitle="No aggregate reports in cycle"
                emptyHint="PSUR / PBRER cycles appear here once periodic safety reports are recorded for this organization."
              />
            )}
          </div>
        </SpCard>
      </div>
      {form && <C2CForm config={FORM} onCancel={() => setForm(false)} onSubmit={onSubmit} />}
      <C2CToast msg={toast} />
    </BpComposer>
  );
}
