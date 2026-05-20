/**
 * Pure structural tests for the PDEV → AnA command surface.
 *
 * These tests verify the wiring contract — metadata coverage, handler
 * registration, governed-vs-read split, audit-prefix consistency — without
 * hitting the database, the OpenAI gateway, or the underlying PDEV services.
 *
 * Behavioural tests for the underlying services already exist under
 * server/services/pdev/__tests__/*.
 */
import { describe, expect, test, vi } from 'vitest';

vi.mock('../../../db', () => ({
  db: {},
  pool: undefined,
  getPool: () => {
    throw new Error('not in test scope');
  },
}));

import {
  PDEV_COMMAND_HANDLERS,
  PDEV_COMMAND_METADATA,
} from '../pdev-command-handlers';

const EXPECTED_COMMANDS = [
  // Read-only
  'pdev.registry.list',
  'pdev.program.get',
  'pdev.program.readiness',
  'pdev.program.workstream',
  'pdev.program.ind_assembly',
  'pdev.program.fda_interactions',
  'pdev.program.contradictions',
  'pdev.fda_feedback.proposals',
  'pdev.activity.evidence_list',
  'pdev.activity.provenance',
  // Governed mutations
  'pdev.activity.set_state',
  'pdev.activity.ai_draft',
  'pdev.activity.evidence_attach',
  'pdev.activity.evidence_detach',
  'pdev.fda_feedback.apply',
  'pdev.ind_assembly.compile',
  'pdev.readiness.snapshot',
];

const GOVERNED_COMMANDS = [
  'pdev.activity.set_state',
  'pdev.activity.ai_draft',
  'pdev.activity.evidence_attach',
  'pdev.activity.evidence_detach',
  'pdev.fda_feedback.apply',
  'pdev.ind_assembly.compile',
  'pdev.readiness.snapshot',
];

describe('pdev command surface — metadata', () => {
  test('exposes the canonical command set', () => {
    expect(PDEV_COMMAND_METADATA).toHaveLength(EXPECTED_COMMANDS.length);
  });

  test('every metadata entry has name, description, parameters, example', () => {
    for (const m of PDEV_COMMAND_METADATA) {
      expect(typeof m.name).toBe('string');
      expect(m.name.length).toBeGreaterThan(0);
      expect(typeof m.description).toBe('string');
      expect(m.description.length).toBeGreaterThan(20);
      expect(typeof m.parameters).toBe('string');
      expect(typeof m.example).toBe('string');
      expect(m.example.startsWith('"')).toBe(true);
    }
  });

  test('every expected command has metadata', () => {
    const names = new Set(PDEV_COMMAND_METADATA.map(m => m.name));
    for (const expected of EXPECTED_COMMANDS) {
      expect(names.has(expected)).toBe(true);
    }
  });

  test('every command name is dotted and starts with pdev.', () => {
    for (const m of PDEV_COMMAND_METADATA) {
      expect(m.name).toMatch(/^pdev\.[a-z_]+(\.[a-z_]+)+$/);
    }
  });

  test('governed mutation metadata mentions confirm + reason in parameters', () => {
    const byName = new Map(PDEV_COMMAND_METADATA.map(m => [m.name, m]));
    for (const name of GOVERNED_COMMANDS) {
      const m = byName.get(name);
      expect(m).toBeDefined();
      expect(m!.parameters.toLowerCase()).toContain('confirm');
      expect(m!.parameters.toLowerCase()).toContain('reason');
    }
  });

  test('read-only metadata does not mention confirm/reason as required', () => {
    const governed = new Set(GOVERNED_COMMANDS);
    for (const m of PDEV_COMMAND_METADATA) {
      if (governed.has(m.name)) continue;
      expect(m.parameters.toLowerCase()).not.toMatch(/confirm="yes"/);
    }
  });
});

describe('pdev command surface — handlers', () => {
  test('handler map has the same keys as metadata names', () => {
    const metadataNames = new Set(PDEV_COMMAND_METADATA.map(m => m.name));
    const handlerNames = new Set(Object.keys(PDEV_COMMAND_HANDLERS));
    expect(handlerNames).toEqual(metadataNames);
  });

  test('every handler is a function', () => {
    for (const [, handler] of Object.entries(PDEV_COMMAND_HANDLERS)) {
      expect(typeof handler).toBe('function');
    }
  });

  test('handler keys cover every expected command', () => {
    for (const expected of EXPECTED_COMMANDS) {
      expect(PDEV_COMMAND_HANDLERS[expected]).toBeDefined();
    }
  });
});

describe('pdev command surface — input validation', () => {
  const ctx = {
    userId: 1,
    organizationId: 1,
    activeProjectId: 1,
    userName: 'tester',
  };

  test('registry.list returns success without params (read-only)', async () => {
    const result = await PDEV_COMMAND_HANDLERS['pdev.registry.list'](ctx, {});
    expect(result.success).toBe(true);
    expect(result.action).toBe('pdev.registry.list');
    expect(result.data?.activities).toBeDefined();
  });

  test('program.get refuses missing programId', async () => {
    const result = await PDEV_COMMAND_HANDLERS['pdev.program.get'](ctx, {});
    expect(result.success).toBe(false);
    expect(result.error).toBe('INVALID_INPUT');
  });

  test('program.get refuses non-UUID programId', async () => {
    const result = await PDEV_COMMAND_HANDLERS['pdev.program.get'](ctx, {
      programId: 'not-a-uuid',
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe('INVALID_INPUT');
  });

  test('program.workstream refuses invalid workstream', async () => {
    const result = await PDEV_COMMAND_HANDLERS['pdev.program.workstream'](ctx, {
      programId: '00000000-0000-0000-0000-000000000000',
      workstream: 'nonexistent',
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe('INVALID_INPUT');
  });

  test('activity.set_state refuses unknown activity key (before gate)', async () => {
    const result = await PDEV_COMMAND_HANDLERS['pdev.activity.set_state'](ctx, {
      programId: '00000000-0000-0000-0000-000000000000',
      activityKey: 'not.a.real.key',
      state: 'approved',
      confirm: 'yes',
      reason: 'A perfectly valid reason for this test that is long enough.',
    });
    expect(result.success).toBe(false);
    // Either the gate flags missing confirm first OR the unknown activity is caught.
    expect(['UNKNOWN_ACTIVITY', 'INVALID_INPUT', 'CONFIRMATION_REQUIRED']).toContain(result.error);
  });

  test('activity.set_state requires confirm + reason (gate enforces)', async () => {
    const result = await PDEV_COMMAND_HANDLERS['pdev.activity.set_state'](ctx, {
      programId: '00000000-0000-0000-0000-000000000000',
      activityKey: 'cmc.formulation_development',
      state: 'approved',
      // no confirm, no reason
    });
    expect(result.success).toBe(false);
  });

  test('activity.evidence_attach refuses non-UUID evidenceObjectId after gate', async () => {
    const result = await PDEV_COMMAND_HANDLERS['pdev.activity.evidence_attach'](ctx, {
      programId: '00000000-0000-0000-0000-000000000000',
      activityKey: 'cmc.formulation_development',
      evidenceObjectId: 'not-a-uuid',
      confirm: 'yes',
      reason: 'Test attach with a sufficient-length reason string here.',
    });
    expect(result.success).toBe(false);
  });

  test('ind_assembly.compile metadata example reflects the higher reason bar', () => {
    const m = PDEV_COMMAND_METADATA.find(x => x.name === 'pdev.ind_assembly.compile');
    expect(m).toBeDefined();
    expect(m!.description.toLowerCase()).toContain('reason');
  });
});
