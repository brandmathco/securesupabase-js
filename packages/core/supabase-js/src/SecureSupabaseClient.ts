import type SupabaseClient from './SupabaseClient'
import { SecureAuthProxyClient } from './SecureAuthProxy'
import { SecureDbProxyClient } from './SecureDbProxy'
import { SecureEdgeInvoker, type SecureEdgeInvokerOptions } from './SecureEdgeInvoker'

export type SecureSupabaseClientOptions = {
  edge?: SecureEdgeInvokerOptions & {
    dbProxyFunctionName?: string
    authProxyFunctionName?: string
  }
}

export class SecureSupabaseClient {
  readonly edge: SecureEdgeInvoker
  readonly db: SecureDbProxyClient
  readonly auth: SecureAuthProxyClient

  constructor(
    readonly supabase: SupabaseClient<any, any, any>,
    options: SecureSupabaseClientOptions = {}
  ) {
    this.edge = new SecureEdgeInvoker(supabase, options.edge)
    this.db = new SecureDbProxyClient(this.edge, {
      functionName: options.edge?.dbProxyFunctionName ?? 'db-proxy',
    })
    this.auth = new SecureAuthProxyClient(supabase, this.edge, {
      functionName: options.edge?.authProxyFunctionName ?? 'auth-proxy',
    })
  }
}

export function createSecureSupabaseClient(
  supabase: SupabaseClient<any, any, any>,
  options: SecureSupabaseClientOptions = {}
): SecureSupabaseClient {
  return new SecureSupabaseClient(supabase, options)
}
