import React, { useRef, useState } from 'react';
import type { CompanyDesignSummary } from '@shared/company-document-designs';
import { apiRequest, serverMessage } from '@/lib/queryClient';
import { useCompanyLease, useCompanySession, type CompanySession } from './company-documents/companySession';

interface StationeryProps { disabled: boolean; onChange: (id?: string) => void; current?: () => boolean }
function organizationWide(design: CompanyDesignSummary) {
  return design.state === 'published' && Boolean(design.scope)
    && ['programId', 'market', 'language', 'subsidiary'].every(key => design.scope[key as keyof typeof design.scope] === null);
}
function validDesignPage(body: unknown): body is { data: CompanyDesignSummary[]; nextBefore?: string | null } {
  const value = body as { data?: CompanyDesignSummary[] } | null;
  return Boolean(value && Array.isArray(value.data) && value.data.every(design => design && typeof design.id === 'string'
    && typeof design.name === 'string' && design.scope && typeof design.scope === 'object'));
}
async function readPublishedStationery(before: string | undefined, current: () => boolean) {
  if (!current()) return null;
  const suffix = before ? `&before=${encodeURIComponent(before)}` : '';
  const response = await apiRequest('GET', `/api/client-branding/company-documents/designs?state=published&limit=25${suffix}`);
  if (!current()) return null;
  const body = await response.json();
  if (!current()) return null;
  if (!response.ok || !validDesignPage(body)) throw new Error(serverMessage(body) ?? 'Published stationery could not be loaded.');
  return body;
}
function StationeryChoices(props: StationeryProps & { owner: CompanySession }) {
  const { owner, disabled, onChange } = props;
  const [designs, setDesigns] = useState<CompanyDesignSummary[]>([]);
  const [open, setOpen] = useState(false), [loading, setLoading] = useState(false);
  const [next, setNext] = useState<string | null>(null), [selected, setSelected] = useState('');
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(props), pending = useRef<object | null>(null);
  latest.current = props;
  const current = () => owner.current() && props.current?.() !== false && latest.current.current?.() !== false;
  const canStart = () => current() && !latest.current.disabled && !pending.current;
  const read = async (before?: string) => {
    if (!canStart()) return;
    const operation = {}; pending.current = operation;
    const isCurrent = () => current() && pending.current === operation;
    if (!before) { setSelected(''); setDesigns([]); setNext(null); onChange(undefined); }
    if (!isCurrent()) return;
    setOpen(true); setLoading(true); setError(null);
    try {
      const body = await readPublishedStationery(before, isCurrent);
      if (!body || !isCurrent()) return;
      setDesigns(currentDesigns => before ? [...currentDesigns, ...body.data.filter(design => !currentDesigns.some(prior => prior.id === design.id))] : body.data);
      setNext(typeof body.nextBefore === 'string' ? body.nextBefore : null);
    } catch (failure) {
      if (isCurrent()) setError(failure instanceof Error ? failure.message : 'Published stationery could not be loaded.');
    } finally {
      if (pending.current === operation) { pending.current = null; if (current()) setLoading(false); }
    }
  };
  const choose = (id: string) => {
    if (!canStart() || (id && !designs.some(design => design.id === id && organizationWide(design)))) return;
    setSelected(id); onChange(id || undefined);
  };
  const active = current(), blocked = disabled || !active || loading;
  return <div className="rl-filter">
    <button type="button" className="rl-card-run" disabled={blocked} onClick={() => void read()}>Choose published stationery (optional)</button>
    {open && active && <>
      <label>Report stationery
        <select className="rl-input" disabled={blocked} value={selected} onChange={event => choose(event.target.value)}>
          <option value="">Current organization reporting preference</option>
          {designs.map(design => {
            const scoped = !organizationWide(design);
            return <option key={design.id} value={design.id} disabled={scoped}>{design.name} · revision {design.publishedRevision}{scoped ? ' (requires specific target context)' : ''}</option>;
          })}
        </select>
      </label>
      <p className="rl-card-meta">An explicit published design applies to this archive only. This chooser offers organization-wide stationery; scoped designs require a matching known program, market, language and subsidiary.</p>
      {next && <button type="button" className="rl-card-run" disabled={blocked} onClick={() => void read(next)}>Load more stationery</button>}
      {loading && <p role="status">Reading published stationery…</p>}
      {error && <p role="status">{error}</p>}
    </>}
  </div>;
}

/** Report packets have no asserted agency/market/language context. */
export function InsightsPackageStationery(props: StationeryProps) {
  const session = useCompanySession();
  const owner = useCompanyLease(session, 'report-package-stationery');
  return <StationeryChoices key={owner.key} {...props} owner={owner} />;
}
