/**
 * `documents.generate_docx` writes into the caller's tenant prefix and never
 * overwrites (IAM-07 / P0-6).
 *
 * ── The defect ───────────────────────────────────────────────────────────────
 * The tool wrote `generated_documents/<Title>_<type>_<YYYYMMDD>.docx` (plus a
 * `.source.json` sidecar) into ONE directory for every tenant, and
 * `fs.writeFile` with the default flag replaced whatever was there. Two tenants
 * generating "Clinical Overview" on the same day produced the same name: the
 * second write destroyed the first tenant's document, and the download route
 * — which had no ownership check — served whichever bytes were last written to
 * whoever asked by name.
 *
 * ── What is pinned here ──────────────────────────────────────────────────────
 *   1. The output lands under `generated_documents/org-<organizationId>/`.
 *   2. Two generations with the same title do not share a path, and the first
 *      file's bytes survive the second write.
 *   3. The sidecar sits beside the DOCX under the same prefix.
 *   4. A name collision FAILS (`flag: 'wx'`) rather than overwriting — forced
 *      here by pinning `crypto.randomUUID`, because a gate that has only ever
 *      been seen to pass has not been tested.
 *   5. No organization on the context → the tool refuses and writes nothing.
 *
 * The DOCX renderer is mocked to return a fixed filename: the point is the
 * path the tool chooses, not the bytes the renderer produces.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

let renderCount = 0;
vi.mock('../../docx/docxFactory', () => ({
  generateRegulatory: vi.fn(async (input: unknown) => {
    renderCount += 1;
    return {
      buffer: Buffer.from(`docx-bytes-${renderCount}`),
      source: input,
      filename: 'Clinical_Overview_General_20260925.docx',
    };
  }),
}));

vi.mock('../../../db', () => ({
  db: {},
  pool: { query: vi.fn() },
}));

vi.mock('../../../utils/logger', () => ({
  createScopedLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
}));

let scratch: string;
let tool: { execute: (params: Record<string, string>, ctx: any) => Promise<any> };

beforeAll(async () => {
  scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'p06-generate-docx-'));
  vi.spyOn(process, 'cwd').mockReturnValue(scratch);
  await import('../index');
  const { getTool } = await import('../../toolRegistry');
  const found = getTool('documents.generate_docx');
  if (!found) throw new Error('documents.generate_docx is not registered');
  tool = found;
});

afterAll(async () => {
  vi.restoreAllMocks();
  await fs.rm(scratch, { recursive: true, force: true });
});

beforeEach(() => {
  renderCount = 0;
});

const ORG = '7';
const orgDir = () => path.join(scratch, 'generated_documents', `org-${ORG}`);

async function listOrgDir(): Promise<string[]> {
  try {
    return (await fs.readdir(orgDir())).sort();
  } catch {
    return [];
  }
}

describe('documents.generate_docx — tenant prefix, no overwrite', () => {
  it('writes two same-titled documents under the org prefix at distinct paths, keeping both', async () => {
    const params = { title: 'Clinical Overview', content: 'Section text.' };
    const ctx = { organizationId: ORG, userId: '1', projectId: null };

    const first = await tool.execute(params, ctx);
    const second = await tool.execute(params, ctx);

    expect(first.ok, first.message?.content).toBe(true);
    expect(second.ok, second.message?.content).toBe(true);

    const p1 = String(first.artifact?.data?.path);
    const p2 = String(second.artifact?.data?.path);
    expect(p1.startsWith(orgDir() + path.sep), p1).toBe(true);
    expect(p2.startsWith(orgDir() + path.sep), p2).toBe(true);
    expect(p1).not.toBe(p2);

    // The first tenant's bytes survive the second, same-named generation.
    expect((await fs.readFile(p1)).toString()).toBe('docx-bytes-1');
    expect((await fs.readFile(p2)).toString()).toBe('docx-bytes-2');

    // The sidecar follows the DOCX into the prefix.
    const s1 = String(first.artifact?.data?.sourcePath);
    expect(s1.startsWith(orgDir() + path.sep), s1).toBe(true);
    expect(s1).toBe(p1.replace(/\.docx$/, '.source.json'));
    await expect(fs.stat(s1)).resolves.toBeTruthy();

    // Nothing landed in the flat, shared directory.
    const flat = (await fs.readdir(path.join(scratch, 'generated_documents'))).filter(
      n => !n.startsWith('org-')
    );
    expect(flat).toEqual([]);
  });

  it('fails a path collision instead of overwriting (flag wx)', async () => {
    const fixed = '00000000-0000-4000-8000-00000000c011';
    const uuid = vi.spyOn(crypto, 'randomUUID').mockReturnValue(fixed as never);
    try {
      const params = { title: 'Clinical Overview', content: 'Section text.' };
      const ctx = { organizationId: ORG, userId: '1', projectId: null };

      const first = await tool.execute(params, ctx);
      expect(first.ok, first.message?.content).toBe(true);
      const p1 = String(first.artifact?.data?.path);
      expect(path.basename(p1).startsWith(`${fixed}-`)).toBe(true);

      const second = await tool.execute(params, ctx);
      expect(second.ok).toBe(false);
      expect(second.artifact).toBeNull();

      // The collision left the first document exactly as written.
      expect((await fs.readFile(p1)).toString()).toBe('docx-bytes-1');
    } finally {
      uuid.mockRestore();
    }
  });

  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['zero', '0'],
    ['non-numeric', 'acme'],
  ])('refuses and writes nothing when the organization is %s', async (_label, organizationId) => {
    await fs.rm(path.join(scratch, 'generated_documents'), { recursive: true, force: true });

    const result = await tool.execute(
      { title: 'Clinical Overview', content: 'Section text.' },
      { organizationId, userId: '1', projectId: null }
    );

    expect(result.ok).toBe(false);
    expect(result.artifact).toBeNull();
    expect(result.message.content).toMatch(/organization|tenant/i);
    expect(await listOrgDir()).toEqual([]);
    await expect(fs.stat(path.join(scratch, 'generated_documents'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });
});
