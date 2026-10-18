/**
 * SAS transport (.xpt v5) structure from the header records alone. The files
 * are built here byte for byte to the v5 layout (80-byte records, 140-byte
 * big-endian variable descriptors, blank padding), so the reader is checked
 * against the format, not against itself.
 */
import { describe, expect, it } from 'vitest';
import { isXport, readXptStructure } from '../xpt-structure';

import { AE, library, member, rec, REC, type Var } from './support/xpt-fixture';

describe('readXptStructure', () => {
  it('reads a dataset\'s name, label, variables and row count from the headers', () => {
    const out = readXptStructure(library(member('AE', 'Adverse Events', AE, 3)));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.sasRelease).toBe('9.4');
    expect(out.members).toHaveLength(1);
    const ae = out.members[0];
    expect(ae).toMatchObject({ name: 'AE', label: 'Adverse Events', rowCount: 3 });
    expect(ae.variables.map((v) => v.name)).toEqual(AE.map((v) => v.name));
    expect(ae.variables[3]).toEqual({ name: 'AESEQ', label: 'Sequence Number', type: 'numeric', length: 8, format: '' });
    expect(ae.variables[6].format).toBe('DATE9');
  });

  it('does not count the blank padding of the last record as an observation', () => {
    // 41-byte observations: one row leaves 39 blank bytes, which would hold most of another.
    const vars: Var[] = [{ name: 'X', label: 'x', type: 'char', length: 41 }];
    const out = readXptStructure(library(member('DM', 'Demographics', vars, 1)));
    expect(out.ok && out.members[0].rowCount).toBe(1);
  });

  it('reads every member of a library, each with its own row count', () => {
    const out = readXptStructure(library(member('AE', 'Adverse Events', AE, 2), member('DM', 'Demographics', AE.slice(0, 3), 5)));
    expect(out.ok && out.members.map((m) => [m.name, m.rowCount])).toEqual([['AE', 2], ['DM', 5]]);
  });

  it('a dataset with no observations has zero rows', () => {
    const out = readXptStructure(library(member('SUPPAE', 'Supplemental AE', AE.slice(0, 2), 0)));
    expect(out.ok && out.members[0].rowCount).toBe(0);
  });

  it('declines what it does not read, by name', () => {
    expect(readXptStructure(Buffer.from('not a transport file'))).toEqual({ ok: false, reason: 'NOT_XPORT' });
    const v8 = rec('HEADER RECORD*******LIBV8   HEADER RECORD!!!!!!!000000000000000000000000000000');
    expect(readXptStructure(Buffer.concat([v8, rec(''), rec('')]))).toEqual({ ok: false, reason: 'XPORT_V8_NOT_SUPPORTED' });
    const truncated = library(member('AE', 'Adverse Events', AE, 2)).subarray(0, REC * 6);
    expect(readXptStructure(truncated)).toEqual({ ok: false, reason: 'MALFORMED' });
  });

  it('recognises a transport file by its first record', () => {
    expect(isXport(library(member('AE', 'AE', AE, 1)))).toBe(true);
    expect(isXport(Buffer.from('%PDF-1.7'))).toBe(false);
  });
});
