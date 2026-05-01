import { useAuthStore } from '../store/auth';

function getBase(): string {
  return '/api';
}

function buildUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }
  if (path.startsWith('/api/')) {
    const base = getBase();
    if (base === '/api') {
      return path;
    }
    return `${base}${path.slice('/api'.length)}`;
  }
  return `${getBase()}${path}`;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
    public readonly capability?: string,
    public readonly currentTier?: string,
    public readonly requiredTier?: string,
    public readonly currentValue?: number,
    public readonly limitValue?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type ApiErrorPayload = {
  error?: string;
  code?: string;
  capability?: string;
  current_tier?: string;
  required_tier?: string;
  current_value?: number;
  limit_value?: number;
};

async function request<T>(path: string, options: RequestInit = {}, retry = true): Promise<T> {
  const { accessToken, refreshToken, logout } = useAuthStore.getState();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    ...((options.headers as Record<string, string>) ?? {}),
  };

  const res = await fetch(buildUrl(path), { ...options, headers });

  if (res.status === 401 && retry && refreshToken) {
    const refreshed = await tryRefresh(refreshToken);
    if (refreshed) return request<T>(path, options, false);
    logout();
    throw new ApiError(401, 'Session expired — please log in again');
  }

  if (!res.ok) {
    const body: ApiErrorPayload = await res.json().catch(() => ({}));
    throw new ApiError(
      res.status,
      body.error ?? res.statusText,
      body.code,
      body.capability,
      body.current_tier,
      body.required_tier,
      body.current_value,
      body.limit_value,
    );
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

async function requestBytes(path: string, options: RequestInit = {}, retry = true): Promise<Uint8Array> {
  const { accessToken, refreshToken, logout } = useAuthStore.getState();

  const headers: Record<string, string> = {
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    ...((options.headers as Record<string, string>) ?? {}),
  };

  const res = await fetch(buildUrl(path), { ...options, headers });

  if (res.status === 401 && retry && refreshToken) {
    const refreshed = await tryRefresh(refreshToken);
    if (refreshed) return requestBytes(path, options, false);
    logout();
    throw new ApiError(401, 'Session expired — please log in again');
  }

  if (!res.ok) {
    const body: ApiErrorPayload = await res.json().catch(() => ({}));
    throw new ApiError(
      res.status,
      body.error ?? res.statusText,
      body.code,
      body.capability,
      body.current_tier,
      body.required_tier,
      body.current_value,
      body.limit_value,
    );
  }

  return new Uint8Array(await res.arrayBuffer());
}

async function tryRefresh(refreshToken: string): Promise<boolean> {
  try {
    const res = await fetch(`${getBase()}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!res.ok) return false;
    const data: { access_token: string } = await res.json();
    useAuthStore.getState().setAccessToken(data.access_token);
    return true;
  } catch {
    return false;
  }
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  getBytes: (path: string) => requestBytes(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  postBytes: <T>(
    path: string,
    body: BodyInit,
    contentType = 'application/octet-stream',
    extraHeaders: Record<string, string> = {},
  ) =>
    request<T>(path, {
      method: 'POST',
      body,
      headers: { 'Content-Type': contentType, ...extraHeaders },
    }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
