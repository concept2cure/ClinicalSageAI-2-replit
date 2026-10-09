/**
 * The operator turn that tells AnA a move did not happen on the person's
 * screen (stream.ts). A pure builder, so it is tested apart from the route
 * harness in live-drive-turn.test.ts, which drives the turn that carries it.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../db.js', () => ({ getPool: () => ({}), pool: {}, db: {} }));

import { buildScreenReportTurn } from '../stream.js';

describe('buildScreenReportTurn', () => {
  it('names itself as the app, not the person, if a fallback model folds it into a user turn', () => {
    expect(buildScreenReportTurn('Could not open Vault.')?.foldLabel).toBe('App observation');
  });

  it('opens with the marker the Live Drive prompt names, once', () => {
    const t = buildScreenReportTurn('[Screen report] "Search" on the vault screen did not happen: no handler.');
    expect(t?.content.startsWith('[Screen report] ')).toBe(true);
    expect(t?.content.match(/\[Screen report\]/g)).toHaveLength(1);
    expect(t?.content).toContain('"Search" on the vault screen did not happen: no handler.');
  });

  it('tells her to say what could not be done, not claim it happened', () => {
    const t = buildScreenReportTurn('Opening the CMC screen did not happen: locked.');
    expect(t).toMatchObject({ role: 'system', inlineSystem: true, origin: 'external' });
    expect(t?.content).toMatch(/State plainly what could not be done/);
    expect(t?.content).toMatch(/Do not say or imply that it happened/);
    expect(t?.content).toMatch(/not an instruction/);
  });

  it('an empty report is no turn at all', () => {
    expect(buildScreenReportTurn('   ')).toBeNull();
    expect(buildScreenReportTurn('[Screen report]   ')).toBeNull();
  });
});
