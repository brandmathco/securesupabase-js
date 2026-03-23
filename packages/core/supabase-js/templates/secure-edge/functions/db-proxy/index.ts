import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from '../_shared/securesupabase.ts';
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

const RATE_PER_MIN = 120;
const IDENTIFIER_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

function parseCsvAllowlist(raw: string | undefined): Set<string> | null {
  if (!raw) return null;
  const items = raw
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
  return items.length > 0 ? new Set(items) : null;
}

function assertAllowed(name: string, allowlist: Set<string> | null, label: string) {
  if (!allowlist) return;
  if (!allowlist.has(name)) {
    throw new Error(`${label} is not allowed`);
  }
}

const filterSchema = z
  .object({
    op: z.enum([
      'eq',
      'neq',
      'gt',
      'gte',
      'lt',
      'lte',
      'like',
      'ilike',
      'is',
      'in',
      'contains',
      'containedBy',
      'rangeGt',
      'rangeGte',
      'rangeLt',
      'rangeLte',
      'rangeAdjacent',
      'overlaps',
      'textSearch',
      'match',
      'not',
      'or',
      'filter',
    ]),
    column: z.string().min(1),
    value: z.unknown().optional(),
    values: z.array(z.unknown()).optional(),
    config: z.record(z.string(), z.unknown()).optional(),
    operator: z.string().optional(),
  })
  .strict();

const tableRequestSchema = z
  .object({
    kind: z.literal('table'),
    schema: z.string().min(1).optional(),
    table: z.string().min(1),
    action: z.enum(['select', 'insert', 'update', 'delete', 'upsert']),
    select: z.string().optional(),
    filters: z.array(filterSchema).optional(),
    orderBy: z
      .array(
        z
          .object({
            column: z.string().min(1),
            ascending: z.boolean().optional(),
            nullsFirst: z.boolean().optional(),
            referencedTable: z.string().optional(),
          })
          .strict(),
      )
      .optional(),
    limit: z.number().int().positive().max(500).optional(),
    range: z
      .object({
        from: z.number().int().min(0),
        to: z.number().int().min(0),
      })
      .strict()
      .optional(),
    single: z.enum(['single', 'maybeSingle']).optional(),
    format: z.enum(['json', 'csv']).optional(),
    count: z.enum(['exact', 'planned', 'estimated']).optional(),
    head: z.boolean().optional(),
    values: z.union([z.record(z.string(), z.unknown()), z.array(z.record(z.string(), z.unknown()))]).optional(),
    onConflict: z.string().optional(),
  })
  .strict();

const rpcRequestSchema = z
  .object({
    kind: z.literal('rpc'),
    schema: z.string().min(1).optional(),
    name: z.string().min(1),
    args: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

const requestSchema = z.union([tableRequestSchema, rpcRequestSchema]);

function assertIdentifier(value: string, label: string): string {
  if (!IDENTIFIER_RE.test(value)) throw new Error(`Invalid ${label}`);
  return value;
}

function applyFilters(
  query: any,
  filters: z.infer<typeof filterSchema>[] | undefined,
  allowedOperators: Set<string> | null,
) {
  let next = query;
  for (const filter of filters ?? []) {
    assertAllowed(filter.op, allowedOperators, 'operator');
    const column = assertIdentifier(filter.column, 'column');
    switch (filter.op) {
      case 'eq':
        next = next.eq(column, filter.value ?? null);
        break;
      case 'neq':
        next = next.neq(column, filter.value ?? null);
        break;
      case 'gt':
        next = next.gt(column, filter.value ?? null);
        break;
      case 'gte':
        next = next.gte(column, filter.value ?? null);
        break;
      case 'lt':
        next = next.lt(column, filter.value ?? null);
        break;
      case 'lte':
        next = next.lte(column, filter.value ?? null);
        break;
      case 'like':
        next = next.like(column, String(filter.value ?? ''));
        break;
      case 'ilike':
        next = next.ilike(column, String(filter.value ?? ''));
        break;
      case 'is':
        next = next.is(column, filter.value ?? null);
        break;
      case 'in':
        next = next.in(column, filter.values ?? []);
        break;
      case 'contains':
        next = next.contains(column, filter.value ?? null);
        break;
      case 'containedBy':
        next = next.containedBy(column, filter.value ?? null);
        break;
      case 'rangeGt':
        next = next.rangeGt(column, filter.value ?? null);
        break;
      case 'rangeGte':
        next = next.rangeGte(column, filter.value ?? null);
        break;
      case 'rangeLt':
        next = next.rangeLt(column, filter.value ?? null);
        break;
      case 'rangeLte':
        next = next.rangeLte(column, filter.value ?? null);
        break;
      case 'rangeAdjacent':
        next = next.rangeAdjacent(column, filter.value ?? null);
        break;
      case 'overlaps':
        next = next.overlaps(column, filter.value ?? null);
        break;
      case 'textSearch':
        next = next.textSearch(column, String(filter.value ?? ''), (filter.config ?? {}) as Record<string, unknown>);
        break;
      case 'match':
        next = next.match((filter.value ?? {}) as Record<string, unknown>);
        break;
      case 'not':
        next = next.not(column, filter.operator ?? 'eq', String(filter.value ?? ''));
        break;
      case 'or':
        next = next.or(String(filter.value ?? ''), (filter.config ?? {}) as Record<string, unknown>);
        break;
      case 'filter':
        next = next.filter(column, filter.operator ?? 'eq', String(filter.value ?? ''));
        break;
      default:
        break;
    }
  }
  return next;
}

async function runTableOperation(req: z.infer<typeof tableRequestSchema>, userClient: any) {
  const allowedTables = parseCsvAllowlist(Deno.env.get('DB_PROXY_ALLOWED_TABLES'));
  const allowedOperators = parseCsvAllowlist(Deno.env.get('DB_PROXY_ALLOWED_OPERATORS'));
  const allowedSchemas = parseCsvAllowlist(Deno.env.get('DB_PROXY_ALLOWED_SCHEMAS'));
  const defaultSchema = Deno.env.get('DB_PROXY_DEFAULT_SCHEMA') ?? 'public';
  const schemaName = req.schema ?? defaultSchema;
  assertAllowed(schemaName, allowedSchemas, 'schema');
  const table = assertIdentifier(req.table, 'table');
  assertAllowed(table, allowedTables, 'table');
  const scopedClient: any = userClient.schema(schemaName);
  if (req.action === 'insert') {
    const builder = scopedClient.from(table).insert(req.values ?? {});
    const query = req.select ? builder.select(req.select) : builder;
    const { data, error } = await query;
    if (error) throw error;
    return data;
  }

  if (req.action === 'upsert') {
    const builder = scopedClient.from(table).upsert(req.values ?? {}, req.onConflict ? { onConflict: req.onConflict } : undefined);
    const query = req.select ? builder.select(req.select) : builder;
    const { data, error } = await query;
    if (error) throw error;
    return data;
  }

  let query: any;
  if (req.action === 'select') {
    query = scopedClient.from(table).select(req.select ?? '*', { count: req.count, head: req.head ?? false });
  } else if (req.action === 'update') {
    const builder = scopedClient.from(table).update(req.values ?? {});
    query = req.select ? builder.select(req.select) : builder;
  } else {
    const builder = scopedClient.from(table).delete();
    query = req.select ? builder.select(req.select) : builder;
  }

  query = applyFilters(query, req.filters, allowedOperators);
  for (const order of req.orderBy ?? []) {
    query = query.order(assertIdentifier(order.column, 'orderBy column'), {
      ascending: order.ascending ?? true,
      nullsFirst: order.nullsFirst,
      referencedTable: order.referencedTable,
    });
  }
  if (req.limit) query = query.limit(req.limit);
  if (req.range) query = query.range(req.range.from, req.range.to);
  if (req.single === 'single') {
    const { data, error } = await query.single();
    if (error) throw error;
    return data;
  }
  if (req.single === 'maybeSingle') {
    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    return data;
  }
  if (req.format === 'csv') {
    const { data, error } = await query.csv();
    if (error) throw error;
    return data;
  }
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

async function runRpcOperation(req: z.infer<typeof rpcRequestSchema>, userClient: any) {
  const allowedRpcs = parseCsvAllowlist(Deno.env.get('DB_PROXY_ALLOWED_RPCS'));
  const allowedSchemas = parseCsvAllowlist(Deno.env.get('DB_PROXY_ALLOWED_SCHEMAS'));
  const defaultSchema = Deno.env.get('DB_PROXY_DEFAULT_SCHEMA') ?? 'public';
  const schemaName = req.schema ?? defaultSchema;
  assertAllowed(schemaName, allowedSchemas, 'schema');
  const name = assertIdentifier(req.name, 'rpc name');
  assertAllowed(name, allowedRpcs, 'rpc');
  const { data, error } = await userClient.schema(schemaName).rpc(name, req.args ?? {});
  if (error) throw error;
  return data;
}

serve(async (request) => {
  if (request.method === 'OPTIONS') return preflightResponse(request);
  if (request.method !== 'POST') return jsonMethodNotAllowed(request);
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      logSecurityContext(request, 'db_proxy_unauthorized');
      return jsonUnauthorized(request);
    }
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    if (!supabaseUrl || !serviceKey || !anonKey) return jsonServerMisconfigured(request);
    const admin = createClient(supabaseUrl, serviceKey);
    const jwt = authHeader.replace('Bearer ', '');
    const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
    if (userErr || !userData.user) {
      logSecurityContext(request, 'db_proxy_invalid_jwt');
      return jsonUnauthorized(request);
    }
    const blockedUser = await checkBlockedWithPolicy({
      req: request,
      adminClient: admin,
      userId: userData.user.id,
      email: userData.user.email,
    });
    if (blockedUser) {
      logSecurityContext(request, 'db_proxy_blocked', { user_id: userData.user.id });
      return blockedUser;
    }
    const rate = await checkRateLimitWithPolicy({
      identifier: getIdentifier(request, userData.user.id),
      limit: RATE_PER_MIN,
      adminClient: admin,
    });
    if (rate) {
      logSecurityContext(request, 'db_proxy_rate_limited', {
        user_id: userData.user.id,
        retry_after_seconds: rate.retryAfterSeconds,
      });
      return jsonRateLimited(request, rate.retryAfterSeconds);
    }
    const { payload, aesKey } = await parseMaybeEncryptedRequest<unknown>(request);
    const parsed = requestSchema.safeParse(payload);
    if (!parsed.success) {
      logSecurityContext(request, 'db_proxy_invalid_body', { user_id: userData.user.id });
      return jsonInvalidBody(request, 'Request body validation failed', parsed.error.flatten());
    }
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const data = parsed.data.kind === 'table' ? await runTableOperation(parsed.data, userClient) : await runRpcOperation(parsed.data, userClient);
    const body = { ok: true, data };
    if (aesKey) return await jsonEncryptedResponse(request, body, 200, aesKey);
    return jsonResponse(request, body, 200);
  } catch (error) {
    console.error('db-proxy unhandled', error);
    logSecurityContext(request, 'db_proxy_unhandled_error');
    return jsonInternalError(request);
  }
});
