import { useMemo } from 'react'
import { planCooking } from '../engine/cookPlanner'
import { computeTargets, dayStatus } from '../engine/health'
import { batchInputs, buildShopping, planCost, planIssues, requirements } from '../engine/planMath'
import { addDays, today, weekStartOf } from '../lib/date'
import { useStore } from './useStore'

export function useTargets() {
  const profile = useStore((s) => s.profile)
  return useMemo(() => computeTargets(profile), [profile])
}

export function useWeekRange() {
  const batchDay = useStore((s) => s.profile.batchDay)
  const plan = useStore((s) => s.plan)
  const start = plan?.weekStart ?? weekStartOf(today(), batchDay)
  return { start, end: addDays(start, 6) }
}

export function useWeekSpend() {
  const expenses = useStore((s) => s.expenses)
  const { start, end } = useWeekRange()
  return useMemo(() => {
    const inWeek = expenses.filter((e) => e.date >= start && e.date <= end)
    return {
      grocery: inWeek.filter((e) => e.category === 'grocery').reduce((a, e) => a + e.amount, 0),
      lunch: inWeek.filter((e) => e.category === 'lunch').reduce((a, e) => a + e.amount, 0),
      lunchCount: inWeek.filter((e) => e.category === 'lunch').length,
    }
  }, [expenses, start, end])
}

/** 献立から導出される値（下書きでも試算する） */
export function usePlanDerived() {
  const plan = useStore((s) => s.plan)
  const recipes = useStore((s) => s.recipes)
  const inventory = useStore((s) => s.inventory)
  const shopping = useStore((s) => s.shopping)
  const tools = useStore((s) => s.tools)
  const maxRepeat = useStore((s) => s.profile.maxRepeatDays)
  return useMemo(() => {
    if (!plan) return null
    const reqs = requirements(plan, recipes)
    const list = plan.status === 'confirmed' ? shopping : buildShopping(reqs, inventory)
    const inputs = plan.cookedSessionId ? [] : batchInputs(plan, recipes)
    const cook = planCooking({ recipes: inputs, tools })
    return { reqs, list, cost: planCost(list), issues: planIssues(plan, recipes, maxRepeat), inputs, cook }
  }, [plan, recipes, inventory, shopping, tools, maxRepeat])
}

export function useDayStatus(date: string) {
  const meals = useStore((s) => s.meals)
  const expect = useStore((s) => s.profile.expectBreakfast)
  return useMemo(() => dayStatus(meals, date, expect), [meals, date, expect])
}
