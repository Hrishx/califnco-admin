'use client'

import { useCallback, useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'

type PublishStatus = 'pending' | 'caption_ready' | 'publishing' | 'published' | 'failed'
interface Item { rowNumber: number; name: string; description: string; image: string; caption: string; captionDate: string; status: PublishStatus; publishedAt: string; publishError: string }
interface Payload { configured: boolean; publishReady: boolean; publishBlockedBy?: { webhook: boolean; missingColumns: string[] }; items: Item[]; error?: string }

const tone: Record<PublishStatus, string> = { pending: 'neutral', caption_ready: 'blue', publishing: 'amber', published: 'green', failed: 'red' }

async function api(path: string, method: string, body?: unknown) {
  const res = await fetch(path, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' })
  const json = await res.json().catch(() => ({}))
  return { status: res.status, ok: res.ok, json }
}

export default function InstagramAutomation() {
  const [data, setData] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)
  const [needsLogin, setNeedsLogin] = useState(false)
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState<number | null>(null)
  const [editing, setEditing] = useState<{ row: number; text: string } | null>(null)
  const [password, setPassword] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const r = await api('/api/instagram/items', 'GET')
    if (r.status === 401) { setNeedsLogin(true); setData(null) }
    else if (r.ok) { setNeedsLogin(false); setData(r.json) ; setMessage(null) }
    else setMessage({ kind: 'error', text: r.json?.error || 'Could not load captions.' })
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const login = async (e: React.FormEvent) => {
    e.preventDefault()
    const r = await api('/api/admin/login', 'POST', { password })
    setPassword('')
    if (r.ok) load(); else setMessage({ kind: 'error', text: r.json?.error || 'Sign-in failed.' })
  }

  const saveCaption = async (row: number, caption: string) => {
    setBusy(row)
    const r = await api('/api/instagram/caption', 'PATCH', { rowNumber: row, caption })
    setBusy(null)
    if (r.ok) { setEditing(null); setMessage({ kind: 'success', text: 'Caption saved to Google Sheets.' }); load() }
    else setMessage({ kind: 'error', text: r.json?.error || 'Could not save caption.' })
  }

  const publish = async (item: Item) => {
    if (busy !== null) return
    if (!window.confirm(`Publish "${item.name}" to Instagram now?\n\nThis posts publicly and cannot be undone from this dashboard.`)) return
    setBusy(item.rowNumber)
    const r = await api('/api/instagram/publish', 'POST', { rowNumber: item.rowNumber, confirm: true })
    setBusy(null)
    setMessage(r.ok ? { kind: 'success', text: `"${item.name}" published.` } : { kind: 'error', text: r.json?.error || 'Publishing failed.' })
    load()
  }

  const intro = <div className="page-intro"><div><h2>Instagram automation</h2><p>Captions are generated on a schedule and saved to Google Sheets. Nothing is published until you confirm it here.</p></div><div className="intro-actions"><button className="button button-secondary" onClick={load} disabled={loading}><RefreshCw size={14} /> {loading ? 'Loading…' : 'Refresh'}</button></div></div>

  if (needsLogin) return <>{intro}<section className="card" style={{ maxWidth: 420 }}><h3>Admin sign-in</h3><p style={{ fontSize: 12 }}>Sign in to view and publish captions.</p><form onSubmit={login} style={{ display: 'grid', gap: 10 }}><input type="password" autoComplete="current-password" aria-label="Admin password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Admin password" style={{ padding: 9, border: '1px solid var(--line)', borderRadius: 6, background: 'var(--surface)', color: 'var(--text)' }} /><button className="button button-primary" type="submit" disabled={!password}>Sign in</button></form>{message && <p role="alert" style={{ color: '#bf5955', fontSize: 12 }}>{message.text}</p>}</section></>

  const blocked = data && !data.publishReady
  const reasons = data?.publishBlockedBy ? [data.publishBlockedBy.webhook && 'manual-publish webhook is not configured', data.publishBlockedBy.missingColumns.length > 0 && `sheet is missing columns: ${data.publishBlockedBy.missingColumns.join(', ')}`].filter(Boolean).join('; ') : ''

  return <>{intro}
    {message && <p role="status" aria-live="polite" style={{ fontSize: 12, color: message.kind === 'error' ? '#bf5955' : '#27875b' }}>{message.text}</p>}
    {data && !data.configured && <section className="card"><b>Google Sheets is not configured.</b><p style={{ fontSize: 12 }}>{data.error} Set the server environment variables listed in .env.example.</p></section>}
    {blocked && data.configured && <section className="card" style={{ marginBottom: 14 }}><b>Publishing is disabled</b><p style={{ fontSize: 12, margin: '6px 0 0' }}>{reasons || 'Instagram publishing is not configured.'}</p></section>}
    {data?.configured && <section className="card"><div className="table-wrap"><table><thead><tr><th>Product</th><th>Caption</th><th>Caption date</th><th>Status</th><th>Actions</th></tr></thead><tbody>
      {data.items.map(it => {
        const editable = it.status !== 'published' && it.status !== 'publishing'
        const canPublish = !blocked && (it.status === 'caption_ready' || it.status === 'failed') && !!it.caption
        return <tr key={it.rowNumber}>
          <td><div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>{it.image && /^https?:\/\//.test(it.image) && /* eslint-disable-next-line @next/next/no-img-element */ <img src={it.image} alt="" width={40} height={40} style={{ objectFit: 'cover', borderRadius: 6 }} />}<div><b>{it.name}</b><small style={{ display: 'block', maxWidth: 220 }}>{it.description}</small></div></div></td>
          <td style={{ maxWidth: 320 }}>{editing?.row === it.rowNumber
            ? <textarea aria-label={`Caption for ${it.name}`} value={editing.text} onChange={e => setEditing({ row: it.rowNumber, text: e.target.value })} rows={5} maxLength={2200} style={{ width: '100%' }} />
            : <span style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{it.caption || 'No caption yet'}</span>}</td>
          <td>{it.captionDate || '—'}</td>
          <td><span className={`status status-${tone[it.status]}`}>{it.status}</span>{it.publishError && <small style={{ display: 'block', color: '#bf5955' }}>{it.publishError}</small>}{it.publishedAt && <small style={{ display: 'block' }}>{it.publishedAt}</small>}</td>
          <td><div className="row-actions">
            {editing?.row === it.rowNumber
              ? <><button className="small-action approve" disabled={busy !== null} onClick={() => saveCaption(it.rowNumber, editing.text)}>{busy === it.rowNumber ? 'Saving…' : 'Save'}</button><button className="small-action reject" disabled={busy !== null} onClick={() => setEditing(null)}>Cancel</button></>
              : <><button className="small-action" disabled={!editable || busy !== null} onClick={() => setEditing({ row: it.rowNumber, text: it.caption })}>Edit caption</button>
                <button className="small-action approve" disabled={!canPublish || busy !== null} onClick={() => publish(it)}>{busy === it.rowNumber ? 'Publishing…' : 'Publish to Instagram'}</button></>}
          </div></td></tr>
      })}
    </tbody></table>{data.items.length === 0 && <p style={{ fontSize: 12 }}>No products found in the sheet.</p>}</div></section>}
    {loading && !data && <p style={{ fontSize: 12 }}>Loading captions…</p>}
  </>
}
