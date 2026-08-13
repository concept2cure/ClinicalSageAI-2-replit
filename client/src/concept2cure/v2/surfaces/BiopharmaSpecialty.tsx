/**
 * Biopharma specialty surfaces -- kit app/biopharma-specialty.jsx ported.
 *
 * Contains 4 surfaces:
 *   - Pediatric   (registry id `pediatric`)
 *   - Orphan      (registry id `orphan`)
 *   - Lifecycle   (registry id `lifecycle-mgmt`)
 *   - Pharmacovigilance (registry id `pharmacovigilance`)
 *
 * ── Fixture-free contract (GA real-data standard) ─────────────────────────────
 *
 * Every card here used to be `useLiveList(path, FIXTURE)`: it attempted the real
 * org-scoped GET and, on any failure OR an empty result, rendered a design-kit
 * sample behind a small "sample" pill. The samples were invented drug programmes
 * — BX-301 with a pending FDA orphan designation for relapsed multiple myeloma,
 * BX-099 with a PRR-4.2 pneumonitis signal across 27 cases, sNDA sequence
 * numbers, PDUFA dates. A pill is not consent: a reviewer looking at a
 * pharmacovigilance screen has no way to know the safety signal in front of them
 * was never observed, and an unprovisioned tenant saw a full portfolio it does
 * not own. All nine fixtures are deleted.
 *
 * Each card now renders one of exactly four things: a loading note, the org's
 * REAL rows, an honest empty state, or an honest error state. Reads:
 *   GET /api/biopharma/pediatric · /prea-milestones
 *   GET /api/biopharma/orphan · /orphan-rpd · /orphan-advocacy
 *   GET /api/biopharma/supplements · /api/lifecycle/renewals · /api/cmc-changes
 *   GET /api/pharmacovigilance/board
 *
 * The typed intake drawers (C2CForm) that used to sit on top of these lists are
 * gone with them. Every one of those routers is READ-ONLY — there is no POST for
 * a pediatric plan, an orphan designation, a supplement or a safety signal — so
 * "Add plan" prepended a row to local state, fired a toast saying it was saved,
 * claimed in its own copy that "saving writes an audit entry", and lost the
 * record on the next render. On a Part 11 surface that is a worse defect than
 * the fixtures were. The drawers come back when the write endpoints exist.
 */
import React from 'react';
import { I } from '../icons';
import { useLiveData, useLiveRows, type ListState } from '../dataConnect';
import { AnswerLead } from '../AnswerLead';
import type { SurfaceViewProps } from '../surfaceViews';
import '../styles/project-home-v2.css';

/* ── Inline shared kit helpers (Nonclinical.tsx pattern) ── */

interface BpComposerProps {
  eyebrow: string;
  title: string;
  state: React.ReactNode;
  starters: string[];
  onAsk: (text: string) => void;
  lead?: React.ReactNode;
  children?: React.ReactNode;
}

/**
 * The shell every specialty surface renders into: heading, AnswerLead, and the
 * AnA starter prompts.
 *
 * It also carried a "Today · your queue" strip — three hardcoded work items per
 * surface ("Pneumonitis signal under evaluation · PRR 4.2 · 27 cases · FAERS",
 * "iPSP still in draft · Pre-IND dependency · AltexaTab"), headed by the count
 * of them and a "sample" pill. Calling a constant "your queue" and putting a
 * number on it is the strongest possible claim that these are the signed-in
 * user's real open items; they never were, on any tenant. There is no
 * per-surface work-queue endpoint to replace it with (the real cross-surface
 * queue is the Task Tray, GET /api/task-management/my-work, which the shell top
 * bar already renders), so the strip is removed rather than re-sourced.
 *
 * `starters` stay: they are prompt text sent to AnA, not claims about data.
 */
function BpComposer({ eyebrow, title, state, starters, onAsk, lead, children }: BpComposerProps) {
  return (
    <div className="sp">
      <div className="sp-head">
        <div>
          <div className="sp-eyebrow">{eyebrow}</div>
          <h1 className="sp-title">{title}</h1>
          <p className="sp-state">{state}</p>
        </div>
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
  children?: React.ReactNode;
  foot?: React.ReactNode;
}

function SpCard({ title, meta, children, foot }: SpCardProps) {
  return (
    <div className="pj-card">
      <div className="pj-card-h">
        <span className="t">{title}</span>
        <span className="s" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {meta}
        </span>
      </div>
      <div className="pj-card-b">
        {children}
        {foot}
      </div>
    </div>
  );
}

/**
 * The honest non-row states a card shows instead of a fixture. Returns null once
 * real rows are in hand, so a card body reads
 * `<SpState .../> ?? rows.map(...)`-style: state first, rows second, never both.
 *
 * `what` completes each sentence in lower case ("Loading pediatric plans…",
 * "No pediatric plans yet."), and `hint` carries the one line that tells the
 * user what would put something here — the difference between an empty state
 * and a dead end.
 */
function SpState({
  st,
  what,
  hint,
}: {
  st: { loading: boolean; error?: string; empty: boolean };
  what: string;
  hint?: string;
}) {
  if (st.loading) {
    return <div className="sp-row"><span className="sp-row-s">Loading {what}…</span></div>;
  }
  if (st.error) {
    return (
      <div className="sp-row">
        <span className="sp-row-s">
          Couldn&rsquo;t load {what} — sign in and retry, or check that the service is reachable.
        </span>
      </div>
    );
  }
  if (st.empty) {
    return (
      <div className="sp-row">
        <span className="sp-row-s">No {what} yet.{hint ? ' ' + hint : ''}</span>
      </div>
    );
  }
  return null;
}

/** True while a list read has nothing real to show (loading, failed, or empty). */
function pending(st: { loading: boolean; error?: string; empty: boolean }): boolean {
  return st.loading || Boolean(st.error) || st.empty;
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

/* `rowcls` / `useRows` / `useToast` / `C2CToast` lived here to support the local
   optimistic prepend after a C2CForm submit — a fresh-row highlight and a
   "…added" toast. With no write endpoint behind any of these lists that prepend
   was the only thing that ever happened, so the row, the highlight and the toast
   all announced a save that never occurred. They are gone with the drawers; rows
   render straight off the live read. */

/* ═══════════════════════════════════════════════════════════════════
   Pediatric -- PREA / iPSP / EMA PIP
   ═══════════════════════════════════════════════════════════════════ */

interface PedPlan {
  id?: string;
  product: string;
  kind: string;
  ageRange: string;
  deferrals: number;
  waivers: number;
  milestones: number;
  due: string;
  status: string;
}

interface PedPrea {
  product: string;
  ms: string;
  due: string;
}

export function Pediatric({ onAsk }: SurfaceViewProps) {
  const ask = onAsk;
  /* The org's real pediatric investigation plans and PREA/PIP milestones.
     `rows` is a fresh [] while loading and on error, so every derivation below
     is null-safe without a fixture standing in. */
  const livePlans = useLiveRows<PedPlan>('/api/biopharma/pediatric');
  const plans = livePlans.rows;
  const livePrea = useLiveRows<PedPrea>('/api/biopharma/prea-milestones');
  const prea = livePrea.rows;

  /* AnswerLead computation.
     `nextMs.ms` is read through a local rather than inline: these rows come off a
     real SELECT, and a nullable/absent `milestone` column makes `.toLowerCase()`
     throw through SurfaceBoundary — turning a partially-populated row into
     "this surface stopped unexpectedly". (hostilePayloadProbe pins this.) */
  const drafts = plans.filter((p) => String(p.status).includes('draft'));
  const nextMs = prea[0];
  const nextMsLabel = nextMs?.ms ? String(nextMs.ms).toLowerCase() : null;
  const topDraft = drafts[0];

  return (
    <BpComposer
      eyebrow="Pediatric · §505B PREA · EMA PIP"
      title="Pediatric strategy"
      state={<>FDA iPSP and EMA PIP plans, deferrals, waivers and PREA milestones across the portfolio.</>}
      /* The lead reads the org's own plans out loud, so it may only render when
         there ARE plans. Left ungated it asserted "Your pediatric plans are
         filed" to a tenant that has none. */
      lead={(plans.length > 0 || prea.length > 0) ? (
        <AnswerLead
          tone="calm"
          eyebrow="Where do your pediatric obligations stand -- and what's next"
          headline={drafts.length
            ? <>{drafts.length} pediatric {drafts.length === 1 ? 'plan is' : 'plans are'} still in draft -- the closest gate is <b>{topDraft.kind} for {topDraft.product}</b> ({topDraft.due}).</>
            : <>Your pediatric plans are filed -- the next thing to watch is the {nextMsLabel ?? 'upcoming milestone'}.</>}
          body={drafts.length
            ? <>A pediatric plan usually gates the parent submission, so finishing the {topDraft.kind} rationale keeps your main program on track. The age-range extrapolation is the part reviewers scrutinize most -- get that right and the plan moves.</>
            : <>{nextMsLabel ? <>The {nextMsLabel} for {nextMs.product} is due {nextMs.due}. Staying ahead of PREA milestones avoids deferral slippage.</> : <>No milestones are overdue -- you're in good standing on your pediatric commitments.</>}</>}
          reassure={drafts.length ? "You don't have to draft the extrapolation rationale from scratch -- I'll write the first pass with you." : "You're on top of your pediatric commitments. I'll flag anything before it slips."}
          action={{
            label: drafts.length ? 'Draft the extrapolation rationale' : 'Check upcoming milestones',
            onClick: () => ask(drafts.length
              ? ('Draft the age-range extrapolation rationale for the ' + topDraft.kind + ' for ' + topDraft.product)
              : ('Surface every PREA/PIP milestone due in the next 90 days')),
          }}
          secondary="Or work the plans and milestones below."
        />
      ) : undefined}
      starters={[
        'Draft the PSP rationale for adolescent extrapolation',
        'Compare PIP modifications across the portfolio',
        'Surface every PIP milestone due in the next 90 days',
        'Draft a PREA waiver justification against the extrapolation framework',
      ]}
      onAsk={ask}
    >
      <div className="sp-sec">
        <SpCard title="Pediatric investigation plans" meta="FDA · EMA">
          <div className="sp-list">
            {pending(livePlans) ? (
              <SpState st={livePlans} what="pediatric plans" hint="FDA iPSP and EMA PIP plans recorded for this organization appear here." />
            ) : plans.map((p, i) => (
              <div key={i} className="sp-row">
                <span className="sp-tag">{p.product}</span>
                <span className="sp-row-b">
                  <span className="sp-row-t">{p.kind} · ages {p.ageRange}</span>
                  <span className="sp-row-s">{p.deferrals} deferral{p.deferrals === 1 ? '' : 's'} · {p.waivers} waiver{p.waivers === 1 ? '' : 's'} · {p.milestones} milestones · {p.due}</span>
                </span>
                {pill(p.status)}
              </div>
            ))}
          </div>
        </SpCard>
      </div>
      <div className="sp-sec">
        <SpCard title="Upcoming PREA milestones" foot={<SpAsk onAsk={ask} cmd="Draft a PREA waiver justification against the pediatric extrapolation framework from the last Type C meeting." label="Draft PREA waiver justification" />}>
          <div className="sp-list">
            {pending(livePrea) ? (
              <SpState st={livePrea} what="PREA milestones" hint="Milestones committed under a pediatric plan appear here as they are recorded." />
            ) : prea.map((u, i) => (
              <button key={i} className="sp-row" style={{ width: '100%', textAlign: 'left' }} onClick={() => ask(`Status of the ${u.product} milestone "${u.ms}" due ${u.due}`)}>
                <span className="sp-tag">{u.product}</span>
                <span className="sp-row-b">
                  <span className="sp-row-t">{u.ms}</span>
                  <span className="sp-row-s">Due {u.due}</span>
                </span>
                <span className="sp-go">{I.right}</span>
              </button>
            ))}
          </div>
        </SpCard>
      </div>
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
  /* Designations, RPD vouchers/grants and patient-advocacy engagements the org
     actually holds. Fixture-free: real rows, honest empty, honest error. */
  const liveDes = useLiveRows<OrphDes>('/api/biopharma/orphan');
  const des = liveDes.rows;
  const liveRpd = useLiveRows<OrphRpd>('/api/biopharma/orphan-rpd');
  const rpd = liveRpd.rows;
  const liveAdv = useLiveRows<OrphAdv>('/api/biopharma/orphan-advocacy');
  const adv = liveAdv.rows;

  /* AnswerLead computation. Named `awaiting` rather than `pending` so it does
     not shadow the module-level load-state helper of that name. */
  const awaiting = des.filter((d) => d.status === 'requested' || d.status === 'planned' || String(d.date).includes('pending'));
  const designated = des.filter((d) => d.status === 'designated');
  const topPending = awaiting[0];
  // Same nullable-column hazard as Pediatric's milestone label: `indication` is
  // free text on the real record and may be absent.
  const topPendingInd = topPending?.indication ? String(topPending.indication).toLowerCase() : null;

  return (
    <BpComposer
      eyebrow="Orphan drug · rare disease"
      title="Orphan and rare programs"
      state={<>Designations across FDA / EMA / PMDA, RPD vouchers and grants, and patient-advocacy engagements.</>}
      /* Only render the lead once there is a real designation to speak about —
         ungated it told an org with none that its "exclusivity and incentives
         are secured". */
      lead={des.length > 0 ? (
        <AnswerLead
          tone="calm"
          eyebrow="Where do your rare-disease designations stand"
          headline={topPending
            ? <>Your closest opportunity is <b>{topPending.product}</b> -- {topPendingInd ?? 'indication not recorded'} -- {String(topPending.date).includes('pending') ? 'awaiting an FDA decision' : 'ready to file'}.</>
            : <>You hold <b>{designated.length} orphan {designated.length === 1 ? 'designation' : 'designations'}</b> -- the exclusivity and incentives are secured.</>}
          body={topPending
            ? <>Orphan status brings 7-year exclusivity, fee waivers, and RPD-voucher eligibility -- real value worth getting right. The prevalence evidence and scientific rationale are what carry the application; that's where I can help most.</>
            : <>Across the portfolio these designations translate to years of exclusivity and priority review. The next move is keeping the patient-advocacy engagements and any RPD-voucher opportunities warm.</>}
          reassure={topPending ? "Designation narratives follow a pattern reviewers recognize -- I'll draft the prevalence and rationale sections with you." : "Your designations are in hand. I'll help you make the most of the incentives that come with them."}
          action={{
            label: topPending ? 'Draft the designation narrative' : 'Review the incentive value',
            onClick: () => ask(topPending
              ? ('Draft the ' + topPending.agency + ' orphan designation application for ' + topPending.product + ' -- prevalence + scientific rationale for ' + topPending.indication)
              : 'Compare exclusivity and incentive benefits across our orphan designations'),
          }}
          secondary="Or work designations, vouchers and advocacy below."
        />
      ) : undefined}
      starters={[
        'Find orphan precedents for our lead rare-disease indication',
        'Draft the FDA orphan application narrative',
        'Pull every RPD voucher transaction 2022--2025',
        'Compare exclusivity benefits across FDA, EMA and PMDA designations',
      ]}
      onAsk={ask}
    >
      <div className="sp-sec">
        <SpCard title="Designations" meta="FDA · EMA · PMDA">
          <div className="sp-list">
            {pending(liveDes) ? (
              <SpState st={liveDes} what="orphan designations" hint="FDA, EMA and PMDA designations recorded for this organization appear here." />
            ) : des.map((d, i) => (
              <div key={i} className="sp-row">
                <span className="sp-tag">{d.product}</span><span className="sp-tag2">{d.agency}</span>
                <span className="sp-row-b">
                  <span className="sp-row-t">{d.indication}</span>
                  <span className="sp-row-s">{d.date} · {d.prevalence} · {d.benefit}</span>
                </span>
                {pill(d.status)}
              </div>
            ))}
          </div>
        </SpCard>
      </div>
      <div className="sp-2col">
        <SpCard title="RPD vouchers & grants">
          <div className="sp-list">
            {pending(liveRpd) ? (
              <SpState st={liveRpd} what="vouchers or grants" hint="Rare-pediatric-disease vouchers and rare-disease grants appear here once recorded." />
            ) : rpd.map((g, i) => (
              <div key={i} className="sp-row">
                <span className="sp-tag">{g.product}</span>
                <span className="sp-row-b">
                  <span className="sp-row-t">{g.kind} · {g.value}</span>
                  <span className="sp-row-s">{g.notes}</span>
                </span>
                {pill(g.status)}
              </div>
            ))}
          </div>
        </SpCard>
        <SpCard title="Patient advocacy">
          <div className="sp-list">
            {pending(liveAdv) ? (
              <SpState st={liveAdv} what="advocacy engagements" hint="Patient-organization engagements appear here once recorded." />
            ) : adv.map((a, i) => (
              <button key={i} className="sp-row" style={{ width: '100%', textAlign: 'left' }} onClick={() => ask(`Summarize our engagement history with ${a.org}`)}>
                <span className="sp-tag">{a.product}</span>
                <span className="sp-row-b">
                  <span className="sp-row-t">{a.org}</span>
                  <span className="sp-row-s">{a.engagement}</span>
                </span>
                <span className="sp-go">{I.right}</span>
              </button>
            ))}
          </div>
        </SpCard>
      </div>
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
  id: string;
  filed: string;
  due: string;
  status: string;
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
  /* Three real reads, no fixture:
       supplements  — the org's filed/drafting supplements & variations
       renewals     — the governed recurring-obligation store, projected through
                      the tested lifecycle composer (region→authority,
                      recurrence→interval)
       cmc-changes  — the proposed-change store (cmc_change_controls) projected
                      on read through the deterministic SUPAC/variations
                      classifier (FDA reporting category → risk band) */
  const liveSupp = useLiveRows<LcmSupp>('/api/biopharma/supplements');
  const supp = liveSupp.rows;
  const liveRen = useLiveRows<LcmRen>('/api/lifecycle/renewals');
  const ren = liveRen.rows;
  const liveCmc = useLiveRows<LcmCmc>('/api/cmc-changes');
  const cmc = liveCmc.rows;

  /* AnswerLead computation */
  const inReview = supp.filter((s) => s.status === 'review');
  const highChg = cmc.filter((c) => c.risk === 'high');
  const nextRen = [...ren].sort((a, b) => String(a.due).localeCompare(String(b.due)))[0];
  const topChg = highChg[0];
  const topChgTitle = topChg?.title ? String(topChg.title) : null;

  return (
    <BpComposer
      eyebrow="Post-approval · supplements · variations"
      title="Lifecycle management"
      /* The strapline used to open with a hardcoded "<b>2</b> approved products".
         There is no read that counts approved products, so the number is dropped
         rather than guessed. */
      state={<>Post-approval supplements, variations, CMC change control and renewal cycles.</>}
      /* The lead narrates supplements, changes and renewals; with none of the
         three loaded it asserted "Your post-approval portfolio is steady" and
         "Nothing is overdue" about an empty portfolio. */
      lead={(supp.length > 0 || cmc.length > 0 || ren.length > 0) ? (
        <AnswerLead
          tone={highChg.length ? 'urgent' : 'calm'}
          eyebrow="What needs your attention across the approved portfolio"
          headline={highChg.length
            ? <>A <b>high-risk CMC change</b> is in play -- {topChgTitle ? topChgTitle.toLowerCase() : 'an unnamed change'} -- and it decides your filing path.</>
            : <>Your post-approval portfolio is steady -- {inReview.length} {inReview.length === 1 ? 'supplement' : 'supplements'} in agency review, next renewal {nextRen ? nextRen.due : 'scheduled'}.</>}
          body={highChg.length
            ? <>Under ICH Q12 this is the difference between a PACMP and a prior-approval supplement -- get the classification right and you avoid a costly re-file. {inReview.length ? <>{inReview.length} {inReview.length === 1 ? 'supplement is' : 'supplements are'} already in review.</> : null}</>
            : <>Nothing is overdue. The next thing on the horizon is the {nextRen ? nextRen.authority + ' ' + nextRen.next : 'renewal'} for {nextRen ? nextRen.product : 'your lead product'}, due {nextRen ? nextRen.due : '--'}.</>}
          reassure={highChg.length ? "You don't have to guess the pathway -- I'll classify it against Q12 and draft the justification with you." : "You're on top of this. I'll prep the next renewal whenever you want to start."}
          action={{
            label: highChg.length ? 'Classify the change against ICH Q12' : 'Prepare the next renewal',
            onClick: () => ask(highChg.length
              ? ('Assess ' + (topChgTitle ?? 'the open high-risk CMC change') + ' against ICH Q12 -- PACMP eligible or prior-approval supplement?')
              : ('Prepare the ' + (nextRen ? nextRen.authority + ' ' + nextRen.next : 'next') + ' renewal for ' + (nextRen ? nextRen.product : 'the lead product'))),
          }}
          secondary="Or work supplements and change control below."
        />
      ) : undefined}
      starters={[
        'Compare CMC change-control across the approved portfolio',
        'Draft a Type II variation against the current EMA guidance',
        'Open every supplement filed in the last 90 days',
        'Which changes are PACMP-eligible under ICH Q12?',
      ]}
      onAsk={ask}
    >
      <div className="sp-sec">
        <SpCard title="Supplements and variations" meta="FDA · EMA · PMDA">
          <div className="sp-list">
            {pending(liveSupp) ? (
              <SpState st={liveSupp} what="supplements or variations" hint="Post-approval supplements and variations filed by this organization appear here." />
            ) : supp.map((s, i) => (
              <div key={i} className="sp-row">
                <span className="sp-tag">{s.agency}</span>
                <span className="sp-row-b">
                  <span className="sp-row-t">{s.product} · {s.subject}</span>
                  <span className="sp-row-s" style={{ fontFamily: 'var(--font-mono)' }}>{s.id} · filed {s.filed} · {s.due}</span>
                </span>
                {pill(s.status)}
              </div>
            ))}
          </div>
        </SpCard>
      </div>
      <div className="sp-2col">
        <SpCard title="CMC change control" meta={pending(liveCmc) ? undefined : cmc.length + ' tracked'} foot={<SpAsk onAsk={ask} cmd="Classify the open CMC changes against ICH Q12 -- flag which are PACMP-eligible and which need a prior-approval supplement." label="Classify against ICH Q12" />}>
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
            {pending(liveRen) ? (
              <SpState st={liveRen} what="renewal cycles" hint="Recurring obligations (PADER, EU renewal, PMDA re-exam) appear here once an approved product is registered." />
            ) : ren.map((r, i) => (
              <button key={i} className="sp-row" style={{ width: '100%', textAlign: 'left' }} onClick={() => ask(`Prepare the ${r.authority} ${r.next} renewal for ${r.product}`)}>
                <span className="sp-tag">{r.authority}</span>
                <span className="sp-row-b">
                  <span className="sp-row-t">{r.product} · {r.next}</span>
                  <span className="sp-row-s">{r.interval} cycle · due {r.due}</span>
                </span>
                <span className="sp-go">{I.right}</span>
              </button>
            ))}
          </div>
        </SpCard>
      </div>
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
 * Shape of GET /api/pharmacovigilance/board's payload.
 *
 * The route returns the canonical `{ success, data: { signals,
 * aggregateReports } }` envelope, which `useLiveData` unwraps for us — so the
 * hook hands back `{ signals, aggregateReports }` directly. `hasKeys` is not
 * used as a guard here because BOTH keys are legitimately absent-or-null on a
 * tenant with no safety data, and a guard must never turn "nothing yet" into
 * "broken".
 */
interface PvBoard {
  signals?: PvSignal[] | null;
  aggregateReports?: PvAgg[] | null;
}

export function Pharmacovigilance({ onAsk }: SurfaceViewProps) {
  const ask = onAsk;
  /* The safety-surveillance board, both cards from real org-scoped data:
     adverse_events → disproportionality screen for "Active signals";
     periodic_safety_reports → "Aggregate reports".

     This previously ran through `useLive(path, { signals: PV_SIG,
     aggregateReports: PV_AGG })` and fell back to an invented BX-099 pneumonitis
     signal (PRR 4.2 across 27 cases) whenever the read failed or came back
     empty. A fabricated safety signal is the single worst thing on this screen
     to invent — it is the row a pharmacovigilance officer would act on — so the
     fallback is gone and each card states plainly what it has. */
  const board = useLiveData<PvBoard>('/api/pharmacovigilance/board');
  const sigs = board.data?.signals ?? [];
  const aggs = board.data?.aggregateReports ?? [];

  /* Per-card honest state, derived from the ONE board read: a card is empty
     when the read succeeded and its own list came back with no rows. */
  const sigState = {
    loading: board.loading,
    error: board.error,
    empty: !board.loading && !board.error && sigs.length === 0,
  };
  const aggState = {
    loading: board.loading,
    error: board.error,
    empty: !board.loading && !board.error && aggs.length === 0,
  };

  /* AnswerLead computation */
  const ranked = [...sigs].sort((a, b) => (b.prr || 0) - (a.prr || 0));
  const top = ranked[0];
  // `term` is a MedDRA preferred term off the real record and `prr` a computed
  // float; either can be absent on a partially-populated row, and both are read
  // through string/number methods below.
  const topTerm = top?.term ? String(top.term) : null;
  const agg = aggs.find((a) => a.status === 'drafting') || aggs[0];
  const highPrr = Boolean(topTerm) && typeof top.prr === 'number' && top.prr >= 3;

  return (
    <BpComposer
      eyebrow="Pharmacovigilance · PSUR / PBRER · signals"
      title="Safety surveillance"
      state={<>Signal detection, aggregate reports in cycle and expedited submissions across approved products.</>}
      /* Only speak about the safety picture when there IS one. Ungated, an org
         with no adverse-event data was told "Nothing is alarming today … still
         within routine monitoring" — a safety assurance derived from the
         absence of a table, which is not the same as the absence of a signal. */
      lead={(sigs.length > 0 || aggs.length > 0) ? (
        <AnswerLead
          tone={highPrr ? 'urgent' : 'calm'}
          eyebrow="Is anything in your safety data asking for action right now"
          headline={highPrr
            ? <>Yes -- <b>{topTerm?.toLowerCase()}</b> on {top.product} is the one to look at: PRR <b>{top.prr}</b> across {top.count} cases.</>
            : <>Nothing is alarming today -- the highest signal is {topTerm?.toLowerCase() ?? 'within expected range'} (PRR {top?.prr ?? '--'}), still within routine monitoring.</>}
          body={highPrr
            ? <>A PRR above 3 with this many cases is worth a real causality read, not a wait-and-see. This is about patients on the drug now -- pulling the case narratives and running the assessment tells you whether a label change is warranted. {agg ? <>The {agg.cycle} is also in {agg.status} for the {agg.due} window.</> : null}</>
            : <>You're keeping watch across FAERS and EudraVigilance and nothing crosses the threshold for expedited action. {agg ? <>The {agg.cycle} is in {agg.status} for its {agg.due} window -- that's the next scheduled obligation.</> : null}</>}
          reassure={highPrr ? "You caught this early -- that's the system working. I'll pull every case narrative and draft the causality assessment with you." : "Your surveillance is doing its job. I'll flag the moment anything crosses the line."}
          action={{
            label: highPrr ? 'Adjudicate this signal now' : 'Continue the aggregate report',
            onClick: () => ask(highPrr
              ? ('Adjudicate the ' + topTerm + ' signal on ' + top.product + ' -- pull every case narrative, run causality assessment, and advise whether a label update is warranted')
              : ('Continue drafting the ' + (agg ? agg.cycle : 'open aggregate report') + ' -- focus on the §15 risk evaluation')),
            alt: highPrr && agg ? { label: 'Work the ' + agg.cycle, onClick: () => ask('Continue drafting the ' + agg.cycle + ' §15 risk evaluation') } : undefined,
          }}
          secondary="Or work signals and aggregate reports below."
        />
      ) : undefined}
      starters={[
        'Adjudicate the highest-PRR signal across the portfolio',
        'Draft the PSUR §15 risk evaluation',
        'Cross-reference EudraVigilance and FAERS for active signals',
        'List every expedited report filed this quarter',
      ]}
      onAsk={ask}
    >
      {/* PvSignalPanel placeholder -- not yet ported as a standalone component */}
      <div className="sp-sec">
        <SpCard
          title="Active signals"
          meta="FAERS + EudraVigilance · 90d"
          /* The footer action used to name the fixture's own signal
             ("Adjudicate the pneumonitis signal"). It now names whatever the
             REAL top-ranked signal is, and is omitted entirely when there is
             none — an adjudicate button for a signal that does not exist is the
             fixture surviving as a verb. */
          foot={topTerm ? (
            <SpAsk
              onAsk={ask}
              cmd={`Adjudicate the ${topTerm} signal on ${top.product} -- pull every case narrative, run causality assessment, suggest label update.`}
              label={`Adjudicate the ${topTerm.toLowerCase()} signal`}
            />
          ) : undefined}
        >
          <div className="sp-list">
            {pending(sigState) ? (
              <SpState st={sigState} what="active safety signals" hint="Signals are screened from this organization's adverse-event records; none has been detected." />
            ) : sigs.map((s, i) => (
              <div key={i} className="sp-row">
                <span className="sp-tag">{s.product}</span>
                <span className="sp-row-b">
                  <span className="sp-row-t">{s.term}</span>
                  <span className="sp-row-s">{s.count} cases · <span className={s.prr >= 3 ? 'sp-tone-err' : s.prr >= 2 ? 'sp-tone-warn' : ''}>PRR {typeof s.prr === 'number' ? s.prr.toFixed(1) : '--'}</span>{s.owner ? <> · owner {s.owner}</> : null}{s.age ? <> · {s.age}</> : null}</span>
                </span>
                {pill(s.status)}
              </div>
            ))}
          </div>
        </SpCard>
      </div>
      <div className="sp-sec">
        <SpCard title="Aggregate reports in cycle" meta="PSUR + PBRER">
          <div className="sp-list">
            {pending(aggState) ? (
              <SpState st={aggState} what="aggregate reports in cycle" hint="PSUR and PBRER cycles appear here once a periodic safety report is opened." />
            ) : aggs.map((r, i) => (
              <div key={i} className="sp-row">
                {r.product ? <span className="sp-tag">{r.product}</span> : null}
                <span className="sp-row-b">
                  <span className="sp-row-t">{r.cycle}</span>
                  <span className="sp-row-s">Due {r.due}{r.by ? <> · drafted by {r.by}</> : null}{r.reviewers ? <> · reviewers {r.reviewers}</> : null}</span>
                </span>
                {pill(r.status)}
              </div>
            ))}
          </div>
        </SpCard>
      </div>
    </BpComposer>
  );
}
