/**
 * Unified OpenAPI 3.1 generator for the entire IND API surface.
 *
 * Aggregates every IND router — forms, master-data, lifecycle, authoring-PDF —
 * into ONE self-documenting spec by introspecting the actual registered routes,
 * so the documentation can never drift from the code. The lifecycle portion is
 * sourced from its own router-introspection helper (it composes sub-routers);
 * the remaining routers register their routes directly and are walked here.
 *
 * buildIndApiOpenApi() → an OpenAPI 3.1 document object covering the IND API.
 */

import type { Router } from 'express';
import { indLifecycleRoutes, type RouteRef } from './ind-lifecycle/openapi';
import formsRouter from './ind-forms.routes';
import masterDataRouter from './ind-master-data.routes';
import authoringPdfRouter from './authoring-pdf.routes';

/** Collect { method, path } for every route registered directly on a router, under `base`. */
function collectRoutes(router: Router, base: string): RouteRef[] {
  const out: RouteRef[] = [];
  for (const layer of (router as any).stack ?? []) {
    const route = layer?.route;
    if (!route?.path) continue;
    const paths = Array.isArray(route.path) ? route.path : [route.path];
    for (const p of paths) {
      const oapiPath = (base + String(p)).replace(/:([A-Za-z0-9_]+)/g, '{$1}').replace(/\/$/, '') || base;
      for (const m of Object.keys(route.methods ?? {})) {
        if (route.methods[m]) out.push({ method: m.toUpperCase(), path: oapiPath });
      }
    }
  }
  return out;
}

/** Every route across the whole IND API, with full mounted paths. */
export function indApiRoutes(): RouteRef[] {
  return [
    ...collectRoutes(formsRouter as unknown as Router, '/api/ind-forms'),
    ...collectRoutes(masterDataRouter as unknown as Router, '/api/ind-master-data'),
    ...indLifecycleRoutes(),
    ...collectRoutes(authoringPdfRouter as unknown as Router, '/api/authoring-pdf'),
  ];
}

const ERROR_RESPONSES = {
  '400': { description: 'Validation error' },
  '401': { description: 'Authentication required' },
  '403': { description: 'Insufficient role (regulatory-author)' },
  '404': { description: 'Not found' },
  '500': { description: 'Internal error' },
};

/** Tag a path into a coarse functional area for grouping in the spec. */
function tagFor(path: string): string {
  if (path.startsWith('/api/ind-forms')) return 'ind-forms';
  if (path.startsWith('/api/ind-master-data')) return 'ind-master-data';
  if (path.startsWith('/api/authoring-pdf')) return 'authoring-pdf';
  return 'ind-lifecycle';
}

/** Build the unified OpenAPI 3.1 document for the IND API (generated from the routers). */
export function buildIndApiOpenApi(): Record<string, unknown> {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const { method, path } of indApiRoutes()) {
    const params = [...path.matchAll(/\{([A-Za-z0-9_]+)\}/g)].map((m) => ({
      name: m[1],
      in: 'path',
      required: true,
      schema: { type: 'string' },
    }));
    paths[path] = paths[path] ?? {};
    paths[path][method.toLowerCase()] = {
      summary: `${method} ${path}`,
      tags: [tagFor(path)],
      security: [{ bearerAuth: [] }],
      ...(params.length ? { parameters: params } : {}),
      responses: { '200': { description: 'Success' }, '201': { description: 'Created' }, ...ERROR_RESPONSES },
    };
  }

  return {
    openapi: '3.1.0',
    info: {
      title: 'IND API',
      version: '1.0.0',
      description:
        'Complete FDA IND API surface: FDA form generation (1571/1572/3674/3454/3455), ' +
        'sponsor/agent/investigator master data, the IND lifecycle (authoring, analysis, ' +
        'filing, review, governance, portfolio), and Module 2 authoring PDFs. All routes ' +
        'require a regulatory-author (or admin) role and are tenant-scoped.',
    },
    servers: [{ url: '/', description: 'IND API root' }],
    components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer' } } },
    tags: [
      { name: 'ind-forms' },
      { name: 'ind-master-data' },
      { name: 'ind-lifecycle' },
      { name: 'authoring-pdf' },
    ],
    paths,
  };
}
