/**
 * The structure of a SAS transport file (.xpt, version 5), read from its
 * header records alone (D2, Data Room catalog; founder decision 2026-10-15,
 * "Do it all", on the design doc's §6: the platform reads the format FDA's
 * Study Data Technical Conformance Guide requires for submitted datasets).
 *
 * A v5 transport file is a sequence of 80-byte records:
 *   - a LIBRARY header and two records naming the SAS release and dates;
 *   - per dataset (member): a MEMBER header, a DSCRPTR header, two records
 *     with the dataset's name and label, a NAMESTR header carrying the
 *     variable count, then one 140-byte (136 on VAX/VMS) descriptor per
 *     variable, padded to a record boundary;
 *   - an OBS header, then the observations, each the sum of the variables'
 *     lengths, the last record padded with blanks.
 * Everything a catalog needs is in the descriptors: the variable's name,
 * label, type (numeric or character), length and display format. The row
 * count follows from the observation section's length. No observation is
 * decoded: a listing holds subject-level data (and numbers in IBM floating
 * point), and the catalog keeps structure only, as dataset-profile.ts does
 * for CSV.
 *
 * Version 8 transport files (LIBV8 headers, long names) are recognised and
 * declined by name rather than misread: FDA requires v5.
 */

export interface XptVariable {
  name: string;
  label: string;
  type: 'numeric' | 'character';
  length: number;
  /** The display format name ('DATE9', 'IS8601DA', ''), which says when a numeric is a date. */
  format: string;
}

export interface XptMember {
  name: string;
  label: string;
  variables: XptVariable[];
  rowCount: number;
}

export type XptReadResult =
  | { ok: true; sasRelease: string; members: XptMember[] }
  | { ok: false; reason: 'NOT_XPORT' | 'XPORT_V8_NOT_SUPPORTED' | 'MALFORMED' };

const REC = 80;
const LIB_V5 = 'HEADER RECORD*******LIBRARY HEADER RECORD!!!!!!!';
const LIB_V8 = 'HEADER RECORD*******LIBV8   HEADER RECORD!!!!!!!';
const MEMBER = 'HEADER RECORD*******MEMBER  HEADER RECORD!!!!!!!';
const NAMESTR = 'HEADER RECORD*******NAMESTR HEADER RECORD!!!!!!!';
const OBS = 'HEADER RECORD*******OBS     HEADER RECORD!!!!!!!';
/** Members per file and variables per member read; FDA's datasets are one member each. */
const MAX_MEMBERS = 50;
const MAX_VARIABLES = 2000;

const ascii = (b: Buffer, from: number, len: number) => b.toString('latin1', from, from + len).replace(/\s+$/, '');
const startsAt = (b: Buffer, at: number, marker: string) => b.toString('latin1', at, at + marker.length) === marker;

/** Whether the bytes are a SAS transport file, by its first record. */
export function isXport(bytes: Buffer): boolean {
  return bytes.length >= REC && (startsAt(bytes, 0, LIB_V5) || startsAt(bytes, 0, LIB_V8));
}

/** One variable descriptor (namestr), big-endian as the format defines. */
function readNamestr(b: Buffer, at: number): XptVariable {
  return {
    type: b.readInt16BE(at) === 2 ? 'character' : 'numeric',
    length: b.readInt16BE(at + 4),
    name: ascii(b, at + 8, 8),
    label: ascii(b, at + 16, 40),
    format: ascii(b, at + 56, 8),
  };
}

/** The next record at or after `from` that starts with `marker`, or -1. */
function nextRecord(b: Buffer, from: number, marker: string): number {
  for (let at = from; at + REC <= b.length; at += REC) if (startsAt(b, at, marker)) return at;
  return -1;
}

/** Observations in [from, to): whole observations, not counting the blank padding of the last record. */
function countRows(b: Buffer, from: number, to: number, obsLength: number): number {
  if (obsLength <= 0) return 0;
  let rows = Math.floor((to - from) / obsLength);
  // The last record is padded with blanks; a trailing "observation" made only of padding is not one.
  while (rows > 0) {
    const start = from + (rows - 1) * obsLength;
    if (!b.subarray(start, start + obsLength).every((c) => c === 0x20)) break;
    rows--;
  }
  return rows;
}

/** One member starting at its MEMBER header; returns it and where the next member's header starts (or -1). */
function readMember(b: Buffer, memberAt: number): { member: XptMember; next: number } | null {
  // The namestr length is in the MEMBER header: 140, or 136 on VAX/VMS.
  const namestrLength = Number(b.toString('latin1', memberAt + 74, memberAt + 78)) || 140;
  const descriptor = memberAt + 2 * REC; // after MEMBER and DSCRPTR headers
  const name = ascii(b, descriptor + 8, 8);
  const label = ascii(b, descriptor + REC + 32, 40);
  const namestrAt = nextRecord(b, descriptor, NAMESTR);
  if (namestrAt < 0) return null;
  const count = Number(b.toString('latin1', namestrAt + 54, namestrAt + 58));
  if (!Number.isInteger(count) || count < 0 || count > MAX_VARIABLES) return null;
  const first = namestrAt + REC;
  if (first + count * namestrLength > b.length) return null;
  const variables = Array.from({ length: count }, (_, i) => readNamestr(b, first + i * namestrLength));
  const obsAt = nextRecord(b, first + Math.ceil((count * namestrLength) / REC) * REC, OBS);
  if (obsAt < 0) return null;
  const dataFrom = obsAt + REC;
  const next = nextRecord(b, dataFrom, MEMBER);
  const dataTo = next < 0 ? b.length : next;
  const obsLength = variables.reduce((n, v) => n + v.length, 0);
  return { member: { name, label, variables, rowCount: countRows(b, dataFrom, dataTo, obsLength) }, next };
}

/** Read a transport file's structure. Never throws: a malformed file is a reason, not an exception. */
export function readXptStructure(bytes: Buffer): XptReadResult {
  if (!isXport(bytes)) return { ok: false, reason: 'NOT_XPORT' };
  if (startsAt(bytes, 0, LIB_V8)) return { ok: false, reason: 'XPORT_V8_NOT_SUPPORTED' };
  try {
    const sasRelease = ascii(bytes, REC + 24, 8);
    const members: XptMember[] = [];
    let at = nextRecord(bytes, REC * 3, MEMBER);
    while (at >= 0 && members.length < MAX_MEMBERS) {
      const read = readMember(bytes, at);
      if (!read) return { ok: false, reason: 'MALFORMED' };
      members.push(read.member);
      at = read.next;
    }
    return members.length ? { ok: true, sasRelease, members } : { ok: false, reason: 'MALFORMED' };
  } catch {
    return { ok: false, reason: 'MALFORMED' };
  }
}

/**
 * The structure as text, for search and for AnA's reading: one block per
 * dataset, one line per variable. No observation is in it.
 */
export function xptStructureText(read: Extract<XptReadResult, { ok: true }>): string {
  return read.members.map((m) => [
    `SAS transport dataset ${m.name}${m.label ? ` — ${m.label}` : ''}: ${m.rowCount} record(s), ${m.variables.length} variable(s).`,
    ...m.variables.map((v) => `${v.name}: ${v.label || '(no label)'} (${v.type}, length ${v.length}${v.format ? `, format ${v.format}` : ''})`),
  ].join('\n')).join('\n\n');
}
