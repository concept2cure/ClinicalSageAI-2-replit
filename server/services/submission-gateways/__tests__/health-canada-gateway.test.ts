/**
 * Health Canada CESG gateway — registration + credential gating.
 *
 * Locks the audit-critical invariants (the same honest-by-construction rules the
 * other real gateways follow):
 *   1. The gateway is registered in the submission-gateways registry as ca/hc_cesg.
 *   2. With no CESG credentials configured, isConfigured is false and transmit
 *      throws CredentialError while recording a rejected/auth transmittal row —
 *      never a fabricated receipt.
 *
 * The live 200-receipt path requires real mTLS HTTPS and is exercised by ops /
 * integration runs, not this unit (mirrors the PMDA gateway, which also unit-tests
 * gating rather than the network leg).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = process.env.NODE_ENV || 'test';
  process.env.DATABASE_URL =
    process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test';
  process.env.JWT_SECRET =
    process.env.JWT_SECRET || 'hc-cesg-test-secret-padded-to-32-or-more';
  process.env.SKIP_DB_STARTUP_TEST = 'true';
});

const { poolQueries } = vi.hoisted(() => ({ poolQueries: [] as Array<{ sql: string; args: unknown[] }> }));

vi.mock('../../../db', () => ({
  pool: {
    query: vi.fn(async (sql: string, args: unknown[]) => {
      poolQueries.push({ sql, args });
      if (/INSERT INTO submission_transmittals/i.test(sql)) {
        return { rows: [{ id: 5151 }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }),
  },
}));

import { HealthCanadaGateway } from '../health-canada-gateway';
import { getGateway, listGateways } from '../index';
import { CredentialError } from '../types';

const HC_ENV_KEYS = [
  'HC_CESG_URL', 'HC_CESG_COMPANY_ID', 'HC_CESG_CERT_PATH', 'HC_CESG_KEY_PATH', 'HC_CESG_HMAC_SECRET',
];

function clearHcCreds() {
  for (const k of HC_ENV_KEYS) delete process.env[k];
}

function caRequest() {
  return {
    organizationId: 7,
    userId: 11,
    programId: null,
    packageId: 99,
    bundle: {
      path: '/tmp/bundle.zip',
      sha256: 'b'.repeat(64),
      sizeBytes: 2048,
      format: 'ectd' as const,
    },
    environment: 'production' as const,
    submissionType: 'initial',
    metadata: { applicationId: 'CA-DOSSIER-1', sequence: '0000', environment: 'production' },
  };
}

describe('HealthCanadaGateway', () => {
  beforeEach(() => {
    poolQueries.length = 0;
    clearHcCreds();
  });

  it('is registered in the gateway registry as ca/hc_cesg (rest)', () => {
    const gw = getGateway('ca', 'hc_cesg');
    expect(gw.region).toBe('ca');
    expect(gw.gateway).toBe('hc_cesg');
    expect(gw.transport).toBe('rest');
    expect(listGateways()).toContainEqual({ region: 'ca', gateway: 'hc_cesg', transport: 'rest' });
  });

  it('reports not-configured when CESG credentials are absent', async () => {
    const gw = new HealthCanadaGateway();
    await expect(gw.isConfigured(7, 'production')).resolves.toBe(false);
  });

  it('throws CredentialError and records a rejected/auth row when unconfigured', async () => {
    const gw = new HealthCanadaGateway();
    await expect(gw.transmit(caRequest())).rejects.toBeInstanceOf(CredentialError);

    // The transmittal row was inserted with region/gateway 'ca' / 'hc_cesg'…
    const insert = poolQueries.find((q) => /INSERT INTO submission_transmittals/i.test(q.sql));
    expect(insert?.sql).toMatch(/'ca', 'hc_cesg'/);

    // …and the failure was recorded as rejected/auth, not a fabricated receipt.
    const updates = poolQueries.filter((q) => /UPDATE submission_transmittals/i.test(q.sql));
    const flatArgs = updates.flatMap((u) => u.args);
    expect(flatArgs).toContain('rejected');
    expect(flatArgs).toContain('auth');
    expect(flatArgs).not.toContain('received');
  });
});
