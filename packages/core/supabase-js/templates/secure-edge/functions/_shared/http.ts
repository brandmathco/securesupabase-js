import { buildCorsHeaders } from './cors.ts';
import { buildEncryptedResponse } from './e2ee.ts';

export function jsonResponse(req: Request, body: unknown, status: number, extra?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...buildCorsHeaders(req), 'Content-Type': 'application/json', ...extra },
  });
}

export async function jsonEncryptedResponse(
  req: Request,
  body: unknown,
  status: number,
  aesKey: CryptoKey,
  extra?: Record<string, string>,
): Promise<Response> {
  const envelope = await buildEncryptedResponse(body, aesKey);
  return new Response(JSON.stringify(envelope), {
    status,
    headers: { ...buildCorsHeaders(req), 'Content-Type': 'application/json', 'x-e2ee': '1', ...extra },
  });
}
