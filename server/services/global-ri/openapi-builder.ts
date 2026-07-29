/**
 * Global-RI OpenAPI builder — generates an OpenAPI 3.0 document FROM the capability
 * catalog so the machine-readable contract can never drift from the live routes/tools.
 *
 * For each capability route ("METHOD /path") it emits a path item under /api/global-ri:
 * path params from ":param", a JSON request body from the backing AnA tool's input
 * schema (for POST callables), the uniform ApiError responses, and a group tag.
 *
 * Pure / deterministic — no IO. Consumed by scripts/global-ri/generate-openapi.mjs
 * (to write global-ri.openapi.json) and by GET /api/global-ri/openapi.json at runtime.
 *
 * @module server/services/global-ri/openapi-builder
 */

import { getGlobalRiCatalog } from './global-ri-capabilities';

const BASE = '/api/global-ri';

/** Convert an Express-style path ("/x/:id") to an OpenAPI path ("/x/{id}") + its params. */
function toOpenApiPath(path: string): { openApiPath: string; params: string[] } {
  const params: string[] = [];
  const openApiPath = path.replace(/:([A-Za-z0-9_]+)/g, (_m, p1) => {
    params.push(p1);
    return `{${p1}}`;
  });
  return { openApiPath, params };
}

/** Build the OpenAPI 3.0 document for the global-RI surface from the catalog. */
export function buildGlobalRiOpenApi(): Record<string, unknown> {
  const catalog = getGlobalRiCatalog();
  const paths: Record<string, Record<string, unknown>> = {};

  const errorResponse = { $ref: '#/components/responses/Error' };
  const standardResponses = {
    '200': { description: 'Success — structured, registry-grounded result.', content: { 'application/json': { schema: { type: 'object' } } } },
    '400': errorResponse,
    '403': errorResponse,
    '404': errorResponse,
    '500': errorResponse,
  };

  for (const cap of catalog.capabilities) {
    // The backing tool's input schema (if any) drives POST request bodies.
    const toolSchema = cap.tools[0]?.inputSchema as Record<string, unknown> | undefined;

    for (const route of cap.routes) {
      const [methodRaw, rawPath] = route.split(' ');
      const method = methodRaw.toLowerCase();
      const { openApiPath, params } = toOpenApiPath(rawPath);
      const fullPath = `${BASE}${openApiPath}`;

      const op: Record<string, unknown> = {
        tags: [cap.group],
        summary: `${cap.label}`,
        description: cap.description,
        operationId: `${method}_${cap.id}_${params.join('_') || 'root'}`.replace(/[^A-Za-z0-9_]/g, '_'),
        responses: standardResponses,
      };

      if (params.length > 0) {
        op.parameters = params.map((p) => ({
          name: p,
          in: 'path',
          required: true,
          schema: { type: 'string' },
        }));
      }

      if (method === 'post') {
        op.requestBody = {
          required: true,
          content: { 'application/json': { schema: toolSchema ?? { type: 'object' } } },
        };
      }

      paths[fullPath] ??= {};
      paths[fullPath][method] = op;
    }
  }

  return {
    openapi: '3.0.3',
    info: {
      title: 'Concept2Cure — Global Regulatory Intelligence API',
      version: '1.0.0',
      description:
        'Deterministic, citation-backed cross-market regulatory-intelligence services. ' +
        'Generated from the capability catalog (GET /api/global-ri/catalog); do not hand-edit. ' +
        `${catalog.total} capabilities across ${catalog.groups.length} groups; ${catalog.anaToolCount} AnA tools.`,
    },
    servers: [{ url: '/', description: 'Same-origin API host' }],
    tags: catalog.groups.map((g) => ({ name: g.id, description: `${g.label} — ${g.blurb}` })),
    paths,
    components: {
      securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer' } },
      responses: {
        Error: {
          description: 'Uniform error envelope.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  error: {
                    type: 'object',
                    properties: {
                      code: { type: 'string' },
                      message: { type: 'string' },
                      details: {},
                    },
                    required: ['code'],
                  },
                },
                required: ['error'],
              },
            },
          },
        },
      },
    },
    security: [{ bearerAuth: [] }],
  };
}

export default { buildGlobalRiOpenApi };
