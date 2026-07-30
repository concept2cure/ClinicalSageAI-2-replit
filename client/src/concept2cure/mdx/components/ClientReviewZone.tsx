/**
 * ClientReviewZone — the read-first Client Review Room (MDX-CLIENT-01).
 *
 * Renders the tasks a paying client is allowed to see, grouped by their
 * client_visibility state:
 *
 *   client_action_required  → "Needs your action"
 *   client_visible          → "Shared for review"
 *   authority_ready         → "Ready for authority"
 *
 * Internal work never reaches this zone: GET /api/mdx/client-review filters
 * by a SQL whitelist of the three states above, so `internal` rows are
 * excluded server-side, not hidden client-side.
 *
 * Read-first by design — no classification writes, no commenting. Every
 * group renders through DataGate so loading / error / empty states are
 * declared honestly, never papered over with example content. The zone
 * labels its tenancy (organization-wide vs one project) per the kit's
 * scope-honesty convention.
 */

import * as React from 'react';
import { I } from '../icons';
import { DataGate } from './DataGate';
import {
  useClientReview,
  type ClientReviewTask,
} from '../hooks/useClientReview';

interface GroupSpec {
  key: 'actionRequired' | 'visible' | 'authorityReady';
  title: string;
  /** Lowercase noun for DataGate's state sentences. */
  label: string;
  emptyHint: string;
}

const GROUPS: GroupSpec[] = [
  {
    key: 'actionRequired',
    title: 'Needs your action',
    label: 'tasks needing client action',
    emptyHint: 'Nothing is waiting on the client right now.',
  },
  {
    key: 'visible',
    title: 'Shared for review',
    label: 'shared tasks',
    emptyHint: 'No tasks have been shared for client review yet.',
  },
  {
    key: 'authorityReady',
    title: 'Ready for authority',
    label: 'authority-ready tasks',
    emptyHint: 'No tasks have been marked ready for the authority yet.',
  },
];

export interface ClientReviewZoneProps {
  /** Narrow the room to one project (unified_tasks.project_id). */
  projectId?: number | null;
  /** Echoed through to the endpoint for kit-surface parity. */
  programId?: string | null;
}

export function ClientReviewZone({ projectId, programId }: ClientReviewZoneProps) {
  const room = useClientReview({ projectId: projectId ?? null, programId: programId ?? null });

  const scopeLabel =
    room.scope === 'project'
      ? 'Scoped to the selected project'
      : 'Organization-wide';

  return (
    <section className="crz" aria-label="Client review">
      <div className="section-hdr">
        <div>
          <div className="section-title">Client review</div>
          <div className="section-sub">
            What the client sees, grouped by state · {scopeLabel}
            {room.total > 0 ? ` · ${room.total} task${room.total === 1 ? '' : 's'}` : ''}
          </div>
        </div>
      </div>
      <div className="crz-groups">
        {GROUPS.map((g) => {
          const state = room[g.key];
          return (
            <div key={g.key} className="crz-group">
              <div className="crz-group-hdr">
                <span className="crz-group-title">{g.title}</span>
                {state.status === 'ready' && (
                  <span className="crz-group-count">{state.data.length}</span>
                )}
              </div>
              <DataGate
                state={state}
                label={g.label}
                onRetry={room.refresh}
                emptyHint={g.emptyHint}
                dense
              >
                {(rows) => (
                  <ul className="crz-list">
                    {rows.map((t) => (
                      <ClientReviewRow key={t.taskId} task={t} />
                    ))}
                  </ul>
                )}
              </DataGate>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ClientReviewRow({ task }: { task: ClientReviewTask }) {
  const due = formatDue(task.dueDate, task.status);
  return (
    <li className="crz-row">
      <span className="crz-row-icon" aria-hidden>
        {task.status === 'completed' ? I.check : I.circle}
      </span>
      <span className="crz-row-main">
        <span className="crz-row-title">{task.title}</span>
        <span className="crz-row-meta">
          {task.filingType && <span>{task.filingType}</span>}
          {task.market && <span>{task.market}</span>}
          {task.lifecyclePhase && <span>{task.lifecyclePhase.replace(/_/g, ' ')}</span>}
          <span>{task.status.replace(/-/g, ' ')}</span>
        </span>
      </span>
      {due && <span className={`crz-row-due${due.overdue ? ' overdue' : ''}`}>{due.text}</span>}
    </li>
  );
}

/** Compact due label; null when there is no deadline (never fabricated). */
function formatDue(
  dueDate: string | null,
  status: string,
): { text: string; overdue: boolean } | null {
  if (status === 'completed') return { text: 'done', overdue: false };
  if (!dueDate) return null;
  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) return null;
  const text = due.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return { text, overdue: due.getTime() < Date.now() };
}
