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

function offlineOnly(path: string): never {
  throw new ApiError(
    501,
    `Server API disabled in FOSS offline mode: ${path}`,
    'offline_only',
  );
}

export const api = {
  get: <T>(path: string) => Promise.reject<T>(offlineOnly(path)),
  getBytes: (path: string) => Promise.reject<Uint8Array>(offlineOnly(path)),
  post: <T>(path: string, _body: unknown) => Promise.reject<T>(offlineOnly(path)),
  patch: <T>(path: string, _body: unknown) => Promise.reject<T>(offlineOnly(path)),
  postBytes: <T>(path: string, _body: BodyInit, _contentType = 'application/octet-stream', _extraHeaders: Record<string, string> = {}) =>
    Promise.reject<T>(offlineOnly(path)),
  put: <T>(path: string, _body: unknown) => Promise.reject<T>(offlineOnly(path)),
  delete: <T>(path: string) => Promise.reject<T>(offlineOnly(path)),
};
