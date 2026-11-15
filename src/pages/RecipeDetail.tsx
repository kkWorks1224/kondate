import { AlertTriangle, ChevronDown, ChevronUp, Flame, Hand, Pencil, Plus, ShieldAlert, Star, Thermometer, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Page } from '../components/layout/Page'
import { Button, IconButton } from '../components/ui/Button'
import { Empty, Field, inputCls, Stepper, Tag } from '../components/ui/bits'
import { toast } from '../components/ui/Toast'
import { INGREDIENT_MAP, INGREDIENTS } from '../data/ingredients'
import { recipeCost, recipeNutrition, recipeTimes } from '../engine/nutrition'
import { cx, qty, r1, spoon, yen } from '../lib/format'
import { useStore } from '../store/useStore'
import type { FreezeFit, Recipe, RecipeStep, Role, StepKind } from '../types'

export const KIND_LABEL: Record<StepKind, string> = { wash: '洗う', cut: '切る', raw: '生肉・生魚', measure: '計量', heat: '加熱', simmer: '加熱（放置可）', rest: '置く', cool: '冷却', pack: '保存', plate: '仕上げ', clean: '洗浄' }

export default function RecipeDetail() {
  const { id } = useParams()
  const recipe = useStore((s) => (id ? s.recipes[id] : undefined))
  const tools = useStore((s) => s.tools)
  const toggle = useStore((s) => s.toggleRecipeFlag)
  const del = useStore((s) => s.deleteRecipe)
  const nav = useNavigate()
  const [editing, setEditing] = useState(false)
  const [servings, setServings] = useState(1)
  const toolName = (req: string) => req.split('|').map((t) => tools.find((x) => x.id === t)?.name ?? t).join(' / ')

  if (!recipe) return <Page title="レシピ" back="/recipes"><div className="surface"><Empty icon={<AlertTriangle size={24} />} title="レシピが見つかりません" body="削除されたか、URLが間違っています。" action={<Link className="font-semibold text-basil" to="/recipes">レシピ図鑑へ</Link>} /></div></Page>
  if (editing) return <RecipeEditor recipe={recipe} onDone={() => setEditing(false)} />

  const n = recipeNutrition(recipe)
  const t = recipeTimes(recipe)
  const sourceLabel = recipe.source === 'ai-detailed' ? 'AI提案（詳細レシピ）' : recipe.source === 'ai-template' ? 'AI生成（ルールベース）' : '手動登録'
  return (
    <Page
      title={recipe.name}
      subtitle={recipe.subtitle}
      back
      actions={
        <>
          <IconButton label={recipe.starred ? 'お気に入りから外す' : 'お気に入りに追加'} onClick={() => toggle(recipe.id, 'starred')} aria-pressed={recipe.starred}>
            <Star size={21} className={recipe.starred ? 'fill-[#e0a100] text-[#e0a100]' : ''} />
          </IconButton>
          <Button size="sm" variant="secondary" icon={<Pencil size={15} />} onClick={() => setEditing(true)}>編集</Button>
        </>
      }
    >
      <div className="mb-4 flex flex-wrap gap-1.5">
        <Tag tone={recipe.source === 'user' ? 'neutral' : 'sky'}>{sourceLabel}</Tag>
        {recipe.needsReview && <Tag tone="amber">要確認：自動推定の下書き</Tag>}
        <button onClick={() => toggle(recipe.id, 'canMake')} aria-pressed={recipe.canMake} className={cx('press inline-flex h-6 items-center rounded-full px-2 text-[12px] font-semibold cursor-pointer', recipe.canMake ? 'bg-basil-soft text-basil-ink' : 'bg-sunken text-ink-2')}>{recipe.canMake ? '作れる料理' : '作れる料理に追加'}</button>
        {recipe.tags.map((x) => <Tag key={x}>{x}</Tag>)}
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div>
          <dl className="surface mb-6 grid grid-cols-2 divide-x divide-y divide-line overflow-hidden text-center sm:grid-cols-4 sm:divide-y-0">
            <Fact k="調理時間" v={`${t.total}分`} sub={`手を動かす ${t.active}分`} />
            <Fact k="推定原価" v={yen(recipeCost(recipe))} sub="1食あたり" />
            <Fact k="冷凍" v={recipe.freeze === 'good' ? '向いている' : recipe.freeze === 'ok' ? '可' : '不向き'} sub={recipe.freeze === 'ng' ? '—' : `${recipe.freezerDays}日以内`} />
            <Fact k="冷蔵" v={`${recipe.fridgeDays}日`} sub="消費目安" />
          </dl>

          <section className="mb-6">
            <div className="mb-2 flex items-center justify-between px-1">
              <h2 className="text-[17px] font-bold">材料</h2>
              <Stepper label="食数" value={servings} onChange={setServings} min={1} max={8} unit="食" />
            </div>
            <ul className="surface divide-y divide-line">
              {recipe.ingredients.map((i, idx) => {
                const ing = INGREDIENT_MAP[i.ingredientId]
                const a = i.amount * servings
                return (
                  <li key={idx} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="min-w-0 flex-1">
                      <span className="text-[15px]">{ing?.name ?? i.ingredientId}</span>
                      {ing?.rawMeat && <ShieldAlert size={14} className="ml-1 inline text-raw" aria-label="生肉・生魚" />}
                      {(i.cut || i.note) && <span className="block text-[12px] text-ink-3">{[i.cut, i.note].filter(Boolean).join('・')}</span>}
                    </span>
                    <span className="num text-right text-[15px]">
                      {qty(a, ing?.unit ?? 'g')}
                      {ing?.staple && ing.unit === 'ml' && <span className="block text-[11px] text-ink-3">{spoon(a)}</span>}
                    </span>
                  </li>
                )
              })}
            </ul>
            <p className="mt-2 px-1 text-[12px] text-ink-3">分量は1食分×{servings}。常備調味料は買い物リストに含めません。</p>
          </section>

          <section className="mb-6">
            <h2 className="mb-2 px-1 text-[17px] font-bold">栄養（1食・推定）</h2>
            <div className="surface p-4">
              <div className="grid grid-cols-4 gap-2 text-center">
                <Nut k="エネルギー" v={Math.round(n.kcal)} u="kcal" />
                <Nut k="たんぱく質" v={r1(n.protein)} u="g" />
                <Nut k="脂質" v={r1(n.fat)} u="g" />
                <Nut k="炭水化物" v={r1(n.carbs)} u="g" />
              </div>
              <div className="mt-3 grid grid-cols-3 gap-x-4 gap-y-1.5 border-t border-line pt-3 text-[13px] sm:grid-cols-6">
                {[['食物繊維', r1(n.fiber), 'g'], ['食塩相当量', r1(n.salt), 'g'], ['カルシウム', Math.round(n.calcium), 'mg'], ['鉄', r1(n.iron), 'mg'], ['ビタミンB1', Math.round(n.vitB1 * 100) / 100, 'mg'], ['ビタミンC', Math.round(n.vitC), 'mg']].map(([k, v, u]) => (
                  <div key={k as string} className="flex justify-between gap-1 sm:block"><span className="text-ink-3">{k}</span> <span className="num font-semibold">{v}{u}</span></div>
                ))}
              </div>
              <p className="mt-3 text-[12px] leading-relaxed text-ink-3">日本食品標準成分表の代表値を参考にした材料からの概算です。調理による増減や実際の商品差は含みません。</p>
            </div>
          </section>

          <section className="mb-6">
            <h2 className="mb-2 px-1 text-[17px] font-bold">保存・再加熱</h2>
            <div className="surface space-y-2 p-4 text-[14px] leading-relaxed">
              <p><span className="font-semibold">再加熱：</span>{recipe.reheat}</p>
              {recipe.storageNote && <p className="text-ink-2">{recipe.storageNote}</p>}
              <p className="text-ink-2">作り置きは粗熱を30分以内に取り、清潔な容器で保存。食べる時は中心まで十分に温めます。</p>
            </div>
          </section>
        </div>

        <section className="mb-6">
          <h2 className="mb-2 px-1 text-[17px] font-bold">工程<span className="num ml-2 text-[14px] font-normal text-ink-3">{recipe.steps.length}</span></h2>
          <ol className="space-y-2">
            {recipe.steps.map((s, i) => (
              <li key={s.id} className={cx('surface flex gap-3 p-4', s.kind === 'raw' && 'ring-1 ring-raw/25')}>
                <span className="num flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sunken text-[13px] font-bold text-ink-2">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] leading-snug font-semibold">{s.title}</p>
                  {s.detail && <p className="mt-0.5 text-[13px] text-ink-2">{s.detail}</p>}
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Tag tone={s.kind === 'raw' ? 'raw' : s.kind === 'heat' || s.kind === 'simmer' ? 'amber' : 'neutral'}>{KIND_LABEL[s.kind]}</Tag>
                    <Tag><span className="num">{s.durationMin}分</span></Tag>
                    <Tag tone={s.attended ? 'neutral' : 'sky'}>{s.attended ? <><Hand size={11} />手が離せない</> : '放置できる'}</Tag>
                    {s.tools.map((tl) => <Tag key={tl}>{toolName(tl)}</Tag>)}
                  </div>
                  {s.heat && <p className="mt-2 flex items-center gap-1.5 text-[13px] text-amber"><Flame size={14} aria-hidden />{s.heat.method}{s.heat.coreTempC && <span className="inline-flex items-center gap-0.5"><Thermometer size={13} aria-hidden />中心{s.heat.coreTempC}℃{s.heat.holdMin}分以上</span>}</p>}
                  {s.safety && <p className="mt-1.5 flex items-start gap-1.5 text-[13px] text-raw"><ShieldAlert size={14} className="mt-0.5 shrink-0" aria-hidden />{s.safety}</p>}
                  {s.dependsOn.length > 0 && <p className="mt-1.5 text-[12px] text-ink-3">前の工程：{s.dependsOn.map((d) => recipe.steps.findIndex((x) => x.id === d) + 1).filter((x) => x > 0).join('・')}</p>}
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>
      {recipe.source === 'user' || recipe.needsReview ? (
        <Button variant="danger" size="sm" icon={<Trash2 size={15} />} className="mb-8" onClick={() => { const r = del(recipe.id); if (r.ok) { toast('レシピを削除しました'); nav('/recipes') } else toast(r.message, 'error') }}>このレシピを削除</Button>
      ) : null}
    </Page>
  )
}

function Fact({ k, v, sub }: { k: string; v: string; sub: string }) {
  return (
    <div className="px-2 py-3">
      <dt className="text-[12px] text-ink-3">{k}</dt>
      <dd className="num text-[17px] font-bold">{v}</dd>
      <dd className="text-[11px] text-ink-3">{sub}</dd>
    </div>
  )
}
function Nut({ k, v, u }: { k: string; v: number; u: string }) {
  return (
    <div>
      <p className="text-[11px] text-ink-3">{k}</p>
      <p className="num text-[19px] font-bold">{v}<span className="text-[12px] font-normal text-ink-3">{u}</span></p>
    </div>
  )
}

/* ---------- 編集 ---------- */
const KINDS = Object.keys(KIND_LABEL) as StepKind[]

function RecipeEditor({ recipe, onDone }: { recipe: Recipe; onDone: () => void }) {
  const save = useStore((s) => s.saveRecipe)
  const tools = useStore((s) => s.tools)
  const [r, setR] = useState<Recipe>(() => structuredClone(recipe))
  const [err, setErr] = useState<string>()
  const set = (patch: Partial<Recipe>) => setR((x) => ({ ...x, ...patch }))
  const setStep = (i: number, patch: Partial<RecipeStep>) => setR((x) => ({ ...x, steps: x.steps.map((s, j) => (j === i ? { ...s, ...patch } : s)) }))
  const ingOptions = useMemo(() => [...INGREDIENTS].sort((a, b) => a.aisle.localeCompare(b.aisle)), [])

  const submit = () => {
    if (!r.name.trim()) return setErr('料理名を入力してください')
    if (!r.ingredients.length) return setErr('材料を1つ以上登録してください')
    if (r.steps.some((s) => !s.title.trim() || !(s.durationMin > 0))) return setErr('工程の内容と時間（0より大きい値）を入力してください')
    save(r)
    toast('レシピを保存しました。献立・買い物・調理工程に反映されます')
    onDone()
  }
  const moveStep = (i: number, d: -1 | 1) => setR((x) => {
    const steps = [...x.steps]
    const j = i + d
    if (j < 0 || j >= steps.length) return x
    ;[steps[i], steps[j]] = [steps[j], steps[i]]
    return { ...x, steps }
  })

  return (
    <Page title="レシピを編集" subtitle={recipe.name} back actions={<Button variant="ghost" size="sm" onClick={onDone}>キャンセル</Button>}>
      <form onSubmit={(e) => { e.preventDefault(); submit() }} className="pb-28">
        <section className="surface mb-6 grid gap-4 p-4 sm:grid-cols-2">
          <Field label="料理名"><input className={inputCls} value={r.name} onChange={(e) => set({ name: e.target.value })} /></Field>
          <Field label="ひとこと（材料など）"><input className={inputCls} value={r.subtitle ?? ''} onChange={(e) => set({ subtitle: e.target.value })} /></Field>
          <Field label="区分">
            <select className={inputCls} value={r.role} onChange={(e) => set({ role: e.target.value as Role })}>
              <option value="main">主菜</option><option value="one-dish">ご飯もの・麺</option><option value="side">副菜</option><option value="soup">汁物</option>
            </select>
          </Field>
          <Field label="冷凍適性">
            <select className={inputCls} value={r.freeze} onChange={(e) => set({ freeze: e.target.value as FreezeFit })}>
              <option value="good">向いている</option><option value="ok">可</option><option value="ng">不向き</option>
            </select>
          </Field>
          <Field label="冷蔵の消費目安（日）"><input type="number" min={0} max={7} className={inputCls} value={r.fridgeDays} onChange={(e) => set({ fridgeDays: Number(e.target.value) })} /></Field>
          <Field label="冷凍の消費目安（日）"><input type="number" min={0} max={60} className={inputCls} value={r.freezerDays} onChange={(e) => set({ freezerDays: Number(e.target.value) })} disabled={r.freeze === 'ng'} /></Field>
          <div className="sm:col-span-2"><Field label="再加熱の方法"><input className={inputCls} value={r.reheat} onChange={(e) => set({ reheat: e.target.value })} /></Field></div>
        </section>

        <section className="mb-6">
          <h2 className="mb-2 px-1 text-[17px] font-bold">材料（1食分）</h2>
          <ul className="surface divide-y divide-line">
            {r.ingredients.map((i, idx) => (
              <li key={idx} className="grid grid-cols-[1fr_88px_44px] gap-2 p-3 sm:grid-cols-[1.4fr_100px_1fr_44px]">
                <select aria-label="食材" className={inputCls} value={i.ingredientId} onChange={(e) => set({ ingredients: r.ingredients.map((x, j) => (j === idx ? { ...x, ingredientId: e.target.value } : x)) })}>
                  {ingOptions.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
                <div className="relative">
                  <input aria-label="分量" type="number" step="any" min={0} className={cx(inputCls, 'num pr-8')} value={i.amount} onChange={(e) => set({ ingredients: r.ingredients.map((x, j) => (j === idx ? { ...x, amount: Number(e.target.value) } : x)) })} />
                  <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-[12px] text-ink-3">{INGREDIENT_MAP[i.ingredientId]?.unit}</span>
                </div>
                <input aria-label="切り方" className={cx(inputCls, 'col-span-2 row-start-2 sm:col-span-1 sm:row-start-auto')} placeholder="切り方（例：薄切り）" value={i.cut ?? ''} onChange={(e) => set({ ingredients: r.ingredients.map((x, j) => (j === idx ? { ...x, cut: e.target.value || undefined } : x)) })} />
                <IconButton label="この材料を削除" onClick={() => set({ ingredients: r.ingredients.filter((_, j) => j !== idx) })}><Trash2 size={17} /></IconButton>
              </li>
            ))}
          </ul>
          <Button variant="ghost" size="sm" className="mt-2" icon={<Plus size={16} />} onClick={() => set({ ingredients: [...r.ingredients, { ingredientId: 'onion', amount: 50 }] })}>材料を追加</Button>
        </section>

        <section className="mb-6">
          <h2 className="mb-2 px-1 text-[17px] font-bold">工程</h2>
          <ol className="space-y-2">
            {r.steps.map((s, i) => (
              <li key={s.id} className="surface p-3">
                <div className="flex items-center gap-2">
                  <span className="num flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sunken text-[13px] font-bold">{i + 1}</span>
                  <input aria-label={`工程${i + 1}の内容`} className={cx(inputCls, 'flex-1')} value={s.title} onChange={(e) => setStep(i, { title: e.target.value })} />
                  <div className="flex">
                    <IconButton label="上へ" onClick={() => moveStep(i, -1)} disabled={i === 0}><ChevronUp size={18} /></IconButton>
                    <IconButton label="下へ" onClick={() => moveStep(i, 1)} disabled={i === r.steps.length - 1}><ChevronDown size={18} /></IconButton>
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <select aria-label="種類" className={inputCls} value={s.kind} onChange={(e) => setStep(i, { kind: e.target.value as StepKind })}>
                    {KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
                  </select>
                  <div className="relative">
                    <input aria-label="時間（分）" type="number" min={0.5} step={0.5} className={cx(inputCls, 'num pr-8')} value={s.durationMin} onChange={(e) => setStep(i, { durationMin: Number(e.target.value) })} />
                    <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-[12px] text-ink-3">分</span>
                  </div>
                  <label className="flex h-11 items-center gap-2 rounded-[12px] bg-sunken px-3 text-[14px]">
                    <input type="checkbox" className="h-4 w-4 accent-[#2e6a4f]" checked={s.attended} onChange={(e) => setStep(i, { attended: e.target.checked })} />手が離せない
                  </label>
                  <IconButton label="この工程を削除" className="justify-self-end" onClick={() => setR((x) => ({ ...x, steps: x.steps.filter((_, j) => j !== i).map((st) => ({ ...st, dependsOn: st.dependsOn.filter((d) => d !== s.id) })) }))}><Trash2 size={17} /></IconButton>
                </div>
                <details className="mt-2 rounded-[12px] bg-[#fafbf9] px-3 py-2">
                  <summary className="cursor-pointer text-[13px] font-semibold text-ink-2">器具・前の工程（{s.tools.length}・{s.dependsOn.length}）</summary>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {tools.map((t) => {
                      const on = s.tools.some((x) => x.split('|').includes(t.id))
                      return <button type="button" key={t.id} aria-pressed={on} onClick={() => setStep(i, { tools: on ? s.tools.filter((x) => !x.split('|').includes(t.id)) : [...s.tools, t.id] })} className={cx('press h-8 rounded-full px-2.5 text-[12px] font-semibold cursor-pointer', on ? 'bg-ink text-white' : 'bg-surface text-ink-2 ring-1 ring-line')}>{t.name}</button>
                    })}
                  </div>
                  {i > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      <span className="w-full text-[12px] text-ink-3">この工程の前に終わっている必要がある工程</span>
                      {r.steps.slice(0, i).map((p, j) => {
                        const on = s.dependsOn.includes(p.id)
                        return <button type="button" key={p.id} aria-pressed={on} onClick={() => setStep(i, { dependsOn: on ? s.dependsOn.filter((d) => d !== p.id) : [...s.dependsOn, p.id] })} className={cx('press h-8 max-w-full truncate rounded-full px-2.5 text-[12px] cursor-pointer', on ? 'bg-basil text-white' : 'bg-surface text-ink-2 ring-1 ring-line')}>{j + 1}. {p.title}</button>
                      })}
                    </div>
                  )}
                </details>
              </li>
            ))}
          </ol>
          <Button variant="ghost" size="sm" className="mt-2" icon={<Plus size={16} />} onClick={() => setR((x) => ({ ...x, steps: [...x.steps, { id: `u${Date.now().toString(36)}`, kind: 'heat', title: '', durationMin: 3, attended: true, tools: [], dependsOn: x.steps.length ? [x.steps[x.steps.length - 1].id] : [] }] }))}>工程を追加</Button>
        </section>

        <div className="sticky bottom-[calc(72px+env(safe-area-inset-bottom))] z-20 lg:bottom-4">
          <div className="glass flex items-center gap-2 rounded-[18px] border border-line p-2 shadow-lift">
            {err ? <p className="flex-1 px-2 text-[13px] text-raw" role="alert">{err}</p> : <p className="flex-1 px-2 text-[13px] text-ink-2">保存すると献立・買い物・調理工程を再計算します</p>}
            <Button type="submit">保存</Button>
          </div>
        </div>
      </form>
    </Page>
  )
}
