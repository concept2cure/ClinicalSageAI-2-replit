/**
 * IND lifecycle OpenAPI — generated from the routers, so it can't drift. The
 * test asserts the spec is well-formed and covers every registered route.
 */

import { describe, it, expect } from 'vitest';
import { buildIndLifecycleOpenApi, indLifecycleRoutes } from '../openapi';

describe('buildIndLifecycleOpenApi', () => {
  const spec = buildIndLifecycleOpenApi() as any;
  const routes = indLifecycleRoutes();

  it('is a well-formed OpenAPI 3.1 document', () => {
    expect(spec.openapi).toBe('3.1.0');
    expect(spec.info?.title).toBe('IND Lifecycle API');
    expect(spec.components?.securitySchemes?.bearerAuth).toBeTruthy();
    expect(Object.keys(spec.paths).length).toBeGreaterThan(0);
  });

  it('introspected a substantial route surface', () => {
    // Guards against the generator silently collecting nothing.
    expect(routes.length).toBeGreaterThanOrEqual(30);
  });

  it('documents every registered route (method + path) — no drift', () => {
    for (const { method, path } of routes) {
      expect(spec.paths[path], `missing path ${path}`).toBeTruthy();
      expect(spec.paths[path][method.toLowerCase()], `missing ${method} ${path}`).toBeTruthy();
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

  it('every operation is secured and carries the standard error responses', () => {
    for (const ops of Object.values<any>(spec.paths)) {
      for (const op of Object.values<any>(ops)) {
        expect(op.security).toEqual([{ bearerAuth: [] }]);
        expect(op.responses['401']).toBeTruthy();
        expect(op.responses['403']).toBeTruthy();
      }
    }
  });
});
