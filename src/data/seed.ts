// 初期データ。「サンプル（仮）」であることを各レコードのフラグで区別する。
import { addDays, today, weekStartOf } from '../lib/date'
import { recipeNutrition, sum } from '../engine/nutrition'
import { comboNutrients } from '../engine/lunch'
import { proposeWeekPlanLocal } from '../services/ai/localPlanner'
import type { Expense, HealthLog, InventoryLot, MealLog, PreparedDish, Profile, Recipe, WeekPlan } from '../types'
import { buildSeedRecipes } from './recipes'
import { SEVEN_MAP } from './seven'
import { TOOLS } from './tools'
import { INGREDIENT_MAP } from './ingredients'

export const PROFILE: Profile = {
  name: 'あなた',
  age: 35,
  sex: 'male',
  heightCm: 173,
  weightKg: 60,
  bodyFatPct: 9,
  goalWeightKg: 58,
  activity: 'low',
  workoutsPerWeek: '週1〜2回',
  goals: ['体脂肪を減らし筋肉を維持したい'],
  weeklyGroceryBudget: 4000,
  lunchBudget: 600,
  weekdayPrepMin: 10,
  batchDay: 0,
  maxRepeatDays: 3,
  store: 'いちやま湯村店',
  expectBreakfast: true,
}

export const BREAKFAST_PRESETS = [
  { id: 'bf-natto', label: '納豆ご飯と卵', items: [['rice', 60], ['natto', 1], ['egg', 1]] as [string, number][] },
  { id: 'bf-yogurt', label: 'ヨーグルトとトースト', items: [['yogurt', 100], ['bread', 1]] as [string, number][] },
  { id: 'bf-milk', label: '牛乳と卵かけご飯', items: [['milk', 200], ['rice', 60], ['egg', 1]] as [string, number][] },
]

export function presetNutrition(items: [string, number][]) {
  return sum(items.map(([id, amount]) => {
    const ing = INGREDIENT_MAP[id]
    const g = ing.unit === 'g' ? amount : amount * (ing.gramsPerUnit ?? 1)
    const k = g / 100
    const p = ing.per100g
    return { kcal: p.kcal * k, protein: p.protein * k, fat: p.fat * k, carbs: p.carbs * k, fiber: p.fiber * k, salt: p.salt * k, calcium: p.calcium * k, iron: p.iron * k, vitB1: p.vitB1 * k, vitC: p.vitC * k }
  }))
}

function wobble(i: number, amp: number) {
  return Math.sin(i * 1.7) * amp * 0.6 + Math.cos(i * 0.9) * amp * 0.4
}

export interface SeedState {
  profile: Profile
  recipes: Record<string, Recipe>
  tools: typeof TOOLS
  inventory: InventoryLot[]
  prepared: PreparedDish[]
  plan?: WeekPlan
  meals: MealLog[]
  health: HealthLog[]
  expenses: Expense[]
}

export function buildSeed(): SeedState {
  const t = today()
  const recipes = Object.fromEntries(buildSeedRecipes().map((r) => [r.id, r]))
  const lot = (id: string, ingredientId: string, quantity: number, location: InventoryLot['location'], boughtAgo: number, expIn: number): InventoryLot => ({
    id, ingredientId, quantity, location, purchasedOn: addDays(t, -boughtAgo), expiresOn: addDays(t, expIn), verified: false,
  })
  const inventory: InventoryLot[] = [
    lot('inv-minced', 'pork_minced', 250, 'fridge', 2, 0),
    lot('inv-breast', 'chicken_breast', 300, 'fridge', 2, 1),
    lot('inv-belly', 'pork_belly', 200, 'fridge', 1, 2),
    lot('inv-leek', 'leek', 100, 'fridge', 4, 6),
    lot('inv-carrot', 'carrot', 300, 'fridge', 5, 14),
    lot('inv-potato', 'potato', 400, 'pantry', 6, 20),
    lot('inv-napa', 'napa', 500, 'fridge', 3, 5),
    lot('inv-egg', 'egg', 6, 'fridge', 4, 10),
    lot('inv-rice', 'rice', 3000, 'pantry', 10, 50),
  ]
  const prepared: PreparedDish[] = [
    { id: 'pd-curry', recipeId: 'curry', servings: 2, cookedOn: addDays(t, -6), location: 'freezer', consumeBy: addDays(t, 15), plannedFor: [], eatenLog: [{ date: addDays(t, -6), servings: 1 }, { date: addDays(t, -4), servings: 1 }] },
    { id: 'pd-soup', recipeId: 'vegsoup', servings: 1, cookedOn: addDays(t, -3), location: 'fridge', consumeBy: t, plannedFor: [], eatenLog: [{ date: addDays(t, -2), servings: 1 }] },
  ]

  // 過去の食事記録（サンプル）
  const meals: MealLog[] = []
  const expenses: Expense[] = []
  const lunchSets = [['p05', 'p22'], ['p03', 'p10', 'p15'], ['p06'], ['p08', 'p11', 'p19'], ['p09', 'p12']]
  const dinnerSets = [['curry', 'misoshiru'], ['shogayaki', 'vegsoup'], ['teriyaki', 'vegsoup'], ['curry'], ['butakimchi', 'misoshiru'], ['mapo', 'vegsoup'], ['teriyaki']]
  for (let i = 10; i >= 1; i--) {
    const d = addDays(t, -i)
    if (i % 3 !== 0) {
      const p = BREAKFAST_PRESETS[i % 2]
      meals.push({ id: `seed-bf-${i}`, date: d, slot: 'breakfast', label: p.label, items: [{ name: p.label, kind: 'preset', refId: p.id }], nutrients: { ...presetNutrition(p.items), vegG: 0 }, basis: 'estimated-ingredients' })
    } else if (i !== 6) {
      meals.push({ id: `seed-bf-${i}`, date: d, slot: 'breakfast', label: '食べなかった', items: [], nutrients: { ...sum([]) }, basis: 'user-input', skipped: true })
    }
    const ls = lunchSets[i % lunchSets.length]
    if (i !== 3) {
      const ps = ls.map((id) => SEVEN_MAP[id])
      const price = ps.reduce((a, p) => a + p.price, 0)
      const id = `seed-lunch-${i}`
      meals.push({ id, date: d, slot: 'lunch', label: 'セブン-イレブン', items: ps.map((p) => ({ name: p.name, refId: p.id, kind: 'product' })), nutrients: comboNutrients(ps), basis: 'demo-label', price })
      expenses.push({ id: `exp-${id}`, date: d, amount: price, category: 'lunch', label: '昼食（セブン-イレブン）', sourceId: id })
    }
    const ds = dinnerSets[i % dinnerSets.length]
    meals.push({ id: `seed-dinner-${i}`, date: d, slot: 'dinner', label: ds.map((r) => recipes[r].name).join('・'), items: ds.map((r) => ({ name: recipes[r].name, refId: r, kind: 'recipe' })), nutrients: sum(ds.map((r) => recipeNutrition(recipes[r]))), basis: 'estimated-ingredients' })
  }
  const lastWeek = addDays(weekStartOf(t, PROFILE.batchDay), -7)
  expenses.push({ id: 'exp-seed-g1', date: lastWeek, amount: 3412, category: 'grocery', label: '食材（いちやま湯村店）先週分', sourceId: 'seed-g1' })

  // 体重などのライフログ（サンプル）
  const health: HealthLog[] = []
  for (let i = 29; i >= 1; i--) {
    const d = addDays(t, -i)
    const trend = 60.5 - (29 - i) * 0.017
    health.push({
      date: d,
      weight: Math.round((trend + wobble(i, 0.35)) * 10) / 10,
      bodyFat: i % 3 === 0 ? Math.round((9.3 + wobble(i + 2, 0.4)) * 10) / 10 : undefined,
      steps: Math.round(5200 + wobble(i * 3, 2200) + (i % 7 === 6 ? 3000 : 0)),
      sleepH: Math.round((6.4 + wobble(i * 2, 0.8)) * 10) / 10,
      waterL: Math.round((1.4 + wobble(i, 0.3)) * 10) / 10,
      fatigue: (Math.min(5, Math.max(1, Math.round(3 + wobble(i * 5, 1.4)))) as HealthLog['fatigue']),
      workout: i % 7 === 3 ? '筋トレ（上半身）40分' : i % 7 === 0 ? '筋トレ（下半身）40分' : undefined,
      sample: true,
    })
  }

  const plan = proposeWeekPlanLocal({ recipes: Object.values(recipes), inventory, profile: PROFILE, weekStart: weekStartOf(t, PROFILE.batchDay), history: meals, generation: 0, today: t })

  return { profile: PROFILE, recipes, tools: TOOLS.map((x) => ({ ...x })), inventory, prepared, plan, meals, health, expenses }
}
