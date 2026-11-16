import { ArrowRight, CalendarDays, ChefHat, Clock, Coffee, Flame, Refrigerator, Settings, Snowflake, Sparkles, Store as StoreIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Page } from '../components/layout/Page'
import { Button } from '../components/ui/Button'
import { Empty, Group, inputCls, Meter, Row, Tag } from '../components/ui/bits'
import { toast } from '../components/ui/Toast'
import { BREAKFAST_PRESETS } from '../data/seed'
import { useProducts } from '../features/products/useProducts'
import { INGREDIENT_MAP } from '../data/ingredients'
import { movingAverage, SLOT_LABEL } from '../engine/health'
import { MODE_LABEL, suggestLunch } from '../engine/lunch'
import { recipeTimes } from '../engine/nutrition'
import { addDays, diffDays, fmtLong, relDay, today } from '../lib/date'
import { cx, yen } from '../lib/format'
import { useDayStatus, usePlanDerived, useTargets, useWeekSpend } from '../store/derived'
import { useStore } from '../store/useStore'

export default function Home() {
  const t = today()
  const plan = useStore((s) => s.plan)
  const profile = useStore((s) => s.profile)
  const isBatchDay = plan?.weekStart === t
  return (
    <Page
      title={fmtLong(t)}
      subtitle={isBatchDay ? '今日は作り置きの日' : `夕食の準備は${profile.weekdayPrepMin}分以内`}
      actions={
        <Link to="/settings" aria-label="設定" className="press flex h-11 w-11 items-center justify-center rounded-full text-ink-2 hover:bg-sunken lg:hidden">
          <Settings size={21} />
        </Link>
      }
    >
      <div className="grid grid-cols-[minmax(0,1fr)] gap-x-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <div>
          <TodayDinner />
          <LunchStrip />
          <Expiring />
        </div>
        <div>
          <Budget />
          <Nutrition />
          <WeightQuick />
        </div>
      </div>
    </Page>
  )
}

function TodayDinner() {
  const t = today()
  const nav = useNavigate()
  const plan = useStore((s) => s.plan)
  const recipes = useStore((s) => s.recipes)
  const prepared = useStore((s) => s.prepared)
  const meals = useStore((s) => s.meals)
  const session = useStore((s) => s.session)
  const eatDinner = useStore((s) => s.eatDinner)
  const deleteMeal = useStore((s) => s.deleteMeal)
  const derived = usePlanDerived()
  const day = plan?.days.find((d) => d.date === t)
  const tomorrow = plan?.days.find((d) => d.date === addDays(t, 1))
  const logged = meals.find((m) => m.date === t && m.slot === 'dinner')

  if (!plan || !day) {
    return (
      <section className="surface mb-6">
        <Empty icon={<CalendarDays size={26} />} title="今週の献立がまだありません" body="在庫と予算から7日分の夕食を提案します。提案は確定前に自由に編集できます。" action={<Button onClick={() => nav('/plan')} icon={<Sparkles size={17} />}>献立を提案してもらう</Button>} />
      </section>
    )
  }
  if (day.dinner.skip) {
    return (
      <section className="surface mb-6 p-5" aria-labelledby="today-dinner">
        <h2 id="today-dinner" className="text-[15px] font-semibold text-ink-2">今日の夕食</h2>
        <p className="mt-2 text-[22px] font-bold">今日は夕食なし</p>
        <p className="mt-1 text-[14px] text-ink-2">{day.dinner.note ?? '不要'}。献立の画面で「戻す」を押すと元の料理に戻せます。</p>
        <Button variant="tinted" className="mt-3" onClick={() => nav('/plan')}>週間献立へ</Button>
      </section>
    )
  }
  const main = day.dinner.main ? recipes[day.dinner.main] : undefined
  const side = day.dinner.side ? recipes[day.dinner.side] : undefined
  const stockOf = (id?: string) => prepared.filter((p) => p.recipeId === id && p.servings > 0).sort((a, b) => (a.location === 'fridge' ? -1 : 1) - (b.location === 'fridge' ? -1 : 1))[0]
  const cookDay = plan.weekStart === t && day.dinner.mode === 'batch' && !plan.cookedSessionId
  const tomorrowFrozen = tomorrow && [tomorrow.dinner.main, tomorrow.dinner.side].map((id) => stockOf(id)).filter((p) => p && p.location === 'freezer' && !prepared.some((q) => q.recipeId === p.recipeId && q.location === 'fridge' && q.servings > 0))

  const onEat = () => {
    const r = eatDinner(t)
    if (r.ok) {
      const id = useStore.getState().meals.at(-1)?.id
      toast(r.message ?? '記録しました', 'ok', id ? { label: '取り消す', run: () => deleteMeal(id) } : undefined)
    } else toast(r.message, 'error')
  }

  return (
    <section className="surface mb-6 overflow-hidden" aria-labelledby="today-dinner">
      <div className="px-5 pt-5 pb-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="today-dinner" className="text-[15px] font-semibold text-ink-2">今日の夕食</h2>
          {logged ? <Tag tone="basil">記録済み</Tag> : plan.status === 'draft' ? <Tag tone="amber">献立は下書き</Tag> : null}
        </div>
        <Link to={main ? `/recipes/${main.id}` : '/plan'} className="group block">
          <p className="text-[28px] leading-tight font-bold tracking-[-0.02em] group-hover:underline decoration-2 underline-offset-4">{main?.name ?? '主菜が未設定'}</p>
        </Link>
        {side && <p className="mt-1 text-[17px] text-ink-2">と {side.name}</p>}
      </div>

      <div className="border-t border-line bg-[#fafbf9] px-5 py-4">
        {cookDay ? (
          plan.status === 'confirmed' ? (
            <>
              <div className="flex items-start gap-3">
                <ChefHat size={20} className="mt-0.5 shrink-0 text-basil" aria-hidden />
                <div className="min-w-0 text-[15px] leading-relaxed">
                  <p className="font-semibold">一括調理で{derived?.inputs.length ?? 0}品をまとめて作る</p>
                  <p className="text-ink-2">
                    約<span className="num font-semibold text-ink">{derived?.cook.totalMin}</span>分（手を動かす時間 {derived?.cook.handsMin}分）。
                    {derived && derived.cook.naiveMin > derived.cook.totalMin && <>1品ずつ作るより約{derived.cook.naiveMin - derived.cook.totalMin}分短い計画です。</>}
                  </p>
                </div>
              </div>
              <Button className="mt-3 w-full sm:w-auto" icon={<ChefHat size={18} />} onClick={() => nav('/cook')}>
                {session && session.status !== 'done' ? '調理ナビを再開' : '一括調理ナビを開く'}
              </Button>
            </>
          ) : (
            <>
              <p className="text-[15px] leading-relaxed text-ink-2">献立を確定すると、買い物リストと一括調理の工程が作られます。</p>
              <Button className="mt-3" variant="tinted" onClick={() => nav('/plan')}>献立を確認して確定</Button>
            </>
          )
        ) : (
          <div className="space-y-2.5">
            {[main, side].filter(Boolean).map((r) => {
              const st = stockOf(r!.id)
              const fresh = day.dinner.mode === 'fresh'
              return (
                <div key={r!.id} className="flex items-start gap-3 text-[15px]">
                  {fresh ? <Flame size={18} className="mt-0.5 shrink-0 text-amber" aria-hidden /> : st?.location === 'freezer' ? <Snowflake size={18} className="mt-0.5 shrink-0 text-sky" aria-hidden /> : <Refrigerator size={18} className="mt-0.5 shrink-0 text-basil" aria-hidden />}
                  <div className="min-w-0 leading-relaxed">
                    <span className="font-semibold">{r!.name}</span>
                    <span className="text-ink-2">
                      {fresh ? `：今日作る（約${recipeTimes(r!).total}分）` : st ? (st.cookedOn === t && st.location === 'fridge' ? '：今日作ったもの。そのまま食べられます' : `：${st.location === 'freezer' ? '冷凍' : '冷蔵'}の作り置き。${r!.reheat}`) : '：作り置きがまだありません'}
                    </span>
                  </div>
                </div>
              )
            })}
            <div className="flex flex-wrap gap-2 pt-1">
              {logged ? (
                <Button variant="secondary" size="sm" onClick={() => { deleteMeal(logged.id); toast('夕食の記録を取り消しました', 'info') }}>記録を取り消す</Button>
              ) : (
                <Button size="sm" onClick={onEat}>食べたを記録</Button>
              )}
              <Button variant="ghost" size="sm" onClick={() => nav('/plan')}>週間献立</Button>
            </div>
          </div>
        )}
        {tomorrowFrozen && tomorrowFrozen.length > 0 && (
          <p className="mt-3 flex items-start gap-2 rounded-xl bg-sky-soft px-3 py-2 text-[13px] leading-relaxed text-sky">
            <Snowflake size={15} className="mt-0.5 shrink-0" aria-hidden />
            明日の{tomorrowFrozen.map((p) => recipes[p!.recipeId]?.name).join('・')}は冷凍です。今夜のうちに冷蔵庫へ移すと解凍が楽です。
          </p>
        )}
      </div>
    </section>
  )
}

function LunchStrip() {
  const t = today()
  const budget = useStore((s) => s.profile.lunchBudget)
  const meals = useStore((s) => s.meals)
  const targets = useTargets()
  const products = useProducts()
  const combos = useMemo(() => suggestLunch(products.all, budget, targets.kcal), [products.all, budget, targets.kcal])
  const logged = meals.find((m) => m.date === t && m.slot === 'lunch')
  return (
    <section className="mb-6" aria-labelledby="lunch-h">
      <div className="mb-2 flex items-end justify-between px-1">
        <h2 id="lunch-h" className="text-[17px] font-bold tracking-tight">セブンの昼食候補</h2>
        <Link to="/lunch" className="press flex h-9 items-center gap-1 rounded-lg px-2 text-[14px] font-semibold text-basil">すべて見る <ArrowRight size={15} aria-hidden /></Link>
      </div>
      {logged ? (
        <Link to="/lunch" className="surface press flex items-center gap-3 px-4 py-3.5">
          <StoreIcon size={20} className="shrink-0 text-basil" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold">今日の昼食は記録済み</p>
            <p className="truncate text-[13px] text-ink-2">{logged.items.map((i) => i.name).join('・')}</p>
          </div>
          <span className="num text-[15px] font-semibold">{yen(logged.price ?? 0)}</span>
        </Link>
      ) : (
        <div className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-3 sm:px-0">
          {combos.map((c) => (
            <Link key={c.id} to={`/lunch?pick=${c.id}`} className="surface press w-[72%] shrink-0 snap-start p-4 sm:w-auto">
              <p className="text-[13px] font-semibold text-basil">{MODE_LABEL[c.mode as keyof typeof MODE_LABEL]}</p>
              <p className="mt-1 line-clamp-2 text-[14px] leading-snug font-medium">{c.productIds.map((id) => products.map[id]?.name).join(' ＋ ')}</p>
              <p className="mt-2 flex items-baseline gap-2">
                <span className="num text-[18px] font-bold">{yen(c.price)}</span>
                <span className="num text-[13px] text-ink-2">P {Math.round(c.nutrients.protein)}g</span>
              </p>
            </Link>
          ))}
        </div>
      )}
      <p className="mt-2 px-1 text-[12px] text-ink-3">商品・価格はデモデータです（実際の販売状況・価格ではありません）</p>
    </section>
  )
}

function Expiring() {
  const t = today()
  const prepared = useStore((s) => s.prepared)
  const inventory = useStore((s) => s.inventory)
  const recipes = useStore((s) => s.recipes)
  const nav = useNavigate()
  const dishes = prepared.filter((p) => p.servings > 0 && diffDays(p.consumeBy, t) <= 2).sort((a, b) => a.consumeBy.localeCompare(b.consumeBy))
  const lots = inventory.filter((l) => l.expiresOn && diffDays(l.expiresOn, t) <= 2).sort((a, b) => a.expiresOn!.localeCompare(b.expiresOn!))
  if (!dishes.length && !lots.length) {
    return (
      <Group title="期限が近いもの">
        <Row><span className="text-[15px] text-ink-2">2日以内に期限を迎える料理・食材はありません</span></Row>
      </Group>
    )
  }
  return (
    <Group title="期限が近いもの" footer="作り置きは消費予定日、食材は登録した期限で判定しています">
      {dishes.map((p) => (
        <Row key={p.id} onClick={() => nav('/pantry?tab=prepared')}>
          {p.location === 'freezer' ? <Snowflake size={18} className="text-sky" aria-hidden /> : <Refrigerator size={18} className="text-basil" aria-hidden />}
          <span className="min-w-0 flex-1 truncate text-[15px] font-medium">{recipes[p.recipeId]?.name}<span className="text-ink-3"> ・{p.servings}食</span></span>
          <ExpTag date={p.consumeBy} />
        </Row>
      ))}
      {lots.map((l) => (
        <Row key={l.id} onClick={() => nav('/pantry')}>
          <Clock size={18} className="text-ink-3" aria-hidden />
          <span className="min-w-0 flex-1 truncate text-[15px]">{INGREDIENT_MAP[l.ingredientId]?.name}</span>
          <ExpTag date={l.expiresOn!} />
        </Row>
      ))}
    </Group>
  )
}

export function ExpTag({ date }: { date: string }) {
  const n = diffDays(date, today())
  return <Tag tone={n < 0 ? 'raw' : n === 0 ? 'raw' : n <= 2 ? 'amber' : 'neutral'}>{n < 0 ? `${-n}日超過` : n === 0 ? '今日まで' : `${relDay(date)}まで`}</Tag>
}

function Budget() {
  const budget = useStore((s) => s.profile.weeklyGroceryBudget)
  const lunchBudget = useStore((s) => s.profile.lunchBudget)
  const spend = useWeekSpend()
  const derived = usePlanDerived()
  const plan = useStore((s) => s.plan)
  const remainingEst = derived ? derived.list.filter((i) => !i.purchased).reduce((a, i) => a + i.estPrice, 0) : 0
  const pct = Math.min(1, spend.grocery / budget)
  const projected = spend.grocery + remainingEst
  return (
    <section className="surface mb-6 p-5" aria-labelledby="budget-h">
      <div className="flex items-baseline justify-between">
        <h2 id="budget-h" className="text-[15px] font-semibold text-ink-2">今週の食費（自炊）</h2>
        <Link to="/pantry?tab=shopping" className="text-[13px] font-semibold text-basil">買い物リスト</Link>
      </div>
      <p className="mt-1">
        <span className="num text-[30px] font-bold tracking-tight">{yen(spend.grocery)}</span>
        <span className="num text-[15px] text-ink-3"> / {yen(budget)}</span>
      </p>
      <div className="relative mt-2 h-2.5 overflow-hidden rounded-full bg-sunken" aria-hidden>
        <div className="absolute inset-y-0 left-0 rounded-full bg-basil/25" style={{ width: `${Math.min(100, (projected / budget) * 100)}%` }} />
        <div className={cx('absolute inset-y-0 left-0 rounded-full', projected > budget ? 'bg-raw' : 'bg-basil')} style={{ width: `${pct * 100}%` }} />
      </div>
      <p className="mt-2 text-[13px] text-ink-2">
        {plan ? <>未購入分の見込み {yen(remainingEst)} を含めると <span className={cx('num font-semibold', projected > budget && 'text-raw')}>{yen(projected)}</span></> : '献立を作ると見込み額を表示します'}
      </p>
      <div className="mt-4 flex items-center justify-between border-t border-line pt-3 text-[14px]">
        <span className="text-ink-2">昼食（別管理）</span>
        <span className="num">{yen(spend.lunch)}<span className="text-ink-3"> ・{spend.lunchCount}回 ・1回{yen(lunchBudget)}以内</span></span>
      </div>
    </section>
  )
}

function Nutrition() {
  const t = today()
  const status = useDayStatus(t)
  const targets = useTargets()
  const record = useStore((s) => s.recordBreakfast)
  const deleteMeal = useStore((s) => s.deleteMeal)
  const [open, setOpen] = useState(false)
  const n = status.nutrients
  return (
    <section className="surface mb-6 p-5" aria-labelledby="nut-h">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 id="nut-h" className="text-[15px] font-semibold text-ink-2">今日の栄養</h2>
        <Link to="/health" className="text-[13px] font-semibold text-basil">詳しく</Link>
      </div>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {(['breakfast', 'lunch', 'dinner'] as const).map((slot) => (
          <Tag key={slot} tone={status.logged.includes(slot) ? 'basil' : 'neutral'}>{SLOT_LABEL[slot]}{status.logged.includes(slot) ? ' 記録済' : ' 未記録'}</Tag>
        ))}
      </div>
      <div className="space-y-3">
        <Meter label="エネルギー" value={n.kcal} target={targets.kcal} unit="kcal" />
        <Meter label="たんぱく質" value={n.protein} target={targets.protein} unit="g" />
        <Meter label="野菜" value={n.vegG} target={targets.vegG} unit="g" />
        <Meter label="食塩相当量" value={n.salt} target={targets.salt} unit="g" mode="limit" tone="amber" />
      </div>
      <p className="mt-3 text-[12px] leading-relaxed text-ink-3">{status.complete ? '3食とも記録済み。値は推定です。' : '未記録の食事があるため、記録した分のみの合計です（推定値）。'}</p>
      {!status.logged.includes('breakfast') && (
        <div className="mt-3 border-t border-line pt-3">
          {!open ? (
            <Button variant="tinted" size="sm" icon={<Coffee size={16} />} onClick={() => setOpen(true)}>朝食を記録</Button>
          ) : (
            <div className="flex flex-wrap gap-2">
              {BREAKFAST_PRESETS.map((p) => (
                <Button key={p.id} variant="secondary" size="sm" onClick={() => { const r = record(p.id, t); toast(r.message ?? '', r.ok ? 'ok' : 'error', r.ok ? { label: '取り消す', run: () => { const m = useStore.getState().meals.at(-1); if (m) deleteMeal(m.id) } } : undefined); setOpen(false) }}>{p.label}</Button>
              ))}
              <Button variant="ghost" size="sm" onClick={() => { const r = record('skip', t); toast(r.message ?? '', 'info'); setOpen(false) }}>食べなかった</Button>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

function WeightQuick() {
  const t = today()
  const health = useStore((s) => s.health)
  const upsert = useStore((s) => s.upsertHealth)
  const goal = useStore((s) => s.profile.goalWeightKg)
  const todayLog = health.find((h) => h.date === t)
  const [w, setW] = useState(todayLog?.weight?.toString() ?? '')
  const avg = movingAverage(health, 'weight').at(-1)
  const save = () => {
    const v = Number(w)
    if (!v || v < 30 || v > 200) return toast('体重は30〜200kgの範囲で入力してください', 'error')
    upsert({ date: t, weight: Math.round(v * 10) / 10 })
    toast('体重を記録しました')
  }
  return (
    <section className="surface mb-6 p-5" aria-labelledby="w-h">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 id="w-h" className="text-[15px] font-semibold text-ink-2">体重</h2>
        <span className="text-[13px] text-ink-3">7日平均 <span className="num font-semibold text-ink">{avg?.avg.toFixed(1) ?? '—'}kg</span>・希望 {goal}kg</span>
      </div>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); save() }}>
        <label className="sr-only" htmlFor="w-in">今日の体重（kg）</label>
        <input id="w-in" inputMode="decimal" className={cx(inputCls, 'num flex-1')} placeholder="今日の体重 kg" value={w} onChange={(e) => setW(e.target.value)} />
        <Button type="submit" variant="tinted">{todayLog?.weight ? '更新' : '記録'}</Button>
      </form>
      {todayLog?.weight && <p className="mt-2 text-[13px] text-ink-2">今日 {todayLog.weight}kg を記録済み</p>}
    </section>
  )
}
