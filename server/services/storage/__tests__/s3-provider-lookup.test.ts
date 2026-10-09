/**
 * S3StorageProvider finds every object it stored, and says so when it cannot look.
 *
 * `get`, `delete` and `getSignedUrl` located an object's metadata by listing the
 * WHOLE bucket once, with `MaxKeys: 1000` and no continuation. Each upload
 * writes two keys (the bytes and a `_meta.json` sidecar), so once a bucket held
 * about 500 documents across all tenants, every later document read as
 * missing. S3 lists keys in lexical order, so which documents disappeared
 * depended on other tenants' key names. `list()` stopped at 1000 keys in the
 * same way.
 *
 * Every failure was also caught and returned as null: an expired credential or
 * a denied bucket policy read exactly like "this document does not exist". For
 * a vault that holds a filing's source documents, that is an error rendered as
 * an absence.
 *
 * The fake below is S3's paging contract: keys in lexical order, at most
 * MaxKeys (default 1000) a page, and IsTruncated/NextContinuationToken.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Obj = { body: Buffer };
const store = new Map<string, Obj>();
let failWith: { name: string; message: string } | null = null;
const listCalls: Array<{ Prefix?: string; ContinuationToken?: string }> = [];

vi.mock('@aws-sdk/client-s3', () => {
  class Cmd {
    constructor(public input: Record<string, unknown>) {}
  }
  class PutObjectCommand extends Cmd {}
  class GetObjectCommand extends Cmd {}
  class DeleteObjectCommand extends Cmd {}
  class ListObjectsV2Command extends Cmd {}
  class S3Client {
    async send(cmd: Cmd) {
      if (failWith) {
        const e = new Error(failWith.message);
        e.name = failWith.name;
        throw e;
      }
      const i = cmd.input as Record<string, any>;
      if (cmd instanceof PutObjectCommand) {
        store.set(i.Key, { body: Buffer.from(i.Body) });
        return {};
      }
      if (cmd instanceof DeleteObjectCommand) {
        store.delete(i.Key);
        return {};
      }
      if (cmd instanceof GetObjectCommand) {
        const o = store.get(i.Key);
        if (!o) {
          const e = new Error('The specified key does not exist.');
          e.name = 'NoSuchKey';
          throw e;
        }
        return { Body: (async function* () { yield o.body; })() };
      }
      if (cmd instanceof ListObjectsV2Command) {
        listCalls.push({ Prefix: i.Prefix, ContinuationToken: i.ContinuationToken });
        const max = Math.min(Number(i.MaxKeys ?? 1000), 1000);
        const keys = [...store.keys()].filter((k) => k.startsWith(i.Prefix ?? '')).sort();
        const start = i.ContinuationToken ? Number(i.ContinuationToken) : 0;
        const page = keys.slice(start, start + max);
        const truncated = start + max < keys.length;
        return {
          Contents: page.map((Key) => ({ Key })),
          IsTruncated: truncated,
          NextContinuationToken: truncated ? String(start + max) : undefined,
        };
      }
      throw new Error('unexpected command');
    }
  }
  return { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command };
});
vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: async (_c: unknown, cmd: { input: { Key: string } }) => `https://signed.example/${cmd.input.Key}`,
}));

import { S3StorageProvider } from '../s3-provider';

const ORG = 7;
const OTHER_ORG = 3; // lexically before ORG, so its keys fill the first pages of a whole-bucket list

function provider() {
  process.env.AWS_S3_BUCKET = 'c2c-vault-test';
  return new S3StorageProvider();
}

async function putMany(p: S3StorageProvider, org: number, project: string, n: number) {
  const ids: string[] = [];
  for (let k = 0; k < n; k++) {
    const r = await p.put({
      orgId: org,
      projectId: project,
      filename: `doc-${k}.pdf`,
      bytes: Buffer.from(`org ${org} document ${k}`),
      mime: 'application/pdf',
    });
    ids.push(r.vaultVersionId);
  }
  return ids;
}

beforeEach(() => {
  store.clear();
  listCalls.length = 0;
  failWith = null;
});

describe('S3StorageProvider finds what it stored, past the first page', () => {
  it("reads a tenant's document when other tenants' keys fill the first 1000", async () => {
    const p = provider();
    await putMany(p, OTHER_ORG, 'prog-a', 600); // at least 1200 keys that sort before ORG's
    const [mine] = await putMany(p, ORG, 'prog-b', 1);

    const got = await p.get(mine, ORG);
    expect(got, 'a stored document must never read as missing').not.toBeNull();
    expect(got!.bytes.toString()).toBe(`org ${ORG} document 0`);
  });

  it("reads a tenant's 1,200th document", async () => {
    const p = provider();
    const ids = await putMany(p, ORG, 'prog-b', 1200);
    const got = await p.get(ids[ids.length - 1], ORG);
    expect(got?.bytes.toString()).toBe(`org ${ORG} document 1199`);
  });

  it('lists every document in a project, not the first 500', async () => {
    const p = provider();
    await putMany(p, ORG, 'prog-b', 700);
    expect((await p.list(ORG, 'prog-b')).length).toBe(700);
  });

  it('deletes a document past the first page, and it is then gone', async () => {
    const p = provider();
    await putMany(p, OTHER_ORG, 'prog-a', 600);
    const [mine] = await putMany(p, ORG, 'prog-b', 1);
    expect(await p.delete(mine, ORG)).toBe(true);
    expect(await p.get(mine, ORG)).toBeNull();
    expect([...store.keys()].filter((k) => k.startsWith(`${ORG}/`))).toEqual([]);
  });

  it("never looks outside the requesting tenant's prefix, and never returns another tenant's document", async () => {
    const p = provider();
    const [theirs] = await putMany(p, OTHER_ORG, 'prog-a', 1);
    listCalls.length = 0;
    expect(await p.get(theirs, ORG)).toBeNull();
    for (const c of listCalls) expect(c.Prefix, 'every listing is scoped to the caller').toBe(`${ORG}/`);
  });
});

describe('S3StorageProvider reports a failure as a failure', () => {
  it('rejects, rather than reporting the document missing, when S3 refuses', async () => {
    const p = provider();
    const [mine] = await putMany(p, ORG, 'prog-b', 1);
    failWith = { name: 'AccessDenied', message: 'Access Denied' };
    await expect(p.get(mine, ORG)).rejects.toThrow(/Access Denied/);
    await expect(p.getSignedUrl(mine, ORG)).rejects.toThrow(/Access Denied/);
  });

  it('still reports a genuinely absent version as missing', async () => {
    const p = provider();
    await putMany(p, ORG, 'prog-b', 3);
    expect(await p.get('00000000-0000-4000-8000-000000000000', ORG)).toBeNull();
  });
});
