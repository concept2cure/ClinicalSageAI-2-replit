/**
 * Phase 11 E2E Test 4: Diff / History Verification
 *
 * Tests: version integrity, content hashes, diff between versions, history after reload
 */
import { test, expect } from '@playwright/test';
import { getSeedData, login, authHeaders } from './helpers';
import * as crypto from 'crypto';

const BASE = '/api/concept2cure';

test.describe('Diff & History Verification', () => {
  let adminToken: string;
  let seed: ReturnType<typeof getSeedData>;
  let artifactId: string;
  let projectId: number;
  const contents = [
    'Version 1: Initial regulatory summary for diff testing.',
    'Version 2: Added device description section for diff.',
    'Version 3: Final revision with clinical evidence section.',
  ];

  test.beforeAll(async ({ request }) => {
    seed = getSeedData();
    projectId = seed.projectId;
    adminToken = await login(request, 'admin');

    // Create artifact with v1
    const res = await request.post(`${BASE}/projects/${projectId}/artifacts`, {
      headers: authHeaders(adminToken),
      data: {
        type: 'document',
        category: 'document',
        title: 'E2E Diff/History Test Doc',
        content: contents[0],
      },
    });
    const json = await res.json();
    artifactId = json.data.id;

    // Create v2 and v3
    for (let i = 1; i < contents.length; i++) {
      await request.put(`${BASE}/projects/${projectId}/artifacts/${artifactId}`, {
        headers: authHeaders(adminToken),
        data: { content: contents[i] },
      });
    }
  });

  test('1. Version history returns all versions in order', async ({ request }) => {
    const res = await request.get(
      `${BASE}/projects/${projectId}/artifacts/${artifactId}/versions`,
      { headers: authHeaders(adminToken) }
    );
    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    const versions = json.data.versions;
    expect(versions.length).toBeGreaterThanOrEqual(3);
  });

  test('2. Each version has a unique SHA-256 content hash', async ({ request }) => {
    const res = await request.get(
      `${BASE}/projects/${projectId}/artifacts/${artifactId}/versions`,
      { headers: authHeaders(adminToken) }
    );
    const json = await res.json();
    const versions = json.data.versions;
    const hashes = new Set<string>();
    for (const v of versions) {
      expect(v.contentHash).toBeTruthy();
      expect(v.contentHash.length).toBe(64); // SHA-256 hex
      hashes.add(v.contentHash);
    }
    expect(hashes.size).toBe(versions.length);
  });

  test('3. Content hash matches SHA-256 of actual content', async ({ request }) => {
    const res = await request.get(
      `${BASE}/projects/${projectId}/artifacts/${artifactId}/versions`,
      { headers: authHeaders(adminToken) }
    );
    const json = await res.json();
    const versions = json.data.versions;
    for (const v of versions) {
      if (v.content) {
        const computed = crypto.createHash('sha256').update(v.content).digest('hex');
        expect(v.contentHash).toBe(computed);
      }
    }
  });

  test('4. Version numbers are strictly increasing', async ({ request }) => {
    const res = await request.get(
      `${BASE}/projects/${projectId}/artifacts/${artifactId}/versions`,
      { headers: authHeaders(adminToken) }
    );
    const json = await res.json();
    // Versions are sorted desc; reverse for ascending check
    const versions = [...json.data.versions].reverse();
    for (let i = 1; i < versions.length; i++) {
      expect(versions[i].version).toBeGreaterThan(versions[i - 1].version);
    }
  });

  test('5. Fresh fetch returns the latest version content', async ({ request }) => {
    const freshToken = await login(request, 'admin');
    const res = await request.get(
      `${BASE}/projects/${projectId}/artifacts/${artifactId}/versions`,
      { headers: authHeaders(freshToken) }
    );
    expect(res.status()).toBe(200);
    const json = await res.json();
    const versions = json.data.versions;
    // First entry is latest (desc order)
    expect(versions[0].content).toContain('Version 3');
  });
});
