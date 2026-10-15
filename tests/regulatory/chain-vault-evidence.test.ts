/**
 * The database-lock plan reads the Vault in the Vault's own filing vocabulary
 * (D2, step g-chain-vault-evidence, 2026-10-05).
 *
 * Before this change the `csr` step was decided by section prefix alone, so a
 * final SAP or a protocol at 5.3.5.1 made the CSR "filed" and AnA named the
 * ISS/ISE as next with no CSR in the Vault; a CSR the Vault's classifiers file
 * at the heading 5.3.5, or in Module 5 with no section, read "not found" and
 * blocked eight steps; and a Module 2 summary or an ISS/ISE filed in the wrong
 * place was never reported.
 */
import { describe, it, expect } from 'vitest';
import { evaluateChain, type VaultSectionFact } from '../../server/services/ind/ctd/index';
import { FDA_ISS_ISE_PLACEMENT, M4E_R2 } from '../../server/services/ind/ctd/regulatory-basis';

const fact = (ctdSection: string | null, title: string, extra: Partial<VaultSectionFact> = {}): VaultSectionFact => ({
  ctdSection, title, placementStatus: 'confirmed', ...extra,
});
const stateOf = (facts: VaultSectionFact[], id: string) => evaluateChain(facts).nodes.find((n) => n.id === id);

describe('a document counts for the CSR step only when it is a CSR', () => {
  it('a final SAP at 5.3.5.1 is the SAP, not the CSR, and the ISS is not next', () => {
    const v = evaluateChain([fact('5.3.5.1', 'Statistical Analysis Plan v2.0 final')]);
    const by = new Map(v.nodes.map((n) => [n.id, n.state]));
    expect(by.get('sap_final')).toBe('filed');
    expect(by.get('csr')).toBe('not_found');
    expect(v.next.map((n) => n.id)).not.toContain('iss');
    expect(v.blocked.find((b) => b.id === 'iss')?.waitsOn).toContain('csr');
  });

  it('a protocol at 5.3.5.1 is not a CSR; a CSR named by its protocol number is', () => {
    expect(stateOf([fact('5.3.5.1', 'Protocol ABC-301 Amendment 2')], 'csr')?.state).toBe('not_found');
    expect(stateOf([fact('5.3.5.1', 'ABC-301_Protocol_v3.pdf')], 'csr')?.state).toBe('not_found');
    expect(stateOf([fact('5.3.5.1', 'ABC-301_SAP_final.pdf')], 'csr')?.state).toBe('not_found');
    expect(stateOf([fact('5.3.5.1', 'Clinical Study Report — Protocol ABC-301')], 'csr')?.state).toBe('filed');
  });

  it('an integrated summary or a Module 2 summary filed under 5.3 is not a CSR', () => {
    expect(stateOf([fact('5.3.5.1', 'Integrated Summary of Safety')], 'csr')?.state).toBe('not_found');
    expect(stateOf([fact('5.3.5.2', 'Summary of Clinical Efficacy')], 'csr')?.state).toBe('not_found');
  });

  it('a real CSR at a study-type leaf is still filed, by its title or by the kind the Vault recorded', () => {
    expect(stateOf([fact('5.3.5.1', 'ABC-301 Clinical Study Report')], 'csr')?.state).toBe('filed');
    expect(stateOf([fact('5.3.5.2', 'ABC-201_CSR.pdf')], 'csr')?.state).toBe('filed');
    expect(stateOf([fact('5.3.5.2', 'Study 201 final report', { evidenceKind: 'csr' })], 'csr')?.state).toBe('filed');
  });

  it('a document the Vault recorded as a CSR is not the final SAP', () => {
    expect(stateOf([fact('5.3.5.1', 'Study 301 SAP', { evidenceKind: 'csr' })], 'sap_final')?.state).toBe('not_found');
  });
});

describe('a CSR filed without a study-type leaf is reported, not lost and not filed', () => {
  it('a confirmed CSR at the heading 5.3.5 is suggested-level with the placement to fix', () => {
    const v = evaluateChain([fact('5.3.5', 'ABC-301 CSR', { evidenceKind: 'report', folderId: 'module-5' })]);
    const csr = v.nodes.find((n) => n.id === 'csr')!;
    expect(csr.state).toBe('suggested');
    expect(csr.why).toMatch(/5\.3\.5\.1, \.2 or \.4/);
    expect(v.unspecificPlacement).toEqual([
      expect.objectContaining({ step: 'csr', document: 'ABC-301 CSR', filedAt: '5.3.5' }),
    ]);
    // Suggested is not filed: what is written from the CSR still waits on it.
    expect(v.blocked.find((b) => b.id === 'iss')?.waitsOn).toContain('csr');
  });

  it('a CSR in Module 5 with no section is seen, at suggested level', () => {
    const v = evaluateChain([fact(null, 'Study 301 report', { evidenceKind: 'csr', folderId: 'module-5' })]);
    expect(v.nodes.find((n) => n.id === 'csr')?.state).toBe('suggested');
    expect(v.unspecificPlacement[0]).toMatchObject({ step: 'csr', filedAt: 'Module 5 (no section)' });
  });

  it('a properly filed CSR outranks one filed at the heading', () => {
    const v = evaluateChain([fact('5.3.5.1', 'CSR ABC-301'), fact('5.3.5', 'CSR ABC-302')]);
    expect(v.nodes.find((n) => n.id === 'csr')?.state).toBe('filed');
    expect(v.unspecificPlacement.map((u) => u.document)).toEqual(['CSR ABC-302']);
  });
});

describe('a document filed where its kind does not go is reported as misfiled', () => {
  it('a Summary of Clinical Efficacy in Module 5 is misfiled, expected at 2.7.3 (ICH M4E)', () => {
    const v = evaluateChain([fact('5.3.5', 'Summary of Clinical Efficacy')]);
    expect(v.misfiled).toHaveLength(1);
    expect(v.misfiled[0]).toMatchObject({ title: 'Summary of Clinical Efficacy', filedAt: '5.3.5' });
    expect(v.misfiled[0].expected).toContain('2.7.3');
    expect(v.misfiled[0].basis).toEqual(M4E_R2);
  });

  it('a Summary of Clinical Safety in Module 5 with no section is misfiled, expected at 2.7.4', () => {
    const v = evaluateChain([fact(null, 'Summary of Clinical Safety', { folderId: 'module-5' })]);
    expect(v.misfiled[0]).toMatchObject({ filedAt: 'Module 5 (no section)', expected: ['2.7.4'] });
  });

  it('an ISS outside 5.3.5.3, 2.7.3 and 2.7.4 is misfiled on FDA’s placement page', () => {
    const v = evaluateChain([fact('5.3.5.1', 'Integrated Summary of Safety')]);
    expect(v.misfiled).toHaveLength(1);
    expect(v.misfiled[0].expected).toContain('5.3.5.3');
    expect(v.misfiled[0].basis).toEqual(FDA_ISS_ISE_PLACEMENT);
  });

  it('an ISS whose narrative is placed at 2.7.4 is not misfiled, and the 5.3.5.3 leaf it needs is named', () => {
    const v = evaluateChain([fact('2.7.4', 'Integrated Summary of Safety')]);
    expect(v.misfiled).toEqual([]);
    expect(v.placementNotes).toHaveLength(1);
    expect(v.placementNotes[0].note).toMatch(/5\.3\.5\.3/);
    expect(v.placementNotes[0].basis).toEqual(FDA_ISS_ISE_PLACEMENT);
  });

  it('documents filed where they belong report nothing', () => {
    const v = evaluateChain([
      fact('5.3.5.3', 'Integrated Summary of Effectiveness'),
      fact('2.7.3', 'Summary of Clinical Efficacy'),
      fact('2.7.4', 'Summary of Clinical Safety'),
      fact('5.3.5.1', 'CSR ABC-301'),
    ]);
    expect(v.misfiled).toEqual([]);
    expect(v.unspecificPlacement).toEqual([]);
    expect(v.placementNotes).toEqual([]);
  });
});
