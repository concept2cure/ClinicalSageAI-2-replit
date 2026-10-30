/**
 * A tracked device filing's history (D2, fold F5 item 1, 2026-10-30; decision
 * P-61 item 1; docs/evidence/D2-ONE-ANA/2026-10-29/fold-f5-device-filing/).
 *
 * Submission Center shows it under the filing's record (TrackedFilingDetail),
 * when a filing is opened from the device filings. GET
 * /api/510k/estar/submissions/:id/events reads estar_submission_events, which
 * the filing service writes with each change on its transaction: the start of
 * tracking, each status change, the signed filing, and, for a filing migrated
 * from a submission package, the package and its milestones, where the retired
 * device-submission screen's milestone log lives now.
 *
 * @module client/src/concept2cure/v2/surfaces/TrackedFilingHistory
 */
import React, { useEffect, useState } from 'react';
import { apiRequest } from '@/lib/queryClient';
import { ESTAR_FILING_STATUS } from './DeviceFilings';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function RecordedDate({ value }: { value: string }) {
  return <time dateTime={value}>{new Date(value).toLocaleString()}</time>;
}

interface FilingEvent {
  id: number;
  eventType: string;
  fromStatus: string | null;
  toStatus: string | null;
  actorUserId: number | null;
  actorName?: string | null;
  detail: Record<string, unknown>;
  occurredAt: string;
}

type HistoryState =
  | { id: string; kind: 'loading' }
  | { id: string; kind: 'error' }
  | { id: string; kind: 'ready'; events: FilingEvent[] };

const isFilingEvent = (value: unknown): value is FilingEvent =>
  isRecord(value) && typeof value.id === 'number' && typeof value.eventType === 'string' && typeof value.occurredAt === 'string';

const statusLabel = (s: string | null) => (s ? ESTAR_FILING_STATUS[s]?.l ?? s : '—');
const text = (v: unknown) => (typeof v === 'string' && v ? v : null);

/** What happened, in words, from the recorded event only. */
export function describeFilingEvent(e: FilingEvent): string {
  const d = e.detail ?? {};
  switch (e.eventType) {
    case 'created':
      return `Tracking started at ${statusLabel(e.toStatus)}${text(d.catalogKey) ? ` (${d.catalogKey as string})` : ''}`;
    case 'status_changed':
      return `Status changed from ${statusLabel(e.fromStatus)} to ${statusLabel(e.toStatus)}`;
    case 'filed':
      return `Filed, signed against the retained eSTAR${text(d.artifactSha256) ? ` (SHA-256 ${(d.artifactSha256 as string).slice(0, 12)}…)` : ''}`;
    case 'imported_package':
      return `Migrated from submission package ${text(d.packageId) ?? '—'}${text(d.packageStatus) ? ` (package recorded ${d.packageStatus as string})` : ''}`;
    case 'imported_milestone':
      return `Package milestone: ${text(d.title) ?? 'untitled'}${text(d.gateStatus) ? ` (${d.gateStatus as string})` : ''}`;
    default:
      return e.eventType;
  }
}

/** Who acted: the recorded name, else the recorded id, else the unknown-value dash. Never a stand-in name. */
const actorOf = (e: FilingEvent) => e.actorName || (e.actorUserId != null ? `User #${e.actorUserId}` : '—');

/** The filing's history, oldest first, from the record only. */
export function TrackedFilingHistory({ filingId }: { filingId: string }) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<HistoryState>({ id: filingId, kind: 'loading' });
  useEffect(() => {
    let active = true;
    setState({ id: filingId, kind: 'loading' });
    const load = async () => {
      try {
        const response = await apiRequest('GET', `/api/510k/estar/submissions/${encodeURIComponent(filingId)}/events`);
        const body: unknown = response.ok ? await response.json().catch(() => null) : null;
        const events = isRecord(body) && Array.isArray(body.events) ? body.events : null;
        if (!active) return;
        setState(response.ok && events && events.every(isFilingEvent)
          ? { id: filingId, kind: 'ready', events }
          : { id: filingId, kind: 'error' });
      } catch {
        if (active) setState({ id: filingId, kind: 'error' });
      }
    };
    void load();
    return () => { active = false; };
  }, [filingId, attempt]);
  const current: HistoryState = state.id === filingId ? state : { id: filingId, kind: 'loading' };
  return <section className="pj-card" data-testid="tracked-filing-history" aria-label="Tracked filing history">
    <div className="pj-card-h"><h2 className="t">History</h2></div>
    <div className="pj-card-b">
    {current.kind === 'loading' ? <p role="status">Loading the filing's history…</p>
      : current.kind === 'error' ? <div>
        <p role="alert">Couldn&apos;t read this filing&apos;s history.</p>
        <button type="button" className="pj-card-h-go" onClick={() => setAttempt((n) => n + 1)}>Retry history</button>
      </div>
        : current.events.length === 0
          ? <p className="sp-state">No events are recorded for this filing. Its history begins with the changes made after 30 October 2026.</p>
          : <ol aria-label="Filing history">
            {current.events.map((e) => <li key={e.id}>
              <RecordedDate value={e.occurredAt} /> · {actorOf(e)} · {describeFilingEvent(e)}
            </li>)}
          </ol>}
    </div>
  </section>;
}
