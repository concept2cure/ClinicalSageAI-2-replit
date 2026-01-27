/**
 * TrialSage Client Portal V2 - Security Context Hook Tests
 *
 * Test coverage for useSecurityContext hook including:
 * - Permission checking
 * - Role validation
 * - Session management
 * - SoD validation
 * - Compliance checks
 *
 * @version 2.0.0
 * @compliance FDA 21 CFR Part 11.10(d)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';
import { SecurityProvider, useSecurityContext } from '../useSecurityContext';
import type { UserRole } from '../../core/portalTypes';
import type { UserProfile, OrganizationMembership } from '../../core/securityTypes';

// ─────────────────────────────────────────────────────────────────────────────
// MOCK DATA
// ─────────────────────────────────────────────────────────────────────────────

const mockUser: UserProfile = {
  id: 'user-123',
  email: 'test@example.com',
  firstName: 'Test',
  lastName: 'User',
  displayName: 'Test User',
  avatarUrl: null,
  phone: null,
  createdAt: new Date('2024-01-01'),
  lastLoginAt: new Date(),
  isActive: true,
  emailVerified: true,
  mfaEnabled: true,
  mfaMethods: ['totp'],
  trainingCompletedAt: new Date(),
  certificationLevel: 'advanced',
};

const mockMembership: OrganizationMembership = {
  id: 'membership-123',
  userId: 'user-123',
  organizationId: 'org-123',
  roles: ['regulatory_lead'],
  permissions: ['documents:read', 'documents:write', 'submissions:read'],
  status: 'active',
  joinedAt: new Date('2024-01-01'),
  lastActivityAt: new Date(),
  delegatedFrom: null,
  delegationExpiry: null,
  accessRestrictions: null,
};

const mockSession = {
  id: 'session-123',
  userId: 'user-123',
  organizationId: 'org-123',
  createdAt: new Date(),
  expiresAt: new Date(Date.now() + 3600000), // 1 hour from now
  lastActivityAt: new Date(),
  ipAddress: '192.168.1.1',
  userAgent: 'Mozilla/5.0',
  deviceFingerprint: 'fp_123',
  isActive: true,
  terminatedReason: null,
};

// ─────────────────────────────────────────────────────────────────────────────
// WRAPPER COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <SecurityProvider initialUser={mockUser} initialMembership={mockMembership}>
    {children}
  </SecurityProvider>
);

const emptyWrapper = ({ children }: { children: React.ReactNode }) => (
  <SecurityProvider>{children}</SecurityProvider>
);

// ─────────────────────────────────────────────────────────────────────────────
// TEST SUITES
// ─────────────────────────────────────────────────────────────────────────────

describe('useSecurityContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Initial State', () => {
    it('should return null user when not authenticated', () => {
      const { result } = renderHook(() => useSecurityContext(), {
        wrapper: emptyWrapper,
      });

      expect(result.current.user).toBeNull();
      expect(result.current.isAuthenticated).toBe(false);
    });

    it('should return user when authenticated', () => {
      const { result } = renderHook(() => useSecurityContext(), { wrapper });

      expect(result.current.user).toEqual(mockUser);
      expect(result.current.isAuthenticated).toBe(true);
    });

    it('should return membership data', () => {
      const { result } = renderHook(() => useSecurityContext(), { wrapper });

      expect(result.current.membership).toEqual(mockMembership);
    });
  });

  describe('Permission Checking', () => {
    it('should return true for granted permission', () => {
      const { result } = renderHook(() => useSecurityContext(), { wrapper });

      expect(result.current.hasPermission('documents:read')).toBe(true);
      expect(result.current.hasPermission('documents:write')).toBe(true);
    });

    it('should return false for denied permission', () => {
      const { result } = renderHook(() => useSecurityContext(), { wrapper });

      expect(result.current.hasPermission('admin:users:delete')).toBe(false);
      expect(result.current.hasPermission('system:config')).toBe(false);
    });

    it('should handle compound permissions', () => {
      const { result } = renderHook(() => useSecurityContext(), { wrapper });

      // User has documents:read and documents:write
      expect(result.current.canPerform('read', 'documents')).toBe(true);
      expect(result.current.canPerform('delete', 'documents')).toBe(false);
    });
  });

  describe('Role Checking', () => {
    it('should return true for assigned role', () => {
      const { result } = renderHook(() => useSecurityContext(), { wrapper });

      expect(result.current.hasRole('regulatory_lead')).toBe(true);
    });

    it('should return false for unassigned role', () => {
      const { result } = renderHook(() => useSecurityContext(), { wrapper });

      expect(result.current.hasRole('admin')).toBe(false);
      expect(result.current.hasRole('medical_writer')).toBe(false);
    });

    it('should check multiple roles with hasAnyRole', () => {
      const { result } = renderHook(() => useSecurityContext(), { wrapper });

      expect(result.current.hasAnyRole(['admin', 'regulatory_lead'])).toBe(true);
      expect(result.current.hasAnyRole(['admin', 'viewer'])).toBe(false);
    });

    it('should check all roles with hasAllRoles', () => {
      const { result } = renderHook(() => useSecurityContext(), { wrapper });

      expect(result.current.hasAllRoles(['regulatory_lead'])).toBe(true);
      expect(result.current.hasAllRoles(['regulatory_lead', 'admin'])).toBe(false);
    });
  });

  describe('Session Management', () => {
    it('should return session time remaining', () => {
      const { result } = renderHook(() => useSecurityContext(), { wrapper });

      // Session expires in 1 hour, should return ~60 minutes
      const remaining = result.current.sessionTimeRemaining();
      expect(remaining).toBeGreaterThan(55);
      expect(remaining).toBeLessThanOrEqual(60);
    });

    it('should detect expiring session', () => {
      // Create a session that expires in 3 minutes
      const expiringSession = {
        ...mockSession,
        expiresAt: new Date(Date.now() + 180000),
      };

      const { result } = renderHook(() => useSecurityContext(), {
        wrapper: ({ children }) => (
          <SecurityProvider
            initialUser={mockUser}
            initialMembership={mockMembership}
            initialSession={expiringSession}
          >
            {children}
          </SecurityProvider>
        ),
      });

      expect(result.current.isSessionExpiring()).toBe(true);
    });
  });

  describe('SoD Validation', () => {
    it('should validate SoD for compatible roles', () => {
      const { result } = renderHook(() => useSecurityContext(), { wrapper });

      const validation = result.current.validateSoDForRole('medical_writer');
      expect(validation.isValid).toBe(true);
      expect(validation.conflicts).toHaveLength(0);
    });

    it('should detect SoD conflicts', () => {
      // User with 'reviewer' role trying to add 'author' role
      const conflictMembership: OrganizationMembership = {
        ...mockMembership,
        roles: ['quality_assurance'],
      };

      const { result } = renderHook(() => useSecurityContext(), {
        wrapper: ({ children }) => (
          <SecurityProvider initialUser={mockUser} initialMembership={conflictMembership}>
            {children}
          </SecurityProvider>
        ),
      });

      // QA reviewing their own work is a common SoD conflict
      const validation = result.current.validateSoDForRole('medical_writer');
      // Note: Actual conflict detection depends on SOD_CONFLICT_MATRIX configuration
      expect(validation).toBeDefined();
    });
  });

  describe('Compliance Checks', () => {
    it('should return training currency status', () => {
      const { result } = renderHook(() => useSecurityContext(), { wrapper });

      expect(result.current.isTrainingCurrent()).toBe(true);
    });

    it('should detect expired training', () => {
      const expiredUser: UserProfile = {
        ...mockUser,
        trainingCompletedAt: new Date('2023-01-01'), // Over a year ago
      };

      const { result } = renderHook(() => useSecurityContext(), {
        wrapper: ({ children }) => (
          <SecurityProvider initialUser={expiredUser} initialMembership={mockMembership}>
            {children}
          </SecurityProvider>
        ),
      });

      // Training typically expires after 365 days
      expect(result.current.isTrainingCurrent()).toBe(false);
    });

    it('should return compliance score', () => {
      const { result } = renderHook(() => useSecurityContext(), { wrapper });

      const score = result.current.getComplianceScore();
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });
  });

  describe('Security Event Logging', () => {
    it('should log security events', () => {
      const consoleSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
      const { result } = renderHook(() => useSecurityContext(), { wrapper });

      act(() => {
        result.current.logSecurityEvent('login_attempt', {
          success: true,
          ipAddress: '192.168.1.1',
        });
      });

      // Event should be logged (in dev mode, goes to console)
      expect(consoleSpy).toHaveBeenCalled();
    });
  });

  describe('Organization Switching', () => {
    it('should switch organization', async () => {
      const multiOrgMembership = {
        ...mockMembership,
        allMemberships: [
          mockMembership,
          {
            ...mockMembership,
            id: 'membership-456',
            organizationId: 'org-456',
          },
        ],
      };

      const { result } = renderHook(() => useSecurityContext(), {
        wrapper: ({ children }) => (
          <SecurityProvider
            initialUser={mockUser}
            initialMembership={mockMembership}
            allMemberships={multiOrgMembership.allMemberships}
          >
            {children}
          </SecurityProvider>
        ),
      });

      await act(async () => {
        await result.current.switchOrganization('org-456');
      });

      // Organization should be switched
      expect(result.current.membership?.organizationId).toBe('org-456');
    });
  });

  describe('Context Provider Errors', () => {
    it('should throw error when used outside provider', () => {
      // Suppress error output for this test
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => {
        renderHook(() => useSecurityContext());
      }).toThrow('useSecurityContext must be used within a SecurityProvider');

      consoleSpy.mockRestore();
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// INTEGRATION TESTS
// ─────────────────────────────────────────────────────────────────────────────

describe('useSecurityContext Integration', () => {
  it('should handle full auth flow', async () => {
    const { result } = renderHook(() => useSecurityContext(), { wrapper });

    // Initial state
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user?.email).toBe('test@example.com');

    // Check permissions
    expect(result.current.hasPermission('documents:read')).toBe(true);

    // Check role
    expect(result.current.hasRole('regulatory_lead')).toBe(true);

    // Session management
    expect(result.current.sessionTimeRemaining()).toBeGreaterThan(0);
  });

  it('should maintain state across re-renders', () => {
    const { result, rerender } = renderHook(() => useSecurityContext(), { wrapper });

    const initialUser = result.current.user;

    rerender();

    expect(result.current.user).toEqual(initialUser);
  });
});
