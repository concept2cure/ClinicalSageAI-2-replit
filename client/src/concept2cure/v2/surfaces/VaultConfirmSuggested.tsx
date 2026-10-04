/**
 * Confirm N suggested (VR-11b, row D2).
 *
 * The classifier and AnA only suggest a folder, and the Vault counts a filing
 * only once a person confirms it. In a folder holding suggestions, a person
 * confirms them together with one written reason. The reason is recorded on
 * each document's filing and in its history. Each document is confirmed on its
 * own: one moved or confirmed by someone else since the page loaded is not
 * touched and is listed with the reason. A batch with any refusal says it is
 * not complete. Nothing reads as confirmed until the server says so.
 */
import React, { useState } from 'react';
import { GOVERNED_REASON_MIN } from '@shared/constants/governed-reason';
import { ApiRequestError, apiRequest, redactInternals, serverMessage } from '@/lib/queryClient';
import type { VaultDoc } from '../fixtures/vault-data';

/** The server's answer for one document (server/services/vault/vault-placement-batch.ts). */
export type ConfirmItem =
  | { documentId: string; outcome: 'confirmed'; folderLabel: string }
  | { documentId: string; outcome: 'refused'; code: string; message: string };

export interface ConfirmOutcome {
  complete: boolean;
  items: ConfirmItem[];
  /** Titles as the page showed them, so the answer still names a document the re-read moved. */
  titles: Record<string, string>;
}

const NOT_CONFIRMED = 'Nothing was confirmed.';
const UNKNOWN_OUTCOME =
  'The connection dropped, so it is not known which filings were confirmed. Reload the Vault and check before trying again.';

/** The suggestions in a folder, by the folder they are suggested for. */
export function suggestedGroups(docs: VaultDoc[]): Array<{ folderId: string; folderLabel: string; docs: VaultDoc[] }> {
  const groups = new Map<string, { folderId: string; folderLabel: string; docs: VaultDoc[] }>();
  for (const d of docs) {
    const f = d.filing;
    if (d.src !== 'upload' || !d.docId || !f || f.placementStatus !== 'suggested' || !f.folderId) continue;
    const g = groups.get(f.folderId) ?? { folderId: f.folderId, folderLabel: f.folderLabel || f.folderId, docs: [] };
    g.docs.push(d);
    groups.set(f.folderId, g);
  }
  return Array.from(groups.values());
}

/** One document's outcome in words. */
export function confirmItemText(item: ConfirmItem): string {
  return item.outcome === 'confirmed' ? `Confirmed in ${item.folderLabel}.` : `Not confirmed. ${item.message}`;
}

export function confirmOutcomeSummary(o: ConfirmOutcome): string {
  const ok = o.items.filter((i) => i.outcome === 'confirmed').length;
  const no = o.items.length - ok;
  const parts = [ok ? `${ok} confirmed` : '', no ? `${no} not confirmed` : ''].filter(Boolean).join(', ');
  return `${parts}.${o.complete ? ' Your reason is recorded in each document’s history.' : ' Not every filing was confirmed; the reasons are below.'}`;
}

async function postConfirm(projectId: string, body: { folderId: string; documentIds: string[]; note: string }): Promise<Omit<ConfirmOutcome, 'titles'>> {
  let res: Response;
  try {
    res = await apiRequest('POST', `/api/c2c/project-vault/${encodeURIComponent(projectId)}/file-batch`, body);
  } catch (e) {
    // apiRequest throws on every refusal but a 401; only a thrown non-API error is a dropped connection.
    if (e instanceof ApiRequestError) {
      throw new Error(`${NOT_CONFIRMED} ${redactInternals(serverMessage(e.payload), e.message)}`, { cause: e });
    }
    throw new Error(UNKNOWN_OUTCOME, { cause: e });
  }
  const json = (await res.json().catch(() => null)) as { complete?: unknown; items?: unknown } | null;
  if (!res.ok) throw new Error(`${NOT_CONFIRMED} ${redactInternals(serverMessage(json), `The Vault refused it (HTTP ${res.status}).`)}`);
  if (!json || !Array.isArray(json.items)) throw new Error(UNKNOWN_OUTCOME);
  return { complete: json.complete === true, items: json.items as ConfirmItem[] };
}

export interface ConfirmSuggested {
  busy: boolean;
  outcome: ConfirmOutcome | null;
  error: string | null;
  confirm: (folderId: string, docs: VaultDoc[], note: string) => Promise<boolean>;
}

/** Held by the Vault, so the answer survives the re-read that follows a confirmation. */
export function useConfirmSuggested(projectId: string | null, onConfirmed: () => void): ConfirmSuggested {
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<ConfirmOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const confirm = async (folderId: string, docs: VaultDoc[], note: string) => {
    if (!projectId || busy || docs.length === 0) return false;
    setBusy(true);
    setError(null);
    setOutcome(null);
    try {
      const titles = Object.fromEntries(docs.map((d) => [d.docId as string, d.title]));
      const result = await postConfirm(projectId, { folderId, documentIds: docs.map((d) => d.docId as string), note: note.trim() });
      setOutcome({ ...result, titles });
      if (result.items.some((i) => i.outcome === 'confirmed')) onConfirmed();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : UNKNOWN_OUTCOME);
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { busy, outcome, error, confirm };
}

function ConfirmGroup({ group, state }: { group: ReturnType<typeof suggestedGroups>[number]; state: ConfirmSuggested }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const n = group.docs.length;
  const short = note.trim().length < GOVERNED_REASON_MIN;
  if (!open) {
    return (
      <div className="vd-confirm-acts">
        <span className="vd-dr-meta">{n} suggested in {group.folderLabel}, awaiting confirmation.</span>
        <button className="sp-ask" onClick={() => setOpen(true)} disabled={state.busy}>
          Confirm {n} suggested in {group.folderLabel}
        </button>
      </div>
    );
  }
  return (
    <div className="vd-confirm-form">
      <label className="vd-dr-meta" htmlFor={`confirm-reason-${group.folderId}`}>
        Reason for confirming these {n} filings in {group.folderLabel}. It is recorded on each one.
      </label>
      <textarea
        id={`confirm-reason-${group.folderId}`}
        className="vd-d-filing-reason"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={`At least ${GOVERNED_REASON_MIN} characters`}
        rows={2}
      />
      <div className="vd-confirm-acts">
        <button
          className="sp-ask"
          disabled={state.busy || short}
          onClick={() => void state.confirm(group.folderId, group.docs, note).then((sent) => { if (sent) { setOpen(false); setNote(''); } })}
        >
          {state.busy ? 'Confirming…' : `Confirm ${n}`}
        </button>
        <button className="vd-dr-toggle" onClick={() => setOpen(false)} disabled={state.busy}>Cancel</button>
      </div>
    </div>
  );
}

/** The confirm action for each folder of suggestions shown, and the answer for the last batch. */
export function ConfirmSuggestedBar({ docs, state }: { docs: VaultDoc[]; state: ConfirmSuggested }) {
  const groups = suggestedGroups(docs);
  if (groups.length === 0 && !state.outcome && !state.error) return null;
  return (
    <div className="vd-confirm" data-testid="vault-confirm-suggested">
      {groups.map((g) => <ConfirmGroup key={g.folderId} group={g} state={state} />)}
      {state.error ? <div className="vd-dr-err" role="alert">{state.error}</div> : null}
      {state.outcome ? (
        <div className="vd-dr-file-result" role="status">
          <span className={state.outcome.complete ? 'vd-dr-meta' : 'vd-dr-file-partial'}>{confirmOutcomeSummary(state.outcome)}</span>
          <ul>
            {state.outcome.items.map((i) => (
              <li key={i.documentId} className={i.outcome === 'refused' ? 'vd-dr-file-refused' : undefined}>
                <b>{state.outcome?.titles[i.documentId] ?? i.documentId}</b>: {confirmItemText(i)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
