/**
 * E2E test helpers for Phase 11 governed workflow tests.
 */
import { APIRequestContext } from '@playwright/test';
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
