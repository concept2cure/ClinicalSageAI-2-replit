/**
 * Letter of Authorization (m1.4.1), Statement of Right of Reference (m1.4.2)
 * and the cross-reference register — the scope of a right of reference is
 * stated, never granted on the holder's behalf.
 *
 * What the code used to do (until 2026-10-15): with no authorized sections
 * recorded, the LOA read "…hereby authorizes [party] and the U.S. Food and
 * Drug Administration to reference the file in its entirety", the sponsor's
 * statement claimed a right "covering the file in its entirety", and the
 * register showed `scope: 'the file in its entirety'`. `authorizedSections` was
 * not a required particular, so no gap was raised: a legal grant by a third
 * party was invented from a blank field.
 */
import { describe, it, expect } from 'vitest';
import { assembleLetterOfAuthorization, type LetterOfAuthorizationInput } from '../ind-loa-service';
import {
  assembleRightOfReferenceStatement,
  buildCrossReferenceRegister,
  type RightOfReferenceStatementInput,
} from '../ind-cross-reference-service';

const loa = (over: Partial<LetterOfAuthorizationInput> = {}): LetterOfAuthorizationInput => ({
  referencedFileType: 'DMF',
  referencedFileNumber: '012345',
  holderName: 'Excipient Co.',
  authorizedPartyName: 'Acme Therapeutics',
  subjectName: 'C2C-001 drug substance',
  signatoryName: 'Dana Holder',
  ...over,
});

const ror = (over: Partial<RightOfReferenceStatementInput> = {}): RightOfReferenceStatementInput => ({
  sponsorName: 'Acme Therapeutics',
  referencedFileType: 'DMF',
  referencedFileNumber: '012345',
  subjectName: 'C2C-001 drug substance',
  signatoryName: 'Dana Holder',
  ...over,
});

const text = (m: { sections: Array<{ body: string }> }) => m.sections.map((s) => s.body).join('\n');

describe('assembleLetterOfAuthorization — the authorized scope', () => {
  it('with no sections recorded: a placeholder and a gap, never an entire-file grant', () => {
    for (const authorizedSections of [undefined, [], ['  ']]) {
      const m = assembleLetterOfAuthorization(loa({ authorizedSections }));
      expect(text(m), JSON.stringify(authorizedSections)).not.toMatch(/in its entirety/);
      expect(text(m)).toContain('[scope to be specified]');
      expect(m.gaps).toContain('authorized scope (sections authorized for reference)');
    }
  });

  it('stated sections are printed and raise no gap', () => {
    const m = assembleLetterOfAuthorization(loa({ authorizedSections: ['3.2.S Drug Substance', '3.2.P.5'] }));
    expect(m.sections.find((s) => s.key === 'scope')!.body).toBe('Authorized for reference: 3.2.S Drug Substance; 3.2.P.5.');
    expect(m.gaps).toEqual([]);
  });

  it('an entire-file grant is printed when the person states it', () => {
    const m = assembleLetterOfAuthorization(loa({ authorizedSections: ['the file in its entirety'] }));
    expect(m.sections.find((s) => s.key === 'authorization')!.body).toContain('to reference the file in its entirety');
    expect(m.gaps).toEqual([]);
  });
});

describe('assembleRightOfReferenceStatement — the scope relied upon', () => {
  it('with no sections recorded: a placeholder and a gap, never "covering the file in its entirety"', () => {
    const m = assembleRightOfReferenceStatement(ror());
    expect(text(m)).not.toMatch(/in its entirety/);
    expect(text(m)).toContain('covering [scope to be specified]');
    expect(m.gaps).toContain('authorized scope (sections relied upon)');
  });

  it('stated sections are printed and raise no gap', () => {
    const m = assembleRightOfReferenceStatement(ror({ authorizedSections: ['3.2.S'] }));
    expect(text(m)).toContain('covering 3.2.S');
    expect(m.gaps).toEqual([]);
  });
});

describe('buildCrossReferenceRegister — the recorded scope', () => {
  it('an entry with no sections has scope null and a warning naming it; LOA readiness is unchanged', () => {
    const reg = buildCrossReferenceRegister([
      { referencedFileType: 'DMF', referencedFileNumber: '111', subjectName: 'Substance', loaOnFile: true },
    ]);
    expect(reg.entries[0].scope).toBeNull();
    const f = reg.findings.find((x) => x.code === 'SCOPE_NOT_SPECIFIED');
    expect(f?.severity).toBe('warning');
    expect(f?.message).toMatch(/DMF 111/);
    expect(reg.ready).toBe(true);
  });

  it('an entry with sections keeps them as its scope, with no warning', () => {
    const reg = buildCrossReferenceRegister([
      { referencedFileType: 'DMF', referencedFileNumber: '111', subjectName: 'Substance', authorizedSections: ['3.2.S'], loaOnFile: true },
    ]);
    expect(reg.entries[0].scope).toBe('3.2.S');
    expect(reg.findings).toEqual([]);
  });
});
