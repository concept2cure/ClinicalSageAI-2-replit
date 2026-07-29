/**
 * Verifies the console bridge:
 *   - Only installs in production.
 *   - Redacts object arguments through the logger's redactContext.
 *   - Preserves primitives + Error instances unchanged.
 *   - Calls the underlying console.* so log capture is preserved.
 *   - Is idempotent across repeated installs.
 *
 * The bridge is the safety net for the ~1400 legacy `console.*` call
 * sites in routes/services that haven't yet migrated to the scoped
 * logger. A regression that drops the redaction step here means PHI /
 * credentials could leak from any of those sites — these tests pin
 * the contract.
 */

import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  installConsoleBridge,
  __testing_consoleBridge,
  __testing_resetConsoleBridge,
} from '../consoleBridge';

interface MockConsole {
  log: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
}

function makeMockConsole(): MockConsole {
  return {
    log: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  };
}

const ORIGINAL_ENV = process.env.NODE_ENV;

beforeEach(() => {
  __testing_resetConsoleBridge();
  process.env.NODE_ENV = ORIGINAL_ENV;
});

describe('consoleBridge — environment gating', () => {
  it('does not patch in development', () => {
    process.env.NODE_ENV = 'development';
    const target = makeMockConsole();
    installConsoleBridge(target as any);
    expect(__testing_consoleBridge.installed()).toBe(false);
  });

  it('does not patch in test', () => {
    process.env.NODE_ENV = 'test';
    const target = makeMockConsole();
    installConsoleBridge(target as any);
    expect(__testing_consoleBridge.installed()).toBe(false);
  });

  it('patches in production', () => {
    process.env.NODE_ENV = 'production';
    const target = makeMockConsole();
    installConsoleBridge(target as any);
    expect(__testing_consoleBridge.installed()).toBe(true);
  });

  it('is idempotent — calling install twice does not double-wrap', () => {
    process.env.NODE_ENV = 'production';
    const target = makeMockConsole();
    installConsoleBridge(target as any);
    const firstError = target.error;
    installConsoleBridge(target as any);
    expect(target.error).toBe(firstError);
  });
});

describe('consoleBridge — redaction (production)', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'production';
  });

  it('redacts password fields in an object argument', () => {
    const sink = vi.fn();
    const target = { log: sink, error: sink, warn: sink };
    installConsoleBridge(target as any);
    target.error('login failed', { user: 'a@b.com', password: 'hunter2' });
    expect(sink).toHaveBeenCalledTimes(1);
    const args = sink.mock.calls[0];
    expect(args[0]).toBe('login failed');
    expect((args[1] as any).password).toBe('[REDACTED]');
    expect((args[1] as any).user).toBe('a@b.com');
  });

  it('redacts HIPAA PHI (mrn) nested in objects', () => {
    const sink = vi.fn();
    const target = { log: sink, error: sink, warn: sink };
    installConsoleBridge(target as any);
    target.warn('chart access', { patient: { mrn: 'MR-12345', name: 'Pt' } });
    const args = sink.mock.calls[0];
    expect((args[1] as any).patient.mrn).toBe('[REDACTED]');
    expect((args[1] as any).patient.name).toBe('Pt');
  });

  it('passes string + number + boolean arguments through unchanged', () => {
    const sink = vi.fn();
    const target = { log: sink, error: sink, warn: sink };
    installConsoleBridge(target as any);
    target.log('hello', 42, true);
    expect(sink).toHaveBeenCalledWith('hello', 42, true);
  });

  it('passes Error instances through unchanged (preserves stack)', () => {
    const sink = vi.fn();
    const target = { log: sink, error: sink, warn: sink };
    installConsoleBridge(target as any);
    const err = new Error('boom');
    target.error('failure:', err);
    const args = sink.mock.calls[0];
    expect(args[1]).toBe(err);
    expect((args[1] as Error).stack).toBeDefined();
  });

  it('does not mutate the original argument object', () => {
    const sink = vi.fn();
    const target = { log: sink, error: sink, warn: sink };
    installConsoleBridge(target as any);
    const original = { password: 'hunter2', other: 'ok' };
    target.error('event', original);
    expect(original.password).toBe('hunter2');
  });
});

describe('consoleBridge.redactArgs unit', () => {
  it('null / undefined pass through', () => {
    expect(__testing_consoleBridge.redactArgs([null, undefined])).toEqual([null, undefined]);
  });

  it('arrays of objects are walked element-wise via redactContext', () => {
    const out = __testing_consoleBridge.redactArgs([
      { token: 'abc', detail: 'ok' },
    ]) as any[];
    expect(out[0].token).toBe('[REDACTED]');
    expect(out[0].detail).toBe('ok');
  });
});
