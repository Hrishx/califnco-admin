import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

export const SESSION_COOKIE = 'aquapure_admin'
export const SESSION_TTL_SECONDS = 8 * 60 * 60

const b64 = (s: string) => Buffer.from(s).toString('base64url')

export function createSessionToken(secret: string, nowMs = Date.now(), ttl = SESSION_TTL_SECONDS): string {
  const payload = b64(JSON.stringify({ exp: Math.floor(nowMs / 1000) + ttl }))
  const sig = createHmac('sha256', secret).update(payload).digest('base64url')
  return `${payload}.${sig}`
}

export function verifySessionToken(secret: string | undefined, token: string | undefined, nowMs = Date.now()): boolean {
  if (!secret || secret.length < 16 || !token) return false
  const [payload, sig, extra] = token.split('.')
  if (!payload || !sig || extra !== undefined) return false
  const expected = createHmac('sha256', secret).update(payload).digest()
  const given = Buffer.from(sig, 'base64url')
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return false
  try {
    const { exp } = JSON.parse(Buffer.from(payload, 'base64url').toString())
    return typeof exp === 'number' && exp > Math.floor(nowMs / 1000)
  } catch { return false }
}

/** Constant-time password check. Fails closed when no password is configured. */
export function verifyPassword(configured: string | undefined, given: unknown): boolean {
  if (!configured || configured.length < 12 || typeof given !== 'string') return false
  const a = createHash('sha256').update(configured).digest()
  const b = createHash('sha256').update(given).digest()
  return timingSafeEqual(a, b)
}
