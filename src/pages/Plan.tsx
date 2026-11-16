import { Reorder, useDragControls } from 'motion/react'
import { AlertTriangle, ArrowDown, ArrowUp, BookOpen, Check, ChefHat, GripVertical, RefreshCw, Search, ShoppingCart, Snowflake, Sparkles } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Page } from '../components/layout/Page'
import { Button } from '../components/ui/Button'
import { Empty, inputCls, Skeleton, Tag } from '../components/ui/bits'
import { Segmented } from '../components/ui/Segmented'
import { Sheet } from '../components/ui/Sheet'
import { toast } from '../components/ui/Toast'
import { recipeCost, recipeNutrition, recipeTimes } from '../engine/nutrition'
import { batchInputs } from '../engine/planMath'
import { diffDays, fmtMD, today, weekday } from '../lib/date'
import { cx, yen } from '../lib/format'
import { ai } from '../services/ai'
import { planColors } from '../lib/colors'
import { usePlanDerived } from '../store/derived'
import { PlanEdit } from '../features/plan/PlanEdit'
import { useStore } from '../store/useStore'
import type { DayPlan, Recipe } from '../types'

export default function Plan() {
  const plan = useStore((s) => s.plan)
  const propose = useStore((s) => s.proposePlan)
  const confirm = useStore((s) => s.confirmPlan)
  const reopen = useStore((s) => s.reopenPlan)
  const reorder = useStore((s) => s.reorderDays)
  const budget = useStore((s) => s.profile.weeklyGroceryBudget)
  const recipes = useStore((s) => s.recipes)
  const derived = usePlanDerived()
  const nav = useNavigate()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>()
  const [picker, setPicker] = useState<{ day: number; slot: 'main' | 'side' } | null>(null)
  const [order, setOrder] = useState<number[]>(() => plan?.days.map((_, i) => i) ?? [])
  useEffect(() => setOrder(plan?.days.map((_, i) => i) ?? []), [plan])

  const run = async () => {
    if (plan?.status === 'confirmed' && plan.generatedBy === 'manual' && !window.confirm('確定済みの献立を新しい提案で置き換えます。よろしいですか？')) return
    setLoading(true)
    setError(undefined)
    const r = await propose()
    setLoading(false)
    if (!r.ok) setError(r.message)
    else toast('新しい献立を提案しました。確定前に自由に編集できます')
  }
  const onConfirm = () => {
    confirm()
    toast('献立を確定しました。買い物リストと調理プランを作成しました')
  }

  const storeInfo = useMemo(() => {
    if (!plan) return null
    const b = batchInputs(plan, recipes)
    return { servings: b.reduce((a, x) => a + x.servings, 0), freeze: b.reduce((a, x) => a + (x.freeze ?? 0), 0), dishes: b.length }
  }, [plan, recipes])

  return (
    <Page
      title="週間献立"
      subtitle={plan ? <span>{fmtMD(plan.days[0].date)}（{weekday(plan.days[0].date)}）〜 {fmtMD(plan.days[6].date)}（{weekday(plan.days[6].date)}）<span className="ml-2">{plan.status === 'confirmed' ? <Tag tone="basil"><Check size={12} />確定済み</Tag> : <Tag tone="amber">下書き</Tag>}</span></span> : '7日分の夕食'}
      actions={<Link to="/recipes" className="press flex h-10 items-center gap-1.5 rounded-full bg-surface px-3.5 text-[14px] font-semibold text-ink shadow-card"><BookOpen size={16} aria-hidden />レシピ図鑑</Link>}
    >
      {/* AI 提案 */}
      <section className="surface mb-5 p-5" aria-labelledby="ai-h">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="ai-h" className="flex items-center gap-2 text-[17px] font-bold"><Sparkles size={18} className="text-basil" aria-hidden />AI提案</h2>
            <p className="mt-0.5 text-[13px] text-ink-3">{ai.label}：在庫・予算・冷凍適性・食材の共通利用から組み立てます</p>
          </div>
          <Button onClick={run} disabled={loading} icon={<RefreshCw size={16} className={loading ? 'animate-spin motion-reduce:animate-none' : ''} />}>{plan ? '再生成' : '提案する'}</Button>
        </div>
        {loading ? (
          <div className="mt-4 space-y-2" aria-busy="true" aria-label="提案を作成中">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ) : error ? (
          <p className="mt-3 flex items-center gap-2 rounded-xl bg-raw-soft px-3 py-2 text-[14px] text-raw" role="alert"><AlertTriangle size={16} />{error}。もう一度お試しください。</p>
        ) : plan?.rationale.length ? (
          <ul className="mt-3 space-y-1.5 text-[14px] leading-relaxed text-ink-2">
            {plan.rationale.map((r) => <li key={r} className="flex gap-2"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-ink-3" aria-hidden />{r}</li>)}
          </ul>
        ) : null}
      </section>

      {!plan && !loading && <section className="surface"><Empty icon={<Sparkles size={26} />} title="まだ献立がありません" body="「提案する」を押すと、作れる料理を中心に7日分の夕食を組み立てます。" /></section>}

      {plan && derived && (
        <>
          <PlanEdit />
          {/* 試算 */}
          <div className="mb-5 grid grid-cols-3 gap-2 sm:gap-3">
            <Stat label="推定食費" value={yen(derived.cost)} sub={`予算 ${yen(budget)}`} warn={derived.cost > budget} />
            <Stat label="作り置き" value={`${storeInfo?.dishes ?? 0}品 ${storeInfo?.servings ?? 0}食`} sub={`うち冷凍 ${storeInfo?.freeze ?? 0}食`} />
            <Stat label="一括調理" value={plan.cookedSessionId ? '完了' : `約${derived.cook.totalMin}分`} sub={plan.cookedSessionId ? '調理済み' : `手作業 ${derived.cook.handsMin}分`} />
          </div>
          {derived.issues.length > 0 && (
            <div className="mb-5 rounded-[14px] bg-amber-soft px-4 py-3 text-[14px] text-amber" role="status">
              {derived.issues.map((i) => <p key={i} className="flex gap-2 py-0.5"><AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />{i}</p>)}
            </div>
          )}

          {loading ? (
            <div className="space-y-2">{Array.from({ length: 7 }, (_, i) => <Skeleton key={i} className="h-[92px] w-full rounded-[18px]" />)}</div>
          ) : (
            <Reorder.Group axis="y" values={order} onReorder={setOrder} className="space-y-2" as="ol" aria-label="7日分の夕食">
              {order.map((src, pos) => (
                <DayRow key={src} src={src} pos={pos} day={{ ...plan.days[pos], dinner: plan.days[src].dinner }} onPick={(slot) => setPicker({ day: pos, slot })} onCommit={() => reorder(order)} order={order} />
              ))}
            </Reorder.Group>
          )}
          <p className="mt-2 px-1 text-[12px] text-ink-3">右端のハンドルをドラッグすると、料理ごと別の曜日へ移動できます。</p>

          <div className="sticky bottom-[calc(72px+env(safe-area-inset-bottom))] z-20 mt-5 lg:bottom-4">
            <div className="glass flex flex-wrap items-center gap-2 rounded-[18px] border border-line p-2 shadow-lift">
              {plan.status === 'draft' ? (
                <>
                  <p className="min-w-0 flex-1 px-2 text-[13px] text-ink-2">確定すると買い物リストと一括調理の工程を作ります</p>
                  <Button onClick={onConfirm} icon={<Check size={17} />} disabled={plan.days.some((d) => !d.dinner.main && !d.dinner.skip)}>献立を確定</Button>
                </>
              ) : (
                <>
                  <Button variant="tinted" className="flex-1" icon={<ShoppingCart size={17} />} onClick={() => nav('/pantry?tab=shopping')}>買い物リスト</Button>
                  <Button className="flex-1" icon={<ChefHat size={17} />} onClick={() => nav('/cook')}>一括調理へ</Button>
                  {!plan.cookedSessionId && <Button variant="ghost" size="sm" onClick={() => { reopen(); toast('下書きに戻しました', 'info') }}>下書きに戻す</Button>}
                </>
              )}
            </div>
          </div>
        </>
      )}

      <RecipePicker
        open={!!picker}
        slot={picker?.slot ?? 'main'}
        dayIndex={picker?.day ?? 0}
        onClose={() => setPicker(null)}
      />
    </Page>
  )
}

function Stat({ label, value, sub, warn }: { label: string; value: string; sub: string; warn?: boolean }) {
  return (
    <div className="surface px-3 py-3 sm:px-4">
      <p className="text-[12px] font-semibold text-ink-3">{label}</p>
      <p className={cx('num mt-0.5 truncate text-[17px] font-bold sm:text-[20px]', warn && 'text-raw')}>{value}</p>
      <p className="truncate text-[12px] text-ink-3">{sub}</p>
    </div>
  )
}

function DayRow({ src, pos, day, onPick, onCommit, order }: { src: number; pos: number; day: DayPlan; onPick: (slot: 'main' | 'side') => void; onCommit: () => void; order: number[] }) {
  const controls = useDragControls()
  const recipes = useStore((s) => s.recipes)
  const plan = useStore((s) => s.plan)!
  const setMode = useStore((s) => s.setMode)
  const reorder = useStore((s) => s.reorderDays)
  const applyEdit = useStore((s) => s.applyPlanEdit)
  const main = day.dinner.main ? recipes[day.dinner.main] : undefined
  const side = day.dinner.side ? recipes[day.dinner.side] : undefined
  const colors = planColors(plan)
  const n = [main, side].filter(Boolean).map((r) => recipeNutrition(r!))
  const protein = n.reduce((a, x) => a + x.protein, 0)
  const kcal = n.reduce((a, x) => a + x.kcal, 0)
  const isToday = day.date === today()
  const offset = diffDays(day.date, plan.weekStart)
  const frozen = day.dinner.mode === 'batch' && main && main.freeze !== 'ng' && offset > main.fridgeDays
  const swap = (dir: -1 | 1) => {
    const o = [...order]
    const j = pos + dir
    if (j < 0 || j > 6) return
    ;[o[pos], o[j]] = [o[j], o[pos]]
    reorder(o)
  }
  return (
    <Reorder.Item value={src} dragListener={false} dragControls={controls} onDragEnd={onCommit} as="li" className="surface relative flex items-stretch overflow-hidden" whileDrag={{ scale: 1.02, boxShadow: '0 12px 32px rgb(16 24 16 / 0.16)', zIndex: 5 }}>
      <div className={cx('flex w-[58px] shrink-0 flex-col items-center justify-center border-r border-line', isToday ? 'bg-basil text-white' : day.date < today() ? 'bg-sunken/60 text-ink-3' : 'bg-[#fafbf9]')}>
        <span className="text-[20px] leading-none font-bold">{weekday(day.date)}</span>
        <span className={cx('num mt-1 text-[12px]', isToday ? 'text-white/85' : 'text-ink-3')}>{fmtMD(day.date)}</span>
      </div>
      {day.dinner.skip ? (
        <div className="flex min-w-0 flex-1 items-center gap-3 py-3 pr-2 pl-3">
          <div className="min-w-0 flex-1">
            <p className="text-[16px] font-semibold text-ink-3">夕食なし</p>
            <p className="text-[13px] text-ink-3">{day.dinner.note ?? '不要'}{day.dinner.prev?.main ? `（元：${recipes[day.dinner.prev.main]?.name ?? ''}）` : ''}</p>
          </div>
          <Button size="sm" variant="secondary" onClick={() => { const ch = applyEdit([{ op: 'unskip', days: [pos] }]); if (ch.length) toast(`${weekday(day.date)}曜の夕食を戻しました`, 'ok') }}>戻す</Button>
        </div>
      ) : (
      <div className="min-w-0 flex-1 py-2.5 pr-1 pl-3">
        <button onClick={() => onPick('main')} className="press -ml-1.5 flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left hover:bg-sunken cursor-pointer">
          {main && <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: colors[main.id] ?? main.color }} aria-hidden />}
          <span className={cx('min-w-0 truncate text-[16px] font-semibold', !main && 'text-ink-3')}>{main?.name ?? '主菜を選ぶ'}</span>
          {main && !main.canMake && <Tag tone="sky">新しい料理</Tag>}
        </button>
        <button onClick={() => onPick('side')} className="press -ml-1.5 flex w-full items-center gap-2 rounded-lg px-1.5 py-0.5 text-left hover:bg-sunken cursor-pointer">
          <span className={cx('min-w-0 truncate text-[14px]', side ? 'text-ink-2' : 'text-ink-3')}>{side ? `＋ ${side.name}` : '＋ 副菜を選ぶ'}</span>
        </button>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 pl-0">
          <button
            onClick={() => setMode(pos, day.dinner.mode === 'batch' ? 'fresh' : 'batch')}
            className={cx('press inline-flex h-7 items-center rounded-full px-2.5 text-[12px] font-semibold cursor-pointer', day.dinner.mode === 'batch' ? 'bg-basil-soft text-basil-ink' : 'bg-amber-soft text-amber')}
            aria-label={`調理方法：${day.dinner.mode === 'batch' ? '作り置き' : '当日調理'}（タップで切り替え）`}
          >
            {day.dinner.mode === 'batch' ? (offset === 0 ? '作り置き日に作りたて' : '作り置き') : '当日調理'}
          </button>
          {frozen && <Tag tone="sky"><Snowflake size={11} />冷凍分</Tag>}
          {main && <span className="num text-[12px] text-ink-3">{Math.round(kcal)}kcal・P{Math.round(protein)}g</span>}
        </div>
      </div>
      )}
      <div className="flex shrink-0 flex-col items-center justify-center pr-1">
        <button className="press flex h-9 w-9 items-center justify-center rounded-full text-ink-3 hover:bg-sunken disabled:opacity-20 cursor-pointer" aria-label={`${weekday(day.date)}曜の料理を前日と入れ替え`} disabled={pos === 0} onClick={() => swap(-1)}><ArrowUp size={16} /></button>
        <span className="flex h-9 w-9 cursor-grab touch-none items-center justify-center rounded-full text-ink-3 hover:bg-sunken active:cursor-grabbing" onPointerDown={(e) => controls.start(e)} aria-hidden title="ドラッグで移動"><GripVertical size={18} /></span>
        <button className="press flex h-9 w-9 items-center justify-center rounded-full text-ink-3 hover:bg-sunken disabled:opacity-20 cursor-pointer" aria-label={`${weekday(day.date)}曜の料理を翌日と入れ替え`} disabled={pos === 6} onClick={() => swap(1)}><ArrowDown size={16} /></button>
      </div>
    </Reorder.Item>
  )
}

type Filter = 'all' | 'canMake' | 'liked' | 'new'

function RecipePicker({ open, slot, dayIndex, onClose }: { open: boolean; slot: 'main' | 'side'; dayIndex: number; onClose: () => void }) {
  const recipes = useStore((s) => s.recipes)
  const plan = useStore((s) => s.plan)
  const setDish = useStore((s) => s.setDish)
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('canMake')
  const current = plan?.days[dayIndex]?.dinner[slot]
  const roles = slot === 'main' ? ['main', 'one-dish'] : ['side', 'soup']
  const list = Object.values(recipes)
    .filter((r) => roles.includes(r.role))
    .filter((r) => (filter === 'all' ? true : filter === 'canMake' ? r.canMake : filter === 'liked' ? r.liked || r.starred : r.isNew))
    .filter((r) => !q || r.name.includes(q))
    .sort((a, b) => Number(b.starred) - Number(a.starred) || a.name.localeCompare(b.name, 'ja'))
  const pick = (r?: Recipe) => {
    setDish(dayIndex, slot, r?.id)
    toast(r ? `${weekday(plan!.days[dayIndex].date)}曜を「${r.name}」に変更。食材・食費・工程を再計算しました` : '副菜をなしにしました', 'ok')
    onClose()
  }
  return (
    <Sheet open={open} onClose={onClose} title={`${plan ? weekday(plan.days[dayIndex]?.date ?? plan.weekStart) : ''}曜の${slot === 'main' ? '主菜' : '副菜'}を選ぶ`}>
      <div className="sticky top-0 z-10 -mx-5 bg-surface px-5 pb-3">
        <div className="relative mb-2">
          <Search size={17} className="absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" aria-hidden />
          <input className={cx(inputCls, 'pl-9')} placeholder="料理名で探す" value={q} onChange={(e) => setQ(e.target.value)} aria-label="料理名で探す" />
        </div>
        <Segmented label="絞り込み" value={filter} onChange={setFilter} options={[{ value: 'canMake', label: '作れる' }, { value: 'liked', label: '好き' }, { value: 'new', label: '新しい' }, { value: 'all', label: 'すべて' }]} />
      </div>
      <ul className="divide-y divide-line">
        {slot === 'side' && (
          <li><button className="press flex min-h-[52px] w-full items-center px-1 text-left text-[15px] text-ink-2 cursor-pointer" onClick={() => pick(undefined)}>副菜なし</button></li>
        )}
        {list.map((r) => {
          const n = recipeNutrition(r)
          return (
            <li key={r.id}>
              <button className={cx('press flex w-full items-center gap-3 px-1 py-3 text-left cursor-pointer', r.id === current && 'bg-basil-soft/50')} onClick={() => pick(r)}>
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: r.color }} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 text-[16px] font-semibold">{r.name}{r.id === current && <Check size={16} className="text-basil" aria-label="選択中" />}</span>
                  <span className="num block text-[13px] text-ink-3">約{recipeTimes(r).total}分・{yen(recipeCost(r))}/食・P{Math.round(n.protein)}g・{r.freeze === 'good' ? '冷凍向き' : r.freeze === 'ok' ? '冷凍可' : '冷凍不可'}</span>
                </span>
                {!r.canMake && <Tag tone="sky">新しい</Tag>}
              </button>
            </li>
          )
        })}
        {!list.length && <li className="py-8 text-center text-[14px] text-ink-3">該当する料理がありません。絞り込みを変えるか、レシピ図鑑で追加できます。</li>}
      </ul>
    </Sheet>
  )
}
