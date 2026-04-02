import {
  canViewVisibilityTier,
  deriveCommunicationDueDate,
  parseProjectParam,
  validateAuthorityProfileInput,
  validateSubmissionCenterInput,
  validateSubmissionTransition,
} from '../../../shared/utils/communication-center-rules';

describe('concept2cure communication center logic helpers', () => {
  it('parses project ids with and without prefix', () => {
    expect(parseProjectParam('proj_42')).toBe(42);
    expect(parseProjectParam('7')).toBe(7);
    expect(() => parseProjectParam('proj_bad')).toThrow('Invalid project ID');
  });

  it('enforces gateway acknowledgement model constraints', () => {
    expect(() =>
      validateAuthorityProfileInput({
        channelType: 'gateway',
        acknowledgmentModel: 'transport ack + technical ack',
        messageReceiptModel: 'gateway receipts',
      })
    ).not.toThrow();

    expect(() =>
      validateAuthorityProfileInput({
        channelType: 'gateway',
        acknowledgmentModel: 'status update only',
        messageReceiptModel: 'gateway receipts',
      })
    ).toThrow('ACK');
  });

  it('derives due dates from urgency SLA when response is required', () => {
    const now = Date.now();
    const critical = deriveCommunicationDueDate({
      responseRequired: true,
      urgency: 'critical',
    });
    const high = deriveCommunicationDueDate({
      responseRequired: true,
      urgency: 'high',
    });
    const medium = deriveCommunicationDueDate({
      responseRequired: true,
      urgency: 'medium',
    });
    const low = deriveCommunicationDueDate({
      responseRequired: true,
      urgency: 'low',
    });

    // All should return valid ISO date strings
    expect(critical).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(high).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(medium).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(low).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    // Verify SLA day offsets (critical=3, high=7, medium/low=14)
    const daysDiff = (iso: string) => Math.round((new Date(iso).getTime() - now) / (86400000));
    expect(daysDiff(critical!)).toBe(3);
    expect(daysDiff(high!)).toBe(7);
    expect(daysDiff(medium!)).toBe(14);
    expect(daysDiff(low!)).toBe(14);

    // Correct ordering
    const c = new Date(critical!);
    const h = new Date(high!);
    const m = new Date(medium!);
    expect(c.getTime()).toBeLessThan(h.getTime());
    expect(h.getTime()).toBeLessThan(m.getTime());
  });

  it('returns undefined when response is not required', () => {
    expect(deriveCommunicationDueDate({
      responseRequired: false,
      urgency: 'critical',
    })).toBeUndefined();
  });

  it('passes through explicit dueDate without computing SLA', () => {
    const explicit = '2026-12-25T00:00:00.000Z';
    expect(deriveCommunicationDueDate({
      dueDate: explicit,
      responseRequired: true,
      urgency: 'critical',
    })).toBe(explicit);
  });

  it('applies visibility-tier gating by role', () => {
    expect(canViewVisibilityTier('shared_client_c2c', 'client_reviewer')).toBe(true);
    expect(canViewVisibilityTier('publishops_only', 'client_reviewer')).toBe(false);
    expect(canViewVisibilityTier('publishops_only', 'managed_publishops_operator')).toBe(true);
    expect(canViewVisibilityTier('restricted_legal_sensitive', 'legal_counsel')).toBe(true);
    expect(canViewVisibilityTier('restricted_legal_sensitive', 'client_reviewer')).toBe(false);
    // c2c_internal tier
    expect(canViewVisibilityTier('c2c_internal', 'c2c_analyst')).toBe(true);
    expect(canViewVisibilityTier('c2c_internal', 'client_reviewer')).toBe(false);
    expect(canViewVisibilityTier('c2c_internal', 'admin')).toBe(true);
    // client_internal is open to all roles
    expect(canViewVisibilityTier('client_internal', 'client_reviewer')).toBe(true);
    // unknown tier should be rejected
    expect(canViewVisibilityTier('unknown_tier' as any, 'admin')).toBe(false);
  });

  it('enforces submission lifecycle transitions and eCTD readiness', () => {
    expect(() => validateSubmissionTransition('draft', 'preparing')).not.toThrow();
    expect(() => validateSubmissionTransition('draft', 'published')).toThrow('Invalid submission status transition');

    expect(() =>
      validateSubmissionCenterInput({
        authority: 'FDA',
        title: 'NDA sequence',
        submissionType: 'NDA',
        status: 'draft',
        dispatchReady: false,
      })
    ).toThrow('sequenceNumber');

    expect(() =>
      validateSubmissionCenterInput({
        authority: 'FDA',
        title: 'NDA sequence',
        submissionType: 'NDA',
        sequenceNumber: '0012',
        status: 'published',
        dispatchReady: false,
      })
    ).toThrow('dispatchReady');
  });
});
