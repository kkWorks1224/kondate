import { Search, Snowflake, Sparkles, Star, Timer } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Page } from '../components/layout/Page'
import { Button } from '../components/ui/Button'
import { Empty, Field, inputCls, Tag } from '../components/ui/bits'
import { Segmented } from '../components/ui/Segmented'
import { Sheet } from '../components/ui/Sheet'
import { toast } from '../components/ui/Toast'
import { INGREDIENT_MAP } from '../data/ingredients'
import { recipeCost, recipeNutrition, recipeTimes } from '../engine/nutrition'
import { cx, yen } from '../lib/format'
import { useStore } from '../store/useStore'
import type { Recipe, Role } from '../types'

type F = 'all' | 'canMake' | 'liked' | 'new' | 'starred'
const ROLE_LABEL: Record<Role, string> = { main: '主菜', 'one-dish': 'ご飯もの・麺', side: '副菜', soup: '汁物' }

export default function Recipes() {
  const recipes = useStore((s) => s.recipes)
  const toggle = useStore((s) => s.toggleRecipeFlag)
  const [q, setQ] = useState('')
  const [f, setF] = useState<F>('all')
  const [freezeOnly, setFreezeOnly] = useState(false)
  const [quick, setQuick] = useState(false)
  const [gen, setGen] = useState(false)
  const all = Object.values(recipes)
  const list = all
    .filter((r) => (f === 'all' ? true : f === 'canMake' ? r.canMake : f === 'liked' ? r.liked : f === 'new' ? r.isNew : r.starred))
    .filter((r) => !freezeOnly || r.freeze === 'good')
    .filter((r) => !quick || recipeTimes(r).total <= 20)
    .filter((r) => !q || r.name.includes(q) || r.ingredients.some((i) => INGREDIENT_MAP[i.ingredientId]?.name.includes(q)))
  const groups = (['main', 'one-dish', 'side', 'soup'] as Role[]).map((role) => ({ role, items: list.filter((r) => r.role === role) })).filter((g) => g.items.length)

  return (
    <Page title="レシピ図鑑" subtitle={`${all.length}品・作れる料理 ${all.filter((r) => r.canMake).length}品`} back="/plan" actions={<Button size="sm" variant="tinted" icon={<Sparkles size={15} />} onClick={() => setGen(true)}>AIで作る</Button>}>
      <div className="mb-4 space-y-2">
        <div className="relative">
          <Search size={17} className="absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" aria-hidden />
          <input className={cx(inputCls, 'bg-surface pl-9 shadow-card')} placeholder="料理名・材料で探す（例：玉ねぎ）" value={q} onChange={(e) => setQ(e.target.value)} aria-label="料理名・材料で探す" />
        </div>
        <Segmented label="分類" value={f} onChange={setF} options={[
          { value: 'all', label: 'すべて' }, { value: 'canMake', label: '作れる' }, { value: 'liked', label: '好き' }, { value: 'new', label: '新提案' }, { value: 'starred', label: '★' },
        ]} />
        <div className="flex gap-2">
          <Chip on={freezeOnly} onClick={() => setFreezeOnly(!freezeOnly)}><Snowflake size={14} />冷凍向き</Chip>
          <Chip on={quick} onClick={() => setQuick(!quick)}><Timer size={14} />20分以内</Chip>
        </div>
      </div>

      {!groups.length && <div className="surface"><Empty icon={<Search size={24} />} title="該当するレシピがありません" body="条件を変えるか、AIでレシピを作成してください。" /></div>}

      {groups.map((g) => (
        <section key={g.role} className="mb-6">
          <h2 className="mb-2 px-1 text-[17px] font-bold">{ROLE_LABEL[g.role]}<span className="num ml-2 text-[14px] font-normal text-ink-3">{g.items.length}</span></h2>
          <ul className="surface divide-y divide-line overflow-hidden">
            {g.items.map((r) => <RecipeRow key={r.id} r={r} onStar={() => toggle(r.id, 'starred')} />)}
          </ul>
        </section>
      ))}
      <p className="mb-6 px-1 text-[12px] leading-relaxed text-ink-3">栄養・原価は材料の標準成分値と想定価格から算出した1食あたりの推定値です。</p>
      <GenerateSheet open={gen} onClose={() => setGen(false)} />
    </Page>
  )
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button aria-pressed={on} onClick={onClick} className={cx('press inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold cursor-pointer', on ? 'bg-ink text-white' : 'bg-surface text-ink-2 shadow-card')}>
      {children}
    </button>
  )
}

function RecipeRow({ r, onStar }: { r: Recipe; onStar: () => void }) {
  const n = useMemo(() => recipeNutrition(r), [r])
  const t = recipeTimes(r)
  const main = r.ingredients.filter((i) => !INGREDIENT_MAP[i.ingredientId]?.staple).slice(0, 4).map((i) => INGREDIENT_MAP[i.ingredientId]?.name)
  return (
    <li className="flex items-center">
      <Link to={`/recipes/${r.id}`} className="press flex min-w-0 flex-1 items-center gap-3 px-4 py-3 hover:bg-sunken/60">
        <span className="h-9 w-1.5 shrink-0 rounded-full" style={{ background: r.color }} aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="text-[16px] font-semibold">{r.name}</span>
            {r.canMake ? null : r.isNew ? <Tag tone="sky">新提案</Tag> : null}
            {r.liked && !r.canMake && <Tag>好き</Tag>}
            {r.needsReview && <Tag tone="amber">要確認</Tag>}
          </span>
          <span className="block truncate text-[13px] text-ink-3">{main.join('・')}</span>
          <span className="num mt-0.5 flex flex-wrap gap-x-3 text-[12px] text-ink-2">
            <span>{t.total}分</span><span>{yen(recipeCost(r))}</span><span>{Math.round(n.kcal)}kcal</span><span>P{Math.round(n.protein)}g</span>
            <span>{r.freeze === 'good' ? '冷凍◎' : r.freeze === 'ok' ? '冷凍○' : '冷凍×'}</span>
          </span>
        </span>
      </Link>
      <button onClick={onStar} aria-pressed={r.starred} aria-label={r.starred ? `${r.name}をお気に入りから外す` : `${r.name}をお気に入りに追加`} className="press mr-2 flex h-11 w-11 items-center justify-center rounded-full hover:bg-sunken cursor-pointer">
        <Star size={20} className={r.starred ? 'fill-[#e0a100] text-[#e0a100]' : 'text-ink-3'} />
      </button>
    </li>
  )
}

function GenerateSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const generate = useStore((s) => s.generateRecipe)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const nav = useNavigate()
  const submit = async () => {
    if (!name.trim()) return
    setBusy(true)
    const r = await generate(name)
    setBusy(false)
    if (!r.ok) return toast(r.message, 'error')
    toast(r.message ?? '作成しました', r.message?.includes('確認') ? 'info' : 'ok')
    onClose()
    setName('')
    nav(`/recipes/${r.id}`)
  }
  return (
    <Sheet open={open} onClose={onClose} title="AIでレシピを作る" footer={<Button className="w-full" onClick={submit} disabled={!name.trim() || busy} icon={<Sparkles size={16} />}>{busy ? '作成中…' : 'レシピを作成'}</Button>}>
      <form onSubmit={(e) => { e.preventDefault(); submit() }}>
        <Field label="料理名" hint="音声入力の誤変換もAIが補正します。">
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="例：鶏むね肉とブロッコリーの炒め" data-autofocus />
        </Field>
      </form>
      <div className="mt-4 rounded-xl bg-sunken px-3 py-2.5 text-[13px] leading-relaxed text-ink-2">Workers AI が材料・分量・切り方・調理法を決め、工程・器具・衛生上の順序はアプリが組み立てます。ライブラリにある料理は詳細レシピを使います。作成後に編集できます。</div>
    </Sheet>
  )
}
