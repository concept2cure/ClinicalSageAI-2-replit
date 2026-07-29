/**
 * Biopharma specialty surfaces -- kit app/biopharma-specialty.jsx ported.
 *
 * Contains 4 surfaces:
 *   - Pediatric   (registry id `pediatric`)
 *   - Orphan      (registry id `orphan`)
 *   - Lifecycle   (registry id `lifecycle-mgmt`)
 *   - Pharmacovigilance (registry id `pharmacovigilance`)
 *
 * Each surface pairs a reference dashboard with real structured data entry:
 * the primary action opens a typed intake drawer (C2CForm) and the saved
 * record is prepended to the live list (fresh-row highlight + toast).
 */
import React, { useState, useEffect, useRef } from 'react';
import { I } from '../icons';
import { useLive, useLiveList } from '../dataConnect';
import { AnswerLead } from '../AnswerLead';
import type { SurfaceViewProps } from '../surfaceViews';
import { C2CForm } from '../C2CForm';
import type { C2CFormConfig } from '../C2CForm';
import '../styles/project-home-v2.css';

/* ── Inline shared kit helpers (Nonclinical.tsx pattern) ── */

interface QueueItem {
  ico: string;
  title: string;
  sub: string;
  tone: string;
  action: string;
  cmd: string;
}

interface BpComposerProps {
  eyebrow: string;
  title: string;
  state: React.ReactNode;
  starters: string[];
  primary?: React.ReactNode;
  queue: QueueItem[];
  onAsk: (text: string) => void;
  lead?: React.ReactNode;
  children?: React.ReactNode;
}

function BpComposer({ eyebrow, title, state, starters, primary, queue, onAsk, lead, children }: BpComposerProps) {
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
      <div className="sp-sec">
        <div className="sp-sec-h">
          <span className="t">Today {I.dot} your queue</span>
          <span className="s">{queue.length} items</span>
          <span className="sp-sample">sample</span>
        </div>
        <div className="sp-queue">
          {queue.map((q, i) => (
            <button key={i} className="sp-q" data-tone={q.tone} onClick={() => onAsk(q.cmd)}>
              <span className="sp-q-ic">{I[q.ico] || I.info}</span>
              <span className="sp-q-b">
                <span className="sp-q-t">{q.title}</span>
                <span className="sp-q-s">{q.sub}</span>
              </span>
              <span className="sp-q-a">{q.action} {I.right}</span>
            </button>
          ))}
        </div>
      </div>
      {children}
    </div>
  );
}

interface SpCardProps {
  title: string;
  meta?: React.ReactNode;
  sample?: boolean;
  action?: React.ReactNode;
  children?: React.ReactNode;
  foot?: React.ReactNode;
}

function SpCard({ title, meta, sample, action, children, foot }: SpCardProps) {
  return (
    <div className="pj-card">
      <div className="pj-card-h">
        <span className="t">{title}</span>
        <span className="s" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {sample && <span className="sp-sample">sample</span>}
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

function useRows<T extends { _new?: boolean }>(seed: T[]): readonly [T[], (r: T) => void] {
  const [rows, setRows] = useState(() => (seed || []).map((r) => ({ ...r })));
  // Re-seed when the live source resolves (seed identity changes once).
  const seedRef = useRef(seed);
  useEffect(() => {
    if (seed !== seedRef.current) {
      seedRef.current = seed;
      setRows((seed || []).map((r) => ({ ...r })));
    }
  }, [seed]);
  const add = (r: T) => {
    const row: T = { ...r, _new: true };
    setRows((rs) => [row, ...rs]);
    setTimeout(() => setRows((rs) => rs.map((x) => (x === row ? { ...x, _new: false } : x))), 1500);
  };
  return [rows, add] as const;
}

function useToast(): [string, (m: string) => void] {
  const [msg, setMsg] = useState('');
  const fire = (m: string) => {
    setMsg(m);
    setTimeout(() => setMsg(''), 2400);
  };
  return [msg, fire];
}

function C2CToast({ msg }: { msg: string }) {
  if (!msg) return null;
  return (
    <div className="de-toast">
      <span className="ico">{I.checkCircle}</span>
      {msg}
    </div>
  );
}

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
  _new?: boolean;
}

interface PedPrea {
  product: string;
  ms: string;
  due: string;
}

const PED_PLANS: PedPlan[] = [
  { id: 'pip-420', product: 'BX-420', kind: 'EMA PIP', ageRange: '2--17', deferrals: 2, waivers: 1, milestones: 8, due: 'Trial readout · Q1 2027', status: 'agreed' },
  { id: 'psp-204', product: 'BX-204', kind: 'FDA iPSP', ageRange: '12--17', deferrals: 1, waivers: 0, milestones: 5, due: 'PREA · post-approval Y2', status: 'submitted' },
  { id: 'pip-301', product: 'BX-301', kind: 'EMA PIP', ageRange: '0--17', deferrals: 0, waivers: 1, milestones: 6, due: 'CHMP advice · Q3 2026', status: 'in draft' },
  { id: 'psp-115', product: 'BX-115', kind: 'FDA iPSP', ageRange: '6--17', deferrals: 0, waivers: 0, milestones: 4, due: 'Pre-IND meeting · 28 days', status: 'in draft' },
];

const PED_PREA: PedPrea[] = [
  { product: 'BX-204', ms: 'Adolescent PK substudy -- interim', due: 'Aug 2026' },
  { product: 'BX-420', ms: 'Juvenile tox study report -- final', due: 'Oct 2026' },
  { product: 'BX-301', ms: 'Cohort C enrollment -- first patient in', due: 'Nov 2026' },
];

export function Pediatric({ onAsk }: SurfaceViewProps) {
  const ask = onAsk;
  const livePlans = useLiveList<PedPlan>('/api/biopharma/pediatric', PED_PLANS);
  const [plans, addPlan] = useRows<PedPlan>(livePlans.data);
  /* live ?? fixture — PREA/PIP milestones from the governed store. */
  const livePrea = useLiveList<PedPrea>('/api/biopharma/prea-milestones', PED_PREA);
  const prea = livePrea.data;
  const [form, setForm] = useState(false);
  const [toast, fireToast] = useToast();

  const FORM: C2CFormConfig = {
    eyebrow: 'Pediatric · new plan',
    title: 'Open a pediatric plan',
    governed: 'Pediatric plans are governed -- saving writes an audit entry; AnA drafts the rationale for review.',
    submitLabel: 'Add plan',
    fields: [
      { key: 'product', label: 'Product', type: 'select', options: ['BX-204', 'BX-301', 'BX-115', 'BX-099'], required: true, half: true },
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
    fireToast('Pediatric plan added · ' + v.product + ' ' + v.kind);
  };

  /* AnswerLead computation */
  const drafts = plans.filter((p) => String(p.status).includes('draft'));
  const nextMs = prea[0];
  const topDraft = drafts[0];

  return (
    <BpComposer
      eyebrow="Pediatric · §505B PREA · EMA PIP"
      title="Pediatric strategy"
      state={<>FDA iPSP and EMA PIP plans, deferrals, waivers and PREA milestones across the portfolio.</>}
      lead={
        <AnswerLead
          tone="calm"
          eyebrow="Where do your pediatric obligations stand -- and what's next"
          headline={drafts.length
            ? <>{drafts.length} pediatric {drafts.length === 1 ? 'plan is' : 'plans are'} still in draft -- the closest gate is <b>{topDraft.kind} for {topDraft.product}</b> ({topDraft.due}).</>
            : <>Your pediatric plans are filed -- the next thing to watch is the {nextMs ? nextMs.ms.toLowerCase() : 'upcoming milestone'}.</>}
          body={drafts.length
            ? <>A pediatric plan usually gates the parent submission, so finishing the {topDraft.kind} rationale keeps your main program on track. The age-range extrapolation is the part reviewers scrutinize most -- get that right and the plan moves.</>
            : <>{nextMs ? <>The {nextMs.ms.toLowerCase()} for {nextMs.product} is due {nextMs.due}. Staying ahead of PREA milestones avoids deferral slippage.</> : <>No milestones are overdue -- you're in good standing on your pediatric commitments.</>}</>}
          reassure={drafts.length ? "You don't have to draft the extrapolation rationale from scratch -- I'll write the first pass with you." : "You're on top of your pediatric commitments. I'll flag anything before it slips."}
          action={{
            label: drafts.length ? 'Draft the extrapolation rationale' : 'Check upcoming milestones',
            onClick: () => ask(drafts.length
              ? ('Draft the age-range extrapolation rationale for the ' + topDraft.kind + ' for ' + topDraft.product)
              : ('Surface every PREA/PIP milestone due in the next 90 days')),
          }}
          secondary="Or work the plans and milestones below."
        />
      }
      starters={[
        'Draft the PSP rationale for adolescent extrapolation',
        'Compare PIP modifications across the portfolio',
        'Surface every PIP milestone due in the next 90 days',
        'Draft a PREA waiver justification against the extrapolation framework',
      ]}
      primary={<button className="sp-primary" onClick={() => setForm(true)}>{I.plus} Open pediatric plan</button>}
      queue={[
        { ico: 'users', title: 'PIP modification pending CHMP advice', sub: 'Paediatric population scope change', tone: 'warn', action: 'Open', cmd: 'Open the pending PIP modification and summarize the scope change' },
        { ico: 'fileText', title: 'iPSP still in draft', sub: 'Pre-IND dependency · AltexaTab', tone: 'warn', action: 'Draft', cmd: 'Continue drafting the iPSP -- focus on the age-range rationale' },
        { ico: 'clock', title: 'PREA milestone due this quarter', sub: 'Adolescent PK substudy -- interim', tone: 'info', action: 'Status', cmd: 'Status of the adolescent PK substudy interim milestone' },
      ]}
      onAsk={ask}
    >
      <div className="sp-sec">
        <SpCard title="Pediatric investigation plans" sample={livePlans.sample} meta="FDA · EMA" action={<AddBtn onClick={() => setForm(true)} label="Add plan" />}>
          <div className="sp-list">
            {plans.map((p, i) => (
              <div key={i} className={rowcls(p)}>
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
        <SpCard title="Upcoming PREA milestones" sample={livePrea.sample} foot={<SpAsk onAsk={ask} cmd="Draft a PREA waiver justification against the pediatric extrapolation framework from the last Type C meeting." label="Draft PREA waiver justification" />}>
          <div className="sp-list">
            {prea.map((u, i) => (
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

const ORPH_DES: OrphDes[] = [
  { product: 'BX-256', agency: 'FDA', indication: 'RPE65-mediated dystrophy', date: '2024-08-12', prevalence: '~3,000 US patients', benefit: '7-yr exclusivity · PDUFA waiver · Tax credit', status: 'designated' },
  { product: 'BX-256', agency: 'EMA', indication: 'RPE65-mediated dystrophy', date: '2024-11-04', prevalence: '<5 per 10k EU', benefit: '10-yr exclusivity · Protocol assistance · Fee reduction', status: 'designated' },
  { product: 'BX-301', agency: 'FDA', indication: 'Relapsed multiple myeloma', date: '2026-03-22', prevalence: '<200k US patients', benefit: 'Pending', status: 'requested' },
  { product: 'BX-420', agency: 'PMDA', indication: 'Pediatric biologic', date: '2025-05-01', prevalence: '~4,200 Japan patients', benefit: 'Re-exam 10-yr · Priority review', status: 'designated' },
  { product: 'BX-115', agency: 'FDA', indication: 'CNS · rare seizure', date: '--', prevalence: '~7,500 US patients', benefit: 'Pre-submission', status: 'planned' },
];

const ORPH_RPD: OrphRpd[] = [
  { product: 'BX-256', kind: 'Rare Pediatric Disease', value: '$100M+', notes: 'Voucher issued at approval, sold 2024', status: 'received' },
  { product: 'BX-420', kind: 'NIH rare disease grant', value: '$2.4M', notes: '4-yr funded · year 2', status: 'awarded' },
];

const ORPH_ADV: OrphAdv[] = [
  { product: 'BX-256', org: 'RPE65 Foundation', engagement: 'Steering committee · Q monthly' },
  { product: 'BX-301', org: 'Multiple Myeloma Research', engagement: 'CAB · biannual' },
  { product: 'BX-115', org: 'Childhood Neurology Net', engagement: 'Early dialogue' },
];

export function Orphan({ onAsk }: SurfaceViewProps) {
  const ask = onAsk;
  const liveDes = useLiveList<OrphDes>('/api/biopharma/orphan', ORPH_DES);
  const [des, addDes] = useRows<OrphDes>(liveDes.data);
  /* live ?? fixture — RPD vouchers/grants + patient-advocacy engagements. */
  const liveRpd = useLiveList<OrphRpd>('/api/biopharma/orphan-rpd', ORPH_RPD);
  const rpd = liveRpd.data;
  const liveAdv = useLiveList<OrphAdv>('/api/biopharma/orphan-advocacy', ORPH_ADV);
  const adv = liveAdv.data;
  const [form, setForm] = useState(false);
  const [toast, fireToast] = useToast();

  const FORM: C2CFormConfig = {
    eyebrow: 'Orphan · designation request',
    title: 'Open a designation application',
    governed: 'A designation request is a governed submission -- prevalence evidence and rationale are captured for the application package.',
    submitLabel: 'Create request',
    fields: [
      { key: 'product', label: 'Product', type: 'select', options: ['BX-204', 'BX-115', 'BX-099', 'BX-301'], required: true, half: true },
      { key: 'agency', label: 'Agency', type: 'select', options: ['FDA', 'EMA', 'PMDA'], required: true, half: true },
      { key: 'indication', label: 'Orphan indication', type: 'text', placeholder: 'e.g. RPE65 retinal dystrophy', required: true },
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
    fireToast('Designation request created · ' + v.product + ' ' + v.agency);
  };

  /* AnswerLead computation */
  const pending = des.filter((d) => d.status === 'requested' || d.status === 'planned' || String(d.date).includes('pending'));
  const designated = des.filter((d) => d.status === 'designated');
  const topPending = pending[0];

  return (
    <BpComposer
      eyebrow="Orphan drug · rare disease"
      title="Orphan and rare programs"
      state={<>Designations across FDA / EMA / PMDA, RPD vouchers and grants, and patient-advocacy engagements.</>}
      lead={
        <AnswerLead
          tone="calm"
          eyebrow="Where do your rare-disease designations stand"
          headline={topPending
            ? <>Your closest opportunity is <b>{topPending.product}</b> -- {topPending.indication.toLowerCase()} -- {String(topPending.date).includes('pending') ? 'awaiting an FDA decision' : 'ready to file'}.</>
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
      }
      starters={[
        'Find orphan precedents for our lead rare-disease indication',
        'Draft the FDA orphan application narrative',
        'Pull every RPD voucher transaction 2022--2025',
        'Compare exclusivity benefits across FDA, EMA and PMDA designations',
      ]}
      primary={<button className="sp-primary" onClick={() => setForm(true)}>{I.plus} Open designation application</button>}
      queue={[
        { ico: 'sparkles', title: 'FDA orphan designation requested', sub: 'BX-115 · decision pending', tone: 'warn', action: 'Status', cmd: 'Status of the pending FDA orphan designation request and expected decision window' },
        { ico: 'fileText', title: 'Designation application planned', sub: 'Pre-submission narrative', tone: 'info', action: 'Draft', cmd: 'Draft the FDA orphan designation application narrative -- prevalence + scientific rationale' },
        { ico: 'users', title: 'Patient advocacy steering committee', sub: 'Quarterly engagement due', tone: 'info', action: 'Prep', cmd: 'Prepare the agenda for the next patient advocacy steering committee' },
      ]}
      onAsk={ask}
    >
      <div className="sp-sec">
        <SpCard title="Designations" sample={liveDes.sample} meta="FDA · EMA · PMDA" action={<AddBtn onClick={() => setForm(true)} label="New request" />}>
          <div className="sp-list">
            {des.map((d, i) => (
              <div key={i} className={rowcls(d)}>
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
        <SpCard title="RPD vouchers & grants" sample={liveRpd.sample}>
          <div className="sp-list">
            {rpd.map((g, i) => (
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
        <SpCard title="Patient advocacy" sample={liveAdv.sample}>
          <div className="sp-list">
            {adv.map((a, i) => (
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
  id: string;
  filed: string;
  due: string;
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

const LCM_SUPP: LcmSupp[] = [
  { agency: 'FDA', product: 'BX-099', subject: 'sNDA · Prior Approval -- Pediatric indication extension', id: 'sNDA-211990-001', filed: '2026-03-04', due: 'PDUFA 2026-09-04', status: 'filed' },
  { agency: 'FDA', product: 'BX-099', subject: 'sNDA · CBE-30 -- Manufacturing site addition (DS)', id: 'sNDA-211990-002', filed: '2026-04-22', due: 'Effective 2026-05-22', status: 'filed' },
  { agency: 'EMA', product: 'BX-099', subject: 'Type II variation -- Specification change (host cell protein)', id: 'EU-VAR-006012-1', filed: '2026-02-11', due: 'CHMP day 60', status: 'review' },
  { agency: 'EMA', product: 'BX-099', subject: 'Type IB variation -- Container closure update', id: 'EU-VAR-006012-2', filed: '--', due: 'Target 2026-06', status: 'drafting' },
  { agency: 'PMDA', product: 'BX-099', subject: 'Partial change (Japan) -- Manufacturer change', id: 'JP-VAR-2024-3', filed: '2026-01-15', due: 'PMDA day 60', status: 'review' },
];

const LCM_CMC: LcmCmc[] = [
  { risk: 'high', title: 'Bioreactor scale-up 2,000L -> 5,000L', area: 'Drug substance', programs: 'BX-099, BX-204', status: 'evaluating' },
  { risk: 'medium', title: 'Stopper supplier switch', area: 'Drug product', programs: 'BX-099', status: 'planned' },
  { risk: 'low', title: 'Tighten aggregate spec', area: 'Specifications', programs: 'BX-099', status: 'implemented' },
];

const LCM_REN: LcmRen[] = [
  { authority: 'FDA', product: 'BX-099', next: 'PADER', interval: 'Annual', due: '2026-09-30' },
  { authority: 'EMA', product: 'BX-099', next: 'Renewal', interval: '5-year', due: '2030-02-14' },
  { authority: 'PMDA', product: 'BX-099', next: 'Re-exam', interval: '8-year', due: '2032-02-14' },
];

export function Lifecycle({ onAsk }: SurfaceViewProps) {
  const ask = onAsk;
  const liveSupp = useLiveList<LcmSupp>('/api/biopharma/supplements', LCM_SUPP);
  const [supp, addSupp] = useRows<LcmSupp>(liveSupp.data);
  /* live ?? fixture — the "Renewal cycles" card projects the governed
     recurring-obligation store (/api/lifecycle/renewals) through the tested
     lifecycle composer (region→authority, recurrence→interval, urgency bucket).
     Falls back to the fixture with a Sample pill when offline/unprovisioned. */
  const liveRen = useLiveList<LcmRen>('/api/lifecycle/renewals', LCM_REN);
  const ren = liveRen.data;
  /* live ?? fixture — the "CMC change control" card projects the governed
     proposed-change store (/api/cmc-changes) through the deterministic
     SUPAC/variations classifier (FDA reporting category → risk band). Falls back
     to the fixture with a Sample pill when offline/unprovisioned. */
  const liveCmc = useLiveList<LcmCmc>('/api/cmc-changes', LCM_CMC);
  const cmc = liveCmc.data;
  const [form, setForm] = useState(false);
  const [toast, fireToast] = useToast();

  const FORM: C2CFormConfig = {
    eyebrow: 'Lifecycle · new supplement',
    title: 'New supplement / variation',
    governed: 'Supplements are governed submissions -- classification and pathway are recorded; dispatch requires e-signature.',
    submitLabel: 'Create supplement',
    fields: [
      { key: 'agency', label: 'Agency & type', type: 'select', options: ['FDA sBLA', 'FDA sNDA', 'FDA CBE-30', 'FDA CBE-0', 'EMA Type IA', 'EMA Type IB', 'EMA Type II', 'PMDA partial change'], required: true },
      { key: 'product', label: 'Product', type: 'select', options: ['BX-099', 'BX-204', 'BX-301'], required: true, half: true },
      { key: 'id', label: 'Sequence / ID', type: 'text', placeholder: 'e.g. sBLA-005', half: true },
      { key: 'subject', label: 'Subject of change', type: 'text', placeholder: 'e.g. New indication -- 2L expansion', required: true },
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
    fireToast('Supplement created · ' + v.agency + ' · ' + v.product);
  };

  /* AnswerLead computation */
  const inReview = supp.filter((s) => s.status === 'review');
  const highChg = cmc.filter((c) => c.risk === 'high');
  const nextRen = [...ren].sort((a, b) => String(a.due).localeCompare(String(b.due)))[0];
  const topChg = highChg[0];

  return (
    <BpComposer
      eyebrow="Post-approval · supplements · variations"
      title="Lifecycle management"
      state={<><b>2</b> approved products in post-approval lifecycle -- supplements, variations, CMC change control and renewal cycles.</>}
      lead={
        <AnswerLead
          tone={highChg.length ? 'urgent' : 'calm'}
          eyebrow="What needs your attention across the approved portfolio"
          headline={highChg.length
            ? <>A <b>high-risk CMC change</b> is in play -- {topChg.title.toLowerCase()} -- and it decides your filing path.</>
            : <>Your post-approval portfolio is steady -- {inReview.length} {inReview.length === 1 ? 'supplement' : 'supplements'} in agency review, next renewal {nextRen ? nextRen.due : 'scheduled'}.</>}
          body={highChg.length
            ? <>Under ICH Q12 this is the difference between a PACMP and a prior-approval supplement -- get the classification right and you avoid a costly re-file. {inReview.length ? <>{inReview.length} {inReview.length === 1 ? 'supplement is' : 'supplements are'} already in review.</> : null}</>
            : <>Nothing is overdue. The next thing on the horizon is the {nextRen ? nextRen.authority + ' ' + nextRen.next : 'renewal'} for {nextRen ? nextRen.product : 'your lead product'}, due {nextRen ? nextRen.due : '--'}.</>}
          reassure={highChg.length ? "You don't have to guess the pathway -- I'll classify it against Q12 and draft the justification with you." : "You're on top of this. I'll prep the next renewal whenever you want to start."}
          action={{
            label: highChg.length ? 'Classify the change against ICH Q12' : 'Prepare the next renewal',
            onClick: () => ask(highChg.length
              ? ('Assess ' + topChg.title + ' against ICH Q12 -- PACMP eligible or prior-approval supplement?')
              : ('Prepare the ' + (nextRen ? nextRen.authority + ' ' + nextRen.next : 'next') + ' renewal for ' + (nextRen ? nextRen.product : 'the lead product'))),
          }}
          secondary="Or work supplements and change control below."
        />
      }
      starters={[
        'Compare CMC change-control across the approved portfolio',
        'Draft a Type II variation against the current EMA guidance',
        'Open every supplement filed in the last 90 days',
        'Which changes are PACMP-eligible under ICH Q12?',
      ]}
      primary={<button className="sp-primary" onClick={() => setForm(true)}>{I.plus} New supplement</button>}
      queue={[
        { ico: 'history', title: 'Type II variation in CHMP review', sub: 'Specification change -- host cell protein', tone: 'warn', action: 'Status', cmd: 'Status of the Type II variation in CHMP review and any open questions' },
        { ico: 'beaker', title: 'High-risk CMC change under evaluation', sub: 'Bioreactor scale-up 2,000L -> 5,000L', tone: 'warn', action: 'Assess', cmd: 'Assess the bioreactor scale-up change against ICH Q12 -- PACMP eligible or prior-approval supplement?' },
        { ico: 'shieldCheck', title: 'Annual report cycle approaching', sub: 'PADER · FDA', tone: 'info', action: 'Prep', cmd: 'Prepare the next PADER annual report -- pull every post-approval change this cycle' },
      ]}
      onAsk={ask}
    >
      <div className="sp-sec">
        <SpCard title="Supplements and variations" sample={liveSupp.sample} meta="FDA · EMA · PMDA" action={<AddBtn onClick={() => setForm(true)} label="New supplement" />}>
          <div className="sp-list">
            {supp.map((s, i) => (
              <div key={i} className={rowcls(s)}>
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
        <SpCard title="CMC change control" sample={liveCmc.sample} meta={cmc.length + ' tracked'} foot={<SpAsk onAsk={ask} cmd="Classify the open CMC changes against ICH Q12 -- flag which are PACMP-eligible and which need a prior-approval supplement." label="Classify against ICH Q12" />}>
          <div className="sp-list">
            {cmc.map((c, i) => (
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
        <SpCard title="Renewal cycles" sample={liveRen.sample} meta="PADER · 5-yr · re-exam">
          <div className="sp-list">
            {ren.map((r, i) => (
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
 * Shape of GET /api/pharmacovigilance/board as it arrives through useLive.
 * useLive assigns the WHOLE HTTP body to `.data`, and the live body is the
 * envelope `{ success, data: { signals, aggregateReports } }` — so the rows we
 * render live at `board.data.data`. On any failure useLive hands back the flat
 * fixture we passed (`{ signals, aggregateReports }`, no nested `.data`), so
 * `.data.data` resolves to undefined and each card fails closed to its fixture.
 */
interface PvBoardEnvelope {
  signals?: PvSignal[];
  aggregateReports?: PvAgg[];
  data?: {
    signals?: PvSignal[] | null;
    aggregateReports?: PvAgg[] | null;
  };
}

const PV_SIG: PvSignal[] = [
  { product: 'BX-099', term: 'Immune-mediated pneumonitis', count: 27, prr: 4.2, owner: 'TP', age: '3 days', status: 'evaluating' },
  { product: 'BX-099', term: 'Infusion reaction grade >=3', count: 8, prr: 2.1, owner: 'TP', age: '11 days', status: 'monitoring' },
  { product: 'BX-204', term: 'Hepatic enzyme elevation', count: 14, prr: 1.8, owner: 'JC', age: '6 days', status: 'monitoring' },
];

const PV_AGG: PvAgg[] = [
  { product: 'BX-099', cycle: 'PSUR 2026-Q2', due: 'EMA · day +60', by: 'AnA', reviewers: 'TP, MS', status: 'drafting' },
  { product: 'BX-099', cycle: 'PBRER 2026-H1', due: 'FDA · day +60', by: 'AnA', reviewers: 'TP, MS', status: 'queued' },
];

export function Pharmacovigilance({ onAsk }: SurfaceViewProps) {
  const ask = onAsk;
  /* live ?? fixture — the safety-surveillance board derives BOTH cards from
     real, org-scoped data (adverse_events → disproportionality screen for the
     "Active signals"; periodic_safety_reports for the "Aggregate reports").
     useLive assigns the whole HTTP body to `.data`, and the live envelope is
     `{ success, data: { signals, aggregateReports } }`, so the rows live at
     board.data.data. Any unreachable/malformed response (or an empty live list)
     fails closed to the flat fixture we passed, with an honest Sample pill. */
  const board = useLive<PvBoardEnvelope>('/api/pharmacovigilance/board', { signals: PV_SIG, aggregateReports: PV_AGG });
  const payload = board.data.data;
  const rawSignals = payload?.signals;
  const rawAggs = payload?.aggregateReports;
  const liveSignals: PvSignal[] = !board.sample && Array.isArray(rawSignals) ? rawSignals : [];
  const liveAggs: PvAgg[] = !board.sample && Array.isArray(rawAggs) ? rawAggs : [];

  /* Seed the editable signal list from live when present, else the fixture;
     drive each Sample pill honestly (on the fixture OR an empty live list). */
  const [sigs, addSig] = useRows<PvSignal>(liveSignals.length ? liveSignals : PV_SIG);
  const aggs = liveAggs.length ? liveAggs : PV_AGG;
  const sigSample = board.sample || !liveSignals.length;
  const aggSample = board.sample || !liveAggs.length;

  const [form, setForm] = useState(false);
  const [toast, fireToast] = useToast();

  const FORM: C2CFormConfig = {
    eyebrow: 'Pharmacovigilance · log signal',
    title: 'Log a safety signal',
    governed: 'Signals are governed safety records -- logging creates a §11 audit entry and routes causality assessment.',
    submitLabel: 'Log signal',
    fields: [
      { key: 'product', label: 'Product', type: 'select', options: ['BX-204', 'BX-099', 'BX-301'], required: true, half: true },
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
    fireToast('Signal logged · ' + v.product + ' · ' + v.term);
  };

  /* AnswerLead computation */
  const ranked = [...sigs].sort((a, b) => (b.prr || 0) - (a.prr || 0));
  const top = ranked[0];
  const agg = aggs.find((a) => a.status === 'drafting') || aggs[0];
  const highPrr = top && top.prr >= 3;

  return (
    <BpComposer
      eyebrow="Pharmacovigilance · PSUR / PBRER · signals"
      title="Safety surveillance"
      state={<>Signal detection, aggregate reports in cycle and expedited submissions across approved products.</>}
      lead={
        <AnswerLead
          tone={highPrr ? 'urgent' : 'calm'}
          eyebrow="Is anything in your safety data asking for action right now"
          headline={highPrr
            ? <>Yes -- <b>{top.term.toLowerCase()}</b> on {top.product} is the one to look at: PRR <b>{top.prr}</b> across {top.count} cases.</>
            : <>Nothing is alarming today -- the highest signal is {top ? top.term.toLowerCase() : 'within expected range'} (PRR {top ? top.prr : '--'}), still within routine monitoring.</>}
          body={highPrr
            ? <>A PRR above 3 with this many cases is worth a real causality read, not a wait-and-see. This is about patients on the drug now -- pulling the case narratives and running the assessment tells you whether a label change is warranted. {agg ? <>The {agg.cycle} is also in {agg.status} for the {agg.due} window.</> : null}</>
            : <>You're keeping watch across FAERS and EudraVigilance and nothing crosses the threshold for expedited action. {agg ? <>The {agg.cycle} is in {agg.status} for its {agg.due} window -- that's the next scheduled obligation.</> : null}</>}
          reassure={highPrr ? "You caught this early -- that's the system working. I'll pull every case narrative and draft the causality assessment with you." : "Your surveillance is doing its job. I'll flag the moment anything crosses the line."}
          action={{
            label: highPrr ? 'Adjudicate this signal now' : 'Continue the aggregate report',
            onClick: () => ask(highPrr
              ? ('Adjudicate the ' + top.term + ' signal on ' + top.product + ' -- pull every case narrative, run causality assessment, and advise whether a label update is warranted')
              : ('Continue drafting the ' + (agg ? agg.cycle : 'open aggregate report') + ' -- focus on the §15 risk evaluation')),
            alt: highPrr && agg ? { label: 'Work the ' + agg.cycle, onClick: () => ask('Continue drafting the ' + agg.cycle + ' §15 risk evaluation') } : undefined,
          }}
          secondary="Or work signals and aggregate reports below."
        />
      }
      starters={[
        'Adjudicate the highest-PRR signal across the portfolio',
        'Draft the PSUR §15 risk evaluation',
        'Cross-reference EudraVigilance and FAERS for active signals',
        'List every expedited report filed this quarter',
      ]}
      primary={<button className="sp-primary" onClick={() => setForm(true)}>{I.plus} Log a signal</button>}
      queue={[
        { ico: 'shieldAlert', title: 'Pneumonitis signal under evaluation', sub: 'PRR 4.2 · 27 cases · FAERS', tone: 'err', action: 'Adjudicate', cmd: 'Adjudicate the immune-mediated pneumonitis signal -- pull every case narrative, run causality assessment, suggest label update' },
        { ico: 'fileText', title: 'PSUR drafting in cycle', sub: 'EMA · day +60 window', tone: 'warn', action: 'Continue', cmd: 'Continue drafting the open PSUR -- focus on §15 risk evaluation' },
        { ico: 'globe', title: 'PBRER queued for the FDA cycle', sub: 'Day +60 window', tone: 'info', action: 'Start', cmd: 'Start the queued PBRER -- pull the safety data since the last data lock point' },
      ]}
      onAsk={ask}
    >
      {/* PvSignalPanel placeholder -- not yet ported as a standalone component */}
      <div className="sp-sec">
        <SpCard title="Active signals" sample={sigSample} meta="FAERS + EudraVigilance · 90d" action={<AddBtn onClick={() => setForm(true)} label="Log signal" />} foot={<SpAsk onAsk={ask} cmd="Adjudicate the immune-mediated pneumonitis signal -- pull every case narrative, run causality assessment, suggest label update." label="Adjudicate the pneumonitis signal" />}>
          <div className="sp-list">
            {sigs.map((s, i) => (
              <div key={i} className={rowcls(s)}>
                <span className="sp-tag">{s.product}</span>
                <span className="sp-row-b">
                  <span className="sp-row-t">{s.term}</span>
                  <span className="sp-row-s">{s.count} cases · <span className={s.prr >= 3 ? 'sp-tone-err' : s.prr >= 2 ? 'sp-tone-warn' : ''}>PRR {s.prr.toFixed(1)}</span>{s.owner ? <> · owner {s.owner}</> : null}{s.age ? <> · {s.age}</> : null}</span>
                </span>
                {pill(s.status)}
              </div>
            ))}
          </div>
        </SpCard>
      </div>
      <div className="sp-sec">
        <SpCard title="Aggregate reports in cycle" sample={aggSample} meta="PSUR + PBRER">
          <div className="sp-list">
            {aggs.map((r, i) => (
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
      {form && <C2CForm config={FORM} onCancel={() => setForm(false)} onSubmit={onSubmit} />}
      <C2CToast msg={toast} />
    </BpComposer>
  );
}
