import React from 'react';

export interface PortfolioClient { id: number; name: string }

/** The read exposes minimal authorized choices, never an org-wide directory. */
export function portfolioClients(meta: Record<string, unknown> | undefined): PortfolioClient[] {
  return Array.isArray(meta?.clients) ? meta.clients.filter(
    (client): client is PortfolioClient => client !== null && typeof client === 'object'
      && Number.isSafeInteger(client.id) && client.id > 0 && typeof client.name === 'string' && client.name.trim() !== '',
  ) : [];
}

export function portfolioClientUrl(value: string): string {
  return value === 'all' ? '/api/c2c/projects' : `/api/c2c/projects?clientWorkspaceId=${encodeURIComponent(value)}`;
}

export function portfolioClientContext(value: string, clients: PortfolioClient[], meta: Record<string, unknown> | undefined) {
  const selected = clients.find(client => String(client.id) === value);
  const hasMore = meta?.clientsHasMore === true;
  const all = value === 'all';
  return {
    active: !all,
    hasMore,
    empty: { title: all ? 'No projects yet' : 'No projects for this client', hint: all
      ? 'Create a regulatory project and it appears here — every workstream across MDX, Biotech, and Pharma.'
      : 'Choose another client or clear the client filter to see your other projects.' },
    description: all ? null : `client "${selected?.name ?? 'selected client'}"`,
    facts: { clientWorkspaceFilter: value, clients: clients.slice(0, 12), clientChoicesTruncated: clients.length > 12 || hasMore },
  };
}

/** Keep clearing available when a filtered read fails and returns no choices. */
export function ProjectClientFilter({ value, clients, hasMore, onChange }: {
  value: string; clients: PortfolioClient[]; hasMore: boolean; onChange: (value: string) => void;
}) {
  const selected = clients.some(client => String(client.id) === value);
  return <>
    {(clients.length > 1 || value !== 'all') && <label>
      Client{' '}
      <select className="c2c-input" aria-label="Client" value={value} onChange={event => onChange(event.target.value)}>
        <option value="all">All clients</option>
        {value !== 'all' && !selected && <option value={value}>Selected client</option>}
        {clients.map(client => <option key={client.id} value={String(client.id)}>{client.name}</option>)}
      </select>
    </label>}
    {hasMore && <p className="scaf-note" role="status">The client selector shows the first 200 accessible clients.</p>}
  </>;
}
