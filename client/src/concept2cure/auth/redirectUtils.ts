export const computeRedirect = (
  search = typeof window !== 'undefined' ? window.location.search : '',
  userArg?: any,
  userGetter?: () => any
) => {
  try {
    const params = new URLSearchParams(search);
    const next = params.get('next') || params.get('returnTo') || params.get('redirect');
    if (next && next.startsWith('/') && !next.startsWith('//')) return next;
  } catch (e) {
    // ignore malformed search
  }

  const curUser = userArg ?? (userGetter ? userGetter() : undefined);
  if (curUser?.organizationId) return '/client-portal';
  if (curUser?.roles?.includes('client_admin') || curUser?.roles?.includes('client_user')) return '/client-portal';
  return '/concept2cure';
};
