import { jsonForbidden } from './apiErrors.ts';

function parseCsvSet(value: string | undefined): Set<string> {
  if (!value) return new Set<string>();
  return new Set(
    value
      .split(',')
      .map((v) => v.trim().toLowerCase())
      .filter(Boolean),
  );
}

function parseBool(value: string | undefined, fallback = false): boolean {
  if (!value) return fallback;
  const normalized = value.trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on';
}

function getHeader(req: Request, name: string): string | null {
  const value = req.headers.get(name);
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function getFirstForwardedIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]!.trim().toLowerCase();
  return (req.headers.get('cf-connecting-ip') ?? 'unknown').trim().toLowerCase();
}

function hashPrefix(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function hashIdentifier(value: string): string {
  const salt = Deno.env.get('SECURITY_CONTEXT_HASH_SALT') ?? '';
  return hashPrefix(`${salt}:${value}`);
}

function shouldLogDeviceContext(): boolean {
  return parseBool(Deno.env.get('SECURITY_LOG_DEVICE_CONTEXT'), false);
}

export function getDeviceContext(req: Request): Record<string, string | null> {
  const ip = getFirstForwardedIp(req);
  return {
    ip_hash: hashIdentifier(ip),
    region: getHeader(req, 'x-region') ?? getHeader(req, 'fly-region') ?? null,
    country: getHeader(req, 'cf-ipcountry') ?? getHeader(req, 'x-vercel-ip-country') ?? null,
    asn: getHeader(req, 'cf-asn') ?? getHeader(req, 'x-asn') ?? null,
    user_agent: getHeader(req, 'user-agent'),
    platform: getHeader(req, 'sec-ch-ua-platform'),
    mobile: getHeader(req, 'sec-ch-ua-mobile'),
    accept_language: getHeader(req, 'accept-language'),
    origin: getHeader(req, 'origin'),
    referer: getHeader(req, 'referer'),
  };
}

export function logSecurityContext(
  req: Request,
  event: string,
  extra?: Record<string, string | number | boolean | null>,
): void {
  if (!shouldLogDeviceContext()) return;
  const context = getDeviceContext(req);
  console.warn(
    JSON.stringify({
      event,
      context,
      ...(extra ?? {}),
    }),
  );
}

export function getRequestIp(req: Request): string {
  return getFirstForwardedIp(req);
}

export function checkBlockedIp(req: Request): Response | null {
  const blockedIps = parseCsvSet(Deno.env.get('SECURITY_BLOCKED_IPS'));
  if (blockedIps.size === 0) return null;
  const ip = getRequestIp(req);
  if (blockedIps.has(ip)) return jsonForbidden(req, 'Access denied');
  return null;
}

export function checkBlockedUser(req: Request, userId: string, email?: string | null): Response | null {
  const blockedUserIds = parseCsvSet(Deno.env.get('SECURITY_BLOCKED_USER_IDS'));
  if (blockedUserIds.has(userId.toLowerCase())) return jsonForbidden(req, 'Access denied');
  const blockedEmails = parseCsvSet(Deno.env.get('SECURITY_BLOCKED_EMAILS'));
  if (email && blockedEmails.has(email.toLowerCase())) return jsonForbidden(req, 'Access denied');
  return null;
}

export function checkBlockedEmail(req: Request, email?: string): Response | null {
  if (!email) return null;
  const blockedEmails = parseCsvSet(Deno.env.get('SECURITY_BLOCKED_EMAILS'));
  if (blockedEmails.has(email.toLowerCase())) return jsonForbidden(req, 'Access denied');
  return null;
}

export async function checkBlockedWithPolicy(options: {
  req: Request;
  adminClient?: {
    schema: (schema: string) => {
      from: (table: string) => any;
    };
  };
  userId?: string | null;
  email?: string | null;
}): Promise<Response | null> {
  const byIp = checkBlockedIp(options.req);
  if (byIp) return byIp;

  if (options.userId) {
    const byUser = checkBlockedUser(options.req, options.userId, options.email);
    if (byUser) return byUser;
  } else if (options.email) {
    const byEmail = checkBlockedEmail(options.req, options.email ?? undefined);
    if (byEmail) return byEmail;
  }

  const mode = (Deno.env.get('SECURITY_BLOCKLIST_MODE') ?? 'env').toLowerCase();
  if (mode !== 'database' || !options.adminClient) return null;

  const schemaName = Deno.env.get('SECURITY_SCHEMA') ?? 'security';
  const table = options.adminClient.schema(schemaName).from('blocklist');
  const nowIso = new Date().toISOString();

  const checks: Array<{ block_type: string; value: string }> = [];
  const ip = getRequestIp(options.req);
  if (ip) checks.push({ block_type: 'ip', value: ip.toLowerCase() });
  if (options.userId) checks.push({ block_type: 'user_id', value: options.userId.toLowerCase() });
  if (options.email) checks.push({ block_type: 'email', value: options.email.toLowerCase() });
  if (checks.length === 0) return null;

  for (const check of checks) {
    const { data, error } = await table
      .select('id')
      .eq('active', true)
      .eq('block_type', check.block_type)
      .eq('value', check.value)
      .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
      .maybeSingle();
    if (error) continue;
    if (data) return jsonForbidden(options.req, 'Access denied');
  }

  return null;
}
