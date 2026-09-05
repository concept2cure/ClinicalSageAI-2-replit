import React, { useState, useEffect, useMemo } from 'react';
import { I } from '../icons';
import { liveGetOrNull, EmptyState } from '../dataConnect';
import { apiRequest } from '@/lib/queryClient';
import type { SurfaceViewProps } from '../surfaceViews';
import { usePublishSurfaceContext } from '../surfaceContext';
import { C2CForm } from '../C2CForm';
import type { C2CFormConfig } from '../C2CForm';
import '../styles/project-home-v2.css';
import { C2CToast, useToast } from '../toast';
import { downloadBlob } from '../download';
import { shellProgramName } from '../shellProject';
import { useLiveRows } from '../dataConnect';
import { useSurfaceActionHandlers, notifySurfaceActionReady } from '../surfaceActions';

/* ════ AgencyMeetings — regulator-interaction worklist ════

   Fixture-free by construction (real-data standard). The surface renders the
   org's REAL agency meetings from GET /api/agency-meetings — each row plus its
   nested briefing book and minutes rehydrated from the c2c_agency_meetings
   JSONB columns — or an honest loading / empty / error state. New requests are
   persisted via POST /api/agency-meetings and the surface adopts the row the
   server actually wrote. No fixture, no "Sample data" pill, no local stand-in. */

/** The fields this surface reads off GET /api/c2c/projects to name a programme
 *  in the meeting-request select. The portfolio row carries more; these are the
 *  only three a label is built from. */
interface AmProgramOption {
  id: string;
  code: string;
  title: string;
}

/* -- Render-contract types (shape of GET /api/agency-meetings rows) -- */

interface Meeting {
  id: string;
  type: string;
  agency: string;
  cat: string;
  program: string;
  status: string;
  requested: string | null;
  granted: string | null;
  meets: string | null;
  clock: string;
  format: string;
  goal: string;
  _new?: boolean;
}

interface BbSection {
  n: string;
  label: string;
  st: string;
  focus?: boolean;
}

interface BbQuestion {
  q: string;
  area: string;
  pos: string;
}

interface BriefingBook {
  title: string;
  state: string;
  ver: string;
  owner: string;
  sections: BbSection[];
  questions: BbQuestion[];
}

interface Commitment {
  c: string;
  doc: string;
  due: string;
  st: string;
}

interface Minutes {
  received: string;
  agree: string[];
  commitments: Commitment[];
}

/* live row = a meeting plus its nested briefing book + minutes (JSONB) */
type LiveMeeting = Meeting & {
  briefingBook?: BriefingBook | null;
  minutes?: Minutes | null;
};

/* -- Inline shared helpers -- */

function MtgStat({ children, tone }: { children: React.ReactNode; tone?: string }) {
  return <span className={'mtg-stat ' + (tone || '')}>{children}</span>;
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Pull a YYYY-MM-DD out of a free-text meets/clock string, returning its epoch
 *  ms for ordering — null when the field carries no parseable date. */
function meetEpoch(s: string | null): number | null {
  if (!s) return null;
  const m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const t = Date.parse(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`);
  return Number.isFinite(t) ? t : null;
}

/** "Jul 8" from a free-text date string, built from the matched parts so it is
 *  timezone-stable — null when there is no date to show. */
function meetShort(s: string | null): string | null {
  if (!s) return null;
  const m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return `${MON[parseInt(m[2], 10) - 1]} ${parseInt(m[3], 10)}`;
}

/* ════ AgencyMeetings -- agency meetings & briefing books surface ════ */

export function AgencyMeetings({ onAsk, onNav }: SurfaceViewProps) {
  /* The open programme, named as a person would say it — never a hardcoded
     product. `null` when no programme is open, and every caller below phrases
     its request without one rather than substituting a placeholder: an
     assistant that has to ask which programme beats one confidently answering
     about the wrong one. */
  const program = shellProgramName();

  /* ── The Programme select offered five invented programmes ─────────────────
     `['BX-204 · IND', 'BX-204 · NDA', 'BX-204 · MAA', 'AltexaTab · NDA',
     'Aurora CGM · 510(k)']` — a required field, so every customer requesting an
     agency meeting had to file it against a demo product. The real portfolio is
     one read away (GET /api/c2c/projects, the same list the Projects surface
     renders) and was never asked for.

     An org with no programmes gets no options and the field says so, rather
     than a list of somebody's fictional pipeline. */
  const portfolio = useLiveRows<AmProgramOption>('/api/c2c/projects');
  const programOptions = portfolio.rows
    .map((p) => {
      const label = [p.code, p.title].filter((v) => String(v ?? '').trim()).join(' · ');
      return label || String(p.id ?? '');
    })
    .filter(Boolean);

  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [bbMap, setBbMap] = useState<Record<string, BriefingBook>>({});
  const [minMap, setMinMap] = useState<Record<string, Minutes>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sel, setSel] = useState('');
  const [form, setForm] = useState(false);
  const [toast, fireToast] = useToast();
  const m = meetings.find((x) => x.id === sel) || meetings[0];

  /* AnA can open a meeting by id or a distinctive phrase (agency / type /
     program) — the same row click a person makes — so a drive can land on a
     specific meeting's briefing book and minutes. Resolved against the REAL
     meetings with honest misses; held (retry) while the list loads, re-attempted
     on the ready signal below. Requesting or scheduling a meeting stays governed;
     this only opens one. */
  useSurfaceActionHandlers('agency-meetings', {
    'agency-meetings.select-meeting': (params) => {
      const raw = String(params.meeting ?? '').trim();
      if (!raw) return { ok: false, reason: 'Name a meeting by its id or a distinctive phrase.' };
      if (loading) return { ok: false, reason: 'The agency meetings are still loading.', retry: true };
      if (error) return { ok: false, reason: 'The agency meetings did not load, so there are none to open.' };
      if (meetings.length === 0) return { ok: false, reason: 'No agency meetings are recorded in this organization yet.' };
      const needle = raw.toLowerCase();
      const exact = meetings.filter((x) => x.id.toLowerCase() === needle);
      const hits = exact.length
        ? exact
        : meetings.filter((x) => `${x.agency} ${x.type} ${x.program} ${x.cat}`.toLowerCase().includes(needle));
      if (hits.length === 0) return { ok: false, reason: `No agency meeting matching "${raw}".` };
      if (hits.length > 1) return { ok: false, reason: `"${raw}" matches ${hits.length} meetings — use the exact id.` };
      const x = hits[0];
      if (sel === x.id) return { ok: true, detail: `Already on ${x.agency} ${x.type}` };
      setSel(x.id);
      return { ok: true, detail: `Opened ${x.agency} ${x.type} — ${x.program}` };
    },
  });
  useEffect(() => {
    if (!loading && !error) notifySurfaceActionReady('agency-meetings');
  }, [loading, error]);

  const addMeeting = (r: Meeting) => {
    const row = { ...r, _new: true };
    setMeetings((rs) => [row, ...rs]);
    setTimeout(
      () => setMeetings((rs) => rs.map((x) => (x === row ? { ...x, _new: false } : x))),
      1500,
    );
  };

  /* Fixture-free read: adopt the org's REAL agency meetings (and each row's
     nested briefing book + minutes from the c2c_agency_meetings JSONB columns).
     A failed fetch is an honest error; a successful zero-row load is an honest
     empty — never a codebase fixture. Local form-added rows are the actual
     server-persisted rows returned by the POST, not stand-ins. */
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    liveGetOrNull<LiveMeeting[]>('/api/agency-meetings').then((res) => {
      if (cancelled) return;
      if (res.error) {
        setError(res.error);
        setLoading(false);
        return;
      }
      const list = Array.isArray(res.data) ? res.data : [];
      setMeetings(list.map(({ briefingBook: _bb, minutes: _mn, ...row }) => row));
      const bb: Record<string, BriefingBook> = {};
      const mn: Record<string, Minutes> = {};
      for (const r of list) {
        if (r.briefingBook) bb[r.id] = r.briefingBook;
        if (r.minutes) mn[r.id] = r.minutes;
      }
      setBbMap(bb);
      setMinMap(mn);
      if (list.length > 0) setSel((cur) => (list.some((s) => s.id === cur) ? cur : list[0].id));
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  /* ── The briefing-book PDF button was decoration ──────────────────────────
     `<button className="reg-mini">{I.download} PDF</button>` — a download icon,
     the word PDF, and no onClick. The renderer has existed the whole time:
     POST /api/ind-lifecycle/briefing-book/pdf streams a navigable PDF from
     renderBriefingBookPdf(assembleBriefingBook(b)).

     Two real gaps had to be closed rather than papered over.

     MEETING TYPE. The renderer accepts four FDA types (pre_ind, type_a, type_b,
     type_c). This surface offers ten, including EMA Scientific Advice and a
     device Q-Sub, which that renderer does not model. The four that correspond
     are mapped; the rest are REFUSED by name. Rendering an EMA briefing package
     through an FDA template would produce a document that looks filed and is
     wrong, which on this surface is the expensive kind of wrong.

     INDICATION. The renderer requires it and `c2c_agency_meetings` has no such
     column (server/routes/agency-meetings.routes.ts), so there is nothing to
     read. It is asked for at download time instead of being guessed from the
     meeting's free-text `goal` — a briefing book states the indication to the
     agency, and inferring it from an objective line is exactly the fabrication
     the house rule forbids. Not persisted, because there is no column to
     persist it to; adding one is a migration, not this fix. */
  const FDA_MEETING_TYPES: Record<string, string> = {
    'pre-ind': 'pre_ind',
    'type a': 'type_a',
    'type b': 'type_b',
    'type c': 'type_c',
  };

  const [pdfFor, setPdfFor] = useState<{ m: Meeting; bb: BriefingBook } | null>(null);

  const PDF_FORM: C2CFormConfig = {
    eyebrow: 'Briefing book · render',
    title: 'Render the briefing book',
    governed:
      'The indication is stated to the agency on the briefing book cover. It is not stored on the meeting record, so it is asked for here rather than inferred.',
    submitLabel: 'Download PDF',
    fields: [
      {
        key: 'indication',
        label: 'Indication',
        type: 'text',
        placeholder: 'The indication as it should read to the agency',
        required: true,
      },
    ],
  };

  const renderBriefingBookPdf = async (v: Record<string, string>) => {
    const ctx = pdfFor;
    setPdfFor(null);
    if (!ctx) return;
    const indication = (v.indication || '').trim();
    if (!indication) return;
    try {
      const res = await apiRequest('POST', '/api/ind-lifecycle/briefing-book/pdf', {
        productName: ctx.m.program,
        indication,
        meetingType: FDA_MEETING_TYPES[ctx.m.type.trim().toLowerCase()],
        // The renderer numbers these itself; it needs the text and its area.
        questions: ctx.bb.questions.map((q, i) => ({
          number: i + 1,
          question: q.q,
          area: q.area,
          sponsorPosition: q.pos,
        })),
      });
      if (!res.ok) {
        fireToast('Could not render the briefing book PDF — the server refused the request.', 'error');
        return;
      }
      downloadBlob('fda-briefing-book.pdf', await res.blob());
    } catch (e) {
      fireToast(
        'Could not render the briefing book PDF — ' + (e instanceof Error ? e.message : String(e)) + '.',
        'error',
      );
    }
  };

  /** Open the render dialog, or say plainly why this meeting cannot use it. */
  const startBriefingBookPdf = (m: Meeting, bb: BriefingBook) => {
    if (!FDA_MEETING_TYPES[m.type.trim().toLowerCase()]) {
      fireToast(
        `The briefing-book renderer covers FDA Pre-IND and Type A/B/C meetings. "${m.type}" is not one of them, so no PDF is produced rather than an FDA-shaped document for the wrong agency.`,
        'error',
      );
      return;
    }
    if (!bb.questions.length) {
      fireToast('This briefing book has no questions yet — a briefing book without questions has nothing to render.', 'error');
      return;
    }
    setPdfFor({ m, bb });
  };

  const MTG_FORM: C2CFormConfig = {
    eyebrow: 'Agency interaction · new request',
    title: 'Request an agency meeting',
    governed:
      'A meeting request is a governed interaction — the request and its briefing-book plan are recorded with an audit entry.',
    submitLabel: 'Create request',
    fields: [
      {
        key: 'type', label: 'Meeting type', type: 'select',
        options: ['Pre-IND', 'INTERACT', 'Type A', 'Type B', 'Type C', 'End-of-Phase-2', 'Pre-NDA', 'Pre-BLA', 'Pre-Submission (Q-Sub)', 'Scientific Advice'],
        required: true,
      },
      {
        key: 'agency', label: 'Agency', type: 'select',
        options: ['FDA · CDER', 'FDA · CBER', 'FDA · CDRH', 'EMA · CHMP/SAWP', 'PMDA', 'Health Canada', 'MHRA'],
        required: true, half: true,
      },
      { key: 'cat', label: 'Category', type: 'text', placeholder: 'e.g. Type B', half: true },
      {
        key: 'program', label: 'Program', type: 'select',
        options: programOptions,
        // Prefer the programme the user already has open — it is almost always
        // the one they are requesting the meeting for.
        default: programOptions.find((o) => program && o.includes(program)) ?? programOptions[0],
        required: true,
        desc: portfolio.loading
          ? 'Loading your programmes…'
          : portfolio.error
            ? 'Your programmes could not be read, so none are listed here. Retry, or create the meeting once the list loads.'
            : programOptions.length === 0
              ? 'No programmes are recorded for your organization yet. Create one in Projects and it appears here.'
              : undefined,
      },
      {
        key: 'format', label: 'Format', type: 'select',
        options: ['Face-to-face', 'Teleconference', 'Written responses only', 'Written responses + teleconference'],
        default: 'Teleconference', half: true,
      },
      { key: 'requested', label: 'Requested date', type: 'date', half: true },
      { key: 'goal', label: 'Meeting objective', type: 'textarea', placeholder: 'What alignment are you seeking?', required: true },
    ],
  };

  /* Persist the request org-scoped and adopt the row the server actually wrote
     (its real id/fields). On any failure, add nothing and toast honestly —
     never claim a save that did not happen, and never insert a local stand-in. */
  const submitMtg = async (v: Record<string, string>) => {
    setForm(false);
    try {
      const res = await apiRequest('POST', '/api/agency-meetings', {
        type: v.type,
        agency: v.agency,
        cat: v.cat || v.type,
        program: v.program,
        format: v.format,
        requested: v.requested || '',
        goal: v.goal,
      });
      if (!res.ok) {
        fireToast('Could not save meeting request · signed in?', 'error');
        return;
      }
      const payload = await res.json().catch(() => null);
      const row = payload?.data as LiveMeeting | undefined;
      if (!row || !row.id) {
        fireToast('Could not save meeting request · signed in?', 'error');
        return;
      }
      const { briefingBook: _bb, minutes: _mn, ...meeting } = row;
      addMeeting(meeting as Meeting);
      setSel(row.id);
      fireToast('Meeting request created · ' + row.type);
    } catch (e) {
      fireToast(
        'Could not save meeting request · ' +
          (e instanceof Error && e.message ? e.message : 'signed in?'),
        'error',
      );
    }
  };

  const bb: BriefingBook | undefined = bbMap[sel];
  const min: Minutes | undefined = minMap[sel];
  const stTone: Record<string, string> = { granted: 'ok', held: 'ok', requested: 'warn', planned: 'idle' };
  const ssTone: Record<string, string> = { approved: 'ok', review: 'warn', draft: 'idle', final: 'ok' };

  /* KPIs derived from the REAL rows only (never hardcoded). The "next" meeting
     is the soonest-dated one still ahead (falling back to the soonest overall);
     open questions/commitments roll up the nested briefing books and minutes. */
  const dated = meetings
    .map((x) => ({ x, t: meetEpoch(x.meets) }))
    .filter((d): d is { x: Meeting; t: number } => d.t !== null)
    .sort((a, b) => a.t - b.t);
  const nowMs = Date.now();
  const nextMtg = dated.find((d) => d.t >= nowMs) ?? dated[0];
  const nextVal = nextMtg ? meetShort(nextMtg.x.meets) ?? '--' : '--';
  const openQuestions = Object.values(bbMap).reduce(
    (n, b) => n + (Array.isArray(b.questions) ? b.questions.length : 0),
    0,
  );
  const openCommitments = Object.values(minMap).reduce(
    (n, mn2) =>
      n +
      (Array.isArray(mn2.commitments)
        ? mn2.commitments.filter((c) => c.st === 'open').length
        : 0),
    0,
  );
  const ready = !loading && !error;
  const kv = (n: number | string) => (ready ? String(n) : '--');

  /* What AnA can see of this screen. "Prepare with AnA" sits in this header and
     asks her to draft a Pre-IND request — until now with no knowledge of which
     meetings exist, which are granted, or what the open commitments are.

     A FAILED read publishes the failure: `meetings` is [] on error as well as
     when the org tracks none, and telling a sponsor they have no regulator
     interactions because a fetch failed is a claim about their agency record. */
  const anaContext = useMemo(() => {
    if (loading) {
      return { summary: 'Agency meetings are still loading; nothing on screen is final yet.' };
    }
    if (error) {
      return {
        summary:
          'The agency-meetings store could not be read, so this screen is showing no regulator ' +
          'interactions because of a failure, not because none are tracked.',
        availableActions: ['Retry the agency-meetings read'],
      };
    }
    return {
      summary:
        `Agency meetings and briefing books: ${meetings.length} regulator interaction(s), ` +
        `${openQuestions} question(s) to agencies across the briefing books, ${openCommitments} open ` +
        `commitment(s)` +
        (nextMtg ? `. Next up is the ${nextMtg.x.type} with ${nextMtg.x.agency} on ${nextVal}` : '') +
        (m ? `. "${m.type} — ${m.agency}" (${m.program}) is selected.` : '.'),
      facts: {
        meetingCount: meetings.length,
        openQuestions,
        openCommitments,
        nextMeeting: nextMtg
          ? { id: nextMtg.x.id, type: nextMtg.x.type, agency: nextMtg.x.agency, program: nextMtg.x.program, meets: nextMtg.x.meets }
          : null,
        meetings: meetings.slice(0, 12).map((x) => ({
          id: x.id, type: x.type, agency: x.agency, category: x.cat, program: x.program,
          status: x.status, requested: x.requested, granted: x.granted, meets: x.meets,
          clock: x.clock, format: x.format,
        })),
        selected: m
          ? {
              id: m.id, type: m.type, agency: m.agency, program: m.program, status: m.status,
              clock: m.clock, format: m.format,
              // The meeting `goal`, the verbatim agency `questions` and sponsor
              // `positions`, and the minute `agreements` / commitment text are
              // substantial user-authored free-text prose — a prompt-injection
              // surface the sibling HaqManager already withholds for exactly
              // this reason. Section states, question areas/counts, and
              // commitment references/dates/states carry the grounding; the
              // prose stays on screen.
              briefingBook: bb
                ? {
                    title: bb.title, state: bb.state, version: bb.ver, owner: bb.owner,
                    sections: (bb.sections ?? []).map((sn) => ({ number: sn.n, label: sn.label, state: sn.st })),
                    questionCount: (bb.questions ?? []).length,
                    questionAreas: (bb.questions ?? []).map((qq) => qq.area),
                  }
                : null,
              minutes: min
                ? {
                    received: min.received,
                    agreementCount: (min.agree ?? []).length,
                    commitments: (min.commitments ?? []).map((c) => ({ document: c.doc, due: c.due, state: c.st })),
                  }
                : null,
            }
          : null,
      },
      availableActions: [
        'Select a meeting to read its briefing book, minutes and commitments',
        'Request a new agency meeting (a governed interaction — the request is audit-logged)',
        'Read the open questions to agencies and the open post-meeting commitments',
      ],
    };
  }, [loading, error, meetings, openQuestions, openCommitments, nextMtg, nextVal, m, bb, min]);
  usePublishSurfaceContext('agency-meetings', anaContext);

  return (
    <div className="page-inner reg">
      <div className="reg-head">
        <div>
          <div className="reg-eyebrow">Platform · agency interactions</div>
          <h1 className="reg-title">Meetings &amp; briefing books</h1>
          <p className="reg-sub">
            The regulator interactions that gate a program — Pre-IND, INTERACT,
            Type A/B/C/D, EOP2, pre-NDA/BLA, device Q-Sub, EMA Scientific
            Advice. Each is built around a briefing book and resolves to minutes
            and commitments that flow into the dossier.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <button className="reg-cta" onClick={() => setForm(true)}>
            {I.plus} Request meeting
          </button>
          {onAsk && (
            <button
              className="reg-cta sm"
              onClick={() =>
                onAsk(
                  program
                    ? `Draft a Pre-IND meeting request and briefing book for ${program}`
                    : 'Draft a Pre-IND meeting request and briefing book for my programme',
                )
              }
            >
              {I.sparkles} Prepare with AnA
            </button>
          )}
        </div>
      </div>

      <div className="reg-kpis">
        <div className="reg-kpi">
          <div className="reg-kpi-v">{kv(meetings.length)}</div>
          <div className="reg-kpi-l">Meetings</div>
        </div>
        <div className="reg-kpi">
          <div className="reg-kpi-v" data-tone="warn">
            {ready ? nextVal : '--'}
          </div>
          <div className="reg-kpi-l">
            {ready && nextMtg ? 'Next -- ' + nextMtg.x.type : 'Next meeting'}
          </div>
        </div>
        <div className="reg-kpi">
          <div className="reg-kpi-v">{kv(openQuestions)}</div>
          <div className="reg-kpi-l">Open questions to agencies</div>
        </div>
        <div className="reg-kpi">
          <div className="reg-kpi-v" data-tone={openCommitments > 0 ? 'warn' : undefined}>
            {kv(openCommitments)}
          </div>
          <div className="reg-kpi-l">Open commitments</div>
        </div>
      </div>

      {loading ? (
        <div className="reg-sub2" style={{ padding: '18px 14px' }}>
          Loading agency meetings…
        </div>
      ) : error ? (
        <EmptyState
          tone="error"
          icon={I.alertTriangle}
          title="Couldn't load agency meetings"
          hint="The agency-meetings store didn't respond. These are your organization's regulator interactions — sign in and retry, or check the service is reachable."
        />
      ) : meetings.length === 0 ? (
        <EmptyState
          icon={I.calendar}
          title="No agency meetings tracked yet"
          hint={
            <>
              Request your first regulator interaction to build its briefing book
              and track its clock, minutes and commitments. Requests are persisted
              via <span className="mono">Request a meeting</span> — or ask
              AnA to prepare a Pre-IND package with you.
            </>
          }
        />
      ) : (
      <div className="mtg-split">
        <div className="mtg-list">
          {meetings.map((x) => (
            <button
              key={x.id}
              className={
                'mtg-card' +
                (x.id === sel ? ' on' : '') +
                (x._new ? ' de-row-new' : '')
              }
              onClick={() => setSel(x.id)}
            >
              <div className="mtg-card-top">
                <span className="mtg-cat">{x.cat}</span>
                <MtgStat tone={stTone[x.status]}>{x.status}</MtgStat>
              </div>
              <div className="mtg-card-t">{x.type}</div>
              <div className="mtg-card-m">
                {x.agency} · {x.program}
              </div>
              <div className="mtg-card-clock">
                {I.clock} {x.meets || x.clock}
              </div>
            </button>
          ))}
        </div>

        <div className="mtg-detail">
          <div className="mtg-dh">
            <div>
              <div className="mtg-dh-t">
                {m.type} · {m.program}
              </div>
              <div className="mtg-dh-m">
                {m.agency} · {m.cat} · {m.format}
              </div>
            </div>
            <MtgStat tone={stTone[m.status]}>{m.status}</MtgStat>
          </div>
          <div className="mtg-goal">
            {I.target || I.flag} {m.goal}
          </div>
          <div className="mtg-clockline">
            <span>
              {I.clock} {m.clock}
            </span>
            {m.requested && <span>Requested {m.requested}</span>}
            {m.granted && <span>Granted {m.granted}</span>}
            {m.meets && <span>Meets {m.meets}</span>}
          </div>

          {bb ? (
            <div className="mtg-bb">
              <div className="mtg-bb-h">
                <span className="mtg-bb-l">
                  {I.book || I.fileText} Briefing book · {bb.ver} · {bb.state} ·{' '}
                  {bb.owner}
                </span>
                <div className="mtg-bb-acts">
                  <button
                    className="reg-mini"
                    onClick={() => onNav && onNav('dossier')}
                  >
                    {I.fileText} Open document
                  </button>
                  <button
                    className="reg-mini"
                    onClick={() => startBriefingBookPdf(m, bb)}
                    title="Render this briefing book to a navigable PDF"
                    data-testid="mtg-bb-pdf"
                  >
                    {I.download} PDF
                  </button>
                </div>
              </div>
              <div className="mtg-bb-secs">
                {bb.sections.map((s) => (
                  <div
                    key={s.n}
                    className={'mtg-sec' + (s.focus ? ' focus' : '')}
                  >
                    <span className="mtg-sec-n">{s.n}</span>
                    <span className="mtg-sec-l">{s.label}</span>
                    <MtgStat tone={ssTone[s.st]}>{s.st}</MtgStat>
                  </div>
                ))}
              </div>
              <div className="mtg-q-h">Questions to the agency</div>
              {bb.questions.map((q, i) => (
                <div key={i} className="mtg-q">
                  <div className="mtg-q-top">
                    <span className="mtg-q-area">{q.area}</span>
                  </div>
                  <div className="mtg-q-q">{q.q}</div>
                  <div className="mtg-q-pos">
                    {I.arrowRight} Our position: {q.pos}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mtg-empty">
              <div className="mtg-empty-i">{I.book || I.fileText}</div>
              <div className="mtg-empty-t">No briefing book yet</div>
              <div className="mtg-empty-d">
                {m.status === 'requested'
                  ? 'Meeting requested — draft the briefing book now so it is ready when the Agency grants.'
                  : 'Start the briefing book for this interaction.'}
              </div>
              {onAsk && (
                <button
                  className="reg-cta sm"
                  onClick={() =>
                    onAsk(
                      'Draft the briefing book for the ' +
                        m.type +
                        ' meeting on ' +
                        m.program,
                    )
                  }
                >
                  {I.sparkles} Draft briefing book with AnA
                </button>
              )}
            </div>
          )}

          {min && (
            <div className="mtg-min">
              <div className="mtg-min-h">
                {I.checkCircle || I.check} Meeting minutes · received{' '}
                {min.received}
              </div>
              <div className="mtg-min-sub">Agency agreements</div>
              <ul className="mtg-min-list">
                {min.agree.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
              <div className="mtg-min-sub">Commitments arising</div>
              {min.commitments.map((c, i) => (
                <div key={i} className="mtg-commit" data-st={c.st}>
                  <span className="mtg-commit-c">{c.c}</span>
                  <span className="mtg-commit-meta">
                    &rarr; {c.doc} · {c.due}
                  </span>
                  <MtgStat tone={c.st === 'open' ? 'warn' : 'ok'}>
                    {c.st}
                  </MtgStat>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      )}

      {form && (
        <C2CForm
          config={MTG_FORM}
          onCancel={() => setForm(false)}
          onSubmit={submitMtg}
        />
      )}
      {pdfFor && (
        <C2CForm
          config={PDF_FORM}
          onCancel={() => setPdfFor(null)}
          onSubmit={renderBriefingBookPdf}
        />
      )}
      <C2CToast msg={toast} />
    </div>
  );
}
