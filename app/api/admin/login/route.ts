import { NextRequest, NextResponse } from 'next/server'
import { authConfigured, env, loginFails } from '@/lib/instagram/server'
import { SESSION_COOKIE, SESSION_TTL_SECONDS, createSessionToken, verifyPassword } from '@/lib/instagram/session'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  if (!authConfigured()) return NextResponse.json({ error: 'Admin sign-in is not configured.' }, { status: 503 })
  if (!req.headers.get('content-type')?.includes('application/json')) return NextResponse.json({ error: 'JSON body required.' }, { status: 415 })
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  const rec = loginFails.get(ip)
  if (rec && Date.now() - rec.t < 60_000 && rec.n >= 5) return NextResponse.json({ error: 'Too many attempts. Try again in a minute.' }, { status: 429 })
  const body = await req.json().catch(() => null)
  if (!verifyPassword(env().adminPassword, body?.password)) {
    loginFails.set(ip, { n: rec && Date.now() - rec.t < 60_000 ? rec.n + 1 : 1, t: Date.now() })
    return NextResponse.json({ error: 'Incorrect password.' }, { status: 401 })
  }
  loginFails.delete(ip)
  const res = NextResponse.json({ ok: true })
  res.cookies.set(SESSION_COOKIE, createSessionToken(env().sessionSecret as string), {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/', maxAge: SESSION_TTL_SECONDS,
  })
  return res
}
