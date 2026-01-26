/**
 * Test Setup & Utilities
 *
 * Common test configuration, mocks, and utilities for all tests.
 *
 * @module tests/setup
 */

import { vi, beforeAll, afterAll, afterEach } from 'vitest';
import { Pool } from 'pg';

// ═══════════════════════════════════════════════════════════════════════════════
// MOCK DATABASE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Mock database pool for testing
 */
export const mockPool = {
  query: vi.fn(),
  connect: vi.fn(),
  end: vi.fn(),
  on: vi.fn(),
};

vi.mock('pg', () => ({
  Pool: vi.fn(() => mockPool),
}));

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
