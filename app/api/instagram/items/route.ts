import { NextRequest, NextResponse } from 'next/server'
import { loadSheet, publishConfigured, requireAdmin, sheetsConfigured } from '@/lib/instagram/server'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const denied = requireAdmin(req)
  if (denied) return denied
  const publishReady = publishConfigured()
  if (!sheetsConfigured()) {
    return NextResponse.json({ configured: false, publishReady, items: [], missingColumns: [], error: 'Google Sheets is not configured on the server.' })
  }
  try {
    const { items, missingColumns } = await loadSheet()
    return NextResponse.json({ configured: true, publishReady: publishReady && missingColumns.length === 0, publishBlockedBy: { webhook: !publishReady, missingColumns }, items })
  } catch {
    return NextResponse.json({ error: 'Could not read Google Sheets.' }, { status: 502 })
  }
}
