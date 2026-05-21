/**
 * Test Setup & Utilities
 *
 * Common test configuration, mocks, and utilities for all tests.
 * Enhanced with security testing utilities and comprehensive factories.
 *
 * @module tests/setup
 */

// Set env vars before any imports so server/db/runtime.ts initializes a pool
// (mocked via pg below). Without DATABASE_URL set at module-load time, db.js
// throws "Database connection not available" cascading into every transitive
// import.
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test';
process.env.SKIP_DB_STARTUP_TEST = process.env.SKIP_DB_STARTUP_TEST || 'true';
process.env.JWT_SECRET =
  process.env.JWT_SECRET || 'test-jwt-secret-for-unit-tests-min-32-chars-long';
process.env.JWT_SECRET_DEV =
  process.env.JWT_SECRET_DEV || 'test-jwt-secret-for-unit-tests-min-32-chars-long';
process.env.DATABASE_URL_DEV = process.env.DATABASE_URL_DEV || process.env.DATABASE_URL;

import { vi, beforeAll, afterAll, afterEach } from 'vitest';

// ═══════════════════════════════════════════════════════════════════════════════
// MOCK DATABASE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Mock database pool for testing
 * Includes query result simulation and connection tracking
 */
export const mockPool = {
  query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  connect: vi.fn().mockResolvedValue({
    query: vi.fn(),
    release: vi.fn(),
  }),
  end: vi.fn().mockResolvedValue(undefined),
  on: vi.fn(),
  totalCount: 0,
  idleCount: 0,
  waitingCount: 0,
};

vi.mock('pg', () => ({
  Pool: vi.fn(() => mockPool),
}));

// ═══════════════════════════════════════════════════════════════════════════════
// SECURITY TESTING UTILITIES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Common XSS attack vectors for testing input sanitization
 */
export const XSS_PAYLOADS = [
  '<script>alert("xss")</script>',
  'javascript:alert("xss")',
  '<img src=x onerror=alert("xss")>',
  '<svg onload=alert("xss")>',
  '"><script>alert("xss")</script>',
  "'; DROP TABLE users; --",
  '<iframe src="javascript:alert(\'xss\')">',
];

/**
 * SQL injection test payloads
 */
export const SQL_INJECTION_PAYLOADS = [
  "'; DROP TABLE users; --",
  "' OR '1'='1",
  '1; DELETE FROM users',
  "' UNION SELECT * FROM users --",
  "admin'--",
];

/**
 * Test that a function properly sanitizes malicious input
 */
export function testInputSanitization(
  sanitizeFunc: (input: string) => string,
  payloads: string[] = XSS_PAYLOADS
): void {
  for (const payload of payloads) {
    const result = sanitizeFunc(payload);
    expect(result).not.toContain('<script');
    expect(result).not.toContain('javascript:');
    expect(result).not.toContain('onerror=');
    expect(result).not.toContain('onload=');
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MOCK REQUEST/RESPONSE
// ═══════════════════════════════════════════════════════════════════════════════

export interface MockRequest {
  body: Record<string, unknown>;
  params: Record<string, string>;
  query: Record<string, string>;
  headers: Record<string, string>;
  tenantContext?: {
    organizationId: string | null;
    clientWorkspaceId: string | null;
    module?: string;
  };
}

export interface MockResponse {
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
  setHeader: ReturnType<typeof vi.fn>;
  end: ReturnType<typeof vi.fn>;
}

/**
 * Create a mock Express request object
 */
export function createMockRequest(overrides: Partial<MockRequest> = {}): MockRequest {
  return {
    body: {},
    params: {},
    query: {},
    headers: {
      'x-organization-id': 'test-org-123',
      'x-client-workspace-id': 'test-workspace-456',
    },
    tenantContext: {
      organizationId: 'test-org-123',
      clientWorkspaceId: 'test-workspace-456',
    },
    ...overrides,
  };
}

/**
 * Create a mock Express response object
 */
export function createMockResponse(): MockResponse {
  const res: MockResponse = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
    setHeader: vi.fn().mockReturnThis(),
    end: vi.fn().mockReturnThis(),
  };
  return res;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MOCK SERVICES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Mock OpenAI service
 */
export const mockOpenAI = {
  createEmbedding: vi.fn().mockResolvedValue({
    data: [{ embedding: Array(1536).fill(0.1) }],
  }),
  createChatCompletion: vi.fn().mockResolvedValue({
    choices: [{ message: { content: 'Mock response' } }],
  }),
};

vi.mock('../server/services/openaiService', () => ({
  default: mockOpenAI,
  createEmbedding: mockOpenAI.createEmbedding,
  createChatCompletion: mockOpenAI.createChatCompletion,
}));

// ═══════════════════════════════════════════════════════════════════════════════
// TEST DATA FACTORIES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create a test device profile
 */
export function createTestDeviceProfile(overrides: Record<string, unknown> = {}) {
  return {
    id: 'test-device-123',
    deviceName: 'Test Medical Device',
    deviceDescription: 'A test medical device for unit testing',
    deviceClass: 'II',
    productCode: 'ABC',
    intendedUse: 'For testing purposes only',
    regulationNumber: '21 CFR 880.1234',
    organizationId: 'test-org-123',
    clientWorkspaceId: 'test-workspace-456',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Create a test project
 */
export function createTestProject(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    organizationId: 1,
    clientWorkspaceId: 1,
    name: 'Test 510(k) Project',
    description: 'A test project for unit testing',
    type: 'regulatory',
    status: 'planning',
    priority: 'high',
    startDate: new Date().toISOString(),
    targetEndDate: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Create a test compliance result
 */
export function createTestComplianceResult(overrides: Record<string, unknown> = {}) {
  return {
    projectId: 'test-project-123',
    timestamp: new Date().toISOString(),
    overallScore: 85,
    completedSections: 8,
    totalSections: 10,
    criticalIssues: 1,
    warnings: 2,
    sections: [
      {
        id: 'sec-001',
        name: 'Administrative Information',
        status: 'passed',
        checks: [
          {
            id: 'check-001',
            description: 'All required fields present',
            status: 'passed',
            message: 'Validation successful',
          },
        ],
      },
    ],
    ...overrides,
  };
}

/**
 * Create a test Cortex atom
 */
export function createTestCortexAtom(overrides: Record<string, unknown> = {}) {
  return {
    id: 'atom-test-123',
    type: 'fact',
    content: 'Test knowledge atom content',
    embedding: Array(1536).fill(0.1),
    metadata: {
      source: 'test',
      confidence: 0.95,
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Create a test document
 */
export function createTestDocument(overrides: Record<string, unknown> = {}) {
  return {
    id: 'doc-test-123',
    name: 'Test Document',
    type: 'protocol',
    status: 'draft',
    version: '1.0',
    projectId: 'proj-test-123',
    organizationId: 'org-test-123',
    content: 'Test document content',
    size: 1024,
    mimeType: 'application/pdf',
    checksum: 'abc123',
    previousVersionId: null,
    createdBy: 'user-test-123',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

// Alias for backwards compatibility
export const mockDb = mockPool;
export const mockRequest = createMockRequest;
export const mockResponse = createMockResponse;

// ═══════════════════════════════════════════════════════════════════════════════
// ASSERTION HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Assert that a response has a specific status code
 */
export function expectStatus(res: MockResponse, status: number) {
  expect(res.status).toHaveBeenCalledWith(status);
}

/**
 * Assert that a response contains specific JSON data
 */
export function expectJson(res: MockResponse, data: Record<string, unknown>) {
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining(data));
}

/**
 * Assert that a response is a successful API response
 */
export function expectSuccess(res: MockResponse) {
  expect(res.status).toHaveBeenCalledWith(200);
  expect(res.json).toHaveBeenCalled();
}

/**
 * Assert that a response is an error response
 */
export function expectError(res: MockResponse, status: number, messageContains?: string) {
  expect(res.status).toHaveBeenCalledWith(status);
  if (messageContains) {
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.stringContaining(messageContains),
      })
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// LIFECYCLE HOOKS
// ═══════════════════════════════════════════════════════════════════════════════

beforeAll(() => {
  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
});

afterEach(() => {
  // Clear all mocks after each test
  vi.clearAllMocks();
});

afterAll(() => {
  // Clean up
  vi.restoreAllMocks();
});

export { vi };
