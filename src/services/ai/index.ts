// AI サービス層
// UI はこのインターフェースだけに依存する。
// 本番は Cloudflare Workers AI（/api/ai/*）を使い、通信できないときはローカルのルールベース実装に切り替える。

import { RECIPE_LIBRARY } from '../../data/recipes'
import { INGREDIENT_MAP } from '../../data/ingredients'
import { buildShopping, planCost, requirements } from '../../engine/planMath'
import { recipeNutrition } from '../../engine/nutrition'
import { yen } from '../../lib/format'
import type { Recipe, WeekPlan } from '../../types'
import { buildRecipe, draftRecipeFromName, type RecipeDef } from './recipeGenerator'
import { proposeWeekPlanLocal, type PlannerContext } from './localPlanner'

export interface AIProvider {
  readonly id: string
  readonly label: string
  proposeWeekPlan(ctx: PlannerContext): Promise<WeekPlan>
  generateRecipe(name: string, index: number): Promise<Recipe>
}

const tick = () => new Promise((r) => setTimeout(r, 380))

export const localProvider: AIProvider = {
  id: 'local-rules',
  label: 'ルールベース（オフライン）',
  async proposeWeekPlan(ctx) {
    await tick()
    return proposeWeekPlanLocal(ctx)
  },
  async generateRecipe(name, index) {
    await tick()
    return draftRecipeFromName(name, RECIPE_LIBRARY, index)
  },
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(path, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  if (!r.ok) throw new Error(r.status === 429 ? 'AIの利用回数の上限に達しました' : 'AIの応答を取得できませんでした')
  return r.json() as Promise<T>
}

/** 献立の要約（AI に渡す事実。数値はアプリが計算したものだけ） */
function planSummary(plan: WeekPlan, ctx: PlannerContext) {
  const byId = Object.fromEntries(ctx.recipes.map((r) => [r.id, r]))
  const cost = planCost(buildShopping(requirements(plan, byId), ctx.inventory))
  const lines = plan.days.map((d, i) => {
    const m = d.dinner.main ? byId[d.dinner.main] : undefined
    const s = d.dinner.side ? byId[d.dinner.side] : undefined
    const n = [m, s].filter(Boolean).map((r) => recipeNutrition(r as Recipe))
    const p = Math.round(n.reduce((a, x) => a + x.protein, 0))
    const salt = n.reduce((a, x) => a + x.salt, 0).toFixed(1)
    const veg = Math.round(n.reduce((a, x) => a + x.vegG, 0))
    return `${i + 1}日目: ${m?.name ?? 'なし'}${s ? `＋${s.name}` : ''}（${d.dinner.mode === 'batch' ? '作り置き' : '当日調理'}、たんぱく質${p}g、塩分${salt}g、野菜${veg}g）`
  })
  const inv = ctx.inventory.slice(0, 12).map((l) => INGREDIENT_MAP[l.ingredientId]?.name).filter(Boolean)
  return [
    `体格: ${ctx.profile.heightCm}cm・${ctx.profile.weightKg}kg・体脂肪率${ctx.profile.bodyFatPct}%（減量はしない）`,
    `週の食費予算 ${yen(ctx.profile.weeklyGroceryBudget)}、この献立の推定食費 ${yen(cost)}`,
    `在庫: ${inv.join('・') || 'なし'}`,
    ...lines,
  ].join('\n')
}

export const workersProvider: AIProvider = {
  id: 'workers-ai',
  label: 'Workers AI',
  async proposeWeekPlan(ctx) {
    // 予算・在庫・冷凍適性などの制約を守る組み立てはルールで行い、AI は助言を付ける
    const plan = proposeWeekPlanLocal(ctx)
    try {
      const { advice } = await post<{ advice: string[] }>('/api/ai/plan-advice', { summary: planSummary(plan, ctx) })
      if (advice.length) {
        plan.rationale = [...advice.map((a) => `AI：${a}`), ...plan.rationale]
        plan.generatedBy = 'ai-workers'
      }
    } catch {
      plan.rationale = [...plan.rationale, 'AIの助言は取得できませんでした（ルールベースで作成）']
    }
    return plan
  },
  async generateRecipe(name, index) {
    // ライブラリにある料理は検証済みの詳細レシピを使う
    const hit = RECIPE_LIBRARY.find((d) => d.name === name || name.includes(d.name))
    if (hit) return draftRecipeFromName(name, RECIPE_LIBRARY, index)
    try {
      const { def } = await post<{ def: Omit<RecipeDef, 'id'> }>('/api/ai/recipe', { name })
      const r = buildRecipe({ ...def, id: `ai-${Date.now().toString(36)}`, isNew: true, tags: ['AI生成'] }, index)
      return { ...r, source: 'ai-llm', needsReview: true }
    } catch {
      return draftRecipeFromName(name, RECIPE_LIBRARY, index)
    }
  },
}

export const ai: AIProvider = typeof window !== 'undefined' && !import.meta.env.VITEST ? workersProvider : localProvider
export type { PlannerContext }
