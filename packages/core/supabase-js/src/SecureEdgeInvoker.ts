import type SupabaseClient from './SupabaseClient'
import { decryptPayload, encryptPayload, importRsaPublicKeySpki } from './SecureE2EE'

export type SecureEdgeInvokerOptions = {
  publicKeyFunctionName?: string
  allowPlainFallback?: boolean
  initialPublicKeyB64?: string
}

function isE2eeSetupError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const msg = error.message.toLowerCase()
  return (
    msg.includes('keydata') ||
    msg.includes('webcrypto is unavailable') ||
    msg.includes('invalid e2ee public key payload') ||
    msg.includes('invalid encrypted response envelope')
  )
}

export class SecureEdgeInvoker {
  private readonly publicKeyFunctionName: string
  private readonly allowPlainFallback: boolean
  private readonly initialPublicKeyB64?: string
  private cachedPublicKey: CryptoKey | null = null

  constructor(
    private readonly supabase: SupabaseClient<any, any, any>,
    options: SecureEdgeInvokerOptions = {}
  ) {
    this.publicKeyFunctionName = options.publicKeyFunctionName ?? 'e2ee-public-key'
    this.allowPlainFallback = options.allowPlainFallback ?? false
    this.initialPublicKeyB64 = options.initialPublicKeyB64
  }

  private async getPublicKey(): Promise<CryptoKey> {
    if (this.cachedPublicKey) return this.cachedPublicKey

    if (this.initialPublicKeyB64) {
      this.cachedPublicKey = await importRsaPublicKeySpki(this.initialPublicKeyB64)
      return this.cachedPublicKey
    }

    const { data, error } = await this.supabase.functions.invoke(this.publicKeyFunctionName, { body: {} })
    if (error) throw new Error(error.message ?? 'Unable to load E2EE public key.')
    const keyB64 = (data as { public_key_b64?: string })?.public_key_b64 ?? ''
    if (!keyB64) throw new Error('Invalid E2EE public key payload.')
    this.cachedPublicKey = await importRsaPublicKeySpki(keyB64)
    return this.cachedPublicKey
  }

  async invoke<T>(functionName: string, body: unknown): Promise<T> {
    try {
      const publicKey = await this.getPublicKey()
      const { envelope, aesKey } = await encryptPayload(body, publicKey)
      const { data, error } = await this.supabase.functions.invoke(functionName, {
        body: envelope as Record<string, unknown>,
      })
      if (error) throw new Error(error.message ?? 'Edge function failed.')
      return await decryptPayload<T>(data, aesKey)
    } catch (error: unknown) {
      if (this.allowPlainFallback && isE2eeSetupError(error)) {
        const plain = await this.supabase.functions.invoke(functionName, {
          body: body as Record<string, unknown>,
        })
        if (plain.error) throw new Error(plain.error.message ?? 'Edge function failed.')
        return plain.data as T
      }
      throw error
    }
  }
}
