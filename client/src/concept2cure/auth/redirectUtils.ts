export const computeRedirect = (
  search = typeof window !== 'undefined' ? window.location.search : '',
  userArg?: any,
  userGetter?: () => any
) => {
  try {
    const params = new URLSearchParams(search);
    const next = params.get('next') || params.get('returnTo') || params.get('redirect');
    if (next) {
      // Reject if there is leading/trailing or internal whitespace (suspicious value)
      if (next !== next.trim() || /\s/.test(next)) {
        // suspicious next param - ignore it
      } else {
        // Robust handling: trim whitespace, allow percent-encoded values, handle up to double-encoding safely
        let candidate = next.trim();
        try {
          // Decode once if needed
          const decodedOnce = decodeURIComponent(candidate);
          if (decodedOnce && decodedOnce !== candidate) candidate = decodedOnce;
        } catch (e) {
          // ignore decode errors
        }

        try {
          // Attempt a second decode for double-encoded values
          const decodedTwice = decodeURIComponent(candidate);
          if (decodedTwice && decodedTwice !== candidate) candidate = decodedTwice;
        } catch (e) {
          // ignore decode errors
        }

        if (candidate.startsWith('/') && !candidate.startsWith('//')) return candidate;
      }
    }
  } catch (e) {
    // ignore malformed search
  }

  const curUser = userArg ?? (userGetter ? userGetter() : undefined);
  // Only redirect to /client-portal for explicit client-portal role holders.
  // Admin/editor users also have an organizationId — do NOT send them to the client portal.
  if (curUser?.roles?.includes('client_admin') || curUser?.roles?.includes('client_user')) {
    return '/client-portal';
  }
  return '/concept2cure';
};
