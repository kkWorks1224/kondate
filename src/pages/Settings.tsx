import { Download, LogOut, RefreshCw, RotateCcw, UserX, Wrench } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Page } from '../components/layout/Page'
import { Button } from '../components/ui/Button'
import { Field, Group, inputCls, Row, Stepper, Tag } from '../components/ui/bits'
import { Sheet } from '../components/ui/Sheet'
import { toast } from '../components/ui/Toast'
import { cx } from '../lib/format'
import { ai } from '../services/ai'
import { deleteAccount, logout, pull, useCloud } from '../services/cloud'
import { SyncBadge } from '../features/auth/SyncBadge'
import { useStore } from '../store/useStore'
import type { Tool, WashPolicy } from '../types'

const WASH: Record<WashPolicy, string> = { none: '不要', 'after-raw': '生肉の後', 'between-recipes': '料理が変わる時', always: '使用後毎回' }
const WD = ['日', '月', '火', '水', '木', '金', '土']

export default function Settings() {
  const p = useStore((s) => s.profile)
  const update = useStore((s) => s.updateProfile)
  const tools = useStore((s) => s.tools)
  const session = useStore((s) => s.session)
  const reset = useStore((s) => s.reset)
  const [confirm, setConfirm] = useState(false)
  const [delAcc, setDelAcc] = useState(false)
  const [busy, setBusy] = useState(false)
  const user = useCloud((s) => s.user)
  const nav = useNavigate()

  // 調理中に器具を使っている工程（タイマー進行中の工程）
  const occupied = new Map<string, string>()
  if (session && session.status !== 'done') {
    for (const t of session.result.tasks) if (session.timers[t.id] && !session.progress[t.id]) for (const u of t.units ?? []) occupied.set(u.split('#')[0], t.title)
  }
  const groups = ['加熱', '家電', '下ごしらえ', '保存'] as const

  const exportData = () => {
    const raw = JSON.stringify(useStore.persist.getOptions().partialize!(useStore.getState()), null, 2)
    const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `kondate-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Page title="設定" subtitle="プロフィール・調理器具・データ" back="/">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-x-6 lg:grid-cols-2">
        <div>
          <Group title="アカウント" footer="データは Cloudflare D1 に保存され、同じ Google アカウントでログインした端末と同期されます。オフライン中の変更は端末に保存し、つながったときに送信します。">
            {user && (
              <Row>
                {user.picture ? <img src={user.picture} alt="" referrerPolicy="no-referrer" className="h-10 w-10 rounded-full" /> : <span className="flex h-10 w-10 items-center justify-center rounded-full bg-basil text-white">{(user.name || user.email).charAt(0)}</span>}
                <span className="min-w-0 flex-1"><span className="block text-[15px] font-semibold">{user.name}</span><span className="block truncate text-[13px] text-ink-3">{user.email}</span></span>
              </Row>
            )}
            <Row><SyncBadge className="flex-1 text-[14px]" /></Row>
            <Row onClick={() => void pull().then(() => toast('最新の状態を確認しました')).catch(() => toast('同期できませんでした', 'error'))}><RefreshCw size={18} className="text-basil" aria-hidden /><span className="flex-1 text-[15px] font-medium text-basil">今すぐ同期</span></Row>
            <Row onClick={async () => { setBusy(true); await logout() }}><LogOut size={18} className="text-ink-2" aria-hidden /><span className="flex-1 text-[15px] font-medium">{busy ? 'ログアウト中…' : 'ログアウト'}</span></Row>
            <Row onClick={() => setDelAcc(true)}><UserX size={18} className="text-raw" aria-hidden /><span className="flex-1 text-[15px] font-medium text-raw">アカウントとデータを削除</span></Row>
          </Group>
          <Group title="生活と予算" footer="希望体重は表示のみに使い、極端なカロリー制限は設定しません。">
            <div className="grid grid-cols-2 gap-3 p-4">
              <Field label="自炊の予算（週）"><input type="number" className={cx(inputCls, 'num')} value={p.weeklyGroceryBudget} onChange={(e) => update({ weeklyGroceryBudget: Number(e.target.value) })} /></Field>
              <Field label="昼食の予算（1回）"><input type="number" className={cx(inputCls, 'num')} value={p.lunchBudget} onChange={(e) => update({ lunchBudget: Number(e.target.value) })} /></Field>
              <Field label="平日の夕食準備（分）"><input type="number" className={cx(inputCls, 'num')} value={p.weekdayPrepMin} onChange={(e) => update({ weekdayPrepMin: Number(e.target.value) })} /></Field>
              <Field label="作り置きの曜日">
                <select className={inputCls} value={p.batchDay} onChange={(e) => update({ batchDay: Number(e.target.value) as typeof p.batchDay })}>{WD.map((w, i) => <option key={w} value={i}>{w}曜日</option>)}</select>
              </Field>
              <Field label="同じ料理を続けてよい日数"><input type="number" min={1} max={4} className={cx(inputCls, 'num')} value={p.maxRepeatDays} onChange={(e) => update({ maxRepeatDays: Number(e.target.value) })} /></Field>
              <Field label="買い物の店舗"><input className={inputCls} value={p.store} onChange={(e) => update({ store: e.target.value })} /></Field>
            </div>
            <Row>
              <span className="flex-1 text-[15px]">朝食を記録の対象にする</span>
              <input type="checkbox" className="h-5 w-5 accent-[#2e6a4f]" checked={p.expectBreakfast} onChange={(e) => update({ expectBreakfast: e.target.checked })} aria-label="朝食を記録の対象にする" />
            </Row>
          </Group>
          <Group title="からだ">
            <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3">
              <Field label="年齢"><input type="number" className={cx(inputCls, 'num')} value={p.age} onChange={(e) => update({ age: Number(e.target.value) })} /></Field>
              <Field label="身長 cm"><input type="number" className={cx(inputCls, 'num')} value={p.heightCm} onChange={(e) => update({ heightCm: Number(e.target.value) })} /></Field>
              <Field label="体重 kg"><input type="number" step="0.1" className={cx(inputCls, 'num')} value={p.weightKg} onChange={(e) => update({ weightKg: Number(e.target.value) })} /></Field>
              <Field label="体脂肪率 %"><input type="number" step="0.1" className={cx(inputCls, 'num')} value={p.bodyFatPct} onChange={(e) => update({ bodyFatPct: Number(e.target.value) })} /></Field>
              <Field label="希望体重 kg"><input type="number" step="0.1" className={cx(inputCls, 'num')} value={p.goalWeightKg} onChange={(e) => update({ goalWeightKg: Number(e.target.value) })} /></Field>
              <Field label="活動量">
                <select className={inputCls} value={p.activity} onChange={(e) => update({ activity: e.target.value as typeof p.activity })}>
                  <option value="low">座り仕事中心</option><option value="moderate">ふつう</option><option value="high">活発</option>
                </select>
              </Field>
            </div>
          </Group>
          <Group title="データ">
            <Row><span className="flex-1 text-[14px] text-ink-2">AI：{ai.label}（通信できないときはルールベース）</span></Row>
            <Row onClick={exportData}><Download size={18} className="text-basil" aria-hidden /><span className="flex-1 text-[15px] font-medium text-basil">データを書き出す（JSON）</span></Row>
            <Row onClick={() => setConfirm(true)}><RotateCcw size={18} className="text-raw" aria-hidden /><span className="flex-1 text-[15px] font-medium text-raw">初期状態に戻す</span></Row>
          </Group>
        </div>
        <div>
          <Group title="調理器具" footer="数量・同時利用・洗浄の設定は、一括調理の工程計画に使われます。数量を0にすると、その器具を使わない前提で再計算します。">
            {groups.map((g) => (
              <div key={g}>
                <p className="bg-[#fafbf9] px-4 py-1.5 text-[12px] font-semibold text-ink-3">{g}</p>
                {tools.filter((t) => t.group === g).map((t) => <ToolRow key={t.id} t={t} busy={occupied.get(t.id)} />)}
              </div>
            ))}
          </Group>
        </div>
      </div>
      <Sheet open={delAcc} onClose={() => setDelAcc(false)} title="アカウントを削除しますか？" footer={<div className="flex gap-2"><Button variant="secondary" className="flex-1" onClick={() => setDelAcc(false)}>やめる</Button><Button variant="danger" className="flex-1" disabled={busy} onClick={async () => { setBusy(true); try { await deleteAccount() } catch { setBusy(false); toast('削除できませんでした', 'error') } }}>完全に削除する</Button></div>}>
        <p className="text-[15px] leading-relaxed text-ink-2">サーバに保存した献立・レシピ・在庫・記録とアカウント情報をすべて削除します。元に戻せません。</p>
      </Sheet>
      <Sheet open={confirm} onClose={() => setConfirm(false)} title="初期状態に戻しますか？" footer={<div className="flex gap-2"><Button variant="secondary" className="flex-1" onClick={() => setConfirm(false)}>やめる</Button><Button variant="danger" className="flex-1" onClick={() => { reset(); setConfirm(false); toast('初期状態に戻しました'); nav('/') }}>初期化する</Button></div>}>
        <p className="text-[15px] leading-relaxed text-ink-2">献立・レシピの編集・在庫・買い物・調理の進捗・食事と体重の記録をすべて消し、サンプルデータの状態に戻します。元に戻せません。必要なら先にデータを書き出してください。</p>
      </Sheet>
    </Page>
  )
}

function ToolRow({ t, busy }: { t: Tool; busy?: string }) {
  const update = useStore((s) => s.updateTool)
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-[15px] font-medium"><Wrench size={14} className="text-ink-3" aria-hidden />{t.name}{t.note && <span className="text-[12px] font-normal text-ink-3">{t.note}</span>}</p>
        {busy ? <Tag tone="amber" className="mt-1">使用中：{busy}</Tag> : null}
      </div>
      <Stepper label={`${t.name}の数量`} value={t.quantity} onChange={(q) => update(t.id, { quantity: q })} min={0} max={30} />
      <div className="flex w-full gap-2 sm:w-auto">
        <button aria-pressed={t.shareable} onClick={() => update(t.id, { shareable: !t.shareable })} className={cx('press h-9 rounded-full px-3 text-[12px] font-semibold cursor-pointer', t.shareable ? 'bg-basil-soft text-basil-ink' : 'bg-sunken text-ink-2')}>{t.shareable ? '同時に使える' : '同時に1工程'}</button>
        <label className="sr-only" htmlFor={`w-${t.id}`}>{t.name}の洗浄</label>
        <select id={`w-${t.id}`} className="h-9 rounded-full bg-sunken px-3 text-[12px] font-semibold text-ink-2" value={t.washPolicy} onChange={(e) => update(t.id, { washPolicy: e.target.value as WashPolicy })}>
          {Object.entries(WASH).map(([k, v]) => <option key={k} value={k}>洗浄：{v}</option>)}
        </select>
      </div>
    </div>
  )
}
