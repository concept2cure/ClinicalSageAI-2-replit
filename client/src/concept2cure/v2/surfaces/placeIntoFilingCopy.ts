/**
 * The filing copy Place into filing takes: the saved sections assembled into
 * one snapshot, requested from the existing governed snapshot route, and the
 * outcomes of that request and of the leaf placement in words. Moved out of
 * AuthoringPlaceIntoFiling.tsx (2026-10-08) to keep that file within its line
 * limit; the dialog is the only caller.
 */
import { liveGetOrNull } from '../dataConnect';
import { validReceiptId } from './filingTarget';
import { mutateVerbatim, type MutateResult } from './SubmissionSeqWorkspaces';
import { documentSourceLabel } from '@shared/regulatory/canonical-document';

export type Verdict = { tone: 'ok' | 'err'; text: string } | null;

/** GET /api/authoring/docs/:docId/sections rows (subset). */
interface SavedSection {
  code: string | null;
  title: string | null;
  content: string | null;
}

/**
 * Assemble the saved sections into one snapshot body — the SAME format the
 * authoring → canonical bridge uses server-side
 * (server/services/ana/authoring-canonical-bridge.ts, loadDocumentSnapshot),
 * so the filed content reads identically wherever the document is projected.
 */
export function assembleSnapshot(sections: SavedSection[]): string {
  return sections
    .map((s) => {
      const heading = [s.code, s.title].filter(Boolean).join(' — ');
      return heading ? `## ${heading}\n\n${s.content ?? ''}` : String(s.content ?? '');
    })
    .join('\n\n')
    .trim();
}

interface SnapshotRow { id?: number; status?: string | null; metadata?: { source?: string; docId?: string } | null }

type CopyResult =
  /** `written`: the server's word on whether this placement wrote the copy; undefined when it gave none. */
  | { ok: true; snapshotId: number; written: boolean | undefined; copyStatus: string | null }
  | { ok: false; unconfirmed: boolean; verdict: NonNullable<Verdict> };

/** Read saved content and request the existing governed snapshot. A context
 * switch after the read stops the next write; an already-sent write may commit. */
export async function takeFilingCopy(docId: string, docTitle: string, sectionCode: string, changeReason: string, current: () => boolean): Promise<CopyResult | null> {
  const read = await liveGetOrNull<{ sections?: SavedSection[] }>(`/api/authoring/docs/${encodeURIComponent(docId)}/sections`);
  if (!current()) return null;
  if (read.error || !read.data) return {
    ok: false, unconfirmed: false,
    verdict: { tone: 'err', text: `Couldn’t read the document’s saved sections — ${read.error ?? 'no response'}. Nothing was filed.` },
  };
  if (!Array.isArray(read.data.sections)) return {
    ok: false, unconfirmed: false,
    verdict: { tone: 'err', text: 'The saved sections could not be read. This is a failed read, not an empty document. Nothing was filed.' },
  };
  const saved = read.data.sections;
  if (!saved.some(s => (s.content ?? '').trim() !== '')) return {
    ok: false, unconfirmed: false,
    verdict: { tone: 'err', text: 'This document has no saved section content yet — there is nothing to file. Nothing was created.' },
  };
  const snap: SnapshotReply = await mutateVerbatim('POST', '/api/coauthor/documents', {
    title: docTitle, moduleNumber: sectionCode, content: assembleSnapshot(saved), sourceAuthoringDocId: docId, changeReason,
  });
  if (!current()) return null;
  return copyReceipt(snap, docId) ?? snapshotFailure(snap);
}

type SnapshotReply = MutateResult<{ success?: boolean; written?: unknown; document?: SnapshotRow }>;

/** The snapshot step's refusal of a copy that a leaf already files: the server's sentence is complete. */
const FILING_COPY_PINNED = 'FILING_COPY_PINNED';

/** The filing copy the server confirmed for this document, with the status it
 *  was filed as and whether this placement wrote it; or its refusal of a copy
 *  a leaf files (filing-copy pins); null when the answer is neither. */
function copyReceipt(snap: SnapshotReply, docId: string): CopyResult | null {
  const row = snap.data?.document;
  const snapshotId = row?.id;
  if (row && validReceiptId(snapshotId) && matchingSnapshotSource(row, docId) && snap.data?.success !== false) {
    const written = typeof snap.data?.written === 'boolean' ? snap.data.written : undefined;
    return { ok: true, snapshotId, written, copyStatus: typeof row.status === 'string' ? row.status : null };
  }
  if (snap.code === FILING_COPY_PINNED && snap.error) {
    return { ok: false, unconfirmed: false, verdict: { tone: 'err', text: snap.error } };
  }
  return null;
}

function snapshotFailure(snap: MutateResult<unknown>): CopyResult {
  const unconfirmed = !!snap.unconfirmed || snap.data != null;
  return {
    ok: false, unconfirmed,
    verdict: { tone: 'err', text: unconfirmed
      ? 'The filing snapshot could not be confirmed. A copy may have been created; check filing status before retrying. No leaf placement was requested.'
      : `The filing snapshot could not be created — ${snap.error ?? 'the server refused it'}. Nothing was placed.` },
  };
}
export function leafFailure(put: MutateResult<unknown>, snapshotId: number, sequence: string, sectionCode: string) {
  const unconfirmed = !!put.unconfirmed || put.data != null;
  return {
    unconfirmed,
    verdict: { tone: 'err' as const, text: unconfirmed
      ? `We cannot confirm whether the leaf was placed in sequence ${sequence} at ${sectionCode}. ` +
        `The filing copy was created (${documentSourceLabel('coauthor_documents', snapshotId)}). Check filing status before retrying.`
      : `The leaf was refused — ${put.error ?? 'the server refused it'}. ` +
        `The filing copy was created (${documentSourceLabel('coauthor_documents', snapshotId)}), but nothing was placed in the sequence.` },
  };
}

function matchingSnapshotSource(row: SnapshotRow | undefined, docId: string): boolean {
  return row?.metadata?.source === 'authoring-document' && row.metadata.docId === docId;
}
