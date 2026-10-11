// Identity hook — reads the current user from /api/me, which itself reads
// the platform's SSO headers (X-Auth-Request-Email etc.).
//
// Usage in any component:
//   const { user, loading } = useCurrentUser();
//   if (loading) return <Spin />;
//   return <span>Hi {user.email}!</span>;
//
// The app never authenticates anyone. The platform's envoy gateway +
// oauth2-proxy already did that before the request reached this code.

import { useEffect, useState } from 'react';
import api from './api';

const ANONYMOUS = { email: null, user: null, preferred_username: null };

// One request per page load, however many components ask. The identity is
// fixed for the lifetime of the SSO session, so there is nothing to refetch.
let identity = null;

function fetchIdentity() {
  identity ??= api.get('/me').catch(() => {
    // No gateway in front (local dev) or a transient backend error —
    // render a generic user rather than blocking the whole UI.
    identity = null; // let a later mount retry
    return ANONYMOUS;
  });
  return identity;
}

export function useCurrentUser() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchIdentity().then((data) => {
      if (cancelled) return;
      setUser(data);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return { user, loading };
}

// One-shot logout — redirects to oauth2-proxy's sign-out endpoint, which
// clears the cookie on .shared-dev.swipejobs.com then bounces back here.
export function logout() {
  window.location.href = `/oauth2/sign_out?rd=${encodeURIComponent(window.location.origin)}`;
}
