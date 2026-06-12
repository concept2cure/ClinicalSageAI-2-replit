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
  return [documentsRoutes, filingRoutes, computeRoutes, sequenceRoutes, submissionRoutes].flatMap((r) =>
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
  'POST /api/ind-lifecycle/safety-report/icsr': 'Compose the ICH E2B(R3) ICSR data elements (?format=xml for XML)',
  'POST /api/ind-lifecycle/annual-report': 'IND Annual Report / DSUR model (312.33)',
  'POST /api/ind-lifecycle/annual-report/pdf': 'Render the IND Annual Report to PDF',
  'POST /api/ind-lifecycle/annual-report/file': 'File the IND Annual Report as an eCTD annual sequence',
  'POST /api/ind-lifecycle/amendment-plan': 'Plan a protocol/information amendment (312.30/.31)',
  'POST /api/ind-lifecycle/amendment/file': 'File an amendment as an eCTD sequence',
  'POST /api/ind-lifecycle/cover-letter': 'Assemble the IND cover letter (m1.2)',
  'POST /api/ind-lifecycle/cover-letter/pdf': 'Render the IND cover letter to PDF',
  'POST /api/ind-lifecycle/cover-letter/pdf-from-records': 'Render the cover letter from stored records',
  'POST /api/ind-lifecycle/briefing-book': 'Assemble an FDA meeting briefing book',
  'POST /api/ind-lifecycle/briefing-book/pdf': 'Render the briefing book to PDF',
  'POST /api/ind-lifecycle/envelope': 'Build the us-regional eCTD envelope XML',
  'POST /api/ind-lifecycle/sequence/validate': 'Validate leaves vs the section map (pure)',
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
