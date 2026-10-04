/**
 * The chain from database lock to a filed application is a valid order of its
 * own dependencies, writes every document after what it is written from, and
 * is the order the NDA workflow AnA is given follows (D2, 2026-10-04).
 */
import { describe, it, expect } from 'vitest';
import { SUBMISSION_CHAIN, evaluateChain, getChainNode } from '../../server/services/ind/ctd/index';
import { getWorkflow, type SubmissionWorkflow } from '../../server/services/ana-ri/workflow-orchestration';

const ids = SUBMISSION_CHAIN.map((n) => n.id);

function chainDependsOn(from: string, to: string, seen = new Set<string>()): boolean {
  for (const d of getChainNode(from)?.dependsOn ?? []) {
    if (d === to) return true;
    if (!seen.has(d)) { seen.add(d); if (chainDependsOn(d, to, seen)) return true; }
  }
  return false;
}

function workflowDependsOn(wf: SubmissionWorkflow, from: string, to: string): boolean {
  const byId = new Map(wf.phases.flatMap((p) => p.steps).map((s) => [s.id, s]));
  const stack = [...(byId.get(from)?.depends ?? [])];
  const seen = new Set<string>();
  while (stack.length) {
    const id = stack.pop()!;
    if (id === to) return true;
    if (!seen.has(id)) { seen.add(id); stack.push(...(byId.get(id)?.depends ?? [])); }
  }
  return false;
}

describe('the chain from database lock to a filed application', () => {
  it('lists each step after every step it is written from', () => {
    for (const n of SUBMISSION_CHAIN) {
      for (const d of n.dependsOn) {
        expect(ids.indexOf(d), `${n.id} depends on unknown ${d}`).toBeGreaterThanOrEqual(0);
        expect(ids.indexOf(d) < ids.indexOf(n.id), `${d} must come before ${n.id}`).toBe(true);
      }
    }
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each([
    ['csr', 'tlf'], ['tlf', 'adam'], ['adam', 'sdtm'], ['sdtm', 'database_lock'], ['database_lock', 'sap_final'],
    ['iss', 'csr'], ['ise', 'csr'], ['iss', 'integrated_data'],
    ['m2_7_3', 'ise'], ['m2_7_4', 'iss'], ['m2_5', 'm2_7_3'], ['m2_5', 'm2_7_4'], ['labeling', 'm2_5'],
    ['ectd_assembly', 'sdtm'], ['transmission', 'technical_validation'],
  ])('%s is written from %s', (from, to) => {
    expect(chainDependsOn(from, to)).toBe(true);
    expect(chainDependsOn(to, from)).toBe(false);
  });

  it('every step rests on a basis, and every checked source names its URL and date', () => {
    for (const n of SUBMISSION_CHAIN) {
      expect(n.basis.length, n.id).toBeGreaterThan(0);
      for (const b of n.basis.filter((x) => x.confidence === 'regulator-text')) {
        expect(b.url, `${n.id}: ${b.ref}`).toMatch(/^https:\/\/www\.(fda|ecfr)\.gov\//);
        expect(b.checked, `${n.id}: ${b.ref}`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    }
  });

  it('a step the platform cannot see is never treated as missing or as done', () => {
    const v = evaluateChain([]);
    const state = new Map(v.nodes.map((n) => [n.id, n.state]));
    expect(state.get('sdtm')).toBe('not_visible');
    for (const b of v.blocked) for (const w of b.waitsOn) expect(state.get(w), `${b.id} waits on ${w}`).not.toBe('not_visible');
    expect(v.next.find((n) => n.id === 'csr')?.assumes).toEqual(['tlf']);
  });

  it('a classifier’s proposal is not a filing', () => {
    const v = evaluateChain([{ ctdSection: '5.3.5.1', placementStatus: 'suggested', title: 'CSR' }]);
    expect(v.nodes.find((n) => n.id === 'csr')?.state).toBe('suggested');
    expect(v.blocked.find((b) => b.id === 'iss')?.waitsOn).toContain('csr');
  });
});

describe('the NDA workflow AnA is given follows the chain', () => {
  // Chain step → the NDA workflow step that delivers it (ana-ri/workflow-orchestration.ts).
  const STEP: Record<string, string> = { csr: 'nda-10', iss: 'nda-11', ise: 'nda-12', m2_7_3: 'nda-7', m2_7_4: 'nda-7', m2_5: 'nda-5', labeling: 'nda-13' };

  it('every chain edge between two workflow steps is an edge of the workflow', () => {
    const wf = getWorkflow('nda')!;
    for (const node of SUBMISSION_CHAIN) {
      const from = STEP[node.id];
      if (!from) continue;
      for (const dep of Object.keys(STEP)) {
        const to = STEP[dep];
        if (to === from || !chainDependsOn(node.id, dep)) continue;
        expect(workflowDependsOn(wf, from, to), `${node.id} (${from}) is written from ${dep} (${to})`).toBe(true);
      }
    }
  });
});
