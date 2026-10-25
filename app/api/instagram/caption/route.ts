import { NextRequest, NextResponse } from 'next/server'
import { validateCaption, validateRowNumber } from '@/lib/instagram/core'
import { inFlight, loadSheet, requireAdmin, requireJson, sheetsConfigured, updateCells } from '@/lib/instagram/server'

export async function PATCH(req: NextRequest) {
  const denied = requireAdmin(req) ?? requireJson(req)
  if (denied) return denied
  if (!sheetsConfigured()) return NextResponse.json({ error: 'Google Sheets is not configured on the server.' }, { status: 503 })
  const body = await req.json().catch(() => null)
  const rowNumber = validateRowNumber(body?.rowNumber)
  const caption = validateCaption(body?.caption)
  if (rowNumber === null) return NextResponse.json({ error: 'Invalid row.' }, { status: 400 })
  if (!caption.ok) return NextResponse.json({ error: caption.error }, { status: 400 })
  if (inFlight.has(rowNumber)) return NextResponse.json({ error: 'A publish request is in progress for this product.' }, { status: 409 })
  try {
    const { cols, items } = await loadSheet()
    const item = items.find(i => i.rowNumber === rowNumber)
    if (!item) return NextResponse.json({ error: 'Product row not found.' }, { status: 404 })
    if (item.status === 'published' || item.status === 'publishing') return NextResponse.json({ error: 'This caption is already published or being published.' }, { status: 409 })
    // Editing a failed/pending row makes it ready again; editing never publishes.
    await updateCells(cols, rowNumber, { caption: caption.caption, status: 'caption_ready', publishError: '' })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Could not save to Google Sheets.' }, { status: 502 })
  }
}
