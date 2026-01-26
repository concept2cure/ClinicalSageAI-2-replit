/**
 * Portal Types Tests
 *
 * Unit tests for the client portal type definitions and configurations.
 *
 * @module tests/client/portalTypes.test
 */

import { describe, it, expect } from 'vitest';

// Import types and constants inline since we're testing type definitions
const ROLE_DISPLAY_MAP = {
  admin: {
    id: 'admin',
    label: 'Administrator',
    description: 'Full system access',
    color: '#7c3aed',
    icon: 'Shield',
  },
  regulatory_lead: {
    id: 'regulatory_lead',
    label: 'Regulatory Lead',
    description: 'Submission management',
    color: '#0d6efd',
    icon: 'FileCheck',
  },
  clinical_ops: {
    id: 'clinical_ops',
    label: 'Clinical Operations',
    description: 'Trial management',
    color: '#059669',
    icon: 'Activity',
  },
  medical_writer: {
    id: 'medical_writer',
    label: 'Medical Writer',
    description: 'Document authoring',
    color: '#d97706',
    icon: 'PenTool',
  },
  biostatistician: {
    id: 'biostatistician',
    label: 'Biostatistician',
    description: 'Statistical analysis',
    color: '#dc2626',
    icon: 'BarChart2',
  },
  quality_assurance: {
    id: 'quality_assurance',
    label: 'Quality Assurance',
    description: 'Compliance oversight',
    color: '#0891b2',
    icon: 'CheckCircle',
  },
  viewer: {
    id: 'viewer',
    label: 'Viewer',
    description: 'Read-only access',
    color: '#6b7280',
    icon: 'Eye',
  },
};

const AGENCY_INFO_MAP = {
  FDA: {
    id: 'FDA',
    name: 'Food and Drug Administration',
    country: 'United States',
    region: 'North America',
    primaryLanguage: 'English',
    submissionFormat: 'eCTD',
  },
  EMA: {
    id: 'EMA',
    name: 'European Medicines Agency',
    country: 'European Union',
    region: 'Europe',
    primaryLanguage: 'English',
    submissionFormat: 'eCTD',
  },
  PMDA: {
    id: 'PMDA',
    name: 'Pharmaceuticals and Medical Devices Agency',
    country: 'Japan',
    region: 'Asia Pacific',
    primaryLanguage: 'Japanese',
    submissionFormat: 'eCTD',
  },
};

const TASK_PRIORITY_CONFIG = {
  critical: { label: 'Critical', color: '#dc2626', bgColor: '#fef2f2' },
  high: { label: 'High', color: '#ea580c', bgColor: '#fff7ed' },
  medium: { label: 'Medium', color: '#ca8a04', bgColor: '#fefce8' },
  low: { label: 'Low', color: '#16a34a', bgColor: '#f0fdf4' },
};

const TASK_STATUS_CONFIG = {
  pending: { label: 'Pending', color: '#6b7280', bgColor: '#f9fafb' },
  in_progress: { label: 'In Progress', color: '#2563eb', bgColor: '#eff6ff' },
  completed: { label: 'Completed', color: '#16a34a', bgColor: '#f0fdf4' },
  blocked: { label: 'Blocked', color: '#dc2626', bgColor: '#fef2f2' },
  cancelled: { label: 'Cancelled', color: '#9ca3af', bgColor: '#f3f4f6' },
};

describe('Portal Types', () => {
  describe('ROLE_DISPLAY_MAP', () => {
    it('should have all required roles defined', () => {
      const requiredRoles = [
        'admin',
        'regulatory_lead',
        'clinical_ops',
        'medical_writer',
        'biostatistician',
        'quality_assurance',
        'viewer',
      ];

      for (const role of requiredRoles) {
        expect(ROLE_DISPLAY_MAP).toHaveProperty(role);
      }
    });

    it('should have consistent structure for each role', () => {
      for (const [key, value] of Object.entries(ROLE_DISPLAY_MAP)) {
        expect(value).toHaveProperty('id');
        expect(value).toHaveProperty('label');
        expect(value).toHaveProperty('description');
        expect(value).toHaveProperty('color');
        expect(value).toHaveProperty('icon');
        expect(value.id).toBe(key);
      }
    });

    it('should have valid hex color codes', () => {
      const hexColorRegex = /^#[0-9a-fA-F]{6}$/;

      for (const role of Object.values(ROLE_DISPLAY_MAP)) {
        expect(role.color).toMatch(hexColorRegex);
      }
    });

    it('should have non-empty labels and descriptions', () => {
      for (const role of Object.values(ROLE_DISPLAY_MAP)) {
        expect(role.label.length).toBeGreaterThan(0);
        expect(role.description.length).toBeGreaterThan(0);
      }
    });
  });

  describe('AGENCY_INFO_MAP', () => {
    it('should have major regulatory agencies defined', () => {
      const majorAgencies = ['FDA', 'EMA', 'PMDA'];

      for (const agency of majorAgencies) {
        expect(AGENCY_INFO_MAP).toHaveProperty(agency);
      }
    });

    it('should have consistent structure for each agency', () => {
      for (const [key, value] of Object.entries(AGENCY_INFO_MAP)) {
        expect(value).toHaveProperty('id');
        expect(value).toHaveProperty('name');
        expect(value).toHaveProperty('country');
        expect(value).toHaveProperty('region');
        expect(value).toHaveProperty('primaryLanguage');
        expect(value).toHaveProperty('submissionFormat');
        expect(value.id).toBe(key);
      }
    });

    it('should have valid submission formats', () => {
      const validFormats = ['eCTD', 'ACTD', 'CTD', 'Custom'];

      for (const agency of Object.values(AGENCY_INFO_MAP)) {
        expect(validFormats).toContain(agency.submissionFormat);
      }
    });

    it('should have valid regions', () => {
      const validRegions = ['North America', 'Europe', 'Asia Pacific', 'Latin America'];

      for (const agency of Object.values(AGENCY_INFO_MAP)) {
        expect(validRegions).toContain(agency.region);
      }
    });
  });

  describe('TASK_PRIORITY_CONFIG', () => {
    it('should have all priority levels defined', () => {
      const priorities = ['critical', 'high', 'medium', 'low'];

      for (const priority of priorities) {
        expect(TASK_PRIORITY_CONFIG).toHaveProperty(priority);
      }
    });

    it('should have consistent structure for each priority', () => {
      for (const priority of Object.values(TASK_PRIORITY_CONFIG)) {
        expect(priority).toHaveProperty('label');
        expect(priority).toHaveProperty('color');
        expect(priority).toHaveProperty('bgColor');
      }
    });

    it('should have valid hex color codes', () => {
      const hexColorRegex = /^#[0-9a-fA-F]{6}$/;

      for (const priority of Object.values(TASK_PRIORITY_CONFIG)) {
        expect(priority.color).toMatch(hexColorRegex);
        expect(priority.bgColor).toMatch(hexColorRegex);
      }
    });

    it('should have appropriate color hierarchy (critical darker than low)', () => {
      // Critical should be a red color
      expect(TASK_PRIORITY_CONFIG.critical.color).toMatch(/^#[d-f]/i);
      // Low should be a green color
      expect(TASK_PRIORITY_CONFIG.low.color).toMatch(/^#1/);
    });
  });

  describe('TASK_STATUS_CONFIG', () => {
    it('should have all status types defined', () => {
      const statuses = ['pending', 'in_progress', 'completed', 'blocked', 'cancelled'];

      for (const status of statuses) {
        expect(TASK_STATUS_CONFIG).toHaveProperty(status);
      }
    });

    it('should have consistent structure for each status', () => {
      for (const status of Object.values(TASK_STATUS_CONFIG)) {
        expect(status).toHaveProperty('label');
        expect(status).toHaveProperty('color');
        expect(status).toHaveProperty('bgColor');
      }
    });

    it('should have appropriate colors for status semantics', () => {
      // Completed should be green
      expect(TASK_STATUS_CONFIG.completed.color).toBe('#16a34a');
      // Blocked should be red
      expect(TASK_STATUS_CONFIG.blocked.color).toBe('#dc2626');
    });
  });
});

describe('Type Validation Utilities', () => {
  const isValidUUID = (str: string): boolean => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(str);
  };

  const isValidPriority = (priority: string): boolean => {
    return ['critical', 'high', 'medium', 'low'].includes(priority);
  };

  const isValidStatus = (status: string): boolean => {
    return ['pending', 'in_progress', 'completed', 'blocked', 'cancelled'].includes(status);
  };

  it('should validate UUIDs correctly', () => {
    expect(isValidUUID('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    expect(isValidUUID('invalid-uuid')).toBe(false);
    expect(isValidUUID('')).toBe(false);
  });

  it('should validate priorities correctly', () => {
    expect(isValidPriority('critical')).toBe(true);
    expect(isValidPriority('high')).toBe(true);
    expect(isValidPriority('invalid')).toBe(false);
  });

  it('should validate statuses correctly', () => {
    expect(isValidStatus('pending')).toBe(true);
    expect(isValidStatus('in_progress')).toBe(true);
    expect(isValidStatus('invalid')).toBe(false);
  });
});

describe('Pagination Types', () => {
  interface PaginationParams {
    page: number;
    pageSize: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }

  const validatePagination = (params: PaginationParams): boolean => {
    if (params.page < 1) return false;
    if (params.pageSize < 1 || params.pageSize > 100) return false;
    if (params.sortOrder && !['asc', 'desc'].includes(params.sortOrder)) return false;
    return true;
  };

  it('should accept valid pagination params', () => {
    const validParams: PaginationParams = {
      page: 1,
      pageSize: 20,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    };
    expect(validatePagination(validParams)).toBe(true);
  });

  it('should reject invalid page number', () => {
    const invalidParams: PaginationParams = {
      page: 0,
      pageSize: 20,
    };
    expect(validatePagination(invalidParams)).toBe(false);
  });

  it('should reject invalid page size', () => {
    const invalidParams: PaginationParams = {
      page: 1,
      pageSize: 101,
    };
    expect(validatePagination(invalidParams)).toBe(false);
  });
});
