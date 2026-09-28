/**
 * Enterprise onboarding requests — the platform owner's read of the sales intake.
 *
 * A tab body for the Master Licensing console, so it takes no props: the
 * console mounts it and it reads its own endpoint,
 * GET /api/admin/master/enterprise-requests.
 *
 * WHY IT EXISTS (2026-09-24). Onboarding's "Request Enterprise onboarding"
 * stores a request (license_requests) and, until this panel, nothing showed it
 * to anybody: no screen listed it and no one was notified. This is the list. It
 * does not reply, decide or change a request's status — no workflow for that
 * exists yet, and inventing one here would be a product decision taken by a
 * component. Contact is by the email the prospect gave.
 *
 * HONEST STATES. A failed read is an error with a retry — never an empty list,
 * which would read as "nobody has asked" when the truth is "could not look".
 * An empty list is said as what it is, with where requests come from. The
 * server enforces who may read this; mounting it elsewhere shows a refusal, not
 * another company's contact details.
 */
import React, { useState } from 'react';
import { I } from '../../icons';
import { useLiveData, ErrorState, EmptyState, hasKeys } from '../../dataConnect';

const PATH = '/api/admin/master/enterprise-requests';

type Filter = 'pending' | 'all';

interface EnterpriseRequest {
  id: number;
  createdAt: string | null;
  name: string;
  email: string;
  organization: string;
  message: string;
  status: string;
  reviewedAt: string | null;
}

interface Payload {
  status: Filter;
  requests: EnterpriseRequest[];
  count: number;
  truncated: boolean;
  limit: number;
}

function when(iso: string | null): string {
  if (!iso) return 'Date not recorded';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? 'Date not recorded' : d.toLocaleString();
}

export function EnterpriseRequestsPanel() {
  const [filter, setFilter] = useState<Filter>('pending');
  const [reload, setReload] = useState(0);
  const state = useLiveData<Payload>(
    `${PATH}?status=${filter}`,
    [filter, reload],
    hasKeys<Payload>('requests'),
  );
  const rows = state.data?.requests ?? [];

  return (
    <section className="ml-sec" aria-labelledby="ml-enterprise-h">
      <h2 id="ml-enterprise-h" className="ml-sec-h">Enterprise onboarding requests</h2>

      <div className="ml-banner">
        <span className="ml-banner-ic" aria-hidden="true">{I.info}</span>
        <p>
          Sent from the last step of onboarding when a prospect asks for Enterprise. Nothing
          notifies anyone when a request arrives — this list is where it appears. Reply to the
          email the prospect gave.
        </p>
      </div>

      <div className="ml-toolbar">
        <div className="ml-field">
          <label className="ml-label" htmlFor="ml-enterprise-filter">Show</label>
          <select
            id="ml-enterprise-filter"
            className="ml-select"
            value={filter}
            onChange={(e) => setFilter(e.target.value as Filter)}
          >
            <option value="pending">Pending</option>
            <option value="all">All requests</option>
          </select>
        </div>
      </div>

      {state.loading ? (
        <div className="ml-loading" role="status">Loading enterprise onboarding requests…</div>
      ) : state.error ? (
        <ErrorState
          title="Couldn't load enterprise onboarding requests"
          message={state.error}
          retry={() => setReload((n) => n + 1)}
          testId="ml-enterprise-error"
        />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={I.clipboardList}
          title={filter === 'pending' ? 'No pending requests' : 'No requests yet'}
          hint="A request appears here when a prospect finishes onboarding and asks for Enterprise."
          testId="ml-enterprise-empty"
        />
      ) : (
        <>
          {state.data?.truncated && (
            <p className="ml-sub" data-testid="ml-enterprise-truncated">
              Showing the newest {state.data.limit}. Older requests are not listed here.
            </p>
          )}
          <div className="ml-scroll">
            <div className="ml-table ml-table-enterprise" role="table" aria-label="Enterprise onboarding requests">
              <div className="ml-thead" role="row">
                <span role="columnheader">Received</span>
                <span role="columnheader">Contact</span>
                <span role="columnheader">Organisation</span>
                <span role="columnheader">Message</span>
                <span role="columnheader">Status</span>
              </div>
              {rows.map((r) => (
                <div className="ml-row" role="row" key={r.id} data-testid="ml-enterprise-row">
                  <div role="cell" className="ml-sub">{when(r.createdAt)}</div>
                  <div role="cell">
                    <div className="ml-name">{r.name}</div>
                    <div className="ml-sub">
                      <a href={`mailto:${r.email}`}>{r.email}</a>
                    </div>
                  </div>
                  <div role="cell" className="ml-name">{r.organization}</div>
                  <div role="cell" className="ml-sub">{r.message || 'No message.'}</div>
                  <div role="cell">
                    <span className="ml-chip" data-tone={r.status === 'pending' ? 'warn' : 'ok'}>
                      {r.status === 'pending' ? 'Pending' : r.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </section>
  );
}

export default EnterpriseRequestsPanel;
