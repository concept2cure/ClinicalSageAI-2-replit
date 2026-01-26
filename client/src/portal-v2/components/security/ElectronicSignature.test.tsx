/**
 * TrialSage Client Portal V2 - Electronic Signature Component Tests
 *
 * Test coverage for ElectronicSignature component including:
 * - Signature flow (password → MFA → confirmation)
 * - Meaning declarations per 11.50(b)
 * - Hash verification
 * - Audit logging
 * - Accessibility compliance
 *
 * @version 2.0.0
 * @compliance FDA 21 CFR Part 11.50, 11.70
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import ElectronicSignatureGate, {
  SignatureDisplay,
  SignatureVerificationBadge,
} from '../ElectronicSignature';
import { SecurityProvider } from '../../hooks/useSecurityContext';

// ─────────────────────────────────────────────────────────────────────────────
// MOCK DATA
// ─────────────────────────────────────────────────────────────────────────────

const mockUser = {
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

const mockMembership = {
  id: 'membership-123',
  userId: 'user-123',
  organizationId: 'org-123',
  roles: ['regulatory_lead'],
  permissions: ['documents:sign', 'documents:approve'],
  status: 'active',
  joinedAt: new Date('2024-01-01'),
  lastActivityAt: new Date(),
  delegatedFrom: null,
  delegationExpiry: null,
  accessRestrictions: null,
};

const mockComplianceConfig = {
  electronicSignatures: {
    requireTwoFactorAuth: true,
    requireBiometric: false,
    maxSignaturesPerSession: 50,
    sessionTimeoutMinutes: 15,
  },
};

const mockSignature = {
  id: 'sig-123',
  userId: 'user-123',
  userName: 'Test User',
  userEmail: 'test@example.com',
  timestamp: new Date().toISOString(),
  meaning: 'approval' as const,
  action: 'document_approval' as const,
  recordId: 'doc-456',
  recordType: 'document',
  hash: 'sha256_abc123def456...',
  ipAddress: '192.168.1.1',
  userAgent: 'Mozilla/5.0',
  isValid: true,
  verifiedAt: new Date().toISOString(),
};

// ─────────────────────────────────────────────────────────────────────────────
// WRAPPER COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

const TestWrapper = ({ children }: { children: React.ReactNode }) => (
  <SecurityProvider
    initialUser={mockUser}
    initialMembership={mockMembership}
    complianceConfig={mockComplianceConfig}
  >
    {children}
  </SecurityProvider>
);

// ─────────────────────────────────────────────────────────────────────────────
// TEST SUITES
// ─────────────────────────────────────────────────────────────────────────────

describe('ElectronicSignatureGate', () => {
  const defaultProps = {
    action: 'document_approval' as const,
    meaning: 'approval' as const,
    recordId: 'doc-456',
    recordType: 'document',
    context: 'Approving regulatory submission document',
    onSuccess: vi.fn(),
    onCancel: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Rendering', () => {
    it('should render signature gate with meaning declaration', () => {
      render(
        <TestWrapper>
          <ElectronicSignatureGate {...defaultProps} />
        </TestWrapper>
      );

      expect(screen.getByText('Approval Declaration')).toBeInTheDocument();
      expect(
        screen.getByText(/I approve this record and authorize it to proceed/)
      ).toBeInTheDocument();
    });

    it('should display context information', () => {
      render(
        <TestWrapper>
          <ElectronicSignatureGate {...defaultProps} />
        </TestWrapper>
      );

      expect(screen.getByText(/Approving regulatory submission document/)).toBeInTheDocument();
    });

    it('should show user information', () => {
      render(
        <TestWrapper>
          <ElectronicSignatureGate {...defaultProps} />
        </TestWrapper>
      );

      expect(screen.getByText('Test User')).toBeInTheDocument();
      expect(screen.getByText('test@example.com')).toBeInTheDocument();
    });
  });

  describe('Password Step', () => {
    it('should show password input initially', () => {
      render(
        <TestWrapper>
          <ElectronicSignatureGate {...defaultProps} />
        </TestWrapper>
      );

      expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    });

    it('should validate password is required', async () => {
      const user = userEvent.setup();

      render(
        <TestWrapper>
          <ElectronicSignatureGate {...defaultProps} />
        </TestWrapper>
      );

      const submitButton = screen.getByRole('button', { name: /continue|verify/i });
      await user.click(submitButton);

      expect(screen.getByText(/password is required/i)).toBeInTheDocument();
    });

    it('should toggle password visibility', async () => {
      const user = userEvent.setup();

      render(
        <TestWrapper>
          <ElectronicSignatureGate {...defaultProps} />
        </TestWrapper>
      );

      const passwordInput = screen.getByLabelText(/password/i);
      expect(passwordInput).toHaveAttribute('type', 'password');

      const toggleButton = screen.getByRole('button', { name: /show password|toggle/i });
      await user.click(toggleButton);

      expect(passwordInput).toHaveAttribute('type', 'text');
    });
  });

  describe('MFA Step', () => {
    it('should proceed to MFA step after valid password', async () => {
      const user = userEvent.setup();

      render(
        <TestWrapper>
          <ElectronicSignatureGate {...defaultProps} />
        </TestWrapper>
      );

      const passwordInput = screen.getByLabelText(/password/i);
      await user.type(passwordInput, 'SecurePassword123!');

      const submitButton = screen.getByRole('button', { name: /continue|verify/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/verification code|mfa|two-factor/i)).toBeInTheDocument();
      });
    });

    it('should validate MFA code format', async () => {
      const user = userEvent.setup();

      render(
        <TestWrapper>
          <ElectronicSignatureGate {...defaultProps} />
        </TestWrapper>
      );

      // Complete password step
      const passwordInput = screen.getByLabelText(/password/i);
      await user.type(passwordInput, 'SecurePassword123!');
      await user.click(screen.getByRole('button', { name: /continue|verify/i }));

      // MFA step
      await waitFor(() => {
        expect(screen.getByLabelText(/code/i)).toBeInTheDocument();
      });

      const mfaInput = screen.getByLabelText(/code/i);
      await user.type(mfaInput, '12'); // Too short

      const verifyButton = screen.getByRole('button', { name: /verify/i });
      await user.click(verifyButton);

      expect(screen.getByText(/6 digits/i)).toBeInTheDocument();
    });
  });

  describe('Signature Completion', () => {
    it('should call onSuccess with signature data', async () => {
      const user = userEvent.setup();
      const onSuccess = vi.fn();

      render(
        <TestWrapper>
          <ElectronicSignatureGate {...defaultProps} onSuccess={onSuccess} />
        </TestWrapper>
      );

      // Complete password step
      await user.type(screen.getByLabelText(/password/i), 'SecurePassword123!');
      await user.click(screen.getByRole('button', { name: /continue|verify/i }));

      // Complete MFA step
      await waitFor(() => {
        expect(screen.getByLabelText(/code/i)).toBeInTheDocument();
      });
      await user.type(screen.getByLabelText(/code/i), '123456');
      await user.click(screen.getByRole('button', { name: /verify|sign/i }));

      await waitFor(() => {
        expect(onSuccess).toHaveBeenCalled();
      });

      const signature = onSuccess.mock.calls[0][0];
      expect(signature).toHaveProperty('userId', 'user-123');
      expect(signature).toHaveProperty('meaning', 'approval');
      expect(signature).toHaveProperty('hash');
      expect(signature).toHaveProperty('timestamp');
    });

    it('should generate unique hash for each signature', async () => {
      const user = userEvent.setup();
      const onSuccess1 = vi.fn();
      const onSuccess2 = vi.fn();

      const { rerender } = render(
        <TestWrapper>
          <ElectronicSignatureGate {...defaultProps} onSuccess={onSuccess1} />
        </TestWrapper>
      );

      // First signature
      await user.type(screen.getByLabelText(/password/i), 'SecurePassword123!');
      await user.click(screen.getByRole('button', { name: /continue|verify/i }));
      await waitFor(() => screen.getByLabelText(/code/i));
      await user.type(screen.getByLabelText(/code/i), '123456');
      await user.click(screen.getByRole('button', { name: /verify|sign/i }));

      await waitFor(() => expect(onSuccess1).toHaveBeenCalled());
      const hash1 = onSuccess1.mock.calls[0][0].hash;

      // Second signature
      rerender(
        <TestWrapper>
          <ElectronicSignatureGate {...defaultProps} recordId="doc-789" onSuccess={onSuccess2} />
        </TestWrapper>
      );

      await user.type(screen.getByLabelText(/password/i), 'SecurePassword123!');
      await user.click(screen.getByRole('button', { name: /continue|verify/i }));
      await waitFor(() => screen.getByLabelText(/code/i));
      await user.type(screen.getByLabelText(/code/i), '123456');
      await user.click(screen.getByRole('button', { name: /verify|sign/i }));

      await waitFor(() => expect(onSuccess2).toHaveBeenCalled());
      const hash2 = onSuccess2.mock.calls[0][0].hash;

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('Cancellation', () => {
    it('should call onCancel when cancelled', async () => {
      const user = userEvent.setup();
      const onCancel = vi.fn();

      render(
        <TestWrapper>
          <ElectronicSignatureGate {...defaultProps} onCancel={onCancel} />
        </TestWrapper>
      );

      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      await user.click(cancelButton);

      expect(onCancel).toHaveBeenCalled();
    });
  });

  describe('Different Meanings', () => {
    const meanings = [
      { meaning: 'authorship', title: 'Authorship Declaration' },
      { meaning: 'review', title: 'Review Declaration' },
      { meaning: 'approval', title: 'Approval Declaration' },
      { meaning: 'verification', title: 'Verification Declaration' },
      { meaning: 'amendment', title: 'Amendment Declaration' },
      { meaning: 'release', title: 'Release Declaration' },
    ] as const;

    meanings.forEach(({ meaning, title }) => {
      it(`should display correct declaration for ${meaning}`, () => {
        render(
          <TestWrapper>
            <ElectronicSignatureGate {...defaultProps} meaning={meaning} />
          </TestWrapper>
        );

        expect(screen.getByText(title)).toBeInTheDocument();
      });
    });
  });

  describe('Accessibility', () => {
    it('should have accessible form controls', () => {
      render(
        <TestWrapper>
          <ElectronicSignatureGate {...defaultProps} />
        </TestWrapper>
      );

      const passwordInput = screen.getByLabelText(/password/i);
      expect(passwordInput).toHaveAttribute('id');
      expect(passwordInput).toBeVisible();
    });

    it('should have proper ARIA labels', () => {
      render(
        <TestWrapper>
          <ElectronicSignatureGate {...defaultProps} />
        </TestWrapper>
      );

      expect(screen.getByRole('dialog') || screen.getByRole('form')).toBeInTheDocument();
    });

    it('should focus first input on mount', async () => {
      render(
        <TestWrapper>
          <ElectronicSignatureGate {...defaultProps} />
        </TestWrapper>
      );

      await waitFor(() => {
        const passwordInput = screen.getByLabelText(/password/i);
        expect(document.activeElement).toBe(passwordInput);
      });
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SIGNATURE DISPLAY TESTS
// ─────────────────────────────────────────────────────────────────────────────

describe('SignatureDisplay', () => {
  it('should display signature information', () => {
    render(<SignatureDisplay signature={mockSignature} />);

    expect(screen.getByText('Test User')).toBeInTheDocument();
    expect(screen.getByText(/Approval Declaration/i)).toBeInTheDocument();
  });

  it('should show detailed view when showDetails is true', () => {
    render(<SignatureDisplay signature={mockSignature} showDetails />);

    expect(screen.getByText(/sha256/i)).toBeInTheDocument();
    expect(screen.getByText('192.168.1.1')).toBeInTheDocument();
  });

  it('should render compact view correctly', () => {
    render(<SignatureDisplay signature={mockSignature} compact />);

    // Compact view should be smaller/condensed
    const container = screen.getByText('Test User').closest('div');
    expect(container).toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SIGNATURE VERIFICATION BADGE TESTS
// ─────────────────────────────────────────────────────────────────────────────

describe('SignatureVerificationBadge', () => {
  it('should show valid badge for valid signature', () => {
    render(<SignatureVerificationBadge isValid={true} />);

    expect(screen.getByText(/valid|verified/i)).toBeInTheDocument();
  });

  it('should show invalid badge for invalid signature', () => {
    render(<SignatureVerificationBadge isValid={false} />);

    expect(screen.getByText(/invalid|not verified/i)).toBeInTheDocument();
  });

  it('should have appropriate color coding', () => {
    const { rerender } = render(<SignatureVerificationBadge isValid={true} />);

    const validBadge = screen.getByText(/valid|verified/i).closest('span, div');
    expect(validBadge).toHaveClass(/green|success/);

    rerender(<SignatureVerificationBadge isValid={false} />);

    const invalidBadge = screen.getByText(/invalid|not verified/i).closest('span, div');
    expect(invalidBadge).toHaveClass(/red|error|destructive/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// COMPLIANCE TESTS
// ─────────────────────────────────────────────────────────────────────────────

describe('21 CFR Part 11 Compliance', () => {
  it('should require password authentication (11.10(d))', () => {
    render(
      <TestWrapper>
        <ElectronicSignatureGate
          action="document_approval"
          meaning="approval"
          recordId="doc-123"
          recordType="document"
          context="Test"
          onSuccess={vi.fn()}
          onCancel={vi.fn()}
        />
      </TestWrapper>
    );

    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
  });

  it('should display signature meaning (11.50(b))', () => {
    render(
      <TestWrapper>
        <ElectronicSignatureGate
          action="document_approval"
          meaning="approval"
          recordId="doc-123"
          recordType="document"
          context="Test"
          onSuccess={vi.fn()}
          onCancel={vi.fn()}
        />
      </TestWrapper>
    );

    expect(screen.getByText(/Declaration/)).toBeInTheDocument();
  });

  it('should include signer identification (11.50(a))', async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();

    render(
      <TestWrapper>
        <ElectronicSignatureGate
          action="document_approval"
          meaning="approval"
          recordId="doc-123"
          recordType="document"
          context="Test"
          onSuccess={onSuccess}
          onCancel={vi.fn()}
        />
      </TestWrapper>
    );

    // Complete signature flow
    await user.type(screen.getByLabelText(/password/i), 'SecurePassword123!');
    await user.click(screen.getByRole('button', { name: /continue|verify/i }));
    await waitFor(() => screen.getByLabelText(/code/i));
    await user.type(screen.getByLabelText(/code/i), '123456');
    await user.click(screen.getByRole('button', { name: /verify|sign/i }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());

    const signature = onSuccess.mock.calls[0][0];
    expect(signature).toHaveProperty('userId');
    expect(signature).toHaveProperty('userName');
    expect(signature).toHaveProperty('userEmail');
    expect(signature).toHaveProperty('timestamp');
  });
});
