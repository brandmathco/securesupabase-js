const ALGORITHM = 'AES-256-GCM';
const VERSION = 1;

declare const Deno: { env: { get(name: string): string | undefined } };

type Envelope = {
  e2ee: {
    v: number;
    alg: string;
    key: string;
    iv: string;
    ciphertext: string;
  };
};

type ResponseEnvelope = {
  e2ee: {
    v: number;
    alg: string;
    iv: string;
    ciphertext: string;
  };
};

function toBytesBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0)) as Uint8Array;
}

function toArrayBufferBase64(value: string): ArrayBuffer {
  const bytes = toBytesBase64(value);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function getPrivateKeyB64(): string {
  const key = Deno.env.get('E2EE_RSA_PRIVATE_KEY_B64') ?? '';
  if (!key) throw new Error('E2EE private key is not configured');
  return key;
}

async function importPrivateKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'pkcs8',
    toArrayBufferBase64(getPrivateKeyB64()),
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['decrypt'],
  );
}

async function decryptEnvelope<T>(enc: Envelope['e2ee']): Promise<{ payload: T; aesKey: CryptoKey }> {
  const privateKey = await importPrivateKey();
  const decryptedKey = await crypto.subtle.decrypt('RSA-OAEP', privateKey, toArrayBufferBase64(enc.key));
  const aesKey = await crypto.subtle.importKey('raw', decryptedKey, 'AES-GCM', false, ['encrypt', 'decrypt']);
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: toArrayBufferBase64(enc.iv) },
    aesKey,
    toArrayBufferBase64(enc.ciphertext),
  );
  const decoded = new TextDecoder().decode(plaintext);
  return { payload: JSON.parse(decoded) as T, aesKey };
}

export async function parseMaybeEncryptedRequest<T>(req: Request): Promise<{ payload: T; aesKey: CryptoKey | null }> {
  const raw = (await req.json().catch(() => null)) as Envelope | T | null;
  if (!raw) throw new Error('Request body is required');
  const enc = (raw as Envelope).e2ee;
  if (enc && typeof enc === 'object') {
    if (enc.v !== VERSION || enc.alg !== ALGORITHM || !enc.key || !enc.iv || !enc.ciphertext) {
      throw new Error('Invalid encrypted payload envelope');
    }
    return decryptEnvelope<T>(enc);
  }
  return { payload: raw as T, aesKey: null };
}

export async function buildEncryptedResponse(body: unknown, aesKey: CryptoKey): Promise<ResponseEnvelope> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(JSON.stringify(body));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, encoded);
  return {
    e2ee: {
      v: VERSION,
      alg: ALGORITHM,
      iv: toBase64(iv),
      ciphertext: toBase64(new Uint8Array(encrypted)),
    },
  };
}
