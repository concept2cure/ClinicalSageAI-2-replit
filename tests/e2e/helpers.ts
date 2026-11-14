/**
 * E2E test helpers for Phase 11 governed workflow tests.
 */
import { APIRequestContext, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface SeedData {
  organizationId: number;
  projectId: number;
  artifactId: string;
  numericArtifactId: number;
  users: Record<string, { id: number; email: string; password: string }>;
}

let _seedData: SeedData | null = null;

export function getSeedData(): SeedData {
  if (!_seedData) {
    const p = path.join(__dirname, 'seed-data.json');
    _seedData = JSON.parse(fs.readFileSync(p, 'utf-8'));
  }
  return _seedData!;
}

export async function login(
  request: APIRequestContext,
  role: 'admin' | 'author' | 'reviewer' | 'viewer'
): Promise<string> {
  const seed = getSeedData();
  const user = seed.users[role];
  const res = await request.post('/api/auth/login', {
    data: { email: user.email, password: user.password },
  });
  if (!res.ok()) {
    const body = await res.text();
    throw new Error(`Login failed for ${role}: ${res.status()} ${body}`);
  }
  const json = await res.json();
  return json.accessToken || json.token;
}

export function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}` };
}

/** Live browser-session HTTP; independent of the optional seed-data helpers above. */
export async function browserApi<T>(
  page: Page,
  method: 'GET' | 'POST' | 'PUT',
  path: string,
  body?: unknown
): Promise<{ status: number; headers: Record<string, string>; body: T }> {
  return page.evaluate(
    async ({ method, path, body }) => {
      const token = localStorage.getItem('trialsage_access_token');
      const response = await fetch(path, {
        method,
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const headers = Object.fromEntries(response.headers.entries());
      const contentType = response.headers.get('content-type') ?? '';
      const responseBody = contentType.includes('json')
        ? await response.json()
        : { byteLength: (await response.arrayBuffer()).byteLength };
      return { status: response.status, headers, body: responseBody };
    },
    { method, path, body }
  ) as Promise<{ status: number; headers: Record<string, string>; body: T }>;
}
