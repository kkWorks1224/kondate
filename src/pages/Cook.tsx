import { AnimatePresence, motion } from 'motion/react'
import { AlertTriangle, Check, CheckCircle2, ChefHat, Clock, Flame, Hand, Info, ListChecks, Pause, Play, RotateCcw, ShieldAlert, ShoppingCart, SkipForward, Snowflake, Thermometer, Timer as TimerIcon } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Page } from '../components/layout/Page'
import { Button } from '../components/ui/Button'
import { Empty, Tag } from '../components/ui/bits'
import { Segmented } from '../components/ui/Segmented'
import { toast } from '../components/ui/Toast'
import { INGREDIENT_MAP } from '../data/ingredients'
import { Timeline } from '../features/cook/Timeline'
import { stockOf } from '../engine/planMath'
import { cx, qty } from '../lib/format'
import { usePlanDerived } from '../store/derived'
import { useStore } from '../store/useStore'
import type { CookPlanResult, CookTask, CookWarning, Recipe } from '../types'
import { KIND_LABEL } from './RecipeDetail'
import { planColors, withColors } from '../lib/colors'

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [active])
  return now
}
const mmss = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export default function Cook() {
  const plan = useStore((s) => s.plan)
  const session = useStore((s) => s.session)
  const rawRecipes = useStore((s) => s.recipes)
  const recipes = useMemo(() => withColors(rawRecipes, planColors(plan)), [rawRecipes, plan])
  const derived = usePlanDerived()
  const nav = useNavigate()

  if (!plan || plan.status !== 'confirmed') {
    return (
      <Page title="一括調理ナビ">
        <section className="surface">
          <Empty icon={<ChefHat size={26} />} title="確定した献立がありません" body="週間献立を確定すると、複数の料理の工程をまとめた一括調理プランを作ります。" action={<Button onClick={() => nav('/plan')}>週間献立へ</Button>} />
        </section>
      </Page>
    )
  }
  if (session && session.planId === plan.id && session.status === 'done') return <Done />
  if (plan.cookedSessionId) return <Done />
  if (session && session.planId === plan.id && session.status !== 'ready') return <Navigator recipes={recipes} />
  if (!derived) return null
  return <Preview result={derived.cook} recipes={recipes} />
}

/* ---------- 開始前：計画のプレビュー ---------- */
function Preview({ result, recipes }: { result: CookPlanResult; recipes: Record<string, Recipe> }) {
  const prepare = useStore((s) => s.prepareSession)
  const start = useStore((s) => s.startSession)
  const inventory = useStore((s) => s.inventory)
  const nav = useNavigate()
  const shortages = useMemo(() => {
    const need = new Map<string, number>()
    for (const { recipeId, servings } of result.servings) for (const i of recipes[recipeId]?.ingredients ?? []) {
      if (INGREDIENT_MAP[i.ingredientId]?.staple) continue
      need.set(i.ingredientId, (need.get(i.ingredientId) ?? 0) + i.amount * servings)
    }
    return [...need.entries()].map(([id, n]) => ({ id, short: n - stockOf(inventory, id) })).filter((x) => x.short > 0.01)
  }, [result, recipes, inventory])

  const begin = () => {
    const r = prepare()
    if (!r.ok) return toast(r.message, 'error')
    start()
    window.scrollTo({ top: 0 })
  }
  if (!result.tasks.length) {
    return <Page title="一括調理ナビ"><section className="surface"><Empty icon={<ChefHat size={26} />} title="まとめて作る料理がありません" body="献立の料理がすべて「当日調理」になっています。作り置きにしたい日を切り替えてください。" action={<Button onClick={() => nav('/plan')}>週間献立へ</Button>} /></section></Page>
  }
  const saved = result.naiveMin - result.totalMin
  return (
    <Page title="一括調理ナビ" subtitle={`${result.servings.length}品・${result.servings.reduce((a, s) => a + s.servings, 0)}食をまとめて作る`} wide>
      <section className="surface mb-5 p-5">
            <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
              <div>
                <p className="text-[13px] font-semibold text-ink-3">全体の所要時間</p>
                <p className="num text-[40px] leading-none font-bold tracking-tight">{result.totalMin}<span className="ml-1 text-[17px] font-semibold text-ink-2">分</span></p>
              </div>
              <div>
                <p className="text-[13px] font-semibold text-ink-3">手を動かす時間</p>
                <p className="num text-[22px] font-bold">{result.handsMin}分</p>
              </div>
              <div>
                <p className="text-[13px] font-semibold text-ink-3">1品ずつ作る場合</p>
                <p className="num text-[22px] font-bold text-ink-2">{result.naiveMin}分{saved > 0 && <span className="ml-1.5 text-[14px] text-basil">−{saved}分</span>}</p>
              </div>
            </div>
            <div className="mt-5"><Timeline result={result} recipes={recipes} /></div>
            <p className="mt-3 text-[12px] leading-relaxed text-ink-3">色は料理、灰色はまとめた下処理、赤は衛生のための洗浄。煮込みやレンジ加熱の待ち時間に、別の工程を割り当てています。</p>
          </section>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-x-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0">
          <Warnings items={result.warnings} />
        </div>

        <aside>
          <section className="surface mb-5 p-5">
            <h2 className="mb-3 text-[15px] font-semibold text-ink-2">作る料理と保存</h2>
            <ul className="space-y-2.5">
              {result.servings.map((s) => {
                const r = recipes[s.recipeId]
                const pack = result.tasks.find((t) => t.id === `${s.recipeId}:pack`)
                const freeze = pack?.title.match(/冷凍(\d+)/)?.[1]
                return (
                  <li key={s.recipeId} className="flex items-center gap-3">
                    <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: r?.color }} aria-hidden />
                    <span className="min-w-0 flex-1 truncate text-[15px] font-medium">{r?.name}</span>
                    <span className="num text-[14px] text-ink-2">{s.servings}食</span>
                    {freeze && Number(freeze) > 0 && <Tag tone="sky"><Snowflake size={11} />{freeze}</Tag>}
                  </li>
                )
              })}
            </ul>
          </section>
          {shortages.length > 0 && (
            <section className="mb-5 rounded-[18px] bg-amber-soft p-4 text-amber" role="status">
              <p className="flex items-center gap-2 text-[15px] font-semibold"><AlertTriangle size={17} aria-hidden />在庫が足りない食材があります</p>
              <ul className="mt-2 space-y-0.5 text-[14px]">
                {shortages.slice(0, 6).map((s) => <li key={s.id}>{INGREDIENT_MAP[s.id]?.name}：あと{qty(s.short, INGREDIENT_MAP[s.id]?.unit ?? 'g')}</li>)}
              </ul>
              <Button variant="secondary" size="sm" className="mt-3" icon={<ShoppingCart size={15} />} onClick={() => nav('/pantry?tab=shopping')}>買い物リストを開く</Button>
              <p className="mt-2 text-[12px]">このまま始めることもできます。完了時、足りなかった分は記録に残ります。</p>
            </section>
          )}
          <div className="sticky bottom-[calc(72px+env(safe-area-inset-bottom))] z-20 lg:static">
            <Button size="lg" className="w-full shadow-lift lg:shadow-none" icon={<Play size={18} />} onClick={begin}>調理を始める</Button>
          </div>
        </aside>
      </div>
    </Page>
  )
}

function Warnings({ items }: { items: CookWarning[] }) {
  if (!items.length) return null
  return (
    <section className="mb-5">
      <h2 className="mb-2 px-1 text-[17px] font-bold">最適化の内容</h2>
      <ul className="surface divide-y divide-line">
        {items.map((w, i) => (
          <li key={i} className="flex gap-3 px-4 py-3 text-[14px] leading-relaxed">
            {w.level === 'error' ? <AlertTriangle size={17} className="mt-0.5 shrink-0 text-raw" aria-label="エラー" /> : w.level === 'warn' ? <AlertTriangle size={17} className="mt-0.5 shrink-0 text-amber" aria-label="注意" /> : <Info size={17} className="mt-0.5 shrink-0 text-sky" aria-label="情報" />}
            <span>{w.message}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

/* ---------- 調理中のナビゲーション ---------- */
function Navigator({ recipes }: { recipes: Record<string, Recipe> }) {
  const session = useStore((s) => s.session)!
  const tools = useStore((s) => s.tools)
  const setTask = useStore((s) => s.setTask)
  const startTimer = useStore((s) => s.startTimer)
  const pause = useStore((s) => s.pauseSession)
  const resume = useStore((s) => s.resumeSession)
  const finish = useStore((s) => s.finishSession)
  const discard = useStore((s) => s.discardSession)
  const [view, setView] = useState<'nav' | 'timeline' | 'list'>('nav')
  const [focus, setFocus] = useState<string>()
  const paused = session.status === 'paused'
  const now = useNow(!paused)
  const { tasks } = session.result
  const prog = session.progress
  const timers = session.timers
  const running = tasks.filter((t) => !prog[t.id] && timers[t.id])
  const todo = tasks.filter((t) => !prog[t.id] && !timers[t.id])
  const current = (focus && tasks.find((t) => t.id === focus && !prog[t.id] && !timers[t.id])) || todo[0]
  const next = todo.filter((t) => t.id !== current?.id)[0]
  const doneCount = tasks.filter((t) => prog[t.id]).length
  const allDone = doneCount === tasks.length
  const blockers = current ? current.dependsOn.filter((d) => !prog[d]).map((d) => tasks.find((t) => t.id === d)!).filter(Boolean) : []
  const beeped = useRef(new Set<string>())

  // タイマー終了の通知（音とバイブ）
  useEffect(() => {
    for (const t of running) {
      const end = timers[t.id]?.endsAt
      if (end && end <= now && !beeped.current.has(t.id)) {
        beeped.current.add(t.id)
        beep()
        navigator.vibrate?.([200, 100, 200])
        toast(`「${t.title}」の時間です`, 'info')
      }
    }
  }, [now, running, timers])

  const complete = (t: CookTask) => {
    setTask(t.id, 'done')
    setFocus(undefined)
  }
  const onFinish = () => {
    const r = finish()
    toast(r.message ?? '', r.ok ? 'ok' : 'error')
  }
  const toolName = (id: string) => tools.find((x) => x.id === id)?.name ?? id

  return (
    <Page title="一括調理ナビ" subtitle={paused ? '中断中' : `工程 ${Math.min(doneCount + 1, tasks.length)} / ${tasks.length}`} wide
      actions={paused ? <Button size="sm" icon={<Play size={15} />} onClick={resume}>再開</Button> : <Button size="sm" variant="secondary" icon={<Pause size={15} />} onClick={pause}>中断</Button>}
    >
      <div className="mb-4 h-2 overflow-hidden rounded-full bg-sunken" role="progressbar" aria-valuenow={doneCount} aria-valuemin={0} aria-valuemax={tasks.length} aria-label="進捗">
        <motion.div className="h-full rounded-full bg-basil" animate={{ width: `${(doneCount / tasks.length) * 100}%` }} transition={{ duration: 0.3 }} />
      </div>

      {running.length > 0 && (
        <div className="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0" aria-label="進行中のタイマー">
          {running.map((t) => {
            const tm = timers[t.id]
            const left = paused ? tm.remainingMs ?? 0 : (tm.endsAt ?? now) - now
            const over = left <= 0
            return (
              <div key={t.id} className={cx('flex shrink-0 items-center gap-2 rounded-[14px] py-2 pr-2 pl-3', over ? 'bg-amber text-white' : 'bg-sky-soft text-sky')}>
                <TimerIcon size={16} aria-hidden />
                <span className="max-w-[160px] truncate text-[13px] font-semibold">{t.title}</span>
                <span className="num text-[15px] font-bold" aria-live="off">{over ? '完了' : mmss(left)}</span>
                <button onClick={() => complete(t)} className={cx('press h-8 rounded-[10px] px-2.5 text-[13px] font-bold cursor-pointer', over ? 'bg-white text-amber' : 'bg-white/80 text-sky')}>済</button>
              </div>
            )
          })}
        </div>
      )}

      <Segmented className="mb-4 lg:max-w-md" label="表示" value={view} onChange={setView} options={[{ value: 'nav', label: 'ナビ' }, { value: 'timeline', label: 'タイムライン' }, { value: 'list', label: '全工程', count: tasks.length }]} />

      {view === 'nav' && (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div>
            <AnimatePresence mode="wait" initial={false}>
              {allDone ? (
                <motion.section key="all" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="surface p-6 text-center">
                  <CheckCircle2 size={40} className="mx-auto text-basil" aria-hidden />
                  <p className="mt-3 text-[20px] font-bold">すべての工程が終わりました</p>
                  <p className="mt-1 text-[14px] text-ink-2">完了すると、使った食材を在庫から減らし、作り置きを登録します。</p>
                  <Button size="lg" className="mt-5" icon={<Check size={18} />} onClick={onFinish}>調理を完了して在庫を更新</Button>
                </motion.section>
              ) : current ? (
                <motion.section key={current.id} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0, transition: { duration: 0.22, ease: [0.23, 1, 0.32, 1] } }} exit={{ opacity: 0, x: -16, transition: { duration: 0.14 } }} className={cx('surface overflow-hidden', current.kind === 'raw' && 'ring-2 ring-raw/30', current.kind === 'clean' && 'ring-2 ring-raw/30')} aria-live="polite">
                  <StepCard task={current} recipes={recipes} toolName={toolName} />
                  {blockers.length > 0 && (
                    <div className="mx-5 mb-4 rounded-xl bg-sky-soft px-3 py-2.5 text-[14px] text-sky">
                      <p className="font-semibold">先に終わらせる工程があります</p>
                      {blockers.map((b) => <p key={b.id} className="mt-0.5">・{b.title}{timers[b.id]?.endsAt ? `（残り ${mmss(timers[b.id].endsAt! - now)}）` : ''}</p>)}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2 border-t border-line bg-[#fafbf9] p-4">
                    {!current.attended ? (
                      <Button size="lg" className="flex-1" icon={<TimerIcon size={18} />} disabled={paused} onClick={() => { startTimer(current.id); setFocus(undefined) }}>開始してタイマー（{current.durationMin}分）</Button>
                    ) : (
                      <Button size="lg" className="flex-1" icon={<Check size={18} />} disabled={paused} onClick={() => complete(current)}>完了</Button>
                    )}
                    {current.attended && current.durationMin >= 2 && <Button size="lg" variant="secondary" icon={<TimerIcon size={17} />} disabled={paused} onClick={() => startTimer(current.id)} aria-label="この工程のタイマーを開始">タイマー</Button>}
                    <Button size="lg" variant="ghost" icon={<SkipForward size={17} />} disabled={paused} onClick={() => { setTask(current.id, 'skipped'); toast('工程をスキップしました', 'info', { label: '戻す', run: () => setTask(current.id, 'todo') }) }}>スキップ</Button>
                  </div>
                </motion.section>
              ) : (
                <section className="surface p-6 text-center">
                  <Clock size={32} className="mx-auto text-sky" aria-hidden />
                  <p className="mt-2 text-[17px] font-bold">加熱・冷却の完了待ちです</p>
                  <p className="mt-1 text-[14px] text-ink-2">タイマーが終わったら「済」を押してください。</p>
                </section>
              )}
            </AnimatePresence>
            {paused && <p className="mt-3 rounded-xl bg-amber-soft px-3 py-2 text-[14px] text-amber">中断中です。タイマーも止まっています。「再開」で続きから進められます。</p>}
          </div>
          <aside>
            {next && (
              <section className="surface mb-4 p-4">
                <p className="text-[13px] font-semibold text-ink-3">次の工程</p>
                <button className="press mt-1 block w-full text-left cursor-pointer" onClick={() => setFocus(next.id)}>
                  <p className="text-[16px] font-semibold">{next.title}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[13px] text-ink-2"><RecipeDots ids={next.recipeIds} recipes={recipes} /> 約{next.durationMin}分{!next.attended && '・放置可'}</p>
                </button>
              </section>
            )}
            <section className="surface p-4">
              <p className="mb-2 text-[13px] font-semibold text-ink-3">料理ごとの進み具合</p>
              <ul className="space-y-2">
                {session.result.servings.map((s) => {
                  const mine = tasks.filter((t) => t.recipeIds.includes(s.recipeId))
                  const d = mine.filter((t) => prog[t.id]).length
                  return (
                    <li key={s.recipeId} className="text-[14px]">
                      <div className="mb-1 flex justify-between"><span className="font-medium">{recipes[s.recipeId]?.name}</span><span className="num text-ink-3">{d}/{mine.length}</span></div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-sunken"><div className="h-full rounded-full" style={{ width: `${(d / Math.max(1, mine.length)) * 100}%`, background: recipes[s.recipeId]?.color }} /></div>
                    </li>
                  )
                })}
              </ul>
            </section>
            <Button variant="ghost" size="sm" className="mt-3" icon={<RotateCcw size={15} />} onClick={() => { if (window.confirm('調理ナビを最初からやり直します。進捗は消えます（在庫は変わりません）。')) discard() }}>最初からやり直す</Button>
          </aside>
        </div>
      )}

      {view === 'timeline' && (
        <section className="surface p-4">
          <Timeline result={session.result} recipes={recipes} progress={prog} currentId={current?.id} onSelect={(id) => { setFocus(id); setView('nav') }} />
          <p className="mt-3 text-[12px] text-ink-3">ブロックを押すとその工程をナビに表示します。終わった工程は薄く表示されます。</p>
        </section>
      )}

      {view === 'list' && (
        <ol className="surface divide-y divide-line">
          {tasks.map((t, i) => {
            const st = prog[t.id]
            return (
              <li key={t.id} className="flex items-center gap-3 px-4 py-3">
                <button onClick={() => setTask(t.id, st ? 'todo' : 'done')} aria-label={st ? `${t.title}を未完了に戻す` : `${t.title}を完了にする`} className={cx('press flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-1 cursor-pointer', st === 'done' ? 'bg-basil text-white ring-basil' : st === 'skipped' ? 'bg-sunken text-ink-3 ring-line' : 'ring-line-strong text-transparent')}>
                  {st === 'skipped' ? <SkipForward size={14} /> : <Check size={15} />}
                </button>
                <button className="min-w-0 flex-1 text-left cursor-pointer" onClick={() => { if (!st) { setFocus(t.id); setView('nav') } }}>
                  <p className={cx('text-[15px]', st ? 'text-ink-3 line-through' : 'font-medium')}><span className="num mr-1.5 text-ink-3">{i + 1}.</span>{t.title}</p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-[12px] text-ink-3"><RecipeDots ids={t.recipeIds} recipes={recipes} /> {Math.round(t.start)}分〜・{t.durationMin}分{timers[t.id] && !st ? '・タイマー中' : ''}</p>
                </button>
                {t.kind === 'raw' && <ShieldAlert size={16} className="shrink-0 text-raw" aria-label="生肉・生魚" />}
              </li>
            )
          })}
        </ol>
      )}
      <div className="h-6" />
    </Page>
  )
}

function RecipeDots({ ids, recipes }: { ids: string[]; recipes: Record<string, Recipe> }) {
  return <span className="inline-flex -space-x-1" aria-label={ids.map((id) => recipes[id]?.name).join('・')}>{ids.map((id) => <span key={id} className="h-2.5 w-2.5 rounded-full ring-2 ring-white" style={{ background: recipes[id]?.color ?? '#888' }} />)}</span>
}

function StepCard({ task, recipes, toolName }: { task: CookTask; recipes: Record<string, Recipe>; toolName: (id: string) => string }) {
  return (
    <div className="p-5">
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <Tag tone={task.kind === 'raw' || task.kind === 'clean' ? 'raw' : task.kind === 'heat' || task.kind === 'simmer' ? 'amber' : 'neutral'}>{KIND_LABEL[task.kind]}</Tag>
        <Tag><Clock size={11} /><span className="num">約{task.durationMin}分</span></Tag>
        <Tag tone={task.attended ? 'neutral' : 'sky'}>{task.attended ? <><Hand size={11} />手が離せない</> : '放置できる'}</Tag>
        {task.merged && <Tag tone="basil"><ListChecks size={11} />{task.merged}工程をまとめた</Tag>}
      </div>
      <h2 className="text-[24px] leading-snug font-bold tracking-tight">{task.title}</h2>
      {task.detail && <p className="mt-1.5 text-[15px] leading-relaxed text-ink-2">{task.detail}</p>}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {task.recipeIds.map((id) => <span key={id} className="inline-flex h-7 items-center gap-1.5 rounded-full bg-sunken px-2.5 text-[13px] font-semibold"><span className="h-2.5 w-2.5 rounded-full" style={{ background: recipes[id]?.color }} aria-hidden />{recipes[id]?.name ?? id}</span>)}
      </div>
      {(task.ingredients.length > 0 || task.tools.length > 0) && (
        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          {task.ingredients.length > 0 && (
            <div>
              <dt className="mb-1 text-[12px] font-semibold text-ink-3">使う食材</dt>
              <dd className="flex flex-wrap gap-1.5">{task.ingredients.map((i) => <span key={i.ingredientId + (i.cut ?? '')} className="rounded-lg bg-[#f1f3ef] px-2 py-1 text-[13px]">{INGREDIENT_MAP[i.ingredientId]?.name} <span className="num text-ink-2">{qty(i.amount, INGREDIENT_MAP[i.ingredientId]?.unit ?? 'g')}</span></span>)}</dd>
            </div>
          )}
          {task.tools.length > 0 && (
            <div>
              <dt className="mb-1 text-[12px] font-semibold text-ink-3">使う器具</dt>
              <dd className="flex flex-wrap gap-1.5">{[...new Set(task.units?.length ? task.units.map((u) => u) : task.tools)].map((u) => <span key={u} className="rounded-lg bg-[#f1f3ef] px-2 py-1 text-[13px]">{toolName(u.split('#')[0])}{u.includes('#') && Number(u.split('#')[1]) > 1 ? ` ${u.split('#')[1]}` : u.startsWith('stove#') ? ` ${u.split('#')[1]}口目` : ''}</span>)}</dd>
            </div>
          )}
        </dl>
      )}
      {task.heat && <p className="mt-4 flex flex-wrap items-center gap-1.5 text-[14px] font-medium text-amber"><Flame size={16} aria-hidden />{task.heat.method}{task.heat.coreTempC && <span className="inline-flex items-center gap-0.5"><Thermometer size={15} aria-hidden />中心{task.heat.coreTempC}℃で{task.heat.holdMin}分以上</span>}</p>}
      {task.safety && <p className="mt-3 flex items-start gap-2 rounded-xl bg-raw-soft px-3 py-2.5 text-[14px] leading-relaxed text-raw"><ShieldAlert size={17} className="mt-0.5 shrink-0" aria-hidden />{task.safety}</p>}
      {task.reason && <p className="mt-3 flex items-start gap-2 text-[13px] leading-relaxed text-ink-2"><Info size={15} className="mt-0.5 shrink-0 text-sky" aria-hidden />{task.reason}</p>}
    </div>
  )
}

function Done() {
  const history = useStore((s) => s.cookHistory[0])
  const recipes = useStore((s) => s.recipes)
  const prepared = useStore((s) => s.prepared)
  const nav = useNavigate()
  const mine = prepared.filter((p) => p.sessionId === history?.sessionId)
  return (
    <Page title="一括調理ナビ" subtitle="今週の作り置きは完了しています">
      <section className="surface mb-5 p-6 text-center">
        <CheckCircle2 size={44} className="mx-auto text-basil" aria-hidden />
        <p className="mt-3 text-[21px] font-bold">お疲れさまでした</p>
        {history && <p className="mt-1 text-[14px] text-ink-2">{history.recipes.length}品・{history.recipes.reduce((a, r) => a + r.servings, 0)}食を作りました（計画 {history.totalMin}分{history.skipped ? `・スキップ ${history.skipped}工程` : ''}）</p>}
      </section>
      {mine.length > 0 && (
        <section className="mb-5">
          <h2 className="mb-2 px-1 text-[17px] font-bold">登録した作り置き</h2>
          <ul className="surface divide-y divide-line">
            {mine.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-4 py-3">
                {p.location === 'freezer' ? <Snowflake size={17} className="text-sky" aria-label="冷凍" /> : <span className="h-[17px] w-[17px] rounded-full bg-basil-soft" aria-label="冷蔵" />}
                <span className="flex-1 text-[15px] font-medium">{recipes[p.recipeId]?.name}</span>
                <span className="num text-[14px] text-ink-2">残り{p.servings}食</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {history?.shortages.length ? (
        <section className="mb-5 rounded-[18px] bg-amber-soft p-4 text-[14px] text-amber">
          <p className="font-semibold">在庫が足りなかった食材（在庫は0にしています）</p>
          <ul className="mt-1">{history.shortages.map((s) => <li key={s}>・{s}</li>)}</ul>
        </section>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => nav('/pantry?tab=prepared')}>作り置き一覧</Button>
        <Button variant="secondary" onClick={() => nav('/')}>ホームへ</Button>
        <Link to="/pantry" className="press inline-flex h-11 items-center px-3 text-[15px] font-semibold text-basil">在庫を確認</Link>
      </div>
    </Page>
  )
}

let audio: AudioContext | undefined
function beep() {
  try {
    audio = audio ?? new AudioContext()
    const o = audio.createOscillator()
    const g = audio.createGain()
    o.frequency.value = 880
    g.gain.setValueAtTime(0.0001, audio.currentTime)
    g.gain.exponentialRampToValueAtTime(0.25, audio.currentTime + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.5)
    o.connect(g).connect(audio.destination)
    o.start()
    o.stop(audio.currentTime + 0.55)
  } catch {
    /* 音が出せない環境 */
  }
}
