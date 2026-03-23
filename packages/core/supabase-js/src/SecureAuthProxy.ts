import type { Session } from '@supabase/auth-js'
import type SupabaseClient from './SupabaseClient'
import type { SecureEdgeInvoker } from './SecureEdgeInvoker'

type AuthProxyResult = {
  ok: boolean
  status: number
  data: {
    access_token?: string
    refresh_token?: string
    [key: string]: unknown
  }
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}

async function hydrateSession(
  supabase: SupabaseClient<any, any, any>,
  result: AuthProxyResult
): Promise<Session | null> {
  const accessToken = result.data.access_token
  const refreshToken = result.data.refresh_token
  if (!accessToken || !refreshToken) return null
  const out = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
  if (out.error) throw out.error
  return out.data.session ?? null
}

export class SecureAuthProxyClient {
  private readonly functionName: string

  constructor(
    private readonly supabase: SupabaseClient<any, any, any>,
    private readonly invoker: Pick<SecureEdgeInvoker, 'invoke'>,
    options?: { functionName?: string }
  ) {
    this.functionName = options?.functionName ?? 'auth-proxy'
  }

  private async call(input: Record<string, unknown>): Promise<AuthProxyResult> {
    return this.invoker.invoke<AuthProxyResult>(this.functionName, input)
  }

  async signInWithPassword(input: {
    email: string
    password: string
  }): Promise<{ data: { session: Session | null }; error: Error | null }> {
    try {
      const out = await this.call({ action: 'sign_in', email: input.email, password: input.password })
      if (!out.ok) return { data: { session: null }, error: new Error(`Sign in failed (${out.status})`) }
      const session = await hydrateSession(this.supabase, out)
      return { data: { session }, error: null }
    } catch (error: unknown) {
      return { data: { session: null }, error: toError(error) }
    }
  }

  async signUp(input: {
    email: string
    password: string
    display_name?: string
  }): Promise<{ data: { session: Session | null }; error: Error | null }> {
    try {
      const out = await this.call({
        action: 'sign_up',
        email: input.email,
        password: input.password,
        display_name: input.display_name,
      })
      if (!out.ok) return { data: { session: null }, error: new Error(`Sign up failed (${out.status})`) }
      const session = await hydrateSession(this.supabase, out)
      return { data: { session }, error: null }
    } catch (error: unknown) {
      return { data: { session: null }, error: toError(error) }
    }
  }

  async resetPasswordForEmail(
    email: string,
    options?: { redirect_to?: string }
  ): Promise<{ data: { ok: true } | null; error: Error | null }> {
    try {
      const out = await this.call({ action: 'reset_password', email, redirect_to: options?.redirect_to })
      if (!out.ok) return { data: null, error: new Error(`Reset password failed (${out.status})`) }
      return { data: { ok: true }, error: null }
    } catch (error: unknown) {
      return { data: null, error: toError(error) }
    }
  }

  async signOut(): Promise<{ data: { ok: true } | null; error: Error | null }> {
    try {
      const out = await this.call({ action: 'sign_out' })
      if (!out.ok) return { data: null, error: new Error(`Sign out failed (${out.status})`) }
      const local = await this.supabase.auth.signOut()
      if (local.error) throw local.error
      return { data: { ok: true }, error: null }
    } catch (error: unknown) {
      return { data: null, error: toError(error) }
    }
  }
}
