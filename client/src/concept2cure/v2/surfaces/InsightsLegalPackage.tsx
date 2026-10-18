import React, { useEffect, useRef, useState } from 'react';
import type { CompanyDocumentsResponse, CompanyLegalDocument } from '@shared/company-documents';
import { companyLegalDocumentRefusal } from '@shared/company-documents';
import { apiRequest, serverMessage } from '@/lib/queryClient';
import { authService } from '@/services/portal/authService';
import { downloadBlob } from '../download';
import { InsightsPackageStationery } from './InsightsPackageStationery';

function refusal(document: CompanyLegalDocument) {
  return companyLegalDocumentRefusal(document, { programId: document.programId, agency: document.agencies[0],
    country: document.countries[0], submissionType: document.submissionTypes[0] });
}

/** Selection is local to this bundle view; originals remain separate in the ZIP. */
export function InsightsLegalPackage({ bundleId, disabled }: { bundleId: string; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [variantId, setVariantId] = useState<string | undefined>();
  const [documents, setDocuments] = useState<CompanyLegalDocument[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const active = useRef(true);
  const pending = useRef(false);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useEffect(() => {
    const clear = () => { setOpen(false); setVariantId(undefined); setDocuments([]); setSelected([]); setLoaded(false); setLoading(false); setBusy(false); setNote(null); };
    const off = [authService.on('login', clear), authService.on('logout', clear), authService.on('session_expired', clear)];
    return () => off.forEach(unsubscribe => unsubscribe());
  }, []);
  const read = async () => {
    const session = authService.captureSessionReadGuard();
    const isCurrent = () => active.current && session.sameRevision();
    setOpen(true); setLoading(true); setSelected([]); setLoaded(false); setNote(null);
    try {
      const response = await apiRequest('GET', '/api/client-branding/company-documents');
      const body: CompanyDocumentsResponse = await response.json();
      if (!isCurrent()) return;
      if (!response.ok || !Array.isArray(body.data?.legalDocuments)) throw new Error(serverMessage(body) ?? 'The legal library could not be verified.');
      setDocuments(body.data.legalDocuments); setLoaded(true);
    } catch (error) {
      if (isCurrent()) setNote(error instanceof Error ? error.message : 'The legal library could not be loaded.');
    } finally { if (isCurrent()) setLoading(false); }
  };
  const download = async () => {
    if (pending.current || !selected.length || disabled) return;
    pending.current = true; setBusy(true); setNote(null);
    const session = authService.captureSessionReadGuard();
    const isCurrent = () => active.current && session.sameRevision();
    try {
      const response = await apiRequest('POST', `/api/report-os/bundles/${encodeURIComponent(bundleId)}/export.zip`, { legalDocumentIds: selected, ...(variantId ? { variantId } : {}) });
      if (!isCurrent()) return;
      if (!response.ok) throw new Error(serverMessage(await response.json()) ?? 'The report package was refused.');
      const blob = await response.blob();
      if (!isCurrent()) return;
      const filename = `report-package-${bundleId.slice(0, 8)}.zip`;
      setNote(downloadBlob(filename, blob) ? `Saved ${filename}. Keep this ZIP and its manifest as your export record.` : 'No file saved — this browser refused the download.');
    } catch (error) {
      if (isCurrent()) setNote(`No file saved — ${error instanceof Error ? error.message : 'the report package was refused'}`);
    } finally { pending.current = false; if (isCurrent()) setBusy(false); }
  };
  const blocked = loading || busy || disabled;
  return <div className="rl-form">
    <button className="rl-card-run" type="button" disabled={blocked} onClick={() => void read()}>
      {open ? 'Refresh legal companions' : 'Choose legal companions for ZIP'}
    </button>
    {open && <fieldset disabled={blocked}>
      <legend>Explicit legal companions</legend>
      <p className="rl-sub">The ZIP contains the retained reports PDF, separate unchanged legal originals and a proof manifest. Selection does not determine agency acceptance or filing completeness. Nothing is attached automatically.</p>
      {loading && <p role="status">Reading approved legal originals…</p>}
      {loaded && documents.length === 0 && <p>No accessible registered legal documents. Add originals through Company documents in Settings.</p>}
      {loaded && documents.map(document => { const reason = refusal(document); return <label key={document.id} style={{ display: 'block', marginBottom: 8 }}>
        <input type="checkbox" checked={selected.includes(document.id)} disabled={Boolean(reason) || (!selected.includes(document.id) && selected.length >= 50)}
          onChange={event => setSelected(current => event.target.checked ? [...current, document.id] : current.filter(id => id !== document.id))} />{' '}
        {document.title} · version {document.version} · {document.language}
        <span className="rl-card-meta"> · {document.agencies.join(', ') || 'All agencies'} / {document.countries.join(', ') || 'All regions'}{reason ? ` — ${reason}` : ''}</span>
      </label>; })}
      <InsightsPackageStationery disabled={blocked} onChange={setVariantId} />
      <button type="button" className="btn primary" disabled={!loaded || !selected.length} onClick={() => void download()}>
        {busy ? 'Preparing report package…' : `Download reports and ${selected.length} selected legal original${selected.length === 1 ? '' : 's'} (ZIP)`}
      </button>
    </fieldset>}
    {note && <p role="status" className="rl-sub">{note}</p>}
  </div>;
}
