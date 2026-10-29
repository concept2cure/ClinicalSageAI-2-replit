import React, { useRef, useState } from 'react';
import type { CompanyLegalDocument } from '@shared/company-documents';
import { companyLegalDocumentRefusal } from '@shared/company-documents';
import { apiRequest, serverMessage } from '@/lib/queryClient';
import { getAuthToken } from '@/utils/authToken';
import { downloadBlob } from '../download';
import { InsightsPackageStationery } from './InsightsPackageStationery';
import { PagedCompanyLegalPicker } from './company-documents/PagedCompanyLegalPicker';
import { useCompanyLease, useCompanySession, type CompanySession } from './company-documents/companySession';

function refusal(document: CompanyLegalDocument) {
  return companyLegalDocumentRefusal(document, { programId: document.programId, agency: document.agencies[0],
    country: document.countries[0], submissionType: document.submissionTypes[0] });
}
function validSelection(ids: string[]) {
  return ids.length > 0 && ids.length <= 50 && new Set(ids).size === ids.length
    && ids.every(id => typeof id === 'string' && id.trim().length > 0);
}
/** Throws the refusal of a non-ok export; returns quietly when this visit is no longer current. */
async function reportArchiveRefusal(response: Response, current: () => boolean) {
  const body = await response.json();
  if (current()) throw new Error(serverMessage(body) ?? 'The report package was refused.');
}

/** Selection and optional stationery belong to this exact bundle visit. */
function LegalPackageSelection({ bundleId, disabled, owner }: { bundleId: string; disabled: boolean; owner: CompanySession }) {
  const [open, setOpen] = useState(false), [visit, setVisit] = useState(0);
  const [selected, setSelected] = useState<string[]>([]), [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const lease = useCompanyLease(owner, `chooser:${visit}`);
  const generation = useRef(0), selectedIds = useRef<string[]>([]), variantId = useRef<string | undefined>(undefined);
  const pending = useRef<object | null>(null), latestDisabled = useRef(disabled);
  latestDisabled.current = disabled;
  const captured = generation.current;
  const current = () => lease.current() && captured === generation.current;
  const canStart = () => current() && !latestDisabled.current && !pending.current;
  const choose = () => {
    if (!canStart()) return;
    generation.current += 1;
    selectedIds.current = []; variantId.current = undefined;
    setVisit(generation.current); setOpen(true); setSelected([]); setBusy(false); setNote(null);
  };
  const changeSelected = (ids: string[]) => {
    if (!canStart()) return;
    const unique = [...new Set(ids)];
    if (unique.length > 50 || unique.some(id => typeof id !== 'string' || !id.trim())) return;
    selectedIds.current = unique; setSelected(unique);
  };
  const changeStationery = (id?: string) => { if (canStart()) variantId.current = id; };
  const download = async () => {
    if (!canStart() || !validSelection(selectedIds.current)) return;
    const operation = {}; pending.current = operation;
    const isCurrent = () => current() && pending.current === operation;
    const ids = [...selectedIds.current], variant = variantId.current;
    setBusy(true); setNote(null);
    try {
      const response = await apiRequest('POST', `/api/report-os/bundles/${encodeURIComponent(bundleId)}/export.zip`, { legalDocumentIds: ids, ...(variant ? { variantId: variant } : {}) });
      if (!isCurrent()) return;
      if (!response.ok) { await reportArchiveRefusal(response, isCurrent); return; }
      const blob = await response.blob();
      if (!isCurrent()) return;
      const filename = `report-package-${bundleId.slice(0, 8)}.zip`;
      setNote(downloadBlob(filename, blob) ? `Saved ${filename}. Keep this ZIP and its manifest as your export record.` : 'No file saved — this browser refused the download.');
    } catch (error) {
      if (isCurrent()) setNote(`No file saved — ${error instanceof Error ? error.message : 'the report package was refused'}`);
    } finally {
      if (pending.current === operation) { pending.current = null; if (current()) setBusy(false); }
    }
  };
  const active = current(), blocked = !active || busy || disabled;
  return <div className="rl-form">
    <button className="rl-card-run" type="button" disabled={blocked} onClick={choose}>
      {open && active ? 'Refresh legal companions' : 'Choose legal companions for ZIP'}
    </button>
    {open && active && <fieldset disabled={blocked}>
      <legend>Explicit legal companions</legend>
      <p className="rl-sub">The ZIP contains the retained reports PDF, separate unchanged legal originals and a proof manifest. Selection does not determine agency acceptance or filing completeness. Nothing is attached automatically.</p>
      <PagedCompanyLegalPicker key={`legal:${lease.key}`} token={getAuthToken() ?? ''} label="Report legal originals" selected={selected}
        onChange={changeSelected} multiple disabled={blocked} rowRefusal={refusal} maxSelected={50} current={current} />
      <InsightsPackageStationery key={`stationery:${lease.key}`} disabled={blocked} onChange={changeStationery} current={current} />
      <button type="button" className="btn primary" disabled={blocked || !selected.length} onClick={() => void download()}>
        {busy ? 'Preparing report package…' : `Download reports and ${selected.length} selected legal original${selected.length === 1 ? '' : 's'} (ZIP)`}
      </button>
    </fieldset>}
    {active && note && <p role="status" className="rl-sub">{note}</p>}
  </div>;
}

/** Originals remain separate in the existing server ZIP. */
export function InsightsLegalPackage({ bundleId, disabled }: { bundleId: string; disabled: boolean }) {
  const session = useCompanySession();
  const owner = useCompanyLease(session, bundleId);
  return <LegalPackageSelection key={owner.key} bundleId={bundleId} disabled={disabled} owner={owner} />;
}
