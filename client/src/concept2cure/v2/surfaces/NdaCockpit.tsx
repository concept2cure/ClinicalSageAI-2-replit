import React, { useState, useEffect, useRef, useMemo } from 'react';
import { usePublishSurfaceContext } from '../surfaceContext';
import { useSurfaceActionHandlers } from '../surfaceActions';
import { I } from '../icons';
import { useLiveData, useLiveRows, EmptyState } from '../dataConnect';
import { apiRequest } from '@/lib/queryClient';
import { AnswerLead } from '../AnswerLead';
import { assessmentState, mayReassure } from '../assessmentState';
import type { SurfaceViewProps } from '../surfaceViews';
import { C2CForm } from '../C2CForm';
import type { C2CFormConfig } from '../C2CForm';
import '../styles/project-home-v2.css';
import { C2CToast, useToast } from '../toast';

/* ── Inline fixture types ── */

interface NdaModule {
  m: string;
  label: string;
  pct: number;
  docs: number;
  open: number;
  gate: string | null;
}

interface NdaM1Doc {
  id: string;
  label: string;
  st: string;
  blocker?: boolean;
  note?: string;
  _new?: boolean;
}

interface NdaRtfItem {
  id?: string;
  sev: string;
  area: string;
  text: string;
  fix: string;
  _new?: boolean;
}

interface BlaAssessment {
  id: string;
  kind: string;
  title?: string | null;
  modality?: string | null;
  reference_product?: string | null;
  target_agency?: string | null;
  verdict?: string | null;
  status: string;
  program_id?: string | null;
}

/* ── Inline surface constants ── */

/* The CTD module readiness (M1–M5), the Module-1 admin worklist, the
   Refuse-to-File risk log, and the BLA 351(a) biologics assessments are all read
   fixture-free from their real, org-scoped stores (see the hooks below) — real
   data, an honest empty state, or an honest failed-load state, never a
   fabricated stand-in. There is NO review-clock store (nda-cockpit.routes.ts and
   bla-workbench.ts back every other panel; neither exposes a clock), so the
   PDUFA clock tab renders an honest "no review clock recorded" state instead of
   the invented submission/PDUFA dates it used to hardcode. Likewise the header
   names only the program actually open in the shell (window.C2C_PROJECT) — it
   never invents an application number, pathway, or review designation. */

/** The open program's display name from the shell's runtime project channel
 *  (window.C2C_PROJECT — the same convention every project-aware v2 surface
 *  reads). Null when no project is open; the header then claims nothing. */
function readProgramName(): string | null {
  const p = (window as unknown as { C2C_PROJECT?: { title?: unknown; code?: unknown } }).C2C_PROJECT;
  const title = typeof p?.title === 'string' && p.title.trim() ? p.title.trim() : null;
  const code = typeof p?.code === 'string' && p.code.trim() ? p.code.trim() : null;
  return title ?? code;
}

/* Biologics (BLA 351(a)) science-engine assessments — the biosimilar/biologic
   analytical-similarity, comparability, immunogenicity, and RTF/CRL filing-risk
   verdicts produced by /api/biopharma/bla and persisted org-scoped to
   c2c_bla_assessments. Read fixture-free below from
   GET /api/biopharma/bla/assessments: real rows, an honest empty state, or an
   honest failed-load state. The two maps here are display helpers (a kind→label
   map and a passing-verdict allowlist), not data. */
const BLA_KIND_LABEL: Record<string, string> = {
  analytical_similarity: 'Analytical similarity (CQA tiering)',
  comparability: 'Comparability (Q5E / post-change)',
  immunogenicity: 'Immunogenicity (ADA / NAb risk)',
  filing_risk: 'BLA filing risk (RTF / CRL)',
};

/* Only an explicit allowlist of passing verdicts renders green — every other
   value (moderate/medium/high/critical CRL risk, not_comparable,
   not_demonstrated, insufficient_data, elevated ADA risk, or any unknown
   string) is styled as attention, never as a false "complete". An unresolved
   biologics blocker must never present as green. Verdicts come from the engines:
   similarity `conclusion`, comparability `conclusion`, immunogenicity
   `risk.tier`, filing-risk `crlRisk`. */
const BLA_PASSING_VERDICTS = new Set(['similar', 'comparable', 'low', 'minimal', 'negligible', 'none']);
const isPassingBlaVerdict = (v?: string | null): boolean => !!v && BLA_PASSING_VERDICTS.has(v.toLowerCase());

/* ── Inline shared kit helpers ── */

/* ════ NdaCockpit -- NDA / BLA filing cockpit ════ */

export function NdaCockpit({ onAsk, onNav }: SurfaceViewProps) {
  const [tab, setTab] = useState('ctd');
  const ask = onAsk;
  const open = (id: string) => {
    onNav && onNav(id);
  };
  /* The open program's real name (or null) — the only identity this surface
     may claim. */
  const progName = readProgramName();
  /* Real rows — the org's CTD module (M1–M5) readiness, assembled from the real
     eCTD submission core (submissions where application_type IN ('nda','bla') +
     ectd_sequences + submission_leaves + coauthor_documents) by
     GET /api/nda-cockpit/modules. Fixture-free: real data, an honest empty
     state, or an honest failed-load state — never a fabricated stand-in. The
     overall % ready is derived from the loaded rows. */
  const modulesLive = useLiveRows<NdaModule>('/api/nda-cockpit/modules');
  const modules = modulesLive.rows;
  const overall = modules.length
    ? Math.round(modules.reduce((a, m) => a + m.pct, 0) / modules.length)
    : 0;
  /* Real rows — the org's Refuse-to-File risk log (org-scoped DB read that
     fails closed to an empty list). The list stays locally mutable so a logged
     risk appears immediately, and the POST persists it. Seed the local list
     once, when the read settles. */
  const rtfLive = useLiveRows<NdaRtfItem>('/api/nda-cockpit/rtf');
  const rtfIsLive = !rtfLive.error;
  const [rtf, setRtf] = useState<NdaRtfItem[]>([]);
  const rtfSeeded = useRef(false);
  useEffect(() => {
    if (!rtfLive.loading && !rtfSeeded.current) {
      rtfSeeded.current = true;
      setRtf(rtfLive.rows.map((r) => ({ ...r })));
    }
  }, [rtfLive.loading, rtfLive.rows]);
  const addRtf = (r: NdaRtfItem) => {
    const row: NdaRtfItem = { ...r, _new: true };
    setRtf((rs) => [row, ...rs]);
    setTimeout(() => setRtf((rs) => rs.map((x) => (x === row ? { ...x, _new: false } : x))), 1500);
  };
  /* Real rows — the org's Module-1 admin worklist (org-scoped DB read that
     fails closed to an empty list). The list stays locally mutable so an added
     document appears immediately, and the POST persists it. Seed the local list
     once, when the read settles. */
  const m1Live = useLiveRows<NdaM1Doc>('/api/nda-cockpit/m1');
  const m1IsLive = !m1Live.error;
  const [m1, setM1] = useState<NdaM1Doc[]>([]);
  const m1Seeded = useRef(false);
  useEffect(() => {
    if (!m1Live.loading && !m1Seeded.current) {
      m1Seeded.current = true;
      setM1(m1Live.rows.map((r) => ({ ...r })));
    }
  }, [m1Live.loading, m1Live.rows]);
  const addM1 = (r: NdaM1Doc) => {
    const row: NdaM1Doc = { ...r, _new: true };
    setM1((rs) => [row, ...rs]);
    setTimeout(() => setM1((rs) => rs.map((x) => (x === row ? { ...x, _new: false } : x))), 1500);
  };
  /* Real rows — the org's BLA 351(a) biologics assessments, read fixture-free
     from GET /api/biopharma/bla/assessments (org-scoped read of
     c2c_bla_assessments). That endpoint returns { assessments: [...] } rather
     than the standard { data } envelope, so read the object payload and take the
     list off it. Read-only here — assessments are authored and Part 11-signed in
     the biologics workbench. Real data, an honest empty state, or an honest
     failed-load state — never a fabricated stand-in. */
  const blaLive = useLiveData<{ assessments?: BlaAssessment[] }>('/api/biopharma/bla/assessments');
  const blaList = blaLive.data?.assessments;
  const bla: BlaAssessment[] = Array.isArray(blaList) ? blaList : [];

  const [form, setForm] = useState<null | 'rtf' | 'm1'>(null);
  const [toast, fireToast] = useToast();
  const m1open = m1.filter(d => d.st !== 'complete' && d.st !== 'na').length;

  const RTF_FORM: C2CFormConfig = {
    eyebrow: 'Filing risk · log',
    title: 'Log a filing-risk item',
    governed: 'Filing-risk items feed the day-60 Refuse-to-File shadow review; logging writes an audit entry.',
    submitLabel: 'Log risk',
    fields: [
      { key: 'area', label: 'Module / area', type: 'select', options: ['Module 1 · admin', 'Module 2 · summaries', 'Module 3 · CMC', 'Module 4 · nonclinical', 'Module 5 · clinical', 'Module 5 · datasets'], required: true },
      { key: 'sev', label: 'Severity', type: 'seg', options: ['low', 'med', 'high'], default: 'med' },
      { key: 'text', label: 'Risk', type: 'textarea', placeholder: 'What could trigger a Refuse-to-File...', required: true },
      { key: 'fix', label: 'Remediation', type: 'text', placeholder: 'What closes it', required: true },
    ],
  };

  const M1_FORM: C2CFormConfig = {
    eyebrow: 'Module 1 · add document',
    title: 'Add a Module 1 document',
    governed: 'Module 1 administrative documents are governed submission components.',
    submitLabel: 'Add document',
    fields: [
      { key: 'label', label: 'Document', type: 'text', placeholder: 'e.g. Form FDA 356h', required: true },
      { key: 'st', label: 'Status', type: 'seg', options: ['draft', 'review', 'complete'], default: 'draft' },
      { key: 'note', label: 'Note', type: 'text', placeholder: 'Optional context' },
    ],
  };

  const submitRtf = async (v: Record<string, string>) => {
    setForm(null);
    setTab('rtf');
    const local = (): NdaRtfItem => ({ id: 'rtf-' + Date.now(), sev: v.sev, area: v.area, text: v.text, fix: v.fix });
    if (!rtfIsLive) {
      // Read failed (no org/session) — nothing to persist to; show it locally
      // and say so instead of faking success.
      addRtf(local());
      fireToast('Filing risk logged · ' + v.area + ' · shown locally, not persisted', 'error');
      return;
    }
    try {
      const res = await apiRequest('POST', '/api/nda-cockpit/rtf', {
        area: v.area,
        text: v.text,
        sev: v.sev,
        fix: v.fix,
      });
      if (!res.ok) {
        addRtf(local());
        fireToast('Could not log filing risk · sign in required — shown locally, not persisted', 'error');
        return;
      }
      const body = await res.json().catch(() => null);
      const row = body?.data;
      // Adopt the persisted row (server-generated id) when returned, else the local shape.
      addRtf(row && typeof row.area === 'string' ? (row as NdaRtfItem) : local());
      fireToast('Filing risk logged · ' + v.area);
    } catch (e) {
      // apiRequest throws on non-OK with the server's reason. Fall back to local
      // and say it did not persist — never report a write that did not happen.
      addRtf(local());
      fireToast(
        'Could not log filing risk · ' +
          (e instanceof Error && e.message ? e.message : 'request failed') +
          ' — shown locally, not persisted',
        'error',
      );
    }
  };

  const submitM1 = async (v: Record<string, string>) => {
    setForm(null);
    setTab('m1');
    const local = (): NdaM1Doc => ({ id: 'm1-' + Date.now(), label: v.label, st: v.st, note: v.note || undefined });
    if (!m1IsLive) {
      // Read failed (no org/session) — nothing to persist to; show it locally
      // and say so instead of faking success.
      addM1(local());
      fireToast('Module 1 document added · shown locally, not persisted', 'error');
      return;
    }
    try {
      const res = await apiRequest('POST', '/api/nda-cockpit/m1', {
        label: v.label,
        st: v.st,
        note: v.note || undefined,
      });
      if (!res.ok) {
        addM1(local());
        fireToast('Could not save Module 1 document · sign in required — shown locally, not persisted', 'error');
        return;
      }
      const body = await res.json().catch(() => null);
      const row = body?.data;
      // Adopt the persisted row (server-generated id) when returned, else the local shape.
      addM1(row && typeof row.id === 'string' ? (row as NdaM1Doc) : local());
      fireToast('Module 1 document added');
    } catch (e) {
      // apiRequest throws on non-OK with the server's reason. Fall back to local
      // and say it did not persist — never report a write that did not happen.
      addM1(local());
      fireToast(
        'Could not save Module 1 document · ' +
          (e instanceof Error && e.message ? e.message : 'request failed') +
          ' — shown locally, not persisted',
        'error',
      );
    }
  };

  const tabs: [string, string][] = [['ctd', 'CTD readiness'], ['m1', 'Module 1 admin'], ['clock', 'PDUFA review clock'], ['rtf', 'Refuse-to-File risk'], ['bla', 'BLA biologics']];

  /* AnA can open any cockpit tab — the same view-state switch a person makes.
     The registry enum has validated `tab`; the defensive lookup keeps the
     handler honest if the registry drifts. */
  useSurfaceActionHandlers('nda-cockpit', {
    'nda-cockpit.open-tab': (params) => {
      const target = params.tab;
      const hit = tabs.find((t) => t[0] === target);
      if (!hit) return { ok: false, reason: `"${target}" is not an NDA/BLA cockpit tab.` };
      if (tab === target) return { ok: true, detail: `Already on the ${hit[1]} tab` };
      setTab(target);
      return { ok: true, detail: `Opened the ${hit[1]} tab` };
    },
  });

  /* Context-aware human lead */
  const highs = rtf.filter(r => r.sev === 'high');
  const topHigh = highs[0] || rtf.find(r => r.sev === 'med');
  const gateMod = modules.filter(m => m.gate).sort((a, b) => a.pct - b.pct)[0];
  const openItems = m1open + rtf.filter(r => r.sev !== 'low').length;

  /* ── Which of the three states is this program actually in? (BP-W0-3) ───────
     This used to be `highs.length ? urgent : clear`, a two-branch conditional
     with no representation for "nothing has been assessed". Over an empty
     program the second branch fired and the surface asserted "no Refuse-to-File
     blockers left … You're close." Both clauses are true of an empty array and
     neither is true of the program.

     `scopeExists` is the CTD module roll-up, because that read IS the question
     "does an NDA/BLA submission exist here at all" — assembleOrgNdaModules
     returns an empty list for an org with no such submission, so no rows means
     there is nothing an assessment could have run against.

     `assessmentRan` is FALSE, deliberately and not as a placeholder. The RtF
     risk log is an append-only list of items a human logged; GET
     /api/nda-cockpit/rtf cannot distinguish "the day-60 shadow review ran and
     found nothing" from "nobody has looked yet", because no completed-review
     signal is recorded anywhere for this surface to read. Until one is, the
     honest answer is that clearance is unproven — so this surface never claims
     it. Deriving `assessmentRan` from `rtf.length === 0` would reinstate the
     exact defect. When a shadow-review completion record lands (BP-W1-6 puts
     one in reach), this is the single line that changes. */
  const filingState = assessmentState({
    loading: modulesLive.loading || rtfLive.loading,
    unreadable: Boolean(modulesLive.error || rtfLive.error),
    scopeExists: modules.length > 0,
    findingCount: rtf.length,
    assessmentRan: false,
  });
  const reassuring = mayReassure(filingState, overall);

  /* What AnA can see of this screen.
     She knew the user was on "nda-cockpit" and nothing else — not the CTD
     readiness, not how many Module 1 admin items are open, and crucially not
     whether Refuse-to-File risk has actually been ASSESSED.

     `filingState` is published verbatim rather than re-derived, because this
     surface already owns the distinction that matters and re-deriving it here
     would be a second opinion that can drift from the one on screen. Its
     vocabulary is the point: `not-assessed` is NOT `assessed-clear`, and
     `unreadable` is neither. The comment above `filingState` records why —
     no completed-review signal exists for this surface to read, so an empty
     risk log cannot mean "the day-60 shadow review found nothing", and
     inferring clearance from `rtf.length === 0` would reinstate the exact
     defect. AnA must inherit that caution, not launder it into a percentage. */
  const anaContext = useMemo(() => {
    if (filingState === 'loading') {
      return { summary: 'The NDA cockpit is still loading; nothing on screen is being asserted yet.' };
    }
    if (filingState === 'unreadable') {
      return {
        summary:
          'The NDA cockpit reads could not complete, so this screen shows no readiness figure and no Refuse-to-File position — that is a failed read, not a clean program.',
        availableActions: ['Retry the CTD module and RTF reads'],
      };
    }
    const rtfClause =
      filingState === 'assessed-with-findings'
        ? `${rtf.length} logged Refuse-to-File risk(s), ${highs.length} high`
        : 'Refuse-to-File risk is NOT ASSESSED — no completed shadow review is recorded, so an empty risk log is not clearance';
    /* Module 1 is a SEPARATE read (m1Live) deliberately excluded from filingState,
       so it carries its own gate here: a failed or in-flight m1Live makes m1open
       0, which must not read as "Module 1 is clear." null = not-yet-known. */
    const m1Loaded = !m1Live.loading && !m1Live.error;
    const m1Clause = m1Loaded
      ? `${m1open} Module 1 admin item(s) open`
      : 'Module 1 admin status could not be read';
    return {
      summary:
        `NDA cockpit${progName ? ` for ${progName}` : ''}: CTD readiness ${overall}% across ` +
        `${modules.length} module(s), ${m1Clause}. ${rtfClause}.`,
      facts: {
        program: progName,
        ctdReadinessPct: overall,
        moduleCount: modules.length,
        module1AdminOpen: m1Loaded ? m1open : null,
        /* The surface's own verdict, not a re-derivation. */
        refuseToFileState: filingState,
        loggedRtfRisks: rtf.length,
        highRtfRisks: highs.length,
        mayReassure: reassuring,
        openTab: tab,
      },
      availableActions: [
        'Open a CTD module to see its readiness detail',
        'Log a Refuse-to-File risk',
        'Add or update a Module 1 administrative document',
        'Review the BLA assessment set',
      ],
    };
  }, [filingState, progName, overall, modules.length, m1open, m1Live.loading, m1Live.error, rtf.length, highs.length, reassuring, tab]);
  usePublishSurfaceContext('nda-cockpit', anaContext);

  /* The KPI strip speaks from the SAME state the lead does, derived here rather
     than re-tested at each tile, so the two cannot drift apart.

     They had drifted. `overall`, `m1open` and `highs.length` all evaluate to 0
     while their reads are in flight AND when those reads have failed, because
     `useLiveRows` returns a frozen empty array in both cases and the local
     working sets seed from it only once `!loading`. So the strip rendered
     "0% Application readiness / 0 Module 1 admin open / 0 High RTF risk"
     directly beneath the lead's own "Nothing is being asserted about
     Refuse-to-File risk until the read settles" — and, on the failed-read path,
     beneath "This is a failed read, not a clean program."

     The failure case is the worse one and not only because the contradiction is
     sharper: loading resolves, a failed read does not, so 0/0/0 is the FINAL
     answer the user is left with. And `data-tone={highs.length ? 'err' : …}`
     renders a failed Refuse-to-File read in the visual language of clearance —
     a neutral-toned zero beside the words "High RTF risk". That is the precise
     claim assessmentState exists to make unrepresentable, arriving in the one
     form that reads faster than prose. */
  const kpiReady = filingState !== 'loading' && filingState !== 'unreadable';
  /* `m1Live` is deliberately NOT an input to `filingState` — widening those
     inputs would change what the Refuse-to-File narrative means — so the
     Module 1 tile carries its own gate. */
  const m1Ready = !m1Live.loading && !m1Live.error;
  const kv = (ready: boolean, n: number | string) => (ready ? String(n) : '—');

  /* Each state gets its own sentence. No state borrows another's vocabulary,
     and only `assessed-clear` — unreachable here for the reason above — may
     speak of blockers being absent. */
  const leadCopy: Record<string, { tone: 'calm' | 'urgent' | 'good'; headline: React.ReactNode; body: React.ReactNode }> = {
    loading: {
      tone: 'calm',
      headline: <>Reading this application's filing readiness&hellip;</>,
      body: <>Nothing is being asserted about Refuse-to-File risk until the read settles.</>,
    },
    unreadable: {
      tone: 'urgent',
      headline: <>Filing readiness could not be read.</>,
      body: <>This is a failed read, not a clean program. Nothing here should be taken as an assessment of Refuse-to-File risk. Sign in to your tenant and retry.</>,
    },
    'not-assessed': {
      tone: 'calm',
      headline: modules.length === 0
        ? <>Nothing has been assessed for this application yet.</>
        : <>No Refuse-to-File assessment has been run against this application.</>,
      body: modules.length === 0
        ? <>There is no NDA/BLA submission in scope, so no module readiness, no Module&nbsp;1 worklist and no Refuse-to-File finding exists to report. Create the submission and compile a sequence, and this surface will have something to assess.</>
        : <>{rtf.length === 0
            ? 'The filing-risk log is empty. An empty log is not a clean shadow review — it records only what someone has entered, and no day-60 review has reported against this application.'
            : `${rtf.length} filing-risk ${rtf.length === 1 ? 'item is' : 'items are'} logged, none of them high severity. That is the state of the log, not a verdict on the filing.`} Refuse-to-File risk is unknown until a review runs.</>,
    },
    'assessed-with-findings': {
      tone: 'urgent',
      headline: topHigh
        ? <>You're <b>{overall}% ready</b>, but <b>{topHigh.area.split('·')[1]?.trim() || topHigh.area}</b> would get you refused at the filing door.</>
        : <>You're <b>{overall}% ready</b>, with {rtf.length} filing-risk {rtf.length === 1 ? 'item' : 'items'} open.</>,
      body: topHigh
        ? <>The one that matters right now: {topHigh.text.charAt(0).toLowerCase() + topHigh.text.slice(1)} Clear it &mdash; {topHigh.fix.toLowerCase()}. {gateMod ? <>Module {gateMod.m} at {gateMod.pct}% is the next thing behind it.</> : null}</>
        : <>{openItems} {openItems === 1 ? 'item' : 'items'} to work before you submit. None is currently rated high severity.</>,
    },
    'assessed-clear': {
      tone: 'good',
      headline: <>You're <b>{overall}% ready</b> to file &mdash; the completed review found no Refuse-to-File blockers, {openItems} items to tidy before you submit.</>,
      body: <>The remaining items are administrative, not structural &mdash; close them out and the package is fileable.</>,
    },
  };
  const copy = leadCopy[filingState];

  const lead = (
    <AnswerLead
      tone={copy.tone}
      eyebrow={'Are you ready to file ' + (progName ? 'the ' + progName + ' NDA' : 'this NDA') + ' — and what stands in the way'}
      headline={copy.headline}
      body={copy.body}
      /* Reassurance is gated on the state, not on the absence of findings, and
         additionally on a non-zero completeness — a 0% program is never told it
         is close. Every other state renders no reassurance line at all rather
         than a softened one, because there is nothing truthful to reassure
         about yet. */
      reassure={
        filingState === 'assessed-with-findings'
          ? "This is fixable before Day 74. I'll draft each remediation with you, one at a time."
          : reassuring
            ? "I'll help you close out the last items and assemble the sequence."
            : undefined
      }
      /* No action while the read is unresolved.

         The ternaries below had no `loading` or `unreadable` arm, so both fell
         through to the final one: beneath the headline "Filing readiness could
         not be read", the surface's one focal button offered to draft a FINAL
         READINESS PLAN, and its prompt told AnA to work "the open administrative
         items on this NDA program" — asserting to the model that such items
         exist and are known, off a read that returned nothing. Of everything
         ungated on this surface that is the one with reach beyond it: the other
         claims stay on screen, this one enters the assistant's context and is
         reasoned from.

         Offering nothing is the honest option, and matches the reassurance
         above, which is already withheld in both states. `alt` goes too — it
         navigates to a Refuse-to-File tab that is itself showing a failed
         read. */
      action={!kpiReady ? undefined : {
        label: filingState === 'assessed-with-findings'
          ? 'Fix the filing risks with AnA'
          : filingState === 'not-assessed'
            ? 'Assess Refuse-to-File risk with AnA'
            : 'Draft the final readiness plan',
        onClick: () => ask && ask(
          filingState === 'assessed-with-findings' && topHigh
            ? 'Draft a mitigation plan for the ' + topHigh.area + ' Refuse-to-File risk: ' + topHigh.text
            : filingState === 'not-assessed'
              ? 'Assess this NDA/BLA application for Refuse-to-File triggers against 21 CFR 314.101, and list what evidence is missing before that assessment can be completed'
              : 'Draft the final readiness plan for the open administrative items on this NDA program'),
        alt: { label: 'See Refuse-to-File risks', onClick: () => setTab('rtf') },
      }}
      secondary="Or work the readiness detail below."
    />
  );

  return (
    <div className="cv-body"><div className="reg-wrap">
      <div className="reg-head">
        <div>
          <div className="reg-eyebrow">
            Pharma {I.dot} filing
          </div>
          <h1 className="reg-title">NDA filing cockpit</h1>
          <p className="reg-intro">{progName ? <>{progName} {I.dot} </> : null}The complete application on one surface &mdash; CTD Module 1-5 readiness, the Module 1 administrative set, the PDUFA review clock, and Refuse-to-File risk.</p>
        </div>
        {ask && <button className="reg-cta" onClick={() => ask('Assess filing readiness and the top Refuse-to-File risks for this NDA program')}>{I.sparkles} Assess with AnA</button>}
      </div>

      {lead}

      {/* CmcModule, on the same taxonomy, DELETED its strip rather than gate it
          — "Repeating a figure three times does not make it more true" — and
          two of these four tiles are likewise restatements of figures the lead
          above already narrates. That is a live design option and is recorded
          in the review; it is not taken here, because removing a scannable
          summary is a product decision rather than a defect fix. */}
      <div className="reg-kpis">
        <div className="reg-kpi"><div className="reg-kpi-v">{kpiReady ? `${overall}%` : '—'}</div><div className="reg-kpi-l">Application readiness</div></div>
        {/* "not started" asserted that a clock exists and has not begun. There
            is no review-clock store at all (see the header note), and the clock
            tab below says so in its own words — this label now matches it
            instead of making the stronger, unevidenced claim. */}
        <div className="reg-kpi"><div className="reg-kpi-v">&mdash;</div><div className="reg-kpi-l">Review clock {I.dot} not recorded</div></div>
        {/* The warn tone was hardcoded, so a value of 0 wore it too. */}
        <div className="reg-kpi"><div className="reg-kpi-v" data-tone={m1Ready && m1open ? 'warn' : undefined}>{kv(m1Ready, m1open)}</div><div className="reg-kpi-l">Module 1 admin open</div></div>
        <div className="reg-kpi"><div className="reg-kpi-v" data-tone={kpiReady && highs.length ? 'err' : undefined}>{kv(kpiReady, highs.length)}</div><div className="reg-kpi-l">High RTF risk</div></div>
      </div>

      <div className="reg-tabs">
        {tabs.map(([id, l]) => (
          <button key={id} className={'reg-tab' + (tab === id ? ' on' : '')} onClick={() => setTab(id)}>{l}</button>
        ))}
      </div>

      {tab === 'ctd' && (
        modules.length > 0 ? (
          <div className="nda-mods">
            {modules.map(m => (
              <button key={m.m} className="nda-mod" onClick={() => open('dossier')}>
                <div className="nda-mod-n">M{m.m}</div>
                <div className="nda-mod-b">
                  <div className="nda-mod-top"><span className="nda-mod-l">{m.label}</span><span className="nda-mod-pct">{m.pct}%</span></div>
                  <div className="nda-mod-track"><span className="nda-mod-fill" data-risk={m.gate ? true : undefined} style={{ width: m.pct + '%' }} /></div>
                  <div className="nda-mod-meta">
                    <span>{m.docs} documents {I.dot} {m.open} open</span>
                    {m.gate ? <span className="nda-mod-gate">{I.alertTriangle} {m.gate}</span> : <span className="nda-mod-ok">{I.check} module complete</span>}
                  </div>
                </div>
                <span className="nda-mod-go">{I.arrowRight || I.right}</span>
              </button>
            ))}
          </div>
        ) : modulesLive.loading ? (
          <div className="scaf-note" style={{ padding: '18px 10px' }}>Loading CTD module readiness…</div>
        ) : modulesLive.error ? (
          <EmptyState
            tone="error"
            icon={I.alertTriangle}
            title="Couldn't load CTD module readiness"
            hint="The NDA/BLA submission core didn't respond. Sign in and retry, or check that the NDA cockpit service is reachable."
          />
        ) : (
          <EmptyState
            icon={I.fileText}
            title="No CTD modules yet"
            hint="No NDA/BLA application is provisioned for this organization yet. Once a submission is set up and its eCTD sections are authored, each CTD module's readiness (M1–M5) appears here org-scoped with its real completion and gating items."
          />
        )
      )}

      {tab === 'm1' && (
        <div className="reg-card">
          <div className="reg-card-h"><span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>Module 1 &mdash; administrative &amp; prescribing (21 CFR 314.50)</span><span className="reg-card-s" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>Form 356h + required admin documents<button className="nda-open" onClick={() => setForm('m1')}>{I.plus} Add document</button></span></div>
          {m1.length > 0 ? (
            <table className="reg-tbl">
              <thead><tr><th>Document</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {m1.map(d => (
                  <tr key={d.id} className={d._new ? 'de-row-new' : undefined} data-blocker={d.blocker || undefined}>
                    <td><div className="nda-m1-l">{d.label}</div>{d.note && <div className="nda-m1-note">{d.note}</div>}</td>
                    <td><span className={'reg-pill ' + d.st}>{d.st === 'na' ? 'N/A' : d.st}</span>{d.blocker && <span className="nda-blk">{I.alertTriangle} blocks filing</span>}</td>
                    <td style={{ textAlign: 'right' }}>{d.st !== 'na' && <button className="nda-open" onClick={() => open('dossier')}>Open {I.arrowRight || I.right}</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : m1Live.loading ? (
            <div className="scaf-note" style={{ padding: '18px 10px' }}>Loading Module 1 documents…</div>
          ) : m1Live.error ? (
            <EmptyState
              tone="error"
              icon={I.alertTriangle}
              title="Couldn't load Module 1 documents"
              hint="The Module 1 administrative store didn't respond. Sign in and retry, or check that the NDA cockpit service is reachable."
            />
          ) : (
            <EmptyState
              icon={I.fileText}
              title="No Module 1 documents yet"
              hint="Add the Form FDA 356h and the required administrative documents (21 CFR 314.50). Each appears here org-scoped with its real filing status."
            />
          )}
        </div>
      )}

      {tab === 'clock' && (
        <div className="reg-card">
          <div className="reg-card-h"><span>PDUFA review clock</span><span className="reg-card-s">Runs from FDA receipt of the filed application</span></div>
          <EmptyState
            icon={I.clock || I.fileText}
            title="No review clock recorded"
            hint="The review clock starts when FDA accepts the filing. File the application and record the acceptance, and the filing decision, mid- and late-cycle milestones, and the PDUFA goal date appear here from the real dates — nothing is projected or invented."
          />
        </div>
      )}

      {tab === 'rtf' && (
        <div className="reg-card">
          <div className="reg-card-h"><span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>Refuse-to-File risk &mdash; shadow review of the 60-day filing decision</span><span style={{ display: 'flex', gap: 8 }}><button className="nda-open" onClick={() => setForm('rtf')}>{I.plus} Log risk</button>{ask && <button className="nda-open" onClick={() => ask('Draft a filing-risk mitigation plan for the open NDA Refuse-to-File items')}>{I.sparkles} Mitigation plan</button>}</span></div>
          {rtf.length > 0 ? (
            <div className="nda-rtf">
              {rtf.map((r, i) => (
                <div key={i} className={'nda-rtf-row' + (r._new ? ' de-row-new' : '')} data-sev={r.sev}>
                  <span className="nda-rtf-sev">{r.sev}</span>
                  <div className="nda-rtf-b">
                    <div className="nda-rtf-area">{r.area}</div>
                    <div className="nda-rtf-t">{r.text}</div>
                    <div className="nda-rtf-fix">{I.arrowRight || I.right} {r.fix}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : rtfLive.loading ? (
            <div className="scaf-note" style={{ padding: '18px 10px' }}>Loading Refuse-to-File risks…</div>
          ) : rtfLive.error ? (
            <EmptyState
              tone="error"
              icon={I.alertTriangle}
              title="Couldn't load Refuse-to-File risks"
              hint="The filing-risk store didn't respond. Sign in and retry, or check that the NDA cockpit service is reachable."
            />
          ) : (
            <EmptyState
              icon={I.shieldCheck}
              title="No refuse-to-file items"
              hint="No filing-risk items are logged for this application. Log a risk above to shadow-review the 60-day filing decision, or ask AnA to assess the submission for Refuse-to-File triggers."
            />
          )}
        </div>
      )}

      {tab === 'bla' && (
        <div className="reg-card">
          <div className="reg-card-h">
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              BLA 351(a) biologics &mdash; science-engine assessments
            </span>
            <span className="reg-card-s" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              Analytical similarity · comparability · immunogenicity · filing risk
              {ask && <button className="nda-open" onClick={() => ask('Run the BLA filing-risk (RTF/CRL) assessment for the biologics program and summarize the top triggers')}>{I.sparkles} Assess filing risk</button>}
            </span>
          </div>
          {bla.length > 0 ? (
            <>
              <table className="reg-tbl">
                <thead><tr><th>Assessment</th><th>Modality</th><th>Verdict</th><th>Status</th></tr></thead>
                <tbody>
                  {bla.map(a => (
                    <tr key={a.id}>
                      <td>
                        <div className="nda-m1-l">{BLA_KIND_LABEL[a.kind] || a.kind}</div>
                        {a.title && <div className="nda-m1-note">{a.title}{a.target_agency ? ' · ' + a.target_agency : ''}</div>}
                      </td>
                      <td>{a.modality || '—'}</td>
                      <td>{a.verdict ? <span className={'reg-pill ' + (isPassingBlaVerdict(a.verdict) ? 'complete' : 'review')}>{a.verdict.replace(/_/g, ' ')}</span> : '—'}</td>
                      <td><span className={'reg-pill ' + (a.status === 'signed' ? 'complete' : 'draft')}>{a.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="scaf-note" style={{ marginTop: 10 }}>
                The three biologics science engines (CQA-tiered analytical similarity, Q5E comparability, ADA/NAb
                immunogenicity) and the RTF/CRL filing-risk profile are deterministic functions of the submitted data,
                authored and Part 11-signed in the biologics workbench. This tab reflects
                the org's persisted assessments &mdash; it never fabricates a verdict.
              </p>
            </>
          ) : blaLive.loading ? (
            <div className="scaf-note" style={{ padding: '18px 10px' }}>Loading BLA biologics assessments…</div>
          ) : blaLive.error ? (
            <EmptyState
              tone="error"
              icon={I.alertTriangle}
              title="Couldn't load BLA biologics assessments"
              hint="The biologics assessment store didn't respond. Sign in and retry, or check that the biologics workbench service is reachable."
            />
          ) : (
            <EmptyState
              icon={I.fileText}
              title="No BLA biologics assessments yet"
              hint="No 351(a) biologics assessments have been run for this organization yet. The analytical-similarity, comparability, immunogenicity, and filing-risk engines are authored and Part 11-signed in the biologics workbench; once an assessment is persisted here org-scoped, it appears with its verdict."
            />
          )}
        </div>
      )}

      {form === 'rtf' && <C2CForm config={RTF_FORM} onCancel={() => setForm(null)} onSubmit={submitRtf} />}
      {form === 'm1' && <C2CForm config={M1_FORM} onCancel={() => setForm(null)} onSubmit={submitM1} />}
      <C2CToast msg={toast} />
    </div></div>
  );
}
