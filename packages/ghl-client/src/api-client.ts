/**
 * Cliente HTTP genérico para la API GHL v2 (LeadConnector).
 *
 * Base URL: https://services.leadconnectorhq.com
 * Auth obligatoria por request:
 *   - Authorization: Bearer <api_token>
 *   - Version: 2021-07-28
 *   - Accept: application/json
 *
 * No reintenta nada por sí solo (el caller decide). Lanza GhlApiError con el
 * cuerpo parseado si la response no es 2xx.
 */

const DEFAULT_BASE_URL = 'https://services.leadconnectorhq.com';
const DEFAULT_VERSION_HEADER = '2021-07-28';

export class GhlApiError extends Error {
  readonly status: number;
  readonly body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = 'GhlApiError';
    this.status = status;
    this.body = body;
  }
}

export interface GhlRequestOptions {
  apiToken: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  baseUrl?: string;
  version?: string;
  fetchImpl?: typeof fetch;
}

export async function ghlRequest<T = unknown>(opts: GhlRequestOptions): Promise<T> {
  const {
    apiToken,
    method,
    path,
    query,
    body,
    baseUrl = DEFAULT_BASE_URL,
    version = DEFAULT_VERSION_HEADER,
    fetchImpl = fetch,
  } = opts;

  if (!apiToken) throw new Error('ghlRequest: apiToken requerido');

  const url = buildUrl(baseUrl, path, query);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiToken}`,
    Version: version,
    Accept: 'application/json',
  };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const init: RequestInit = { method, headers };
  if (body !== undefined) init.body = JSON.stringify(body);

  const response = await fetchImpl(url, init);

  let parsed: unknown = null;
  if (response.status !== 204) {
    const text = await response.text();
    if (text.length > 0) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
    }
  }

  if (!response.ok) {
    throw new GhlApiError(
      `GHL ${method} ${path} failed: HTTP ${response.status}`,
      response.status,
      parsed,
    );
  }

  return parsed as T;
}

function buildUrl(baseUrl: string, path: string, query?: Record<string, string | number | undefined>): string {
  const cleanBase = baseUrl.replace(/\/$/, '');
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const url = new URL(`${cleanBase}${cleanPath}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}
