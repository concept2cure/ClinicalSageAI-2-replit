/**
 * What the chosen section of a sequence already holds, and the note the placement
 * dialog shows about it (QA j3 finding (a), 2026-10-08).
 *
 * Its own module because the placement dialog file reached the project's line
 * limit. The rules are the ones the dialog applied inline before: a section is
 * compared case- and space-insensitively, another document may share it, and the
 * same document is not offered again.
 */
import React from 'react';
import type { DataState } from '../dataConnect';
import { SC_LIFECYCLE_OPS } from '../fixtures/submission';

/** A leaf of the sequence, as GET …/leaves returns it: only what the occupancy check reads. */
export interface SequenceLeafRow {
  id: number;
  sectionCode: string;
  lifecycleOp: string;
  documentTable: string | null;
  documentUuid: string | null;
  title: string;
  deletedAt?: string | null;
}

export const isLeafList = (value: unknown): value is SequenceLeafRow[] => Array.isArray(value);

/** What the chosen section of the chosen sequence already holds. */
export type Occupancy =
  | { kind: 'unknown' }
  | { kind: 'failed' }
  | { kind: 'none' }
  | { kind: 'others'; leaves: SequenceLeafRow[] }
  | { kind: 'same'; leaf: SequenceLeafRow };

/* The section is compared the way the server compares it for the one-leaf rule
   (case- and space-insensitively). Any live leaf in the section counts; if one of
   them names this document, the placement is about that leaf and nothing else. */
function sectionOccupancy(leaves: SequenceLeafRow[], sectionCode: string, documentUuid: string): Occupancy {
  const want = sectionCode.trim().toLowerCase();
  const live = leaves.filter((l) => !l.deletedAt && l.sectionCode.trim().toLowerCase() === want);
  const same = live.find((l) => l.documentTable === 'vault_documents' && l.documentUuid === documentUuid);
  if (same) return { kind: 'same', leaf: same };
  return live.length > 0 ? { kind: 'others', leaves: live } : { kind: 'none' };
}

const opLabel = (op: string): string => SC_LIFECYCLE_OPS[op]?.l ?? op;

/* What the section already holds, said before the click. Another document in the
   section is allowed (a section may hold several leaves, and the readiness check
   reports a second New leaf for confirmation), so that is a note. The same
   document is not offered again: placing it changes nothing, or it asks for a
   different operation the leaf does not have. */
export function OccupancyNotice({ occupancy, section, sequenceNumber, op }: {
  occupancy: Occupancy;
  section: string;
  sequenceNumber: string | undefined;
  op: string;
}) {
  const seqNo = sequenceNumber ?? 'this sequence';
  if (occupancy.kind === 'failed') {
    return (
      <div className="de-err" role="status">
        {`The leaves of ${seqNo} could not be read, so whether section ${section} already holds this document is not shown. The server files a document once per section.`}
      </div>
    );
  }
  if (occupancy.kind === 'others') {
    const { leaves } = occupancy;
    const listed = leaves.map((l) => `“${l.title}” (${opLabel(l.lifecycleOp)})`).join('; ');
    const count = leaves.length === 1 ? '1 leaf' : `${leaves.length} leaves`;
    return (
      <div className="de-desc" role="status">
        {`Section ${section} already holds ${count} in sequence ${seqNo}: ${listed}.` +
          (op === 'new' ? ' Placing this document as New adds a second New leaf to the section; the readiness check reports that for confirmation.' : '')}
      </div>
    );
  }
  if (occupancy.kind === 'same') {
    const existing = opLabel(occupancy.leaf.lifecycleOp);
    const text = occupancy.leaf.lifecycleOp === op
      ? `This document is already placed at ${section} in sequence ${seqNo} as ${existing}. Placing it again would change nothing, so Place is unavailable.`
      : `This document is already placed at ${section} in sequence ${seqNo} as ${existing}. To place it as ${opLabel(op)}, remove that leaf first.`;
    return <div className="de-err" role="status">{text}</div>;
  }
  return null;
}

/** What the chosen section already holds: 'unknown' until the leaves are read, 'failed' when that read failed. */
export function occupancyOf(input: {
  leavesPath: string | null;
  leaves: DataState<SequenceLeafRow[]>;
  sectionUsable: boolean;
  canonical: string | null;
  documentUuid: string;
}): Occupancy {
  const { leavesPath, leaves, sectionUsable, canonical, documentUuid } = input;
  if (!leavesPath || !sectionUsable || canonical == null) return { kind: 'unknown' };
  if (leaves.error) return { kind: 'failed' };
  if (leaves.loading || !leaves.data) return { kind: 'unknown' };
  return sectionOccupancy(leaves.data, canonical, documentUuid);
}
