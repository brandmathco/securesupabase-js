import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from '../_shared/securesupabase.ts';
import { jsonServerMisconfigured, jsonUnauthorized } from '../_shared/apiErrors.ts';
import { preflightResponse } from '../_shared/cors.ts';
import { jsonResponse } from '../_shared/http.ts';
import { checkBlockedWithPolicy, logSecurityContext } from '../_shared/security.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') return preflightResponse(req);
  if (req.method !== 'POST') return jsonResponse(req, { error: 'method_not_allowed' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    logSecurityContext(req, 'e2ee_public_key_unauthorized');
    return jsonUnauthorized(req);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return jsonServerMisconfigured(req);

  const admin = createClient(supabaseUrl, serviceKey);
  const blocked = await checkBlockedWithPolicy({ req, adminClient: admin });
  if (blocked) {
    logSecurityContext(req, 'e2ee_public_key_blocked');
    return blocked;
  }
  const jwt = authHeader.replace('Bearer ', '');
  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  if (userErr || !userData.user) {
    logSecurityContext(req, 'e2ee_public_key_invalid_jwt');
    return jsonUnauthorized(req);
  }
  const blockedUser = await checkBlockedWithPolicy({
    req,
    adminClient: admin,
    userId: userData.user.id,
    email: userData.user.email,
  });
  if (blockedUser) {
    logSecurityContext(req, 'e2ee_public_key_blocked_user', { user_id: userData.user.id });
    return blockedUser;
  }

  const publicKeyB64 = Deno.env.get('E2EE_RSA_PUBLIC_KEY_B64');
  if (!publicKeyB64) return jsonServerMisconfigured(req);

  return jsonResponse(req, { public_key_b64: publicKeyB64 }, 200);
});
