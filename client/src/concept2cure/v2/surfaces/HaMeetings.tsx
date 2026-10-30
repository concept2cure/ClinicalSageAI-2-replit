/**
 * Recording and moving a health-authority meeting from Communication's Meetings
 * tab (P-39 step 4, 2026-10-30). Both write through the governed
 * /api/ha-interactions routes: a reason and an audit entry for each, and a
 * meeting on a submission only by someone who may change its project.
 *
 * The moves offered are the lifecycle's own (shared/regulatory/ha-interaction-lifecycle.ts),
 * which the server enforces: a form never proposes a move it refuses.
 *
 * @module client/src/concept2cure/v2/surfaces/HaMeetings
 */
import React from 'react';
import { C2CForm } from '../C2CForm';
import { useLiveRows } from '../dataConnect';
import { ApiRequestError, apiRequest, assertApiResponseOk } from '@/lib/queryClient';
import { CC_INTERACTION_TYPES } from '../fixtures/commcenter';
import { programSubmissionsPath, type MarketSubmission } from './programSequence';
import { agencyCommsPath, submissionLabel, type CommRow } from './AgencyInbox';
import {
  HA_INTERACTION_DATE_FOR, HA_INTERACTION_NEXT, HA_INTERACTION_STATUS_LABEL, isHaInteractionStatus, type HaInteractionStatus,
} from '@shared/regulatory/ha-interaction-lifecycle';

type Fire = (message: string, tone?: 'ok' | 'error') => void;
const AGENCIES = [
  { value: 'fda', label: 'FDA' }, { value: 'ema', label: 'EMA' }, { value: 'pmda', label: 'PMDA' },
  { value: 'mhra', label: 'MHRA' }, { value: 'other', label: 'Other' },
];
const failure = (e: unknown) => (e instanceof ApiRequestError && e.message ? e.message : 'the service could not be reached');

/** The statuses a meeting in `status` may move to; none for a closed or cancelled one. */
export function meetingMoves(status: string): readonly HaInteractionStatus[] {
  return isHaInteractionStatus(status) ? HA_INTERACTION_NEXT[status] : [];
}

export function RecordMeetingForm({ projectId, fire, onCancel, onRecorded }: {
  projectId: string | null; fire: Fire; onCancel: () => void; onRecorded: () => void;
}) {
  const submissions = useLiveRows<MarketSubmission>(projectId ? programSubmissionsPath(projectId) : null, [projectId]);
  const submissionOptions = submissions.rows.map((s) => ({ value: String(s.id), label: submissionLabel(s) }));
  const record = async (v: Record<string, string>) => {
    try {
      const res = await apiRequest('POST', '/api/ha-interactions/interactions', {
        interactionType: v.interactionType, agency: v.agency, title: v.title,
        ...(v.objective ? { objective: v.objective } : {}),
        ...(v.submissionId ? { submissionId: Number(v.submissionId) } : {}),
        ...(v.requestedDate ? { requestedDate: v.requestedDate } : {}),
        ...(v.scheduledDate ? { scheduledDate: v.scheduledDate } : {}),
        reason: v.reason,
      });
      if (!res.ok) await assertApiResponseOk(res);
      fire('Meeting recorded, with an audit entry.');
      onRecorded();
    } catch (e) {
      fire(`Meeting not recorded: ${failure(e)}. Nothing was stored.`, 'error');
    }
  };
  return (
    <C2CForm
      config={{
        eyebrow: 'Health-authority meetings',
        title: 'Record a meeting',
        sub: 'A meeting requested from, granted by or held with an agency. Its briefing book is written in the editor, from the IND screen.',
        governed: 'Recorded with your reason in the audit trail. A meeting on a submission is recorded only by someone who may change its project.',
        submitLabel: 'Record meeting',
        fields: [
          { key: 'interactionType', label: 'Meeting type', type: 'select', required: true, half: true,
            options: Object.entries(CC_INTERACTION_TYPES).map(([value, label]) => ({ value, label })) },
          { key: 'agency', label: 'Agency', type: 'select', required: true, half: true, options: AGENCIES },
          { key: 'title', label: 'Title', type: 'text', required: true, placeholder: 'e.g. Pre-IND meeting, BX-301' },
          { key: 'objective', label: 'Objective', type: 'textarea' },
          ...(projectId ? [{
            key: 'submissionId', label: 'Submission', type: 'select' as const, options: submissionOptions,
            desc: submissions.loading ? "Reading this project's submissions…"
              : submissions.error ? "This project's submissions could not be read, so none can be named now."
                : 'Leave it empty for a meeting that concerns no submission yet.',
          }] : []),
          { key: 'requestedDate', label: 'Requested on', type: 'date', half: true },
          { key: 'scheduledDate', label: 'Scheduled for', type: 'date', half: true },
          { key: 'reason', label: 'Reason', type: 'text', required: true },
        ],
      }}
      onCancel={onCancel}
      onSubmit={(v) => void record(v)}
    />
  );
}

export function MoveMeetingForm({ meeting, fire, onCancel, onMoved }: {
  meeting: { id: number; title: string; status: string; project_id?: number | null }; fire: Fire; onCancel: () => void; onMoved: () => void;
}) {
  const moves = meetingMoves(meeting.status);
  /* The minutes are a letter in the meeting's project inbox, recorded as meeting
     minutes (P-39 step 4c). Its questions carry the agreements, its answers the
     commitments. Offered only when the meeting's minutes can be received. */
  const projectId = meeting.project_id != null && moves.includes('minutes_received') ? String(meeting.project_id) : null;
  const letters = useLiveRows<CommRow>(agencyCommsPath(projectId), [projectId]);
  const minutesLetters = letters.rows.filter((c) => c.sourceType === 'meeting_minutes');
  const move = async (v: Record<string, string>) => {
    const dateKey = HA_INTERACTION_DATE_FOR[v.status as HaInteractionStatus];
    try {
      const res = await apiRequest('PATCH', `/api/ha-interactions/interactions/${meeting.id}/status`, {
        status: v.status, ...(dateKey && v.date ? { [dateKey]: v.date } : {}),
        ...(v.status === 'minutes_received' && v.minutesEventId ? { minutesEventId: v.minutesEventId } : {}),
        reason: v.reason,
      });
      if (!res.ok) await assertApiResponseOk(res);
      fire(`Meeting moved to ${HA_INTERACTION_STATUS_LABEL[v.status as HaInteractionStatus]?.toLowerCase() ?? v.status}, with an audit entry.`);
      onMoved();
    } catch (e) {
      fire(`Meeting not moved: ${failure(e)}. Nothing was changed.`, 'error');
    }
  };
  return (
    <C2CForm
      config={{
        eyebrow: 'Health-authority meetings',
        title: `Move ${meeting.title}`,
        sub: `Now ${HA_INTERACTION_STATUS_LABEL[meeting.status as HaInteractionStatus]?.toLowerCase() ?? meeting.status}. A meeting moves one way; closed and cancelled are final.`,
        governed: 'Recorded with your reason in the audit trail.',
        submitLabel: 'Move meeting',
        fields: [
          { key: 'status', label: 'Move to', type: 'select', required: true,
            options: moves.map((s) => ({ value: s, label: HA_INTERACTION_STATUS_LABEL[s] })) },
          { key: 'date', label: 'Date', type: 'date', desc: 'Scheduled, held and minutes received each record the date it happened.' },
          ...(projectId ? [{
            key: 'minutesEventId', label: 'Minutes letter', type: 'select' as const,
            options: minutesLetters.map((c) => ({ value: c.id, label: `${c.communicationType} · received ${c.receivedDate.slice(0, 10)}` })),
            desc: letters.loading ? "Reading this project's inbox…"
              : letters.error ? "This project's inbox could not be read, so no minutes letter can be named now."
                : minutesLetters.length ? 'The inbox letter that holds the minutes. Its questions carry the agreements, its answers the commitments.'
                  : 'No letter in this project\'s inbox is recorded as meeting minutes yet. Log the minutes in the inbox, then name it here.',
          }] : []),
          { key: 'reason', label: 'Reason', type: 'text', required: true },
        ],
      }}
      onCancel={onCancel}
      onSubmit={(v) => void move(v)}
    />
  );
}
