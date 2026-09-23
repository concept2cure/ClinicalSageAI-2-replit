/**
 * An uploaded file has no authoring lifecycle, and the vault must not invent one.
 *
 * ── THE DEFECT, IN FOUR LAYERS ──────────────────────────────────────────────
 * Every file uploaded into the MDX Document vault rendered as "draft · 64%" —
 * a working copy two-thirds written, for a finished PDF nobody was authoring.
 * Four independent layers each landed on that, which is why no single-layer
 * fix would have moved it:
 *
 *  1. `vault.documents.processing_status` is written PENDING at ingest and
 *     NOTHING in the repo ever advances it. (Still true — see the assessment.
 *     It is no longer load-bearing, which is the point of this fix.)
 *  2. `server/routes/mdx-vault.ts` mapped `processing_status === 'INDEXED' ?
 *     'final' : 'draft'` — a category error even had layer 1 worked: indexing
 *     is an ingest pipeline stage, not an approval.
 *  3. `useVault.toStatus` did not recognise 'final' at all (only 'approved'
 *     maps to it), so the server's value fell through to the 'draft' default.
 *     Fixing layers 1 and 2 alone would have changed nothing on screen.
 *  4. `VaultSurface.fileToDoc` assigned `completion: … : 64` — the else-branch
 *     of a ternary written for authored documents.
 *
 * And the interaction is the reason this is worth a test rather than a patch:
 * "fixing" layer 1 so uploads reported INDEXED would have turned 'draft · 64%'
 * into 'final · 100%' — asserting an approval and a completion nobody gave, in
 * a regulated vault. The honest value is neither.
 */

import { describe, it, expect } from 'vitest';
import { deriveVaultKpis, selectVaultFiles } from '../hooks/useVault';
import { completionOf, toDocStatus } from '../surfaces/VaultSurface';
import type { VaultFile, VaultFileStatus } from '../data/vault';

const file = (over: Partial<VaultFile> = {}): VaultFile => ({
  id: 'f1',
  name: 'stability-summary.pdf',
  kind: 'report',
  type: 'pdf',
  size: '2.0 MB',
  prog: 'OR-801',
  folder: 'root',
  ver: 'v1',
  versions: 1,
  status: 'uploaded' as VaultFileStatus,
  updated: 'today',
  author: 'A. Reviewer',
  linked: 0,
  esig: false,
  hash: 'abc',
  ...over,
});

describe('the KPI strip counts, and does not infer by subtraction', () => {
  it('does not report an uploaded file as a working copy', () => {
    const kpis = deriveVaultKpis([
      file({ id: 'u1', status: 'uploaded' }),
      file({ id: 'u2', status: 'uploaded' }),
      file({ id: 'd1', status: 'draft' }),
    ]);
    const by = (label: string) => kpis.find((k) => k.label === label)?.metric;

    // Drafts was `total - locked - review`, so both uploads landed here and the
    // tile read 3 "Working copies".
    expect(by('Drafts')).toBe('1');
    expect(by('Uploaded files')).toBe('2');
    expect(by('Artifacts in vault')).toBe('3');
  });

  it('still counts locked, final and review as before', () => {
    const kpis = deriveVaultKpis([
      file({ id: 'l', status: 'locked' }),
      file({ id: 'f', status: 'final' }),
      file({ id: 'r', status: 'review' }),
      file({ id: 'd', status: 'draft' }),
    ]);
    const by = (label: string) => kpis.find((k) => k.label === label)?.metric;
    expect(by('Locked + final')).toBe('2');
    expect(by('In review')).toBe('1');
    expect(by('Drafts')).toBe('1');
    expect(by('Uploaded files')).toBe('0');
  });

  it('an uploaded file is neither locked nor in review', () => {
    const kpis = deriveVaultKpis([file({ status: 'uploaded' })]);
    const by = (label: string) => kpis.find((k) => k.label === label)?.metric;
    expect(by('Locked + final')).toBe('0');
    expect(by('In review')).toBe('0');
    expect(by('Drafts')).toBe('0');
  });
});

describe('the row mapper carries \'uploaded\' through instead of defaulting to draft', () => {
  const row = (over: Record<string, unknown> = {}) => ({
    id: 1, artifactId: 'DOC-1', title: 'stability-summary.pdf', type: 'pdf',
    category: 'INTERNAL', family: 'Uploaded files', ctdSection: null,
    status: 'uploaded', version: 1, contentHash: 'abc', createdById: 3,
    createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
    lockedAt: null, eSig: false, source: 'upload', fileSize: 2048, mimeType: 'application/pdf',
    ...over,
  });

  it("maps the server's 'uploaded' to 'uploaded', not to the draft default", () => {
    const files = selectVaultFiles({ data: [row()] } as never);
    expect(files![0].status).toBe('uploaded');
  });

  it('still maps the authoring vocabulary as before', () => {
    const files = selectVaultFiles({
      data: [
        row({ id: 2, artifactId: 'A', status: 'approved' }),
        row({ id: 3, artifactId: 'B', status: 'review' }),
        row({ id: 4, artifactId: 'C', status: 'anything-else' }),
        row({ id: 5, artifactId: 'D', status: 'draft', lockedAt: '2026-01-01T00:00:00Z' }),
      ],
    } as never);
    expect(files!.map((f) => f.status)).toEqual(['final', 'review', 'draft', 'locked']);
  });

  it('an uploaded file is never reported as locked, even if a lock timestamp leaks in', () => {
    // The absence of an authoring lifecycle is checked FIRST, deliberately:
    // an ingested file cannot be locked by a workflow it is not in.
    const files = selectVaultFiles({ data: [row({ lockedAt: '2026-01-01T00:00:00Z' })] } as never);
    expect(files![0].status).toBe('uploaded');
  });
});

describe('completion is null for a document nobody assessed', () => {
  it('gives an uploaded file NO percentage — not 64, and not 100', () => {
    expect(completionOf('uploaded')).toBeNull();
  });

  it('keeps the authored scale intact', () => {
    expect(completionOf('locked')).toBe(100);
    expect(completionOf('final')).toBe(100);
    expect(completionOf('review')).toBe(88);
    expect(completionOf('draft')).toBe(64);
  });

  it("maps 'uploaded' through to the panel as its own status, not 'ready' or 'draft'", () => {
    expect(toDocStatus('uploaded')).toBe('uploaded');
    expect(toDocStatus('final')).toBe('ready');
    expect(toDocStatus('locked')).toBe('locked');
    expect(toDocStatus('draft')).toBe('draft');
  });
});
