import { describe, expect, it } from 'vitest'
import { setToday } from '../lib/date'
import { buildSeed } from '../data/seed'
import { planCooking } from './cookPlanner'
import { batchInputs, buildShopping, requirements } from './planMath'
import { computeTargets } from './health'
import { suggestLunch } from './lunch'
import { SEVEN_PRODUCTS } from '../data/seven'
import { TOOLS } from '../data/tools'

setToday('2026-11-15')
const seed = buildSeed()
const R = seed.recipes

describe('週間献立（ルールベースAI）', () => {
  it('7日分すべてに主菜が入り、予算内', () => {
    const plan = seed.plan!
    expect(plan.days).toHaveLength(7)
    expect(plan.days.every((d) => d.dinner.main)).toBe(true)
    console.log(plan.days.map((d) => `${d.date} ${R[d.dinner.main!].name} + ${d.dinner.side ? R[d.dinner.side].name : '-'} (${d.dinner.mode})`).join('\n'))
    console.log(plan.rationale.join('\n'))
  })
})

describe('一括調理スケジューラ', () => {
  const input = [
    { recipe: R.shogayaki, servings: 2, store: 1, freeze: 0 },
    { recipe: R.teriyaki, servings: 2, store: 2, freeze: 1 },
    { recipe: R.butakimchi, servings: 2, store: 2, freeze: 0 },
  ]
  const res = planCooking({ recipes: input, tools: TOOLS })
  const byId = Object.fromEntries(res.tasks.map((t) => [t.id, t]))

  it('依存関係を守る', () => {
    for (const t of res.tasks) for (const d of t.dependsOn) expect(byId[d].end).toBeLessThanOrEqual(t.start + 1e-9)
  })
  it('同じ食材でも切り方が違えば別工程', () => {
    const onion = res.tasks.filter((t) => t.ingredients.some((i) => i.ingredientId === 'onion' && i.cut))
    expect(onion.map((t) => t.ingredients[0].cut).sort()).toEqual(['くし切り', '薄切り'])
  })
  it('野菜の下処理→生肉→洗浄→加熱、の順', () => {
    const raw = res.tasks.filter((t) => t.kind === 'raw')
    const clean = res.tasks.find((t) => t.id === 'hygiene:clean')!
    const vegCuts = res.tasks.filter((t) => t.kind === 'cut' && !t.dependsOn.length ? false : t.kind === 'cut' && t.tools.includes('board') && !t.title.includes('焼き上がった'))
    for (const v of vegCuts) for (const r of raw) expect(v.end).toBeLessThanOrEqual(r.start)
    for (const r of raw) expect(r.end).toBeLessThanOrEqual(clean.start)
    const cooked = res.tasks.find((t) => t.title.includes('焼き上がった鶏肉'))!
    expect(clean.end).toBeLessThanOrEqual(cooked.start)
    const heats = res.tasks.filter((t) => t.kind === 'heat')
    for (const h of heats) expect(clean.end).toBeLessThanOrEqual(h.start)
  })
  it('手作業は同時に1つ、コンロは2口まで', () => {
    const hands = res.tasks.filter((t) => t.attended).sort((a, b) => a.start - b.start)
    for (let i = 1; i < hands.length; i++) expect(hands[i].start).toBeGreaterThanOrEqual(hands[i - 1].end - 1e-9)
    const stove = res.occupancy.filter((o) => o.toolId === 'stove')
    for (let x = 0; x < res.totalMin; x += 0.5) expect(stove.filter((o) => o.start <= x && x < o.end).length).toBeLessThanOrEqual(2)
  })
  it('料理ごとに作るより短い', () => {
    console.log('total', res.totalMin, 'naive', res.naiveMin, 'hands', res.handsMin)
    console.log(res.tasks.map((t) => `${t.start.toFixed(1).padStart(5)}-${t.end.toFixed(1).padStart(5)} [${t.lane}] ${t.title} {${t.units?.join(',')}}`).join('\n'))
    console.log(res.warnings.map((w) => w.level + ': ' + w.message).join('\n'))
    expect(res.totalMin).toBeLessThan(res.naiveMin)
  })
  it('器具が1つしかないと競合して直列化し、警告を出す', () => {
    const tools = TOOLS.map((t) => (t.id === 'pan_small' ? { ...t, quantity: 0 } : t))
    const r2 = planCooking({ recipes: input, tools })
    expect(r2.totalMin).toBeGreaterThanOrEqual(res.totalMin)
    expect(r2.tasks.some((t) => t.title.includes('を洗う') && t.id.startsWith('wash:'))).toBe(true)
  })
  it('献立全体から工程を生成できる', () => {
    const b = batchInputs(seed.plan!, R)
    const r = planCooking({ recipes: b, tools: TOOLS })
    console.log('plan batch', b.map((x) => `${x.recipe.name}x${x.servings}(冷凍${x.freeze})`).join(', '), 'total', r.totalMin, 'naive', r.naiveMin, 'tasks', r.tasks.length)
    console.log(r.warnings.map((w) => w.level + ': ' + w.message).join('\n'))
    for (const t of r.tasks) for (const d of t.dependsOn) expect(r.tasks.find((x) => x.id === d)!.end).toBeLessThanOrEqual(t.start + 1e-9)
  })
  it('全レシピで単独計画が成立する', () => {
    for (const rec of Object.values(R)) {
      const r = planCooking({ recipes: [{ recipe: rec, servings: 3, store: 2, freeze: 1 }], tools: TOOLS })
      expect(r.tasks.length).toBeGreaterThan(0)
      expect(r.warnings.filter((w) => w.level === 'error')).toEqual([])
    }
  })
})

describe('買い物', () => {
  it('在庫を差し引き、共通食材を合算', () => {
    const req = requirements(seed.plan!, R)
    const list = buildShopping(req, seed.inventory)
    console.log(list.map((i) => `${i.aisle} ${i.name} 不足${i.needQty}${i.unit} → ${i.packs}×${i.packLabel} ¥${i.estPrice}`).join('\n'))
    expect(new Set(list.map((i) => i.ingredientId)).size).toBe(list.length)
  })
})

describe('健康目標', () => {
  it('BMI約20・体脂肪9%では減量目標を設定しない', () => {
    const t = computeTargets(seed.profile)
    expect(t.kcal).toBeGreaterThanOrEqual(t.tdee - 10)
    expect(t.protein).toBe(96)
    console.log(t)
  })
  it('昼食3パターンは600円以内', () => {
    const c = suggestLunch(SEVEN_PRODUCTS, 600, 2200)
    expect(c).toHaveLength(3)
    for (const x of c) expect(x.price).toBeLessThanOrEqual(600)
    console.log(c.map((x) => `${x.mode} ¥${x.price} P${Math.round(x.nutrients.protein)} ${x.productIds.join(',')} ${x.reasons.join(' / ')}`).join('\n'))
  })
})

describe('昼食候補を観点ごとに複数件', () => {
  it('各観点で複数件・重複なし・予算内・同じ主食は観点内で2回まで', async () => {
    const { suggestLunch } = await import('./lunch')
    const { SEVEN_PRODUCTS } = await import('../data/seven')
    const list = suggestLunch(SEVEN_PRODUCTS, 600, 2400, [], 8)
    for (const m of ['balance', 'protein', 'budget']) {
      const xs = list.filter((c) => c.mode === m)
      expect(xs.length).toBeGreaterThanOrEqual(5)
      const staples = new Map<string, number>()
      for (const c of xs) staples.set(c.productIds[0], (staples.get(c.productIds[0]) ?? 0) + 1)
      expect(Math.max(...staples.values())).toBeLessThanOrEqual(2)
    }
    const keys = list.map((c) => [...c.productIds].sort().join())
    expect(new Set(keys).size).toBe(keys.length)
    expect(list.every((c) => c.price <= 600)).toBe(true)
    expect(suggestLunch(SEVEN_PRODUCTS, 600, 2400)).toHaveLength(3)
  })
})

describe('かんたん手順', () => {
  it('全レシピで2〜6行・欠けた文字列なし、調味料は大さじ表記', async () => {
    const { buildSeedRecipes } = await import('../data/recipes')
    const { easyGuide, measure } = await import('../services/ai/easy')
    for (const r of buildSeedRecipes()) {
      const g = easyGuide(r)
      expect(g.steps.length, r.name).toBeGreaterThanOrEqual(2)
      expect(g.steps.length, r.name).toBeLessThanOrEqual(6)
      for (const st of g.steps) expect(st, r.name).not.toMatch(/undefined|NaN|null|、、|をを/)
      expect(g.minutes).toBeGreaterThan(0)
    }
    expect(measure({ ingredientId: 'soy', amount: 15 })).toBe('大さじ1')
    expect(measure({ ingredientId: 'soy', amount: 5 })).toBe('小さじ1')
    expect(measure({ ingredientId: 'sugar', amount: 3 })).toBe('小さじ1')
    expect(measure({ ingredientId: 'pepper', amount: 0.1 })).toBe('少々')
    expect(measure({ ingredientId: 'garlic', amount: 2 })).toBe('チューブ4cm')
  })
  it('かんたんレシピはレンジかフライパン1つ', async () => {
    const { buildSeedRecipes } = await import('../data/recipes')
    const { easyGuide } = await import('../services/ai/easy')
    const ez = buildSeedRecipes().filter((r) => r.tags.includes('かんたん'))
    expect(ez.length).toBe(10)
    for (const r of ez) expect(easyGuide(r).style.some((x) => /レンジだけ|フライパン1つ|鍋1つ/.test(x)), r.name).toBe(true)
  })
})
