import { INGREDIENT_MAP } from '../data/ingredients'
import type { Nutrients, Recipe } from '../types'
import { gramsOf } from '../services/ai/recipeGenerator'

export const ZERO: Nutrients = { kcal: 0, protein: 0, fat: 0, carbs: 0, fiber: 0, salt: 0, calcium: 0, iron: 0, vitB1: 0, vitC: 0, vegG: 0 }

export function add(a: Nutrients, b: Partial<Nutrients>, k = 1): Nutrients {
  const out = { ...a }
  for (const key of Object.keys(ZERO) as (keyof Nutrients)[]) out[key] = a[key] + (b[key] ?? 0) * k
  return out
}
export function sum(list: Partial<Nutrients>[]) {
  return list.reduce<Nutrients>((acc, n) => add(acc, n), { ...ZERO })
}

/** 1食あたりの推定栄養（材料の標準成分値からの概算。調理による損失は考慮しない） */
export function recipeNutrition(r: Recipe): Nutrients {
  let n = { ...ZERO }
  for (const i of r.ingredients) {
    const ing = INGREDIENT_MAP[i.ingredientId]
    if (!ing) continue
    const g = gramsOf(i.ingredientId, i.amount)
    n = add(n, ing.per100g, g / 100)
    if (ing.isVeg) n.vegG += ing.id === 'hijiki' || ing.id === 'wakame' ? g * 8 : g // 乾物は戻し後重量で換算
  }
  return n
}

/** 1食あたりの推定原価（常備調味料も使用量分を按分） */
export function recipeCost(r: Recipe): number {
  let c = 0
  for (const i of r.ingredients) {
    const ing = INGREDIENT_MAP[i.ingredientId]
    if (!ing) continue
    c += (ing.pack.price / ing.pack.size) * i.amount
  }
  return Math.round(c)
}

export function recipeTimes(r: Recipe) {
  const total = criticalPath(r)
  const active = r.steps.filter((s) => s.attended).reduce((a, s) => a + s.durationMin, 0)
  return { total: Math.round(Math.max(total, active)), active: Math.round(active) }
}

function criticalPath(r: Recipe) {
  const memo: Record<string, number> = {}
  const byId = Object.fromEntries(r.steps.map((s) => [s.id, s]))
  const f = (id: string, depth = 0): number => {
    if (memo[id] !== undefined) return memo[id]
    const s = byId[id]
    if (!s || depth > 50) return 0
    const v = s.durationMin + Math.max(0, ...s.dependsOn.map((d) => f(d, depth + 1)))
    memo[id] = v
    return v
  }
  return Math.max(0, ...r.steps.map((s) => f(s.id)))
}
