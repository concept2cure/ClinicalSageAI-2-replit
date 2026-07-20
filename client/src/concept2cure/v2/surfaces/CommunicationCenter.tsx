/**
 * Communication Center — kit app/communication-center.jsx ported
 * (registry id `communication-center`, contract-ready).
 *
 * The regulated FDA<>client loop hub. Tabs: FDA loop (submission lifecycle
 * states, CRL response countdown, deficiency gap analysis), Agency inbox
 * (communications with urgency/response tracking), Meetings & commitments
 * (HA interactions, PMR/PMC/REMS), Authority profiles.
 *
 * Live bindings:
 *   GET /api/communication-center/projects/:pid/agency-communications
 *   POST /api/communication-center/projects/:pid/agency-communications
 * Fixture fallback behind the SampleTag pill otherwise.
 */
import React from 'react';
import { I } from '../icons';
import { AnswerLead } from '../AnswerLead';
import { SampleTag, useLive, connected } from '../dataConnect';
import { apiRequest } from '@/lib/queryClient';
import { C2CForm } from '../C2CForm';
import {
  CC_SUB_STATES,
  CC_SUB_STATE_LABEL,
  CC_SOURCE_TYPES,
  CC_INTERACTION_TYPES,
  CC_FILING,
  CC_DEFICIENCIES,
  CC_COMMS,
  CC_INTERACTIONS,
  CC_COMMITMENTS,
  CC_AUTH_PROFILES,
  CC_TONE,
  CC_CLOSURE,
  CC_DEF_ORDER,
  type CcComm,
  type CcDeficiency,
  type CcFiling,
  type CcSubState,
} from '../fixtures/commcenter';
import type { SurfaceViewProps } from '../surfaceViews';
import '../styles/commcenter-v2.css';

/* ── Submission lifecycle loop (the FDA round-trip) ── */

function CCLoop({ filing, onAsk }: { filing: CcFiling; onAsk: (t: string) => void }) {
  const states = CC_SUB_STATES;
  const curIdx = states.indexOf(filing.status);
  const rejected = filing.status === 'rejected_or_remediation';
  return (
    <div className="cc-loop">
      <div className="cc-loop-track">
        {states.map((s, i) => {
          const done = i < curIdx && !rejected;
          const cur = i === curIdx;
          return (
            <React.Fragment key={s}>
              <div
                className={
                  'cc-loop-node' +
                  (done ? ' done' : '') +
                  (cur ? ' cur' : '') +
                  (s === 'rejected_or_remediation' && cur ? ' rej' : '')
                }
              >
                <span className="cc-loop-dot">{done ? I.check : i + 1}</span>
                <span className="cc-loop-lbl">{CC_SUB_STATE_LABEL[s]}</span>
              </div>
              {i < states.length - 1 && (
                <span className={'cc-loop-link' + (i < curIdx && !rejected ? ' done' : '')} />
              )}
            </React.Fragment>
          );
        })}
      </div>
      {rejected && (
        <div className="cc-loop-return">
          <span className="cc-loop-return-ic">{I.rotateCcw}</span>
          <div className="cc-loop-return-b">
            <div className="cc-loop-return-t">
              Response loop open — {filing.authority} {filing.center} issued a Complete Response
              Letter
            </div>
            <div className="cc-loop-return-s">
              Resolve the CRL deficiencies, hold the Type A alignment meeting, then resubmit as
              sequence {String(Number(filing.sequenceNumber) + 1).padStart(4, '0')}. AnA is tracking
              every item back to its section.
            </div>
          </div>
          <button
            className="cc-btn primary sm"
            onClick={() =>
              onAsk(
                'Build the CRL response plan for ' +
                  filing.title +
                  ' — decompose every deficiency into a section-linked task and draft the response letter skeleton.',
              )
            }
          >
            {I.sparkles} Plan the resubmission
          </button>
        </div>
      )}
    </div>
  );
}

/* ── Helpers ── */

function daysTo(d: string | null | undefined): number | null {
  if (!d) return null;
  return Math.round((new Date(d).getTime() - Date.now()) / 86400000);
}

/* ── Main component ── */

export function CommunicationCenter({ onAsk, onNav }: SurfaceViewProps) {
  const live = connected();
  const nav = (id: string) => {
    try {
      localStorage.setItem('c2c_open_surface', id);
    } catch {
      /* noop */
    }
    onNav(id);
  };

  const [tab, setTab] = React.useState('loop');
  const [owner, setOwner] = React.useState<'all' | 'mine'>('all');
  const [form, setForm] = React.useState(false);
  const [toast, setToast] = React.useState('');
  const fire = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(''), 2800);
  };

  const filing = CC_FILING;

  /* Agency correspondence is per-project. Read the project in context
     (window.C2C_PROJECT, set by Projects/ProjectHome — the same channel
     CmcModule uses) instead of a hardcoded demo id; with no project selected
     the path is null, so useLive keeps the honest fixture with the Sample
     pill rather than fetching someone else's project. */
  const ctxProjectId = ((): string | null => {
    try {
      const p = (window as { C2C_PROJECT?: { id?: unknown } }).C2C_PROJECT;
      const id = p && p.id != null ? String(p.id).trim() : '';
      return id || null;
    } catch {
      return null;
    }
  })();
  const commsState = useLive<CcComm[]>(
    ctxProjectId
      ? `/api/communication-center/projects/${encodeURIComponent(ctxProjectId)}/agency-communications`
      : null,
    CC_COMMS,
  );
  const [comms, setComms] = React.useState<CcComm[]>(CC_COMMS);
  const [commsSample, setCommsSample] = React.useState(true);

  React.useEffect(() => {
    setComms(commsState.data);
    setCommsSample(commsState.sample);
  }, [commsState.data, commsState.sample]);

  const open = comms.filter((c) => c.closureStatus !== 'closed');
  const responseDue = comms.filter((c) => c.responseRequired && c.closureStatus !== 'closed');
  const critical = responseDue.filter((c) => c.urgency === 'critical');
  const soonest = [...responseDue]
    .filter((c) => c.dueDate)
    .sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime())[0];
  const autoTasks = comms.filter((c) => c.taskId).length;

  const [defs, setDefs] = React.useState<CcDeficiency[]>(CC_DEFICIENCIES);
  const defDone = defs.filter((d) => d.status === 'drafted' || d.status === 'resolved').length;
  const defMajor = defs.filter((d) => d.severity === 'major').length;
  const crlDays = daysTo(filing.crlDue);

  const advanceDef = (id: string) =>
    setDefs((ds) =>
      ds.map((d) => {
        if (d.id !== id) return d;
        const i = CC_DEF_ORDER.indexOf(d.status as (typeof CC_DEF_ORDER)[number]);
        return { ...d, status: i < CC_DEF_ORDER.length - 1 ? CC_DEF_ORDER[i + 1] : d.status };
      }),
    );

  const logComm = (v: Record<string, string>) => {
    const responseRequired = v.responseRequired === 'yes';
    const urgency = (v.urgency || 'medium') as CcComm['urgency'];
    const willTask = responseRequired || urgency === 'high' || urgency === 'critical';
    const id = 'ace_' + String(comms.length + 1).padStart(2, '0');
    const taskId = willTask ? 'T-' + (4490 + comms.length) : null;
    const rec: CcComm = {
      id,
      sourceType: v.sourceType || 'manual_logged_event',
      communicationType: v.communicationType,
      sourceChannel: v.sourceChannel || 'Manually logged',
      linkedSubmissionId: filing.id,
      linkedSectionCodes: [],
      receivedDate: new Date().toISOString().slice(0, 10),
      dueDate: v.dueDate || null,
      urgency,
      responseRequired,
      extractedIssues: v.issue ? [v.issue] : [],
      humanReviewStatus: 'pending_review',
      closureStatus: 'open',
      visibilityTier: 'shared_client_c2c',
      taskId,
      _new: true,
    };
    setComms((cs) => [rec, ...cs]); // optimistic
    setForm(false);
    const okMsg = willTask
      ? 'Communication logged · task ' + taskId + ' auto-created in Tasking'
      : 'Communication logged';
    if (!ctxProjectId) {
      // No project in context — nothing to persist to; say so rather than
      // claim a write that did not happen.
      fire(okMsg + ' · sample only, not persisted');
      return;
    }
    // Real, audited write to the project's agency-communications ledger.
    apiRequest(
      'POST',
      `/api/communication-center/projects/${encodeURIComponent(ctxProjectId)}/agency-communications`,
      {
        sourceType: rec.sourceType,
        communicationType: rec.communicationType || 'Logged communication',
        sourceChannel: rec.sourceChannel || 'Manually logged',
        linkedSubmissionId: rec.linkedSubmissionId,
        linkedSectionCodes: rec.linkedSectionCodes ?? [],
        dueDate: rec.dueDate ?? undefined,
        urgency: rec.urgency,
        responseRequired: rec.responseRequired,
        extractedIssues: rec.extractedIssues ?? [],
        humanReviewStatus: 'pending_review',
        closureStatus: 'open',
        visibilityTier: rec.visibilityTier,
      },
    )
      .then((res) => {
        if (res.ok) fire(okMsg);
        else {
          setComms((cs) => cs.filter((c) => c.id !== rec.id));
          fire('Could not log — sign in required');
        }
      })
      .catch((e) => {
        setComms((cs) => cs.filter((c) => c.id !== rec.id));
        fire('Could not log — ' + (e instanceof Error && e.message ? e.message : 'request failed'));
      });
  };

  const triage = (id: string) =>
    setComms((cs) =>
      cs.map((c) =>
        c.id === id
          ? {
              ...c,
              humanReviewStatus:
                c.humanReviewStatus === 'pending_review' ? 'triaged' : 'actioned',
              closureStatus: c.closureStatus === 'open' ? 'in_progress' : 'closed',
            }
          : c,
      ),
    );

  const shown = owner === 'mine' ? open.filter((c) => c.responseRequired) : comms;

  return (
    <div className="cc" style={{ maxWidth: 1200 }}>
      <div className="sp-head">
        <div>
          <div className="sp-eyebrow">
            Submission · /api/communication-center{live ? ' · live' : ''}
          </div>
          <h1 className="sp-title">
            Communication Center <SampleTag sample={commsSample} />
          </h1>
          <p className="sp-state">
            The regulated FDA↔client loop for {filing.title} — every agency letter, IR, gateway ack
            and meeting, traced to its filing and turned into governed action.
          </p>
        </div>
        <button className="sp-primary" onClick={() => setForm(true)}>
          {I.plus} Log communication
        </button>
      </div>

      <AnswerLead
        tone={critical.length ? 'urgent' : responseDue.length ? 'urgent' : 'calm'}
        eyebrow="What the FDA is waiting on from you"
        headline={
          critical.length ? (
            <>
              The FDA issued a <b>{critical[0].communicationType}</b> on {filing.title} — you have{' '}
              <b>{daysTo(critical[0].dueDate)} days</b> to respond.
            </>
          ) : responseDue.length ? (
            <>
              <b>{responseDue.length}</b> agency communication
              {responseDue.length === 1 ? '' : 's'}{' '}
              {responseDue.length === 1 ? 'needs' : 'need'} a response
              {soonest ? (
                <>
                  , the soonest in <b>{daysTo(soonest.dueDate)} days</b>
                </>
              ) : null}
              .
            </>
          ) : (
            <>No open agency communications need a response right now on {filing.title}.</>
          )
        }
        body={
          <>
            {filing.title} sits at <b>{CC_SUB_STATE_LABEL[filing.status]}</b> in its FDA lifecycle.{' '}
            {autoTasks > 0 && (
              <>
                {autoTasks} response task{autoTasks === 1 ? '' : 's'}{' '}
                {autoTasks === 1 ? 'is' : 'are'} already open in Tasking, each linked back to the
                section it touches.
              </>
            )}
          </>
        }
        reassure="I'll decompose every deficiency into a section-linked task, draft each response, and walk the resubmission through the gateway — you review and sign."
        action={
          responseDue.length
            ? {
                label: 'Draft the ' + responseDue[0].communicationType + ' response',
                onClick: () =>
                  onAsk(
                    'Draft the response to the ' +
                      responseDue[0].communicationType +
                      ' for ' +
                      filing.title +
                      ', addressing every extracted issue with a section-linked plan.',
                  ),
              }
            : { label: 'Review the loop', onClick: () => setTab('loop') }
        }
        secondary="Or work the loop, inbox, meetings and commitments below."
      />

      <div className="cc-tabs">
        {(
          [
            ['loop', 'FDA loop'],
            ['inbox', 'Agency inbox · ' + open.length],
            ['meetings', 'Meetings & commitments'],
            ['profiles', 'Authority profiles'],
          ] as const
        ).map(([k, l]) => (
          <button
            key={k}
            className={'cc-tab' + (tab === k ? ' on' : '')}
            onClick={() => setTab(k)}
          >
            {l}
          </button>
        ))}
      </div>

      {/* ════ TAB: FDA loop ════ */}
      {tab === 'loop' && (
        <>
          {filing.status === 'rejected_or_remediation' && (
            <div className="cc-crl">
              <div
                className="cc-crl-clock"
                data-warn={(crlDays != null && crlDays < 45) || undefined}
              >
                <div className="cc-crl-days">
                  {crlDays}
                  <span className="u">days</span>
                </div>
                <div className="cc-crl-clock-l">
                  to respond to the {filing.crlLetter}
                  <span className="s">
                    received {filing.crlReceived} · due {filing.crlDue}
                  </span>
                </div>
              </div>
              <div className="cc-crl-prog">
                <div className="cc-crl-prog-top">
                  <span>
                    {defDone} of {defs.length} deficiencies resolved
                  </span>
                  <span className="mono">
                    {defMajor} major · {defs.length - defMajor} minor
                  </span>
                </div>
                <div className="cc-crl-bar">
                  <div
                    className="fill"
                    style={{ width: (defs.length ? (defDone / defs.length) * 100 : 0) + '%' }}
                  />
                </div>
                <div className="cc-crl-prog-s">
                  Resubmission classification: <b>Class 2 (6-month review)</b> · target resubmit{' '}
                  {filing.crlDue}
                </div>
              </div>
              <button
                className="cc-btn primary"
                onClick={() =>
                  onAsk(
                    'Draft the full CRL response letter for ' +
                      filing.title +
                      ', with one response section per deficiency, each citing the resolving evidence and the updated eCTD section.',
                  )
                }
              >
                {I.penLine} Draft the response letter
              </button>
            </div>
          )}

          <div className="pj-seclbl">
            Submission lifecycle{' '}
            <span className="s">
              · {filing.authority} {filing.center} · {filing.submissionType} · seq{' '}
              {filing.sequenceNumber} · {filing.transport}
            </span>
          </div>
          <CCLoop filing={filing} onAsk={onAsk} />

          {filing.status === 'rejected_or_remediation' && (
            <>
              <div className="pj-seclbl">
                CRL deficiency gap analysis{' '}
                <span className="s">
                  · discipline · section · severity · owner — each item is a section-linked task
                </span>
              </div>
              <div className="cc-defs">
                {defs.map((d) => (
                  <div key={d.id} className="cc-def" data-sev={d.severity}>
                    <div className="cc-def-l">
                      <span className="cc-def-id mono">{d.id}</span>
                      <span className={'cc-def-sev sev-' + d.severity}>{d.severity}</span>
                    </div>
                    <div className="cc-def-b">
                      <div className="cc-def-top">
                        <span className="cc-def-disc">{d.discipline}</span>
                        <span className="cc-def-sec mono">§{d.section}</span>
                        <span className="cc-def-eff">{d.effort}</span>
                      </div>
                      <div className="cc-def-issue">{d.issue}</div>
                      <div className="cc-def-rat">
                        {I.info} <span>{d.rationale}</span>
                      </div>
                      <div className="cc-def-foot">
                        <span className="cc-def-owner">
                          {I.user} {d.owner} · {d.ownerRole}
                        </span>
                        <span
                          className={
                            'rd-chip tone-' +
                            (d.status === 'resolved' || d.status === 'drafted'
                              ? 'ok'
                              : d.status === 'not_started'
                                ? 'idle'
                                : 'warn')
                          }
                        >
                          {d.status.replace(/_/g, ' ')}
                        </span>
                        <span style={{ flex: 1 }} />
                        {d.task && (
                          <button className="cc-comm-task" onClick={() => nav('tasks')}>
                            {I.checkSquare} {d.task}
                          </button>
                        )}
                        <button
                          className="cc-btn sm primary"
                          onClick={() =>
                            onAsk(
                              'Draft the response to ' +
                                d.id +
                                ' (' +
                                d.discipline +
                                ' §' +
                                d.section +
                                '): ' +
                                d.issue,
                            )
                          }
                        >
                          {I.penLine} Draft with AnA
                        </button>
                        {d.status !== 'resolved' && (
                          <button className="cc-btn sm" onClick={() => advanceDef(d.id)}>
                            Advance
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          <div className="cc-linkrow">
            <button className="cc-linkcard" onClick={() => nav('submission-center')}>
              <span className="ic">{I.rocket}</span>
              <div>
                <div className="t">Submission Center</div>
                <div className="s">Assemble, validate & dispatch the resubmission sequence</div>
              </div>
              <span className="go">{I.arrowRight}</span>
            </button>
            <button className="cc-linkcard" onClick={() => nav('tasks')}>
              <span className="ic">{I.checkSquare}</span>
              <div>
                <div className="t">Tasking</div>
                <div className="s">
                  {autoTasks} response tasks auto-generated from agency communications
                </div>
              </div>
              <span className="go">{I.arrowRight}</span>
            </button>
            <button className="cc-linkcard" onClick={() => nav('projects')}>
              <span className="ic">{I.folder}</span>
              <div>
                <div className="t">Project</div>
                <div className="s">{filing.title} lifecycle, team & evidence</div>
              </div>
              <span className="go">{I.arrowRight}</span>
            </button>
          </div>
        </>
      )}

      {/* ════ TAB: Agency inbox ════ */}
      {tab === 'inbox' && (
        <>
          <div className="cc-inbox-head">
            <div className="pj-seclbl" style={{ margin: 0 }}>
              Agency communications{' '}
              <span className="s">
                · {shown.length} shown · response-required auto-generates a task
              </span>
            </div>
            <div className="cc-owner">
              <button
                className={'cc-owner-b' + (owner === 'all' ? ' on' : '')}
                onClick={() => setOwner('all')}
              >
                Everyone
              </button>
              <button
                className={'cc-owner-b' + (owner === 'mine' ? ' on' : '')}
                onClick={() => setOwner('mine')}
              >
                Needs response
              </button>
            </div>
          </div>
          <div className="cc-comms">
            {shown.map((c) => (
              <div
                key={c.id}
                className="cc-comm"
                data-fresh={c._new || undefined}
                data-urgency={c.urgency}
              >
                <div className="cc-comm-l">
                  <span className={'cc-comm-dot tone-' + (CC_TONE[c.urgency] || 'idle')} />
                </div>
                <div className="cc-comm-b">
                  <div className="cc-comm-top">
                    <span className="cc-comm-t">{c.communicationType}</span>
                    <span className="cc-comm-src">{CC_SOURCE_TYPES[c.sourceType]}</span>
                    {c.responseRequired && (
                      <span className="rd-chip tone-err">response required</span>
                    )}
                    <span className={'rd-chip tone-' + (CC_CLOSURE[c.closureStatus] || 'idle')}>
                      {c.closureStatus.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <div className="cc-comm-meta mono">
                    {c.sourceChannel} · received {c.receivedDate}
                    {c.dueDate
                      ? ' · due ' +
                        c.dueDate +
                        (daysTo(c.dueDate) != null ? ' (' + daysTo(c.dueDate) + 'd)' : '')
                      : ''}
                    {c.linkedSectionCodes.length
                      ? ' · §' + c.linkedSectionCodes.join(' §')
                      : ''}
                  </div>
                  {c.extractedIssues.length > 0 && (
                    <ul className="cc-comm-issues">
                      {c.extractedIssues.map((iss, i) => (
                        <li key={i}>{iss}</li>
                      ))}
                    </ul>
                  )}
                  <div className="cc-comm-foot">
                    {c.taskId && (
                      <button
                        className="cc-comm-task"
                        onClick={() => nav('tasks')}
                        title="Open in Tasking"
                      >
                        {I.checkSquare} {c.taskId}
                      </button>
                    )}
                    {c.responseRequired && c.closureStatus !== 'closed' && (
                      <button
                        className="cc-btn sm primary"
                        onClick={() =>
                          onAsk(
                            'Draft the response to "' +
                              c.communicationType +
                              '" (' +
                              c.id +
                              ') addressing: ' +
                              c.extractedIssues.join('; '),
                          )
                        }
                      >
                        {I.penLine} Draft response with AnA
                      </button>
                    )}
                    {c.closureStatus !== 'closed' && (
                      <button className="cc-btn sm" onClick={() => triage(c.id)}>
                        {c.humanReviewStatus === 'pending_review' ? 'Triage' : 'Advance'}
                      </button>
                    )}
                    <span className="cc-comm-vis" title="Visibility tier">
                      {I.eye} {c.visibilityTier.replace(/_/g, ' ')}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ════ TAB: Meetings & commitments ════ */}
      {tab === 'meetings' && (
        <>
          <div className="pj-seclbl">
            Health-authority interactions <span className="s">· /api/ha-interactions</span>
          </div>
          <div className="cc-list">
            {CC_INTERACTIONS.map((m) => (
              <div key={m.id} className="cc-row">
                <span className="cc-row-tag">
                  {CC_INTERACTION_TYPES[m.interactionType]}
                </span>
                <div className="cc-row-b">
                  <div className="cc-row-t">{m.title}</div>
                  <div className="cc-row-s mono">
                    {m.agency.toUpperCase()} · {m.scheduledDate} · {m.agreed}/{m.questions} questions
                    agreed
                  </div>
                </div>
                <span
                  className={
                    'rd-chip tone-' +
                    (m.status === 'closed'
                      ? 'ok'
                      : m.status === 'held' || m.status === 'minutes_received'
                        ? 'ai'
                        : 'idle')
                  }
                >
                  {m.status.replace(/_/g, ' ')}
                </span>
                <button
                  className="cc-btn sm"
                  onClick={() =>
                    onAsk(
                      'Summarize the ' +
                        CC_INTERACTION_TYPES[m.interactionType] +
                        ' outcomes and open questions for ' +
                        m.title,
                    )
                  }
                >
                  {I.sparkles}
                </button>
              </div>
            ))}
          </div>
          <div className="pj-seclbl">
            Regulatory commitments{' '}
            <span className="s">· PMR / PMC / REMS · /api/ha-interactions/commitments</span>
          </div>
          <div className="cc-list">
            {CC_COMMITMENTS.map((c) => (
              <div key={c.id} className="cc-row">
                <span className="cc-row-tag" data-kind={c.commitmentType}>
                  {c.commitmentType.toUpperCase()}
                </span>
                <div className="cc-row-b">
                  <div className="cc-row-t">{c.description}</div>
                  <div className="cc-row-s mono">
                    {c.basis} · due {c.dueDate}
                  </div>
                </div>
                <span
                  className={
                    'rd-chip tone-' +
                    (c.effectiveStatus === 'on_track'
                      ? 'ok'
                      : c.effectiveStatus === 'due_soon'
                        ? 'warn'
                        : 'err')
                  }
                >
                  {c.effectiveStatus.replace(/_/g, ' ')}
                </span>
                <button
                  className="cc-btn sm"
                  onClick={() =>
                    onAsk(
                      'What is needed to fulfill this ' +
                        c.commitmentType.toUpperCase() +
                        ' commitment on time?',
                    )
                  }
                >
                  {I.sparkles}
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ════ TAB: Authority profiles ════ */}
      {tab === 'profiles' && (
        <>
          <div className="pj-seclbl">
            Authority profiles{' '}
            <span className="s">· channel · transport · validation · acknowledgment model</span>
          </div>
          <div className="cc-prof-grid">
            {CC_AUTH_PROFILES.map((p, i) => (
              <div key={i} className="cc-prof">
                <div className="cc-prof-h">
                  <span className="cc-prof-a">{p.authority}</span>
                  <span className="cc-prof-c">{p.center}</span>
                </div>
                <div className="cc-prof-row">
                  <span className="k">Channel</span>
                  <span className="v">
                    {p.channelType} · {p.transport}
                  </span>
                </div>
                <div className="cc-prof-row">
                  <span className="k">Formats</span>
                  <span className="v">{p.formats.join(', ')}</span>
                </div>
                <div className="cc-prof-row">
                  <span className="k">Validation</span>
                  <span className="v">{p.validation.join(', ')}</span>
                </div>
                <div className="cc-prof-row">
                  <span className="k">Acknowledgment</span>
                  <span className="v">{p.ack.replace(/_/g, ' ')}</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ════ Log communication form ════ */}
      {form && (
        <C2CForm
          config={{
            eyebrow: 'Communication Center · /agency-communications',
            title: 'Log agency communication',
            sub: 'Record an inbound agency event. If a response is required or the urgency is high/critical, a response task is auto-created in Tasking and a notification is sent — exactly as the backend does.',
            governed:
              'Every logged communication is org- and project-scoped and audit-logged; visibility follows the tier you set.',
            submitLabel: 'Log communication',
            fields: [
              {
                key: 'communicationType',
                label: 'Communication type',
                type: 'text',
                placeholder: 'e.g. Information Request (IR)',
                required: true,
              },
              {
                key: 'sourceType',
                label: 'Source',
                type: 'select',
                options: Object.keys(CC_SOURCE_TYPES).map((k) => ({
                  value: k,
                  label: CC_SOURCE_TYPES[k],
                })),
                required: true,
              },
              {
                key: 'sourceChannel',
                label: 'Source channel',
                type: 'text',
                placeholder: 'e.g. FDA CDER portal',
              },
              {
                key: 'urgency',
                label: 'Urgency',
                type: 'select',
                options: [
                  { value: 'low', label: 'Low' },
                  { value: 'medium', label: 'Medium' },
                  { value: 'high', label: 'High' },
                  { value: 'critical', label: 'Critical' },
                ],
                required: true,
              },
              {
                key: 'responseRequired',
                label: 'Response required?',
                type: 'select',
                options: [
                  { value: 'no', label: 'No' },
                  { value: 'yes', label: 'Yes — auto-create a task' },
                ],
                required: true,
              },
              {
                key: 'dueDate',
                label: 'Response due (optional)',
                type: 'text',
                placeholder: 'YYYY-MM-DD',
              },
              {
                key: 'issue',
                label: 'Key issue (optional)',
                type: 'text',
                placeholder: 'e.g. Additional stability data required (§3.2.P.8)',
              },
            ],
          }}
          onCancel={() => setForm(false)}
          onSubmit={logComm}
        />
      )}

      {toast && (
        <div className="pdev-toast">
          {I.check} {toast}
        </div>
      )}
    </div>
  );
}
