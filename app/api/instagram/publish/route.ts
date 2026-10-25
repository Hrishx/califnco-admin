import { NextRequest, NextResponse } from 'next/server'
import { publishItem, validateRowNumber } from '@/lib/instagram/core'
import { callPublishWebhook, inFlight, loadSheet, publishConfigured, requireAdmin, requireJson, setPublishState, sheetsConfigured } from '@/lib/instagram/server'

export const maxDuration = 60

/** Manual-only publish. Never called by the scheduled caption flow. */
export async function POST(req: NextRequest) {
  const denied = requireAdmin(req) ?? requireJson(req)
  if (denied) return denied
  if (!sheetsConfigured() || !publishConfigured()) return NextResponse.json({ error: 'Instagram publishing is not configured.' }, { status: 503 })
  const body = await req.json().catch(() => null)
  const rowNumber = validateRowNumber(body?.rowNumber)
  if (rowNumber === null) return NextResponse.json({ error: 'Invalid row.' }, { status: 400 })
  try {
    const { missingColumns } = await loadSheet()
    const result = await publishItem(rowNumber, body?.confirm, {
      getItem: async n => (await loadSheet()).items.find(i => i.rowNumber === n) ?? null,
      setStatus: setPublishState,
      callWebhook: callPublishWebhook,
      config: { webhookConfigured: true, missingColumns },
      inFlight,
    })
    return NextResponse.json({ ok: result.ok, status: result.status, error: result.error }, { status: result.httpStatus })
  } catch {
    return NextResponse.json({ error: 'Publishing could not be completed.' }, { status: 502 })
  }
}
