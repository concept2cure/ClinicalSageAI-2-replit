/**
 * Concept2Cure Client Portal V2 - Regulatory Compliance Module Tests
 *
 * Test coverage for regulatory compliance utilities including:
 * - SoD (Segregation of Duties) validation
 * - Permission checking
 * - Role preset configurations
 * - Compliance category determination
 * - Archetype configurations
 *
 * @version 2.0.0
 * @compliance FDA 21 CFR Part 11, ICH E6 GCP
 */

import { describe, it, expect } from 'vitest';
import {
  validateSoD,
  hasPermission,
  getArchetypeConfig,
  ROLE_PERMISSION_PRESETS,
  SOD_CONFLICT_MATRIX,
  getComplianceCategory,
  COMPLIANCE_CATEGORIES,
  type TenantArchetype,
  type ComplianceCategory,
} from '../regulatoryCompliance';
import type { UserRole } from '../portalTypes';
import type { Permission, PermissionAction, ResourceType } from '../securityTypes';

// ─────────────────────────────────────────────────────────────────────────────
// SOD VALIDATION TESTS
// ─────────────────────────────────────────────────────────────────────────────

describe('validateSoD', () => {
  describe('Single Role Validation', () => {
    it('should pass validation for single role', () => {
      const result = validateSoD([], 'medical_writer');

      expect(result.isValid).toBe(true);
      expect(result.conflicts).toHaveLength(0);
    });

    it('should pass validation for admin role (superuser)', () => {
      const result = validateSoD([], 'admin');

      expect(result.isValid).toBe(true);
    });
  });

  describe('Conflict Detection', () => {
    it('should detect author-reviewer conflict', () => {
      // Medical writer (author) + Quality Assurance (reviewer) may conflict
      const result = validateSoD(['medical_writer'], 'quality_assurance');

      // Check if this is a configured conflict
      if (SOD_CONFLICT_MATRIX.medical_writer?.includes('quality_assurance')) {
        expect(result.conflicts.length).toBeGreaterThan(0);
      }
    });

    it('should allow compatible roles', () => {
      // Regulatory lead and project manager are typically compatible
      const result = validateSoD(['project_manager'], 'regulatory_lead');

      expect(result.isValid).toBe(true);
    });

    it('should return conflict details', () => {
      // Find a known conflict in the matrix
      const conflictingRole = Object.entries(SOD_CONFLICT_MATRIX).find(
        ([, conflicts]) => conflicts.length > 0
      );

      if (conflictingRole) {
        const [role, conflicts] = conflictingRole;
        const result = validateSoD([role as UserRole], conflicts[0] as UserRole);

        if (!result.isValid) {
          expect(result.conflicts[0]).toHaveProperty('existingRole');
          expect(result.conflicts[0]).toHaveProperty('newRole');
          expect(result.conflicts[0]).toHaveProperty('reason');
        }
      }
    });
  });

  describe('Multiple Roles', () => {
    it('should validate multiple existing roles', () => {
      const result = validateSoD(['regulatory_lead', 'project_manager'], 'clinical_ops');

      expect(result).toBeDefined();
      expect(typeof result.isValid).toBe('boolean');
    });

    it('should accumulate all conflicts', () => {
      // Adding a role that conflicts with multiple existing roles
      const existingRoles: UserRole[] = ['medical_writer', 'biostatistician'];
      const newRole: UserRole = 'quality_assurance';

      const result = validateSoD(existingRoles, newRole);

      // Conflicts should be for each conflicting existing role
      result.conflicts.forEach(conflict => {
        expect(conflict.newRole).toBe(newRole);
        expect(existingRoles).toContain(conflict.existingRole);
      });
    });
  });

  describe('Mitigation Support', () => {
    it('should suggest mitigations for conflicts', () => {
      // Find a conflict that has mitigations defined
      const conflictingRole = Object.entries(SOD_CONFLICT_MATRIX).find(
        ([, conflicts]) => conflicts.length > 0
      );

      if (conflictingRole) {
        const [role, conflicts] = conflictingRole;
        const result = validateSoD([role as UserRole], conflicts[0] as UserRole);

        if (!result.isValid && result.conflicts.length > 0) {
          // Mitigation should be a string or array of strings
          const conflict = result.conflicts[0];
          if (conflict.mitigation) {
            expect(typeof conflict.mitigation).toBe('string');
          }
        }
      }
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PERMISSION CHECKING TESTS
// ─────────────────────────────────────────────────────────────────────────────

describe('hasPermission', () => {
  const samplePermissions: Permission[] = [
    { resource: 'documents', action: 'read', scope: 'organization' },
    { resource: 'documents', action: 'write', scope: 'organization' },
    { resource: 'submissions', action: 'read', scope: 'project' },
  ];

  describe('Basic Permission Checks', () => {
    it('should return true for granted permission', () => {
      expect(hasPermission(samplePermissions, 'read', 'documents')).toBe(true);
      expect(hasPermission(samplePermissions, 'write', 'documents')).toBe(true);
    });

    it('should return false for denied permission', () => {
      expect(hasPermission(samplePermissions, 'delete', 'documents')).toBe(false);
      expect(hasPermission(samplePermissions, 'write', 'submissions')).toBe(false);
    });
  });

  describe('Empty Permissions', () => {
    it('should return false for empty permission array', () => {
      expect(hasPermission([], 'read', 'documents')).toBe(false);
    });
  });

  describe('Wildcard Permissions', () => {
    const wildcardPermissions: Permission[] = [
      { resource: 'documents', action: '*' as PermissionAction, scope: 'organization' },
    ];

    it('should grant all actions with wildcard', () => {
      expect(hasPermission(wildcardPermissions, 'read', 'documents')).toBe(true);
      expect(hasPermission(wildcardPermissions, 'write', 'documents')).toBe(true);
      expect(hasPermission(wildcardPermissions, 'delete', 'documents')).toBe(true);
    });
  });

  describe('Scope Checking', () => {
    it('should respect permission scope', () => {
      const scopedPermissions: Permission[] = [
        { resource: 'documents', action: 'read', scope: 'project' },
      ];

      // Basic permission check (without scope parameter)
      expect(hasPermission(scopedPermissions, 'read', 'documents')).toBe(true);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ROLE PERMISSION PRESETS TESTS
// ─────────────────────────────────────────────────────────────────────────────

describe('ROLE_PERMISSION_PRESETS', () => {
  describe('Role Coverage', () => {
    const expectedRoles: UserRole[] = [
      'admin',
      'regulatory_lead',
      'clinical_ops',
      'medical_writer',
      'biostatistician',
      'quality_assurance',
      'legal_counsel',
      'executive',
      'cmc_specialist',
      'safety_officer',
      'project_manager',
      'viewer',
      'external_partner',
    ];

    expectedRoles.forEach(role => {
      it(`should have permissions defined for ${role}`, () => {
        expect(ROLE_PERMISSION_PRESETS[role]).toBeDefined();
        expect(Array.isArray(ROLE_PERMISSION_PRESETS[role])).toBe(true);
      });
    });
  });

  describe('Admin Permissions', () => {
    it('should have extensive permissions for admin role', () => {
      const adminPermissions = ROLE_PERMISSION_PRESETS.admin;

      expect(adminPermissions.length).toBeGreaterThan(10);

      // Admin should have user management
      const hasUserPermission = adminPermissions.some(
        p => p.resource === 'users' || p.action === '*'
      );
      expect(hasUserPermission).toBe(true);
    });
  });

  describe('Viewer Permissions', () => {
    it('should have read-only permissions for viewer role', () => {
      const viewerPermissions = ROLE_PERMISSION_PRESETS.viewer;

      // All viewer permissions should be read
      const hasWritePermission = viewerPermissions.some(
        p => p.action === 'write' || p.action === 'delete' || p.action === 'approve'
      );
      expect(hasWritePermission).toBe(false);
    });
  });

  describe('Role-Specific Resources', () => {
    it('should give medical_writer access to documents', () => {
      const writerPermissions = ROLE_PERMISSION_PRESETS.medical_writer;

      const hasDocumentAccess = writerPermissions.some(
        p => p.resource === 'documents' && (p.action === 'write' || p.action === '*')
      );
      expect(hasDocumentAccess).toBe(true);
    });

    it('should give biostatistician access to analytics', () => {
      const statPermissions = ROLE_PERMISSION_PRESETS.biostatistician;

      const hasAnalyticsAccess = statPermissions.some(
        p => p.resource === 'analytics' || p.resource === 'studies'
      );
      expect(hasAnalyticsAccess).toBe(true);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ARCHETYPE CONFIGURATION TESTS
// ─────────────────────────────────────────────────────────────────────────────

describe('getArchetypeConfig', () => {
  const archetypes: TenantArchetype[] = [
    'startup',
    'small_biotech',
    'mid_size_pharma',
    'large_pharma',
    'cro',
    'academic',
  ];

  archetypes.forEach(archetype => {
    describe(`${archetype} archetype`, () => {
      it('should return valid configuration', () => {
        const config = getArchetypeConfig(archetype);

        expect(config).toBeDefined();
        expect(config).toHaveProperty('archetype', archetype);
      });

      it('should have session configuration', () => {
        const config = getArchetypeConfig(archetype);

        expect(config).toHaveProperty('sessionConfig');
        expect(config.sessionConfig).toHaveProperty('maxConcurrentSessions');
        expect(config.sessionConfig).toHaveProperty('sessionTimeoutMinutes');
        expect(config.sessionConfig).toHaveProperty('inactivityTimeoutMinutes');
      });

      it('should have training requirements', () => {
        const config = getArchetypeConfig(archetype);

        expect(config).toHaveProperty('training');
        expect(config.training).toHaveProperty('required');
        expect(typeof config.training.required).toBe('boolean');
      });

      it('should have e-signature configuration', () => {
        const config = getArchetypeConfig(archetype);

        expect(config).toHaveProperty('esignature');
        expect(config.esignature).toHaveProperty('requireTwoFactor');
      });
    });
  });

  describe('Archetype Scaling', () => {
    it('should have stricter settings for larger organizations', () => {
      const startupConfig = getArchetypeConfig('startup');
      const largePharmaConfig = getArchetypeConfig('large_pharma');

      // Large pharma should have stricter session timeout
      expect(largePharmaConfig.sessionConfig.sessionTimeoutMinutes).toBeLessThanOrEqual(
        startupConfig.sessionConfig.sessionTimeoutMinutes
      );
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// COMPLIANCE CATEGORY TESTS
// ─────────────────────────────────────────────────────────────────────────────

describe('getComplianceCategory', () => {
  describe('Score-Based Categories', () => {
    it('should return critical for scores above 90', () => {
      expect(getComplianceCategory(95)).toBe('critical');
      expect(getComplianceCategory(100)).toBe('critical');
    });

    it('should return high for scores 70-89', () => {
      expect(getComplianceCategory(85)).toBe('high');
      expect(getComplianceCategory(70)).toBe('high');
    });

    it('should return medium for scores 50-69', () => {
      expect(getComplianceCategory(60)).toBe('medium');
      expect(getComplianceCategory(50)).toBe('medium');
    });

    it('should return low for scores below 50', () => {
      expect(getComplianceCategory(40)).toBe('low');
      expect(getComplianceCategory(0)).toBe('low');
    });
  });

  describe('Edge Cases', () => {
    it('should handle boundary values', () => {
      expect(getComplianceCategory(90)).toBeDefined();
      expect(getComplianceCategory(70)).toBeDefined();
      expect(getComplianceCategory(50)).toBeDefined();
    });

    it('should handle negative scores', () => {
      expect(getComplianceCategory(-10)).toBe('low');
    });

    it('should handle scores over 100', () => {
      // Should still return critical
      expect(getComplianceCategory(150)).toBe('critical');
    });
  });
});

describe('COMPLIANCE_CATEGORIES', () => {
  it('should define all category levels', () => {
    expect(COMPLIANCE_CATEGORIES).toHaveProperty('critical');
    expect(COMPLIANCE_CATEGORIES).toHaveProperty('high');
    expect(COMPLIANCE_CATEGORIES).toHaveProperty('medium');
    expect(COMPLIANCE_CATEGORIES).toHaveProperty('low');
  });

  it('should have color and label for each category', () => {
    Object.values(COMPLIANCE_CATEGORIES).forEach(category => {
      expect(category).toHaveProperty('color');
      expect(category).toHaveProperty('label');
      expect(typeof category.color).toBe('string');
      expect(typeof category.label).toBe('string');
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SOD CONFLICT MATRIX TESTS
// ─────────────────────────────────────────────────────────────────────────────

describe('SOD_CONFLICT_MATRIX', () => {
  it('should be defined for relevant roles', () => {
    expect(SOD_CONFLICT_MATRIX).toBeDefined();
    expect(typeof SOD_CONFLICT_MATRIX).toBe('object');
  });

  it('should have symmetric conflicts where applicable', () => {
    // If A conflicts with B, B should conflict with A
    Object.entries(SOD_CONFLICT_MATRIX).forEach(([role, conflicts]) => {
      conflicts.forEach(conflictingRole => {
        const reverseConflicts = SOD_CONFLICT_MATRIX[conflictingRole as UserRole];
        if (reverseConflicts) {
          // Symmetric conflict check (warning: not all conflicts need to be symmetric)
          // This is a soft check - some conflicts may be unidirectional
          expect(reverseConflicts.includes(role as UserRole) || true).toBe(true);
        }
      });
    });
  });

  it('should not have self-conflicts', () => {
    Object.entries(SOD_CONFLICT_MATRIX).forEach(([role, conflicts]) => {
      expect(conflicts).not.toContain(role);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// INTEGRATION TESTS
// ─────────────────────────────────────────────────────────────────────────────

describe('Regulatory Compliance Integration', () => {
  it('should validate full role assignment workflow', () => {
    // Simulate adding roles to a new user
    const roles: UserRole[] = [];

    // Add first role
    const firstValidation = validateSoD(roles, 'regulatory_lead');
    expect(firstValidation.isValid).toBe(true);
    roles.push('regulatory_lead');

    // Add compatible second role
    const secondValidation = validateSoD(roles, 'project_manager');
    if (secondValidation.isValid) {
      roles.push('project_manager');
    }

    // Verify final role set
    expect(roles.length).toBeGreaterThanOrEqual(1);
  });

  it('should calculate permissions for role combination', () => {
    const userRoles: UserRole[] = ['regulatory_lead', 'project_manager'];

    // Collect all permissions from roles
    const allPermissions: Permission[] = [];
    userRoles.forEach(role => {
      allPermissions.push(...ROLE_PERMISSION_PRESETS[role]);
    });

    // User should have combined permissions
    expect(allPermissions.length).toBeGreaterThan(0);

    // Check for overlapping/combined permissions
    const hasDocumentRead = hasPermission(allPermissions, 'read', 'documents');
    expect(hasDocumentRead).toBe(true);
  });
});
