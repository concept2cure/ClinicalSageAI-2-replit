/**
 * SAS transport (.xpt v5) files built byte for byte to the format (80-byte
 * records, 140-byte big-endian variable descriptors, blank padding), for the
 * reader's tests and the dataset profile's. Observation bytes are opaque:
 * nothing reads them.
 */
export const REC = 80;
export const rec = (s: string) => Buffer.from(s.padEnd(REC, ' ').slice(0, REC), 'latin1');
const pad = (b: Buffer) => Buffer.concat([b, Buffer.alloc((REC - (b.length % REC)) % REC, 0x20)]);
const field = (s: string, n: number) => Buffer.from(s.padEnd(n, ' ').slice(0, n), 'latin1');

export interface Var { name: string; label: string; type: 'num' | 'char'; length: number; format?: string }

function namestr(v: Var, i: number): Buffer {
  const b = Buffer.alloc(140, 0);
  b.writeInt16BE(v.type === 'char' ? 2 : 1, 0);
  b.writeInt16BE(v.length, 4);
  b.writeInt16BE(i + 1, 6);
  field(v.name, 8).copy(b, 8);
  field(v.label, 40).copy(b, 16);
  field(v.format ?? '', 8).copy(b, 56);
  return b;
}

export function member(name: string, label: string, vars: Var[], rows: number): Buffer {
  const obsLength = vars.reduce((n, v) => n + v.length, 0);
  // Observation bytes are opaque here (never decoded); a non-blank byte marks each one.
  const obs = Buffer.alloc(rows * obsLength, 0x41);
  return Buffer.concat([
    rec('HEADER RECORD*******MEMBER  HEADER RECORD!!!!!!!000000000000000001600000000140'),
    rec('HEADER RECORD*******DSCRPTR HEADER RECORD!!!!!!!000000000000000000000000000000'),
    Buffer.concat([field('SAS', 8), field(name, 8), field('SASDATA', 8), field('9.4', 8), field('X64_10PR', 8), field('', 24), field('01JAN24:00:00:00', 16)]),
    Buffer.concat([field('01JAN24:00:00:00', 16), field('', 16), field(label, 40), field('', 8)]),
    rec(`HEADER RECORD*******NAMESTR HEADER RECORD!!!!!!!000000${String(vars.length).padStart(4, '0')}00000000000000000000`),
    pad(Buffer.concat(vars.map(namestr))),
    rec('HEADER RECORD*******OBS     HEADER RECORD!!!!!!!000000000000000000000000000000'),
    pad(obs),
  ]);
}

export function library(...members: Buffer[]): Buffer {
  return Buffer.concat([
    rec('HEADER RECORD*******LIBRARY HEADER RECORD!!!!!!!000000000000000000000000000000'),
    Buffer.concat([field('SAS', 8), field('SAS', 8), field('SASLIB', 8), field('9.4', 8), field('X64_10PR', 8), field('', 24), field('01JAN24:00:00:00', 16)]),
    rec('01JAN24:00:00:00'),
    ...members,
  ]);
}

export const AE: Var[] = [
  { name: 'STUDYID', label: 'Study Identifier', type: 'char', length: 12 },
  { name: 'DOMAIN', label: 'Domain Abbreviation', type: 'char', length: 2 },
  { name: 'USUBJID', label: 'Unique Subject Identifier', type: 'char', length: 20 },
  { name: 'AESEQ', label: 'Sequence Number', type: 'num', length: 8 },
  { name: 'AETERM', label: 'Reported Term for the Adverse Event', type: 'char', length: 40 },
  { name: 'AESTDTC', label: 'Start Date/Time of Adverse Event', type: 'char', length: 19 },
  { name: 'TRTSDT', label: 'Date of First Exposure', type: 'num', length: 8, format: 'DATE9' },
];
