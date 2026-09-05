import React, { useState, useMemo, useEffect, useRef } from 'react';

import { usePublishSurfaceContext } from '../surfaceContext';
import { useSurfaceActionHandlers, notifySurfaceActionReady } from '../surfaceActions';
import { I } from '../icons';
import { useLiveRows, EmptyState } from '../dataConnect';
import { apiRequest, serverMessage } from '@/lib/queryClient';
import { AnswerLead } from '../AnswerLead';
import type { SurfaceViewProps } from '../surfaceViews';
import '../styles/project-home-v2.css';
// composeSafetyNarrative is a deterministic ICH E3 §16 generator and SaeCase is a
// type — both retained (real computed output / types, not fixture data). Only the
// SAE_CASES fixture array is dropped; the worklist now loads from the real backend.
import { composeSafetyNarrative } from '../fixtures/safety-narrative-data';
import type { SaeCase } from '../fixtures/safety-narrative-data';
import { C2CToast, useToast } from '../toast';

/* -- Constants -- */

const CRITERIA = ['death', 'life-threatening', 'hospitalization', 'disability', 'congenital anomaly', 'medically important'];
const OUTCOMES = ['recovered', 'recovering', 'recovered with sequelae', 'not recovered', 'fatal', 'unknown'];
const CAUSALITIES = ['related', 'probably related', 'possibly related', 'unlikely related', 'not related'];

/* The GET /api/safety-narratives/cases display contract. Extends the structured
   SaeCase with the expedited-reporting-clock fields the route computes server-side
   per 21 CFR 312.32(c) / ICH E2A (server/services/pv/expedited-reporting-clock.ts).
   The backend returns these on every real row (the stored due/clock columns are
   kept alongside them); the nullable clock fields are `| null` and rendered
   null-safe. */
type LiveSaeCase = SaeCase & {
  /* Case facts the assembler returns that `SaeCase` (the composer's input
     shape) does not declare, because the composer does not read them. The
     save path does — `expectedness` is one of the four inputs to the expedited
     clock, so a version that dropped it would silently reset it. */
  awarenessDate?: string;
  expectedness?: string;
  reportingCategory?: '7-day' | '15-day' | 'none';
  reportingClockStart?: string | null;
  reportingDueDate?: string | null;
  reportingDaysRemaining?: number | null;
  reportingOverdue?: boolean;
  reportingBasis?: string;
};

/* Stable empty seed for the local editable store while the live worklist is
   loading or on error — useLiveRows synthesizes a fresh [] every render in those
   states, which would otherwise thrash the re-seed effect into a render loop. */
const EMPTY_CASES: LiveSaeCase[] = [];

/* ================================================================
   SafetyNarrative -- SAE case-narrative writer (ICH E3 section 16).
   The generated narrative IS the hero deliverable, not a dashboard.
   Registers as SURFACE_VIEWS['safety-narrative'].
   ================================================================ */

export function SafetyNarrative({ onAsk, onNav }: SurfaceViewProps) {
  const ask = onAsk;

  /* Real SAE case worklist. GET /api/safety-narratives/cases is assembled from the
     real, org-scoped pharmacovigilance store (adverse_events — the table
     pharmacovigilanceService writes) and computes each row's 21 CFR 312.32(c) / ICH
     E2A expedited-reporting clock live from the case facts. useLiveRows unwraps the
     { data } envelope into real cases, an honest empty (an unprovisioned store fails
     closed to []), or an honest error (no org / unreachable) — never a fixture. */
  const live = useLiveRows<LiveSaeCase>('/api/safety-narratives/cases');
  /* Feed the editable store a STABLE empty seed while loading / on error (see
     EMPTY_CASES) so the re-seed effect below doesn't loop. */
  const seed = live.loading || live.error ? EMPTY_CASES : live.rows;

  /* Local editable copy. Field edits (setField / toggleCrit) are in-memory
     drafting that re-runs the deterministic ICH E3 §16 composer over the selected
     case; there is no case-write endpoint, so edits are not persisted (and the
     surface never claims they are). Re-seed when the live rows resolve — their
     identity changes once the fetch settles. */
  const [cases, setCases] = useState<LiveSaeCase[]>(seed);
  const [selId, setSelId] = useState<string>(seed[0]?.id ?? '');
  const seedRef = useRef(seed);
  useEffect(() => {
    if (seed !== seedRef.current) {
      seedRef.current = seed;
      setCases(seed);
      setSelId(seed[0]?.id ?? '');
    }
  }, [seed]);

  const [toast, fire] = useToast();

  /* AnA can open any SAE case from the worklist by its id or study id — the same
     row click a person makes — so a drive can land on a specific case before its
     narrative is discussed. Editing the narrative stays a human act; this only
     selects. Resolved against the REAL worklist with honest misses; held (retry)
     while it loads, re-attempted on the ready signal below. */
  useSurfaceActionHandlers('safety-narrative', {
    'safety-narrative.select-case': (params) => {
      const raw = String(params.case ?? '').trim();
      if (!raw) return { ok: false, reason: 'Name a case by its id or study id.' };
      if (live.loading) return { ok: false, reason: 'The SAE worklist is still loading.', retry: true };
      if (live.error) return { ok: false, reason: 'The SAE worklist did not load, so there are no cases to open.' };
      if (cases.length === 0) return { ok: false, reason: 'No SAE cases are recorded in this worklist yet.' };
      const needle = raw.toLowerCase();
      const byId = cases.filter((c) => c.id.toLowerCase() === needle);
      const byStudy = cases.filter((c) => (c.studyId ?? '').toLowerCase() === needle);
      const hits = byId.length ? byId
        : byStudy.length ? byStudy
        : cases.filter((c) => c.id.toLowerCase().includes(needle));
      if (hits.length === 0) return { ok: false, reason: `No SAE case matching "${raw}".` };
      if (hits.length > 1) return { ok: false, reason: `"${raw}" matches ${hits.length} cases — name one exactly.` };
      const c = hits[0];
      if (selId === c.id) return { ok: true, detail: `Already on case ${c.id}` };
      setSelId(c.id);
      return { ok: true, detail: `Opened case ${c.id}` };
    },
  });
  useEffect(() => {
    if (!live.loading && !live.error) notifySurfaceActionReady('safety-narrative');
  }, [live.loading, live.error]);

  const sel = cases.find((c) => c.id === selId) || cases[0];
  const result = useMemo(() => (sel ? composeSafetyNarrative(sel) : null), [sel]);
  const nMissing = result ? result.missingFields.length : 0;

  /* What AnA can see of this screen.
     She knew the user was on "safety-narrative" and not which SAE case was
     open, how close its expedited-reporting clock was, or which ICH E3 §16
     fields were still missing — so the questions this surface exists to
     provoke ("is this filable?") could only be answered by the user retyping
     their own screen.

     A failed read publishes the failure. `live.rows` is empty both when the
     pharmacovigilance queue is genuinely clear and when the read threw, and
     "0 cases" over an outage would tell a safety reviewer their queue is empty
     when it is unknown — the one thing this surface must never do. */
  const anaContext = useMemo(() => {
    if (live.loading) {
      return { summary: 'The SAE case queue is still loading; nothing on screen is final yet.' };
    }
    if (live.error) {
      return {
        summary:
          'The SAE case queue could not be read, so this screen shows no cases because of a failure, not because the queue is clear.',
        availableActions: ['Retry the case-queue read'],
      };
    }
    const serious = cases.filter((c) => (c.event?.seriousnessCriteria || []).length).length;
    const soonest = cases.slice().sort((a, b) => a.dueDays - b.dueDays)[0] ?? null;
    return {
      summary:
        `Safety narratives: ${cases.length} SAE case(s), ${serious} meeting a seriousness criterion` +
        (soonest ? `; soonest reporting clock ${soonest.id} due in ${soonest.dueDays} day(s)` : '') +
        (sel ? `; case ${sel.id} open with ${nMissing} required field(s) still missing` : ''),
      facts: {
        caseCount: cases.length,
        seriousCount: serious,
        soonestDue: soonest ? { id: soonest.id, dueDays: soonest.dueDays, clock: soonest.clock } : null,
        selected: sel
          ? {
              id: sel.id, studyId: sel.studyId ?? null, dueDays: sel.dueDays, clock: sel.clock,
              seriousnessCriteria: sel.event?.seriousnessCriteria ?? [],
              missingRequiredFields: result ? result.missingFields : [],
            }
          : null,
      },
      availableActions: [
        'Open an SAE case to see its narrative and its reporting clock',
        'Complete a missing ICH E3 §16 field on the selected case and save it under an audited reason for change',
        'QC the composed narrative before handing it off',
      ],
    };
  }, [live.loading, live.error, cases, sel, result, nMissing]);
  usePublishSurfaceContext('safety-narrative', anaContext);

  /* Answer-first lead -- context-aware to the real queue and clocks.
     `event` is typed required on SaeCase but is a joined sub-record on the wire:
     a case row whose event facts haven't landed yet arrives with it absent, so
     every read of it here and below is `?.` — the same allowance the composer
     already makes (`input.event || {}`). */
  const lead = useMemo(() => {
    if (!sel || cases.length === 0) return null;
    const serious = cases.filter((c) => (c.event?.seriousnessCriteria || []).length).length;
    const soonest = cases.slice().sort((a, b) => a.dueDays - b.dueDays)[0];
    const urgent = soonest && soonest.dueDays <= 3;
    return {
      tone: (urgent ? 'urgent' : 'calm') as 'urgent' | 'calm',
      head: urgent
        ? `${soonest.id} is due in ${soonest.dueDays} days -- ${soonest.clock}`
        : `${cases.length} case narratives in progress -- ${serious} serious`,
      body: urgent
        ? `The clock that matters right now is ${soonest.id}${sel.studyId ? ` (${sel.studyId})` : ''}. Its narrative is drafted from the case facts below — complete any missing fields, QC it, and it's ready to file. You have time; work the most urgent one first.`
        : 'Each SAE narrative here is written deterministically from the structured case — the same facts, the same ICH E3 section 16 convention, every time. Nothing is invented. Pick a case, complete what\'s missing, and hand it off.',
      next: urgent
        ? `Finish ${soonest.id} and send it for medical review`
        : `Complete ${sel.id} and attach it to the safety dossier`,
    };
  }, [cases, sel]);

  const setField = (path: string, val: string | string[]) => {
    if (!sel) return;
    setCases((cs) =>
      cs.map((c) => {
        if (c.id !== sel.id) return c;
        const nc = { ...c, event: { ...c.event } };
        if (path.startsWith('event.')) (nc.event as Record<string, unknown>)[path.slice(6)] = val;
        else (nc as Record<string, unknown>)[path] = val;
        return nc;
      }),
    );
  };

  const toggleCrit = (crit: string) => {
    if (!sel) return;
    /* Same absent-`event` allowance as the render below — a case selected before
       its event facts landed has no criteria to toggle off, only on. */
    const cur = sel.event?.seriousnessCriteria || [];
    setField('event.seriousnessCriteria', cur.includes(crit) ? cur.filter((x) => x !== crit) : cur.concat([crit]));
  };

  /* ── "Save version" ────────────────────────────────────────────────────────
     This button fired the toast "Narrative versioning isn't wired to the safety
     store yet — nothing was saved", and that was true: a safety writer
     completed the structured case, composed the ICH E3 §16 narrative, and lost
     every edit on reload. PATCH /api/safety-narratives/cases/:id is now that
     write.

     What is sent is the structured case AND the composed narrative, under a
     required reason for change — a causality or seriousness edit can move a
     case between a 7-day and a 15-day expedited obligation, so the audit trail
     records the grounds alongside both sides of every changed field. The saved
     case comes back with its clock RECOMPUTED by the server, and it replaces
     the local copy, so the writer sees the deadline their edit produced rather
     than the one they started with. */
  const [saveReason, setSaveReason] = useState('');
  const [saving, setSaving] = useState(false);
  const saveVersion = async () => {
    if (!sel || !result || saving) return;
    if (saveReason.trim().length < 8) {
      fire('Enter a reason for change (at least 8 characters) before saving this version.', 'error');
      return;
    }
    setSaving(true);
    try {
      const res = await apiRequest('PATCH', `/api/safety-narratives/cases/${encodeURIComponent(sel.id)}`, {
        reasonForChange: saveReason.trim(),
        fields: {
          causality: sel.event?.causality ?? null,
          outcome: sel.event?.outcome ?? null,
          expectedness: sel.expectedness ?? null,
          reactionPt: sel.event?.term ?? null,
          onsetDate: sel.event?.onsetDate ?? null,
          seriousnessCriteria: sel.event?.seriousnessCriteria ?? [],
          narrative: result.narrative,
        },
      });
      const json = (await res.json().catch(() => null)) as { data?: LiveSaeCase } | null;
      if (!res.ok || !json?.data) {
        fire(
          'The version was not saved — ' +
            (serverMessage(json) ?? `the server refused it (HTTP ${res.status})`) +
            '. The case is unchanged.',
          'error',
        );
        return;
      }
      const saved = json.data;
      setCases((cs) => cs.map((c) => (c.id === saved.id ? saved : c)));
      setSaveReason('');
      fire(
        `Saved — ${sel.id} and its narrative are in the safety store. Reporting clock: ${saved.clock}, due ${saved.due}.`,
      );
    } catch (e) {
      fire(
        'The version was not saved — ' + (e instanceof Error ? e.message : String(e)) + '. The case is unchanged.',
        'error',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="sn">
      <C2CToast msg={toast} position="top" />

      <div className="sn-head">
        <div className="sn-eyebrow">Safety narrative / PV — ICH E3 section 16 — E2B</div>
        <h1 className="sn-title">SAE case narrative writer</h1>
      </div>

      {live.loading ? (
        <div role="status" className="scaf-note" style={{ padding: '18px 10px' }}>Loading SAE cases…</div>
      ) : live.error ? (
        <EmptyState
          tone="error"
          icon={I.alertTriangle}
          title="Couldn't load the SAE case worklist"
          hint="The safety-narrative store didn't respond. These are the organization's individual SAE cases and their expedited-reporting clocks. Sign in and retry, or check the service is reachable."
        />
      ) : !sel || !result ? (
        <EmptyState
          icon={I.fileText}
          title="No SAE cases yet"
          hint="Individual SAE cases appear here once they are in the governed safety store. Each becomes an ICH E3 section 16 narrative, drafted deterministically from the structured case facts with its 21 CFR 312.32(c) expedited-reporting clock."
        />
      ) : (
        <>
          {lead && (
            <AnswerLead
              tone={lead.tone}
              headline={lead.head}
              body={lead.body}
              action={{ label: lead.next, onClick: () => ask(lead.next) }}
            />
          )}

      <div className="sn-cols">
        {/* Left -- case queue + structured fields */}
        <div className="sn-left">
          <div className="sn-sec">Case queue</div>
          <div className="sn-queue">
            {cases.map((c) => {
              /* A queue row with no `event` yet is not evidence of non-seriousness,
                 but "Non-serious" is what the existing chip says for an empty
                 criteria list, and inventing a third state here would assert more
                 than the row supports. Guarded so the row renders either way. */
              const serious = (c.event?.seriousnessCriteria || []).length > 0;
              const miss = composeSafetyNarrative(c).missingFields.length;
              return (
                <button key={c.id} className="sn-case" data-on={c.id === sel.id || undefined} onClick={() => setSelId(c.id)}>
                  <div className="sn-case-top">
                    <span className="mono sn-case-id">{c.id}</span>
                    <span className={'sn-chip ' + (serious ? 'err' : 'idle')}>{serious ? 'Serious' : 'Non-serious'}</span>
                  </div>
                  <div className="sn-case-subj">{c.age}{c.sex === 'Female' ? 'F' : c.sex ? 'M' : ''} -- {c.event?.term}</div>
                  <div className="sn-case-meta">
                    <span className="sn-case-drug">{c.studyDrug}</span>
                    <span className={'sn-due ' + (c.dueDays <= 3 ? 'urgent' : '')}>{c.due}</span>
                    {miss > 0 && <span className="sn-miss">{miss} to complete</span>}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="sn-sec">Structured case -- {sel.id}</div>
          {/* Every read below is of the case's `event` sub-record, which a row can
              arrive without (see the lead memo). The empty-string / empty-array
              fallbacks were already here for the individual fields; the `?.` extends
              the same allowance to the container, so a case with no event facts yet
              renders as blank inputs to fill rather than taking the surface down. */}
          <div className="sn-fields">
            <div className="sn-f2">
              <label className="sn-fl">
                Severity
                <input className="sn-fi" value={sel.event?.severity || ''} placeholder="e.g. grade 3 (severe)" onChange={(e) => setField('event.severity', e.target.value)} />
              </label>
              <label className="sn-fl">
                Study day
                <input className="sn-fi" value={sel.event?.dayOnStudy || ''} onChange={(e) => setField('event.dayOnStudy', e.target.value)} />
              </label>
            </div>
            <label className="sn-fl">
              Action taken with study drug
              <input className="sn-fi" value={sel.event?.actionTaken || ''} placeholder="e.g. study drug permanently discontinued" onChange={(e) => setField('event.actionTaken', e.target.value)} />
            </label>
            <div className="sn-f2">
              <label className="sn-fl">
                Causality (investigator)
                <select className="sn-fi" value={sel.event?.causality || ''} onChange={(e) => setField('event.causality', e.target.value)}>
                  <option value="">-- not assessed --</option>
                  {CAUSALITIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
              <label className="sn-fl">
                Outcome
                <select className="sn-fi" value={sel.event?.outcome || ''} onChange={(e) => setField('event.outcome', e.target.value)}>
                  <option value="">-- unknown --</option>
                  {OUTCOMES.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </label>
            </div>
            <div className="sn-fl">
              Seriousness criteria
              <div className="sn-crits">
                {CRITERIA.map((c) => (
                  <button key={c} className="sn-crit" data-on={(sel.event?.seriousnessCriteria || []).includes(c) || undefined} onClick={() => toggleCrit(c)}>{c}</button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Right -- the generated narrative (the hero deliverable) */}
        <div className="sn-right">
          <div className="sn-sec">Generated narrative <span className="sn-sec-x">-- ICH E3 section 16, deterministic from the case facts</span></div>
          <div className="cm-doc">
            <div className="cm-doc-bar">
              <div>
                <span className="cm-doc-kind">SAE case narrative -- {sel.id}</span>
                <span className="cm-doc-prov">{sel.studyId} -- {result.serious ? 'Serious' : 'Non-serious'} -- {result.narrative.split(/\s+/).length} words</span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {/* Parenthetical only when there is a term to put in it — same
                    shape as the lead's studyId aside, and it keeps the literal
                    "undefined" out of the prompt when the event is absent. */}
                <button className="bs-da" onClick={() => ask('Review this SAE narrative for ' + sel.id + (sel.event?.term ? ' (' + sel.event?.term + ')' : '') + ' and flag any medical-review or consistency issues before I file it.')}>
                  {I.sparkles} Review with AnA
                </button>
                <input
                  className="sn-fi sn-save-reason"
                  value={saveReason}
                  onChange={(e) => setSaveReason(e.target.value)}
                  placeholder="Reason for change (audited)"
                  aria-label="Reason for change, required to save this narrative version"
                />
                <button
                  className="bs-da alt"
                  onClick={() => void saveVersion()}
                  disabled={saving || saveReason.trim().length < 8}
                  title={saveReason.trim().length < 8 ? 'Enter a reason for change to save' : 'Save the case and its narrative to the safety store'}
                >
                  {I.check} {saving ? 'Saving…' : 'Save version'}
                </button>
              </div>
            </div>
            <div className="cm-doc-page">
              <div className="cm-doc-render">
                <h1>Serious adverse event case narrative</h1>
                <p style={{ fontFamily: 'var(--font-mono,monospace)', fontSize: 12, color: 'var(--text-400)' }}>{sel.id} -- {sel.clock}</p>
                {/* Expedited-reporting clock — computed server-side per 21 CFR 312.32(c)
                    / ICH E2A from awareness date + seriousness/causality/expectedness, and
                    returned on every real case row. The static clock line above is the stored label. */}
                {sel.reportingCategory && (
                  <div
                    style={{
                      margin: '8px 0 14px', padding: '10px 12px', borderRadius: 8,
                      border: '1px solid ' + (sel.reportingOverdue ? 'var(--danger-500,#c0392b)' : 'var(--border-200,#e2e2e2)'),
                      background: sel.reportingOverdue ? 'var(--danger-50,#fdecea)' : 'var(--surface-100,#f7f7f7)',
                      fontSize: 12.5, lineHeight: 1.5,
                    }}
                  >
                    {sel.reportingCategory === 'none' ? (
                      <div><strong>No expedited reporting clock.</strong> {sel.reportingBasis}</div>
                    ) : sel.reportingDueDate ? (
                      <div>
                        <strong style={{ color: sel.reportingOverdue ? 'var(--danger-600,#a5281b)' : 'inherit' }}>
                          {sel.reportingOverdue
                            ? `OVERDUE — ${sel.reportingCategory} report was due ${sel.reportingDueDate}`
                            : `${sel.reportingCategory} expedited report — due ${sel.reportingDueDate}` +
                              (typeof sel.reportingDaysRemaining === 'number'
                                ? ` (${sel.reportingDaysRemaining === 0 ? 'due today' : sel.reportingDaysRemaining + ' calendar day' + (Math.abs(sel.reportingDaysRemaining) === 1 ? '' : 's') + ' remaining'})`
                                : '')}
                        </strong>
                        <div style={{ color: 'var(--text-400)', marginTop: 3 }}>
                          Clock start (Day 0 / sponsor awareness): {sel.reportingClockStart}. {sel.reportingBasis}
                        </div>
                      </div>
                    ) : (
                      <div>
                        <strong>{sel.reportingCategory} expedited report</strong> — awareness (Day 0) date not recorded, so the due date cannot be anchored. {sel.reportingBasis}
                      </div>
                    )}
                  </div>
                )}
                <p>{result.narrative}</p>
                <hr />
                <p>Drafted deterministically from the structured case per ICH E3 section 16 convention. No clinical detail is inferred beyond the supplied facts.</p>
              </div>
            </div>
          </div>

          {/* QC -- missing fields before handoff */}
          <div className={'sn-qc ' + (nMissing ? 'warn' : 'ok')}>
            <span className="sn-qc-ic">{nMissing ? I.alertTriangle : (I.checkCircle || I.check)}</span>
            {nMissing ? (
              <div>
                <div className="sn-qc-t">{nMissing} field{nMissing > 1 ? 's' : ''} to complete before handoff</div>
                <div className="sn-qc-list">{result.missingFields.map((f) => <span key={f} className="sn-qc-tag">{f}</span>)}</div>
              </div>
            ) : (
              <div>
                <div className="sn-qc-t">Complete — all E3 section 16 elements present</div>
                <div className="sn-qc-d">This narrative is ready for medical review and E2B(R3) transmission.</div>
              </div>
            )}
          </div>

          {/* These two hand off to AnA and the Submission Center. They do NOT
              themselves transmit or file anything, and are now labelled for what
              they do.

              The first read "Transmit as E2B ICSR" while its handler only
              navigated and typed a sentence into the assistant. E2B(R3) ICSR
              submission is a statutory safety-reporting obligation on an
              expedited clock — the same clock this surface displays — so a
              control that implies a case was transmitted when nothing left the
              building is the most consequential mislabel on the surface.

              It is not wired to POST /api/pharmacovigilance/icsr/generate,
              despite that route being real and mounted, for two reasons: it
              GENERATES an E2B document, it does not transmit one, so it would not
              make this button's old promise true either; and it keys on an
              `adverseEventId` from the pharmacovigilance store, whereas these
              rows come from /api/safety-narratives/cases and carry case ids. The
              two stores are not the same records, and guessing that they are is
              how a safety report gets filed against the wrong case. */}
          <div className="sn-hand">
            <button className="sn-hb" onClick={() => {
              onNav('submission-center');
              ask('Prepare ' + sel.id + ' for E2B(R3) ICSR transmission to the FDA gateway: confirm the case is complete, then walk me through filing it.');
            }}>
              {I.send || I.rocket} Prepare E2B transmission with AnA
            </button>
            <button className="sn-hb alt" onClick={() => ask('Roll ' + sel.id + ' into the aggregate safety narrative (ICH E3 section 12) for ' + sel.studyId + '.')}>
              {I.layers || I.fileText} Draft aggregate entry (section 12)
            </button>
          </div>
        </div>
      </div>
        </>
      )}
    </div>
  );
}
