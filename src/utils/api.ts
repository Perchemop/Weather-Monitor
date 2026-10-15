/**
 * Shared browser API client.
 *
 * Authentication uses the HttpOnly `cwm_session` cookie, which the browser
 * attaches automatically for same-origin requests (fetch defaults to
 * `credentials: 'same-origin'`). To defend against CSRF we echo the readable
 * `cwm_csrf` cookie in the `x-csrf-token` header on state-changing requests.
 *
 * No session token is ever stored in JavaScript-accessible storage.
 */

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function readCsrfToken(): string {
  const match = document.cookie.match(/(?:^|;\s*)cwm_csrf=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : '';
}

export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const method = (init.method || 'GET').toUpperCase();
  const headers = new Headers(init.headers || {});

  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  if (MUTATING_METHODS.has(method)) {
    const csrf = readCsrfToken();
    if (csrf) headers.set('x-csrf-token', csrf);
  }

  return fetch(input, {
    ...init,
    method,
    headers,
    credentials: 'same-origin'
  });
}

/** Convenience wrapper that parses JSON and surfaces API error messages. */
export async function apiJson<T = any>(input: string, init: RequestInit = {}): Promise<T> {
  const res = await apiFetch(input, init);
  const text = await res.text();
  let data: any = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: text };
    }
  }
  if (!res.ok) {
    const error = new Error((data && data.error) || `Request failed with status ${res.status}`);
    (error as any).status = res.status;
    (error as any).data = data;
    throw error;
  }
  return data as T;
}
