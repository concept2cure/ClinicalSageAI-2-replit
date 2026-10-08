// @vitest-environment jsdom
/**
 * Opening one Vault document reads each of its panels' endpoints once.
 *
 * QA 2026-10-08 (rate limits): a document open fans out to the Versions,
 * Annotations and Related panels (and the History panel, which reads the same
 * way from Vault.tsx). Each read is a document-scoped GET the server counts
 * against the limiter, so the number of reads per open is what the limiter sees.
 * This test counts them, per endpoint, for one open with no development-only
 * double mount.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { VaultVersions } from '../surfaces/VaultVersions';
import { VaultAnnotations } from '../surfaces/VaultAnnotations';
import { VaultRelationships } from '../surfaces/VaultRelationships';

const PID = '11111111-1111-4111-8111-111111111111';
const DOC = '22222222-2222-4222-8222-222222222222';

const res = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

afterEach(() => {
  cleanup();
  apiRequest.mockReset();
});

/** The three panels a document open mounts, as Vault.tsx mounts them for a selected document. */
function documentPanels() {
  return (
    <>
      <VaultVersions
        projectId={PID}
        documentId={DOC}
        title="Vorelinib DS specification"
        onDownload={() => {}}
        downloadingId={null}
        onUploadNewVersion={() => {}}
        uploading={false}
        onLifecycleChanged={() => {}}
      />
      <VaultAnnotations projectId={PID} documentId={DOC} onChanged={() => {}} actorId={1} />
      <VaultRelationships projectId={PID} documentId={DOC} onChanged={() => {}} />
    </>
  );
}

/** The document-scoped GETs made so far, counted per endpoint (versions, annotations, ...). */
function documentReadCounts(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const [method, url] of apiRequest.mock.calls as Array<[string, string]>) {
    if (method !== 'GET') continue;
    const m = new RegExp(`/api/c2c/project-vault/${PID}/documents/${DOC}/([a-z]+)`).exec(url);
    if (m) counts[m[1]] = (counts[m[1]] ?? 0) + 1;
  }
  return counts;
}

describe('opening one Vault document', () => {
  it('reads each panel endpoint once, not once per panel mount', async () => {
    apiRequest.mockImplementation(async () => res(200, { success: true, data: null }));
    render(documentPanels());
    await waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(3));
    // Let any follow-on read a panel makes after its first answer settle.
    await new Promise((r) => setTimeout(r, 50));
    expect(documentReadCounts()).toEqual({ versions: 1, annotations: 1, relationships: 1 });
  });
});
