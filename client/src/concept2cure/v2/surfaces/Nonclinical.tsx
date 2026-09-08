import React, { useEffect, useMemo, useRef, useState } from 'react';
import { I } from '../icons';
import { EmptyState, isRowsWith, useLiveData, useLiveRows, type DataState } from '../dataConnect';
import type { SurfaceViewProps } from '../surfaceViews';
import { usePublishSurfaceContext } from '../surfaceContext';
import '../styles/project-home-v2.css';
import { C2CForm } from '../C2CForm';
import type { C2CFormConfig } from '../C2CForm';
import { C2CToast, useToast } from '../toast';
import { apiRequest, serverMessage, redactInternals, ApiRequestError } from '@/lib/queryClient';

/* ── Inline fixture types ── */

interface NcStudy {
  // Display columns returned by listStudies() (nonclinical-service.ts):
  // { id, type, species, dur, finding, cls, send }. `id` is the human
  // study_number and `send` is a derived CASE (always present). species /
  // duration_label / key_finding / finding_class are nullable columns — and the
  // POST /studies write path does not set dur/finding/cls, so persisted studies
  // routinely carry null there. Rendered honestly (omitted when absent), never
  // fabricated.
  id: string;
  type: string;
  species: string | null;
  dur: string | null;
  finding: string | null;
  cls: string | null;
  send: string;
}

interface NcM26Section {
  n: string;
  l: string;
  st: string;
  note?: string;
}

interface NcM4Placement {
  code: string;
  l: string;
  pct: number;
}

/** SEND package-readiness rollup (live projection of the governed registry). */
interface NcSendRollup {
  inScope: number;
  validated: number;
  missingDomains: string[];
  risk: 'high' | 'medium' | 'low' | 'none';
}

/** GET /api/nonclinical-summary display contract (see server m26-m4-view.ts). */
interface NcSummary {
  m26: NcM26Section[];
  m4: NcM4Placement[];
  send: NcSendRollup;
  completeness: number;
  gaps: string[];
  provisioned: boolean;
}

/* Stable empty seed for the optimistic-row store while the live studies list is
   loading. `useLiveRows` returns a fresh [] on every render until it resolves,
   which would otherwise thrash the re-seed effect in `useRows`. */
const EMPTY_STUDIES: NcStudy[] = [];

/* A 200 from /api/nonclinical-summary was taken as proof of an NcSummary, and it
   is not. `{ data: [] }` unwraps to a bare `[]` — TRUTHY — so it sailed past the
   `summary ? …` header check and past `if (!state.data)` in SummaryBody, then
   died on `summary.send.risk` with "Cannot read properties of undefined". `{}`,
   an envelope with no payload, a 200 carrying an error body, and a JSON scalar
   all died the same way, for the same reason: the guards asked whether there was
   a payload, never whether it was this payload.

   Key PRESENCE is not enough here either — `send: null` passes an `in` check and
   crashes on `.risk` identically — so the three members this surface actually
   dereferences are checked for kind. That is the route's real contract: the M2.6
   / M4 / SEND projection is computed even for an org with zero studies (the ICH
   M4S skeleton), so `m26`/`m4`/`send` are always present and never null on a
   response that came from it. Anything else is a different endpoint answering,
   and belongs in the error panel SummaryBody already renders — not in a crash. */
function isNcSummary(value: unknown): value is NcSummary {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const s = value as Partial<NcSummary>;
  return (
    Array.isArray(s.m26) &&
    Array.isArray(s.m4) &&
    !!s.send &&
    typeof s.send === 'object' &&
    Array.isArray(s.send.missingDomains) &&
    typeof s.send.risk === 'string'
  );
}

/* GET /api/nonclinical/studies returns the bare display-shaped array. Without a
   guard `useLiveRows` flattens ANY non-array 200 to zero rows, so `{ data: {} }`
   or a proxy's login page rendered "No nonclinical studies yet" — a claim about
   the org's GLP registry that nothing verified. An empty array still passes (a
   registry with no studies is a real answer); a body that is not the row
   contract lands in the error branch below. */
const STUDY_ROWS = isRowsWith<NcStudy>('id', 'type', 'send');

/* ── Inline shared kit helpers (not yet ported as modules) ── */

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
    received: 'ok', complete: 'ok', missing: 'err',
  };
  return <span className={'rd-chip tone-' + (map[status] || 'idle')}>{status}</span>;
}

/* Was `'sp-row' + (r._new ? ' de-row-new' : '')`. `_new` was set only by the
   deleted optimistic-append path, so the highlight had no writer left. */
function rowcls(): string {
  return 'sp-row';
}

/* `useRows` is gone.
   It mirrored the live list and let a caller APPEND an optimistic row — which
   is the machinery "Add study" used to fabricate a saved study with. Now that
   the create is a real governed POST followed by a re-read, there is nothing
   left for it to do: the list IS the store's list. A helper whose only
   remaining purpose is to let a surface show a row the server does not have is
   the defect, not a convenience. */


/* ── Honest loading / error / empty guard for the /api/nonclinical-summary
   object (the M2.6 / Module 4 / SEND projection). The route fails closed to a
   real ICH M4S skeleton, so `data` is normally present; a null payload or a
   failed load are still surfaced honestly — never a fixture. ── */

function SummaryBody({
  state,
  emptyTitle,
  children,
}: {
  state: DataState<NcSummary>;
  emptyTitle: string;
  children: (sum: NcSummary) => React.ReactNode;
}) {
  if (state.loading) {
    return <div role="status" className="scaf-note" style={{ padding: '18px 10px' }}>Loading…</div>;
  }
  if (state.error) {
    return (
      <EmptyState
        tone="error"
        icon={I.alertTriangle}
        title="Couldn't load the nonclinical summary"
        hint="The Module 2.6 / Module 4 / SEND projection didn't respond. It's computed from the governed nonclinical registry — sign in and retry, or check the service is reachable."
      />
    );
  }
  if (!state.data) {
    return <EmptyState icon={I.fileText} title={emptyTitle} />;
  }
  return <>{children(state.data)}</>;
}

/* ════ Nonclinical — CTD Module 4 surface ════ */

export function Nonclinical({ onAsk, onNav }: SurfaceViewProps) {
  const ask = onAsk;
  /* Was a dead write to `c2c_open_surface`, a key with no reader — so every
     Module 4 placement row was a button that did nothing. */
  const open = (id: string) => onNav(id);
  /* Bumped after a confirmed create so the list is RE-READ — the surface shows
     the store's row, never a locally-appended echo of the form. */
  const [studyReload, setStudyReload] = useState(0);
  const [savingStudy, setSavingStudy] = useState(false);
  const liveStudies = useLiveRows<NcStudy>(
    '/api/nonclinical/studies',
    ['/api/nonclinical/studies', studyReload],
    STUDY_ROWS,
  );
  // `useLiveRows` synthesizes a FRESH [] every render whenever it has no array
  // to return (while loading AND on a failed load); feed the optimistic-row
  // store a STABLE empty seed in those states so the re-seed effect below
  // doesn't thrash. Once the org's registry resolves (rows or an honest empty
  // []), that reference is stable and becomes the seed.
  const seedStudies =
    liveStudies.loading || liveStudies.error ? EMPTY_STUDIES : liveStudies.rows;
  // The org's studies, exactly as the store holds them. Nothing is appended
  // locally; a confirmed create bumps `studyReload` and this re-reads.
  const studies = seedStudies;

  // Live M2.6 / M4-placement / SEND projection of the governed registry
  // (server nonclinical-summary.routes.ts → m26-m4-view.ts). useLiveData unwraps
  // the `{ data }` success envelope, so the payload is the NcSummary object
  // directly (not `.data.data`): a real object, an honest empty, or an honest
  // error — never a fixture. `isNcSummary` is what makes the third case reachable
  // for a 200 that is not the projection; without it the cast was a lie and the
  // subtree threw instead (see the guard above).
  const summaryState = useLiveData<NcSummary>(
    '/api/nonclinical-summary',
    ['/api/nonclinical-summary'],
    isNcSummary,
  );
  const summary = summaryState.data;

  /* ── "Today · your queue" was three invented work items ────────────────────
     A Pinnacle21 SD0063 reject and a study numbered CARC-701 — neither of which
     exists in any tenant's registry — shown under a heading with an item count
     and an error-toned badge, so every organization opening Nonclinical was
     told it had a blocking dataset reject. Clicking "Fix" then pushed that
     fabricated study number into the assistant.

     The queue is now DERIVED from the two live reads this surface already
     makes: studies whose SEND package has not conformed, and the Module 2.6
     sections the summary reports as missing. An org with neither gets an empty
     queue, which is the truth about its day — and while either read is failing
     the queue stays empty rather than asserting "nothing outstanding" over an
     outage. */
  /**
   * Run the SEND conformance check across the registry's studies.
   *
   * Each study is evaluated by the server (evaluateSendReadiness over its real
   * datasets, define.xml, nSDRG and validator state) and the findings are shown
   * with the study they belong to. Nothing is summarised away: a study the
   * check reports as outside mandatory SEND scope says so, and a failed
   * evaluation is listed as a failure rather than dropped, because a study
   * silently missing from a conformance report reads as a study that passed.
   */
  const [sendRunning, setSendRunning] = useState(false);
  const [sendReport, setSendReport] = useState<
    Array<{ study: string; ok: boolean; risk?: string; findings: Array<{ severity: string; message: string; basis?: string }>; error?: string }> | null
  >(null);
  const runSendConformance = async () => {
    if (sendRunning || studies.length === 0) return;
    setSendRunning(true);
    setSendReport(null);
    try {
      const out = await Promise.all(
        studies.map(async (st) => {
          try {
            const res = await apiRequest('GET', `/api/nonclinical/studies/${encodeURIComponent(st.id)}/send-readiness`);
            const j = await res.json().catch(() => null);
            if (!res.ok || !j) {
              return { study: st.id, ok: false, findings: [], error: serverMessage(j) ?? `HTTP ${res.status}` };
            }
            const r = j as { findings?: Array<{ severity: string; message: string; basis?: string }>; riskLevel?: string };
            return { study: st.id, ok: true, risk: r.riskLevel, findings: Array.isArray(r.findings) ? r.findings : [] };
          } catch (e) {
            /* ── This was `e instanceof Error ? e.message : String(e)` ────────
               i.e. whatever was thrown, verbatim, straight onto the row that
               renders below. `apiRequest` throws `ApiRequestError`, whose
               message has already been through `extractApiError` and IS display
               copy — but it is not the only thing that lands here. A `fetch`
               that never reaches the server rejects with a TypeError
               ("Failed to fetch"), and any unexpected throw inside this block
               (a malformed body, a property read on a null response) rejects
               with its own TypeError text. Those messages are internal shape,
               not copy, and none of them is something a regulatory director can
               act on. So only an ApiRequestError's message is carried through;
               everything else becomes the written sentence. The row still says
               the check did not run — going quiet here would read as a study
               that passed. */
            return {
              study: st.id,
              ok: false,
              findings: [],
              error: e instanceof ApiRequestError && e.message ? e.message : undefined,
            };
          }
        }),
      );
      setSendReport(out);
    } finally {
      setSendRunning(false);
    }
  };

  const queue = useMemo(() => {
    if (liveStudies.loading || liveStudies.error || summaryState.loading || summaryState.error) return [];
    const items: Array<{ ico: string; title: string; sub: string; tone: string; action: string; cmd: string }> = [];

    const sendOpen = studies.filter((st) => st.send === 'in progress');
    if (sendOpen.length) {
      const names = sendOpen.slice(0, 3).map((st) => st.id).join(', ');
      items.push({
        ico: 'shieldAlert',
        title: `SEND validation outstanding on ${sendOpen.length} ${sendOpen.length === 1 ? 'study' : 'studies'}`,
        sub: names + (sendOpen.length > 3 ? ` and ${sendOpen.length - 3} more` : ''),
        tone: 'err',
        action: 'Fix',
        cmd: `Which SEND validation findings are open on ${names}, and what has to change to make the package conform?`,
      });
    }

    const missing = (summary?.m26 ?? []).filter((sec) => sec.st === 'missing');
    for (const sec of missing.slice(0, 2)) {
      items.push({
        ico: 'fileText',
        title: `§${sec.n} ${sec.l} not written`,
        sub: sec.note || 'Required for a complete Module 2.6',
        tone: 'warn',
        action: 'Draft',
        cmd: `Draft §${sec.n} ${sec.l} from the governed nonclinical study registry, citing each claim to its source study.`,
      });
    }

    const gaps = summary?.gaps ?? [];
    if (gaps.length) {
      items.push({
        ico: 'clock',
        title: `${gaps.length} Module 4 ${gaps.length === 1 ? 'gap' : 'gaps'}`,
        sub: gaps.slice(0, 3).join(' · '),
        tone: 'info',
        action: 'Review',
        cmd: 'Walk me through the open Module 4 gaps and what closes each one.',
      });
    }
    return items;
  }, [liveStudies.loading, liveStudies.error, summaryState.loading, summaryState.error, studies, summary]);
  const [form, setForm] = useState(false);
  const [toast, fireToast] = useToast();

  const FORM: C2CFormConfig = {
    eyebrow: 'Nonclinical — new study',
    title: 'Add a GLP study',
    governed: 'Study records are governed — the report is classified, SEND is queued, and an audit entry is written.',
    submitLabel: 'Add study',
    fields: [
      { key: 'id', label: 'Study number', type: 'text', placeholder: 'e.g. TX-703', required: true, half: true },
      /* The study-type options are the SERVER's vocabulary (the STUDY_TYPE enum
         in server/routes/nonclinical.ts), labelled for a reader. They used to be
         nine display strings of the surface's own invention — "Toxicokinetics",
         "Safety pharm (CV)" — none of which the schema accepts, so even a
         wired-up form would have been rejected on every submit. */
      { key: 'type', label: 'Study type', type: 'select', required: true, half: true, options: [
        { value: 'repeat_dose_tox', label: 'Repeat-dose toxicity' },
        { value: 'single_dose_tox', label: 'Single-dose toxicity' },
        { value: 'carcinogenicity', label: 'Carcinogenicity' },
        { value: 'safety_pharmacology', label: 'Safety pharmacology' },
        { value: 'genotoxicity', label: 'Genotoxicity' },
        { value: 'reproductive_tox', label: 'Reproductive toxicity' },
        { value: 'local_tolerance', label: 'Local tolerance' },
        { value: 'adme_pk', label: 'ADME / PK' },
        { value: 'immunotoxicity', label: 'Immunotoxicity' },
        { value: 'other', label: 'Other' },
      ] },
      { key: 'title', label: 'Study title', type: 'text', placeholder: 'e.g. 26-week repeat-dose toxicity study in the rat', required: true },
      { key: 'species', label: 'Species / system', type: 'select', options: ['Rat', 'Mouse', 'Tg mouse', 'Cynomolgus', 'Rabbit', 'Dog', 'in vitro', 'in vitro / in vivo'], half: true },
      { key: 'testingFacility', label: 'Testing facility', type: 'text', half: true, placeholder: 'GLP facility name' },
      { key: 'noael', label: 'NOAEL', type: 'text', placeholder: 'e.g. 30 mg/kg/day', half: true },
      { key: 'reason', label: 'Reason for change (governed)', type: 'textarea', required: true,
        placeholder: 'Why this study is being recorded — at least 8 characters; written to the audit trail.' },
    ],
  };

  /* ── "Add study" told the user it had saved, and saved nothing ─────────────
     `onSubmit` called `addStudy` — a local optimistic-row helper — and toasted
     "Study added — <id> — SEND queued". The row appeared, the count moved, and
     the whole thing was gone on reload. Nothing was POSTed, no SEND was queued,
     and no audit entry was written, while the form's own governed banner said
     all three had happened.

     POST /api/nonclinical/studies existed the entire time. It is a GOVERNED
     write: it requires a reason for change and records the act, which is why
     the form now collects one. Fields the store does not carry (the display
     classification and SEND status, which are DERIVED server-side from the
     validation record) are no longer collected — asking for data that is
     discarded is the same defect in a smaller form.

     The row is adopted only after the server confirms it, and the surface then
     re-reads so what is on screen is the store's row, not a local echo. */
  const onSubmit = async (v: Record<string, string>) => {
    if (savingStudy) return;
    const reason = (v.reason ?? '').trim();
    if (reason.length < 8) {
      fireToast('Enter a reason for change (at least 8 characters) — the study record is audited.', 'error');
      return;
    }
    setSavingStudy(true);
    try {
      const body: Record<string, unknown> = {
        studyNumber: v.id.trim(),
        title: v.title.trim(),
        studyType: v.type,
        reason,
      };
      if (v.species) body.species = v.species;
      if (v.testingFacility?.trim()) body.testingFacility = v.testingFacility.trim();
      if (v.noael?.trim()) body.noael = v.noael.trim();

      const res = await apiRequest('POST', '/api/nonclinical/studies', body);
      const j = await res.json().catch(() => null);
      if (!res.ok || (j as { id?: unknown } | null)?.id == null) {
        fireToast(
          'The study was not recorded — ' +
            (serverMessage(j) ?? `the server refused it (HTTP ${res.status})`) +
            '. Nothing was saved.',
          'error',
        );
        return;
      }
      setForm(false);
      setStudyReload((n) => n + 1);
      const domains = (j as { requiredSendDomains?: string[] }).requiredSendDomains ?? [];
      fireToast(
        'Study ' + v.id.trim() + ' recorded and audited' +
          (domains.length ? ` — SEND domains required: ${domains.join(', ')}.` : '.'),
      );
    } catch (e) {
      fireToast(
        'The study was not recorded — ' + (e instanceof Error ? e.message : String(e)) + '. Nothing was saved.',
        'error',
      );
    } finally {
      setSavingStudy(false);
    }
  };

  const clsPill = (c: string | null) =>
    c ? (
      <span className={'rd-chip tone-' + (c === 'adverse' ? 'warn' : c === 'pending' ? 'idle' : 'ok')}>{c}</span>
    ) : null;

  /* What AnA can see of this screen. All four starters this surface offers her
     — draft §2.6.6, fix the SEND reject, classify a finding, show the Module 4
     gap — are questions about the registry and the projection below.

     The two live reads fail independently and are published independently. A
     Module 2.6 completeness figure derived from a failed projection read would
     be a filing-readiness claim nobody computed, and `provisioned: false` is a
     third state again: the projection ran and says the store is not there. */
  const anaContext = useMemo(() => {
    const studiesUnavailable = liveStudies.error ? 'the nonclinical study registry read failed' : null;
    const base = {
      studyCount: liveStudies.loading || liveStudies.error ? null : studies.length,
      studiesUnavailable,
      studies: liveStudies.loading || liveStudies.error
        ? null
        : studies.slice(0, 12).map((st) => ({
            studyId: st.id, type: st.type, species: st.species,
            duration: st.dur, keyFinding: st.finding,
            findingClass: st.cls, sendStatus: st.send,
          })),
    };
    if (summaryState.loading || liveStudies.loading) {
      return { summary: 'The nonclinical registry and its Module 2.6 / Module 4 projection are still loading; nothing on screen is final yet.' };
    }
    if (summaryState.error || !summary) {
      return {
        summary:
          'Nonclinical (CTD Module 4): the Module 2.6 / Module 4 / SEND projection could not be read, so no ' +
          'completeness or SEND readiness figure is on screen — that is a failure, not a zero.' +
          (studiesUnavailable ? ' The study registry did not load either.' : ` ${studies.length} GLP study(ies) are in the registry.`),
        facts: { ...base, projectionUnavailable: 'the Module 2.6 / Module 4 / SEND projection read failed' },
        availableActions: ['Retry the Module 2.6 / Module 4 projection read'],
      };
    }
    if (!summary.provisioned) {
      return {
        summary:
          'Nonclinical (CTD Module 4): the projection reports that the governed nonclinical store is not ' +
          'provisioned in this environment, so there is no Module 2.6 completeness or SEND rollup to show.',
        facts: { ...base, provisioned: false },
      };
    }
    return {
      summary:
        `Nonclinical (CTD Module 4): ${studies.length} GLP study(ies) in the governed registry. ` +
        `Module 2.6 is ${summary.completeness}% complete with ${(summary.gaps ?? []).length} gap(s). ` +
        `SEND — ${summary.send.validated} of ${summary.send.inScope} in-scope dataset(s) validated, ` +
        `${(summary.send.missingDomains ?? []).length} domain(s) missing, conformance risk "${summary.send.risk}" ` +
        '(SEND is mandatory for FDA nonclinical data; "none" means no conformance risk was flagged, not out of scope).',
      facts: {
        ...base,
        provisioned: true,
        module26Completeness: summary.completeness,
        module26Gaps: summary.gaps ?? [],
        module26Sections: (summary.m26 ?? []).map((sec) => ({ number: sec.n, label: sec.l, state: sec.st, note: sec.note ?? null })),
        module4Placements: (summary.m4 ?? []).map((pl) => ({ code: pl.code, label: pl.l, percent: pl.pct })),
        send: {
          inScope: summary.send.inScope,
          validated: summary.send.validated,
          missingDomains: summary.send.missingDomains ?? [],
          conformanceRisk: summary.send.risk,
        },
      },
      availableActions: [
        'Add a GLP study (a governed record — the report is classified, SEND queued, audit entry written)',
        'Open a Module 4 placement to work its section',
        'Read the Module 2.6 written-summary section states and their gaps',
        'Read the SEND conformance rollup and its missing domains',
      ],
    };
  }, [liveStudies.loading, liveStudies.error, studies, summaryState.loading, summaryState.error, summary]);
  usePublishSurfaceContext('nonclinical', anaContext);

  return (
    <BpComposer
      eyebrow="Nonclinical — CTD Module 4"
      title="Nonclinical & Module 4"
      state={
        summary ? (
          /* BP-W1-3: `send.risk === 'none'` rendered as "SEND not in scope",
             which contradicted this module's own surface — it validates SEND
             against Pinnacle 21 rules two panels down, and offers "Fix the SEND
             LB dataset reject" as a starter. SEND is MANDATORY for FDA
             nonclinical data in an NDA, BLA or ANDA (FDA Data Standards Catalog,
             eCTD m4.2.3 study data); a study cannot opt out of it.

             The projection never meant scope. `risk: 'none'` is the engine
             saying it found no conformance risk — an absence of findings, which
             the surface then reported as an absence of obligation. That is the
             same substitution BP-W0-3 fixed in the readiness narratives, landing
             here on a mandatory standard. It now reports what was measured. */
          <><b>{studies.length}</b> GLP {studies.length === 1 ? 'study' : 'studies'} {I.dot} SEND {summary.send.risk === 'none' ? 'no conformance risk flagged' : summary.send.risk + ' risk'} {I.dot} Module 2.6 {summary.completeness}% complete.</>
        ) : (
          <><b>{studies.length}</b> GLP {studies.length === 1 ? 'study' : 'studies'} in the governed nonclinical registry.</>
        )
      }
      starters={[
        'Draft the §2.6.6 toxicology written summary from the study reports',
        'Fix the SEND LB dataset reject and re-validate',
        'Classify a new tox finding as adverse or non-adverse',
        'Show the gap to a complete Module 4',
      ]}
      primary={<button className="sp-primary" onClick={() => setForm(true)}>{I.plus} Add study</button>}
      queue={queue}
      onAsk={ask}
    >
      <div className="sp-sec">
        <SpCard
          title="GLP study registry"
          meta={studies.length + ' studies'}
          action={<AddBtn onClick={() => setForm(true)} label="Add study" />}
          foot={
            <SpAsk
              onAsk={ask}
              cmd="Draft the §2.6.6 toxicology written summary from the registry, with a provenance chip linking every claim to its source study."
              label="Draft M2.6 summary from registry"
            />
          }
        >
          <div className="sp-list">
            {liveStudies.loading && studies.length === 0 ? (
              <div role="status" className="scaf-note" style={{ padding: '18px 10px' }}>Loading nonclinical studies…</div>
            ) : liveStudies.error && studies.length === 0 ? (
              <EmptyState
                tone="error"
                icon={I.alertTriangle}
                title="Couldn't load the nonclinical studies"
                hint="The governed nonclinical registry didn't respond. These are the organization's GLP tox / pharmacology / PK studies — sign in and retry, or check the service is reachable."
              />
            ) : studies.length === 0 ? (
              <EmptyState
                icon={I.fileText}
                title="No nonclinical studies yet"
                hint="Add a GLP tox, pharmacology, or PK study. Each is governed here — the report is classified, its SEND package is queued, and it threads into CTD Module 4."
              />
            ) : (
              studies.map((s, i) => (
                <div key={i} className={rowcls()}>
                  <span className="sp-tag">{s.id}</span>
                  <span className="sp-row-b">
                    <span className="sp-row-t">
                      {s.type}
                      {s.species ? <> {I.dot} {s.species}</> : null}
                      {s.dur ? <> {I.dot} {s.dur}</> : null}
                    </span>
                    <span className="sp-row-s">
                      {s.finding ? <>{s.finding} {I.dot} </> : null}SEND {s.send}
                    </span>
                  </span>
                  {clsPill(s.cls)}
                </div>
              ))
            )}
          </div>
        </SpCard>
      </div>

      <div className="sp-2col">
        <SpCard
          title="SEND readiness"
          meta={summary ? `${summary.send.inScope} in-scope -- ${summary.send.risk === 'none' ? 'no conformance risk flagged' : summary.send.risk + ' risk'}` : 'Pinnacle21'}
        >
          <SummaryBody state={summaryState} emptyTitle="No SEND package data yet">
            {(sum) => (
              <div className="sp-list">
                <div className="sp-row">
                  <span className="sp-row-b">
                    <span className="sp-row-t">{sum.send.validated}/{sum.send.inScope} package(s) validation-ready</span>
                    <span className="sp-row-s">
                      {sum.send.missingDomains.length > 0
                        ? 'Missing required SEND domain(s): ' + sum.send.missingDomains.join(', ')
                        : sum.send.inScope > 0
                          ? 'All required SEND domains present.'
                          : 'No SEND-mandated studies in the registry yet.'}
                    </span>
                  </span>
                  <span className={'rd-chip tone-' + (sum.send.risk === 'high' ? 'err' : sum.send.risk === 'medium' ? 'warn' : 'ok')}>
                    {sum.send.risk === 'none' ? 'no conformance risk flagged' : sum.send.risk + ' risk'}
                  </span>
                </div>
              </div>
            )}
          </SummaryBody>
          {sendReport && (
            <div className="nc-send-report">
              <div className="nc-send-report-h">
                SEND conformance — {sendReport.length} {sendReport.length === 1 ? 'study' : 'studies'} checked
              </div>
              {sendReport.map((r) => (
                <div key={r.study} className="nc-send-row">
                  <span className="nc-send-study">{r.study}</span>
                  {!r.ok ? (
                    /* ── This was `Not checked — {r.error}`, rendering the
                       error string with no filter. Both producers of that field
                       can hold text that must not reach a screen: the !res.ok
                       branch above falls back to `HTTP ${res.status}`, and the
                       catch could hand over any thrown message. `redactInternals`
                       is the shared last gate `<ErrorState>` already applies to
                       every message it renders — routed through here for the same
                       guarantee on this inline row. The failure stays visible and
                       still says the check did not run. */
                    <span className="nc-send-f err">
                      Not checked — {redactInternals(r.error, 'the check did not complete')}
                    </span>
                  ) : r.findings.length === 0 ? (
                    <span className="nc-send-f ok">No findings{r.risk ? ` · risk ${r.risk}` : ''}</span>
                  ) : (
                    <span className="nc-send-fs">
                      {r.findings.map((f, i) => (
                        <span key={i} className={'nc-send-f ' + (f.severity === 'critical' || f.severity === 'major' ? 'err' : 'warn')}>
                          {f.message}
                          {f.basis && <em> — {f.basis}</em>}
                        </span>
                      ))}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
          <div className="sp-foot">
            {/* ── "Run SEND conformance" ran nothing ─────────────────────────
                It typed a sentence into the chat. The check is real and
                deterministic: GET /api/nonclinical/studies/:id/send-readiness
                runs evaluateSendReadiness — required SENDIG 3.x domains,
                define.xml, the nSDRG, and open validator errors — each finding
                carrying the guidance it comes from. It had no caller.

                Run per study, because that is the unit the check evaluates;
                the rollup above is derived from the same registry. */}
            <button
              className="sp-ask"
              onClick={() => void runSendConformance()}
              disabled={sendRunning || studies.length === 0}
              title={studies.length === 0 ? 'No studies are in the registry to check.' : undefined}
            >
              {I.sparkles} {sendRunning ? 'Checking…' : 'Run SEND conformance'}
            </button>
          </div>
        </SpCard>

        <SpCard title="Module 4 placement" meta="4.2.x readiness">
          <SummaryBody state={summaryState} emptyTitle="No Module 4 placement data yet">
            {(sum) => (
              <div className="sp-list">
                {sum.m4.map((m, i) => (
                  <button key={i} className="sp-row" style={{ width: '100%', textAlign: 'left' }} onClick={() => open('dossier')}>
                    <span className="sp-tag">{m.code}</span>
                    <span className="sp-row-b">
                      <span className="sp-row-t">{m.l}</span>
                      <span className="pj-mod-track" style={{ marginTop: 4 }}>
                        <span className="pj-mod-fill" data-risk={m.pct < 85 || undefined} style={{ width: m.pct + '%' }} />
                      </span>
                    </span>
                    <span className="sp-tag2">{m.pct}%</span>
                  </button>
                ))}
              </div>
            )}
          </SummaryBody>
        </SpCard>
      </div>

      <div className="sp-sec">
        <SpCard title="CTD Module 2.6 summary builder" meta="2.6.1 — 2.6.7">
          <SummaryBody state={summaryState} emptyTitle="No Module 2.6 summary data yet">
            {(sum) => (
              <div className="sp-list">
                {sum.m26.map((m, i) => (
                  /* ── These rows asked the chat to "open" a section ──────────
                     `ask('Open §2.6.6 … and continue drafting')`, while the
                     Module 4 rows two panels up — identical in look and
                     behaviour-suggesting affordance — actually navigate
                     (`onClick={() => open('dossier')}`). One of the two was
                     lying about what a click does, and it was this one.

                     A §2.6 section is authored in the document workspace, so
                     that is where the row goes; the section is named in the
                     prompt only when the user asks for help with it. */
                  <button key={i} className="sp-row" style={{ width: '100%', textAlign: 'left' }} onClick={() => open('document-authoring')}>
                    <span className="sp-tag">{m.n}</span>
                    <span className="sp-row-b">
                      <span className="sp-row-t">{m.l}</span>
                      {m.note && <span className="sp-row-s">{m.note}</span>}
                    </span>
                    {pill(m.st)}
                  </button>
                ))}
              </div>
            )}
          </SummaryBody>
        </SpCard>
      </div>

      {form && <C2CForm config={FORM} onCancel={() => setForm(false)} onSubmit={onSubmit} />}
      <C2CToast msg={toast} />
    </BpComposer>
  );
}
