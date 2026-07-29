/**
 * Global-RI OpenAPI builder — shape + completeness tests. The doc is generated
 * from the capability catalog, so this guards that every route is emitted and the
 * envelope is well-formed.
 */

import { describe, it, expect } from 'vitest';
import { buildGlobalRiOpenApi } from '../openapi-builder';
import { GLOBAL_RI_CAPABILITIES } from '../global-ri-capabilities';

describe('buildGlobalRiOpenApi', () => {
  const doc = buildGlobalRiOpenApi() as any;

  it('is a valid OpenAPI 3.0 envelope', () => {
    expect(doc.openapi).toBe('3.0.3');
    expect(doc.info.title).toMatch(/Global Regulatory Intelligence/);
    expect(doc.components.securitySchemes.bearerAuth).toBeTruthy();
    expect(doc.components.responses.Error).toBeTruthy();
  });

  it('emits a path for every catalog route under /api/global-ri', () => {
    const expectedRoutes = GLOBAL_RI_CAPABILITIES.flatMap((c) => c.routes);
    for (const r of expectedRoutes) {
      const [method, rawPath] = r.split(' ');
      const oaPath = `/api/global-ri${rawPath.replace(/:([A-Za-z0-9_]+)/g, '{$1}')}`;
      expect(doc.paths[oaPath], `${oaPath} present`).toBeTruthy();
      expect(doc.paths[oaPath][method.toLowerCase()], `${method} ${oaPath}`).toBeTruthy();
    }
  });

  it('POST operations carry a JSON request body; path params are declared', () => {
    const compute = doc.paths['/api/global-ri/exclusivity/compute'].post;
    expect(compute.requestBody.content['application/json'].schema).toBeTruthy();
    const rules = doc.paths['/api/global-ri/exclusivity/rules/{market}'].get;
    expect(rules.parameters.some((p: any) => p.name === 'market' && p.in === 'path')).toBe(true);
  });

  it('tags every group; is deterministic', () => {
    expect(doc.tags.length).toBeGreaterThan(0);
    expect(buildGlobalRiOpenApi()).toEqual(doc);
  });
});
