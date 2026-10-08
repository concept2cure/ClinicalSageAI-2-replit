/**
 * Unit tests for transmit gateway selection across all markets × client types.
 *
 * Pins the routing the transmit step depends on: FDA→ESG, JP→PMDA, and the EU
 * split where device/IVD (mdx|ivd) register through EUDAMED while a drug or
 * biologic dossier goes where `submissionChannelFor` (server/services/
 * regulatory/registry/submittabilityCoverage.ts) says its filing goes.
 *
 * 2026-10-05 (D2 record, step g-cesp-centralised-refusal; finding 42): every
 * non-device EU dossier was routed to ema:cesp, so an e-signed centralised MAA
 * sequence would have been POSTed to CESP's /baskets. EMA has made the
 * eSubmission Gateway / Web Client mandatory for every centralised-procedure
 * eCTD submission since 2014-03-01 (regulator text; basis in docs/evidence/
 * D2-ANA-DOCUMENT-INTELLIGENCE/2026-10-05-record/g-cesp-centralised-refusal-
 * facts.md), and the platform has no connector for it (DECISIONS.md row 10).
 * Only a filing the channel function routes to ema:cesp — the national, MRP
 * and DCP filings — is sent there; a filing type the registry cannot name is
 * refused, because nothing says CESP accepts it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { gatewayCalls, rows } = vi.hoisted(() => ({
  gatewayCalls: [] as unknown[][],
  rows: {
    sequence: { id: 1, submissionId: 1, region: 'eu', sequenceNumber: '0000', status: 'dispatched', dispatchStatus: 'pending', type: 'original', organizationId: 7 },
    submission: { id: 1, clientType: 'pharma', applicationType: 'maa', organizationId: 7 },
  },
}));

vi.mock('../../../db', () => {
  const rowsFor = (tableName: string) => {
    if (tableName === 'ectd_sequences') return [{ ...rows.sequence }];
    if (tableName === 'submissions') return [{ ...rows.submission }];
    return [];
  };
  const tableNameOf = (t: any) => t?.[Symbol.for('drizzle:Name')] ?? t?._?.name ?? '';
  const select = () => {
    let name = '';
    const chain: any = {
      from: (t: any) => { name = tableNameOf(t); return chain; },
      where: () => chain,
      limit: async () => rowsFor(name),
      then: (res: any, rej: any) => Promise.resolve(rowsFor(name)).then(res, rej),
    };
    return chain;
  };
  const textOf = (q: any): string => (q?.queryChunks ?? []).map((c: any) => (Array.isArray(c?.value) ? c.value.join('') : '?')).join('');
  const execute = async (q: any) => {
    const t = textOf(q);
    if (t.includes('c2c_ana_actions')) return { rows: [{ id: 'sig-1', payload: { intent: 'transmit' } }] };
    if (t.includes('electronic_signatures')) return { rows: [{ bound_payload_digest: 'd', binding_basis: 'ectd-sequence-leaf-manifest-sha256', superseded_by: null, is_valid: true, verification_status: 'valid' }] };
    return { rows: [] };
  };
  const pool = {
    query: async () => ({ rowCount: 0, rows: [] }),
    connect: async () => { throw new Error('not expected'); },
  };
  return { db: { select, execute }, pool };
});
vi.mock('../../auditService', () => ({ default: { logAction: vi.fn(async () => ({ persisted: true })) }, writeChainedAuditRow: vi.fn() }));
vi.mock('../../part11/signature-persistence', async (orig) => ({
  ...(await orig<any>()),
  deriveGovernedTargetBinding: async () => ({ digest: 'd', basis: 'ectd-sequence-leaf-manifest-sha256', note: '' }),
  isSignatureWithdrawn: () => false,
}));
vi.mock('../../ectd/assess-dispatch-readiness', () => ({
  assessSequenceDispatchReadiness: async () => ({ gate: { cleared: true, blockers: [] } }),
}));
vi.mock('../../submission-gateways/index', async (orig) => {
  const real = await orig<any>();
  return {
    ...real,
    getGateway: (...args: unknown[]) => {
      gatewayCalls.push(args);
      throw new Error('test: getGateway reached');
    },
  };
});

import { selectGateway, transmitRouteFor, transmitSequence } from '../submission-service';

describe('selectGateway', () => {
  it('routes FDA (all client types) to ESG', () => {
    for (const ct of ['pharma', 'biotech', 'mdx', 'ivd']) {
      expect(selectGateway('fda', ct)).toEqual({ gwRegion: 'fda', gwName: 'esg' });
    }
  });

  it('routes Japan (all client types) to the PMDA gateway', () => {
    for (const ct of ['pharma', 'biotech', 'mdx', 'ivd']) {
      expect(selectGateway('jp', ct)).toEqual({ gwRegion: 'pmda', gwName: 'pmda_gateway' });
    }
  });

  it('refuses a centralised-procedure EU dossier: no gateway, never CESP', () => {
    for (const region of ['eu', 'ema']) {
      for (const ct of ['pharma', 'biotech']) {
        for (const type of ['MAA', 'maa', 'EU_MAA', 'EU_VARIATION_II', 'renewal', 'psur', 'CMA', 'EU_BIOSIMILAR_MAA']) {
          expect(selectGateway(region, ct, type)).toBeNull();
        }
      }
    }
  });

  it('names the eSubmission Gateway / Web Client and why CESP is not it, for a centralised MAA', () => {
    const route = transmitRouteFor('eu', 'pharma', 'maa');
    expect(route.ok).toBe(false);
    if (route.ok) return;
    expect(route.reason).toMatch(/EU_MAA/);
    expect(route.reason).toMatch(/eSubmission Gateway/);
    expect(route.reason).toMatch(/CESP is not an accepted channel/);
  });

  it('refuses an EU CTA (CTIS portal) and an IRIS filing, naming the channel', () => {
    expect(selectGateway('eu', 'pharma', 'cta')).toBeNull();
    const cta = transmitRouteFor('eu', 'pharma', 'cta');
    expect(!cta.ok && cta.reason).toMatch(/CTIS/);
    const orphan = transmitRouteFor('eu', 'biotech', 'EU_ORPHAN');
    expect(!orphan.ok && orphan.reason).toMatch(/IRIS/);
  });

  it('routes a national decentralised EU filing (EU_GENERIC_DCP) to CESP', () => {
    expect(selectGateway('eu', 'pharma', 'EU_GENERIC_DCP')).toEqual({ gwRegion: 'ema', gwName: 'cesp' });
    expect(selectGateway('ema', 'biotech', 'Generic Decentralized')).toEqual({ gwRegion: 'ema', gwName: 'cesp' });
  });

  it('fails closed for an EU dossier whose filing type names no EU registry entry', () => {
    expect(selectGateway('eu', 'pharma')).toBeNull();
    expect(selectGateway('eu', 'pharma', 'original')).toBeNull();
    const us = transmitRouteFor('eu', 'pharma', 'nda');
    expect(us.ok).toBe(false);
    expect(!us.ok && us.reason).toMatch(/US_NDA/);
  });

  it('routes EU device/IVD (mdx|ivd) to EUDAMED, whatever the filing type', () => {
    expect(selectGateway('eu', 'mdx')).toEqual({ gwRegion: 'ema', gwName: 'eudamed' });
    expect(selectGateway('eu', 'ivd')).toEqual({ gwRegion: 'ema', gwName: 'eudamed' });
    expect(selectGateway('eu', 'mdx', 'EU_MDR_CLASS_III')).toEqual({ gwRegion: 'ema', gwName: 'eudamed' });
  });

  it('returns null for an unknown region (caller raises VALIDATION)', () => {
    expect(selectGateway('mars', 'pharma')).toBeNull();
  });
});

// The application numbers below are in the agency's dash form. Since P-23
// (2026-10-08) transmit holds a typed number to the identifier rule the eCTD
// export and the package spine already apply (REGULATORY_IDENTIFIER_PATTERN:
// slashes are path separators, so EMEA/H/C/… is recorded as EMEA-H-C-…), and a
// slash form is refused before routing. These cases are about routing.
describe('transmitSequence — an e-signed EU MAA sequence is refused before any gateway is resolved', () => {
  beforeEach(() => {
    gatewayCalls.length = 0;
    rows.submission = { id: 1, clientType: 'pharma', applicationType: 'maa', organizationId: 7 };
  });

  it('throws VALIDATION naming the eSubmission Gateway; getGateway is never called', async () => {
    const err = await transmitSequence({
      sequenceId: 1,
      ctx: { organizationId: 7, userId: 11 },
      signatureActionId: 'sig-1',
      environment: 'staging',
      applicationId: 'EMEA-H-C-000000',
    } as any).then(() => null, (e) => e);
    expect(err).not.toBeNull();
    expect((err as { code?: string }).code).toBe('VALIDATION');
    expect(String((err as Error).message)).toMatch(/eSubmission Gateway/);
    expect(gatewayCalls).toEqual([]);
  });

  it('positive control: a DCP submission is routed on to ema:cesp', async () => {
    rows.submission = { id: 1, clientType: 'pharma', applicationType: 'EU_GENERIC_DCP', organizationId: 7 };
    await transmitSequence({
      sequenceId: 1,
      ctx: { organizationId: 7, userId: 11 },
      signatureActionId: 'sig-1',
      environment: 'staging',
      applicationId: 'NL-H-0000-001-DC',
    } as any).then(() => null, (e) => e);
    expect(gatewayCalls).toEqual([['ema', 'cesp']]);
  });
});
