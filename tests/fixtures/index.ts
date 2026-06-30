/**
 * Shared Test Fixtures
 *
 * Reusable factory functions for common test objects. Each factory returns
 * sensible defaults and accepts partial overrides via object spread, so
 * tests only specify the fields they care about.
 *
 * Usage:
 *   import { createMockUser, createMockOrg, createMockAuthRequest } from '../fixtures';
 *
 * NOTE: This module intentionally avoids importing vitest so it can be
 * consumed from any test runner or plain TS without side-effects.
 *
 * @module tests/fixtures
 */

// ---------------------------------------------------------------------------
// User
// ---------------------------------------------------------------------------

export interface MockUser {
  id: number;
  email: string;
  organizationId: number;
  role: string;
  username?: string;
  mfaEnabled?: boolean;
}

let _userSeq = 100;

export function createMockUser(overrides: Partial<MockUser> = {}): MockUser {
  const id = overrides.id ?? _userSeq++;
  return {
    id,
    email: `user-${id}@test.example.com`,
    organizationId: 1,
    role: 'member',
    username: `user_${id}`,
    mfaEnabled: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Organization
// ---------------------------------------------------------------------------

export interface MockOrganization {
  id: number;
  name: string;
  slug: string;
  plan: string;
  createdAt: string;
}

let _orgSeq = 100;

export function createMockOrg(overrides: Partial<MockOrganization> = {}): MockOrganization {
  const id = overrides.id ?? _orgSeq++;
  return {
    id,
    name: `Test Organization ${id}`,
    slug: `test-org-${id}`,
    plan: 'enterprise',
    createdAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// JWT token (deterministic fake — NOT cryptographically valid)
// ---------------------------------------------------------------------------

/**
 * Returns a mock JWT-shaped string. It is base64-encoded JSON but is NOT
 * signed — use it only where the auth layer is mocked/stubbed.
 */
export function createMockToken(
  userId: number = 1,
  orgId: number = 1,
  extra: Record<string, unknown> = {},
): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      sub: String(userId),
      userId,
      organizationId: orgId,
      role: 'member',
      email: `user-${userId}@test.example.com`,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
      ...extra,
    }),
  ).toString('base64url');
  const fakeSig = Buffer.from('test-signature').toString('base64url');
  return `${header}.${payload}.${fakeSig}`;
}

// ---------------------------------------------------------------------------
// Express request (authenticated, with tenant context)
// ---------------------------------------------------------------------------

export interface MockAuthRequest {
  user: MockUser;
  userId: number;
  userRole: string;
  userEmail: string;
  body: Record<string, unknown>;
  params: Record<string, string>;
  query: Record<string, string>;
  headers: Record<string, string>;
  originalUrl: string;
  tenantContext: {
    organizationId: number | string | null;
    clientWorkspaceId: number | string | null;
    module?: string;
  };
  [key: string]: unknown;
}

/**
 * Build an Express-like request object pre-populated with an authenticated
 * user and tenant context. Middleware tests that need `req.user`, `req.userId`,
 * `req.userRole`, and `req.tenantContext` can use this directly.
 *
 * The `user` field is built via `createMockUser` so you can pass user
 * overrides through `overrides.user`.
 */
export function createMockAuthRequest(
  overrides: Partial<MockAuthRequest> & { user?: Partial<MockUser> } = {},
): MockAuthRequest {
  const { user: userOverrides, ...rest } = overrides;
  const user = createMockUser(userOverrides);

  return {
    user,
    userId: user.id,
    userRole: user.role,
    userEmail: user.email,
    body: {},
    params: {},
    query: {},
    headers: {
      'x-organization-id': String(user.organizationId),
      'x-client-workspace-id': '1',
    },
    originalUrl: '/api/test',
    tenantContext: {
      organizationId: user.organizationId,
      clientWorkspaceId: 1,
    },
    ...rest,
  };
}
