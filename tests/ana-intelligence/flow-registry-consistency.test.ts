/**
 * Flow registry consistency — structural integrity guard for every registered
 * flow definition, plus a value-vocabulary alignment probe.
 *
 * This is the safety net for the ontology-wiring effort: it iterates every flow
 * the registry exposes and asserts that node references, predicate field
 * references, sections, and defaultNext targets are all internally consistent.
 *
 * The value-alignment probe collects, per flow, the option `value`s for the
 * therapeutic_area / phase / route_of_administration / dosage_form family of
 * fields and cross-checks them against the literal values used in branch and
 * issueCheck predicates. Any predicate value not producible by its field is a
 * genuine vocab mismatch and would be surfaced here (currently none exist — the
 * probe therefore also documents the divergent per-flow vocabularies that the
 * shared constants will later replace).
 */
import { describe, it, expect } from 'vitest';
import {
  getFlowDefinition,
  getAvailableFlows,
} from '../../server/services/ana/intelligence-questions/flows/index';
import {
  OTHER_POSITION,
  type FieldPredicate,
  type FlowDefinition,
  type QuestionNode,
} from '../../shared/types/intelligence-questions';
import { predicateLeaves } from '../../shared/ana/question-predicate';
import type { FlowEngineContext } from '../../server/services/ana/intelligence-questions/types';

const ctx: FlowEngineContext = { organizationId: null, userId: null, projectId: null };

function allFlows(): FlowDefinition[] {
  return getAvailableFlows(ctx).map((f) => {
    const def = getFlowDefinition(f.category, ctx);
    if (!def) throw new Error(`getFlowDefinition returned null for ${f.category}`);
    return def;
  });
}

/** Every field id defined anywhere in the flow (across all nodes). */
function allFieldIds(def: FlowDefinition): Set<string> {
  const ids = new Set<string>();
  for (const node of def.nodes) for (const field of node.fields) ids.add(field.id);
  return ids;
}

/** Every predicate in a node (branches + issueChecks + field visibleWhen). */
/**
 * Every field id the node's predicates read.
 *
 * A `visibleWhen` may be a GROUP (`anyOf` / `allOf`) since 2026-10-12 — the
 * notified-body question is gated on two answers — so the fields are flattened
 * through the shared evaluator's own helper rather than read off `.field`,
 * which a group does not have.
 */
function nodePredicates(node: QuestionNode): FieldPredicate[] {
  const preds: FieldPredicate[] = [];
  for (const b of node.branches ?? []) preds.push(b.when);
  for (const ic of node.issueChecks ?? []) preds.push(ic.condition);
  for (const field of node.fields) if (field.visibleWhen) preds.push(...predicateLeaves(field.visibleWhen));
  return preds;
}

const flows = allFlows();

describe('flow registry consistency', () => {
  it('exposes a non-empty set of flows and every definition resolves', () => {
    expect(flows.length).toBeGreaterThanOrEqual(16);
  });

  describe.each(flows.map((f) => [f.category, f] as const))('flow: %s', (_cat, def) => {
    const nodeIds = new Set(def.nodes.map((n) => n.id));

    it('has no duplicate node ids', () => {
      const ids = def.nodes.map((n) => n.id);
      expect(ids.length).toBe(new Set(ids).size);
    });

    it('entryNode references a real node', () => {
      expect(nodeIds.has(def.entryNode)).toBe(true);
    });

    it('every section.nodeIds entry references a real node', () => {
      for (const section of def.sections) {
        for (const nid of section.nodeIds) {
          expect(nodeIds.has(nid), `section ${section.id} -> ${nid}`).toBe(true);
        }
      }
    });

    it('every branch goto target references a real node', () => {
      for (const node of def.nodes) {
        for (const branch of node.branches ?? []) {
          expect(nodeIds.has(branch.goto), `${node.id} branch -> ${branch.goto}`).toBe(true);
        }
      }
    });

    it('every non-null defaultNext references a real node', () => {
      for (const node of def.nodes) {
        if (node.defaultNext != null) {
          expect(nodeIds.has(node.defaultNext), `${node.id} defaultNext -> ${node.defaultNext}`).toBe(
            true,
          );
        }
      }
    });

    it('every predicate field references a field defined somewhere in the flow', () => {
      const fieldIds = allFieldIds(def);
      for (const node of def.nodes) {
        for (const pred of nodePredicates(node)) {
          expect(
            fieldIds.has(pred.field),
            `${def.category} node ${node.id}: predicate references unknown field "${pred.field}"`,
          ).toBe(true);
        }
      }
    });

    it('has at least one terminal path (a node with defaultNext === null)', () => {
      const hasTerminal = def.nodes.some((n) => n.defaultNext === null);
      // Not every flow must declare an explicit null terminal (the engine falls
      // back to definition order), but every registered flow in this codebase
      // does. This documents that expectation.
      expect(hasTerminal).toBe(true);
    });
  });
});

/* ─── Value-vocabulary alignment probe ─────────────────────────────────── */

// Field ids that carry a controlled domain vocabulary we intend to unify.
const TARGET_FIELDS = [
  'therapeutic_area',
  'phase',
  'study_phase',
  'development_phase',
  'trial_phase',
  'route_of_administration',
  'dosage_form',
];

interface VocabProbe {
  /** fieldId -> set of option values the field can produce */
  optionValues: Record<string, Set<string>>;
  /** fieldId -> set of literal values referenced by predicates */
  predicateValues: Record<string, Set<string>>;
}

function probeFlow(def: FlowDefinition): VocabProbe {
  const optionValues: Record<string, Set<string>> = {};
  const predicateValues: Record<string, Set<string>> = {};

  for (const node of def.nodes) {
    for (const field of node.fields) {
      if (TARGET_FIELDS.includes(field.id)) {
        const set = (optionValues[field.id] ??= new Set());
        for (const opt of field.options ?? []) set.add(opt.value);
        /* A field that declares `allowOther` can also produce OTHER_POSITION —
           the value it carries when the person took a position the list did not
           offer. No listed option may use it (that is OTHER_POSITION's own
           invariant), so it is producible WITHOUT being an option, which is the
           case this probe did not know: project_setup.therapeutic_area declares
           `allowOther: {}` and raises an info issue on `__other__`, and the
           probe read the predicate as a vocabulary mismatch (2026-10-12).
           Scoped to fields that declare it, so a closed list is still held. */
        if (field.allowOther) set.add(OTHER_POSITION);
      }
    }
    for (const pred of nodePredicates(node)) {
      if (TARGET_FIELDS.includes(pred.field)) {
        const set = (predicateValues[pred.field] ??= new Set());
        const vals = Array.isArray(pred.value) ? pred.value : [pred.value];
        for (const v of vals) set.add(String(v));
      }
    }
  }

  return { optionValues, predicateValues };
}

describe('value-vocabulary alignment probe', () => {
  describe.each(flows.map((f) => [f.category, f] as const))('flow: %s', (_cat, def) => {
    const probe = probeFlow(def);

    it('every predicate value on a controlled field is producible by that field', () => {
      for (const [fieldId, predVals] of Object.entries(probe.predicateValues)) {
        const options = probe.optionValues[fieldId];
        // If the field defines options, every predicate literal must be one of them.
        // (If the field has no options in this flow, there is nothing to align
        // against — a boolean/free-text control — and the predicate is allowed.)
        if (options && options.size > 0) {
          for (const v of predVals) {
            expect(
              options.has(v),
              `${def.category}.${fieldId}: predicate value "${v}" is not in the field's option values [${[...options].join(', ')}]`,
            ).toBe(true);
          }
        }
      }
    });
  });

  /* The rule above now admits OTHER_POSITION where a field declares
     `allowOther`. This is the case it must still catch: the same predicate on a
     field whose list is CLOSED. Without this, the fix for
     project_setup.therapeutic_area would have made `__other__` acceptable
     everywhere, which is exactly what the probe exists to prevent. */
  it('still refuses the own-position value on a field whose list is closed', () => {
    const closed = probeFlow({
      category: 'synthetic_closed_list',
      nodes: [
        {
          id: 'n1',
          fields: [
            {
              id: 'therapeutic_area',
              label: 'Therapeutic Area',
              type: 'select',
              options: [{ value: 'oncology', label: 'Oncology' }],
              // no allowOther: the list is closed
            },
          ],
          issueChecks: [
            { id: 'ic1', condition: { field: 'therapeutic_area', operator: 'eq', value: OTHER_POSITION }, severity: 'info', title: 't', message: 'm' },
          ],
          defaultNext: null,
        },
      ],
    } as unknown as FlowDefinition);

    expect(closed.optionValues.therapeutic_area.has(OTHER_POSITION)).toBe(false);
    expect(closed.predicateValues.therapeutic_area.has(OTHER_POSITION)).toBe(true);
  });

  it('documents the current per-flow vocabularies (informational snapshot)', () => {
    // This test never fails on vocab drift; it records the current state so the
    // divergence (e.g. `iv` vs `intravenous`, `cardiology` vs `cardiovascular`)
    // is visible when the shared constants are wired in.
    const snapshot: Record<string, Record<string, string[]>> = {};
    for (const def of flows) {
      const probe = probeFlow(def);
      const entry: Record<string, string[]> = {};
      for (const [fid, vals] of Object.entries(probe.optionValues)) {
        entry[fid] = [...vals].sort();
      }
      if (Object.keys(entry).length > 0) snapshot[def.category] = entry;
    }
    // Sanity: at least the flows we know carry these fields are represented.
    expect(Object.keys(snapshot)).toEqual(
      expect.arrayContaining(['protocol_development', 'cmc_specification', 'project_setup']),
    );
    // therapeutic_area vocab differs across flows today — assert the divergence
    // exists so a future unification visibly changes this expectation.
    const protoTA = snapshot['protocol_development']?.therapeutic_area ?? [];
    const csrTA = snapshot['csr_report']?.therapeutic_area ?? [];
    expect(protoTA).toContain('cardiology'); // protocol uses 'cardiology'
    expect(csrTA).toContain('cardiovascular'); // csr uses 'cardiovascular'
  });
});
