// ログインとサーバ同期。
// アプリの状態はユーザーごとに1文書としてサーバ（D1）に保存し、端末にもキャッシュする。
// 変更は 1.2 秒まとめてから送信。別の端末が先に保存していた場合（rev 不一致）は、新しく更新された方を採用する。
import { create } from 'zustand'
import { useStore, type AppData } from '../store/useStore'
import { readRaw, removeRaw, setStorageUser, STORAGE_KEY, writeRaw } from './storage'

export type User = { id: string; email: string; name: string; picture: string }
type Meta = { rev: number; dirty: boolean; localAt: number }
type SyncState = 'idle' | 'saving' | 'offline' | 'error'

type Cloud = {
  phase: 'checking' | 'signedOut' | 'loading' | 'ready'
  user: User | null
  sync: SyncState
  lastSync: number
  notice: string | null
}

export const useCloud = create<Cloud>(() => ({ phase: 'checking', user: null, sync: 'idle', lastSync: 0, notice: null }))

const LAST_USER = 'kondate.lastUser'
const metaKey = (uid: string) => `kondate.meta:${uid}`
const deviceId = (() => {
  let d = readRaw('kondate.device')
  if (!d) {
    d = `${/iPhone|iPad|Android/.test(navigator.userAgent) ? 'mobile' : 'desktop'}-${Math.random().toString(36).slice(2, 8)}`
    writeRaw('kondate.device', d)
  }
  return d
})()

let meta: Meta = { rev: 0, dirty: false, localAt: 0 }
let uid = ''
let applying = false
let timer: ReturnType<typeof setTimeout> | undefined
let inflight: Promise<void> | null = null
let unsub: (() => void) | null = null

const saveMeta = () => uid && writeRaw(metaKey(uid), JSON.stringify(meta))
const snapshot = (): AppData => {
  const opts = useStore.persist.getOptions()
  return opts.partialize!(useStore.getState()) as AppData
}
/** サーバの状態を取り込む（取り込み自体は送信しない） */
function apply(data: AppData) {
  applying = true
  useStore.setState(data as never)
  applying = false
}

async function api<T>(method: string, path: string, body?: unknown): Promise<{ status: number; data: T }> {
  const r = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return { status: r.status, data: (await r.json().catch(() => ({}))) as T }
}

type ServerState = { rev: number; updatedAt: number; device?: string; data: AppData | null }

export async function boot() {
  const last = (() => {
    try {
      return JSON.parse(readRaw(LAST_USER) ?? 'null') as User | null
    } catch {
      return null
    }
  })()
  let user: User | null
  try {
    const r = await api<{ user: User | null }>('GET', '/api/me')
    user = r.data.user
  } catch {
    // オフライン：前回のユーザーのキャッシュで起動
    if (last) {
      await openLocal(last)
      useCloud.setState({ phase: 'ready', user: last, sync: 'offline' })
      return
    }
    useCloud.setState({ phase: 'signedOut', notice: 'オフラインのためログインできません' })
    return
  }
  if (!user) {
    removeRaw(LAST_USER)
    useCloud.setState({ phase: 'signedOut', user: null })
    return
  }
  writeRaw(LAST_USER, JSON.stringify(user))
  useCloud.setState({ phase: 'loading', user })
  await openLocal(user)
  try {
    await pull(true)
  } catch {
    useCloud.setState({ sync: 'offline' })
  }
  useCloud.setState({ phase: 'ready' })
}

/** 端末のキャッシュを読み込み、変更の監視を始める */
async function openLocal(user: User) {
  uid = user.id
  setStorageUser(uid)
  try {
    meta = { rev: 0, dirty: false, localAt: 0, ...JSON.parse(readRaw(metaKey(uid)) ?? '{}') }
  } catch {
    meta = { rev: 0, dirty: false, localAt: 0 }
  }
  // 試作版（ログイン前）でこの端末に保存していたデータがあれば、初回だけ引き継ぐ
  const legacy = readRaw(STORAGE_KEY)
  if (legacy && !readRaw(`${STORAGE_KEY}:${uid}`)) {
    writeRaw(`${STORAGE_KEY}:${uid}`, legacy)
    meta = { rev: 0, dirty: true, localAt: Date.now() }
    saveMeta()
  }
  await useStore.persist.rehydrate()
  unsub?.()
  unsub = useStore.subscribe((s, prev) => {
    if (applying) return
    const opts = useStore.persist.getOptions()
    // 保存対象の値が変わったときだけ送信を予約
    const a = opts.partialize!(s) as Record<string, unknown>
    const b = opts.partialize!(prev) as Record<string, unknown>
    if (Object.keys(a).every((k) => a[k] === b[k])) return
    meta.dirty = true
    meta.localAt = Date.now()
    saveMeta()
    schedule()
  })
}

function schedule(ms = 1200) {
  clearTimeout(timer)
  timer = setTimeout(() => void push(), ms)
}

/** サーバの最新を確認して取り込む。first は起動時 */
export async function pull(first = false) {
  if (!uid) return
  const r = await api<ServerState>('GET', '/api/state')
  if (r.status === 401) return signedOut()
  if (r.status !== 200) throw new Error('state')
  const s = r.data
  if (!s.data) {
    // サーバにまだ無い：この端末の状態（無ければ初期データ）を最初の版として保存
    meta.rev = 0
    meta.dirty = true
    saveMeta()
    await push()
    return
  }
  if (s.rev === meta.rev) {
    if (meta.dirty) await push()
    else useCloud.setState({ sync: 'idle', lastSync: Date.now() })
    return
  }
  // サーバの方が新しい版
  if (meta.dirty && meta.localAt > s.updatedAt) {
    // この端末の未送信の変更の方が新しい
    await push(true)
    return
  }
  apply(s.data)
  meta = { rev: s.rev, dirty: false, localAt: 0 }
  saveMeta()
  useCloud.setState({ sync: 'idle', lastSync: Date.now(), notice: first ? null : '別の端末の変更を読み込みました' })
}

export function push(force = false): Promise<void> {
  if (inflight) {
    schedule(300)
    return inflight
  }
  inflight = (async () => {
    if (!uid || (!meta.dirty && !force)) return
    clearTimeout(timer)
    useCloud.setState({ sync: 'saving' })
    const sentAt = meta.localAt
    try {
      const r = await api<{ rev: number; updatedAt: number; error?: string }>('PUT', '/api/state', { baseRev: meta.rev, data: snapshot(), device: deviceId, force })
      if (r.status === 401) return signedOut()
      if (r.status === 409) {
        inflight = null
        await pull()
        return
      }
      if (r.status !== 200) throw new Error(r.data.error ?? 'save')
      meta.rev = r.data.rev
      // 送信中に変更が無ければ同期済み
      if (meta.localAt === sentAt) meta.dirty = false
      saveMeta()
      useCloud.setState({ sync: 'idle', lastSync: Date.now() })
      if (meta.dirty) schedule(300)
    } catch {
      const offline = !navigator.onLine
      useCloud.setState({ sync: offline ? 'offline' : 'error' })
      schedule(offline ? 15000 : 8000)
    }
  })().finally(() => {
    inflight = null
  })
  return inflight
}

function signedOut() {
  unsub?.()
  unsub = null
  removeRaw(LAST_USER)
  uid = ''
  useCloud.setState({ phase: 'signedOut', user: null })
}

export async function logout() {
  if (meta.dirty) await push().catch(() => {})
  await api('POST', '/auth/logout', {}).catch(() => {})
  // 共有端末に残さないよう、このユーザーのキャッシュを消す
  if (uid) {
    removeRaw(`${STORAGE_KEY}:${uid}`)
    removeRaw(metaKey(uid))
  }
  useStore.getState().reset()
  signedOut()
}

export async function deleteAccount() {
  const r = await api('POST', '/api/account/delete', {})
  if (r.status !== 200) throw new Error('delete')
  if (uid) {
    removeRaw(`${STORAGE_KEY}:${uid}`)
    removeRaw(metaKey(uid))
  }
  useStore.getState().reset()
  signedOut()
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    if (!uid) return
    useCloud.setState({ sync: 'idle' })
    void pull().catch(() => {})
  })
  window.addEventListener('offline', () => uid && useCloud.setState({ sync: 'offline' }))
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && uid && useCloud.getState().phase === 'ready') void pull().catch(() => {})
    // 画面を離れるときは待たずに送る
    if (document.visibilityState === 'hidden' && meta.dirty) void push()
  })
  setInterval(() => {
    if (document.visibilityState === 'visible' && uid && useCloud.getState().phase === 'ready') void pull().catch(() => {})
  }, 60000)
}
