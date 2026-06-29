/**
 * FDA ESG production UAT — §11 hardening regression tests.
 *
 * Locks three regulatory-critical behaviours from docs/runbooks/fda-esg-production-uat.md
 * §11 (the eight code-surface ambiguities surfaced by UAT authoring):
 *
 *   FIX 2 — Raw MDN is persisted on inbound (AS2 receipt), and
 *           downloadAcknowledgment returns the verbatim body. Pre-fix rows
 *           with NULL mdn_raw fall back to synthesised text.
 *
 *   FIX 6 — rollbackTransmittal transitions the row to 'rolled_back' AND
 *           records a governed action with command='transmittal_rollback'.
 *           Pre-shipment / terminal statuses refuse with
 *           RollbackNotPermittedError.
 *
 *   FIX 7 — findActiveTransmittal returns the existing row when an active
 *           transmittal exists for (org, package_id, bundle_sha256), and
 *           returns null when no active row exists for that tenant — even if
 *           a DIFFERENT tenant has one (CMO scenario).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = process.env.NODE_ENV || 'test';
  process.env.DATABASE_URL =
    process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test';
  process.env.JWT_SECRET =
    process.env.JWT_SECRET || 'fda-esg-hardening-test-secret-padded-to-32-or-more';
  process.env.SKIP_DB_STARTUP_TEST = 'true';

  process.env.FDA_ESG_URL = 'https://esg.fda.gov';
  process.env.FDA_ESG_AS2_FROM = 'SPONSOR-AS2';
  process.env.FDA_ESG_CERT_PATH = '/tmp/fda-cert.pem';
  process.env.FDA_ESG_KEY_PATH = '/tmp/fda-key.pem';
  process.env.FDA_ESG_FDA_CERT_PATH = '/tmp/fda-pub.pem';
});

/* ─── pool mock ─────────────────────────────────────────────────── */
/*
 * The hardening surface area touches three different query shapes:
 *   - INSERT INTO submission_transmittals ... RETURNING id        (transmit)
 *   - UPDATE submission_transmittals ...                          (status + mdn_raw)
 *   - SELECT ... FROM submission_transmittals                     (downloadAcknowledgment, findActiveTransmittal)
 *   - SELECT ... FROM submission_transmittals ... FOR UPDATE      (rollbackTransmittal)
 *
 * The mock dispatches by SQL shape and tracks every query so the tests can
 * assert what landed on the row.
 */

interface QueryRecord { sql: string; args: unknown[] }

const { poolQueries, clientQueries, mdnRawStorage, rollbackStatusOverride, activeTransmittalRow } = vi.hoisted(() => ({
  poolQueries:           [] as QueryRecord[],
  clientQueries:         [] as QueryRecord[],
  mdnRawStorage:         { value: null as string | null },
  rollbackStatusOverride: { value: 'received' as string },
  activeTransmittalRow:  { value: null as { id: number; status: string } | null },
}));

vi.mock('../../../db', () => {
  const dispatch = async (queries: QueryRecord[], sql: string, args: unknown[] = []) => {
    queries.push({ sql, args });

    if (/INSERT INTO submission_transmittals/i.test(sql)) {
      return { rows: [{ id: 4242 }], rowCount: 1 };
    }
    if (/UPDATE submission_transmittals/i.test(sql)) {
      // Capture mdn_raw value if present in the UPDATE.
      const mdnIdx = sql.indexOf('mdn_raw');
      if (mdnIdx >= 0) {
        // The patch builder emits `mdn_raw = $N`; the actual MDN string is
        // somewhere in args. Find the first string > 16 chars (the dummy MDN
        // we'll inject in the test).
        const mdnArg = args.find((a) => typeof a === 'string' && (a as string).length > 16);
        if (mdnArg) mdnRawStorage.value = mdnArg as string;
      }
      return { rows: [], rowCount: 1 };
    }
    // SELECT for downloadAcknowledgment (returns transmission_id + mdn_raw).
    if (/SELECT\s+transmission_id,\s+status,\s+ack_received_at,\s+mdn_raw,\s+metadata/i.test(sql)) {
      return {
        rows: [{
          transmission_id: '<mdn-msg-id@FDA-CESUB>',
          status: 'received',
          ack_received_at: new Date('2026-06-29T12:00:00Z'),
          mdn_raw: mdnRawStorage.value,
          metadata: null,
        }],
        rowCount: 1,
      };
    }
    // SELECT for findActiveTransmittal (status IN list).
    if (/SELECT\s+id,\s+status\s+FROM submission_transmittals/i.test(sql)) {
      return activeTransmittalRow.value
        ? { rows: [activeTransmittalRow.value], rowCount: 1 }
        : { rows: [], rowCount: 0 };
    }
    return { rows: [], rowCount: 0 };
  };

  const fakeClient = {
    query: vi.fn(async (sql: string, args: unknown[] = []) => {
      clientQueries.push({ sql, args });

      // BEGIN / COMMIT / ROLLBACK pass through.
      if (/^(BEGIN|COMMIT|ROLLBACK)/i.test(sql.trim())) return { rows: [], rowCount: 0 };

      // SELECT ... FOR UPDATE in rollbackTransmittal.
      if (/SELECT[\s\S]+FOR UPDATE/i.test(sql)) {
        return {
          rows: [{
            status:        rollbackStatusOverride.value,
            package_id:    99,
            bundle_sha256: 'a'.repeat(64),
          }],
          rowCount: 1,
        };
      }
      // UPDATE submission_transmittals inside the rollback tx.
      if (/UPDATE submission_transmittals/i.test(sql)) {
        return { rows: [], rowCount: 1 };
      }
      // INSERT INTO audit_logs / c2c_ana_actions (governed action stub below
      // doesn't go through here, but if a future revision routes audit chain
      // calls through this client, swallow the writes).
      return { rows: [], rowCount: 0 };
    }),
    release: vi.fn(),
  };

  return {
    pool: {
      query: vi.fn((sql: string, args: unknown[] = []) => dispatch(poolQueries, sql, args)),
      connect: vi.fn(async () => fakeClient),
    },
  };
});

vi.mock('fs', async (orig) => {
  const actual = await (orig as () => Promise<typeof import('fs')>)();
  return {
    ...actual,
    promises: { ...actual.promises, readFile: vi.fn(async () => 'PEM') },
  };
});

vi.mock('../bundle-integrity', () => ({
  readVerifiedBundle: vi.fn(async () => Buffer.from('zip-bytes')),
}));

/* ─── HTTPS mock (AS2 POST returns a verbatim MDN body) ─────────── */

const FAKE_MDN_BODY =
  '------=_Part_FDA_MDN\r\n' +
  'Content-Type: message/disposition-notification\r\n\r\n' +
  'Reporting-UA: FDA-CESUB\r\n' +
  'Original-Recipient: rfc822; FDA-CESUB\r\n' +
  'Final-Recipient: rfc822; FDA-CESUB\r\n' +
  'Original-Message-ID: <msg-original@SPONSOR-AS2>\r\n' +
  'Disposition: automatic-action/MDN-sent-automatically; processed\r\n' +
  'Received-Content-MIC: deadbeef==, sha-256\r\n' +
  '------=_Part_FDA_MDN--\r\n';

vi.mock('https', () => {
  return {
    request: (_opts: unknown, cb: (res: unknown) => void) => {
      const dataHandlers: Array<(c: Buffer) => void> = [];
      const endHandlers: Array<() => void> = [];
      const res: any = {
        statusCode: 200,
        headers: { 'message-id': '<mdn-msg-id@FDA-CESUB>' },
        on: (evt: string, h: any) => {
          if (evt === 'data') dataHandlers.push(h);
          if (evt === 'end') endHandlers.push(h);
        },
      };
      setImmediate(() => {
        cb(res);
        for (const h of dataHandlers) h(Buffer.from(FAKE_MDN_BODY, 'utf8'));
        for (const h of endHandlers) h();
      });
      return {
        on: () => undefined,
        write: () => undefined,
        end: () => undefined,
        destroy: () => undefined,
      };
    },
  };
});

import {
  FdaEsgGateway,
  rollbackTransmittal,
  findActiveTransmittal,
  RollbackNotPermittedError,
} from '../fda-esg';

const SMALL_AS2_REQUEST = () => ({
  organizationId: 7,
  userId:         11,
  programId:      null,
  packageId:      99,
  bundle: {
    path:      '/tmp/bundle.zip',
    sha256:    'a'.repeat(64),
    sizeBytes: 1024,            // < 1 GB, picks AS2 transport
    format:    'ectd' as const,
  },
  environment:    'production' as const,
  submissionType: 'original',
  metadata:       { applicationId: 'IND123456', sequence: '0001', environment: 'production' },
});

beforeEach(() => {
  poolQueries.length = 0;
  clientQueries.length = 0;
  mdnRawStorage.value = null;
  rollbackStatusOverride.value = 'received';
  activeTransmittalRow.value = null;
});

/* ─── FIX 2 ─────────────────────────────────────────────────────── */

describe('FIX 2 — raw MDN persistence', () => {
  it('persists the raw MDN body on the AS2 receipt UPDATE', async () => {
    const gw = new FdaEsgGateway();
    const result = await gw.transmit(SMALL_AS2_REQUEST());

    expect(result.status).toBe('received');
    expect(result.transport).toBe('as2');

    // The UPDATE that flips status to 'received' MUST also write mdn_raw.
    const receivedUpdate = poolQueries.find(
      (q) =>
        /UPDATE submission_transmittals/i.test(q.sql) &&
        q.args.some((a) => a === 'received'),
    );
    expect(receivedUpdate, 'expected an UPDATE that set status=received').toBeDefined();
    expect(receivedUpdate!.sql).toMatch(/mdn_raw\s*=/);
    expect(receivedUpdate!.args.some((a) => typeof a === 'string' && (a as string).includes('Disposition: automatic-action'))).toBe(true);
  });

  it('downloadAcknowledgment returns the persisted raw MDN verbatim when present', async () => {
    // First, transmit to populate mdn_raw via our mock storage.
    const gw = new FdaEsgGateway();
    await gw.transmit(SMALL_AS2_REQUEST());

    const ack = await gw.downloadAcknowledgment(4242);
    expect(ack.contentType).toBe('message/disposition-notification');
    expect(ack.buffer.toString('utf8')).toBe(FAKE_MDN_BODY);
    expect(ack.buffer.toString('utf8')).not.toMatch(/^FDA ESG Acknowledgement\n/);
  });

  it('downloadAcknowledgment falls back to synthesised text for pre-fix rows (mdn_raw=NULL)', async () => {
    // Simulate a pre-migration row: do NOT transmit, leave mdnRawStorage NULL.
    mdnRawStorage.value = null;

    const gw = new FdaEsgGateway();
    const ack = await gw.downloadAcknowledgment(4242);

    expect(ack.contentType).toBe('text/plain');
    expect(ack.buffer.toString('utf8')).toMatch(/^FDA ESG Acknowledgement\n/);
    expect(ack.buffer.toString('utf8')).toContain('Transmission: <mdn-msg-id@FDA-CESUB>');
  });
});

/* ─── FIX 6 ─────────────────────────────────────────────────────── */

describe('FIX 6 — rollbackTransmittal governed action', () => {
  it('flips status to rolled_back AND records a transmittal_rollback governed action', async () => {
    const recorded: Array<{ command: string; target: string; reason: string; payload: any }> = [];
    const stubRecord = vi.fn(async (_client: any, p: any) => {
      recorded.push(p);
      return { actionId: 'act_' + 'b'.repeat(32), auditId: 'aud-1', sha256Chain: 'chain' };
    });

    const result = await rollbackTransmittal({
      transmittalId:  4242,
      organizationId: 7,
      actorUserId:    11,
      reason:         'wrong sequence shipped to FDA — retracting',
      recordGovernedAction: stubRecord,
    });

    expect(result.status).toBe('rolled_back');
    expect(result.previousStatus).toBe('received');
    expect(result.auditId).toBe('aud-1');

    // One governed action emitted with the right command.
    expect(stubRecord).toHaveBeenCalledTimes(1);
    expect(recorded[0].command).toBe('transmittal_rollback');
    expect(recorded[0].target).toBe('transmittal:4242');
    expect(recorded[0].reason).toBe('wrong sequence shipped to FDA — retracting');
    expect(recorded[0].payload.previousStatus).toBe('received');
    expect(recorded[0].payload.meaning).toBe('submission_rollback');

    // The row was UPDATEd to rolled_back in the same client transaction.
    const update = clientQueries.find(
      (q) =>
        /UPDATE submission_transmittals/i.test(q.sql) &&
        /status\s*=\s*'rolled_back'/i.test(q.sql),
    );
    expect(update, 'expected an UPDATE setting status=rolled_back').toBeDefined();

    // The transaction was committed.
    expect(clientQueries.some((q) => /^COMMIT/i.test(q.sql.trim()))).toBe(true);
  });

  it('refuses with RollbackNotPermittedError when the row has not shipped (pending)', async () => {
    rollbackStatusOverride.value = 'pending';
    const stubRecord = vi.fn();

    await expect(rollbackTransmittal({
      transmittalId:  4242,
      organizationId: 7,
      actorUserId:    11,
      reason:         'attempt to rollback pre-shipment',
      recordGovernedAction: stubRecord,
    })).rejects.toBeInstanceOf(RollbackNotPermittedError);

    // No governed action recorded; transaction rolled back.
    expect(stubRecord).not.toHaveBeenCalled();
    expect(clientQueries.some((q) => /^ROLLBACK/i.test(q.sql.trim()))).toBe(true);
  });

  it('refuses with RollbackNotPermittedError when the row is already rolled_back', async () => {
    rollbackStatusOverride.value = 'rolled_back';
    const stubRecord = vi.fn();

    await expect(rollbackTransmittal({
      transmittalId:  4242,
      organizationId: 7,
      actorUserId:    11,
      reason:         'double rollback attempt',
      recordGovernedAction: stubRecord,
    })).rejects.toBeInstanceOf(RollbackNotPermittedError);

    expect(stubRecord).not.toHaveBeenCalled();
  });
});

/* ─── FIX 7 ─────────────────────────────────────────────────────── */

describe('FIX 7 — findActiveTransmittal lookup', () => {
  it('returns the existing active row for (org, package_id, bundle_sha256)', async () => {
    activeTransmittalRow.value = { id: 4242, status: 'in_transit' };

    const found = await findActiveTransmittal({
      organizationId: 7,
      packageId:      99,
      bundleSha256:   'a'.repeat(64),
    });

    expect(found).toEqual({ id: 4242, status: 'in_transit' });

    // The query was tenant-scoped (org id in args).
    const lookup = poolQueries.find(
      (q) => /SELECT\s+id,\s+status\s+FROM submission_transmittals/i.test(q.sql),
    );
    expect(lookup, 'expected a findActiveTransmittal lookup').toBeDefined();
    expect(lookup!.args).toEqual([7, 99, 'a'.repeat(64)]);
  });

  it('returns null when no active row exists in THIS tenant (cross-tenant double-transmit allowed)', async () => {
    // Simulate: org 7 has nothing active, even though org 8 (different tenant)
    // does. The query is org-scoped so the lookup returns no rows.
    activeTransmittalRow.value = null;

    const found = await findActiveTransmittal({
      organizationId: 7,
      packageId:      99,
      bundleSha256:   'a'.repeat(64),
    });

    expect(found).toBeNull();
  });

  it('returns null when no packageId is supplied (lock surface only covers packaged transmits)', async () => {
    // Even if there were active rows, a packageId-less call must not consult
    // the index — the partial unique index is keyed on package_id.
    activeTransmittalRow.value = { id: 4242, status: 'in_transit' };

    const found = await findActiveTransmittal({
      organizationId: 7,
      packageId:      null,
      bundleSha256:   'a'.repeat(64),
    });

    expect(found).toBeNull();
    // And no query was even issued.
    const lookup = poolQueries.find(
      (q) => /SELECT\s+id,\s+status\s+FROM submission_transmittals/i.test(q.sql),
    );
    expect(lookup).toBeUndefined();
  });
});
