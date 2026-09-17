/**
 * vaultService.streamVersion — the bytes are scoped to one tenant.
 *
 * ── What was wrong ───────────────────────────────────────────────────────────
 * `streamVersion(vaultVersionId)` took a version id and nothing else, and its
 * helper walked EVERY org directory under storage/vault looking for it — the
 * function's own comment said "search for version directory across all
 * orgs/projects". Possession of a version id was possession of the bytes,
 * whoever owned them.
 *
 * ── What it was not ──────────────────────────────────────────────────────────
 * Not a reachable cross-tenant read. Both callers
 * (server/routes/ivdr-binder-routes.ts) load the pack with
 * `WHERE id = $1 AND organization_id = $2` and take the version ids off that
 * row, so a caller could only name versions their own org already owned. The
 * defect was the shape: one future caller passing a client-supplied version id
 * makes it real, and there was nothing in the function to stop it. In a vault
 * holding regulatory submissions that is not a gap worth leaving open, and the
 * safe sibling — `getStorageProvider().get(versionId, orgId)` — already
 * required the org.
 *
 * ── What these pin ───────────────────────────────────────────────────────────
 * That the gate is STRUCTURAL rather than a check that can be forgotten: the
 * path is built under the caller's org, so another tenant's version is not
 * findable rather than merely not returned. Plus the two ways a value read back
 * off disk could still escape that directory.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const ORG_A = 11;
const ORG_B = 22;
const PROJECT = 'prog-1';

let tmpRoot: string;
let svc: typeof import('../vaultService');
let versionOfA: string;

beforeAll(async () => {
  // VAULT_ROOT is resolved from process.cwd() at module load, so the stub has
  // to be in place before the first import of the module under test.
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vaultsvc-'));
  vi.spyOn(process, 'cwd').mockReturnValue(tmpRoot);
  svc = await import('../vaultService');

  const put = await svc.putBytes({
    orgId: ORG_A,
    projectId: PROJECT,
    filename: 'ivdr-pack.pdf',
    bytes: Buffer.from('%PDF-1.7 org A confidential'),
    mime: 'application/pdf',
  });
  versionOfA = put.vaultVersionId;
});

afterAll(() => {
  vi.restoreAllMocks();
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

/** Where putBytes placed org A's version, for the tampering cases below. */
const versionDirOf = (org: number, version: string) =>
  path.join(tmpRoot, 'storage', 'vault', String(org), PROJECT, 'versions', version);

describe('streamVersion is scoped to the caller organization', () => {
  it('serves the owning organization its own bytes', async () => {
    const r = await svc.streamVersion(versionOfA, ORG_A);
    expect(r).not.toBeNull();
    expect(r!.filename).toBe('ivdr-pack.pdf');
    // Drain rather than destroy: a ReadStream opens its fd asynchronously, so
    // destroying it leaves the open queued and it faults later against a
    // torn-down fixture. Reading it also checks the bytes are the right ones.
    const chunks: Buffer[] = [];
    for await (const c of r!.stream) chunks.push(c as Buffer);
    expect(Buffer.concat(chunks).toString()).toBe('%PDF-1.7 org A confidential');
  });

  it('refuses another organization holding the same version id', async () => {
    // The whole point: ORG_B names a real, existing version — and gets nothing,
    // because the lookup never leaves ORG_B's own directory.
    expect(await svc.streamVersion(versionOfA, ORG_B)).toBeNull();
  });

  it('refuses a missing, zero or non-integer organization', async () => {
    for (const bad of [0, -1, 1.5, Number.NaN] as number[]) {
      expect(await svc.streamVersion(versionOfA, bad)).toBeNull();
    }
    expect(await svc.streamVersion(versionOfA, undefined as unknown as number)).toBeNull();
  });

  it('refuses an unknown version id for a real organization', async () => {
    expect(await svc.streamVersion('00000000-0000-4000-8000-000000000000', ORG_A)).toBeNull();
  });
});

describe('values read back off disk cannot escape the version directory', () => {
  it('refuses a version id that tries to traverse out of the org directory', async () => {
    // Without the basename check this climbs back above VAULT_ROOT/{orgId},
    // which is exactly the scoping the org argument just established.
    expect(await svc.streamVersion(`../../${ORG_A}/${PROJECT}/versions/${versionOfA}`, ORG_B))
      .toBeNull();
  });

  it('refuses a sidecar whose recorded owner disagrees with the caller', async () => {
    // A version relocated under the wrong org directory: the path scoping would
    // find it, and only the sidecar's stamped owner catches it.
    const v = (
      await svc.putBytes({
        orgId: ORG_A,
        projectId: PROJECT,
        filename: 'moved.pdf',
        bytes: Buffer.from('%PDF-1.7 moved'),
        mime: 'application/pdf',
      })
    ).vaultVersionId;
    const src = versionDirOf(ORG_A, v);
    const dst = versionDirOf(ORG_B, v);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.renameSync(src, dst);

    expect(await svc.streamVersion(v, ORG_B)).toBeNull();
  });

  it('refuses a sidecar filename that is not a plain basename', async () => {
    const v = (
      await svc.putBytes({
        orgId: ORG_A,
        projectId: PROJECT,
        filename: 'ok.pdf',
        bytes: Buffer.from('%PDF-1.7 ok'),
        mime: 'application/pdf',
      })
    ).vaultVersionId;
    const metaPath = path.join(versionDirOf(ORG_A, v), '_meta.json');
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    meta.filename = '../../../../../../etc/passwd';
    fs.writeFileSync(metaPath, JSON.stringify(meta));

    expect(await svc.streamVersion(v, ORG_A)).toBeNull();
  });
});
