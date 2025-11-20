// Small helper to build and navigate cross-tab deep-links.
// Usage: openDeepLink('stability', { focus: 'mat:API-123', source: 'manufacturing', section: 'materials-bom' })
export function buildDeepLink(tab, params = {}) {
  const url = new URL(window.location.href);
  url.searchParams.set('tab', tab);
  Object.entries(params).forEach(([k, v]) => {
    if (v != null && v !== '') url.searchParams.set(k, String(v));
  });
  return url.toString();
}

export function openDeepLink(tab, params = {}) {
  const url = buildDeepLink(tab, params);
  // Prefer SPA navigation if your app has a router interceptor; fallback to hard nav:
  window.location.href = url;
}