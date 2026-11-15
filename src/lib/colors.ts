import type { Recipe, WeekPlan } from '../types'

// 献立内の料理に、固定順で重ならない色を割り当てる（validate_palette.js で検証済みの先頭3色を含む）
export const DISH_PALETTE = ['#1F8A5B', '#3D7CC9', '#B97A0E', '#A6466B', '#3F8C8A', '#8A5A44', '#5B7F2B', '#C05B2C']

export function planColors(plan: WeekPlan | undefined): Record<string, string> {
  const ids: string[] = []
  for (const d of plan?.days ?? []) for (const id of [d.dinner.main, d.dinner.side]) if (id && !ids.includes(id)) ids.push(id)
  return Object.fromEntries(ids.map((id, i) => [id, DISH_PALETTE[i % DISH_PALETTE.length]]))
}

export function withColors(recipes: Record<string, Recipe>, colors: Record<string, string>) {
  const out = { ...recipes }
  for (const [id, c] of Object.entries(colors)) if (out[id]) out[id] = { ...out[id], color: c }
  return out
}
