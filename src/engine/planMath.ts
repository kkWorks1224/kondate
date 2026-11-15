// 献立から「必要食材」「買い物リスト」「推定食費」「栄養」「調理対象」を導出する純粋関数群
import { INGREDIENT_MAP } from '../data/ingredients'
import { addDays, diffDays } from '../lib/date'
import { uid } from '../lib/format'
import type { Aisle, InventoryLot, Nutrients, Recipe, ShoppingItem, WeekPlan } from '../types'
import { add, recipeNutrition, ZERO } from './nutrition'
import type { PlanRecipeInput } from './cookPlanner'

export interface DishUse {
  recipeId: string
  dates: string[]
  mode: 'batch' | 'fresh'
}

/** 献立中の料理と、食べる日 */
export function dishUses(plan: WeekPlan): DishUse[] {
  const map = new Map<string, DishUse>()
  for (const d of plan.days) {
    for (const id of [d.dinner.main, d.dinner.side]) {
      if (!id) continue
      const k = `${id}:${d.dinner.mode}`
      const u = map.get(k) ?? { recipeId: id, dates: [], mode: d.dinner.mode }
      u.dates.push(d.date)
      map.set(k, u)
    }
  }
  return [...map.values()]
}

/** 作り置き日にまとめて作る料理と食数。冷蔵期限を超える日の分は冷凍に回す */
export function batchInputs(plan: WeekPlan, recipes: Record<string, Recipe>): PlanRecipeInput[] {
  const out: PlanRecipeInput[] = []
  for (const u of dishUses(plan)) {
    if (u.mode !== 'batch') continue
    const r = recipes[u.recipeId]
    if (!r) continue
    const servings = u.dates.length
    const eatToday = u.dates.filter((d) => d === plan.weekStart).length
    const store = Math.max(0, servings - eatToday)
    const freeze = r.freeze === 'ng' ? 0 : u.dates.filter((d) => diffDays(d, plan.weekStart) > r.fridgeDays).length
    out.push({ recipe: r, servings, store, freeze: Math.min(freeze, store) })
  }
  return out
}

export interface Requirement {
  ingredientId: string
  amount: number
  usedBy: string[]
}

/** 献立に必要な食材量。作り置き調理が完了済みなら、まとめ調理分は必要量に含めない */
export function requirements(plan: WeekPlan, recipes: Record<string, Recipe>): Requirement[] {
  const req = new Map<string, Requirement>()
  const addReq = (r: Recipe, servings: number) => {
    for (const i of r.ingredients) {
      const ing = INGREDIENT_MAP[i.ingredientId]
      if (!ing || ing.staple) continue
      const x = req.get(i.ingredientId) ?? { ingredientId: i.ingredientId, amount: 0, usedBy: [] }
      x.amount += i.amount * servings
      if (!x.usedBy.includes(r.id)) x.usedBy.push(r.id)
      req.set(i.ingredientId, x)
    }
  }
  if (!plan.cookedSessionId) for (const b of batchInputs(plan, recipes)) addReq(b.recipe, b.servings)
  for (const u of dishUses(plan)) if (u.mode === 'fresh' && recipes[u.recipeId]) addReq(recipes[u.recipeId], u.dates.length)
  return [...req.values()]
}

export function stockOf(inv: InventoryLot[], ingredientId: string) {
  return inv.filter((l) => l.ingredientId === ingredientId).reduce((a, l) => a + l.quantity, 0)
}

/** 必要量から在庫を差し引き、購入単位に丸める */
export function buildShopping(reqs: Requirement[], inv: InventoryLot[], keep: ShoppingItem[] = []): ShoppingItem[] {
  const purchased = keep.filter((k) => k.purchased || k.manual)
  const items: ShoppingItem[] = [...purchased]
  for (const r of reqs) {
    const ing = INGREDIENT_MAP[r.ingredientId]
    if (!ing) continue
    const short = r.amount - stockOf(inv, r.ingredientId)
    if (short <= 0.0001) continue
    const packs = Math.ceil(short / ing.pack.size)
    const prev = keep.find((k) => k.ingredientId === r.ingredientId && !k.purchased && !k.manual)
    items.push({
      id: prev?.id ?? uid('shop'), ingredientId: ing.id, name: ing.name, aisle: ing.aisle as Aisle, needQty: Math.round(short * 10) / 10, unit: ing.unit,
      packs, packLabel: ing.pack.label, estPrice: packs * ing.pack.price, actualPrice: prev?.actualPrice, purchased: false, usedBy: r.usedBy,
    })
  }
  return items
}

export function planCost(items: ShoppingItem[]) {
  return items.reduce((a, i) => a + (i.purchased ? i.actualPrice ?? i.estPrice : i.estPrice), 0)
}

/** 1日あたりの夕食栄養（推定） */
export function dayNutrition(plan: WeekPlan, recipes: Record<string, Recipe>, date: string): Nutrients {
  const d = plan.days.find((x) => x.date === date)
  let n = { ...ZERO }
  for (const id of [d?.dinner.main, d?.dinner.side]) if (id && recipes[id]) n = add(n, recipeNutrition(recipes[id]))
  return n
}

export function planDates(start: string) {
  return Array.from({ length: 7 }, (_, i) => addDays(start, i))
}

/** 献立の妥当性チェック（保存期限・連続日数など） */
export function planIssues(plan: WeekPlan, recipes: Record<string, Recipe>, maxRepeat: number): string[] {
  const issues: string[] = []
  for (const u of dishUses(plan)) {
    const r = recipes[u.recipeId]
    if (!r || u.mode !== 'batch') continue
    const late = u.dates.filter((d) => diffDays(d, plan.weekStart) > r.fridgeDays)
    if (late.length && r.freeze === 'ng') issues.push(`${r.name}は冷凍に不向きで、冷蔵${r.fridgeDays}日を超える日（${late.length}日分）があります`)
  }
  let run = 1
  for (let i = 1; i < plan.days.length; i++) {
    const a = plan.days[i - 1].dinner.main
    const b = plan.days[i].dinner.main
    run = a && a === b ? run + 1 : 1
    if (run > maxRepeat) {
      issues.push(`${recipes[b!]?.name ?? '同じ料理'}が${run}日続いています（上限${maxRepeat}日）`)
      break
    }
  }
  const empty = plan.days.filter((d) => !d.dinner.main).length
  if (empty) issues.push(`主菜が未設定の日が${empty}日あります`)
  return issues
}
