// Minimal fetch wrapper. No axios: the SPA is same-origin with the API in
// both dev (Vite proxy) and prod (one uvicorn serves both), so there is
// nothing to configure beyond a base path and JSON encode/decode.
//
// No auth interceptor either — identity comes from the platform's SSO
// headers injected by envoy ext_authz upstream. The app never sees a token.
// A 401 means the gateway session expired; a reload lands on the SSO
// sign-in page. See ./me.js.

const BASE_URL = import.meta.env.VITE_API_URL || '/api';

export class ApiError extends Error {
  constructor(status, detail) {
    super(detail || `Request failed with status ${status}`);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request(path, { method = 'GET', body, signal } = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    signal,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!response.ok) {
    // FastAPI errors are {"detail": ...}; anything else (a gateway 502,
    // an HTML error page) must not blow up the JSON parse.
    const detail = await response.json().then((data) => data?.detail, () => null);
    throw new ApiError(response.status, typeof detail === 'string' ? detail : undefined);
  }

  return response.status === 204 ? null : response.json();
}

export const api = {
  get: (path, options) => request(path, options),
  post: (path, body) => request(path, { method: 'POST', body }),
  patch: (path, body) => request(path, { method: 'PATCH', body }),
  delete: (path) => request(path, { method: 'DELETE' }),
};

export default api;
