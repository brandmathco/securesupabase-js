import SupabaseClient from './SupabaseClient'
import { createSecureSupabaseClient } from './SecureSupabaseClient'
import type { SupabaseClientOptions } from './lib/types'

export * from '@supabase/auth-js'
export type { User as AuthUser, Session as AuthSession } from '@supabase/auth-js'
export type {
  PostgrestResponse,
  PostgrestSingleResponse,
  PostgrestMaybeSingleResponse,
} from '@supabase/postgrest-js'
export { PostgrestError } from '@supabase/postgrest-js'
export type { FunctionInvokeOptions } from '@supabase/functions-js'
export {
  FunctionsHttpError,
  FunctionsFetchError,
  FunctionsRelayError,
  FunctionsError,
  FunctionRegion,
} from '@supabase/functions-js'
export * from '@supabase/realtime-js'
export { default as SupabaseClient } from './SupabaseClient'
export { SecureEdgeInvoker } from './SecureEdgeInvoker'
export { SecureDbProxyClient } from './SecureDbProxy'
export { SecureAuthProxyClient } from './SecureAuthProxy'
export { SecureSupabaseClient, createSecureSupabaseClient } from './SecureSupabaseClient'
export { E2EE_ALGORITHM, E2EE_VERSION } from './SecureE2EE'
export type {
  SupabaseClientOptions,
  QueryResult,
  QueryData,
  QueryError,
  DatabaseWithoutInternals,
  SecureEdgeInvokerOptions,
  DbProxyFilter,
  DbProxyRequest,
  DbProxyRpcRequest,
  DbProxyTableRequest,
  SecureDbResponse,
  SecureSupabaseClientOptions,
} from './lib/types'

/**
 * Creates a new Supabase Client.
 *
 * @example
 * ```ts
 * import { createClient } from '@supabase/supabase-js'
 *
 * const supabase = createClient('https://xyzcompany.supabase.co', 'public-anon-key')
 * const { data, error } = await supabase.from('profiles').select('*')
 * ```
 */
export const createClient = <
  Database = any,
  SchemaNameOrClientOptions extends
    | (string & keyof Omit<Database, '__InternalSupabase'>)
    | { PostgrestVersion: string } = 'public' extends keyof Omit<Database, '__InternalSupabase'>
    ? 'public'
    : string & keyof Omit<Database, '__InternalSupabase'>,
  SchemaName extends string &
    keyof Omit<Database, '__InternalSupabase'> = SchemaNameOrClientOptions extends string &
    keyof Omit<Database, '__InternalSupabase'>
    ? SchemaNameOrClientOptions
    : 'public' extends keyof Omit<Database, '__InternalSupabase'>
      ? 'public'
      : string & keyof Omit<Omit<Database, '__InternalSupabase'>, '__InternalSupabase'>,
>(
  supabaseUrl: string,
  supabaseKey: string,
  options?: SupabaseClientOptions<SchemaName>
): SupabaseClient<Database, SchemaNameOrClientOptions, SchemaName> => {
  return new SupabaseClient<Database, SchemaNameOrClientOptions, SchemaName>(
    supabaseUrl,
    supabaseKey,
    options
  )
}

/**
 * Creates a secure Supabase wrapper that routes data/auth calls through
 * encrypted Edge function proxies.
 */
export const createSecureClient = <
  Database = any,
  SchemaNameOrClientOptions extends
    | (string & keyof Omit<Database, '__InternalSupabase'>)
    | { PostgrestVersion: string } = 'public' extends keyof Omit<Database, '__InternalSupabase'>
    ? 'public'
    : string & keyof Omit<Database, '__InternalSupabase'>,
  SchemaName extends string &
    keyof Omit<Database, '__InternalSupabase'> = SchemaNameOrClientOptions extends string &
    keyof Omit<Database, '__InternalSupabase'>
    ? SchemaNameOrClientOptions
    : 'public' extends keyof Omit<Database, '__InternalSupabase'>
      ? 'public'
      : string & keyof Omit<Omit<Database, '__InternalSupabase'>, '__InternalSupabase'>,
>(
  supabaseUrl: string,
  supabaseKey: string,
  options?: SupabaseClientOptions<SchemaName>,
  secureOptions?: import('./SecureSupabaseClient').SecureSupabaseClientOptions
) => {
  const supabase = new SupabaseClient<Database, SchemaNameOrClientOptions, SchemaName>(
    supabaseUrl,
    supabaseKey,
    options
  )
  return createSecureSupabaseClient(supabase, secureOptions)
}

// Check for Node.js <= 18 deprecation
function shouldShowDeprecationWarning(): boolean {
  // Skip in browser environments
  if (typeof window !== 'undefined') {
    return false
  }

  // Skip if process is not available (e.g., Edge Runtime)
  // Use dynamic property access to avoid Next.js Edge Runtime static analysis warnings
  const _process = (globalThis as any)['process']
  if (!_process) {
    return false
  }

  const processVersion = _process['version']
  if (processVersion === undefined || processVersion === null) {
    return false
  }

  const versionMatch = processVersion.match(/^v(\d+)\./)
  if (!versionMatch) {
    return false
  }

  const majorVersion = parseInt(versionMatch[1], 10)
  return majorVersion <= 18
}

if (shouldShowDeprecationWarning()) {
  console.warn(
    `⚠️  Node.js 18 and below are deprecated and will no longer be supported in future versions of @supabase/supabase-js. ` +
      `Please upgrade to Node.js 20 or later. ` +
      `For more information, visit: https://github.com/orgs/supabase/discussions/37217`
  )
}
