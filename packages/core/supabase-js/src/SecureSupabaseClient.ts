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

type RealtimeChannelOptions = Parameters<SupabaseClient<any, any, any>['channel']>[1]
type RealtimeChannel = Parameters<SupabaseClient<any, any, any>['removeChannel']>[0]

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

  /**
   * Access to raw Supabase Functions client for invoking non-proxy edge functions.
   * (Deployment is handled by Supabase CLI / Management API, not runtime supabase-js.)
   */
  get functions() {
    return this.supabase.functions
  }

  /**
   * Access to raw Supabase Storage client.
   */
  get storage() {
    return this.supabase.storage
  }

  /**
   * Access to raw Realtime client.
   */
  get realtime() {
    return this.supabase.realtime
  }

  /**
   * Realtime convenience passthrough.
   */
  channel(name: string, opts: RealtimeChannelOptions = { config: {} }) {
    return this.supabase.channel(name, opts)
  }

  /**
   * Realtime convenience passthrough.
   */
  getChannels() {
    return this.supabase.getChannels()
  }

  /**
   * Realtime convenience passthrough.
   */
  removeChannel(channel: RealtimeChannel) {
    return this.supabase.removeChannel(channel)
  }

  /**
   * Realtime convenience passthrough.
   */
  removeAllChannels() {
    return this.supabase.removeAllChannels()
  }

}

export function createSecureSupabaseClient(
  supabase: SupabaseClient<any, any, any>,
  options: SecureSupabaseClientOptions = {}
): SecureSupabaseClient {
  return new SecureSupabaseClient(supabase, options)
}
