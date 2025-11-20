// client/src/utils/apiClient.js
export async function vaultFetch(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    'Tenant-Context': JSON.stringify({
      organizationId: window.__TENANT__?.organizationId || null,
      clientWorkspaceId: window.__TENANT__?.clientWorkspaceId || null,
      module: window.__TENANT__?.module || null,
    }),
    ...options.headers,
  };

  const res = await fetch(path, { ...options, headers });
  return res;
}
