/**
 * Schedules — recurring governed reports.
 *
 * `/api/insights/subscriptions` is a complete subsystem with no screen: full
 * tenant-scoped CRUD over `scheduling/subscription-service.ts`, three
 * cadences, recipients, next-run arithmetic, and a Bull sweep registered at
 * startup. Nothing in the client called it, so no client could ever create a
 * standing report.
 *
 * ── TWO RULES THIS PANEL KEEPS ──────────────────────────────────────────────
 * 1. It never says a file was delivered. `worker-register.ts` computes the run
 *    and places a link to the retained run in the platform inbox. A scheduled
 *    report remains subject to the same finalization and export gates.
 * 2. It only offers a type an engine computes. The sweep calls
 *    `computeInitialRun`, which throws for the 39 declared-but-uncomputed
 *    types, so scheduling one would persist a row that fails every sweep for
 *    ever and tell the client nothing.
 *
 * @module client/src/concept2cure/v2/surfaces/InsightsSchedulesPanel
 */
import React, { useMemo, useState } from 'react';

import { EmptyState, ErrorState, useLiveData } from '../dataConnect';
import { I } from '../icons';
import {
  CADENCE_LABEL,
  DAY_OF_WEEK_LABEL,
  createSubscription,
  scheduleInWords,
  schedulableTypes,
  setSubscriptionEnabled,
  whenText,
  type Cadence,
  type SubscriptionRow,
  type CreateSubscriptionBody,
} from './insightsLibraryModel';
import {
  PanelAlert,
  PanelHead,
  ScheduleTruthNote,
  ViewOnlyNote,
  isRowList,
  readFailureOf,
  rowsOf,
  type LibraryReportType,
  type ReadFailure,
} from './insightsLibraryShared';

interface Draft {
  typeId: string;
  cadence: Cadence;
  hour: number;
  minute: number;
  timeZone: string;
  dayOfWeek: number;
  dayOfMonth: number;
}

const EMPTY_DRAFT: Draft = { typeId: '', cadence: 'weekly', hour: 8, minute: 0, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', dayOfWeek: 1, dayOfMonth: 1 };
type ScheduleScope = { scopeType: string; scopeId: string };
function targetForType(type: LibraryReportType | undefined, scope: ScheduleScope | null): ScheduleScope | null {
  return type?.runScopeType && type.runScopeId ? { scopeType: type.runScopeType, scopeId: type.runScopeId } : scope;
}
function scheduleBody(draft: Draft, target: ScheduleScope): CreateSubscriptionBody {
  return { reportTypeId: draft.typeId, ...target, channel: 'platform', format: 'in_app', schedule: { cadence: draft.cadence, hour: draft.hour, minute: draft.minute, timeZone: draft.timeZone.trim(), ...(draft.cadence === 'weekly' ? { dayOfWeek: draft.dayOfWeek } : {}), ...(draft.cadence === 'monthly' ? { dayOfMonth: draft.dayOfMonth } : {}) } };
}
function scheduleProblem(draft: Draft): string | null {
  try { new Intl.DateTimeFormat('en', { timeZone: draft.timeZone }); } catch { return 'Choose a valid timezone, such as Asia/Tokyo or Europe/London.'; }
  return !Number.isInteger(draft.minute) || draft.minute < 0 || draft.minute > 59 ? 'Enter a minute from 0 to 59.' : null;
}

/** The day control the chosen cadence needs, or nothing for a daily one. */
function DayField({ draft, setDraft }: { draft: Draft; setDraft: (d: Draft) => void }) {
  const dowId = React.useId();
  const domId = React.useId();
  if (draft.cadence === 'weekly') {
    return (
      <div className="rl-filter">
        <label className="gov-label" htmlFor={dowId}>Day</label>
        <select
          id={dowId}
          className="rl-input"
          value={draft.dayOfWeek}
          onChange={(e) => setDraft({ ...draft, dayOfWeek: Number(e.target.value) })}
        >
          {DAY_OF_WEEK_LABEL.map((d, i) => (
            <option key={d} value={i}>{d}</option>
          ))}
        </select>
      </div>
    );
  }
  if (draft.cadence === 'monthly') {
    return (
      <div className="rl-filter">
        <label className="gov-label" htmlFor={domId}>Day of month</label>
        <select
          id={domId}
          className="rl-input"
          value={draft.dayOfMonth}
          onChange={(e) => setDraft({ ...draft, dayOfMonth: Number(e.target.value) })}
        >
          {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
      </div>
    );
  }
  return null;
}

/** The create form. Only runnable types reach `offerable`. */
function ScheduleForm({
  offerable,
  scope,
  draft,
  setDraft,
  saving,
  onSave,
  onCancel,
}: {
  offerable: LibraryReportType[];
  scope: { scopeType: string; scopeId: string };
  draft: Draft;
  setDraft: (d: Draft) => void;
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  const typeFieldId = React.useId();
  const cadenceId = React.useId();
  const hourId = React.useId();
  const minuteId = React.useId();
  const zoneId = React.useId();
  const zonesId = React.useId();

  return (
    <div className="rl-form" data-testid="rl-schedule-form">
      <div className="rl-filters">
        <div className="rl-filter">
          <label className="gov-label" htmlFor={typeFieldId}>Report</label>
          <select
            id={typeFieldId}
            className="rl-input"
            value={draft.typeId}
            onChange={(e) => setDraft({ ...draft, typeId: e.target.value })}
          >
            <option value="">Choose a report</option>
            {offerable.map((t) => (
              <option key={t.typeId} value={t.typeId}>{t.label}</option>
            ))}
          </select>
        </div>
        <div className="rl-filter">
          <label className="gov-label" htmlFor={cadenceId}>Cadence</label>
          <select
            id={cadenceId}
            className="rl-input"
            value={draft.cadence}
            onChange={(e) => setDraft({ ...draft, cadence: e.target.value as Cadence })}
          >
            {(Object.keys(CADENCE_LABEL) as Cadence[]).map((c) => (
              <option key={c} value={c}>{CADENCE_LABEL[c]}</option>
            ))}
          </select>
        </div>
        <div className="rl-filter">
          <label className="gov-label" htmlFor={hourId}>Hour</label>
          <select
            id={hourId}
            className="rl-input"
            value={draft.hour}
            onChange={(e) => setDraft({ ...draft, hour: Number(e.target.value) })}
          >
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
            ))}
          </select>
        </div>
        <div className="rl-filter"><label className="gov-label" htmlFor={minuteId}>Minute</label><input id={minuteId} className="rl-input" type="number" min={0} max={59} value={draft.minute} onChange={e => setDraft({ ...draft, minute: Number(e.target.value) })} /></div>
        <div className="rl-filter"><label className="gov-label" htmlFor={zoneId}>Timezone</label><input id={zoneId} className="rl-input" list={zonesId} value={draft.timeZone} onChange={e => setDraft({ ...draft, timeZone: e.target.value })} /><datalist id={zonesId}>{['UTC', 'America/New_York', 'America/Los_Angeles', 'America/Sao_Paulo', 'Europe/London', 'Europe/Berlin', 'Africa/Johannesburg', 'Asia/Dubai', 'Asia/Kolkata', 'Asia/Shanghai', 'Asia/Tokyo', 'Australia/Sydney'].map(zone => <option key={zone} value={zone} />)}</datalist></div>
        <DayField draft={draft} setDraft={setDraft} />
      </div>
      <p className="rl-sub">
        Runs over {scope.scopeType} — {scope.scopeId}. Days 29 to 31 are not offered: the server clamps a
        monthly schedule to day 28 so it is valid in every month. The named timezone follows local daylight-saving changes.
      </p>
      <div className="rl-head-acts">
        <button type="button" className="btn primary" disabled={!draft.typeId || saving} onClick={onSave}>
          {saving ? 'Saving…' : 'Save schedule'}
        </button>
        <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

/** Why the New schedule control is absent, rather than leaving it unexplained. */
function NothingSchedulable() {
  return (
    <div className="ro-dash-note" role="note">
      {I.info} No report is available to schedule in this context. The report catalog states each
      type’s supported scope, plan and availability.
    </div>
  );
}

function ScheduleTable({
  rows,
  canWrite,
  onToggle,
}: {
  rows: SubscriptionRow[];
  canWrite: boolean;
  onToggle: (row: SubscriptionRow) => void;
}) {
  return (
    <table className="ro-table rl-table">
      <caption className="rl-cap">{rows.length} schedule{rows.length === 1 ? '' : 's'}</caption>
      <thead>
        <tr>
          <th scope="col">Report</th>
          <th scope="col">Cadence</th>
          <th scope="col">Scope</th>
          <th scope="col">Last recorded run</th>
          <th scope="col">Next run</th>
          <th scope="col">State</th>
          <th scope="col" />
        </tr>
      </thead>
      <tbody>
        {rows.map((s) => (
          <tr key={s.id}>
            <td>{s.reportTypeId}</td>
            <td>{scheduleInWords(s.schedule)}</td>
            <td>{s.scopeType} — {s.scopeId}</td>
            <td>{whenText(s.lastRunAt)}</td>
            <td>{whenText(s.nextRunAt)}{s.enabled && s.nextRunAt && new Date(s.nextRunAt).getTime() < Date.now() && <div className="rl-cell-sub">Awaiting the next successful run</div>}</td>
            <td>
              <span className="rl-tag" data-status={s.enabled ? 'final' : 'draft'}>
                {s.enabled ? 'Enabled' : 'Paused'}
              </span>
            </td>
            <td>
              {canWrite ? (
                <button type="button" className="rc-chip" onClick={() => onToggle(s)}>
                  {s.enabled ? <>{I.pause} Pause</> : <>{I.play} Resume</>}
                </button>
              ) : null}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** The three honest outcomes of the read, and the table when there is one. */
function SchedulesBody({
  loading,
  failure,
  rows,
  canWrite,
  onToggle,
  onRetry,
}: {
  loading: boolean;
  failure: ReadFailure | null;
  rows: SubscriptionRow[];
  canWrite: boolean;
  onToggle: (row: SubscriptionRow) => void;
  onRetry: () => void;
}) {
  if (loading) return <EmptyState busy icon={I.calendar} title="Reading your schedules…" />;
  if (failure) {
    return (
      <ErrorState
        title={failure.title}
        message={failure.message}
        {...(failure.retryable ? { retry: onRetry } : {})}
        testId="rl-schedules-error"
      />
    );
  }
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={I.calendar}
        title="No scheduled reports"
        hint="Choose a supported report and its cadence. Successful runs appear in Run history and the platform inbox; failed delivery leaves the occurrence pending."
        testId="rl-schedules-empty"
      />
    );
  }
  return <ScheduleTable rows={rows} canWrite={canWrite} onToggle={onToggle} />;
}

export function SchedulesPanel({
  types,
  scope,
  canWrite,
  onSaved,
  canSchedule = true,
}: {
  types: LibraryReportType[];
  scope: { scopeType: string; scopeId: string } | null;
  canWrite: boolean;
  onSaved: (msg: string) => void;
  canSchedule?: boolean;
}) {
  const [attempt, setAttempt] = useState(0);
  const subs = useLiveData<unknown>('/api/insights/subscriptions', ['/api/insights/subscriptions', attempt], isRowList);
  const rows = useMemo(() => rowsOf<SubscriptionRow>(subs.data), [subs.data]);
  const offerable = useMemo(() => schedulableTypes(types).filter(t => (t.runScopeType && t.runScopeId) || (scope && t.computedScopes.includes(scope.scopeType))), [types, scope]);

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [note, setNote] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const selected = offerable.find(t => t.typeId === draft.typeId);
  const formScope = targetForType(selected ?? offerable[0], scope);
  const mayCreate = canWrite && canSchedule && offerable.length > 0;

  const save = async () => {
    if (!formScope || !selected || !canSchedule) return;
    const problem = scheduleProblem(draft);
    if (problem) { setNote(problem); return; }
    setSaving(true);
    setNote(null);
    const res = await createSubscription(scheduleBody(draft, formScope));
    setSaving(false);
    if (!res.ok) {
      setNote(res.message ?? 'The schedule was not saved.');
      return;
    }
    setOpen(false);
    setDraft(EMPTY_DRAFT);
    setAttempt((n) => n + 1);
    onSaved('Schedule saved.');
  };

  const toggleEnabled = async (row: SubscriptionRow) => {
    setNote(null);
    const res = await setSubscriptionEnabled(row.id, !row.enabled);
    if (!res.ok) {
      setNote(res.message ?? 'The schedule was not changed.');
      return;
    }
    setAttempt((n) => n + 1);
    onSaved(row.enabled ? 'Schedule paused.' : 'Schedule resumed.');
  };

  return (
    <div className="rl">
      <PanelHead
        title="Schedules"
        sub="Reports this organization computes on a recurring cadence."
        actions={
          mayCreate ? (
            <button type="button" className="btn primary" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
              {I.plus} New schedule
            </button>
          ) : null
        }
      />

      <ScheduleTruthNote />
      <ScheduleCapabilityNotice canWrite={canWrite} canSchedule={canSchedule} />
      <PanelAlert note={note} />

      {open && formScope && (
        <ScheduleForm
          offerable={offerable}
          scope={formScope}
          draft={draft}
          setDraft={setDraft}
          saving={saving}
          onSave={() => void save()}
          onCancel={() => setOpen(false)}
        />
      )}

      {canWrite && offerable.length === 0 && <NothingSchedulable />}

      <SchedulesBody
        loading={subs.loading}
        failure={subs.error ? readFailureOf(subs, 'your schedules') : null}
        rows={rows}
        canWrite={canWrite}
        onToggle={(row) => void toggleEnabled(row)}
        onRetry={() => setAttempt((n) => n + 1)}
      />
    </div>
  );
}

function ScheduleCapabilityNotice({ canWrite, canSchedule }: { canWrite: boolean; canSchedule: boolean }) {
  if (!canWrite) return <ViewOnlyNote action="Creating or pausing a schedule" />;
  if (canSchedule) return null;
  return <div className="ro-dash-note" role="note">{I.lock} Scheduled reports require your organization’s Professional or Enterprise plan.</div>;
}
