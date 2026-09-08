import {
  SUBMISSION_CENTER_ITEM_STATES,
  type CommunicationVisibilityTier,
  type SubmissionCenterItemState,
} from '../types/communication-center';

export function validateAuthorityProfileInput(input: {
  channelType: 'portal' | 'gateway' | 'email' | 'mixed';
  acknowledgmentModel: string;
  messageReceiptModel: string;
}) {
  const ack = input.acknowledgmentModel.toLowerCase();
  const receipt = input.messageReceiptModel.toLowerCase();
  if (input.channelType === 'gateway' && !ack.includes('ack')) {
    throw new Error('Gateway channel profiles must define explicit ACK handling in acknowledgmentModel');
  }
  if (input.channelType === 'portal' && !receipt.includes('portal')) {
    throw new Error('Portal channel profiles must include portal receipt behavior in messageReceiptModel');
  }
}

export function deriveCommunicationDueDate(input: {
  dueDate?: string;
  responseRequired: boolean;
  urgency: 'low' | 'medium' | 'high' | 'critical';
}): string | undefined {
  if (input.dueDate) return input.dueDate;
  if (!input.responseRequired) return undefined;
  const now = new Date();
  const days = input.urgency === 'critical' ? 3 : input.urgency === 'high' ? 7 : 14;
  now.setUTCDate(now.getUTCDate() + days);
  return now.toISOString();
}

const SUBMISSION_STATUS_TRANSITIONS: Record<SubmissionCenterItemState, SubmissionCenterItemState[]> = {
  draft: ['preparing'],
  preparing: ['ready_for_publish', 'rejected_or_remediation'],
  ready_for_publish: ['published', 'rejected_or_remediation'],
  published: ['submitted_to_gateway', 'rejected_or_remediation'],
  submitted_to_gateway: ['acknowledged_by_gateway', 'rejected_or_remediation'],
  acknowledged_by_gateway: ['accepted_by_authority', 'rejected_or_remediation'],
  accepted_by_authority: [],
  rejected_or_remediation: ['preparing'],
};

export function validateSubmissionTransition(from: SubmissionCenterItemState, to: SubmissionCenterItemState) {
  if (!SUBMISSION_CENTER_ITEM_STATES.includes(from) || !SUBMISSION_CENTER_ITEM_STATES.includes(to)) {
    throw new Error('Unknown submission status transition state');
  }
  const allowed = SUBMISSION_STATUS_TRANSITIONS[from] || [];
  if (!allowed.includes(to)) {
    throw new Error(`Invalid submission status transition: ${from} -> ${to}`);
  }
}

export function validateSubmissionCenterInput(input: {
  authority: string;
  title: string;
  status: SubmissionCenterItemState;
  submissionType: string;
  sequenceNumber?: string;
  dispatchReady: boolean;
}) {
  if (!input.authority.trim() || !input.title.trim()) {
    throw new Error('Authority and title are required for submission center work items');
  }
  const ectdLike = ['nda', 'bla', 'anda', 'maa', 'ind'].includes(input.submissionType.toLowerCase());
  if (ectdLike && !input.sequenceNumber?.trim()) {
    throw new Error('eCTD-like submissions require a sequenceNumber before publishing or submission');
  }
  if (['published', 'submitted_to_gateway', 'acknowledged_by_gateway', 'accepted_by_authority'].includes(input.status) && !input.dispatchReady) {
    throw new Error('Submission cannot be published/submitted until dispatchReady is true');
  }
}
