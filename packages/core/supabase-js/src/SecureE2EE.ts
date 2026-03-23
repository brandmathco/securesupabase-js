export const E2EE_VERSION = 1
export const E2EE_ALGORITHM = 'AES-256-GCM'

type EncryptedEnvelope = {
  e2ee: {
    v: number
    alg: string
    key: string
    iv: string
    ciphertext: string
  }
}

type EncryptedResponseEnvelope = {
  e2ee: {
    v: number
    alg: string
    iv: string
    ciphertext: string
  }
}

function getWebCrypto(): Crypto {
  const cryptoApi = globalThis.crypto
  if (!cryptoApi?.subtle) {
    throw new Error('WebCrypto is unavailable.')
  }
  return cryptoApi
}

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary)
}

function fromBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0))
}

function parseBufferB64(value: string): ArrayBuffer {
  const bytes = fromBase64(value)
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

export async function importRsaPublicKeySpki(publicKeyB64: string): Promise<CryptoKey> {
  return getWebCrypto().subtle.importKey(
    'spki',
    parseBufferB64(publicKeyB64),
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['encrypt']
  )
}

export async function encryptPayload(
  payload: unknown,
  serverPublicKey: CryptoKey
): Promise<{ envelope: EncryptedEnvelope; aesKey: CryptoKey }> {
  const cryptoApi = getWebCrypto()
  const rawAesKey = cryptoApi.getRandomValues(new Uint8Array(32))
  const aesKey = await cryptoApi.subtle.importKey('raw', rawAesKey, 'AES-GCM', false, [
    'encrypt',
    'decrypt',
  ])
  const iv = cryptoApi.getRandomValues(new Uint8Array(12))
  const body = new TextEncoder().encode(JSON.stringify(payload))
  const ciphertext = await cryptoApi.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, body)
  const encryptedKey = await cryptoApi.subtle.encrypt({ name: 'RSA-OAEP' }, serverPublicKey, rawAesKey)

  return {
    envelope: {
      e2ee: {
        v: E2EE_VERSION,
        alg: E2EE_ALGORITHM,
        key: toBase64(new Uint8Array(encryptedKey)),
        iv: toBase64(iv),
        ciphertext: toBase64(new Uint8Array(ciphertext)),
      },
    },
    aesKey,
  }
}

export async function decryptPayload<T>(body: unknown, aesKey: CryptoKey): Promise<T> {
  const envelope = body as EncryptedResponseEnvelope | null
  const encrypted = envelope?.e2ee
  if (
    !encrypted ||
    encrypted.v !== E2EE_VERSION ||
    encrypted.alg !== E2EE_ALGORITHM ||
    !encrypted.iv ||
    !encrypted.ciphertext
  ) {
    throw new Error('Invalid encrypted response envelope.')
  }

  const plaintext = await getWebCrypto().subtle.decrypt(
    { name: 'AES-GCM', iv: parseBufferB64(encrypted.iv) },
    aesKey,
    parseBufferB64(encrypted.ciphertext)
  )
  return JSON.parse(new TextDecoder().decode(plaintext)) as T
}
