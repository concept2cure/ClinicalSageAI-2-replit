import type { HelpCourse } from './types';

/**
 * Training courses (the Academy, P-127 item 4). A lesson is a Help Center article and, where one fits, a Live Drive
 * script AnA runs to show it (shared/navigation/demo-scripts.ts). No progress or certificate is kept: that needs a
 * store and rules of its own, not decided here, and the page does not pretend to track.
 */
export const HELP_COURSES: readonly HelpCourse[] = [
  {
    id: 'getting-started-drug-biologic',
    title: 'Getting started with Concept2Cure',
    summary: 'From signing in to a project with its plan, for a drug or biologic team. About 30 minutes.',
    clientTypes: ['biotech', 'pharma', 'cro'],
    audience: 'everyone',
    lessons: [
      { article: 'what-is-concept2cure', demoScript: 'training-orientation' },
      { article: 'meet-ana' },
      { article: 'create-your-first-project' },
      { article: 'the-six-steps-of-a-project' },
      { article: 'program-plan-and-workstreams' },
      { article: 'assign-work' },
      { article: 'get-help-and-contact-support' },
    ],
  },
  {
    id: 'getting-started-device-diagnostics',
    title: 'Getting started for device and diagnostics teams',
    summary: 'From signing in to a 510(k) project with its plan. About 30 minutes.',
    clientTypes: ['medtech', 'diagnostics'],
    audience: 'everyone',
    lessons: [
      { article: 'what-is-concept2cure', demoScript: 'training-medtech' },
      { article: 'meet-ana' },
      { article: 'create-your-first-project' },
      { article: 'the-six-steps-of-a-project' },
      { article: 'program-plan-and-workstreams' },
      { article: 'assign-work' },
      { article: 'get-help-and-contact-support' },
    ],
  },
  {
    id: 'administrator-setup',
    title: 'Set up your organisation',
    summary: 'For administrators: company details, members, sign-in and security, before the team starts.',
    audience: 'administrators',
    lessons: [
      { article: 'set-up-your-organisation' },
      { article: 'record-company-details' },
      { article: 'invite-members' },
      { article: 'access-levels-and-roles' },
      { article: 'set-up-an-authenticator-app' },
      { article: 'session-policy-and-review-rules' },
      { article: 'share-a-project' },
      { article: 'answer-access-requests' },
      { article: 'read-the-audit-trail' },
    ],
  },
];
