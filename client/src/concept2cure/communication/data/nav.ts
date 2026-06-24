/**
 * Communication Center nav data — the regulated-handoff hub: review queue,
 * pending e-sign approvals, and the 21 CFR Part 11 audit trail. Mirrors the
 * tasking shell's nav contract (HERE_LABEL_* + *_SUGGESTIONS + tabs).
 */

import type { IconKey } from '../../mdx/icons';

export interface CommNavItem {
  id: string;
  label: string;
  icon: IconKey;
  meta?: string;
}

export const COMM_TABS: CommNavItem[] = [
  { id: 'reviews',   label: 'Review queue', icon: 'eye',         meta: 'Items awaiting your review' },
  { id: 'approvals', label: 'Approvals',    icon: 'checkCircle', meta: 'Pending e-signature' },
  { id: 'audit',     label: 'Audit trail',  icon: 'scroll',      meta: '21 CFR Part 11' },
];

export const HERE_LABEL_COMM: Record<string, string> = {
  reviews:   'Review queue',
  approvals: 'Approvals',
  audit:     'Audit trail',
};

export const COMM_SUGGESTIONS: Record<string, string[]> = {
  reviews:   ['Summarize what is waiting on me', 'Which reviews are overdue?', 'Draft a response for the oldest item'],
  approvals: ['Explain this approval before I sign', 'What changed since the last version?', 'Who else has signed off?'],
  audit:     ['Summarize recent sign-offs', 'Show approvals in the last 7 days', 'Any rejected steps to follow up?'],
};
