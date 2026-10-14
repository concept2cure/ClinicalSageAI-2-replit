/** Canonical read-only scopes offered by the API-key service and admin UI. */
export const API_KEY_SCOPES = [
  'csr:read',
  'regulatory:read',
  'endpoints:read',
  'precedent:read',
  'trial-design:read',
  'documents:read',
] as const;

export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];
