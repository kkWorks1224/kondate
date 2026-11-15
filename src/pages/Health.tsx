import { Dumbbell, Footprints, Moon, Plus, Store as StoreIcon, Trash2, Droplets, Battery } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Page } from '../components/layout/Page'
import { Button, IconButton } from '../components/ui/Button'
import { Field, inputCls, Meter, SampleNote, Tag } from '../components/ui/bits'
import { Segmented } from '../components/ui/Segmented'
import { Sheet } from '../components/ui/Sheet'
import { toast } from '../components/ui/Toast'
import { balanceComment, dayStatus, movingAverage, SLOT_LABEL } from '../engine/health'
import { addDays, fmtMD, today, weekday, weekStartOf } from '../lib/date'
import { cx, r1, yen } from '../lib/format'
import { useDayStatus, useTargets } from '../store/derived'
import { useStore } from '../store/useStore'
import { deleteMealWithUndo } from '../store/useDeleteMeal'
import type { HealthLog } from '../types'

// 検証済みのチャート配色（validate_palette.js：明度・彩度・色覚多様性・コントラスト PASS）
const C = { green: '#1F8A5B', blue: '#3D7CC9', amber: '#B97A0E', grid: 'rgba(28,28,30,0.08)', axis: '#7d817b' }
const axisProps = { tick: { fill: C.axis, fontSize: 11 }, tickLine: false, axisLine: false } as const

export default function Health() {
  const [range, setRange] = useState<'14' | '30'>('14')
  const [form, setForm] = useState(false)
  return (
    <Page title="健康" subtitle="体重・栄養・生活習慣" actions={<Button size="sm" icon={<Plus size={15} />} onClick={() => setForm(true)}>記録</Button>}>
      <TargetNote />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-x-6 lg:grid-cols-2">
        <div>
          <TodayNutrition />
          <WeekNutrition />
          <MealsToday />
        </div>
        <div>
          <Segmented className="mb-3" label="期間" value={range} onChange={setRange} options={[{ value: '14', label: '14日' }, { value: '30', label: '30日' }]} />
          <WeightChart days={Number(range)} />
          <Activity days={Number(range)} />
          <Spend />
        </div>
      </div>
      <HealthForm open={form} onClose={() => setForm(false)} />
    </Page>
  )
}

function TargetNote() {
  const t = useTargets()
  const p = useStore((s) => s.profile)
  return (
    <section className="surface mb-6 p-5">
      <div className="flex flex-wrap gap-x-8 gap-y-3">
        <Fig k="体重" v={`${p.weightKg}kg`} />
        <Fig k="BMI" v={t.bmi.toFixed(1)} />
        <Fig k="体脂肪率（申告）" v={`${p.bodyFatPct}%`} />
        <Fig k="希望体重" v={`${p.goalWeightKg}kg`} muted />
        <Fig k="目標エネルギー" v={`${t.kcal}kcal`} />
        <Fig k="たんぱく質" v={`${t.protein}g`} />
      </div>
      <p className="mt-4 rounded-xl bg-basil-soft px-3 py-2.5 text-[14px] leading-relaxed text-basil-ink">{t.note}</p>
      <p className="mt-2 text-[12px] text-ink-3">推定消費量 {t.tdee}kcal（Mifflin-St Jeor式・座り仕事中心）。体重を記録すると自動で更新します。医療上の判断が必要な場合は専門家に相談してください。</p>
    </section>
  )
}
function Fig({ k, v, muted }: { k: string; v: string; muted?: boolean }) {
  return <div><p className="text-[12px] text-ink-3">{k}</p><p className={cx('num text-[20px] font-bold', muted && 'text-ink-2')}>{v}</p></div>
}

function TodayNutrition() {
  const t = today()
  const status = useDayStatus(t)
  const targets = useTargets()
  const n = status.nutrients
  const comments = balanceComment(status, targets)
  const pfcK = n.protein * 4 + n.fat * 9 + n.carbs * 4
  const pfc = pfcK ? [n.protein * 4 / pfcK, n.fat * 9 / pfcK, n.carbs * 4 / pfcK] : [0, 0, 0]
  return (
    <section className="surface mb-6 p-5">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="text-[17px] font-bold">今日の栄養</h2>
        <Tag tone={status.complete ? 'basil' : 'amber'}>{status.complete ? '3食記録済み' : `未記録：${status.missing.map((m) => SLOT_LABEL[m]).join('・')}`}</Tag>
      </div>
      <p className="num text-[30px] font-bold">{Math.round(n.kcal)}<span className="text-[15px] font-normal text-ink-3"> / {targets.kcal}kcal{status.complete ? '' : '（記録分のみ）'}</span></p>
      <div className="mt-3">
        <p className="mb-1 text-[13px] text-ink-2">PFCバランス（エネルギー比）</p>
        <div className="flex h-3 gap-[2px] overflow-hidden rounded-full bg-sunken" aria-hidden>
          {pfcK > 0 && [C.green, C.amber, C.blue].map((c, i) => <div key={c} style={{ width: `${pfc[i] * 100}%`, background: c }} />)}
        </div>
        <div className="num mt-1.5 flex flex-wrap gap-x-4 text-[12px] text-ink-2">
          <span><i className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: C.green }} />たんぱく質 {Math.round(pfc[0] * 100)}%（目安13–20%）</span>
          <span><i className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: C.amber }} />脂質 {Math.round(pfc[1] * 100)}%（20–30%）</span>
          <span><i className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: C.blue }} />炭水化物 {Math.round(pfc[2] * 100)}%（50–65%）</span>
        </div>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Meter label="たんぱく質" value={n.protein} target={targets.protein} unit="g" />
        <Meter label="野菜・きのこ・海藻" value={n.vegG} target={targets.vegG} unit="g" />
        <Meter label="食物繊維" value={n.fiber} target={targets.fiber} unit="g" />
        <Meter label="糖質（炭水化物−食物繊維）" value={Math.max(0, n.carbs - n.fiber)} target={Math.round(targets.carbs - targets.fiber)} unit="g" tone="sky" />
        <Meter label="食塩相当量" value={n.salt} target={targets.salt} unit="g" mode="limit" tone="amber" />
        <Meter label="カルシウム" value={n.calcium} target={targets.calcium} unit="mg" tone="sky" />
        <Meter label="鉄" value={n.iron} target={targets.iron} unit="mg" tone="sky" />
        <Meter label="ビタミンB1" value={n.vitB1} target={targets.vitB1} unit="mg" tone="sky" />
        <Meter label="ビタミンC" value={n.vitC} target={targets.vitC} unit="mg" tone="sky" />
      </div>
      <ul className="mt-4 space-y-1.5 border-t border-line pt-3 text-[14px]">
        {comments.map((c) => <li key={c.text} className={cx('flex gap-2', c.tone === 'warn' ? 'text-amber' : c.tone === 'ok' ? 'text-basil-ink' : 'text-ink-2')}><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden />{c.text}</li>)}
      </ul>
      <p className="mt-3 text-[12px] leading-relaxed text-ink-3">自炊は材料からの推定値、セブンの昼食はデモ商品の表示値を模した値です。昼食商品はカルシウム等の微量栄養素を持たないため、それらは過小になります。</p>
    </section>
  )
}

function WeekNutrition() {
  const meals = useStore((s) => s.meals)
  const expect = useStore((s) => s.profile.expectBreakfast)
  const targets = useTargets()
  const data = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const d = addDays(today(), i - 6)
    const st = dayStatus(meals, d, expect)
    return { date: d, label: `${fmtMD(d)}`, protein: Math.round(st.nutrients.protein), kcal: Math.round(st.nutrients.kcal), complete: st.complete, missing: st.missing.map((m) => SLOT_LABEL[m]).join('・') }
  }), [meals, expect])
  return (
    <section className="surface mb-6 p-5">
      <h2 className="text-[17px] font-bold">たんぱく質の推移（7日）</h2>
      <p className="mb-3 text-[13px] text-ink-3">点線は目標 {targets.protein}g。薄い棒は未記録の食事がある日（記録分のみ）</p>
      <div className="h-[190px]">
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -18 }}>
            <CartesianGrid vertical={false} stroke={C.grid} />
            <XAxis dataKey="label" {...axisProps} />
            <YAxis {...axisProps} width={44} unit="g" />
            <Tooltip cursor={{ fill: 'rgba(0,0,0,0.04)' }} content={({ active, payload }) => {
              if (!active || !payload?.[0]) return null
              const p = payload[0].payload as (typeof data)[number]
              return <TipBox title={`${fmtMD(p.date)}（${weekday(p.date)}）`} rows={[['たんぱく質', `${p.protein}g`], ['エネルギー', `${p.kcal}kcal`], ['状態', p.complete ? '3食記録済み' : `未記録：${p.missing}`]]} />
            }} />
            <ReferenceLine y={targets.protein} stroke={C.axis} strokeDasharray="4 4" />
            <Bar dataKey="protein" name="たんぱく質" radius={[4, 4, 0, 0]} maxBarSize={28}>
              {data.map((d) => <Cell key={d.date} fill={C.green} fillOpacity={d.complete ? 1 : 0.35} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <TableToggle rows={data.map((d) => [`${fmtMD(d.date)}（${weekday(d.date)}）`, `${d.protein}g`, `${d.kcal}kcal`, d.complete ? '完了' : `未記録：${d.missing}`])} head={['日付', 'たんぱく質', 'エネルギー', '記録']} />
    </section>
  )
}

function WeightChart({ days }: { days: number }) {
  const health = useStore((s) => s.health)
  const goal = useStore((s) => s.profile.goalWeightKg)
  const data = useMemo(() => {
    const avg = movingAverage(health, 'weight')
    const from = addDays(today(), -days + 1)
    return avg.filter((x) => x.date >= from).map((x) => ({ ...x, label: fmtMD(x.date), sample: health.find((h) => h.date === x.date)?.sample }))
  }, [health, days])
  const fat = health.filter((h) => h.bodyFat !== undefined && h.date >= addDays(today(), -days + 1))
  const last = data.at(-1)
  const vals = data.map((d) => d.value)
  const lo = Math.floor(Math.min(...vals, 59) - 0.5)
  const hi = Math.ceil(Math.max(...vals, 61) + 0.3)
  return (
    <section className="surface mb-6 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[17px] font-bold">体重</h2>
        {data.some((d) => d.sample) && <SampleNote>サンプルデータを含む</SampleNote>}
      </div>
      <p className="mt-1"><span className="num text-[28px] font-bold">{last?.avg.toFixed(1) ?? '—'}</span><span className="text-[14px] text-ink-3"> kg（7日平均）</span>{last && <span className="num ml-3 text-[14px] text-ink-2">最新 {last.value}kg</span>}</p>
      <div className="mt-2 h-[200px]">
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
            <CartesianGrid vertical={false} stroke={C.grid} />
            <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={24} />
            <YAxis {...axisProps} width={44} domain={[lo, hi]} tickFormatter={(v) => `${v}`} />
            <Tooltip content={({ active, payload }) => {
              if (!active || !payload?.[0]) return null
              const p = payload[0].payload as (typeof data)[number]
              return <TipBox title={`${fmtMD(p.date)}（${weekday(p.date)}）${p.sample ? '・サンプル' : ''}`} rows={[['体重', `${p.value}kg`], ['7日平均', `${p.avg.toFixed(2)}kg`]]} />
            }} />
            <Legend iconType="plainline" wrapperStyle={{ fontSize: 12, color: C.axis }} />
            <Line type="monotone" dataKey="value" name="日次" stroke={C.blue} strokeWidth={1.5} dot={{ r: 2.5, strokeWidth: 0, fill: C.blue }} activeDot={{ r: 5, stroke: '#fff', strokeWidth: 2 }} isAnimationActive={false} />
            <Line type="monotone" dataKey="avg" name="7日平均" stroke={C.green} strokeWidth={2.5} dot={false} activeDot={{ r: 5, stroke: '#fff', strokeWidth: 2 }} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-[12px] text-ink-3">希望体重 {goal}kg はグラフに目標線として描いていません。急な減量より、7日平均が安定していることを重視します。</p>
      {fat.length > 0 && <p className="num mt-3 border-t border-line pt-3 text-[13px] text-ink-2">体脂肪率：{fat.slice(-5).map((h) => `${fmtMD(h.date)} ${h.bodyFat}%`).join('　')}</p>}
    </section>
  )
}

function Activity({ days }: { days: number }) {
  const health = useStore((s) => s.health)
  const from = addDays(today(), -days + 1)
  const logs = health.filter((h) => h.date >= from).sort((a, b) => a.date.localeCompare(b.date))
  const avg = (k: keyof HealthLog) => { const v = logs.map((l) => l[k]).filter((x): x is number => typeof x === 'number'); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : undefined }
  const workouts = logs.filter((l) => l.workout)
  const data = logs.map((l) => ({ label: fmtMD(l.date), steps: l.steps ?? 0, date: l.date }))
  return (
    <section className="surface mb-6 p-5">
      <h2 className="mb-3 text-[17px] font-bold">生活習慣（{days}日平均）</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Mini icon={<Footprints size={16} />} k="歩数" v={avg('steps') ? `${Math.round(avg('steps')!).toLocaleString()}歩` : '—'} />
        <Mini icon={<Moon size={16} />} k="睡眠" v={avg('sleepH') ? `${r1(avg('sleepH')!)}時間` : '—'} />
        <Mini icon={<Droplets size={16} />} k="水分" v={avg('waterL') ? `${r1(avg('waterL')!)}L` : '—'} />
        <Mini icon={<Battery size={16} />} k="疲労感" v={avg('fatigue') ? `${r1(avg('fatigue')!)} / 5` : '—'} />
      </div>
      <div className="mt-4 h-[140px]">
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -10 }}>
            <CartesianGrid vertical={false} stroke={C.grid} />
            <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={24} />
            <YAxis {...axisProps} width={48} tickFormatter={(v) => `${v / 1000}k`} />
            <Tooltip cursor={{ fill: 'rgba(0,0,0,0.04)' }} content={({ active, payload }) => active && payload?.[0] ? <TipBox title={`${(payload[0].payload as { label: string }).label}`} rows={[['歩数', `${(payload[0].value as number).toLocaleString()}歩`]]} /> : null} />
            <Bar dataKey="steps" name="歩数" fill={C.blue} radius={[3, 3, 0, 0]} maxBarSize={16} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-3 border-t border-line pt-3">
        <p className="mb-1 flex items-center gap-1.5 text-[13px] font-semibold text-ink-2"><Dumbbell size={14} aria-hidden />運動・筋トレ {workouts.length}回</p>
        <ul className="space-y-0.5 text-[13px] text-ink-2">{workouts.slice(-4).reverse().map((w) => <li key={w.date}><span className="num text-ink-3">{fmtMD(w.date)}</span>　{w.workout}</li>)}</ul>
      </div>
    </section>
  )
}
function Mini({ icon, k, v }: { icon: React.ReactNode; k: string; v: string }) {
  return <div className="rounded-xl bg-[#f6f7f4] px-3 py-2.5"><p className="flex items-center gap-1 text-[12px] text-ink-3">{icon}{k}</p><p className="num text-[16px] font-bold">{v}</p></div>
}

function Spend() {
  const expenses = useStore((s) => s.expenses)
  const batchDay = useStore((s) => s.profile.batchDay)
  const budget = useStore((s) => s.profile.weeklyGroceryBudget)
  const data = useMemo(() => Array.from({ length: 4 }, (_, i) => {
    const start = addDays(weekStartOf(today(), batchDay), (i - 3) * 7)
    const end = addDays(start, 6)
    const inW = expenses.filter((e) => e.date >= start && e.date <= end)
    return { label: `${fmtMD(start)}週`, grocery: inW.filter((e) => e.category === 'grocery').reduce((a, e) => a + e.amount, 0), lunch: inW.filter((e) => e.category === 'lunch').reduce((a, e) => a + e.amount, 0) }
  }), [expenses, batchDay])
  return (
    <section className="surface mb-6 p-5">
      <div className="flex items-baseline justify-between">
        <h2 className="text-[17px] font-bold">食費（週ごと）</h2>
        <Link to="/lunch" className="flex items-center gap-1 text-[13px] font-semibold text-basil"><StoreIcon size={14} aria-hidden />昼食</Link>
      </div>
      <p className="mb-2 text-[13px] text-ink-3">自炊と昼食は別予算。点線は自炊予算 {yen(budget)}</p>
      <div className="h-[170px]">
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -6 }} barGap={2}>
            <CartesianGrid vertical={false} stroke={C.grid} />
            <XAxis dataKey="label" {...axisProps} />
            <YAxis {...axisProps} width={50} tickFormatter={(v) => `¥${v / 1000}k`} />
            <Tooltip cursor={{ fill: 'rgba(0,0,0,0.04)' }} content={({ active, payload, label }) => active && payload?.length ? <TipBox title={String(label)} rows={payload.map((p) => [String(p.name), yen(p.value as number)])} /> : null} />
            <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" iconSize={8} />
            <ReferenceLine y={budget} stroke={C.axis} strokeDasharray="4 4" />
            <Bar dataKey="grocery" name="自炊" fill={C.green} radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={false} />
            <Bar dataKey="lunch" name="昼食" fill={C.amber} radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}

function MealsToday() {
  const t = today()
  const all = useStore((s) => s.meals)
  const meals = useMemo(() => all.filter((m) => m.date === t), [all, t])
  return (
    <section className="mb-6">
      <h2 className="mb-2 px-1 text-[17px] font-bold">今日の食事記録</h2>
      <ul className="surface divide-y divide-line">
        {!meals.length && <li className="px-4 py-4 text-[14px] text-ink-2">まだありません。ホームや昼食画面から記録できます。</li>}
        {meals.map((m) => (
          <li key={m.id} className="flex items-center gap-3 px-4 py-3">
            <Tag>{SLOT_LABEL[m.slot]}</Tag>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px]">{m.skipped ? '食べなかった' : m.items.map((i) => i.name).join('・')}</p>
              {!m.skipped && <p className="num text-[12px] text-ink-3">{Math.round(m.nutrients.kcal)}kcal・P{r1(m.nutrients.protein)}g・{m.basis === 'demo-label' ? 'デモ表示値' : '推定値'}{m.price ? `・${yen(m.price)}` : ''}</p>}
            </div>
            <IconButton label="この記録を削除" onClick={() => deleteMealWithUndo(m.id)}><Trash2 size={16} /></IconButton>
          </li>
        ))}
      </ul>
    </section>
  )
}

function HealthForm({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = today()
  const ex = useStore((s) => s.health.find((h) => h.date === t))
  const upsert = useStore((s) => s.upsertHealth)
  const [v, setV] = useState<Record<string, string>>({})
  const val = (k: keyof HealthLog) => v[k] ?? (ex?.[k] !== undefined ? String(ex[k]) : '')
  const num = (k: string) => (v[k] !== undefined && v[k] !== '' ? Number(v[k]) : undefined)
  const save = () => {
    const w = num('weight')
    if (w !== undefined && (w < 30 || w > 200)) return toast('体重は30〜200kgで入力してください', 'error')
    const bf = num('bodyFat')
    if (bf !== undefined && (bf < 2 || bf > 60)) return toast('体脂肪率は2〜60%で入力してください', 'error')
    const log: HealthLog = { date: t }
    for (const k of ['weight', 'bodyFat', 'steps', 'sleepH', 'waterL', 'fatigue'] as const) { const n = num(k); if (n !== undefined) (log as unknown as Record<string, number>)[k] = n }
    if (v.workout !== undefined) log.workout = v.workout || undefined
    upsert(log)
    toast('今日の記録を保存しました')
    setV({})
    onClose()
  }
  const F = (k: keyof HealthLog, label: string, unit: string, step = 'any') => (
    <Field label={`${label}（${unit}）`}><input inputMode="decimal" type="number" step={step} className={cx(inputCls, 'num')} value={val(k)} onChange={(e) => setV({ ...v, [k]: e.target.value })} /></Field>
  )
  return (
    <Sheet open={open} onClose={onClose} title={`${fmtMD(t)}の記録`} footer={<Button className="w-full" onClick={save}>保存</Button>}>
      <div className="grid grid-cols-2 gap-3">
        {F('weight', '体重', 'kg', '0.1')}
        {F('bodyFat', '体脂肪率', '%', '0.1')}
        {F('steps', '歩数', '歩', '1')}
        {F('sleepH', '睡眠', '時間', '0.1')}
        {F('waterL', '水分', 'L', '0.1')}
        <Field label="疲労感（1軽い〜5強い）">
          <select className={inputCls} value={val('fatigue')} onChange={(e) => setV({ ...v, fatigue: e.target.value })}>
            <option value="">未入力</option>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </Field>
        <div className="col-span-2"><Field label="運動・筋トレ"><input className={inputCls} placeholder="例：筋トレ（上半身）40分" value={val('workout')} onChange={(e) => setV({ ...v, workout: e.target.value })} /></Field></div>
      </div>
    </Sheet>
  )
}

function TipBox({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <div className="rounded-xl bg-surface px-3 py-2 text-[12px] shadow-lift ring-1 ring-line">
      <p className="mb-1 font-semibold">{title}</p>
      {rows.map(([k, v]) => <p key={k} className="flex justify-between gap-4"><span className="text-ink-3">{k}</span><span className="num font-semibold">{v}</span></p>)}
    </div>
  )
}

function TableToggle({ head, rows }: { head: string[]; rows: string[][] }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="mt-2">
      <button className="text-[13px] font-semibold text-basil cursor-pointer" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? '表を閉じる' : '表で見る'}</button>
      {open && (
        <table className="mt-2 w-full text-[13px]">
          <thead><tr>{head.map((h) => <th key={h} className="py-1 text-left font-semibold text-ink-3">{h}</th>)}</tr></thead>
          <tbody>{rows.map((r) => <tr key={r[0]} className="border-t border-line">{r.map((c, i) => <td key={i} className="num py-1.5">{c}</td>)}</tr>)}</tbody>
        </table>
      )}
    </div>
  )
}
