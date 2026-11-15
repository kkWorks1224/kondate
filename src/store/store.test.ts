import { beforeEach, describe, expect, it } from 'vitest'
import { setToday } from '../lib/date'
setToday('2026-11-15')
const { useStore } = await import('./useStore')
const S = () => useStore.getState()

beforeEach(() => S().reset())

describe('ケース1：献立変更で再計算', () => {
  it('料理を差し替えると必要食材・買い物・工程が変わる', () => {
    S().confirmPlan()
    const before = S().shopping.map((i) => i.ingredientId).sort().join()
    S().setDish(2, 'main', 'yakizakana')
    S().setDish(3, 'main', 'yakizakana')
    const after = S().shopping.map((i) => i.ingredientId).sort().join()
    expect(after).not.toBe(before)
    expect(S().shopping.some((i) => i.ingredientId === 'mackerel')).toBe(true)
  })
})

describe('ケース2：購入の記録（二重計上なし）', () => {
  it('購入済みで支出と在庫が1回だけ増え、取り消しで戻る', () => {
    S().confirmPlan()
    const item = S().shopping[0]
    const inv0 = S().inventory.length
    S().setPurchased(item.id, true)
    S().setPurchased(item.id, true) // 二重操作
    expect(S().expenses.filter((e) => e.sourceId === item.id)).toHaveLength(1)
    expect(S().inventory.filter((l) => l.sourceId === item.id)).toHaveLength(1)
    expect(S().inventory.length).toBe(inv0 + 1)
    expect(S().shopping.find((i) => i.id === item.id)?.purchased).toBe(true)
    S().setPrice(item.id, 999)
    expect(S().expenses.find((e) => e.sourceId === item.id)?.amount).toBe(999)
    S().setPurchased(item.id, false)
    expect(S().expenses.filter((e) => e.sourceId === item.id)).toHaveLength(0)
    expect(S().inventory.length).toBe(inv0)
  })
})

describe('ケース3：一括調理の完了', () => {
  it('在庫が減り、作り置きが増え、履歴が残る。2回目は拒否', () => {
    S().confirmPlan()
    for (const i of S().shopping) S().setPurchased(i.id, true)
    const totalBefore = S().inventory.reduce((a, l) => a + l.quantity, 0)
    expect(S().prepareSession().ok).toBe(true)
    S().startSession()
    for (const t of S().session!.result.tasks) S().setTask(t.id, 'done')
    const r = S().finishSession()
    expect(r.ok).toBe(true)
    expect(S().cookHistory).toHaveLength(1)
    expect(S().cookHistory[0].shortages).toEqual([])
    expect(S().inventory.reduce((a, l) => a + l.quantity, 0)).toBeLessThan(totalBefore)
    const made = S().prepared.filter((p) => p.sessionId === S().session!.id)
    expect(made.reduce((a, p) => a + p.servings, 0)).toBe(S().session!.result.servings.reduce((a, s) => a + s.servings, 0))
    expect(S().finishSession().ok).toBe(false)
    // 調理後は買い物リストにまとめ調理分が再出現しない
    expect(S().shopping.filter((i) => !i.purchased).every((i) => i.usedBy.every((id) => S().plan!.days.some((d) => d.dinner.mode === 'fresh' && (d.dinner.main === id || d.dinner.side === id))))).toBe(true)
  })
})

describe('ケース4：作り置きを食べる', () => {
  it('作り置きが減り、食事・栄養に反映。取り消しで戻る', () => {
    const dish = S().prepared.find((p) => p.servings > 0)!
    const n = dish.servings
    expect(S().eatPrepared(dish.id, 'dinner').ok).toBe(true)
    expect(S().prepared.find((p) => p.id === dish.id)!.servings).toBe(n - 1)
    const meal = S().meals.at(-1)!
    expect(meal.nutrients.kcal).toBeGreaterThan(0)
    S().deleteMeal(meal.id)
    expect(S().prepared.find((p) => p.id === dish.id)!.servings).toBe(n)
  })
})

describe('ケース5：昼食の記録', () => {
  it('昼食費と栄養が更新され、置き換えでも二重計上しない', () => {
    const t = '2026-11-15'
    expect(S().recordLunch(['p05', 'p22'], t).ok).toBe(true)
    expect(S().recordLunch(['p03'], t)).toEqual({ ok: false, message: 'exists' })
    expect(S().recordLunch(['p03', 'p10'], t, true).ok).toBe(true)
    expect(S().meals.filter((m) => m.date === t && m.slot === 'lunch')).toHaveLength(1)
    const exp = S().expenses.filter((e) => e.date === t && e.category === 'lunch')
    expect(exp).toHaveLength(1)
    expect(exp[0].amount).toBe(162 + 248)
  })
})

describe('器具・衛生・在庫不足', () => {
  it('器具を0にするとエラーを出しつつ計画は成立', () => {
    S().confirmPlan()
    S().updateTool('pot_large', { quantity: 0 })
    expect(S().prepareSession().ok).toBe(true)
    expect(S().session!.result.warnings.some((w) => w.level === 'error' && w.message.includes('両手鍋'))).toBe(true)
  })
  it('在庫不足のまま調理を完了すると不足が記録される', () => {
    S().confirmPlan()
    S().prepareSession()
    const r = S().finishSession()
    expect(r.ok).toBe(true)
    expect(S().cookHistory[0].shortages.length).toBeGreaterThan(0)
  })
})
