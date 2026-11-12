import type { ApiError } from '../../../src/shared/contracts';

export class RequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
  }
}

/** All requests stay on the application's origin; optional Basic Auth is browser-managed. */
export async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        ...(method !== 'GET' ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    throw new RequestError(
      'Die Verbindung wurde unterbrochen. Bitte versuche es erneut.',
      0,
      'NETWORK_ERROR',
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new RequestError(
      'Die Serverantwort ist unvollständig. Bitte prüfe die Aktion erneut.',
      response.status,
      'INVALID_RESPONSE',
    );
  }

  if (!response.ok) {
    const error = payload as ApiError;
    throw new RequestError(
      error.error?.message || 'Die Aktion konnte nicht ausgeführt werden.',
      response.status,
      error.error?.code || 'REQUEST_ERROR',
    );
  }
  return payload as T;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Die Aktion konnte nicht ausgeführt werden.';
}
