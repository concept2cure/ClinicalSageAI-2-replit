import React, { useEffect, useRef, useState } from 'react';
import type { CompanyDesignSummary } from '@shared/company-document-designs';
import { authService } from '@/services/portal/authService';
import { apiRequest, serverMessage } from '@/lib/queryClient';

/** Report packets have no asserted agency/market/language context. */
export function InsightsPackageStationery({ disabled, onChange }: { disabled: boolean; onChange: (id?: string) => void }) {
  const [designs, setDesigns] = useState<CompanyDesignSummary[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [next, setNext] = useState<string | null>(null);
  const [selected, setSelected] = useState('');
  const [error, setError] = useState<string | null>(null);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const read = async (before?: string) => {
    const session = authService.captureSessionReadGuard();
    if (!before) { setSelected(''); onChange(undefined); }
    setOpen(true); setLoading(true); setError(null);
    try {
      const suffix = before ? `&before=${encodeURIComponent(before)}` : '';
      const response = await apiRequest('GET', `/api/client-branding/company-documents/designs?state=published&limit=25${suffix}`);
      const body = await response.json();
      if (!active.current || !session.sameRevision()) return;
      if (!response.ok || !Array.isArray(body.data)) throw new Error(serverMessage(body) ?? 'Published stationery could not be loaded.');
      setDesigns(current => before ? [...current, ...body.data] : body.data);
      setNext(typeof body.nextBefore === 'string' ? body.nextBefore : null);
    } catch (failure) {
      if (active.current && session.sameRevision()) setError(failure instanceof Error ? failure.message : 'Published stationery could not be loaded.');
    } finally { if (active.current && session.sameRevision()) setLoading(false); }
  };
  return <div className="rl-filter">
    <button type="button" className="rl-card-run" disabled={disabled || loading} onClick={() => void read()}>Choose published stationery (optional)</button>
    {open && <>
      <label>Report stationery
        <select className="rl-input" disabled={disabled || loading} value={selected} onChange={event => { setSelected(event.target.value); onChange(event.target.value || undefined); }}>
          <option value="">Current organization reporting preference</option>
          {designs.map(design => {
            const scoped = Object.values(design.scope).some(value => value !== null);
            return <option key={design.id} value={design.id} disabled={scoped}>{design.name} · revision {design.publishedRevision}{scoped ? ' (requires specific target context)' : ''}</option>;
          })}
        </select>
      </label>
      <p className="rl-card-meta">An explicit published design applies to this archive only. This chooser offers organization-wide stationery; scoped designs require a matching known program, market, language and subsidiary.</p>
      {next && <button type="button" className="rl-card-run" disabled={disabled || loading} onClick={() => void read(next)}>Load more stationery</button>}
      {loading && <p role="status">Reading published stationery…</p>}
      {error && <p role="status">{error}</p>}
    </>}
  </div>;
}
