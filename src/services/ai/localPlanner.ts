// ルールベースの週間献立プランナー（LLM接続前の代替実装）
import { INGREDIENT_MAP } from '../../data/ingredients'
import { addDays, diffDays } from '../../lib/date'
import { uid, yen } from '../../lib/format'
import { buildShopping, planCost, requirements } from '../../engine/planMath'
import { recipeCost, recipeNutrition } from '../../engine/nutrition'
import type { DayPlan, InventoryLot, MealLog, Profile, Recipe, WeekPlan } from '../../types'

export interface PlannerContext {
  recipes: Recipe[]
  inventory: InventoryLot[]
  profile: Profile
  weekStart: string
  history: MealLog[]
  generation: number
  today: string
}

function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

interface Slot {
  days: number[]
  pool: 'new' | 'known' | 'fresh'
  mode: 'batch' | 'fresh'
}

const MAIN_SLOTS = (gen: number): Slot[] =>
  gen % 2 === 0
    ? [
        { days: [0, 1], pool: 'new', mode: 'batch' },
        { days: [2, 3], pool: 'known', mode: 'batch' },
        { days: [4, 5], pool: 'known', mode: 'batch' },
        { days: [6], pool: 'fresh', mode: 'fresh' },
      ]
    : [
        { days: [0], pool: 'new', mode: 'batch' },
        { days: [1, 2, 3], pool: 'known', mode: 'batch' },
        { days: [4, 5], pool: 'known', mode: 'batch' },
        { days: [6], pool: 'fresh', mode: 'fresh' },
      ]

const SIDE_SLOTS: Slot[] = [
  { days: [0, 1, 2], pool: 'known', mode: 'batch' },
  { days: [3, 4, 5], pool: 'known', mode: 'batch' },
  { days: [6], pool: 'fresh', mode: 'fresh' },
]

function storable(r: Recipe, days: number[]) {
  const maxD = Math.max(...days)
  return maxD <= r.fridgeDays || r.freeze !== 'ng'
}

export function proposeWeekPlanLocal(ctx: PlannerContext): WeekPlan {
  const rand = rng(ctx.generation * 9973 + Number(ctx.weekStart.replace(/-/g, '')))
  const byId = Object.fromEntries(ctx.recipes.map((r) => [r.id, r]))
  const recent = new Set(ctx.history.filter((h) => h.slot === 'dinner' && diffDays(ctx.today, h.date) <= 7).flatMap((h) => h.items.map((i) => i.refId)))
  const stock = new Map<string, number>()
  const expiring = new Set<string>()
  for (const l of ctx.inventory) {
    stock.set(l.ingredientId, (stock.get(l.ingredientId) ?? 0) + l.quantity)
    if (l.expiresOn && diffDays(l.expiresOn, ctx.today) <= 3) expiring.add(l.ingredientId)
  }
  const chosen: Recipe[] = []
  const nonStaple = (r: Recipe) => r.ingredients.filter((i) => !INGREDIENT_MAP[i.ingredientId]?.staple)

  const score = (r: Recipe, slot: Slot) => {
    let s = 0
    if (r.canMake) s += 3
    if (r.starred) s += 1
    if (r.liked) s += 0.5
    for (const i of nonStaple(r)) {
      const have = stock.get(i.ingredientId) ?? 0
      if (have > 0) s += Math.min(1, have / (i.amount * slot.days.length)) * (expiring.has(i.ingredientId) ? 1.6 : 0.8)
    }
    const shared = new Set(chosen.flatMap((c) => nonStaple(c).map((i) => i.ingredientId)))
    s += nonStaple(r).filter((i) => shared.has(i.ingredientId)).length * 0.6
    const n = recipeNutrition(r)
    s += r.role === 'side' || r.role === 'soup' ? Math.min(1.5, n.vegG / 60) : Math.min(3, n.protein / 10)
    if (r.role === 'one-dish') s -= 1.5 // 夕食は主食控えめ
    s -= recipeCost(r) / 160
    if (recent.has(r.id)) s -= 2
    if (slot.mode === 'batch' && r.freeze === 'good') s += 0.6
    if (slot.mode === 'fresh' && (r.freeze === 'ng' || r.tags.includes('当日調理向き'))) s += 1.5
    return s + rand() * 1.6
  }

  const pickFor = (slot: Slot, roles: Recipe['role'][], exclude: Set<string>) => {
    let pool = ctx.recipes.filter((r) => roles.includes(r.role) && !exclude.has(r.id) && !r.needsReview)
    if (slot.pool === 'new') {
      const np = pool.filter((r) => !r.canMake && (r.liked || r.isNew))
      if (np.length) pool = np
    } else if (slot.pool === 'known') pool = pool.filter((r) => r.canMake || r.starred || (roles.includes('side') && r.liked))
    // 新しい料理は週2品まで
    if (chosen.filter((c) => !c.canMake).length >= 2) pool = pool.filter((r) => r.canMake)
    pool = pool.filter((r) => slot.mode === 'fresh' || storable(r, slot.days))
    const ranked = pool.map((r) => ({ r, s: score(r, slot) })).sort((a, b) => b.s - a.s)
    return ranked.map((x) => x.r)
  }

  const days: DayPlan[] = Array.from({ length: 7 }, (_, i) => ({ date: addDays(ctx.weekStart, i), dinner: { mode: 'batch' } }))
  const mainChoice: { slot: Slot; ranked: Recipe[]; idx: number }[] = []
  const used = new Set<string>()
  for (const slot of MAIN_SLOTS(ctx.generation)) {
    const ranked = pickFor(slot, ['main', 'one-dish'], used)
    const r = ranked[0]
    if (!r) continue
    used.add(r.id)
    chosen.push(r)
    mainChoice.push({ slot, ranked, idx: 0 })
  }
  const sideChoice: { slot: Slot; r: Recipe }[] = []
  for (const slot of SIDE_SLOTS) {
    const ranked = pickFor(slot, ['side', 'soup'], used)
    // 副菜は野菜量を重視
    ranked.sort((a, b) => recipeNutrition(b).vegG - recipeNutrition(a).vegG + (rand() - 0.5) * 60)
    const r = ranked[0]
    if (!r) continue
    used.add(r.id)
    chosen.push(r)
    sideChoice.push({ slot, r })
  }

  const apply = () => {
    for (const d of days) d.dinner = { mode: 'batch' }
    for (const m of mainChoice) for (const i of m.slot.days) days[i].dinner = { ...days[i].dinner, main: m.ranked[m.idx].id, mode: m.slot.mode }
    for (const s of sideChoice) for (const i of s.slot.days) days[i].dinner = { ...days[i].dinner, side: s.r.id }
  }
  apply()

  const draft = (): WeekPlan => ({ id: uid('plan'), weekStart: ctx.weekStart, days, status: 'draft', generatedBy: 'ai-local', rationale: [], generation: ctx.generation, createdAt: new Date().toISOString() })
  const cost = () => planCost(buildShopping(requirements(draft(), byId), ctx.inventory))

  // 予算超過なら、食数×原価が大きい主菜から安い候補へ置き換える
  let tries = 0
  while (cost() > ctx.profile.weeklyGroceryBudget && tries++ < 8) {
    const worst = [...mainChoice].sort((a, b) => recipeCost(b.ranked[b.idx]) * b.slot.days.length - recipeCost(a.ranked[a.idx]) * a.slot.days.length)
    const target = worst.find((m) => m.ranked.slice(m.idx + 1).some((r) => recipeCost(r) < recipeCost(m.ranked[m.idx]) && !mainChoice.some((o) => o !== m && o.ranked[o.idx].id === r.id)))
    if (!target) break
    const cur = recipeCost(target.ranked[target.idx])
    target.idx = target.ranked.findIndex((r, i) => i > target.idx && recipeCost(r) < cur && !mainChoice.some((o) => o !== target && o.ranked[o.idx].id === r.id))
    apply()
  }

  const plan = draft()
  const finalCost = cost()
  const mains = mainChoice.map((m) => m.ranked[m.idx])
  const newOnes = [...mains, ...sideChoice.map((s) => s.r)].filter((r) => !r.canMake)
  const inStock = [...new Set(chosen.flatMap((r) => nonStaple(r).map((i) => i.ingredientId)).filter((id) => (stock.get(id) ?? 0) > 0))]
  const counts = new Map<string, number>()
  for (const r of [...mains, ...sideChoice.map((s) => s.r)]) for (const i of nonStaple(r)) counts.set(i.ingredientId, (counts.get(i.ingredientId) ?? 0) + 1)
  const shared = [...counts.entries()].filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1]).slice(0, 3)
  const avgP = plan.days.reduce((a, d) => a + (d.dinner.main ? recipeNutrition(byId[d.dinner.main]).protein : 0) + (d.dinner.side ? recipeNutrition(byId[d.dinner.side]).protein : 0), 0) / 7
  const avgV = plan.days.reduce((a, d) => a + (d.dinner.main ? recipeNutrition(byId[d.dinner.main]).vegG : 0) + (d.dinner.side ? recipeNutrition(byId[d.dinner.side]).vegG : 0), 0) / 7

  plan.rationale = [
    newOnes.length ? `新しい料理：${newOnes.map((r) => r.name).join('・')}` : '新しい料理の候補がないため、作れる料理のみで構成',
    inStock.length ? `在庫を活用：${inStock.slice(0, 4).map((id) => INGREDIENT_MAP[id]?.name).join('・')}${expiring.size ? '（期限が近いものを優先）' : ''}` : '在庫と重なる食材は少なめ',
    shared.length ? `共通食材：${shared.map(([id, c]) => `${INGREDIENT_MAP[id]?.name}（${c}品）`).join('・')}` : '',
    `推定食費 ${yen(finalCost)} ／ 予算 ${yen(ctx.profile.weeklyGroceryBudget)}${finalCost > ctx.profile.weeklyGroceryBudget ? '（予算超過。料理の差し替えを検討してください）' : ''}`,
    `夕食の推定 たんぱく質 平均${Math.round(avgP)}g・野菜 平均${Math.round(avgV)}g`,
    '平日は温めるだけ。土曜は作りたて向きの料理を当日調理',
  ].filter(Boolean)
  return plan
}
