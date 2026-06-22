/**
 * Pharmacovigilance reporting tools — expose two pure, tested safety engines to
 * AnA that previously had NO tool surface (only an advisory PV tool existed):
 *
 *   build_sae_line_listing -> ind-lifecycle/ind-sae-line-listing.buildSaeLineListing
 *       A serious-adverse-event line listing + summary tabulation (+ CSV) over a
 *       reporting period, from the organization's recorded adverse events.
 *   compose_e2b_icsr       -> ind-lifecycle/e2b-icsr-composer.composeE2bR3Icsr
 *       The E2B(R3) ICSR data elements + escaped XML projection + the mandatory-
 *       element gap list + completeness, for a single case.
 *
 * Both run over real, organization-scoped adverse-event records (fetched via the
 * pharmacovigilance service, which scopes by organization_id) — they are NOT
 * model-fabricated. Handlers live in AnaToolExecutor.ts and require tenant
 * context; they fail closed without it.
 *
 * @module server/services/ana/pharmacovigilanceReportingTools
 */

import type { AnaTool } from '../ai-gateway/types';

export const BUILD_SAE_LINE_LISTING: AnaTool = {
  name: 'build_sae_line_listing',
  description:
    "Build a serious-adverse-event (SAE) line listing and summary tabulation for a reporting period from the organization's recorded adverse events (e.g. for a DSUR/annual report or an IND safety summary). Returns one row per case (patient, country, onset, reaction PT/SOC, seriousness, causality, expectedness, outcome, suspect product, expedited flag), a summary tabulation, and a CSV projection. DETERMINISTIC over the stored data — it reports what is recorded, not an estimate. Requires an active organization context.",
  input_schema: {
    type: 'object',
    properties: {
      from_date: { type: 'string', description: 'Reporting period start (ISO date, e.g. "2025-01-01").' },
      to_date: { type: 'string', description: 'Reporting period end (ISO date).' },
      project_id: { type: 'string', description: 'Optional — restrict to one project id.' },
    },
    required: ['from_date', 'to_date'],
  },
};

export const COMPOSE_E2B_ICSR: AnaTool = {
  name: 'compose_e2b_icsr',
  description:
    'Compose the E2B(R3) ICSR data elements for a single recorded adverse-event case: the structured elements (C.1 admin, C.2 source, D patient, E reaction, G drug, H narrative), a deterministic escaped XML projection, the list of mandatory E2B(R3) elements still missing (gaps), and the completeness fraction. Use to prepare an individual case safety report and see exactly what must be resolved before transmit. Runs over the stored case (organization-scoped); requires tenant context.',
  input_schema: {
    type: 'object',
    properties: {
      adverse_event_id: { type: 'string', description: 'Id of the recorded adverse event to compose.' },
      expedited: { type: 'boolean', description: 'Whether the case is expedited-reportable (C.1.7).' },
      nullification_reason: { type: 'string', description: 'C.1.11.2 reason (only when nullifying a case sent in error).' },
    },
    required: ['adverse_event_id'],
  },
};

/** Pharmacovigilance reporting tools, spread into ALL_ANA_TOOLS. */
export const PHARMACOVIGILANCE_REPORTING_TOOLS: AnaTool[] = [BUILD_SAE_LINE_LISTING, COMPOSE_E2B_ICSR];
