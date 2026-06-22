/**
 * Cover-letter / 510(k) summary composition tools — wire the deterministic
 * composers (server/services/cover-letter) to AnA, tenant-scoped. They pull the
 * project's eSTAR sections (organization-scoped) and render the document body.
 *
 *   compose_correspondence_cover_letter -> cover-letter-composer.composeCoverLetterDraft
 *   compose_510k_summary                -> k510-summary-composer.compose510kSummary
 *
 * Handlers (AnaToolExecutor) require organization context and set organizationId
 * from it — never from model input — so no cross-tenant document access.
 *
 * @module server/services/ana/coverLetterTools
 */

import type { AnaTool } from '../ai-gateway/types';

export const COMPOSE_CORRESPONDENCE_COVER_LETTER: AnaTool = {
  name: 'compose_correspondence_cover_letter',
  description:
    "Compose a deterministic FDA correspondence-response cover letter for a 510(k) eSTAR submission, pulling the referenced eSTAR sections from the project. Returns the rendered body, the sections that were missing/empty (for the gap list), and provenance. Requires an active organization context. Surface the missingSections so the user resolves them before sending.",
  input_schema: {
    type: 'object',
    properties: {
      documentId: { type: 'number', description: 'eSTAR document id (cerv2_510k_sections.document_id).' },
      sponsorName: { type: 'string', description: 'Sponsor display name for the addressee block.' },
      submissionTrackingNumber: { type: 'string', description: 'FDA tracking number, e.g. "K251102" (optional).' },
      issues: {
        type: 'array',
        description: 'Issues being addressed in this response.',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            category: { type: 'string' },
            severity: { type: 'string' },
            blocker: { type: 'boolean' },
            description: { type: 'string', description: 'Free-text bullet body.' },
            sectionNumbers: { type: 'array', items: { type: 'string' }, description: 'eSTAR sections this issue resolves (e.g. ["3","6"]).' },
          },
          required: ['id', 'description', 'sectionNumbers'],
        },
      },
    },
    required: ['documentId', 'sponsorName', 'issues'],
  },
};

export const COMPOSE_510K_SUMMARY: AnaTool = {
  name: 'compose_510k_summary',
  description:
    "Compose a deterministic 510(k) Summary (21 CFR §807.92) for an eSTAR submission, pulling the required sections (§3/§6/§11/§12) from the project and rendering the cover-page data + predicate set. Returns the body, missingSections, and provenance. Requires an active organization context. Report missingSections; do not present the summary as complete while required sections are missing.",
  input_schema: {
    type: 'object',
    properties: {
      documentId: { type: 'number', description: 'eSTAR document id.' },
      sponsorName: { type: 'string' },
      deviceTradeName: { type: 'string' },
      deviceClass: { type: 'string', enum: ['I', 'II', 'III'] },
      submissionTrackingNumber: { type: 'string', description: 'FDA tracking number (optional).' },
      commonName: { type: 'string' },
      productCode: { type: 'string' },
      regulationNumber: { type: 'string' },
      contactName: { type: 'string' },
      contactEmail: { type: 'string' },
      predicates: {
        type: 'array',
        description: 'Predicate set referenced by the SE basis (exactly one primary).',
        items: {
          type: 'object',
          properties: {
            kNumber: { type: 'string', description: 'FDA K-number, e.g. "K212284".' },
            deviceName: { type: 'string' },
            holder: { type: 'string', description: 'Manufacturer / 510(k) holder.' },
            primary: { type: 'boolean' },
          },
          required: ['kNumber', 'deviceName', 'holder', 'primary'],
        },
      },
    },
    required: ['documentId', 'sponsorName', 'deviceTradeName', 'deviceClass', 'predicates'],
  },
};

/** Cover-letter composition tools, spread into ALL_ANA_TOOLS. */
export const COVER_LETTER_TOOLS: AnaTool[] = [COMPOSE_CORRESPONDENCE_COVER_LETTER, COMPOSE_510K_SUMMARY];
