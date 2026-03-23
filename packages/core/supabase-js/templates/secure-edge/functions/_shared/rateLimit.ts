const store = new Map<string, number[]>();
const WINDOW_MS = 60_000;

function prune(now: number, key: string) {
  const times = store.get(key) ?? [];
  const kept = times.filter((t) => now - t < WINDOW_MS);
  if (kept.length === 0) store.delete(key);
  else store.set(key, kept);
}

export function checkRateLimit(identifier: string, limit: number): { retryAfterSeconds: number } | null {
  const now = Date.now();
  prune(now, identifier);
  const times = store.get(identifier) ?? [];
  if (times.length >= limit) {
    const oldest = Math.min(...times);
    return { retryAfterSeconds: Math.ceil((oldest + WINDOW_MS - now) / 1000) };
  }
  times.push(now);
  store.set(identifier, times);
  return null;
}

export function getIdentifier(req: Request, userId: string | null): string {
  if (userId) return `user:${userId}`;
  const forwarded = req.headers.get('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0]!.trim() : req.headers.get('cf-connecting-ip') ?? 'unknown';
  return `ip:${ip}`;
}

export async function checkRateLimitWithPolicy(options: {
  identifier: string;
  limit: number;
  adminClient: {
    schema: (schema: string) => {
      from: (table: string) => any;
    };
  };
  schemaName?: string;
}): Promise<{ retryAfterSeconds: number } | null> {
  const mode = (Deno.env.get('SECURITY_RATE_LIMIT_MODE') ?? 'memory').toLowerCase();
  if (mode !== 'database') {
    return checkRateLimit(options.identifier, options.limit);
  }

  const schemaName = options.schemaName ?? Deno.env.get('SECURITY_SCHEMA') ?? 'security';
  const table = options.adminClient.schema(schemaName).from('rate_limits');
  const now = Date.now();

  const { data: row, error: readErr } = await table
    .select('identifier, window_start, hits')
    .eq('identifier', options.identifier)
    .maybeSingle();
  if (readErr) {
    // Fail-open to in-memory limiter if DB table isn't ready.
    return checkRateLimit(options.identifier, options.limit);
  }

  if (!row) {
    await table.insert({
      identifier: options.identifier,
      window_start: new Date(now).toISOString(),
      hits: 1,
    });
    return null;
  }

  const windowStartMs = Date.parse(String(row.window_start ?? ''));
  const hits = Number(row.hits ?? 0);
  if (!Number.isFinite(windowStartMs) || now - windowStartMs >= WINDOW_MS) {
    await table
      .update({
        window_start: new Date(now).toISOString(),
        hits: 1,
      })
      .eq('identifier', options.identifier);
    return null;
  }

  if (hits >= options.limit) {
    return { retryAfterSeconds: Math.ceil((windowStartMs + WINDOW_MS - now) / 1000) };
  }

  await table
    .update({
      hits: hits + 1,
    })
    .eq('identifier', options.identifier);
  return null;
}
