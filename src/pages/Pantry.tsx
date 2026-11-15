import { motion, useMotionValue, useTransform, type PanInfo } from 'motion/react'
import { Check, ClipboardList, Plus, Refrigerator, ShoppingCart, Snowflake, Trash2, Utensils, Warehouse } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Page } from '../components/layout/Page'
import { Button, IconButton } from '../components/ui/Button'
import { Empty, Field, inputCls, SampleNote, Tag } from '../components/ui/bits'
import { Segmented } from '../components/ui/Segmented'
import { Sheet } from '../components/ui/Sheet'
import { toast } from '../components/ui/Toast'
import { AISLE_ORDER, INGREDIENT_MAP, INGREDIENTS } from '../data/ingredients'
import { addDays, diffDays, fmtMD, today, weekday } from '../lib/date'
import { cx, qty, uid, yen } from '../lib/format'
import { useWeekSpend } from '../store/derived'
import { useStore } from '../store/useStore'
import type { InventoryLot, StorageLoc } from '../types'
import { ExpTag } from './Home'

type Tab = 'inventory' | 'shopping' | 'prepared'
const LOC_LABEL: Record<StorageLoc, string> = { fridge: '冷蔵', freezer: '冷凍', pantry: '常温' }

export default function Pantry() {
  const [sp, setSp] = useSearchParams()
  const tab = (sp.get('tab') as Tab) || 'inventory'
  const shopping = useStore((s) => s.shopping)
  const prepared = useStore((s) => s.prepared)
  const inventory = useStore((s) => s.inventory)
  return (
    <Page title="食材・買い物" subtitle={useStore.getState().profile.store}>
      <Segmented className="mb-5 lg:max-w-lg" label="表示" value={tab} onChange={(v) => setSp({ tab: v }, { replace: true })} options={[
        { value: 'inventory', label: '在庫', count: inventory.length },
        { value: 'shopping', label: '買い物', count: shopping.filter((i) => !i.purchased).length },
        { value: 'prepared', label: '作り置き', count: prepared.filter((p) => p.servings > 0).reduce((a, p) => a + p.servings, 0) },
      ]} />
      {tab === 'inventory' && <Inventory />}
      {tab === 'shopping' && <Shopping />}
      {tab === 'prepared' && <Prepared />}
    </Page>
  )
}

/* ---------- 在庫 ---------- */
function Inventory() {
  const inventory = useStore((s) => s.inventory)
  const plan = useStore((s) => s.plan)
  const recipes = useStore((s) => s.recipes)
  const remove = useStore((s) => s.removeLot)
  const upsert = useStore((s) => s.upsertLot)
  const [edit, setEdit] = useState<InventoryLot | null>(null)
  const usage = useMemo(() => {
    const m = new Map<string, Set<string>>()
    for (const d of plan?.days ?? []) for (const id of [d.dinner.main, d.dinner.side]) for (const i of (id && recipes[id]?.ingredients) || []) {
      if (!m.has(i.ingredientId)) m.set(i.ingredientId, new Set())
      m.get(i.ingredientId)!.add(recipes[id!].name)
    }
    return m
  }, [plan, recipes])
  const groups: StorageLoc[] = ['fridge', 'freezer', 'pantry']
  const hasSample = inventory.some((l) => !l.verified)
  const onDelete = (l: InventoryLot) => {
    remove(l.id)
    toast(`${INGREDIENT_MAP[l.ingredientId]?.name}を在庫から削除しました`, 'info', { label: '元に戻す', run: () => upsert(l) })
  }
  return (
    <>
      {hasSample && <p className="mb-4 rounded-[14px] bg-amber-soft px-4 py-3 text-[14px] leading-relaxed text-amber"><span className="font-semibold">「仮」</span>の数量はサンプルとして入れた値で、実際の量は未確認です。量を確認したら編集して確定してください。</p>}
      {groups.map((loc) => {
        const lots = inventory.filter((l) => l.location === loc).sort((a, b) => (a.expiresOn ?? '9').localeCompare(b.expiresOn ?? '9'))
        if (!lots.length) return null
        return (
          <section key={loc} className="mb-6">
            <h2 className="mb-2 flex items-center gap-2 px-1 text-[17px] font-bold">{loc === 'freezer' ? <Snowflake size={17} className="text-sky" aria-hidden /> : loc === 'fridge' ? <Refrigerator size={17} className="text-basil" aria-hidden /> : <Warehouse size={17} className="text-ink-3" aria-hidden />}{LOC_LABEL[loc]}</h2>
            <ul className="surface divide-y divide-line overflow-hidden">
              {lots.map((l) => {
                const ing = INGREDIENT_MAP[l.ingredientId]
                const uses = usage.get(l.ingredientId)
                return (
                  <SwipeRow key={l.id} onDelete={() => onDelete(l)} label={`${ing?.name}を削除`}>
                    <button onClick={() => setEdit(l)} className="flex min-h-[60px] w-full items-center gap-3 px-4 py-2.5 text-left cursor-pointer">
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-1.5 text-[15px] font-medium">{ing?.name}{!l.verified && <SampleNote>仮</SampleNote>}</span>
                        <span className="block truncate text-[12px] text-ink-3">{l.purchasedOn ? `${fmtMD(l.purchasedOn)}購入` : '購入日不明'}{uses ? `・使用予定：${[...uses].slice(0, 2).join('、')}${uses.size > 2 ? ' ほか' : ''}` : ''}</span>
                      </span>
                      <span className="num text-[15px] font-semibold">{qty(l.quantity, ing?.unit ?? 'g')}</span>
                      {l.expiresOn && <ExpTag date={l.expiresOn} />}
                    </button>
                  </SwipeRow>
                )
              })}
            </ul>
          </section>
        )
      })}
      {!inventory.length && <div className="surface mb-6"><Empty icon={<Refrigerator size={26} />} title="在庫がありません" body="買い物で購入済みにすると自動で追加されます。手動でも追加できます。" /></div>}
      <p className="mb-3 px-1 text-[12px] text-ink-3">左にスワイプ、または編集画面から削除できます。常備調味料は在庫管理の対象外です。</p>
      <Button variant="tinted" icon={<Plus size={16} />} onClick={() => setEdit({ id: uid('lot'), ingredientId: 'onion', quantity: 100, location: 'pantry', purchasedOn: today(), expiresOn: addDays(today(), 14), verified: true })}>在庫を追加</Button>
      <LotSheet lot={edit} onClose={() => setEdit(null)} />
    </>
  )
}

function SwipeRow({ children, onDelete, label }: { children: React.ReactNode; onDelete: () => void; label: string }) {
  const x = useMotionValue(0)
  const bg = useTransform(x, [-120, -40, 0], [1, 0.6, 0])
  const onEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.x < -110 || info.velocity.x < -600) onDelete()
  }
  return (
    <li className="relative overflow-hidden">
      <motion.div style={{ opacity: bg }} className="absolute inset-0 flex items-center justify-end bg-raw pr-5 text-white" aria-hidden><Trash2 size={18} /></motion.div>
      <motion.div style={{ x }} drag="x" dragDirectionLock dragConstraints={{ left: 0, right: 0 }} dragElastic={{ left: 0.7, right: 0 }} onDragEnd={onEnd} className="relative bg-surface">
        {children}
      </motion.div>
      <button className="sr-only" onClick={onDelete}>{label}</button>
    </li>
  )
}

function LotSheet({ lot, onClose }: { lot: InventoryLot | null; onClose: () => void }) {
  const upsert = useStore((s) => s.upsertLot)
  const remove = useStore((s) => s.removeLot)
  const exists = useStore((s) => s.inventory.some((l) => l.id === lot?.id))
  const [d, setD] = useState<InventoryLot | null>(lot)
  const [key, setKey] = useState(lot?.id)
  if (lot?.id !== key) { setKey(lot?.id); setD(lot) }
  if (!d) return <Sheet open={false} onClose={onClose} title="">{null}</Sheet>
  const ing = INGREDIENT_MAP[d.ingredientId]
  const save = () => {
    if (!(d.quantity > 0)) return toast('数量は0より大きい値を入力してください', 'error')
    upsert({ ...d, verified: true })
    toast(exists ? '在庫を更新しました' : '在庫を追加しました')
    onClose()
  }
  return (
    <Sheet open={!!lot} onClose={onClose} title={exists ? '在庫を編集' : '在庫を追加'} footer={
      <div className="flex gap-2">
        {exists && <Button variant="danger" icon={<Trash2 size={16} />} onClick={() => { remove(d.id); onClose(); toast('削除しました', 'info') }}>削除</Button>}
        <Button className="flex-1" onClick={save}>保存</Button>
      </div>
    }>
      <div className="grid gap-4">
        <Field label="食材">
          <select className={inputCls} value={d.ingredientId} disabled={exists} onChange={(e) => { const i = INGREDIENT_MAP[e.target.value]; setD({ ...d, ingredientId: i.id, location: i.defaultStorage, expiresOn: addDays(today(), i.shelfDays[i.defaultStorage] ?? 7) }) }}>
            {INGREDIENTS.filter((i) => !i.staple).map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={`数量（${ing?.unit}）`}><input type="number" step="any" min={0} className={cx(inputCls, 'num')} value={d.quantity} onChange={(e) => setD({ ...d, quantity: Number(e.target.value) })} /></Field>
          <Field label="保存場所">
            <select className={inputCls} value={d.location} onChange={(e) => setD({ ...d, location: e.target.value as StorageLoc })}>
              <option value="fridge">冷蔵</option><option value="freezer">冷凍</option><option value="pantry">常温</option>
            </select>
          </Field>
          <Field label="購入日"><input type="date" className={inputCls} value={d.purchasedOn ?? ''} onChange={(e) => setD({ ...d, purchasedOn: e.target.value || undefined })} /></Field>
          <Field label="期限"><input type="date" className={inputCls} value={d.expiresOn ?? ''} onChange={(e) => setD({ ...d, expiresOn: e.target.value || undefined })} /></Field>
        </div>
        {!d.verified && <p className="text-[13px] text-amber">保存すると「仮」の表示が外れ、確認済みの数量になります。</p>}
      </div>
    </Sheet>
  )
}

/* ---------- 買い物 ---------- */
function Shopping() {
  const plan = useStore((s) => s.plan)
  const shopping = useStore((s) => s.shopping)
  const recipes = useStore((s) => s.recipes)
  const budget = useStore((s) => s.profile.weeklyGroceryBudget)
  const setPurchased = useStore((s) => s.setPurchased)
  const setPrice = useStore((s) => s.setPrice)
  const addManual = useStore((s) => s.addManualItem)
  const removeItem = useStore((s) => s.removeItem)
  const spend = useWeekSpend()
  const [name, setName] = useState('')

  if (!plan || plan.status !== 'confirmed') {
    return <div className="surface"><Empty icon={<ClipboardList size={26} />} title="献立が確定していません" body="確定した献立から必要量を計算し、在庫を差し引いて買い物リストを作ります。" action={<Link to="/plan" className="press inline-flex h-11 items-center rounded-ctl bg-basil px-4 font-semibold text-white">週間献立へ</Link>} /></div>
  }
  const remaining = shopping.filter((i) => !i.purchased).reduce((a, i) => a + (i.actualPrice ?? i.estPrice), 0)
  const projected = spend.grocery + remaining
  const aisles = AISLE_ORDER.filter((a) => shopping.some((i) => i.aisle === a))
  const toggle = (id: string, v: boolean) => {
    setPurchased(id, v)
    if (v) toast('購入済みにしました。在庫と支出に反映しました', 'ok', { label: '取り消す', run: () => setPurchased(id, false) })
  }
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-x-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="order-2 lg:order-1">
        {!shopping.length && <div className="surface mb-6"><Empty icon={<Check size={26} />} title="買うものはありません" body={plan.cookedSessionId ? '今週の作り置きは調理済みです。' : '在庫で献立の材料がそろっています。'} /></div>}
        {aisles.map((a) => (
          <section key={a} className="mb-5">
            <h2 className="mb-2 px-1 text-[15px] font-bold text-ink-2">{a}</h2>
            <ul className="surface divide-y divide-line overflow-hidden">
              {shopping.filter((i) => i.aisle === a).map((i) => (
                <li key={i.id} className={cx('flex items-center gap-3 py-2.5 pr-3 pl-2', i.purchased && 'bg-[#fafbf9]')}>
                  <button onClick={() => toggle(i.id, !i.purchased)} aria-pressed={i.purchased} aria-label={i.purchased ? `${i.name}を未購入に戻す` : `${i.name}を購入済みにする`} className={cx('press flex h-11 w-11 shrink-0 items-center justify-center rounded-full cursor-pointer')}>
                    <span className={cx('flex h-7 w-7 items-center justify-center rounded-full ring-[1.5px] transition-colors', i.purchased ? 'bg-basil text-white ring-basil' : 'text-transparent ring-line-strong')}><Check size={16} strokeWidth={3} /></span>
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className={cx('text-[15px] font-medium', i.purchased && 'text-ink-3 line-through')}>{i.name}</p>
                    <p className="truncate text-[12px] text-ink-3">
                      {i.manual ? '手動で追加' : <>不足 {qty(i.needQty, i.unit)} → {i.packs > 1 ? `${i.packs}×` : ''}{i.packLabel}</>}
                      {i.usedBy.length > 0 && `・${i.usedBy.map((id) => recipes[id]?.name).filter(Boolean).slice(0, 2).join('、')}${i.usedBy.length > 2 ? ` ほか${i.usedBy.length - 2}品` : ''}`}
                    </p>
                  </div>
                  <label className="relative w-[84px] shrink-0">
                    <span className="sr-only">{i.name}の価格</span>
                    <span className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-[13px] text-ink-3">¥</span>
                    <input inputMode="numeric" className="num h-10 w-full rounded-[10px] bg-sunken pr-2 pl-5 text-right text-[15px] outline-none focus:bg-surface focus:ring-2 focus:ring-basil/40" placeholder={String(i.estPrice)} value={i.actualPrice ?? ''} onChange={(e) => { const v = e.target.value.replace(/[^\d]/g, ''); setPrice(i.id, v ? Number(v) : undefined) }} />
                  </label>
                  {i.manual && !i.purchased && <IconButton label={`${i.name}を削除`} onClick={() => removeItem(i.id)}><Trash2 size={16} /></IconButton>}
                </li>
              ))}
            </ul>
          </section>
        ))}
        <form className="mb-6 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (name.trim()) { addManual(name.trim()); setName('') } }}>
          <input className={cx(inputCls, 'bg-surface shadow-card')} placeholder="献立以外のものを追加（例：ティッシュ）" value={name} onChange={(e) => setName(e.target.value)} aria-label="買い物リストに追加" />
          <Button type="submit" variant="tinted" icon={<Plus size={16} />}>追加</Button>
        </form>
        <p className="mb-6 px-1 text-[12px] leading-relaxed text-ink-3">価格は想定の目安です。レシートの金額を入力すると支出が更新されます。購入済みにすると在庫に追加され、取り消すと在庫・支出から差し戻します（二重計上はしません）。</p>
      </div>

      <aside className="order-1 mb-5 lg:order-2">
        <section className="surface p-5 lg:sticky lg:top-6">
          <p className="text-[13px] font-semibold text-ink-3">予算の消化</p>
          <p className="mt-1"><span className="num text-[30px] font-bold">{Math.round((spend.grocery / budget) * 100)}</span><span className="text-[15px] text-ink-2">%</span></p>
          <div className="relative mt-2 h-2.5 overflow-hidden rounded-full bg-sunken" aria-hidden>
            <div className="absolute inset-y-0 left-0 rounded-full bg-basil/25" style={{ width: `${Math.min(100, (projected / budget) * 100)}%` }} />
            <div className={cx('absolute inset-y-0 left-0 rounded-full', projected > budget ? 'bg-raw' : 'bg-basil')} style={{ width: `${Math.min(100, (spend.grocery / budget) * 100)}%` }} />
          </div>
          <dl className="mt-3 space-y-1 text-[14px]">
            <div className="flex justify-between"><dt className="text-ink-2">支出済み</dt><dd className="num font-semibold">{yen(spend.grocery)}</dd></div>
            <div className="flex justify-between"><dt className="text-ink-2">未購入の見込み</dt><dd className="num">{yen(remaining)}</dd></div>
            <div className="flex justify-between border-t border-line pt-1"><dt className="text-ink-2">合計見込み / 予算</dt><dd className={cx('num font-semibold', projected > budget && 'text-raw')}>{yen(projected)} / {yen(budget)}</dd></div>
          </dl>
          <p className="mt-3 flex items-center gap-1.5 text-[12px] text-ink-3"><ShoppingCart size={13} aria-hidden />売場の並び順で表示しています</p>
        </section>
      </aside>
    </div>
  )
}

/* ---------- 作り置き ---------- */
function Prepared() {
  const prepared = useStore((s) => s.prepared)
  const recipes = useStore((s) => s.recipes)
  const eat = useStore((s) => s.eatPrepared)
  const deleteMeal = useStore((s) => s.deleteMeal)
  const discard = useStore((s) => s.discardPrepared)
  const [showEmpty, setShowEmpty] = useState(false)
  const t = today()
  const list = prepared.filter((p) => showEmpty || p.servings > 0).sort((a, b) => a.consumeBy.localeCompare(b.consumeBy))
  const freezerCount = prepared.filter((p) => p.location === 'freezer').reduce((a, p) => a + p.servings, 0)
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Tag tone="sky"><Snowflake size={12} />冷凍 {freezerCount}食 / 目安12食</Tag>
        <Tag tone="basil"><Refrigerator size={12} />冷蔵 {prepared.filter((p) => p.location === 'fridge').reduce((a, p) => a + p.servings, 0)}食</Tag>
        <button className="ml-auto text-[13px] font-semibold text-basil cursor-pointer" onClick={() => setShowEmpty(!showEmpty)}>{showEmpty ? '残りのあるものだけ' : '食べ終えたものも表示'}</button>
      </div>
      {!list.length && <div className="surface"><Empty icon={<Utensils size={26} />} title="作り置きはありません" body="一括調理を完了すると、ここに自動で登録されます。" action={<Link to="/cook" className="font-semibold text-basil">一括調理ナビへ</Link>} /></div>}
      <ul className="space-y-2">
        {list.map((p) => {
          const r = recipes[p.recipeId]
          const over = diffDays(p.consumeBy, t) < 0
          return (
            <li key={p.id} className="surface flex items-center gap-3 p-4">
              <span className="h-10 w-1.5 shrink-0 rounded-full" style={{ background: r?.color }} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-[16px] font-semibold">{r?.name ?? '削除されたレシピ'}<span className="num text-[14px] font-normal text-ink-2">{p.servings}食</span></p>
                <p className="mt-0.5 text-[12px] text-ink-3">
                  {fmtMD(p.cookedOn)}調理・{LOC_LABEL[p.location]}{p.plannedFor.length ? `・予定 ${p.plannedFor.map((d) => weekday(d)).join('')}` : ''}
                  {p.eatenLog.length > 0 && `・食べた ${p.eatenLog.map((e) => fmtMD(e.date)).join(', ')}`}
                </p>
                <div className="mt-1.5"><ExpTag date={p.consumeBy} /></div>
              </div>
              {p.servings > 0 && !over && <Button size="sm" variant="tinted" onClick={() => { const res = eat(p.id, 'dinner'); if (res.ok) { const m = useStore.getState().meals.at(-1); toast(res.message ?? '', 'ok', m ? { label: '取り消す', run: () => deleteMeal(m.id) } : undefined) } else toast(res.message, 'error') }}>食べた</Button>}
              {(over || p.servings === 0) && <IconButton label="一覧から削除" onClick={() => { discard(p.id); toast(over ? '期限切れの作り置きを廃棄として削除しました' : '削除しました', 'info') }}><Trash2 size={17} /></IconButton>}
            </li>
          )
        })}
      </ul>
      <p className="mt-3 px-1 text-[12px] leading-relaxed text-ink-3">「食べた」は夕食として記録し、栄養記録に反映します。期限を過ぎたものは食べずに廃棄してください。</p>
    </>
  )
}
