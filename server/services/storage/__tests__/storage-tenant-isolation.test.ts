/**
 * Object storage is outside RLS — this is the only tenant boundary it has.
 *
 * ── The defect this pins ──────────────────────────────────────────────────────
 * Postgres RLS isolates every tenant-keyed table. It does nothing for bytes on a
 * disk or in a bucket. The vault's provider interface took `get(vaultVersionId)`
 * with no organization at all, and the local implementation resolved that id by
 * walking EVERY organization's directory under VAULT_ROOT and returning the
 * first match. So any caller holding a version id read any tenant's file, and
 * `delete()` destroyed it the same way.
 *
 * Two AI action handlers (`ocr_extract_text`, `extract_template_from_upload`)
 * passed a payload-supplied id straight through. On that surface the payload is
 * MODEL-authored, so an instruction injected into a document AnA is reading
 * could name another tenant's file id and have its contents returned as OCR
 * text. `ctx.user.organizationId` was right there — used for provenance, never
 * for authorization.
 *
 * ── Why "not found" and not "forbidden" ───────────────────────────────────────
 * A distinguishable 403 on a foreign id confirms the id exists, which turns the
 * endpoint into an existence oracle. A foreign tenant's file must be
 * indistinguishable from one that never existed — the rule
 * `ana/uploaded-file-access.ts` already follows.
 *
 * @compliance 21 CFR Part 11 §11.10(d) — limiting system access to authorized
 *             individuals. The bytes are the record.
 */

import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { LocalStorageProvider } from '../local-provider';

// VAULT_ROOT is `path.resolve(process.cwd(), 'storage', 'vault')` and is not
// configurable, so the test runs against the REAL root rather than a temp dir.
// Making the root env-configurable purely to ease a test would be changing
// production behaviour for the test's convenience; unique high-numbered org ids
// cannot collide with anything, and afterEach removes exactly those two subtrees.
const ORG_A = 900101;
const ORG_B = 900202;
const VAULT_ROOT = path.resolve(process.cwd(), 'storage', 'vault');

const provider = new LocalStorageProvider();

afterEach(() => {
  for (const org of [ORG_A, ORG_B]) {
    fs.rmSync(path.join(VAULT_ROOT, String(org)), { recursive: true, force: true });
  }
});

async function put(orgId: number, body: string) {
  return provider.put({
    orgId,
    projectId: 'proj-1',
    filename: 'secret.txt',
    bytes: Buffer.from(body),
    mime: 'text/plain',
  });
}

describe('one tenant cannot read another tenant’s stored bytes', () => {
  it('returns a tenant its OWN file', async () => {
    // The negative control. Without it, a provider that refused everything would
    // satisfy every isolation assertion below.
    const a = await put(ORG_A, 'org A regulatory content');
    const got = await provider.get(a.vaultVersionId, ORG_A);
    // Thrown rather than `expect(...).not.toBeNull()` because that does not
    // narrow the type for the assertion below, and `got!` would silence the
    // compiler on exactly the case this test exists to detect.
    if (!got) throw new Error('the owning tenant was refused its own file');
    expect(got.bytes.toString()).toBe('org A regulatory content');
  });

  it('returns NULL for another tenant’s version id', async () => {
    const a = await put(ORG_A, 'org A regulatory content');
    const stolen = await provider.get(a.vaultVersionId, ORG_B);
    // Null, not a throw and not a 403-shaped error: a foreign file is absent.
    expect(stolen).toBeNull();
  });

  it('reports a foreign id exactly like an id that never existed', async () => {
    const a = await put(ORG_A, 'org A regulatory content');
    const foreign = await provider.get(a.vaultVersionId, ORG_B);
    const nonexistent = await provider.get('00000000-0000-4000-8000-000000000000', ORG_B);
    // Identical outcomes, so the response cannot be used to enumerate ids.
    expect(foreign).toEqual(nonexistent);
  });
});

describe('one tenant cannot destroy another tenant’s stored bytes', () => {
  it('refuses a cross-tenant delete AND leaves the file readable', async () => {
    // A cross-tenant delete is strictly worse than a cross-tenant read: the read
    // leaks a regulatory record, this destroys one. Asserting the file still
    // reads afterwards is the part that matters — a `false` return with the
    // bytes already gone would satisfy a weaker assertion.
    const a = await put(ORG_A, 'org A regulatory content');

    const deleted = await provider.delete(a.vaultVersionId, ORG_B);
    expect(deleted).toBe(false);

    const still = await provider.get(a.vaultVersionId, ORG_A);
    expect(still?.bytes.toString()).toBe('org A regulatory content');
  });

  it('allows a tenant to delete its own file', async () => {
    const a = await put(ORG_A, 'org A regulatory content');
    expect(await provider.delete(a.vaultVersionId, ORG_A)).toBe(true);
    expect(await provider.get(a.vaultVersionId, ORG_A)).toBeNull();
  });
});

describe('the version id cannot escape the org subtree', () => {
  // Rooting the search at the caller's org made path traversal reachable in a
  // way the old whole-vault scan did not: the id is joined onto a filesystem
  // path. Version ids are randomUUIDs, so the check is an exact-shape whitelist
  // rather than a blocklist of bad sequences.
  it.each([
    ['parent traversal', '../../101/proj-1/versions'],
    ['absolute path', '/etc/passwd'],
    ['empty', ''],
    ['not a uuid', 'secret.txt'],
    ['uuid with a suffix', '00000000-0000-4000-8000-000000000000/../..'],
  ])('rejects %s', async (_label, id) => {
    await put(ORG_A, 'org A regulatory content');
    expect(await provider.get(id, ORG_A)).toBeNull();
  });

  it('rejects a nonsense organization id rather than searching', async () => {
    const a = await put(ORG_A, 'org A regulatory content');
    for (const bad of [0, -1, NaN, 1.5]) {
      expect(await provider.get(a.vaultVersionId, bad as number)).toBeNull();
    }
  });
});

/**
 * The sidecar is data read back off disk, so it is not trusted.
 *
 * Directory scoping (findVersionDir roots the search at the caller's org)
 * handles the ordinary case. These cover what it CANNOT see:
 *
 *   - a version directory RELOCATED under the wrong org — moved by hand,
 *     restored from the wrong backup, synced badly. The path then says one
 *     tenant and the record says another, and the scoping believes the path.
 *   - a `filename` that is not a plain name, which resolves outside the version
 *     directory and serves an arbitrary file.
 *   - a sidecar that will not parse, which used to throw out of the read.
 *
 * Ported here when server/services/vaultService.ts was deleted. That module was
 * a byte-compatible duplicate of this provider — same VAULT_ROOT, same
 * versions/{id}/ layout, same _meta.json shape — and these checks had been
 * added to the copy. Consolidating onto the canonical provider without bringing
 * them would have been a net loss of safety, so they moved with the coverage.
 * The S3 provider already enforces the owner check the same way.
 */
describe('a tampered or misplaced sidecar cannot widen a read', () => {
  const verDirOf = (org: number, version: string) =>
    path.join(VAULT_ROOT, String(org), 'proj-1', 'versions', version);

  it('refuses a version directory whose recorded owner is a different org', async () => {
    const a = await put(ORG_A, 'org A regulatory content');
    // Relocate ORG_A's version under ORG_B, so the PATH says B and the RECORD
    // says A. Directory scoping alone would serve it to B.
    const dst = verDirOf(ORG_B, a.vaultVersionId);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.renameSync(verDirOf(ORG_A, a.vaultVersionId), dst);

    expect(await provider.get(a.vaultVersionId, ORG_B)).toBeNull();
  });

  it('refuses to DELETE a relocated directory it does not own', async () => {
    // Strictly worse than the read: this destroys the record rather than
    // leaking it, so it must refuse and leave the bytes intact.
    const a = await put(ORG_A, 'org A regulatory content');
    const dst = verDirOf(ORG_B, a.vaultVersionId);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.renameSync(verDirOf(ORG_A, a.vaultVersionId), dst);

    expect(await provider.delete(a.vaultVersionId, ORG_B)).toBe(false);
    expect(fs.existsSync(path.join(dst, '_meta.json'))).toBe(true);
  });

  it('refuses a filename that is not its own basename', async () => {
    const a = await put(ORG_A, 'org A regulatory content');
    const metaPath = path.join(verDirOf(ORG_A, a.vaultVersionId), '_meta.json');
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    meta.filename = '../../../../../../etc/passwd';
    fs.writeFileSync(metaPath, JSON.stringify(meta));

    expect(await provider.get(a.vaultVersionId, ORG_A)).toBeNull();
  });

  it('returns null on a corrupt sidecar rather than throwing', async () => {
    // Previously this crashed the read: JSON.parse ran unguarded on file
    // contents. A corrupt record is not an empty result, but there is nothing
    // to serve either, and the caller's contract here is "missing".
    const a = await put(ORG_A, 'org A regulatory content');
    fs.writeFileSync(path.join(verDirOf(ORG_A, a.vaultVersionId), '_meta.json'), '{ not json');

    await expect(provider.get(a.vaultVersionId, ORG_A)).resolves.toBeNull();
  });
});
