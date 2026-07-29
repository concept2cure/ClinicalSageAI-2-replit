/**
 * Unified IND API OpenAPI — generated from every IND router (forms, master-data,
 * lifecycle, authoring-PDF), so it can't drift. Asserts the spec is well-formed,
 * spans all four functional areas, and documents every registered route.
 */

import { describe, it, expect } from 'vitest';
import { buildIndApiOpenApi, indApiRoutes } from '../ind-openapi';

describe('buildIndApiOpenApi', () => {
  const spec = buildIndApiOpenApi() as any;
  const routes = indApiRoutes();

  it('is a well-formed OpenAPI 3.1 document', () => {
    expect(spec.openapi).toBe('3.1.0');
    expect(spec.info?.title).toBe('IND API');
    expect(spec.components?.securitySchemes?.bearerAuth).toBeTruthy();
    expect(Object.keys(spec.paths).length).toBeGreaterThan(0);
  });

  it('aggregates a substantial route surface across all four routers', () => {
    expect(routes.length).toBeGreaterThanOrEqual(40);
    const areas = new Set(routes.map((r) => r.path.split('/')[2]));
    expect(areas).toContain('ind-forms');
    expect(areas).toContain('ind-master-data');
    expect(areas).toContain('ind-lifecycle');
    expect(areas).toContain('authoring-pdf');
  });

  it('documents every registered route (method + path) — no drift', () => {
    for (const { method, path } of routes) {
      expect(spec.paths[path], `missing path ${path}`).toBeTruthy();
      expect(spec.paths[path][method.toLowerCase()], `missing ${method} ${path}`).toBeTruthy();
    }
  });

  it('tags each operation by functional area and secures it', () => {
    for (const [path, ops] of Object.entries<any>(spec.paths)) {
      for (const op of Object.values<any>(ops)) {
        expect(op.security).toEqual([{ bearerAuth: [] }]);
        expect(Array.isArray(op.tags)).toBe(true);
        expect(op.tags.length).toBe(1);
        expect(op.responses['401']).toBeTruthy();
        expect(op.responses['403']).toBeTruthy();
      }
    }
  });

  it('every path-param route declares its parameters', () => {
    for (const [path, ops] of Object.entries<any>(spec.paths)) {
      const paramNames = [...path.matchAll(/\{([A-Za-z0-9_]+)\}/g)].map((m) => m[1]);
      if (paramNames.length === 0) continue;
      for (const op of Object.values<any>(ops)) {
        const declared = (op.parameters ?? []).map((p: any) => p.name);
        for (const n of paramNames) expect(declared).toContain(n);
      }
    }
  });
});
