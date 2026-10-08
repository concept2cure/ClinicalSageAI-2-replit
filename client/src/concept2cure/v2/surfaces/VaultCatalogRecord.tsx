/**
 * Catalog record: what AnA recorded about this version of a document, who
 * proposed it, and whether a person confirmed or corrected it (S4, D5;
 * docs/design/DATA_ROOM_CATALOG_AND_CLINICAL_DATA_2026-10-08.md).
 *
 * AnA's description is a suggestion: it names the model that wrote it and
 * stays "not yet confirmed" until a person confirms it as written or corrects
 * it with a reason for change (21 CFR 11.10(e)). Both decisions are recorded
 * in the document's history by the server (document-catalog-governance.service.ts),
 * which also checks the role and the kind vocabulary. What is shown is only
 * ever what the server last returned: a failed read says so and shows nothing,
 * and success is claimed only once the response says it was recorded.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { VAULT_DOC_KINDS, vaultDocKindLabel } from '@shared/constants/domain/vault-taxonomy';
import { GOVERNED_REASON_MIN } from '@shared/constants/governed-reason';
import { ApiRequestError, apiRequest, redactInternals, serverMessage } from '@/lib/queryClient';

interface CatalogRecordView {
  contentHash: string;
  /** Sent back with a decision: the server refuses one made on a record that changed since it was shown. */
  revision: string | null;
  /** Whether this person's role may confirm or correct; the server checks again. */
  canWrite: boolean;
  state: 'suggested' | 'confirmed' | 'corrected' | null;
  documentKind: string | null;
  purpose: string | null;
  summary: string | null;
  keyData: unknown;
  proposedBy: string | null;
  proposedModel: string | null;
  proposedAt: string | null;
  confirmedBy: { id: number; name: string | null } | null;
  confirmedAt: string | null;
  correctionReason: string | null;
  extractionStatus: string | null;
}

interface Props {
  projectId: string;
  documentId: string;
  /** Called after a recorded decision, so the surface re-reads the history. */
  onSaved: () => void;
}

type Note = { tone: 'ok' | 'error'; text: string } | null;
interface Draft { documentKind: string; purpose: string; summary: string; reason: string }

const url = (projectId: string, documentId: string, tail = '') =>
  `/api/c2c/project-vault/${encodeURIComponent(projectId)}/documents/${encodeURIComponent(documentId)}/catalog${tail}`;

/** Date and time in UTC, as the record states them. */
const when = (iso: string | null) =>
  iso ? `${new Date(iso).toISOString().slice(0, 16).replace('T', ' ')} UTC` : 'an unrecorded time';

/**
 * One request; a refusal or a dropped connection becomes an Error with the
 * sentence to show. A write whose connection dropped may have landed, so it
 * says the outcome is not known (`unknown`) rather than that nothing happened.
 */
async function call<T>(method: 'GET' | 'POST', path: string, body: unknown, failed: string, unknown?: string): Promise<T> {
  let res: Response;
  try {
    res = await apiRequest(method, path, body);
  } catch (e) {
    const detail = e instanceof ApiRequestError ? serverMessage(e.payload) : null;
    if (!detail && unknown) throw new Error(unknown, { cause: e });
    throw new Error(`${failed} ${redactInternals(detail ?? (e instanceof Error ? e.message : ''), 'The connection dropped.')}`, { cause: e });
  }
  const json = (await res.json().catch(() => null)) as ({ data?: T } & Record<string, unknown>) | null;
  if (!res.ok) throw new Error(`${failed} ${redactInternals(serverMessage(json), `The Vault refused it (HTTP ${res.status}).`)}`);
  return (json?.data ?? (json as unknown as T));
}

/** Who wrote the record, then who decided on it: the suggestion is kept beside the decision. */
export function provenanceLines(r: CatalogRecordView): string[] {
  const model = r.proposedModel ? ` (${r.proposedModel})` : ' (model not recorded)';
  const suggested = `Suggested by AnA${model} on ${when(r.proposedAt)}.`;
  const person = r.confirmedBy?.name ?? (r.confirmedBy ? `user ${r.confirmedBy.id}` : 'a person not recorded');
  if (r.state === 'confirmed') return [suggested, `Confirmed as written by ${person} on ${when(r.confirmedAt)}.`];
  if (r.state === 'corrected') return [suggested, `Corrected by ${person} on ${when(r.confirmedAt)}.`];
  return [`${suggested} Not yet confirmed by a person.`];
}

/** Key data as label: value lines; nothing when there is none. */
function keyDataLines(keyData: unknown): Array<[string, string]> {
  if (!keyData || typeof keyData !== 'object' || Array.isArray(keyData)) return [];
  // Every value: a confirmation covers the record as shown, so none is hidden.
  return Object.entries(keyData as Record<string, unknown>).map(([k, v]) => [
    k, typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v),
  ]);
}

function useCatalogRecord({ projectId, documentId, onSaved }: Props) {
  const [record, setRecord] = useState<CatalogRecordView | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note>(null);
  const load = useCallback(async () => {
    setReadError(null);
    try {
      setRecord(await call<CatalogRecordView>('GET', url(projectId, documentId), undefined,
        'The catalog record could not be read; nothing is shown rather than a record that may be wrong.'));
    } catch (e) {
      setRecord(null);
      setReadError(e instanceof Error ? e.message : String(e));
    }
  }, [projectId, documentId]);
  useEffect(() => { void load(); }, [load]);

  const decide = async (action: 'confirm' | 'correct', body: Record<string, string>, done: string) => {
    if (!record || busy) return false;
    setBusy(true);
    setNote(null);
    const outcome = action === 'confirm' ? 'confirmed' : 'corrected';
    try {
      await call('POST', url(projectId, documentId, `/${action}`),
        { contentHash: record.contentHash, revision: record.revision, ...body },
        `The record was not ${outcome}.`,
        `The connection dropped, so it is not known whether the record was ${outcome}. ` +
          "Reload the Vault and check this document's history before trying again.");
      setNote({ tone: 'ok', text: done });
      await load();
      onSaved();
      return true;
    } catch (e) {
      setNote({ tone: 'error', text: e instanceof Error ? e.message : String(e) });
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { record, readError, busy, note, decide, load };
}

function RecordView({ r }: { r: CatalogRecordView }) {
  const lines = keyDataLines(r.keyData);
  return (
    <>
      <div className="vd-d-filing-row">
        <span className="k">Kind</span>
        <span className="v">{r.documentKind ? vaultDocKindLabel(r.documentKind) : '—'}</span>
      </div>
      <div className="vd-d-filing-row">
        <span className="k">Purpose</span>
        <span className="v">{r.purpose || '—'}</span>
      </div>
      <div className="vd-d-filing-row">
        <span className="k">Summary</span>
        <span className="v">{r.summary || '—'}</span>
      </div>
      {lines.length > 0 && (
        <div className="vd-d-idx">Key data is checked against the document&apos;s text when AnA records it, and is not edited here.</div>
      )}
      {lines.map(([k, v]) => (
        <div className="vd-d-filing-row" key={k}>
          <span className="k">{k}</span>
          <span className="v">{v}</span>
        </div>
      ))}
      {r.state === 'corrected' && r.correctionReason && (
        <div className="vd-d-filing-row">
          <span className="k">Reason for correction</span>
          <span className="v">{r.correctionReason}</span>
        </div>
      )}
    </>
  );
}

function CorrectForm({ r, busy, onSave, onCancel }: {
  r: CatalogRecordView; busy: boolean; onSave: (d: Draft) => void; onCancel: () => void;
}) {
  const [draft, setDraft] = useState<Draft>({
    documentKind: r.documentKind ?? '', purpose: r.purpose ?? '', summary: r.summary ?? '', reason: '',
  });
  const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });
  const changed = draft.documentKind !== (r.documentKind ?? '') || draft.purpose.trim() !== (r.purpose ?? '')
    || draft.summary.trim() !== (r.summary ?? '');
  const inVocabulary = VAULT_DOC_KINDS.some((k) => k.value === draft.documentKind);
  const canSave = !busy && changed && inVocabulary && draft.purpose.trim() !== '' && draft.summary.trim() !== ''
    && draft.reason.trim().length >= GOVERNED_REASON_MIN;
  return (
    <div className="vd-d-filing" data-testid="vault-catalog-correct-form">
      <label className="vd-d-filing-row">
        <span className="k">Kind</span>
        <select className="vd-d-move-sel" value={draft.documentKind} disabled={busy}
          onChange={(e) => set({ documentKind: e.target.value })} data-testid="vault-catalog-kind">
          {/* A kind recorded before the vocabulary was enforced is shown as itself, to be replaced. */}
          {draft.documentKind && !VAULT_DOC_KINDS.some((k) => k.value === draft.documentKind) && (
            <option value={draft.documentKind}>{draft.documentKind} (not in the list; choose a kind)</option>
          )}
          {VAULT_DOC_KINDS.map((k) => <option key={k.value} value={k.value}>{k.one}</option>)}
        </select>
      </label>
      <label className="vd-d-filing-row">
        <span className="k">Purpose</span>
        <input className="vd-d-filing-reason" value={draft.purpose} maxLength={1000} disabled={busy}
          onChange={(e) => set({ purpose: e.target.value })} data-testid="vault-catalog-purpose" />
      </label>
      <label className="vd-d-filing-row">
        <span className="k">Summary</span>
        <textarea className="vd-d-filing-reason" value={draft.summary} rows={4} maxLength={8000} disabled={busy}
          onChange={(e) => set({ summary: e.target.value })} data-testid="vault-catalog-summary" />
      </label>
      <label className="vd-d-filing-row">
        <span className="k">Reason for change</span>
        <textarea className="vd-d-filing-reason" value={draft.reason} rows={2} disabled={busy}
          placeholder={`Required, at least ${GOVERNED_REASON_MIN} characters. Recorded with the correction.`}
          onChange={(e) => set({ reason: e.target.value })} data-testid="vault-catalog-reason" />
      </label>
      <div className="vd-d-filing-acts">
        <button className="sp-primary" disabled={!canSave} onClick={() => onSave(draft)} data-testid="vault-catalog-correct-save">
          {busy ? 'Saving…' : 'Save correction'}
        </button>
        <button className="sp-ask" disabled={busy} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

/** The fields the person changed, trimmed, plus the reason. */
function correctionBody(d: Draft, r: CatalogRecordView): Record<string, string> {
  const out: Record<string, string> = { reason: d.reason.trim() };
  if (d.documentKind !== (r.documentKind ?? '')) out.documentKind = d.documentKind;
  if (d.purpose.trim() !== (r.purpose ?? '')) out.purpose = d.purpose.trim();
  if (d.summary.trim() !== (r.summary ?? '')) out.summary = d.summary.trim();
  return out;
}

/** What the panel says when there is no description to decide on. */
function emptyText(r: CatalogRecordView): string {
  if (r.extractionStatus === 'extraction_failed') {
    return 'No description is recorded: the text of this version could not be read. Upload a readable copy to have it described.';
  }
  return 'No description is recorded for this version. AnA records one after reading the whole document; ask AnA to catalog it.';
}

function Body({ cat }: { cat: ReturnType<typeof useCatalogRecord> }) {
  const [correcting, setCorrecting] = useState(false);
  const r = cat.record;
  if (cat.readError) {
    return (
      <div className="vd-dr-err" role="alert" data-testid="vault-catalog-error">
        {cat.readError}{' '}
        <button className="sp-ask" onClick={() => void cat.load()}>Try again</button>
      </div>
    );
  }
  if (!r) return <div className="vd-d-idx" role="status">Reading the catalog record…</div>;
  if (!r.state) return <div className="vd-d-idx" data-testid="vault-catalog-empty">{emptyText(r)}</div>;
  if (correcting) {
    return (
      <CorrectForm r={r} busy={cat.busy} onCancel={() => setCorrecting(false)}
        onSave={(d) => void cat.decide('correct', correctionBody(d, r),
          "Corrected. Your changes and reason are recorded in this document's history.").then((ok) => ok && setCorrecting(false))} />
    );
  }
  return (
    <div className="vd-d-filing">
      <div className="vd-d-idx" data-testid="vault-catalog-provenance">
        {provenanceLines(r).map((line) => <div key={line}>{line}</div>)}
      </div>
      <RecordView r={r} />
      {r.canWrite ? (
        <>
          {r.state === 'suggested' && (
            <div className="vd-d-idx">Confirming records your name and the time in this document&apos;s history. AnA will not replace a confirmed record.</div>
          )}
          <div className="vd-d-filing-acts">
            {r.state === 'suggested' && (
              <button className="sp-primary" disabled={cat.busy} data-testid="vault-catalog-confirm"
                onClick={() => void cat.decide('confirm', {}, "Confirmed. Your confirmation is recorded in this document's history.")}>
                {cat.busy ? 'Confirming…' : 'Confirm as written'}
              </button>
            )}
            <button className="sp-ask" disabled={cat.busy} onClick={() => setCorrecting(true)} data-testid="vault-catalog-correct">
              Correct record
            </button>
          </div>
        </>
      ) : (
        <div className="vd-d-idx" data-testid="vault-catalog-readonly">
          Your role can read this record but not confirm or correct it. A member or administrator can.
        </div>
      )}
    </div>
  );
}

export function VaultCatalogRecord(props: Props) {
  const cat = useCatalogRecord(props);
  return (
    <div data-testid="vault-catalog-record">
      <div className="vd-d-seclbl">Catalog record</div>
      <Body cat={cat} />
      {cat.note && (
        <div className={cat.note.tone === 'error' ? 'vd-dr-err' : 'vd-d-idx'}
          role={cat.note.tone === 'error' ? 'alert' : 'status'} data-testid="vault-catalog-note">
          {cat.note.text}
        </div>
      )}
    </div>
  );
}
