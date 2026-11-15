// AI サービス層
// UI はこのインターフェースだけに依存する。現在はローカルのルールベース実装を使い、
// 将来は Cloudflare Workers 経由で LLM API を呼ぶ RemoteAIProvider に差し替える。

import { RECIPE_LIBRARY } from '../../data/recipes'
import type { Recipe, WeekPlan } from '../../types'
import { draftRecipeFromName } from './recipeGenerator'
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
  label: 'ローカルのルールベース提案（LLM未接続）',
  async proposeWeekPlan(ctx) {
    await tick() // 計算を非同期にしてUIのスケルトンを表示（LLM接続時の待ち時間と同じ扱い）
    return proposeWeekPlanLocal(ctx)
  },
  async generateRecipe(name, index) {
    await tick()
    return draftRecipeFromName(name, RECIPE_LIBRARY, index)
  },
}

/*
// 将来の実装例（Workers の /api/ai/plan が LLM を呼び、RecipeDef/WeekPlan 形式の JSON を返す）
export const remoteProvider: AIProvider = {
  id: 'remote-llm',
  label: 'LLM（Workers経由）',
  async proposeWeekPlan(ctx) {
    const res = await fetch('/api/ai/plan', { method: 'POST', body: JSON.stringify(ctx) })
    if (!res.ok) throw new Error('献立の生成に失敗しました')
    return res.json()
  },
  ...
}
*/

export const ai: AIProvider = localProvider
export type { PlannerContext }
