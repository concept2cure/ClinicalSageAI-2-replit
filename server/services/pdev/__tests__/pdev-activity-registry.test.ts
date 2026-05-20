/**
 * Pure-data tests over the PDEV activity registry. No DB, no mocks.
 * Asserts shape invariants that downstream services rely on.
 */
import { describe, expect, test } from 'vitest';
import {
  PDEV_ACTIVITIES,
  PDEV_WORKSTREAMS,
  PDEV_STAGES,
  PDEV_ACTIVITY_STATES,
  PDEV_COMPLETED_STATES,
  PDEV_IN_FLIGHT_STATES,
  getActivityByKey,
  getActivitiesByWorkstream,
  getActivitiesByStage,
} from '../pdev-activity-registry';

describe('pdev activity registry', () => {
  test('activity keys are unique', () => {
    const keys = PDEV_ACTIVITIES.map(a => a.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  test('every activity has a workstream from the canonical set', () => {
    for (const a of PDEV_ACTIVITIES) {
      expect(PDEV_WORKSTREAMS).toContain(a.workstream);
    }
  });

  test('every activity has a stage from the canonical set', () => {
    for (const a of PDEV_ACTIVITIES) {
      expect(PDEV_STAGES).toContain(a.stage);
    }
  });

  test('every activity key is dotted and prefixed by its workstream', () => {
    for (const a of PDEV_ACTIVITIES) {
      expect(a.key).toMatch(/^[a-z_]+\.[a-z_0-9]+$/);
      expect(a.key.startsWith(`${a.workstream}.`)).toBe(true);
    }
  });

  test('dependsOn only references other registry keys', () => {
    const all = new Set(PDEV_ACTIVITIES.map(a => a.key));
    for (const a of PDEV_ACTIVITIES) {
      for (const dep of a.dependsOn) {
        expect(all.has(dep)).toBe(true);
      }
    }
  });

  test('no activity declares itself as a dependency', () => {
    for (const a of PDEV_ACTIVITIES) {
      expect(a.dependsOn).not.toContain(a.key);
    }
  });

  test('each activity declares at least one required document', () => {
    for (const a of PDEV_ACTIVITIES) {
      expect(a.requiredDocuments.length).toBeGreaterThan(0);
    }
  });

  test('required document codes are unique across the entire registry', () => {
    const codes: string[] = [];
    for (const a of PDEV_ACTIVITIES) {
      for (const doc of a.requiredDocuments) codes.push(doc.code);
    }
    expect(new Set(codes).size).toBe(codes.length);
  });

  test('IND-blocking flag is consistent with at least one mandatory doc', () => {
    for (const a of PDEV_ACTIVITIES) {
      if (!a.blocksIndAssembly) continue;
      const hasMandatory = a.requiredDocuments.some(d => d.mandatoryForInd);
      expect(hasMandatory).toBe(true);
    }
  });

  test('eCTD module destinations are valid', () => {
    const allowed = new Set(['m1', 'm2', 'm3', 'm4', 'm5', 'none']);
    for (const a of PDEV_ACTIVITIES) {
      for (const doc of a.requiredDocuments) {
        expect(allowed.has(doc.ectdModule)).toBe(true);
      }
    }
  });

  test('all four workstreams have non-zero activity counts', () => {
    for (const ws of PDEV_WORKSTREAMS) {
      expect(getActivitiesByWorkstream(ws).length).toBeGreaterThan(0);
    }
  });

  test('every stage has at least one activity', () => {
    for (const stage of PDEV_STAGES) {
      expect(getActivitiesByStage(stage).length).toBeGreaterThan(0);
    }
  });

  test('completed and in-flight state sets are disjoint', () => {
    const completed = new Set(PDEV_COMPLETED_STATES);
    for (const s of PDEV_IN_FLIGHT_STATES) {
      expect(completed.has(s)).toBe(false);
    }
  });

  test('PDEV_ACTIVITY_STATES covers the brief states', () => {
    const required = [
      'not_started',
      'drafting',
      'ai_draft_generated',
      'evidence_linked',
      'human_review_required',
      'in_review',
      'changes_requested',
      'approved',
      'locked',
      'submission_ready',
      'submitted',
      'agency_feedback_received',
      'revision_required',
      'superseded',
    ];
    for (const s of required) {
      expect(PDEV_ACTIVITY_STATES).toContain(s as any);
    }
  });

  test('getActivityByKey returns the matching registry row', () => {
    const a = getActivityByKey('cmc.formulation_development');
    expect(a).toBeDefined();
    expect(a?.workstream).toBe('cmc');
    expect(getActivityByKey('not.a.real.key')).toBeUndefined();
  });

  test('regulatory module activities map each to their eCTD module', () => {
    const mapping: Array<[string, string]> = [
      ['regulatory.module_1_admin', 'm1'],
      ['regulatory.module_2_summaries', 'm2'],
      ['regulatory.module_3_cmc', 'm3'],
      ['regulatory.module_4_nonclinical', 'm4'],
      ['regulatory.module_5_clinical', 'm5'],
    ];
    for (const [key, expectedModule] of mapping) {
      const a = getActivityByKey(key);
      expect(a).toBeDefined();
      const codes = a!.requiredDocuments.map(d => d.ectdModule);
      expect(codes).toContain(expectedModule);
    }
  });
});
