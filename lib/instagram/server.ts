import { createSign } from 'node:crypto'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import {
  type CaptionItem, type ColumnKey, type ColumnMap, type PublishStatus,
  missingPublishColumns, resolveColumns, rowToItem,
} from './core'
import { SESSION_COOKIE, verifySessionToken } from './session'

/** Server-only configuration. Nothing here is exposed to the browser. */
export function env() {
  return {
    adminPassword: process.env.ADMIN_PASSWORD,
    sessionSecret: process.env.ADMIN_SESSION_SECRET,
    sheetId: process.env.SHEETS_SPREADSHEET_ID,
    sheetTab: process.env.SHEETS_TAB_NAME || 'Products',
    saEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    saKey: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    webhookUrl: process.env.INSTAGRAM_PUBLISH_WEBHOOK_URL,
    webhookSecret: process.env.INSTAGRAM_PUBLISH_WEBHOOK_SECRET,
  }
}

export const sheetsConfigured = () => { const e = env(); return !!(e.sheetId && e.saEmail && e.saKey) }
export const publishConfigured = () => { const e = env(); return !!(e.webhookUrl?.startsWith('https://') && e.webhookSecret) }
export const authConfigured = () => { const e = env(); return !!(e.adminPassword && e.adminPassword.length >= 12 && e.sessionSecret && e.sessionSecret.length >= 16) }

export function requireAdmin(req: NextRequest): NextResponse | null {
  if (!authConfigured()) return NextResponse.json({ error: 'Admin sign-in is not configured.' }, { status: 503 })
  if (!verifySessionToken(env().sessionSecret, req.cookies.get(SESSION_COOKIE)?.value)) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 401 })
  }
  return null
}

/** Mutating requests must be JSON (blocks simple cross-site form posts; cookie is also SameSite=Strict). */
export function requireJson(req: NextRequest): NextResponse | null {
  return req.headers.get('content-type')?.includes('application/json') ? null : NextResponse.json({ error: 'JSON body required.' }, { status: 415 })
}

let cachedToken: { value: string; exp: number } | null = null

async function accessToken(): Promise<string> {
  const { saEmail, saKey } = env()
  if (cachedToken && cachedToken.exp > Date.now() + 60_000) return cachedToken.value
  const now = Math.floor(Date.now() / 1000)
  const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const unsigned = `${enc({ alg: 'RS256', typ: 'JWT' })}.${enc({ iss: saEmail, scope: 'https://www.googleapis.com/auth/spreadsheets', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 })}`
  const sig = createSign('RSA-SHA256').update(unsigned).sign(saKey as string, 'base64url')
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${sig}` }),
  })
  if (!res.ok) throw new Error('Google authentication failed')
  const json = await res.json()
  cachedToken = { value: json.access_token, exp: Date.now() + (json.expires_in ?? 3600) * 1000 }
  return cachedToken.value
}

async function sheetsFetch(path: string, init?: RequestInit) {
  const { sheetId } = env()
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}${path}`, {
    ...init, headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': 'application/json' }, cache: 'no-store',
  })
  if (!res.ok) throw new Error(`Google Sheets request failed (${res.status})`)
  return res.json()
}

const colLetter = (i: number) => { let s = ''; for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s }
const tabRef = () => `'${env().sheetTab.replace(/'/g, "''")}'`

export async function loadSheet(): Promise<{ cols: ColumnMap; items: CaptionItem[]; missingColumns: ColumnKey[] }> {
  const data = await sheetsFetch(`/values/${encodeURIComponent(`${tabRef()}!A1:Z1000`)}`)
  const rows: string[][] = data.values ?? []
  const cols = resolveColumns(rows[0] ?? [])
  const items = rows.slice(1).map((r, i) => rowToItem(r, cols, i + 2)).filter(it => it.name)
  return { cols, items, missingColumns: missingPublishColumns(cols) }
}

export async function updateCells(cols: ColumnMap, rowNumber: number, values: Partial<Record<ColumnKey, string>>) {
  const data = (Object.keys(values) as ColumnKey[])
    .filter(k => cols[k] !== undefined)
    .map(k => ({ range: `${tabRef()}!${colLetter(cols[k] as number)}${rowNumber}`, values: [[values[k]]] }))
  if (!data.length) return
  await sheetsFetch('/values:batchUpdate', { method: 'POST', body: JSON.stringify({ valueInputOption: 'RAW', data }) })
}

export async function setPublishState(rowNumber: number, patch: { status: PublishStatus; publishedAt?: string; publishError?: string; postId?: string }) {
  const { cols } = await loadSheet()
  await updateCells(cols, rowNumber, {
    status: patch.status, publishedAt: patch.publishedAt, publishError: patch.publishError, postId: patch.postId,
  } as Partial<Record<ColumnKey, string>>)
}

/** Calls the separate manual-publish Activepieces flow. Never the scheduled caption flow. */
export async function callPublishWebhook(item: CaptionItem): Promise<{ success: boolean; postId?: string; error?: string }> {
  const { webhookUrl, webhookSecret } = env()
  const res = await fetch(webhookUrl as string, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-webhook-secret': webhookSecret as string },
    body: JSON.stringify({ rowNumber: item.rowNumber, productName: item.name, caption: item.caption, imageUrl: item.image }),
    signal: AbortSignal.timeout(55_000),
  })
  if (!res.ok) return { success: false, error: `Publish flow returned ${res.status}` }
  const json = await res.json().catch(() => ({}))
  return json?.success === true ? { success: true, postId: typeof json.postId === 'string' ? json.postId : undefined } : { success: false, error: typeof json?.error === 'string' ? json.error : 'Publish flow reported failure' }
}

const g = globalThis as unknown as { __igInFlight?: Set<number>; __loginFails?: Map<string, { n: number; t: number }> }
export const inFlight = (g.__igInFlight ??= new Set<number>())
export const loginFails = (g.__loginFails ??= new Map())
