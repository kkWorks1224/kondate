import { beforeEach, describe, expect, it } from 'vitest'
import { applyOps, mentionedDays, parseInstruction, sanitizeOps } from './planEdit'
import { buildSeed } from '../data/seed'
import { setToday } from '../lib/date'
import { batchInputs } from './planMath'
import type { WeekPlan } from '../types'

// 2026-11-15（日）が作り置き日。献立は 日〜土
setToday('2026-11-15')
let plan: WeekPlan
let recipes: ReturnType<typeof buildSeed>['recipes']
beforeEach(() => {
  const s = buildSeed()
  plan = s.plan!
  recipes = s.recipes
})
const T = '2026-11-15'
const wdIndex = (w: string) => plan.days.findIndex((d) => '日月火水木金土'[new Date(d.date + 'T00:00:00').getDay()] === w)

describe('文章の指示 → 操作（ルール）', () => {
  it('曜日の拾い方（「今日」の日を曜日と誤認しない）', () => {
    expect(mentionedDays('火曜日は不要', plan, T)).toEqual([wdIndex('火')])
    expect(mentionedDays('水と金は外食', plan, T)).toEqual([wdIndex('水'), wdIndex('金')].sort())
    expect(mentionedDays('今日はいらない', plan, T)).toEqual([0])
    expect(mentionedDays('平日', plan, T)).toHaveLength(5)
  })
  it('不要・外食・N日分だけ・戻す・当日調理', () => {
    expect(parseInstruction('火曜日の分は不要', plan, T)?.ops).toEqual([{ op: 'skip', days: [wdIndex('火')], note: '不要' }])
    expect(parseInstruction('木曜は飲み会', plan, T)?.ops).toEqual([{ op: 'skip', days: [wdIndex('木')], note: '飲み会' }])
    expect(parseInstruction('今週は3日分だけでいい', plan, T)?.ops).toEqual([{ op: 'keepDays', count: 3 }])
    expect(parseInstruction('火曜はやっぱり作る', plan, T)?.ops).toEqual([{ op: 'unskip', days: [wdIndex('火')] }])
    expect(parseInstruction('土曜は当日調理で', plan, T)?.ops[0]).toMatchObject({ op: 'mode', mode: 'fresh' })
    expect(parseInstruction('全部レンジで作れるものにして', plan, T)).toBe(null) // ルールでは扱えない→AI へ
  })
})

describe('操作の適用', () => {
  it('不要にした日は作り置きと買い物から外れ、戻すと元の料理に戻る', () => {
    const tue = wdIndex('火')
    const before = batchInputs(plan, recipes).reduce((a, b) => a + b.servings, 0)
    const { plan: p1, changes } = applyOps(plan, [{ op: 'skip', days: [tue], note: '外食' }], recipes)
    expect(p1.days[tue].dinner).toMatchObject({ skip: true, note: '外食', main: undefined })
    expect(changes[0]).toMatch(/なし（外食）/)
    const after = batchInputs(p1, recipes).reduce((a, b) => a + b.servings, 0)
    expect(after).toBeLessThan(before)
    const { plan: p2 } = applyOps(p1, [{ op: 'unskip', days: [tue] }], recipes)
    expect(p2.days[tue].dinner.main).toBe(plan.days[tue].dinner.main)
    expect(plan.days[tue].dinner.skip).toBeFalsy() // 元の献立は変更しない
  })
  it('3日分だけ → 4日目以降はなし', () => {
    const { plan: p } = applyOps(plan, [{ op: 'keepDays', count: 3 }], recipes)
    expect(p.days.slice(0, 3).every((d) => !d.dinner.skip)).toBe(true)
    expect(p.days.slice(3).every((d) => d.dinner.skip)).toBe(true)
  })
  it('AI の出力は検証してから使う（存在しない料理・種類違い・範囲外は捨てる）', () => {
    const side = Object.values(recipes).find((r) => r.role === 'side')!.id
    const main = Object.values(recipes).find((r) => r.role === 'main')!.id
    const ops = sanitizeOps([
      { op: 'set', day: 1, slot: 'main', recipeId: main },
      { op: 'set', day: 1, slot: 'main', recipeId: side },
      { op: 'set', day: 9, slot: 'main', recipeId: main },
      { op: 'set', day: 2, slot: 'main', recipeId: 'nope' },
      { op: 'skip', days: [8, 2, 2] },
      { op: 'rm -rf' },
    ], recipes)
    expect(ops).toEqual([{ op: 'set', day: 1, slot: 'main', recipeId: main }, { op: 'skip', days: [2], note: '不要' }])
  })
})
