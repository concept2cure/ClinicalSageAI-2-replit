/**
 * OpenAPI generator for the IND lifecycle API.
 *
 * Generates the spec by INTROSPECTING the actual sub-routers (their registered
 * paths + methods), so the documentation can never drift from the code. A small
 * summaries map adds human descriptions; everything else (security, the standard
 * error responses) is uniform.
 *
 * buildIndLifecycleOpenApi() → an OpenAPI 3.1 document object.
 */

import type { Router } from 'express';
import documentsRoutes from './documents.routes';
import filingRoutes from './filing.routes';
import computeRoutes from './compute.routes';
import sequenceRoutes from './sequence.routes';
import submissionRoutes from './submission.routes';
import registersRoutes from './registers.routes';

const BASE = '/api/ind-lifecycle';

export interface RouteRef {
  method: string;
  /** Full OpenAPI path with {param} placeholders. */
  path: string;
}

/** Collect { method, path } for every route registered directly on a router. */
function collectRoutes(router: Router): RouteRef[] {
  const out: RouteRef[] = [];
  for (const layer of (router as any).stack ?? []) {
    const route = layer?.route;
    if (!route?.path) continue;
    const oapiPath = BASE + String(route.path).replace(/:([A-Za-z0-9_]+)/g, '{$1}');
    for (const m of Object.keys(route.methods ?? {})) {
      if (route.methods[m]) out.push({ method: m.toUpperCase(), path: oapiPath });
    }
  }
  return out;
}

/** All IND lifecycle routes across the five sub-routers. */
export function indLifecycleRoutes(): RouteRef[] {
  return [documentsRoutes, filingRoutes, computeRoutes, sequenceRoutes, submissionRoutes, registersRoutes].flatMap((r) =>
    collectRoutes(r as unknown as Router),
  );
}

/** Human summaries keyed by `METHOD path` (best-effort; falls back to a generated one). */
const SUMMARIES: Record<string, string> = {
  'POST /api/ind-lifecycle/readiness': 'IND filing-readiness verdict (21 CFR 312.23)',
  'POST /api/ind-lifecycle/clock': 'IND regulatory clock + clinical-hold state (312.40/312.42)',
  'POST /api/ind-lifecycle/timeline': 'IND regulatory timeline / milestones (312.40 + 312.33)',
  'POST /api/ind-lifecycle/action-items': 'Prioritized next-actions',
  'POST /api/ind-lifecycle/safety-report': 'IND Safety Report model + amendment intent (312.32)',
  'POST /api/ind-lifecycle/safety-report/classify': 'Safety-report reporting obligation (312.32)',
  'POST /api/ind-lifecycle/safety-report/pdf': 'Render the IND Safety Report to PDF',
  'POST /api/ind-lifecycle/safety-report/file': 'File the IND Safety Report as an eCTD amendment sequence',
  'POST /api/ind-lifecycle/safety-report/icsr': 'Compose the ICH E2B(R3) ICSR (initial/follow-up/nullification; ?format=xml for XML)',
  'POST /api/ind-lifecycle/safety-report/icsr/message': 'Build the transmittable E2B(R3) ICSR message + transmit-readiness (FAERS/EudraVigilance)',
  'POST /api/ind-lifecycle/annual-report': 'IND Annual Report / DSUR model (312.33)',
  'POST /api/ind-lifecycle/annual-report/line-listing': 'Aggregate serious-AE line listing + tabulation (312.33(b); ?format=csv)',
  'POST /api/ind-lifecycle/annual-report/pdf': 'Render the IND Annual Report to PDF',
  'POST /api/ind-lifecycle/annual-report/file': 'File the IND Annual Report as an eCTD annual sequence',
  'POST /api/ind-lifecycle/amendment-plan': 'Plan a protocol/information amendment (312.30/.31)',
  'POST /api/ind-lifecycle/amendment/file': 'File an amendment as an eCTD sequence',
  'POST /api/ind-lifecycle/cover-letter': 'Assemble the IND cover letter (m1.2)',
  'POST /api/ind-lifecycle/cover-letter/pdf': 'Render the IND cover letter to PDF',
  'POST /api/ind-lifecycle/cover-letter/pdf-from-records': 'Render the cover letter from stored records',
  'POST /api/ind-lifecycle/loa': 'Assemble a Letter of Authorization / Right of Reference (m1.4.1)',
  'POST /api/ind-lifecycle/loa/pdf': 'Render the Letter of Authorization to PDF',
  'POST /api/ind-lifecycle/right-of-reference': 'Assemble the Statement of Right of Reference (m1.4.2)',
  'POST /api/ind-lifecycle/right-of-reference/pdf': 'Render the Statement of Right of Reference to PDF',
  'POST /api/ind-lifecycle/authorized-persons': 'Assemble the List of Authorized Persons (m1.4.3)',
  'POST /api/ind-lifecycle/authorized-persons/pdf': 'Render the List of Authorized Persons to PDF',
  'POST /api/ind-lifecycle/cross-reference-register': 'Cross-reference register + LOA-coverage QC (m1.4)',
  'POST /api/ind-lifecycle/briefing-book': 'Assemble an FDA meeting briefing book',
  'POST /api/ind-lifecycle/briefing-book/pdf': 'Render the briefing book to PDF',
  'POST /api/ind-lifecycle/envelope': 'Build the us-regional eCTD envelope XML',
  'POST /api/ind-lifecycle/sequence/validate': 'Validate leaves vs the section map (pure)',
  'POST /api/ind-lifecycle/sequence/lifecycle-validate': 'Validate a proposed sequence type vs the submission history (pure)',
  'POST /api/ind-lifecycle/sequence/history-audit': 'Audit a submission\'s entire sequence-type history for legal transitions (pure)',
  'GET /api/ind-lifecycle/sequence/{seqId}/validate': "Validate a sequence's leaves vs the section map",
  'GET /api/ind-lifecycle/sequence/{seqId}/manifest': 'Package manifest (QC review)',
  'GET /api/ind-lifecycle/sequence/{seqId}/manifest/pdf': 'Package manifest PDF',
  'GET /api/ind-lifecycle/sequence/{currentId}/diff': 'eCTD sequence diff (amendment review)',
  'GET /api/ind-lifecycle/sequence/{currentId}/diff/pdf': 'Sequence diff PDF',
  'POST /api/ind-lifecycle/sequence/{seqId}/dispatch-gate': 'Dispatch-readiness gate (go/no-go)',
  'POST /api/ind-lifecycle/sequence/{seqId}/dispatch-gate/snapshot': 'Evaluate + persist a dispatch snapshot',
  'GET /api/ind-lifecycle/sequence/{seqId}/snapshots': 'Dispatch snapshot history',
  'GET /api/ind-lifecycle/submission/{id}/overview': 'Submission overview',
  'POST /api/ind-lifecycle/submission/{id}/dashboard': 'Unified submission dashboard',
  'POST /api/ind-lifecycle/submission/{id}/cockpit': 'Submission cockpit (dashboard + per-sequence gates)',
  'POST /api/ind-lifecycle/submission/{id}/drift': 'Submission drift digest',
  'POST /api/ind-lifecycle/submission/{id}/safety-reports': 'Draft + persist a 312.32 IND Safety Report',
  'GET /api/ind-lifecycle/submission/{id}/safety-reports': "List a submission's IND Safety Reports",
  'GET /api/ind-lifecycle/submission/{id}/safety-reports/overdue': 'Overdue (unfiled, past-deadline) IND Safety Reports',
  'GET /api/ind-lifecycle/safety-reports/{reportId}': 'Fetch one tracked IND Safety Report (org-scoped)',
  'POST /api/ind-lifecycle/submission/{id}/annual-reports': 'Draft + persist a 312.33 IND Annual Report / DSUR',
  'GET /api/ind-lifecycle/submission/{id}/annual-reports': "List a submission's IND Annual Reports",
  'GET /api/ind-lifecycle/submission/{id}/annual-reports/overdue': 'Overdue (unfiled, past 60-day-deadline) IND Annual Reports',
  'GET /api/ind-lifecycle/annual-reports/{reportId}': 'Fetch one tracked IND Annual Report (org-scoped)',
  'POST /api/ind-lifecycle/submission/{id}/amendments': 'Draft + persist a 312.30/.31 amendment plan',
  'GET /api/ind-lifecycle/submission/{id}/amendments': "List a submission's IND amendments",
  'GET /api/ind-lifecycle/amendments/{amendmentId}': 'Fetch one tracked IND amendment (org-scoped)',
  'POST /api/ind-lifecycle/submission/{id}/icsr-transmissions': 'Prepare + persist an E2B(R3) ICSR transmission (FAERS/EudraVigilance)',
  'GET /api/ind-lifecycle/submission/{id}/icsr-transmissions': "List a submission's ICSR transmissions",
  'POST /api/ind-lifecycle/icsr-transmissions/{txId}/transmit': 'Transmit a prepared ICSR to its agency gateway; only a real gateway receipt marks it transmitted (422 not-ready with gaps, 503 gateway not configured, 502 transport failure — row stays prepared)',
  'POST /api/ind-lifecycle/icsr-transmissions/{txId}/acknowledge': 'Record an agency ACK (AA/AE/AR) against a transmission',
  'POST /api/ind-lifecycle/submission/{id}/cross-references': 'Record an external file dependency (m1.4)',
  'GET /api/ind-lifecycle/submission/{id}/cross-references': "List a submission's cross-references",
  'GET /api/ind-lifecycle/submission/{id}/cross-reference-register': 'Live cross-reference register + LOA-coverage QC',
  'POST /api/ind-lifecycle/submission/{id}/cross-references/{crossRefId}/file-loa': 'File the LOA (m1.4.1 leaf) for a cross-reference + mark it authorized',
  'PATCH /api/ind-lifecycle/cross-references/{crossRefId}': 'Update a cross-reference (e.g. mark the LOA on file)',
  'DELETE /api/ind-lifecycle/cross-references/{crossRefId}': 'Delete a cross-reference',
  'GET /api/ind-lifecycle/portfolio': 'IND portfolio (all submissions)',
  'GET /api/ind-lifecycle/portfolio/drift': 'Org-wide drift sweep',
  'GET /api/ind-lifecycle/portfolio/drift/csv': 'Org-wide drift sweep (CSV export)',
};

const ERROR_RESPONSES = {
  '400': { description: 'Validation error' },
  '401': { description: 'Authentication required' },
  '403': { description: 'Insufficient role (regulatory-author)' },
  '500': { description: 'Internal error' },
};

/** Build the OpenAPI 3.1 document for the IND lifecycle API (generated from the routers). */
export function buildIndLifecycleOpenApi(): Record<string, unknown> {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const { method, path } of indLifecycleRoutes()) {
    const key = `${method} ${path}`;
    const params = [...path.matchAll(/\{([A-Za-z0-9_]+)\}/g)].map((m) => ({
      name: m[1],
      in: 'path',
      required: true,
      schema: { type: 'string' },
    }));
    paths[path] = paths[path] ?? {};
    paths[path][method.toLowerCase()] = {
      summary: SUMMARIES[key] ?? `${method} ${path}`,
      tags: ['ind-lifecycle'],
      security: [{ bearerAuth: [] }],
      ...(params.length ? { parameters: params } : {}),
      responses: { '200': { description: 'Success' }, '201': { description: 'Created' }, ...ERROR_RESPONSES },
    };
  }

  return {
    openapi: '3.1.0',
    info: {
      title: 'IND Lifecycle API',
      version: '1.0.0',
      description:
        'FDA IND lifecycle: authoring, analysis, filing, review, governance, and portfolio. All routes require a regulatory-author (or admin) role.',
    },
    servers: [{ url: '/', description: 'mounted under /api/ind-lifecycle' }],
    components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer' } } },
    tags: [{ name: 'ind-lifecycle' }],
    paths,
  };
}
