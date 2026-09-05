/**
 * Access requests — the queue where a colleague's ask lands.
 *
 * WHAT THIS IS FOR. A member who opens a locked app gets an honest panel: the
 * app, the reason, the plan that would include it. If they cannot buy — and
 * most people cannot — the panel used to stop there. It now lets them ask, and
 * this is where the ask arrives: an administrator sees who wants what, in their
 * own words, and answers it.
 *
 * ── ONE IMPLEMENTATION, TWO SCOPES ───────────────────────────────────────────
 * `scope="organization"` is the administrator's own workspace. `scope="all"` is
 * the platform owner's cross-workspace view, rendered inside the licensing
 * console by ./licensing/AccessRequestsPanel. They are the same queue with the
 * same governed answer, so they are the same component; the scope changes the
 * read, one column, and nothing else. Two copies would be two places for the
 * approval flow to drift apart.
 *
 * ── EVERY ANSWER IS GOVERNED ─────────────────────────────────────────────────
 * Approve and decline both go through `<GovernedConfirmDialog minReason={3}>` —
 * the shared reason-for-change modal, with the floor set to exactly the server's
 * own, so the client never refuses a write the API allows nor sends one it will
 * reject. The reason is stored with the decision and written to the Part 11
 * chain by the server.
 *
 * ── FAIL CLOSED ──────────────────────────────────────────────────────────────
 * "The queue could not be loaded" and "nobody is waiting" are opposite facts,
 * and an administrator who reads the first as the second stops checking. A
 * failed read renders `<ErrorState>` with a retry and no table at all; a real
 * zero renders the empty state. A shape guard sends a 200 that is not the
 * documented payload down the same failure path rather than casting it into a
 * lie about the type. A refused write reverts nothing optimistically, because
 * nothing here is optimistic: the outcome of an approval is a grant, and a row
 * that says granted when the server refused is the worst thing this screen
 * could show.
 */
import React from 'react';
import { I } from '../icons';
import { useLiveData, ErrorState, EmptyState, hasKeys } from '../dataConnect';
import { usePublishSurfaceContext } from '../surfaceContext';
import { useSurfaceActionHandlers } from '../surfaceActions';
import { ceremonyOpen } from '../ceremony';
import { apiCall, apiErrorText } from '../apiCall';
import { C2CToast, useToast } from '../toast';
import {
  GovernedConfirmDialog,
  type ConfirmConfig,
} from '../../_shared/components/GovernedConfirmDialog';
import '../styles/misc-surfaces-v2.css';
import '../styles/licensing-access-requests.css';

/* ── The server contract, as this surface reads it ─────────────────────────── */

export type AccessRequestStatus = 'open' | 'approved' | 'declined';

export interface AccessRequestRow {
  id: number;
  organizationId: number;
  organizationName: string | null;
  moduleId: string;
  moduleName: string | null;
  requestedBy: number;
  requesterEmail: string | null;
  requesterName: string | null;
  note: string | null;
  status: AccessRequestStatus;
  decidedByEmail: string | null;
  decidedAt: string | null;
  decisionReason: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

interface QueuePayload {
  scope: 'organization' | 'all';
  requests: AccessRequestRow[];
  openCount: number;
  truncated: boolean;
}

const QUEUE_PATH = '/api/module-access-requests';

/** Absolute, never relative. "3 days ago" is a claim about a clock the reader
 *  cannot see, and it becomes wrong on a page left open. */
function whenText(iso: string | null): string {
  if (!iso) return 'Date not recorded';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Date not recorded';
  return d.toLocaleDateString(undefined, { dateStyle: 'medium' });
}

/** Who asked, in whatever the record actually holds. Never an invented name. */
function requesterText(r: AccessRequestRow): string {
  return r.requesterName || r.requesterEmail || `Member ${r.requestedBy}`;
}

function statusTone(status: AccessRequestStatus): 'ok' | 'warn' | 'off' {
  if (status === 'approved') return 'ok';
  if (status === 'open') return 'warn';
  return 'off';
}

function statusLabel(status: AccessRequestStatus): string {
  if (status === 'approved') return 'Approved';
  if (status === 'declined') return 'Declined';
  return 'Waiting';
}

type Pending = {
  config: ConfirmConfig;
  id: number;
  decision: 'approved' | 'declined';
  label: string;
};

/* ── The queue ─────────────────────────────────────────────────────────────── */

export function AccessRequestQueue({ scope }: { scope: 'organization' | 'all' }) {
  const [reload, setReload] = React.useState(0);
  const [showAnswered, setShowAnswered] = React.useState(false);
  const [pending, setPending] = React.useState<Pending | null>(null);
  const [busyId, setBusyId] = React.useState<number | null>(null);
  const [toast, fireToast] = useToast();

  const path = `${QUEUE_PATH}?scope=${scope}&status=${showAnswered ? 'all' : 'open'}`;
  const live = useLiveData<QueuePayload>(
    path,
    [path, reload],
    hasKeys<QueuePayload>('requests', 'scope'),
  );

  const rows = Array.isArray(live.data?.requests) ? live.data!.requests : [];
  const openCount = rows.filter((r) => r.status === 'open').length;

  /* WHAT ANA SEES HERE. Published only for the organization scope — the 'all'
     scope of this same component is mounted INSIDE master-licensing, and a
     publish from there would stamp that surface with this id. Never the
     requester, the decider, or the note: a summary that names a member beside
     a missing grant is a pre-armed grant sentence, and the note is third-party
     prose. */
  const truncated = live.data?.truncated === true;
  const anaContext = React.useMemo(() => {
    if (live.loading) {
      return { summary: 'The access-request queue is still loading; nothing on screen is final yet.' };
    }
    if (live.error) {
      return {
        summary:
          'The access-request queue could not be read — a failed read, not an empty queue; do not report that nobody is waiting.',
        facts: { readFailure: live.error },
        availableActions: ['Retry the access-request read'],
      };
    }
    if (rows.length === 0) {
      return showAnswered
        ? {
            summary: 'No access requests exist for this workspace at all — nobody has asked for an app yet.',
            facts: { openCount: 0, shownCount: 0, showAnswered, truncated },
          }
        : {
            summary: 'No requests waiting; everything asked for so far has been answered.',
            facts: { openCount: 0, shownCount: 0, showAnswered, truncated },
            availableActions: ['Switch the filter between Waiting and Everything (view state only)'],
          };
    }
    return {
      summary:
        `Access requests: ${openCount} waiting of ${rows.length} shown, filtered to ` +
        `${showAnswered ? 'Everything' : 'Waiting'}${truncated ? '; only the most recent are shown' : ''}.`,
      facts: {
        openCount,
        shownCount: rows.length,
        showAnswered,
        truncated,
        requestedModules: rows.slice(0, 10).map((r) => ({
          moduleId: r.moduleId,
          moduleName: r.moduleName,
          status: r.status,
        })),
      },
      availableActions: [
        'Switch the filter between Waiting and Everything (view state only)',
        'Approving or declining a waiting request is a governed decision the administrator makes under a recorded reason — the outcome of an approval is a grant.',
      ],
    };
  }, [live.loading, live.error, rows, openCount, showAnswered, truncated]);
  /* Registered only for the administrator's own queue. The identical
     component also renders as a master-licensing tab (scope="all"), and the
     bus is a single slot — claiming it there would answer for a screen the
     user is not on. Approving and declining stay governed decisions behind
     their reason dialog; only the queue's own filter is driven. */
  useSurfaceActionHandlers(scope === 'organization' ? 'access-requests' : null, {
    'access-requests.set-filter': (params) => {
      const target = String(params.show ?? '');
      if (target !== 'waiting' && target !== 'everything') {
        return { ok: false, reason: `No access-request filter named "${params.show}".` };
      }
      const want = target === 'everything';
      if (showAnswered === want) {
        return { ok: true, detail: `Already showing ${target === 'waiting' ? 'waiting requests' : 'every request'}` };
      }
      if (ceremonyOpen()) {
        return {
          ok: false,
          reason:
            'A decision dialog is open on this screen — changing the filter would discard it. ' +
            'Let the person finish or cancel it first.',
        };
      }
      setShowAnswered(want);
      return {
        ok: true,
        detail: want ? 'Showing every request, answered included' : 'Showing only requests still waiting',
      };
    },
  });

  usePublishSurfaceContext('access-requests', scope === 'organization' ? anaContext : null);

  const ask = (row: AccessRequestRow, decision: 'approved' | 'declined') => {
    const app = row.moduleName || row.moduleId;
    setPending({
      id: row.id,
      decision,
      label: app,
      config: {
        action: decision === 'approved' ? 'Approve access' : 'Decline access',
        target:
          scope === 'all' && row.organizationName
            ? `${app} · ${requesterText(row)} · ${row.organizationName}`
            : `${app} · ${requesterText(row)}`,
        resource: row.moduleId,
        // Exactly the server's floor. Stricter would refuse writes the platform
        // allows; looser would produce a round trip that can only fail.
        minReason: 3,
      },
    });
  };

  const run = async ({ reason }: { reason: string }) => {
    const action = pending;
    if (!action) return;
    setPending(null);
    setBusyId(action.id);
    const res = await apiCall('POST', `${QUEUE_PATH}/${action.id}/decision`, {
      decision: action.decision,
      reason,
    });
    setBusyId(null);
    if (!res.ok) {
      fireToast(apiErrorText(res, 'The decision was not recorded.'), 'error');
      // Re-read either way: a 409 means somebody else answered it, and the row
      // on screen is stale in a way only the server can correct.
      setReload((n) => n + 1);
      return;
    }
    fireToast(
      action.decision === 'approved'
        ? `${action.label} is now available to this workspace.`
        : `${action.label} was declined.`,
    );
    setReload((n) => n + 1);
  };

  const cols =
    scope === 'all' ? 'ml-table ml-table-requests-all' : 'ml-table ml-table-requests';

  return (
    <div className="mar-surface">
      <section className="ml-sec">
        <div className="ml-banner">
          <span className="ml-banner-ic" aria-hidden="true">
            {I.info}
          </span>
          <p>
            {scope === 'all'
              ? 'Requests from every workspace. Approving turns the app on for that workspace and records who approved it and why. Declining records the reason and changes nothing.'
              : 'People in your workspace who asked for an app they cannot open. Approving turns the app on for the whole workspace and records who approved it and why. Declining records the reason and changes nothing.'}
          </p>
        </div>

        <div className="ml-toolbar">
          <div className="ml-field">
            <span className="ml-label" id="mar-filter-label">
              Show
            </span>
            <div className="ml-seg" role="group" aria-labelledby="mar-filter-label">
              <button
                type="button"
                className="ml-seg-btn"
                data-on={!showAnswered ? '' : undefined}
                aria-pressed={!showAnswered}
                onClick={() => setShowAnswered(false)}
              >
                {!showAnswered && (
                  <span className="ml-seg-tick" aria-hidden="true">
                    {I.check}
                  </span>
                )}
                Waiting
              </button>
              <button
                type="button"
                className="ml-seg-btn"
                data-on={showAnswered ? '' : undefined}
                aria-pressed={showAnswered}
                onClick={() => setShowAnswered(true)}
              >
                {showAnswered && (
                  <span className="ml-seg-tick" aria-hidden="true">
                    {I.check}
                  </span>
                )}
                Everything
              </button>
            </div>
          </div>
          {!live.loading && !live.error && (
            <span className="ml-count">
              {openCount === 1 ? '1 request waiting' : `${openCount} requests waiting`}
            </span>
          )}
        </div>

        {live.loading && <div role="status" className="ml-loading">Loading requests…</div>}

        {/* A failed read shows no table. "Could not load" and "nobody is
            waiting" are opposite facts and this screen never conflates them. */}
        {!live.loading && live.error && (
          <ErrorState
            title="Could not load access requests."
            message={live.error}
            retry={() => setReload((n) => n + 1)}
          />
        )}

        {!live.loading && !live.error && rows.length === 0 && (
          <EmptyState
            title={showAnswered ? 'No requests yet' : 'No requests waiting'}
            hint={
              showAnswered
                ? 'When somebody asks for an app they cannot open, the request appears here.'
                : 'Everything asked for so far has been answered.'
            }
            icon={I.clipboardList}
            regulation="Serves the 21 CFR Part 11 record of who was granted an app, by whom, and why."
            {...(showAnswered
              ? {}
              : { action: { label: 'Show answered requests', onAct: () => setShowAnswered(true) } })}
          />
        )}

        {!live.loading && !live.error && rows.length > 0 && (
          <>
            {live.data?.truncated && (
              <p className="ml-sub">
                Only the most recent requests are shown. Answer some to see the rest.
              </p>
            )}
            <div className="ml-scroll">
              <div className={cols} role="table" aria-label="Access requests">
                <div className="ml-thead" role="row">
                  {scope === 'all' && <span role="columnheader">Workspace</span>}
                  <span role="columnheader">Who asked</span>
                  <span role="columnheader">App</span>
                  <span role="columnheader">Asked</span>
                  <span role="columnheader">Answer</span>
                </div>
                {rows.map((r) => (
                  <div className="ml-row" role="row" key={r.id}>
                    {scope === 'all' && (
                      <div role="cell">
                        <div className="ml-name">{r.organizationName ?? 'Unknown workspace'}</div>
                      </div>
                    )}
                    <div role="cell">
                      <div className="ml-name">{requesterText(r)}</div>
                      {r.requesterName && r.requesterEmail && (
                        <div className="ml-sub">{r.requesterEmail}</div>
                      )}
                      {r.note && <p className="mar-note">{r.note}</p>}
                    </div>
                    <div role="cell">
                      <div className="ml-name">{r.moduleName ?? r.moduleId}</div>
                      {/* Status is text plus a chip shape, never colour alone. */}
                      <div className="ml-sub">
                        <span className="ml-chip" data-tone={statusTone(r.status)}>
                          {statusLabel(r.status)}
                        </span>
                      </div>
                    </div>
                    <div role="cell" className="ml-sub">
                      {whenText(r.createdAt)}
                    </div>
                    <div role="cell">
                      {r.status === 'open' ? (
                        <div className="mar-acts">
                          <button
                            type="button"
                            className="btn primary"
                            disabled={busyId === r.id}
                            onClick={() => ask(r, 'approved')}
                          >
                            Approve
                            <span className="mar-vh">
                              {` ${r.moduleName ?? r.moduleId} for ${requesterText(r)}`}
                            </span>
                          </button>
                          <button
                            type="button"
                            className="btn ghost"
                            disabled={busyId === r.id}
                            onClick={() => ask(r, 'declined')}
                          >
                            Decline
                            <span className="mar-vh">
                              {` ${r.moduleName ?? r.moduleId} for ${requesterText(r)}`}
                            </span>
                          </button>
                        </div>
                      ) : (
                        <div className="mar-answer">
                          <b>{statusLabel(r.status)}</b>
                          {` on ${whenText(r.decidedAt)}`}
                          {r.decidedByEmail ? ` by ${r.decidedByEmail}` : ''}
                          {r.decisionReason ? ` — ${r.decisionReason}` : ''}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </section>

      {pending && (
        <GovernedConfirmDialog
          open
          {...pending.config}
          onCancel={() => setPending(null)}
          onConfirm={run}
        />
      )}
      <C2CToast msg={toast} />
    </div>
  );
}

/** The org administrator's queue — their own workspace. */
export function AccessRequests() {
  return <AccessRequestQueue scope="organization" />;
}

export default AccessRequests;
