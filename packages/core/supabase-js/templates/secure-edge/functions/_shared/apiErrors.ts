import { jsonResponse } from './http.ts';

export function jsonUnauthorized(req: Request, message = 'Missing or invalid JWT') {
  return jsonResponse(req, { error: 'unauthorized', message }, 401);
}

export function jsonForbidden(req: Request, message: string) {
  return jsonResponse(req, { error: 'forbidden', message }, 403);
}

export function jsonNotFound(req: Request, message: string) {
  return jsonResponse(req, { error: 'not_found', message }, 404);
}

export function jsonMethodNotAllowed(req: Request, message = 'Method not allowed') {
  return jsonResponse(req, { error: 'method_not_allowed', message }, 405);
}

export function jsonInvalidBody(req: Request, message: string, details?: unknown) {
  const body: Record<string, unknown> = { error: 'invalid_body', message };
  if (details !== undefined) body.details = details;
  return jsonResponse(req, body, 400);
}

export function jsonInternalError(req: Request, message = 'An unexpected error occurred') {
  return jsonResponse(req, { error: 'internal_error', message }, 500);
}

export function jsonServerMisconfigured(req: Request, message = 'Server configuration error') {
  return jsonResponse(req, { error: 'server_misconfigured', message }, 500);
}

export function jsonRateLimited(req: Request, retryAfterSeconds: number) {
  return jsonResponse(req, { error: 'rate_limited', retry_after_seconds: retryAfterSeconds }, 429, {
    'Retry-After': String(retryAfterSeconds),
  });
}
