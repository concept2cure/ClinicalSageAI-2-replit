/**
 * File into Vault from the data room (VR-11, row D2).
 *
 * A person picks captured sources that are not yet filed and files them. The
 * server files each one through the same governed ingest as a Vault upload,
 * and answers for every source: filed (and where it landed), already in the
 * Vault, or not filed with the reason. That is what this shows, source by
 * source. A batch with any refusal says so, and never reads as done. Nothing
 * here confirms a folder: a filed source lands suggested or unfiled, and
 * waits for a person's filing decision in the cabinet.
 */
import React, { useState } from 'react';
import { ApiRequestError, apiRequest, redactInternals, serverMessage } from '@/lib/queryClient';

/** The server's answer for one source (server/services/vault/vault-data-room-filing.ts). */
export type DataRoomFileItem =
  | {
      sourceId: number;
      outcome: 'filed';
      documentId: string;
      version: string;
      placementStatus: string;
      folderLabel: string | null;
      needsReview: boolean;
    }
  | { sourceId: number; outcome: 'already_filed'; documentId: string; version: string | null; supersededBy: string | null }
  | {
      sourceId: number;
      outcome: 'refused';
      code: string;
      message: string;
      /** A conflict names the current version it can be added to as its next version. */
      headDocumentId?: string;
      headVersion?: string;
    };

export interface DataRoomFileOutcome {
  complete: boolean;
  items: DataRoomFileItem[];
}

/** The server's per-request limit (DATA_ROOM_FILE_LIMIT). */
export const DATA_ROOM_FILE_LIMIT = 25;

const NOT_FILED = 'Nothing was filed.';
const UNKNOWN_OUTCOME =
  'The connection dropped, so it is not known which files were filed. Reload the Vault and check the data room before trying again.';

/** One source's outcome in words. */
export function fileItemText(item: DataRoomFileItem): string {
  if (item.outcome === 'filed') {
    const where = item.placementStatus === 'suggested' && item.folderLabel
      ? `suggested for ${item.folderLabel}, awaiting your filing decision`
      : 'not placed in a folder yet, awaiting your filing decision';
    return `Filed as v${item.version}, ${where}.`;
  }
  if (item.outcome === 'already_filed') {
    const as = item.version ? ` as v${item.version}` : '';
    const replaced = item.supersededBy ? `, superseded by v${item.supersededBy}` : '';
    return `Already in the Vault${as}${replaced}. Nothing changed.`;
  }
  return `Not filed. ${item.message}`;
}

/** The batch in one line: counts by outcome, and whether every source made it. */
export function fileOutcomeSummary(outcome: DataRoomFileOutcome): string {
  const n = (k: DataRoomFileItem['outcome']) => outcome.items.filter((i) => i.outcome === k).length;
  const parts = [
    n('filed') ? `${n('filed')} filed` : '',
    n('already_filed') ? `${n('already_filed')} already in the Vault` : '',
    n('refused') ? `${n('refused')} not filed` : '',
  ].filter(Boolean);
  const tail = outcome.complete ? '' : ' Not every file was filed; the reasons are below.';
  return `${parts.join(', ')}.${tail}`;
}

/** POST the selection; a refusal or a dropped connection is an Error carrying what to tell the person. */
async function postFiling(
  projectId: string,
  sourceIds: number[],
  newVersionOf?: Record<number, string>,
): Promise<DataRoomFileOutcome> {
  let res: Response;
  try {
    res = await apiRequest('POST', `/api/c2c/project-vault/${encodeURIComponent(projectId)}/data-room/file`, {
      sourceIds,
      ...(newVersionOf ? { newVersionOf } : {}),
    });
  } catch (e) {
    // apiRequest throws on every refusal but a 401; only a thrown non-API error is a dropped connection.
    if (e instanceof ApiRequestError) {
      throw new Error(`${NOT_FILED} ${redactInternals(serverMessage(e.payload), e.message)}`, { cause: e });
    }
    throw new Error(UNKNOWN_OUTCOME, { cause: e });
  }
  const body = (await res.json().catch(() => null)) as { complete?: unknown; items?: unknown } | null;
  if (!res.ok) throw new Error(`${NOT_FILED} ${redactInternals(serverMessage(body), `The Vault refused it (HTTP ${res.status}).`)}`);
  if (!body || !Array.isArray(body.items)) throw new Error(UNKNOWN_OUTCOME);
  return { complete: body.complete === true, items: body.items as DataRoomFileItem[] };
}

export interface DataRoomFiling {
  selected: ReadonlySet<number>;
  toggle: (id: number) => void;
  selectMany: (ids: number[]) => void;
  clear: () => void;
  busy: boolean;
  outcome: DataRoomFileOutcome | null;
  error: string | null;
  fileSelected: () => Promise<void>;
  /** Add one refused source as the next version of the document it conflicts with (VR-08/09). */
  addAsVersion: (sourceId: number, documentId: string) => Promise<void>;
}

/** Selection and filing state for the data room. `onFiled` re-reads the Vault after anything was filed. */
export function useDataRoomFiling(projectId: string | null, onFiled: () => void): DataRoomFiling {
  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<DataRoomFileOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);

  const toggle = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  /** Run one filing request, and report what it filed. */
  const run = async (sourceIds: number[], newVersionOf?: Record<number, string>) => {
    setBusy(true);
    setError(null);
    try {
      return await postFiling(projectId as string, sourceIds, newVersionOf);
    } finally {
      setBusy(false);
    }
  };

  const fileSelected = async () => {
    if (!projectId || busy || selected.size === 0) return;
    setOutcome(null);
    try {
      const result = await run(Array.from(selected));
      setOutcome(result);
      setSelected(new Set());
      if (result.items.some((i) => i.outcome === 'filed')) onFiled();
    } catch (e) {
      setError(e instanceof Error ? e.message : UNKNOWN_OUTCOME);
    }
  };

  const addAsVersion = async (sourceId: number, documentId: string) => {
    if (!projectId || busy) return;
    try {
      const result = await run([sourceId], { [sourceId]: documentId });
      // Only this source's answer changes; the rest of the batch is as it was.
      const byId = new Map(result.items.map((i) => [i.sourceId, i] as const));
      setOutcome((prev) => {
        const items = prev ? prev.items.map((i) => byId.get(i.sourceId) ?? i) : result.items;
        return { complete: items.every((i) => i.outcome !== 'refused'), items };
      });
      if (result.items.some((i) => i.outcome === 'filed')) onFiled();
    } catch (e) {
      setError(e instanceof Error ? e.message : UNKNOWN_OUTCOME);
    }
  };

  return {
    selected,
    toggle,
    selectMany: (ids) => setSelected(new Set(ids.slice(0, DATA_ROOM_FILE_LIMIT))),
    clear: () => setSelected(new Set()),
    busy,
    outcome,
    error,
    fileSelected,
    addAsVersion,
  };
}

/** A source's checkbox. A filed source has nothing to file, so it has none. */
export function RoomPick({ id, title, filed, filing }: { id: number; title: string; filed: boolean; filing: DataRoomFiling }) {
  if (filed) return <span className="vd-dr-pick" aria-hidden="true" />;
  return (
    <input
      type="checkbox"
      className="vd-dr-pick"
      checked={filing.selected.has(id)}
      disabled={filing.busy}
      onChange={() => filing.toggle(id)}
      aria-label={`Select ${title} to file into the Vault`}
    />
  );
}

/** The action, and the answer for every source in the last batch. */
export function DataRoomFileBar({
  filing,
  unfiledIds,
  titleOf,
}: {
  filing: DataRoomFiling;
  /** Sources shown that are not yet filed, newest first. */
  unfiledIds: number[];
  titleOf: (id: number) => string;
}) {
  const count = filing.selected.size;
  const over = count > DATA_ROOM_FILE_LIMIT;
  return (
    <div className="vd-dr-file" data-testid="vault-data-room-file">
      <div className="vd-dr-file-acts">
        {count === 0 && unfiledIds.length > 0 ? (
          <button className="sp-ask" onClick={() => filing.selectMany(unfiledIds)} disabled={filing.busy}>
            Select {Math.min(unfiledIds.length, DATA_ROOM_FILE_LIMIT)} not yet filed
          </button>
        ) : null}
        {count > 0 ? (
          <>
            <button className="sp-ask" onClick={() => void filing.fileSelected()} disabled={filing.busy || over}>
              {filing.busy ? 'Filing…' : `File ${count} into Vault`}
            </button>
            <button className="vd-dr-toggle" onClick={filing.clear} disabled={filing.busy}>Clear selection</button>
          </>
        ) : null}
        <span className="vd-dr-meta">
          {over
            ? `At most ${DATA_ROOM_FILE_LIMIT} at a time.`
            : 'Each file is checked against the bytes captured and lands suggested or unfiled, for you to confirm.'}
        </span>
      </div>
      {filing.error ? <div className="vd-dr-err" role="alert">{filing.error}</div> : null}
      {filing.outcome ? (
        <div className="vd-dr-file-result" role="status">
          <span className={filing.outcome.complete ? 'vd-dr-meta' : 'vd-dr-file-partial'}>
            {fileOutcomeSummary(filing.outcome)}
          </span>
          <ul>
            {filing.outcome.items.map((i) => (
              <li key={i.sourceId} className={i.outcome === 'refused' ? 'vd-dr-file-refused' : undefined}>
                <b>{titleOf(i.sourceId)}</b>: {fileItemText(i)}
                {i.outcome === 'refused' && i.code === 'VERSION_CONTENT_CONFLICT' && i.headDocumentId ? (
                  /* A different file under a recorded name is a new version of that document, if the person
                     says so. The offer is theirs to take, never made by the filing itself (QA-2026-10-08). */
                  <button
                    className="sp-ask"
                    onClick={() => void filing.addAsVersion(i.sourceId, i.headDocumentId as string)}
                    disabled={filing.busy}
                    aria-label={`Add as the next version of ${titleOf(i.sourceId)}`}
                  >
                    Add as the next version
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
