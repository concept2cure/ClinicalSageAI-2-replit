import React from 'react';

export interface PortfolioClient { id: number; name: string }

/** The read exposes minimal authorized choices, never an org-wide directory. */
export function portfolioClients(meta: Record<string, unknown> | undefined): PortfolioClient[] {
  return Array.isArray(meta?.clients) ? meta.clients.filter(
    (client): client is PortfolioClient => client !== null && typeof client === 'object'
      && Number.isSafeInteger(client.id) && client.id > 0 && typeof client.name === 'string' && client.name.trim() !== '',
  ) : [];
}

export function portfolioClientContext(value: string, clients: PortfolioClient[], meta: Record<string, unknown> | undefined) {
  const selected = clients.find(client => String(client.id) === value);
  const hasMore = meta?.clientsHasMore === true;
  const all = value === 'all';
  return {
    active: !all,
    hasMore,
    empty: { title: all ? 'No projects yet' : 'No projects for this client', hint: all
      ? 'Create a regulatory project and it appears here, for every client type: medical device & IVD, biotech and pharma.'
      : 'Choose another client or clear the client filter to see your other projects.' },
    description: all ? null : `client "${selected?.name ?? 'selected client'}"`,
    facts: { clientWorkspaceFilter: value, clients: clients.slice(0, 12), clientChoicesTruncated: clients.length > 12 || hasMore },
  };
}

/** Keep clearing available when a filtered read fails and returns no choices.
 *
 * One select in the Projects toolbar (D2 §1.4 item 4): its accessible name is
 * "Client", with no visible label beside it, in line with the search and the
 * other filters. The note that the choices stop at the first 200 is
 * `ClientChoicesNote`, which Projects renders under the toolbar. */
export function ProjectClientFilter({ value, clients, onChange }: {
  value: string; clients: PortfolioClient[]; onChange: (value: string) => void;
}) {
  const selected = clients.some(client => String(client.id) === value);
  if (clients.length <= 1 && value === 'all') return null;
  return <select className="c2c-input pj-filter" aria-label="Client" value={value} onChange={event => onChange(event.target.value)}>
    <option value="all">All clients</option>
    {value !== 'all' && !selected && <option value={value}>Selected client</option>}
    {clients.map(client => <option key={client.id} value={String(client.id)}>{client.name}</option>)}
  </select>;
}

/** The client choices are the first 200 the server returned, and say so. */
export function ClientChoicesNote({ hasMore }: { hasMore: boolean }) {
  return hasMore ? <p className="scaf-note" role="status">The client selector shows the first 200 accessible clients.</p> : null;
}
