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

    expect(critical).toBeTruthy();
    expect(high).toBeTruthy();
    expect(medium).toBeTruthy();

    const c = new Date(critical!);
    const h = new Date(high!);
    const m = new Date(medium!);
    expect(c.getTime()).toBeLessThan(h.getTime());
    expect(h.getTime()).toBeLessThan(m.getTime());
  });

  it('applies visibility-tier gating by role', () => {
    expect(canViewVisibilityTier('shared_client_c2c', 'client_reviewer')).toBe(true);
    expect(canViewVisibilityTier('publishops_only', 'client_reviewer')).toBe(false);
    expect(canViewVisibilityTier('publishops_only', 'managed_publishops_operator')).toBe(true);
    expect(canViewVisibilityTier('restricted_legal_sensitive', 'legal_counsel')).toBe(true);
    expect(canViewVisibilityTier('restricted_legal_sensitive', 'client_reviewer')).toBe(false);
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
