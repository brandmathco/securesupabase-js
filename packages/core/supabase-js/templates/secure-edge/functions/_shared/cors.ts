declare const Deno: { env: { get(name: string): string | undefined } };

function parseCsv(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

function getAllowedOrigins(): string[] {
  return parseCsv(Deno.env.get('CORS_ALLOWED_ORIGINS'));
}

function isAllowedOrigin(origin: string | null, allowedOrigins: string[]): boolean {
  if (!origin) return true;
  if (allowedOrigins.length === 0) return true;
  if (allowedOrigins.includes('*')) return true;
  return allowedOrigins.includes(origin);
}

function resolveAllowOrigin(origin: string | null, allowedOrigins: string[]): string {
  if (allowedOrigins.length === 0) return '*';
  if (allowedOrigins.includes('*')) return '*';
  if (origin && allowedOrigins.includes(origin)) return origin;
  if (!origin) return allowedOrigins[0] ?? '*';
  return 'null';
}

function allowCredentials(): boolean {
  return (Deno.env.get('CORS_ALLOW_CREDENTIALS') ?? 'false').toLowerCase() === 'true';
}

export function buildCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin');
  const allowedOrigins = getAllowedOrigins();
  const allowedHeaders =
    Deno.env.get('CORS_ALLOWED_HEADERS') ?? 'authorization, x-client-info, apikey, content-type, x-requested-with';
  const allowedMethods = Deno.env.get('CORS_ALLOWED_METHODS') ?? 'POST,OPTIONS';
  const maxAge = Deno.env.get('CORS_MAX_AGE_SECONDS') ?? '86400';
  const originHeader = resolveAllowOrigin(origin, allowedOrigins);
  const headers: Record<string, string> = {
    'Access-Control-Allow-Origin': originHeader,
    'Access-Control-Allow-Headers': allowedHeaders,
    'Access-Control-Allow-Methods': allowedMethods,
    'Access-Control-Max-Age': maxAge,
    Vary: 'Origin',
  };
  if (allowCredentials() && originHeader !== '*') {
    headers['Access-Control-Allow-Credentials'] = 'true';
  }
  return headers;
}

export function corsForbidden(req: Request): Response {
  return new Response(
    JSON.stringify({
      error: 'forbidden_origin',
      message: 'CORS origin is not allowed',
    }),
    {
      status: 403,
      headers: {
        ...buildCorsHeaders(req),
        'Content-Type': 'application/json',
      },
    },
  );
}

export function preflightResponse(req: Request): Response {
  const origin = req.headers.get('origin');
  const allowedOrigins = getAllowedOrigins();
  if (!isAllowedOrigin(origin, allowedOrigins)) return corsForbidden(req);
  return new Response('ok', { headers: buildCorsHeaders(req) });
}
