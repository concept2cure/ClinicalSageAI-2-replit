/**
 * Pivotal studies: the sponsor declares, per study, whether it is pivotal
 * (D5, founder's decision of 2026-10-29). Shown on the CSR workflow board.
 *
 *   GET  /api/csr-workflow/pivotal?programId= | ?projectId=
 *   POST /api/csr-workflow/pivotal { programId | projectId, studyId, pivotal, reason }
 *
 * Module 2 calls a study pivotal only when it is declared so here; a study
 * with no declaration is listed as not declared, and Module 2 names it as a
 * gap rather than guessing from its phase. A declaration is a regulatory claim:
 * it takes a reason, a writing role, and is kept with who made it and when. A
 * change is a new declaration; the earlier ones stay.
 */
import React, { useState } from 'react';
import { GOVERNED_REASON_MIN } from '@shared/constants/governed-reason';
import { canGovernedWrite } from '@shared/constants/permissions';
import { useAuthUser } from '@/services/portal/authService';
import { useLiveData } from '../dataConnect';
import { apiCall, apiErrorText } from '../apiCall';

const PATH = '/api/csr-workflow/pivotal';

export type PivotalScope = { programId: string } | { projectId: number };

/** The project a CSR board reads (its program, else its ?projectId=); null for an organization-wide board. */
export function pivotalScopeOf(boardPath: string, programId: string | null): PivotalScope | null {
  if (programId) return { programId };
  const projectId = new URLSearchParams(boardPath.split('?')[1] ?? '').get('projectId');
  return projectId && /^\d+$/.test(projectId) ? { projectId: Number(projectId) } : null;
}

interface Declaration { pivotal: boolean; reason: string; declaredBy: number; declaredByName?: string | null; declaredAt: string }
interface Study { studyId: string; protocolNumber: string | null; title: string | null; phase: string | null; declaration: Declaration | null }
interface Listing { projectId: number; studies: Study[] }

const isListing = (v: unknown): v is Listing => Boolean(v && typeof v === 'object' && Array.isArray((v as Listing).studies));
const query = (scope: PivotalScope) => ('programId' in scope ? `programId=${encodeURIComponent(scope.programId)}` : `projectId=${scope.projectId}`);
const day = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(); };

function DeclarationText({ declaration }: { declaration: Declaration | null }) {
  if (!declaration) return <span>Not declared. Module 2 lists it as a gap and does not call it pivotal.</span>;
  const who = declaration.declaredByName ?? `user ${declaration.declaredBy}`;
  return <span>
    <strong>{declaration.pivotal ? 'Pivotal' : 'Not pivotal'}</strong>, declared by {who} on {day(declaration.declaredAt)}: {declaration.reason}
  </span>;
}

function DeclareForm({ scope, study, onDone }: { scope: PivotalScope; study: Study; onDone: () => void }) {
  const [pivotal, setPivotal] = useState<boolean | null>(study.declaration?.pivotal ?? null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trimmed = reason.trim();
  const ready = pivotal !== null && trimmed.length >= GOVERNED_REASON_MIN && !busy;
  const name = `pivotal-${study.studyId}`;
  const submit = async () => {
    if (!ready) return;
    setBusy(true);
    setError(null);
    const result = await apiCall('POST', PATH, { ...scope, studyId: study.studyId, pivotal, reason: trimmed });
    setBusy(false);
    if (!result.ok) { setError(apiErrorText(result, 'The declaration was not recorded.')); return; }
    onDone();
  };
  return <fieldset style={{ marginTop: 8 }}>
    <legend>Is {study.protocolNumber ?? study.studyId} pivotal (a study the application relies on for efficacy)?</legend>
    <label><input type="radio" name={name} checked={pivotal === true} onChange={() => setPivotal(true)} /> Yes, pivotal</label>{' '}
    <label><input type="radio" name={name} checked={pivotal === false} onChange={() => setPivotal(false)} /> No, not pivotal</label>
    <div style={{ marginTop: 6 }}>
      <label htmlFor={`${name}-reason`}>Reason (at least {GOVERNED_REASON_MIN} characters, recorded with the declaration)</label>
      <textarea id={`${name}-reason`} rows={2} style={{ width: '100%' }} value={reason} onChange={e => setReason(e.target.value)} />
    </div>
    {error && <p role="alert">{error}</p>}
    <button type="button" className="btn primary" disabled={!ready} onClick={submit}>{busy ? 'Recording…' : 'Record declaration'}</button>
  </fieldset>;
}

export function StudyPivotalDeclarations({ scope }: { scope: PivotalScope }) {
  const [version, setVersion] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const canDeclare = canGovernedWrite(useAuthUser());
  const path = `${PATH}?${query(scope)}`;
  const res = useLiveData<Listing>(path, [path, version], isListing);
  const studies = res.data?.studies ?? [];
  return <div className="pj-card" style={{ marginBottom: 18, maxWidth: 760 }}>
    <div className="pj-card-h">
      <span className="t">Pivotal studies</span>
      <span className="s">declared by the sponsor; Module 2 uses only these declarations</span>
    </div>
    <div className="pj-card-b">
      {res.loading ? <p role="status">Loading this project’s studies…</p>
        : res.error ? <p role="alert">The declarations could not be read, so whether any study is pivotal is not shown here.</p>
        : studies.length === 0 ? <p>No CSR build in this project names a study yet.</p>
        : <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {studies.map(study => <li key={study.studyId} style={{ marginBottom: 10 }}>
            <div>{study.protocolNumber ?? study.studyId}{study.title ? ` · ${study.title}` : ''}{study.phase ? ` · ${study.phase}` : ''}</div>
            <div><DeclarationText declaration={study.declaration} /></div>
            {canDeclare && open !== study.studyId && <button type="button" className="btn" onClick={() => setOpen(study.studyId)}>
              {study.declaration ? 'Change declaration' : 'Declare'}
            </button>}
            {canDeclare && open === study.studyId && <DeclareForm scope={scope} study={study}
              onDone={() => { setOpen(null); setVersion(v => v + 1); }} />}
          </li>)}
        </ul>}
    </div>
  </div>;
}
