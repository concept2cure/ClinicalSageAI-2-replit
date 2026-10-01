/**
 * The chain-head anchor's store and document (security plan P0-8, DP-04).
 *
 * The store is the object-locked compliance evidence bucket
 * (terraform/modules/compliance-evidence), reached through the same S3 client
 * the vault uses (server/services/storage/s3-client.ts). The fake below is
 * S3's listing contract: keys in lexical order, at most 1000 a page,
 * IsTruncated / NextContinuationToken. The real-database behaviour of the
 * writer and verifier is chain-anchor.dbtest.ts.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const objects = new Map<string, Buffer>();
const sent: Array<{ name: string; input: Record<string, any> }> = [];
let failWith: string | null = null;

vi.mock('@aws-sdk/client-s3', () => {
  class Cmd {
    constructor(public input: Record<string, any>) {}
  }
  class PutObjectCommand extends Cmd {}
  class GetObjectCommand extends Cmd {}
  class DeleteObjectCommand extends Cmd {}
  class ListObjectsV2Command extends Cmd {}
  class S3Client {
    constructor(public config: Record<string, unknown>) {}
    async send(cmd: Cmd) {
      sent.push({ name: cmd.constructor.name, input: cmd.input });
      if (failWith) {
        const e = new Error(failWith);
        e.name = failWith;
        throw e;
      }
      const i = cmd.input;
      if (cmd instanceof PutObjectCommand) {
        // S3's conditional write: If-None-Match '*' refuses a key whose current version exists (412).
        if (i.IfNoneMatch === '*' && objects.has(i.Key)) {
          throw Object.assign(new Error('PreconditionFailed'), { name: 'PreconditionFailed', $metadata: { httpStatusCode: 412 } });
        }
        objects.set(i.Key, Buffer.from(i.Body));
        return {};
      }
      if (cmd instanceof GetObjectCommand) {
        const body = objects.get(i.Key);
        if (!body) throw Object.assign(new Error('NoSuchKey'), { name: 'NoSuchKey' });
        return { Body: (async function* () { yield body; })() };
      }
      if (cmd instanceof ListObjectsV2Command) {
        const keys = [...objects.keys()].filter((k) => k.startsWith(i.Prefix ?? '')).sort();
        const start = i.ContinuationToken ? Number(i.ContinuationToken) : 0;
        const page = keys.slice(start, start + 1000);
        const more = start + 1000 < keys.length;
        return {
          Contents: page.map((Key) => ({ Key })),
          IsTruncated: more,
          NextContinuationToken: more ? String(start + 1000) : undefined,
        };
      }
      throw new Error('unexpected command');
    }
  }
  return { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command };
});

import {
  AUDIT_ANCHOR_FORMAT,
  AUDIT_ANCHOR_KEY_PREFIX,
  AUDIT_ARCHIVE_HOT_WINDOW,
  AuditAnchorMalformedError,
  anchorObjectKey,
  parseAuditChainAnchor,
  resolveAuditAnchorStore,
} from '../chain-anchor';

const HEAD = {
  organizationId: 7,
  rowId: '6f1c0d2e-0000-4000-8000-000000000007',
  chainSeq: '42',
  sha256Chain: 'a'.repeat(64),
  rowCount: 4,
  headOccurredAt: '2026-09-30T23:59:00.000Z',
};
const anchorDoc = (over: Record<string, unknown> = {}) =>
  JSON.stringify({ format: AUDIT_ANCHOR_FORMAT, store: 'public.audit_logs', anchoredAt: '2026-10-01T02:00:00.000Z', heads: [HEAD], ...over });

beforeEach(() => {
  objects.clear();
  sent.length = 0;
  failWith = null;
});

describe('resolveAuditAnchorStore', () => {
  it('is null — not configured — without AUDIT_ANCHOR_BUCKET, or with a blank one', () => {
    expect(resolveAuditAnchorStore({})).toBeNull();
    expect(resolveAuditAnchorStore({ AUDIT_ANCHOR_BUCKET: '  ' })).toBeNull();
  });

  it('names the bucket and the anchors/ prefix the task role is granted', () => {
    const store = resolveAuditAnchorStore({ AUDIT_ANCHOR_BUCKET: 'c2c-prod-part11-evidence' });
    expect(store?.location).toBe('s3://c2c-prod-part11-evidence/anchors/audit-chain/');
    expect(AUDIT_ANCHOR_KEY_PREFIX.startsWith('anchors/')).toBe(true);
  });
});

describe('the S3 anchor store', () => {
  const store = () => resolveAuditAnchorStore({ AUDIT_ANCHOR_BUCKET: 'evidence' })!;

  it('puts one JSON object under the dated key, with an integrity checksum and the bucket default encryption', async () => {
    const key = anchorObjectKey(new Date('2026-10-01T02:00:00.123Z'));
    expect(key).toMatch(/^anchors\/audit-chain\/2026\/10\/01\/2026-10-01T02-00-00-123Z-[0-9a-f]{8}\.json$/);
    await store().put(key, anchorDoc());
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      name: 'PutObjectCommand',
      input: { Bucket: 'evidence', Key: key, ContentType: 'application/json', ChecksumAlgorithm: 'SHA256' },
    });
    // The bucket's default SSE-KMS and object lock apply; a per-request header would override the key.
    expect(sent[0].input).not.toHaveProperty('ServerSideEncryption');
  });

  it('writes each key once: the put is conditional (If-None-Match *), so it never replaces an existing anchor', async () => {
    const key = anchorObjectKey(new Date('2026-10-01T02:00:00.000Z'));
    await store().put(key, anchorDoc());
    expect(sent[0].input).toMatchObject({ IfNoneMatch: '*' });

    // A second put to the same key, as a forger re-using a dated key would send it:
    // S3 answers 412, the error reaches the caller, and the first anchor is what stays.
    await expect(store().put(key, anchorDoc({ heads: [] }))).rejects.toThrow('PreconditionFailed');
    expect(sent[1].input).toMatchObject({ Key: key, IfNoneMatch: '*' });
    expect(JSON.parse(objects.get(key)!.toString('utf8')).heads).toEqual([HEAD]);
  });

  it('latest() follows the listing to its last page and returns the newest anchor', async () => {
    const start = Date.parse('2024-01-01T02:00:00.000Z');
    for (let d = 0; d < 2500; d++) objects.set(anchorObjectKey(new Date(start + d * 86_400_000)), Buffer.from(`{"d":${d}}`));
    objects.set('AWSLogs/123/CloudTrail/x.json.gz', Buffer.from('not an anchor'));
    const latest = await store().latest();
    const lastDay = new Date(start + 2499 * 86_400_000).toISOString().slice(0, 10).replaceAll('-', '/');
    expect(latest?.key.startsWith(`${AUDIT_ANCHOR_KEY_PREFIX}${lastDay}/`)).toBe(true);
    expect(latest?.body).toBe('{"d":2499}');
    const lists = sent.filter((s) => s.name === 'ListObjectsV2Command');
    expect(lists).toHaveLength(3);
    expect(lists.every((l) => l.input.Prefix === AUDIT_ANCHOR_KEY_PREFIX)).toBe(true);
  });

  it('latest() is null when nothing has been anchored', async () => {
    expect(await store().latest()).toBeNull();
  });

  it('a refused listing is an error, never "no anchor"', async () => {
    failWith = 'AccessDenied';
    await expect(store().latest()).rejects.toThrow('AccessDenied');
  });

  it('keys sort in time order, so the lexically last key is the newest anchor', () => {
    const a = anchorObjectKey(new Date('2026-09-30T23:59:59.999Z'));
    const b = anchorObjectKey(new Date('2026-10-01T00:00:00.000Z'));
    expect([b, a].sort()).toEqual([a, b]);
  });
});

describe('parseAuditChainAnchor', () => {
  it('accepts the document the writer produces', () => {
    expect(parseAuditChainAnchor(anchorDoc(), 'k').heads).toEqual([HEAD]);
    expect(parseAuditChainAnchor(anchorDoc({ heads: [{ ...HEAD, chainSeq: null }] }), 'k').heads[0].chainSeq).toBeNull();
  });

  it.each([
    ['not JSON', '{'],
    ['another format', anchorDoc({ format: 'something/1' })],
    ['another store', anchorDoc({ store: 'public.audit_events' })],
    ['no time', anchorDoc({ anchoredAt: 'yesterday' })],
    ['heads not a list', anchorDoc({ heads: {} })],
    ['a hash that is not sha-256 hex', anchorDoc({ heads: [{ ...HEAD, sha256Chain: 'A'.repeat(64) }] })],
    ['a row id that is not a uuid', anchorDoc({ heads: [{ ...HEAD, rowId: "1'; DROP TABLE x" }] })],
    ['a chain_seq that is not a whole number', anchorDoc({ heads: [{ ...HEAD, chainSeq: '4.2' }] })],
    ['a row count of zero', anchorDoc({ heads: [{ ...HEAD, rowCount: 0 }] })],
    ['an organisation twice', anchorDoc({ heads: [HEAD, HEAD] })],
  ])('refuses %s', (_label, body) => {
    expect(() => parseAuditChainAnchor(body, 'anchors/audit-chain/k.json')).toThrow(AuditAnchorMalformedError);
  });
});

describe('the archive hot window the verifier excuses nothing inside (DP-68)', () => {
  it("is the archive door's own floor, so the verifier and the door cannot drift apart", () => {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
    const door = fs.readFileSync(path.join(root, 'db/migrations/20260617_audit_logs_immutability.sql'), 'utf8');
    const floors = [...door.matchAll(/v_floor\s+constant interval := interval '([^']+)';/g)].map((m) => m[1]);
    expect(floors).toEqual([AUDIT_ARCHIVE_HOT_WINDOW]);
    expect(door).toMatch(/IF p_cutoff IS NULL OR p_cutoff > now\(\) - v_floor THEN/);
  });
});
