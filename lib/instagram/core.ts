// Pure logic for the Instagram caption/publish pipeline. No imports so it can be unit-tested directly.

export type PublishStatus = 'pending' | 'caption_ready' | 'publishing' | 'published' | 'failed'
export const PUBLISH_STATUSES: PublishStatus[] = ['pending', 'caption_ready', 'publishing', 'published', 'failed']

export type ColumnKey = 'name' | 'description' | 'image' | 'caption' | 'captionDate' | 'status' | 'publishedAt' | 'publishError' | 'postId'
export type ColumnMap = Partial<Record<ColumnKey, number>>

// Header names (case/space/underscore-insensitive) accepted for each logical column.
const ALIASES: Record<ColumnKey, string[]> = {
  name: ['name', 'productname', 'product', 'title'],
  description: ['description', 'productdescription'],
  image: ['image', 'imageurl', 'image_url', 'photo'],
  caption: ['caption', 'generatedcaption', 'aicaption'],
  captionDate: ['captiondate', 'captiongenerated', 'captiongeneratedat'],
  status: ['publishstatus', 'instagramstatus', 'poststatus'],
  publishedAt: ['publishedat', 'publisheddate', 'postedat'],
  publishError: ['publisherror', 'error'],
  postId: ['postid', 'instagrampostid'],
}
// Columns the app must be able to write to publish safely.
export const REQUIRED_FOR_PUBLISH: ColumnKey[] = ['name', 'caption', 'image', 'status', 'publishedAt', 'publishError']

const norm = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, '')

export function resolveColumns(headers: string[]): ColumnMap {
  const map: ColumnMap = {}
  const normalized = headers.map(norm)
  for (const key of Object.keys(ALIASES) as ColumnKey[]) {
    const idx = normalized.findIndex(h => ALIASES[key].map(norm).includes(h))
    if (idx >= 0) map[key] = idx
  }
  return map
}

export function missingPublishColumns(cols: ColumnMap): ColumnKey[] {
  return REQUIRED_FOR_PUBLISH.filter(k => cols[k] === undefined)
}

export interface CaptionItem {
  rowNumber: number // 1-based sheet row (header is row 1)
  name: string
  description: string
  image: string
  caption: string
  captionDate: string
  status: PublishStatus
  publishedAt: string
  publishError: string
}

export function rowToItem(row: string[], cols: ColumnMap, rowNumber: number): CaptionItem {
  const get = (k: ColumnKey) => (cols[k] === undefined ? '' : String(row[cols[k] as number] ?? '').trim())
  const caption = get('caption')
  const raw = get('status').toLowerCase() as PublishStatus
  const status: PublishStatus = PUBLISH_STATUSES.includes(raw) ? raw : caption ? 'caption_ready' : 'pending'
  return {
    rowNumber, name: get('name'), description: get('description'), image: get('image'), caption,
    captionDate: get('captionDate'), status, publishedAt: get('publishedAt'), publishError: get('publishError'),
  }
}

export const MAX_CAPTION_LENGTH = 2200 // Instagram caption limit

export function validateCaption(value: unknown): { ok: true; caption: string } | { ok: false; error: string } {
  if (typeof value !== 'string') return { ok: false, error: 'Caption must be text.' }
  const caption = value.trim()
  if (!caption) return { ok: false, error: 'Caption cannot be empty.' }
  if (caption.length > MAX_CAPTION_LENGTH) return { ok: false, error: `Caption must be ${MAX_CAPTION_LENGTH} characters or fewer.` }
  return { ok: true, caption }
}

export function validateRowNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 2 && value <= 100000 ? value : null
}

export function isPublicHttpsUrl(value: string): boolean {
  try {
    const u = new URL(value)
    const h = u.hostname
    return u.protocol === 'https:' && h !== 'localhost' && !/^(127\.|10\.|192\.168\.|169\.254\.)/.test(h) && h.includes('.')
  } catch { return false }
}

export interface PublishConfig { webhookConfigured: boolean; missingColumns: ColumnKey[] }

/** Whether an item may be published right now. Publishing is never automatic: this only gates the manual action. */
export function canPublish(item: CaptionItem, config: PublishConfig): { ok: true } | { ok: false; reason: string } {
  if (!config.webhookConfigured) return { ok: false, reason: 'Instagram publishing is not configured (webhook missing).' }
  if (config.missingColumns.length) return { ok: false, reason: `Sheet is missing columns: ${config.missingColumns.join(', ')}.` }
  if (item.status === 'published') return { ok: false, reason: 'Already published.' }
  if (item.status === 'publishing') return { ok: false, reason: 'A publish request is already in progress.' }
  if (item.status !== 'caption_ready' && item.status !== 'failed') return { ok: false, reason: 'No caption is ready to publish.' }
  if (!item.caption) return { ok: false, reason: 'Caption is empty.' }
  if (!isPublicHttpsUrl(item.image)) return { ok: false, reason: 'Product needs a public https image URL.' }
  return { ok: true }
}

export interface PublishDeps {
  getItem(rowNumber: number): Promise<CaptionItem | null>
  setStatus(rowNumber: number, patch: { status: PublishStatus; publishedAt?: string; publishError?: string; postId?: string }): Promise<void>
  callWebhook(item: CaptionItem): Promise<{ success: boolean; postId?: string; error?: string }>
  config: PublishConfig
  inFlight: Set<number>
  now?: () => string
}

export type PublishResult = { httpStatus: number; ok: boolean; status?: PublishStatus; error?: string }

/** Manual publish. Requires explicit confirm === true; blocks duplicates via sheet status and an in-flight lock. */
export async function publishItem(rowNumber: number, confirm: unknown, deps: PublishDeps): Promise<PublishResult> {
  if (confirm !== true) return { httpStatus: 400, ok: false, error: 'Publishing requires explicit confirmation.' }
  if (deps.inFlight.has(rowNumber)) return { httpStatus: 409, ok: false, error: 'A publish request is already in progress.' }
  deps.inFlight.add(rowNumber)
  try {
    const item = await deps.getItem(rowNumber)
    if (!item) return { httpStatus: 404, ok: false, error: 'Product row not found.' }
    const gate = canPublish(item, deps.config)
    if (!gate.ok) return { httpStatus: 409, ok: false, error: gate.reason }
    await deps.setStatus(rowNumber, { status: 'publishing', publishError: '' })
    const now = deps.now ?? (() => new Date().toISOString())
    try {
      const res = await deps.callWebhook(item)
      if (res.success) {
        await deps.setStatus(rowNumber, { status: 'published', publishedAt: now(), publishError: '', postId: res.postId })
        return { httpStatus: 200, ok: true, status: 'published' }
      }
      await deps.setStatus(rowNumber, { status: 'failed', publishError: (res.error || 'Publish failed').slice(0, 300) })
      return { httpStatus: 502, ok: false, status: 'failed', error: 'Publishing failed. See the product row for details.' }
    } catch {
      await deps.setStatus(rowNumber, { status: 'failed', publishError: 'Publish request failed' }).catch(() => {})
      return { httpStatus: 502, ok: false, status: 'failed', error: 'Publishing request failed.' }
    }
  } finally {
    deps.inFlight.delete(rowNumber)
  }
}
