/**
 * CESP refuses a filing whose channel is not CESP — before any row or socket.
 *
 * 2026-10-05 (D2 record, step g-cesp-centralised-refusal; finding 42).
 * EMA has made the eSubmission Gateway / Web Client mandatory for every
 * centralised-procedure eCTD submission since 2014-03-01 (regulator text,
 * ema.europa.eu; basis in docs/evidence/D2-ANA-DOCUMENT-INTELLIGENCE/
 * 2026-10-05-record/g-cesp-centralised-refusal-facts.md). The channel function
 * (`submissionChannelFor`, server/services/regulatory/registry/
 * submittabilityCoverage.ts) already says so for the planner and the
 * submittability report. The CESP gateway itself did not: handed an EU_MAA it
 * inserted a transmittal row, fetched an OAuth token and POSTed the eCTD zip to
 * CESP's /baskets.
 *
 * Defence in depth behind selectGateway (submission-service.ts): whatever the
 * caller, a filing the channel function does not route to ema:cesp is refused
 * here as a ValidationError carrying NOTHING_TRANSMITTED, so refusedBeforeWire
 * releases the caller's transmit claim instead of stranding it at
 * 'transmitting'.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { poolQueries, httpsRequests } = vi.hoisted(() => ({
  poolQueries: [] as string[],
  httpsRequests: [] as unknown[],
}));

vi.mock('../../../db', () => ({
  db: {},
  pool: {
    query: async (sql: string) => {
      poolQueries.push(sql.replace(/\s+/g, ' ').trim());
      if (sql.includes('INSERT INTO submission_transmittals')) return { rows: [{ id: 1 }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    },
  },
}));

vi.mock('node:https', () => {
  const request = (options: unknown) => {
    httpsRequests.push(options);
    throw new Error('test transport: no socket is opened');
  };
  return { request, default: { request } };
});

import { EmaCespGateway } from '../ema-cesp';
import { refusedBeforeWire } from '../index';
import { ValidationError, type GatewayTransmitRequest } from '../types';

const CESP_ENV = {
  EMA_CESP_STAGING_URL: 'https://cesp.example.invalid/api',
  EMA_CESP_STAGING_CLIENT_ID: 'client',
  EMA_CESP_STAGING_CLIENT_SECRET: 'secret',
  EMA_CESP_STAGING_ORG_ID: 'org',
};

function request(submissionType: string): GatewayTransmitRequest {
  return {
    organizationId: 7,
    userId: 11,
    programId: null,
    packageId: null,
    bundle: { path: '/nonexistent/ectd.zip', sha256: 'a'.repeat(64), sizeBytes: 10, format: 'ectd' },
    environment: 'staging',
    submissionType,
    metadata: { applicationId: 'EMEA/H/C/000000', sequence: '0000', environment: 'staging' },
    authorization: { kind: 'governed-signature', signatureActionId: 'sig-1', actorUserId: 11 },
  } as GatewayTransmitRequest;
}

async function failureOf(p: Promise<unknown>): Promise<unknown> {
  return p.then(() => { throw new Error('expected the transmit to reject'); }, (e) => e);
}

beforeEach(() => {
  poolQueries.length = 0;
  httpsRequests.length = 0;
  Object.assign(process.env, CESP_ENV);
});
afterEach(() => {
  for (const k of Object.keys(CESP_ENV)) delete process.env[k];
});

describe('EmaCespGateway.transmit — a centralised-procedure filing never reaches CESP', () => {
  it.each([
    ['MAA', 'EU_MAA'],
    ['EU_MAA', 'EU_MAA'],
    ['EU_VARIATION_II', 'EU_VARIATION_II'],
    ['renewal', 'EU_RENEWAL'],
    ['psur', 'EU_PSUR'],
    ['CMA', 'EU_CMA'],
    ['EU_BIOSIMILAR_MAA', 'EU_BIOSIMILAR_MAA'],
  ])('refuses %s (%s) before the transmittal row and before any https request', async (type, id) => {
    const err = await failureOf(new EmaCespGateway().transmit(request(type)));
    expect(err).toBeInstanceOf(ValidationError);
    expect((err as ValidationError).transmitted).toBe(false);
    expect(refusedBeforeWire(err)).toBe(true);
    const msg = String((err as Error).message);
    expect(msg).toContain(id);
    expect(msg).toMatch(/eSubmission Gateway/);
    expect(msg).toMatch(/nothing was sent/i);
    expect(poolQueries.filter((q) => /INSERT INTO submission_transmittals/.test(q))).toEqual([]);
    expect(httpsRequests).toEqual([]);
  });

  it('refuses a CTIS filing (EU_CTA) and an IRIS filing (EU_ORPHAN), naming their channels', async () => {
    const cta = await failureOf(new EmaCespGateway().transmit(request('EU_CTA')));
    expect(cta).toBeInstanceOf(ValidationError);
    expect(String((cta as Error).message)).toMatch(/CTIS/);
    const orphan = await failureOf(new EmaCespGateway().transmit(request('EU_ORPHAN')));
    expect(orphan).toBeInstanceOf(ValidationError);
    expect(String((orphan as Error).message)).toMatch(/IRIS/);
    expect(poolQueries).toEqual([]);
    expect(httpsRequests).toEqual([]);
  });

  it('refuses a filing whose channel is another region\'s gateway (US_NDA → fda:esg)', async () => {
    const err = await failureOf(new EmaCespGateway().transmit(request('US_NDA')));
    expect(err).toBeInstanceOf(ValidationError);
    expect(String((err as Error).message)).toMatch(/fda:esg/);
    expect(poolQueries).toEqual([]);
    expect(httpsRequests).toEqual([]);
  });
});

describe('EmaCespGateway.transmit — positive controls: what CESP does carry still proceeds', () => {
  it('a national decentralised filing (EU_GENERIC_DCP) passes the refusal and reaches the wire', async () => {
    const err = await failureOf(new EmaCespGateway().transmit(request('EU_GENERIC_DCP')));
    expect(err).not.toBeInstanceOf(ValidationError);
    expect(poolQueries.some((q) => /INSERT INTO submission_transmittals/.test(q))).toBe(true);
    expect(httpsRequests.length).toBe(1);
  });

  it('a lifecycle type that names no registry filing (seq.type "original") is not refused here', async () => {
    // transmitSequence passes seq.type (original|amendment|…), which resolves to
    // no registry entry; the filing was already routed by selectGateway from the
    // submission's applicationType. This gateway refuses only what it can name.
    const err = await failureOf(new EmaCespGateway().transmit(request('original')));
    expect(err).not.toBeInstanceOf(ValidationError);
    expect(httpsRequests.length).toBe(1);
  });
});
