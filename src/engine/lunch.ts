import type { LunchCombo, Nutrients, SevenProduct } from '../types'
import { ZERO } from './nutrition'

export type LunchMode = 'balance' | 'protein' | 'budget'
export const MODE_LABEL: Record<LunchMode, string> = { balance: 'バランス重視', protein: '高たんぱく重視', budget: '節約重視' }

const WEIGHTS: Record<LunchMode, [number, number, number]> = {
  balance: [0.45, 0.3, 0.25],
  protein: [0.25, 0.55, 0.2],
  budget: [0.25, 0.2, 0.55],
}

export function comboNutrients(ps: SevenProduct[]): Nutrients {
  const n = { ...ZERO }
  for (const p of ps) {
    n.kcal += p.nutrients.kcal
    n.protein += p.nutrients.protein
    n.fat += p.nutrients.fat
    n.carbs += p.nutrients.carbs
    n.fiber += p.nutrients.fiber
    n.salt += p.nutrients.salt
    n.vegG += p.nutrients.vegG ?? 0
  }
  return n
}

export function scoreCombo(ps: SevenProduct[], budget: number, targetKcal: number) {
  const n = comboNutrients(ps)
  const price = ps.reduce((a, p) => a + p.price, 0)
  // 健康：エネルギーが1日の約30%前後、塩分・脂質控えめ、食物繊維と野菜
  const kcalTarget = targetKcal * 0.3
  const kcalFit = 1 - Math.min(1, Math.abs(n.kcal - kcalTarget) / kcalTarget)
  const salt = 1 - Math.min(1, Math.max(0, n.salt - 2.5) / 2.5)
  const fatRatio = (n.fat * 9) / Math.max(1, n.kcal)
  const fat = 1 - Math.min(1, Math.max(0, fatRatio - 0.3) / 0.2)
  const fiber = Math.min(1, n.fiber / 7)
  const veg = Math.min(1, n.vegG / 120)
  const health = 0.3 * kcalFit + 0.2 * salt + 0.15 * fat + 0.15 * fiber + 0.2 * veg
  // 筋肉維持：たんぱく質30g以上、エネルギー不足を避ける
  const muscle = 0.75 * Math.min(1, n.protein / 30) + 0.25 * Math.min(1, n.kcal / (kcalTarget * 0.8))
  // 節約：予算に対する安さ
  const budgetScore = Math.max(0, 1 - price / budget) * 1.4 + (price <= budget ? 0.3 : 0)
  return { n, price, health: round(health), muscle: round(muscle), budget: round(Math.min(1, budgetScore)) }
}

const round = (x: number) => Math.round(x * 100) / 100

function reasonsFor(ps: SevenProduct[], s: ReturnType<typeof scoreCombo>, budget: number) {
  const r: string[] = []
  if (s.n.protein >= 30) r.push(`たんぱく質${Math.round(s.n.protein)}gで筋肉の維持に十分`)
  else if (s.n.protein >= 20) r.push(`たんぱく質${Math.round(s.n.protein)}g`)
  if (s.n.vegG >= 100) r.push(`野菜 約${Math.round(s.n.vegG)}g`)
  if (s.n.fiber >= 6) r.push(`食物繊維${s.n.fiber.toFixed(1)}g`)
  if (s.n.salt <= 2.5) r.push(`塩分${s.n.salt.toFixed(1)}gと控えめ`)
  else if (s.n.salt > 3.5) r.push(`塩分${s.n.salt.toFixed(1)}gはやや多め。夕食で調整`)
  r.push(`¥${s.price}（予算まであと¥${budget - s.price}）`)
  if (ps.some((p) => p.category === 'おにぎり' && p.name.includes('もち麦'))) r.push('もち麦で糖質の吸収が緩やか')
  return r
}

/** 予算内で昼食として成立する組み合わせ（主食1＋おかず/野菜/汁物/飲料から最大2）を全探索 */
/**
 * 観点（バランス・高たんぱく・節約）ごとに上位 perMode 件を返す（観点の順に並ぶ）。
 * 同じ組み合わせは観点をまたいでも1回だけ。同じ主食は1つの観点で2回までにして、候補に幅を持たせる。
 */
export function suggestLunch(products: SevenProduct[], budget: number, targetKcal: number, exclude: string[] = [], perMode = 1): LunchCombo[] {
  const pool = products.filter((p) => !exclude.includes(p.id))
  const staples = pool.filter((p) => p.role === 'staple')
  const others = pool.filter((p) => p.role !== 'staple')
  const combos: SevenProduct[][] = []
  for (const s of staples) {
    combos.push([s])
    for (let i = 0; i < others.length; i++) {
      combos.push([s, others[i]])
      for (let j = i + 1; j < others.length; j++) {
        if (others[i].role === others[j].role && others[i].role !== 'protein') continue
        combos.push([s, others[i], others[j]])
      }
    }
  }
  const valid = combos.filter((c) => c.reduce((a, p) => a + p.price, 0) <= budget)
  const scored = valid.map((c) => ({ c, s: scoreCombo(c, budget, targetKcal) })).filter(({ s }) => s.n.kcal >= targetKcal * 0.2)
  const result: LunchCombo[] = []
  const used = new Set<string>()
  const keyOf = (c: SevenProduct[]) => c.map((p) => p.id).sort().join()
  for (const mode of ['balance', 'protein', 'budget'] as LunchMode[]) {
    const [wh, wm, wb] = WEIGHTS[mode]
    const ranked = scored
      .map((x) => ({ ...x, total: wh * x.s.health + wm * x.s.muscle + wb * x.s.budget }))
      .sort((a, b) => b.total - a.total)
    const staples = new Map<string, number>()
    let picked = 0
    for (const pick of ranked) {
      if (picked >= perMode) break
      const key = keyOf(pick.c)
      const staple = pick.c[0].id
      if (used.has(key) || (staples.get(staple) ?? 0) >= 2) continue
      used.add(key)
      staples.set(staple, (staples.get(staple) ?? 0) + 1)
      picked++
      result.push({
        id: `${mode}-${pick.c.map((p) => p.id).join('-')}`, mode, productIds: pick.c.map((p) => p.id), price: pick.s.price, nutrients: pick.s.n,
        scores: { health: pick.s.health, muscle: pick.s.muscle, budget: pick.s.budget, total: round(pick.total) }, reasons: reasonsFor(pick.c, pick.s, budget),
      })
    }
  }
  return result
}
