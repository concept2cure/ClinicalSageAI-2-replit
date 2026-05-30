/**
 * First-session onboarding tour.
 *
 * The use-case playbooks orient a user who already knows roughly what they
 * want. This module handles the colder start: a brand-new client who has just
 * arrived and does not yet know what AnA is for. It gives AnA a segment-aware
 * welcome that introduces the value in their terms and lands them on one
 * concrete first action — never a feature dump.
 *
 * Read by:
 *   - context-enrichment.ts (greeting path for project-less / first-contact
 *     users)
 *
 * NOT a prompt template. Structured data; the builder emits Markdown.
 * Tone floor (enforced by ana-ri.test.ts): no emoji, no exclamation marks.
 *
 * @module server/services/ana-ri/onboarding-tour
 */

import type { ClientSegment } from './industry-wisdom-pack.js';
import {
  SEGMENT_LABELS,
  inferSegmentFromSubmissionType,
  inferSegmentFromMessage,
} from './industry-wisdom-pack.js';

export interface TourStep {
  /** Short label for the step. */
  title: string;
  /** What AnA can do at this step, in the user's terms. */
  whatAnaDoes: string;
}

export interface FirstSessionTour {
  segment: ClientSegment | null;
  /** One-line framing of what AnA is for this user. */
  opening: string;
  /** The arc of a first session, 3-4 steps. */
  steps: TourStep[];
  /** The single concrete first action AnA offers to close on. */
  firstOffer: string;
}

const GENERIC_TOUR: FirstSessionTour = {
  segment: null,
  opening:
    'I am your regulatory intelligence partner — I draft submission documents, pressure-test them like a reviewer, and keep the program honest about risk.',
  steps: [
    { title: 'Place the program', whatAnaDoes: 'Tell me whether you are working on a device, a biologic, or a small molecule, and I will tailor everything to that path.' },
    { title: 'Find the load-bearing work', whatAnaDoes: 'I can read where the program stands and tell you the few things that actually move the filing date.' },
    { title: 'Build or pressure-test', whatAnaDoes: 'I draft submission-ready sections, and I review them as a hostile reviewer would before the agency does.' },
  ],
  firstOffer: 'Tell me the product and the submission you are aiming for, and I will give you the honest state of play and the next move.',
};

const SEGMENT_TOURS: Record<ClientSegment, FirstSessionTour> = {
  mdx: {
    segment: 'mdx',
    opening:
      'I am your regulatory intelligence partner for devices and diagnostics — predicate strategy, substantial equivalence, eSTAR, Pre-Subs, and EU MDR, end to end.',
    steps: [
      { title: 'Settle the predicate', whatAnaDoes: 'I search predicates, flag the ones with a refuse-to-file history, and build the substantial-equivalence matrix.' },
      { title: 'De-risk with FDA', whatAnaDoes: 'I help you decide whether a Pre-Sub is worth it and draft the question list so you walk in with a position.' },
      { title: 'Author and pre-flight', whatAnaDoes: 'I draft eSTAR sections, validate them, and run the RTA pre-flight before you transmit.' },
    ],
    firstOffer: 'Tell me the device and intended use, and I will start on the predicate landscape.',
  },
  biotech: {
    segment: 'biotech',
    opening:
      'I am your regulatory intelligence partner for biologics and advanced therapies — IND through BLA, comparability, potency, and the CMC critical path.',
    steps: [
      { title: 'Map the critical path', whatAnaDoes: 'I show you where CMC and comparability will gate the program, before they do.' },
      { title: 'Plan the agency interaction', whatAnaDoes: 'I prep your pre-IND or INTERACT meeting and the questions that actually de-risk the path.' },
      { title: 'Build and reconcile', whatAnaDoes: 'I draft the Module 2 summaries and keep the numbers consistent across protocol, SAP, CSR, and summary.' },
    ],
    firstOffer: 'Tell me the molecule, modality, and where you are in development, and I will lay out the path and the first risk to retire.',
  },
  pharma: {
    segment: 'pharma',
    opening:
      'I am your regulatory intelligence partner for small molecules — IND through NDA, the nonclinical long poles, lifecycle variations, and global expansion.',
    steps: [
      { title: 'Schedule the long poles', whatAnaDoes: 'I map the nonclinical critical path against your NDA date so carcinogenicity and chronic-tox do not gate the filing.' },
      { title: 'Manage the label risks', whatAnaDoes: 'I help you characterize QT and drug-interaction liabilities early, before they become labeling negotiations.' },
      { title: 'Build and pressure-test', whatAnaDoes: 'I draft submission-ready sections and review them as a reviewer would, flagging deficiency triggers.' },
    ],
    firstOffer: 'Tell me the compound, indication, and target agency, and I will give you the path and the first item on the critical path.',
  },
};

export function getFirstSessionTour(segment: ClientSegment | null): FirstSessionTour {
  return segment ? SEGMENT_TOURS[segment] : GENERIC_TOUR;
}

/**
 * Render a first-session welcome for the system prompt. Used on the greeting /
 * first-contact path so AnA can open with a tailored tour instead of a generic
 * hello or a feature list.
 */
export function buildFirstSessionTour(opts: {
  segment?: ClientSegment | null;
  submissionType?: string;
  message?: string;
} = {}): string {
  const segment =
    opts.segment ??
    inferSegmentFromSubmissionType(opts.submissionType) ??
    (opts.message ? inferSegmentFromMessage(opts.message) : null);
  const tour = getFirstSessionTour(segment);

  const segLabel = segment ? SEGMENT_LABELS[segment] : 'not yet known';
  const stepLines = tour.steps.map((s, i) => `${i + 1}. **${s.title}** — ${s.whatAnaDoes}`);

  return (
    `\n\n## First-session welcome — ${segLabel}\n` +
    'This looks like a first contact. Welcome the user the way a senior colleague would on day one: ' +
    'open with what you are for in their terms, sketch how a first session usually goes, and close on one concrete offer. ' +
    'Keep it short and human. Do not list commands or features as a menu.\n\n' +
    `**Framing:** ${tour.opening}\n\n` +
    `**How a first session tends to go:**\n${stepLines.join('\n')}\n\n` +
    `**Close with this offer:** ${tour.firstOffer}` +
    (segment
      ? ''
      : '\n\nSegment is not yet clear from the conversation. Place them with one question — device, biologic, or small molecule — before going deep.')
  );
}
