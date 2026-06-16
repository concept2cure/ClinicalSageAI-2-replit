/**
 * Fail-closed tests for the ICSR gateway transport adapter.
 *
 * `transmitIcsr` must NOT fabricate an agency acknowledgement. It:
 *   - refuses a message the readiness gate marks not-ready (any environment);
 *   - in production with no configured gateway, THROWS (never fakes an ACK);
 *   - outside production returns an explicitly `simulated` receipt with a
 *     deterministic timestamp sourced from an injectable clock.
 *
 * Mirrors server/services/__tests__/fdaIntegrationService.failclosed.test.ts
 * (set/restore NODE_ENV + env vars, deterministic asserted output).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  transmitIcsr,
  resolveGatewayConfig,
  IcsrNotReadyError,
  IcsrGatewayNotConfiguredError,
} from '../icsr-gateway-transport';
import type { IcsrTransmissionResult } from '../e2b-icsr-message';

const ORIGINAL_ENV = process.env.NODE_ENV;
const GATEWAY_ENV = [
  'ICSR_GATEWAY_URL',
  'ICSR_GATEWAY_USERNAME',
  'ICSR_GATEWAY_PASSWORD',
  'ICSR_GATEWAY_CERT_PATH',
] as const;
const ORIGINAL_GATEWAY: Record<string, string | undefined> = {};

// Fixed clock so the simulated receipt timestamp is deterministic.
const FIXED_MS = Date.parse('2026-06-15T00:00:00.000Z');
const fixedClock = () => FIXED_MS;

function readyMessage(overrides: Partial<IcsrTransmissionResult> = {}): IcsrTransmissionResult {
  return {
    message:
      '<?xml version="1.0" encoding="UTF-8"?>\n<ichicsrMessage>' +
      '<M.1.1>MSG-2026-0001</M.1.1></ichicsrMessage>',
    transmitReady: true,
    gaps: [],
    gateway: 'FDA_FAERS',
    receiverId: 'ZZFDA',
    ...overrides,
  };
}

function notReadyMessage(): IcsrTransmissionResult {
  return readyMessage({
    transmitReady: false,
    gaps: [{ id: 'G.k.2.2', label: 'Suspect product name' }],
  });
}

describe('ICSR gateway transport fail-closed', () => {
  beforeEach(() => {
    for (const key of GATEWAY_ENV) {
      ORIGINAL_GATEWAY[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    process.env.NODE_ENV = ORIGINAL_ENV;
    for (const key of GATEWAY_ENV) {
      if (ORIGINAL_GATEWAY[key] === undefined) delete process.env[key];
      else process.env[key] = ORIGINAL_GATEWAY[key];
    }
  });

  it('refuses to transmit a not-ready message (readiness gating) in any env', async () => {
    process.env.NODE_ENV = 'test';
    const audit = vi.fn();
    await expect(
      transmitIcsr(notReadyMessage(), { now: fixedClock, audit }),
    ).rejects.toBeInstanceOf(IcsrNotReadyError);
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'refused', reason: 'not-ready', action: 'icsr_transmit' }),
    );
  });

  it('refuses a not-ready message even in production', async () => {
    process.env.NODE_ENV = 'production';
    await expect(
      transmitIcsr(notReadyMessage(), { now: fixedClock }),
    ).rejects.toBeInstanceOf(IcsrNotReadyError);
  });

  it('throws in production with no gateway configured (never fakes an ACK)', async () => {
    process.env.NODE_ENV = 'production';
    await expect(
      transmitIcsr(readyMessage(), { now: fixedClock }),
    ).rejects.toBeInstanceOf(IcsrGatewayNotConfiguredError);
  });

  it('audits a production refusal as not-configured', async () => {
    process.env.NODE_ENV = 'production';
    const audit = vi.fn();
    await expect(transmitIcsr(readyMessage(), { now: fixedClock, audit })).rejects.toThrow();
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'refused', reason: 'not-configured' }),
    );
  });

  it('returns a deterministic simulated receipt outside production', async () => {
    process.env.NODE_ENV = 'test';
    const audit = vi.fn();
    const receipt = await transmitIcsr(readyMessage(), { now: fixedClock, audit });

    expect(receipt.simulated).toBe(true);
    expect(receipt.status).toBe('simulated');
    expect(receipt.gateway).toBe('FDA_FAERS');
    expect(receipt.receiverId).toBe('ZZFDA');
    expect(receipt.messageId).toBe('MSG-2026-0001');
    expect(receipt.receiptId).toBe('SIMULATED-MSG-2026-0001');
    expect(receipt.timestamp).toBe('2026-06-15T00:00:00.000Z');
    expect(receipt.message).toMatch(/SIMULATED/i);

    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'simulated', action: 'icsr_transmit' }),
    );
  });

  it('does not use Date.now() for the asserted timestamp (injectable clock)', async () => {
    process.env.NODE_ENV = 'test';
    const spy = vi.spyOn(Date, 'now');
    const receipt = await transmitIcsr(readyMessage(), { now: fixedClock });
    expect(receipt.timestamp).toBe('2026-06-15T00:00:00.000Z');
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('fails closed (not-implemented) when a real gateway IS configured rather than faking transport', async () => {
    process.env.NODE_ENV = 'test';
    process.env.ICSR_GATEWAY_URL = 'https://gateway.example/icsr';
    process.env.ICSR_GATEWAY_PASSWORD = 'secret';
    await expect(
      transmitIcsr(readyMessage(), { now: fixedClock }),
    ).rejects.toThrow(/not implemented|fabricate/i);
  });
});

describe('resolveGatewayConfig', () => {
  beforeEach(() => {
    for (const key of GATEWAY_ENV) {
      ORIGINAL_GATEWAY[key] = process.env[key];
      delete process.env[key];
    }
  });
  afterEach(() => {
    for (const key of GATEWAY_ENV) {
      if (ORIGINAL_GATEWAY[key] === undefined) delete process.env[key];
      else process.env[key] = ORIGINAL_GATEWAY[key];
    }
  });

  it('returns null when no URL is set', () => {
    expect(resolveGatewayConfig()).toBeNull();
  });

  it('returns null when a URL is set but no credentials', () => {
    process.env.ICSR_GATEWAY_URL = 'https://gateway.example/icsr';
    expect(resolveGatewayConfig()).toBeNull();
  });

  it('returns config when URL + password are present', () => {
    process.env.ICSR_GATEWAY_URL = 'https://gateway.example/icsr';
    process.env.ICSR_GATEWAY_PASSWORD = 'secret';
    expect(resolveGatewayConfig()).toEqual({
      url: 'https://gateway.example/icsr',
      username: undefined,
      password: 'secret',
      certPath: undefined,
    });
  });

  it('returns config when URL + cert path are present', () => {
    process.env.ICSR_GATEWAY_URL = 'https://gateway.example/icsr';
    process.env.ICSR_GATEWAY_CERT_PATH = '/etc/certs/icsr.pem';
    expect(resolveGatewayConfig()).toEqual({
      url: 'https://gateway.example/icsr',
      username: undefined,
      password: undefined,
      certPath: '/etc/certs/icsr.pem',
    });
  });
});
