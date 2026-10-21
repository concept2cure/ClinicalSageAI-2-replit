/**
 * How a question's response state reads on screen: one word and one tone per
 * state the server derives (server/services/agency-responses/response-logic.ts
 * questionApproval). The letter (AgencyResponses.tsx) and CMC / Module 3's
 * view of it (cmcAgencyQuestions.tsx) both read this map, so one question
 * reads the same on both sides of "Open on its letter" (review of 2026-10-19:
 * the two copies had already drifted, 'idle' on the letter and 'dim' in CMC).
 *
 * Words only: which state a question is in is the server's, never decided here.
 */

export type ResponseState = 'unanswered' | 'drafted' | 'changed-after-approval' | 'approved' | 'withdrawn';

export const RESPONSE_STATE_LABEL: Readonly<Record<ResponseState, string>> = {
  unanswered: 'No response',
  drafted: 'Draft',
  'changed-after-approval': 'Changed after approval',
  approved: 'Approved',
  withdrawn: 'Withdrawn',
};

/** The `rd-chip tone-*` each state is drawn in. */
export const RESPONSE_STATE_TONE: Readonly<Record<ResponseState, string>> = {
  unanswered: 'idle',
  drafted: 'warn',
  'changed-after-approval': 'err',
  approved: 'ok',
  withdrawn: 'idle',
};
