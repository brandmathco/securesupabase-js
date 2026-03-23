import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { z } from 'https://deno.land/x/zod@v3.23.8/mod.ts';
import {
  jsonInternalError,
  jsonInvalidBody,
  jsonMethodNotAllowed,
  jsonRateLimited,
  jsonServerMisconfigured,
  jsonUnauthorized,
} from '../_shared/apiErrors.ts';
import { preflightResponse } from '../_shared/cors.ts';
import { parseMaybeEncryptedRequest } from '../_shared/e2ee.ts';
import { jsonEncryptedResponse, jsonResponse } from '../_shared/http.ts';
import { checkRateLimitWithPolicy, getIdentifier } from '../_shared/rateLimit.ts';
import { checkBlockedWithPolicy, logSecurityContext } from '../_shared/security.ts';
import { createClient } from '../_shared/securesupabase.ts';

const RATE_PER_MIN = 40;

const bodySchema = z
  .object({
    action: z.enum(['sign_in', 'sign_up', 'reset_password', 'sign_out', 'refresh_session']),
    email: z.string().email().optional(),
    password: z.string().min(8).optional(),
    display_name: z.string().min(1).max(120).optional(),
    redirect_to: z.string().url().optional(),
    refresh_token: z.string().min(1).optional(),
  })
  .strict();

function gotrueRequest(
  supabaseUrl: string,
  anonKey: string,
  path: string,
  method: 'POST',
  body: Record<string, unknown>,
  authHeader?: string,
): Promise<Response> {
  const headers: Record<string, string> = {
    apikey: anonKey,
    'Content-Type': 'application/json',
  };
  if (authHeader) headers.Authorization = authHeader;
  return fetch(`${supabaseUrl}/auth/v1${path}`, {
    method,
    headers,
    body: JSON.stringify(body),
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return preflightResponse(req);
  if (req.method !== 'POST') return jsonMethodNotAllowed(req);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    if (!supabaseUrl || !anonKey || !serviceKey) return jsonServerMisconfigured(req);
    const admin = createClient(supabaseUrl, serviceKey);

    const blocked = await checkBlockedWithPolicy({ req, adminClient: admin });
    if (blocked) {
      logSecurityContext(req, 'auth_proxy_blocked');
      return blocked;
    }

    const rate = await checkRateLimitWithPolicy({
      identifier: getIdentifier(req, null),
      limit: RATE_PER_MIN,
      adminClient: admin,
    });
    if (rate) {
      logSecurityContext(req, 'auth_proxy_rate_limited', { retry_after_seconds: rate.retryAfterSeconds });
      return jsonRateLimited(req, rate.retryAfterSeconds);
    }

    const { payload: raw, aesKey } = await parseMaybeEncryptedRequest<unknown>(req);
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      logSecurityContext(req, 'auth_proxy_invalid_body');
      return jsonInvalidBody(req, 'Request body validation failed', parsed.error.flatten());
    }

    const input = parsed.data;
    const blockedEmail = await checkBlockedWithPolicy({
      req,
      adminClient: admin,
      email: input.email ?? null,
    });
    if (blockedEmail) {
      logSecurityContext(req, 'auth_proxy_blocked_email');
      return blockedEmail;
    }
    let upstream: Response;
    if (input.action === 'sign_in') {
      if (!input.email || !input.password) return jsonInvalidBody(req, 'email and password are required');
      upstream = await gotrueRequest(supabaseUrl, anonKey, '/token?grant_type=password', 'POST', {
        email: input.email,
        password: input.password,
      });
    } else if (input.action === 'sign_up') {
      if (!input.email || !input.password) return jsonInvalidBody(req, 'email and password are required');
      upstream = await gotrueRequest(supabaseUrl, anonKey, '/signup', 'POST', {
        email: input.email,
        password: input.password,
        data: input.display_name ? { display_name: input.display_name } : undefined,
      });
    } else if (input.action === 'reset_password') {
      if (!input.email) return jsonInvalidBody(req, 'email is required');
      upstream = await gotrueRequest(supabaseUrl, anonKey, '/recover', 'POST', {
        email: input.email,
        ...(input.redirect_to ? { redirect_to: input.redirect_to } : {}),
      });
    } else if (input.action === 'refresh_session') {
      if (!input.refresh_token) return jsonInvalidBody(req, 'refresh_token is required');
      upstream = await gotrueRequest(supabaseUrl, anonKey, '/token?grant_type=refresh_token', 'POST', {
        refresh_token: input.refresh_token,
      });
    } else {
      const authHeader = req.headers.get('Authorization') ?? undefined;
      if (!authHeader?.startsWith('Bearer ')) {
        logSecurityContext(req, 'auth_proxy_unauthorized_sign_out');
        return jsonUnauthorized(req);
      }
      upstream = await gotrueRequest(supabaseUrl, anonKey, '/logout', 'POST', {}, authHeader);
    }

    const text = await upstream.text();
    const parsedJson = text ? JSON.parse(text) : {};
    const body = { ok: upstream.ok, status: upstream.status, data: parsedJson };
    if (aesKey) return await jsonEncryptedResponse(req, body, upstream.ok ? 200 : upstream.status, aesKey);
    return jsonResponse(req, body, upstream.ok ? 200 : upstream.status);
  } catch (error) {
    console.error('auth-proxy unhandled', error);
    logSecurityContext(req, 'auth_proxy_unhandled_error');
    return jsonInternalError(req);
  }
});
