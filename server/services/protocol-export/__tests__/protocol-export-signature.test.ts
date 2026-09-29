/**
 * The exported protocol states its status and its finalization signature
 * (periodic review 2026-09-28, editor family, P11-C-2).
 *
 * The Markdown the export renders is what MD, DOCX and PDF are all made from,
 * and it carried the title, the meta line and the content only: a finalized
 * protocol printed exactly like a draft, with no signer, time or meaning.
 * §11.50(b) requires the manifestation on any human-readable form of a signed
 * record. Pure: the service reads the signature row (protocol-signature-
 * manifestation.pglite.integration.test.ts proves that read end to end).
 */
import { describe, it, expect } from 'vitest';
import { assembleProtocolExport, renderProtocolMarkdown, type ExportDoc } from '../protocol-export-logic';
import type { PdevSignatureFacet } from '../../protocol-development/protocol-signature-manifestation';

const base: ExportDoc = { title: 'A Phase 2 Study of Drug X', protocolNumber: 'PRO-001', protocolKind: 'clinical', version: '1.0', synopsis: 'A randomized study.' };

const SIGNED: PdevSignatureFacet = {
  state: 'signed',
  signature: {
    signerName: 'Dana Approver',
    signedAt: '2026-09-28T04:40:12.345Z',
    meaning: 'approval',
    reason: 'Protocol complete; approved for IRB submission',
    recordedOnBehalfOf: null,
  },
};

function markdown(status: string | null, finalization: PdevSignatureFacet): string {
  return renderProtocolMarkdown(assembleProtocolExport({ ...base, status, finalization }, [], [], [], []));
}

/** The lines of the signature section, up to the next heading. */
function signatureSection(md: string): string[] {
  const lines = md.split('\n');
  const start = lines.indexOf('## Electronic signature');
  expect(start, 'no signature section').toBeGreaterThan(-1);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => l.startsWith('## '));
  return (end === -1 ? rest : rest.slice(0, end)).filter(Boolean);
}

describe('the export’s status line and signature block', () => {
  it('a signed finalization prints the printed name, the meaning in words, the UTC time and the reason', () => {
    const md = markdown('finalized', SIGNED);
    expect(md).toContain('**Status:** Finalized');
    expect(signatureSection(md)).toEqual([
      '- Signed by: Dana Approver',
      '- Meaning: Approval',
      '- Executed: 2026-09-28 04:40:12 UTC',
      '- Reason: Protocol complete; approved for IRB submission',
    ]);
  });

  it('comes before the content, so no page of the protocol reads unsigned above its signature', () => {
    const md = renderProtocolMarkdown(assembleProtocolExport(
      { ...base, status: 'finalized', finalization: SIGNED },
      [{ sectionKey: 'background', title: 'Background', content: 'BG', orderIndex: 0 }], [], [], [],
    ));
    expect(md.indexOf('## Electronic signature')).toBeLessThan(md.indexOf('## Synopsis'));
    expect(md.indexOf('**Status:** Finalized')).toBeLessThan(md.indexOf('## Electronic signature'));
  });

  it('a revoked signature says so first, and still names who signed', () => {
    const lines = signatureSection(markdown('finalized', { ...SIGNED, state: 'revoked' }));
    expect(lines[0]).toMatch(/^- REVOKED: /);
    expect(lines).toContain('- Signed by: Dana Approver');
  });

  it('a finalized protocol with no signature on record says so, never a signer', () => {
    expect(signatureSection(markdown('finalized', { state: 'none' }))).toEqual([
      '- No electronic signature is on record for this finalization.',
    ]);
  });

  it('a protocol that is not finalized says no signature applies', () => {
    const md = markdown('in_development', { state: 'none' });
    expect(md).toContain('**Status:** In development');
    expect(signatureSection(md)).toEqual(['- Not finalized: no electronic signature has been applied to this version.']);
  });

  it('a signature record that could not be read is said, not printed as unsigned', () => {
    expect(signatureSection(markdown('finalized', { state: 'unavailable' }))).toEqual([
      '- The signature record could not be read, so this copy does not carry the signature.',
    ]);
  });

  it('a meaning outside the protocol vocabulary is printed as stored, not mapped to a guess', () => {
    const lines = signatureSection(markdown('finalized', { ...SIGNED, signature: { ...SIGNED.signature, meaning: 'APPROVED' } }));
    expect(lines).toContain('- Meaning: APPROVED');
  });

  it('a decision recorded on someone’s behalf names them', () => {
    const lines = signatureSection(markdown('finalized', { ...SIGNED, signature: { ...SIGNED.signature, meaning: 'responsibility', recordedOnBehalfOf: 'Dr Iyer' } }));
    expect(lines).toContain('- Meaning: Responsibility');
    expect(lines).toContain('- Recorded on behalf of: Dr Iyer');
  });
});
