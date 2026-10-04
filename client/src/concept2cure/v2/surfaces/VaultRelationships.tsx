/**
 * Related documents: the documents that support this version, that it
 * references, or that it is based on, and the documents that name it (plan
 * critique 15, D2). The replacement for the parentDocumentId an upload used to
 * accept unchecked.
 *
 * GET  /api/c2c/project-vault/:id/documents/:documentId/relationships
 * POST /api/c2c/project-vault/:id/documents/:documentId/relationships
 * POST /api/c2c/project-vault/:id/relationships/:relationshipId/remove
 *
 * A document to relate is found with the library search, so it can be in any
 * of the organisation's projects. The list is only ever what the server last
 * returned: a list that could not be read says so and is never shown as empty,
 * and a change is claimed only once the server has recorded it. Removing a
 * relationship needs a reason, which is recorded with it.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { GOVERNED_REASON_MIN } from '@shared/constants/governed-reason';
import { ApiRequestError, apiRequest, redactInternals, serverMessage } from '@/lib/queryClient';

type RelationshipType = 'supporting' | 'references' | 'based_on';

export interface RelationshipShape {
  id: string;
  type: RelationshipType;
  direction: 'outgoing' | 'incoming';
  label: string;
  note: string | null;
  createdAt: string;
  createdBy: string | null;
  other: {
    documentId: string;
    title: string | null;
    version: string | null;
    documentType: string | null;
    programId: string;
    programName: string | null;
    superseded: boolean;
  };
}

interface Candidate { id: string; title: string; version: string | null; program: { id: string; name: string | null } }

/** The three kinds, as a person choosing one reads them. */
const KINDS: Array<{ value: RelationshipType; label: string }> = [
  { value: 'supporting', label: 'Supported by' },
  { value: 'references', label: 'References' },
  { value: 'based_on', label: 'Based on' },
];

const base = (projectId: string) => `/api/c2c/project-vault/${encodeURIComponent(projectId)}`;
const versionOf = (v: string | null) => (v ? ` v${v}` : '');

/** One request; a refusal or a dropped connection becomes an Error with the sentence to show. */
async function call<T>(method: 'GET' | 'POST', url: string, body: unknown, failed: string): Promise<T> {
  let res: Response;
  try {
    res = await apiRequest(method, url, body);
  } catch (e) {
    const detail = e instanceof ApiRequestError ? serverMessage(e.payload) : null;
    throw new Error(`${failed} ${redactInternals(detail ?? (e instanceof Error ? e.message : ''), 'The connection dropped.')}`, { cause: e });
  }
  const json = (await res.json().catch(() => null)) as { data?: T } | null;
  if (!res.ok) throw new Error(`${failed} ${redactInternals(serverMessage(json), `The Vault refused it (HTTP ${res.status}).`)}`);
  return (json?.data ?? ({} as T));
}

/** The other end, in words: title, version, its project when it is another one, and whether it is current. */
export function describeOther(r: RelationshipShape, projectId: string): string {
  const o = r.other;
  const where = o.programId !== projectId ? ` (in ${o.programName ?? 'another project'})` : '';
  const later = o.superseded ? '. A later version of it exists; this relationship names this one' : '';
  return `${o.title ?? 'Untitled'}${versionOf(o.version)}${where}${later}`;
}

function useRelationships(projectId: string, documentId: string) {
  const [items, setItems] = useState<RelationshipShape[] | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setReadError(null);
    try {
      const d = await call<{ relationships?: RelationshipShape[] }>(
        'GET', `${base(projectId)}/documents/${encodeURIComponent(documentId)}/relationships`, undefined,
        'Related documents could not be read; none are shown rather than an incomplete list.');
      if (!Array.isArray(d.relationships)) throw new Error('Related documents could not be read; none are shown rather than an incomplete list.');
      setItems(d.relationships);
    } catch (e) {
      setItems(null);
      setReadError(e instanceof Error ? e.message : String(e));
    }
  }, [projectId, documentId]);
  useEffect(() => { void load(); }, [load]);
  return { items, readError, load };
}

function AddForm({ projectId, documentId, onAdded }: { projectId: string; documentId: string; onAdded: (text: string) => void }) {
  const [q, setQ] = useState('');
  const [found, setFound] = useState<Candidate[] | null>(null);
  const [target, setTarget] = useState<Candidate | null>(null);
  const [kind, setKind] = useState<RelationshipType>('supporting');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const find = async () => {
    if (!q.trim() || busy) return;
    setBusy(true);
    setError(null);
    setTarget(null);
    try {
      const d = await call<{ results?: Candidate[] }>(
        'GET', `/api/c2c/project-vault/search?q=${encodeURIComponent(q.trim())}&limit=10`, undefined, 'The library could not be searched.');
      setFound((d.results ?? []).filter((c) => c.id !== documentId));
    } catch (e) {
      setFound(null);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const relate = async () => {
    if (!target || busy) return;
    setBusy(true);
    setError(null);
    try {
      await call('POST', `${base(projectId)}/documents/${encodeURIComponent(documentId)}/relationships`,
        { toDocumentId: target.id, type: kind, ...(note.trim() ? { note: note.trim() } : {}) }, 'Nothing was related.');
      onAdded(`Related: ${KINDS.find((k) => k.value === kind)?.label.toLowerCase()} ${target.title}${versionOf(target.version)}. Recorded in both documents' histories.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="vd-d-filing" data-testid="vault-relationships-add">
      <label className="vd-d-filing-row">
        <span className="k">Find a document</span>
        <input className="vd-d-filing-reason" value={q} disabled={busy} placeholder="Title or text, across every project"
          onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void find(); }}
          data-testid="vault-relationships-query" />
      </label>
      <div className="vd-d-filing-acts">
        <button className="sp-ask" disabled={busy || !q.trim()} onClick={() => void find()}>Find</button>
      </div>
      {found && found.length === 0 ? <div className="vd-d-idx" role="status">No document in the library matches that.</div> : null}
      {found && found.length > 0 ? (
        <div role="list" aria-label="Documents found">
          {found.map((c) => (
            <label key={c.id} className="vd-d-filing-row" role="listitem">
              <input type="radio" name={`relate-${documentId}`} checked={target?.id === c.id} disabled={busy} onChange={() => setTarget(c)} />
              <span className="v">{c.title}{versionOf(c.version)}{c.program.id !== projectId ? ` (in ${c.program.name ?? 'another project'})` : ''}</span>
            </label>
          ))}
        </div>
      ) : null}
      {target ? (
        <>
          <label className="vd-d-filing-row">
            <span className="k">This document is</span>
            <select className="vd-d-move-sel" value={kind} disabled={busy} onChange={(e) => setKind(e.target.value as RelationshipType)}
              data-testid="vault-relationships-kind">
              {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
            </select>
          </label>
          <label className="vd-d-filing-row">
            <span className="k">Note</span>
            <input className="vd-d-filing-reason" value={note} maxLength={500} disabled={busy} placeholder="Optional"
              onChange={(e) => setNote(e.target.value)} />
          </label>
          <div className="vd-d-filing-acts">
            <button className="sp-primary" disabled={busy} onClick={() => void relate()} data-testid="vault-relationships-relate">
              {busy ? 'Relating…' : 'Relate'}
            </button>
          </div>
        </>
      ) : null}
      {error ? <div className="vd-dr-err" role="alert">{error}</div> : null}
    </div>
  );
}

function RelationshipRow({ r, projectId, onRemoved }: { r: RelationshipShape; projectId: string; onRemoved: (text: string) => void }) {
  const [removing, setRemoving] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canRemove = !busy && reason.trim().length >= GOVERNED_REASON_MIN;
  const remove = async () => {
    if (!canRemove) return;
    setBusy(true);
    setError(null);
    try {
      await call('POST', `${base(projectId)}/relationships/${encodeURIComponent(r.id)}/remove`, { reason: reason.trim() },
        'The relationship was not removed.');
      onRemoved(`Removed: ${r.label.toLowerCase()} ${r.other.title ?? 'Untitled'}${versionOf(r.other.version)}. Your reason is recorded in both documents' histories.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div role="listitem" data-testid="vault-relationship">
      <div className="vd-d-filing-row">
        <span className="k">{r.label}</span>
        <span className="v">{describeOther(r, projectId)}{r.note ? `. ${r.note}` : ''}</span>
      </div>
      {removing ? (
        <>
          <label className="vd-d-filing-row">
            <span className="k">Reason for removal</span>
            <textarea className="vd-d-filing-reason" rows={2} value={reason} disabled={busy}
              placeholder={`Required, at least ${GOVERNED_REASON_MIN} characters. Recorded with the removal.`}
              onChange={(e) => setReason(e.target.value)} data-testid="vault-relationship-reason" />
          </label>
          <div className="vd-d-filing-acts">
            <button className="sp-primary" disabled={!canRemove} onClick={() => void remove()} data-testid="vault-relationship-remove-confirm">
              {busy ? 'Removing…' : 'Remove relationship'}
            </button>
            <button className="sp-ask" disabled={busy} onClick={() => setRemoving(false)}>Cancel</button>
          </div>
        </>
      ) : (
        <div className="vd-d-filing-acts">
          <button className="sp-ask" onClick={() => setRemoving(true)}>Remove</button>
        </div>
      )}
      {error ? <div className="vd-dr-err" role="alert">{error}</div> : null}
    </div>
  );
}

export function VaultRelationships({ projectId, documentId, onChanged }: { projectId: string; documentId: string; onChanged: () => void }) {
  const { items, readError, load } = useRelationships(projectId, documentId);
  const [adding, setAdding] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const changed = (text: string) => {
    setDone(text);
    setAdding(false);
    void load();
    onChanged();
  };
  return (
    <div data-testid="vault-relationships">
      <div className="vd-d-seclbl">Related documents</div>
      {readError ? <div className="vd-dr-err" role="alert">{readError}</div> : null}
      {items && items.length === 0 ? <div className="vd-d-idx">No related documents are recorded for this version.</div> : null}
      {items && items.length > 0 ? (
        <div className="vd-d-filing" role="list" aria-label="Related documents">
          {items.map((r) => <RelationshipRow key={r.id} r={r} projectId={projectId} onRemoved={changed} />)}
        </div>
      ) : null}
      {done ? <div className="vd-d-idx" role="status">{done}</div> : null}
      {adding
        ? <AddForm projectId={projectId} documentId={documentId} onAdded={changed} />
        : (
          <div className="vd-d-filing-acts">
            <button className="sp-ask" onClick={() => { setDone(null); setAdding(true); }} data-testid="vault-relationships-open">
              Relate a document
            </button>
          </div>
        )}
    </div>
  );
}
