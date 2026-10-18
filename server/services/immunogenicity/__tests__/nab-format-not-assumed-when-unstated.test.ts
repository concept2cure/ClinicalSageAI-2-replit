/**
 * The NAb assay format is chosen only from stated facts: an unstated
 * cell-based feasibility or endogenous redundancy is not assumed (2026-10-15).
 *
 * What the code used to do: `cellBasedFeasible ?? true`, so a mechanism that
 * calls for a cell-based assay came back recommendedFormat 'cell_based' with
 * no one having said a responsive, reproducible cell line exists. And
 * `endogenousNonRedundant === true` read an unstated answer as redundant: a
 * ligand-neutralizing mechanism came back cellBasedRequired false and a
 * competitive ligand-binding format, while the same mechanism with a stated
 * non-redundant counterpart required a cell-based assay, with a rationale
 * claiming "The mechanism is receptor/cell-signaling-mediated". A missing or
 * unknown mechanismClass was given the soluble-target CLB rationale, and a
 * non-numeric expected drug level ('25') came out as "Target NAb drug
 * tolerance ≥ 0 µg/mL".
 */
import { describe, expect, it } from 'vitest';
import { designNAbAssay, type NAbAssayParams } from '../immunogenicity-knowledge';
import { getToolHandler } from '../../ana/AnaToolExecutor.js';

const design = (p: Record<string, unknown>) => designNAbAssay(p as unknown as NAbAssayParams);

const inputs = (r: { notAssessed: Array<{ input: string }> }) => r.notAssessed.map((n) => n.input).sort();

function thrown(fn: () => unknown): { name?: string; code?: string; field?: string } | undefined {
  try {
    fn();
  } catch (err) {
    return err as { name?: string; code?: string; field?: string };
  }
  return undefined;
}

describe('designNAbAssay: feasibility is not assumed', () => {
  it('selects no format for a cell-signaling mechanism until feasibility is stated', () => {
    const r = design({ mechanismClass: 'receptor_agonist' });

    expect(r.recommendedFormat).toBeNull();
    expect(r.cellBasedRequired).toBe(true);
    expect(inputs(r)).toEqual(['cellBasedFeasible']);
    expect(r.summary).not.toMatch(/recommended NAb format is cell based/);
  });

  it('lets a stated feasibility decide, and keeps a stated false visible', () => {
    expect(design({ mechanismClass: 'receptor_agonist', cellBasedFeasible: true }).recommendedFormat).toBe('cell_based');

    const infeasible = design({ mechanismClass: 'receptor_agonist', cellBasedFeasible: false });
    expect(infeasible.recommendedFormat).toBe('competitive_ligand_binding');
    expect(infeasible.formatRationale).toMatch(/not technically feasible/);
    expect(infeasible.notAssessed).toEqual([]);
  });
});

describe('designNAbAssay: an unstated endogenous redundancy is not read as redundant', () => {
  it('leaves the cell-based requirement and the format open for a ligand neutralizer', () => {
    const r = design({ mechanismClass: 'ligand_neutralizer' });

    expect(r.cellBasedRequired).toBeNull();
    expect(r.recommendedFormat).toBeNull();
    expect(inputs(r)).toEqual(['cellBasedFeasible', 'endogenousNonRedundant']);
  });

  it('decides once the redundancy is stated', () => {
    const redundant = design({ mechanismClass: 'ligand_neutralizer', endogenousNonRedundant: false });
    expect(redundant.cellBasedRequired).toBe(false);
    expect(redundant.recommendedFormat).toBe('competitive_ligand_binding');
    expect(redundant.notAssessed).toEqual([]);

    const nonRedundant = design({ mechanismClass: 'ligand_neutralizer', endogenousNonRedundant: true, cellBasedFeasible: true });
    expect(nonRedundant.cellBasedRequired).toBe(true);
    expect(nonRedundant.recommendedFormat).toBe('cell_based');
    // The counterpart, not the mechanism, calls for it: a ligand neutralizer is not receptor-mediated.
    expect(nonRedundant.formatRationale).not.toMatch(/mechanism is receptor\/cell-signaling-mediated/);
  });

  it('still picks the enzymatic format for an enzyme, without claiming the requirement', () => {
    const r = design({ mechanismClass: 'enzyme' });

    expect(r.recommendedFormat).toBe('enzymatic_activity');
    expect(r.cellBasedRequired).toBeNull();
    expect(inputs(r)).toEqual(['endogenousNonRedundant']);
  });

  it('refuses a missing or unknown mechanism and any value it cannot use, naming the field', () => {
    expect(thrown(() => design({}))).toMatchObject({ name: 'ComputationRefusal', code: 'missing_input', field: 'mechanismClass' });
    expect(thrown(() => design({ mechanismClass: 'agonist' }))).toMatchObject({ code: 'invalid_input', field: 'mechanismClass' });
    expect(thrown(() => design({ mechanismClass: 'enzyme', cellBasedFeasible: 'yes' }))).toMatchObject({
      code: 'invalid_input',
      field: 'cellBasedFeasible',
    });
    expect(thrown(() => design({ mechanismClass: 'enzyme', expectedCirculatingDrug_ug_per_mL: '25' }))).toMatchObject({
      code: 'invalid_input',
      field: 'expectedCirculatingDrug_ug_per_mL',
    });
  });
});

describe('design_nab_assay through AnA', () => {
  const call = async (input: Record<string, unknown>) =>
    JSON.parse(await getToolHandler('design_nab_assay')!(input as never, {} as never));

  it('serves a cell-signaling mechanism with no feasibility as no format, naming the input', async () => {
    const out = await call({ mechanismClass: 'receptor_agonist' });

    expect(out.status).toBe('computed');
    expect(out.result.recommendedFormat).toBeNull();
    expect(out.result.notAssessed.map((n: { input: string }) => n.input)).toEqual(['cellBasedFeasible']);
  });

  it('relays a missing mechanism as needs_parameters naming the field', async () => {
    const out = await call({});

    expect(out.status).toBe('needs_parameters');
    expect(out.field).toBe('mechanismClass');
  });
});
