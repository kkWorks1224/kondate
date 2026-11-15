// アプリ全体の状態とユースケース（連動ロジック）
// UI はここのアクションを呼ぶだけで、在庫・支出・作り置き・記録が一貫して更新される。
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { INGREDIENT_MAP } from '../data/ingredients'
import { buildSeed, BREAKFAST_PRESETS, presetNutrition } from '../data/seed'
import { SEVEN_MAP } from '../data/seven'
import { planCooking } from '../engine/cookPlanner'
import { comboNutrients } from '../engine/lunch'
import { recipeNutrition, sum } from '../engine/nutrition'
import { batchInputs, buildShopping, dishUses, requirements } from '../engine/planMath'
import { addDays, diffDays, today, weekStartOf } from '../lib/date'
import { uid } from '../lib/format'
import { ai } from '../services/ai'
import { localStorageAdapter, STORAGE_KEY } from '../services/storage'
import type {
  CookHistory, CookMode, CookSession, Expense, HealthLog, InventoryLot, MealLog, MealSlot, PreparedDish, Profile, Recipe, ShoppingItem, StorageLoc, Tool, WeekPlan,
} from '../types'

export interface LunchFavorite {
  key: string
  productIds: string[]
}

export interface AppData {
  schema: number
  profile: Profile
  recipes: Record<string, Recipe>
  tools: Tool[]
  inventory: InventoryLot[]
  prepared: PreparedDish[]
  plan?: WeekPlan
  shopping: ShoppingItem[]
  expenses: Expense[]
  session?: CookSession
  cookHistory: CookHistory[]
  meals: (MealLog & { consumed?: { preparedId: string; servings: number }[] })[]
  health: HealthLog[]
  lunchFavorites: LunchFavorite[]
  aiGeneration: number
}

type Result = { ok: true; message?: string } | { ok: false; message: string }

interface Actions {
  reset: () => void
  // 献立
  proposePlan: () => Promise<Result>
  setDish: (dayIndex: number, slot: 'main' | 'side', recipeId?: string) => void
  setMode: (dayIndex: number, mode: CookMode) => void
  reorderDays: (order: number[]) => void
  confirmPlan: () => void
  reopenPlan: () => void
  // レシピ
  saveRecipe: (r: Recipe) => void
  toggleRecipeFlag: (id: string, flag: 'starred' | 'canMake') => void
  generateRecipe: (name: string) => Promise<Result & { id?: string }>
  deleteRecipe: (id: string) => Result
  // 器具
  updateTool: (id: string, patch: Partial<Tool>) => void
  // 在庫
  upsertLot: (lot: InventoryLot) => void
  removeLot: (id: string) => void
  // 買い物
  setPurchased: (itemId: string, purchased: boolean) => void
  setPrice: (itemId: string, price: number | undefined) => void
  addManualItem: (name: string, price?: number) => void
  removeItem: (itemId: string) => void
  // 調理
  prepareSession: () => Result
  startSession: () => void
  setTask: (taskId: string, state: 'done' | 'skipped' | 'todo') => void
  startTimer: (taskId: string) => void
  pauseSession: () => void
  resumeSession: () => void
  finishSession: () => Result
  discardSession: () => void
  // 食事
  eatDinner: (date: string) => Result
  eatPrepared: (dishId: string, slot: MealSlot) => Result
  recordLunch: (productIds: string[], date: string, replace?: boolean) => Result
  recordBreakfast: (presetId: string | 'skip', date: string) => Result
  deleteMeal: (id: string) => void
  restoreMeal: (meal: AppData['meals'][number], expense?: Expense) => void
  toggleLunchFavorite: (productIds: string[]) => void
  discardPrepared: (id: string) => void
  // ライフログ
  upsertHealth: (log: HealthLog) => void
  updateProfile: (p: Partial<Profile>) => void
}

export type Store = AppData & Actions

function initial(): AppData {
  const s = buildSeed()
  return { schema: 1, ...s, shopping: [], session: undefined, cookHistory: [], lunchFavorites: [{ key: 'p05|p22', productIds: ['p05', 'p22'] }], aiGeneration: 1 }
}

/** 献立・在庫の変更後に買い物リストを再計算（購入済みは保持） */
function recalc(s: AppData): Pick<AppData, 'shopping'> {
  if (!s.plan || s.plan.status !== 'confirmed') return { shopping: s.shopping.filter((i) => i.purchased || i.manual) }
  return { shopping: buildShopping(requirements(s.plan, s.recipes), s.inventory, s.shopping) }
}

/** 在庫を古い順（期限が近い順）に減らす。減らした内訳と不足を返す */
function deduct(inv: InventoryLot[], ingredientId: string, amount: number) {
  const lots = inv.filter((l) => l.ingredientId === ingredientId).sort((a, b) => (a.expiresOn ?? '9999').localeCompare(b.expiresOn ?? '9999'))
  let rest = amount
  const touched = new Map<string, number>()
  for (const l of lots) {
    if (rest <= 0) break
    const take = Math.min(l.quantity, rest)
    touched.set(l.id, l.quantity - take)
    rest -= take
  }
  const next = inv.map((l) => (touched.has(l.id) ? { ...l, quantity: Math.round(touched.get(l.id)! * 100) / 100 } : l)).filter((l) => l.quantity > 0.001)
  return { next, shortage: Math.max(0, rest) }
}

function mealFromRecipes(date: string, slot: MealSlot, rs: Recipe[], consumed: { preparedId: string; servings: number }[]): AppData['meals'][number] {
  return {
    id: uid('meal'), date, slot, label: rs.map((r) => r.name).join('・'),
    items: rs.map((r) => ({ name: r.name, refId: r.id, kind: 'recipe' as const })),
    nutrients: sum(rs.map(recipeNutrition)), basis: 'estimated-ingredients', consumed,
  }
}

export const useStore = create<Store>()(
  persist(
    (set, get) => ({
      ...initial(),

      reset: () => {
        set({ ...initial() }, false)
      },

      /* ---------- 献立 ---------- */
      proposePlan: async () => {
        const s = get()
        try {
          const t = today()
          const weekStart = weekStartOf(t, s.profile.batchDay)
          const plan = await ai.proposeWeekPlan({ recipes: Object.values(s.recipes), inventory: s.inventory, profile: s.profile, weekStart, history: s.meals, generation: s.aiGeneration, today: t })
          set((st) => ({ plan, aiGeneration: st.aiGeneration + 1, session: st.session?.status === 'done' ? undefined : st.session }))
          set((st) => recalc(st))
          return { ok: true }
        } catch (e) {
          return { ok: false, message: e instanceof Error ? e.message : '献立の提案に失敗しました' }
        }
      },
      setDish: (i, slot, recipeId) =>
        set((s) => {
          if (!s.plan) return s
          const days = s.plan.days.map((d, idx) => {
            if (idx !== i) return d
            // 作り置き調理後に変更した日は当日調理として扱う
            const mode: CookMode = s.plan!.cookedSessionId ? 'fresh' : d.dinner.mode
            return { ...d, dinner: { ...d.dinner, [slot]: recipeId, mode } }
          })
          const plan = { ...s.plan, days, generatedBy: 'manual' as const }
          return { plan, ...recalc({ ...s, plan }) }
        }),
      setMode: (i, mode) =>
        set((s) => {
          if (!s.plan) return s
          const plan = { ...s.plan, days: s.plan.days.map((d, idx) => (idx === i ? { ...d, dinner: { ...d.dinner, mode } } : d)) }
          return { plan, ...recalc({ ...s, plan }) }
        }),
      reorderDays: (order) =>
        set((s) => {
          if (!s.plan) return s
          const dinners = order.map((i) => s.plan!.days[i].dinner)
          const plan = { ...s.plan, days: s.plan.days.map((d, i) => ({ ...d, dinner: dinners[i] })) }
          return { plan, ...recalc({ ...s, plan }) }
        }),
      confirmPlan: () =>
        set((s) => {
          if (!s.plan) return s
          const plan: WeekPlan = { ...s.plan, status: 'confirmed', confirmedAt: new Date().toISOString() }
          return { plan, ...recalc({ ...s, plan }) }
        }),
      reopenPlan: () =>
        set((s) => {
          if (!s.plan) return s
          const plan: WeekPlan = { ...s.plan, status: 'draft' }
          return { plan, ...recalc({ ...s, plan }) }
        }),

      /* ---------- レシピ ---------- */
      saveRecipe: (r) =>
        set((s) => {
          const recipes = { ...s.recipes, [r.id]: { ...r, updatedAt: new Date().toISOString(), needsReview: false } }
          return { recipes, ...recalc({ ...s, recipes }) }
        }),
      toggleRecipeFlag: (id, flag) =>
        set((s) => ({ recipes: { ...s.recipes, [id]: { ...s.recipes[id], [flag]: !s.recipes[id][flag] } } })),
      generateRecipe: async (name) => {
        const s = get()
        try {
          const r = await ai.generateRecipe(name.trim(), Object.keys(s.recipes).length)
          set((st) => ({ recipes: { ...st.recipes, [r.id]: r } }))
          return { ok: true, id: r.id, message: r.needsReview ? '下書きを作成しました。材料と工程を確認してください' : 'レシピを作成しました' }
        } catch {
          return { ok: false, message: 'レシピを作成できませんでした' }
        }
      },
      deleteRecipe: (id) => {
        const s = get()
        if (s.plan?.days.some((d) => d.dinner.main === id || d.dinner.side === id)) return { ok: false, message: '献立で使われているため削除できません' }
        const recipes = { ...s.recipes }
        delete recipes[id]
        set({ recipes })
        return { ok: true }
      },

      /* ---------- 器具 ---------- */
      updateTool: (id, patch) => set((s) => ({ tools: s.tools.map((t) => (t.id === id ? { ...t, ...patch } : t)) })),

      /* ---------- 在庫 ---------- */
      upsertLot: (lot) =>
        set((s) => {
          const exists = s.inventory.some((l) => l.id === lot.id)
          const inventory = exists ? s.inventory.map((l) => (l.id === lot.id ? lot : l)) : [...s.inventory, lot]
          return { inventory, ...recalc({ ...s, inventory }) }
        }),
      removeLot: (id) =>
        set((s) => {
          const inventory = s.inventory.filter((l) => l.id !== id)
          return { inventory, ...recalc({ ...s, inventory }) }
        }),

      /* ---------- 買い物 ---------- */
      setPurchased: (itemId, purchased) =>
        set((s) => {
          const item = s.shopping.find((i) => i.id === itemId)
          if (!item || item.purchased === purchased) return s // 二重計上を防ぐ
          const t = today()
          let inventory = s.inventory
          let expenses = s.expenses
          if (purchased) {
            const price = item.actualPrice ?? item.estPrice
            expenses = [...expenses.filter((e) => e.sourceId !== item.id), { id: uid('exp'), date: t, amount: price, category: 'grocery', label: item.name, sourceId: item.id }]
            const ing = item.ingredientId ? INGREDIENT_MAP[item.ingredientId] : undefined
            if (ing) {
              const loc = ing.defaultStorage
              const days = ing.shelfDays[loc] ?? ing.shelfDays.fridge ?? 7
              inventory = [...inventory, { id: uid('lot'), ingredientId: ing.id, quantity: item.packs * ing.pack.size, location: loc, purchasedOn: t, expiresOn: addDays(t, days), verified: true, sourceId: item.id }]
            }
          } else {
            expenses = expenses.filter((e) => e.sourceId !== item.id)
            inventory = inventory.filter((l) => l.sourceId !== item.id)
          }
          const shopping = s.shopping.map((i) => (i.id === itemId ? { ...i, purchased, purchasedAt: purchased ? new Date().toISOString() : undefined } : i))
          const next = { expenses, inventory, shopping }
          return { ...next, ...recalc({ ...s, ...next }) }
        }),
      setPrice: (itemId, price) =>
        set((s) => {
          const shopping = s.shopping.map((i) => (i.id === itemId ? { ...i, actualPrice: price } : i))
          const item = shopping.find((i) => i.id === itemId)
          const expenses = s.expenses.map((e) => (e.sourceId === itemId && item ? { ...e, amount: price ?? item.estPrice } : e))
          return { shopping, expenses }
        }),
      addManualItem: (name, price) =>
        set((s) => ({ shopping: [...s.shopping, { id: uid('shop'), name, aisle: 'その他', needQty: 1, unit: '個', packs: 1, packLabel: '手動追加', estPrice: price ?? 0, purchased: false, usedBy: [], manual: true }] })),
      removeItem: (itemId) =>
        set((s) => {
          const item = s.shopping.find((i) => i.id === itemId)
          if (!item?.manual || item.purchased) return s
          return { shopping: s.shopping.filter((i) => i.id !== itemId) }
        }),

      /* ---------- 調理セッション ---------- */
      prepareSession: () => {
        const s = get()
        if (!s.plan || s.plan.status !== 'confirmed') return { ok: false, message: '先に献立を確定してください' }
        if (s.plan.cookedSessionId) return { ok: false, message: 'この献立の作り置きは調理済みです' }
        const inputs = batchInputs(s.plan, s.recipes)
        if (!inputs.length) return { ok: false, message: 'まとめて作る料理がありません' }
        const result = planCooking({ recipes: inputs, tools: s.tools })
        set({ session: { id: uid('cook'), planId: s.plan.id, createdAt: new Date().toISOString(), status: 'ready', result, progress: {}, timers: {} } })
        return { ok: true }
      },
      startSession: () => set((s) => (s.session ? { session: { ...s.session, status: 'active', startedAt: s.session.startedAt ?? new Date().toISOString() } } : s)),
      setTask: (taskId, state) =>
        set((s) => {
          if (!s.session) return s
          const progress = { ...s.session.progress }
          if (state === 'todo') delete progress[taskId]
          else progress[taskId] = state
          const timers = { ...s.session.timers }
          if (state !== 'todo') delete timers[taskId]
          return { session: { ...s.session, progress, timers, status: s.session.status === 'ready' ? 'active' : s.session.status } }
        }),
      startTimer: (taskId) =>
        set((s) => {
          if (!s.session) return s
          const task = s.session.result.tasks.find((t) => t.id === taskId)
          if (!task) return s
          return { session: { ...s.session, status: 'active', timers: { ...s.session.timers, [taskId]: { endsAt: Date.now() + task.durationMin * 60000 } } } }
        }),
      pauseSession: () =>
        set((s) => {
          if (!s.session) return s
          const now = Date.now()
          const timers = Object.fromEntries(Object.entries(s.session.timers).map(([k, v]) => [k, { remainingMs: v.endsAt ? Math.max(0, v.endsAt - now) : v.remainingMs }]))
          return { session: { ...s.session, status: 'paused', timers } }
        }),
      resumeSession: () =>
        set((s) => {
          if (!s.session) return s
          const now = Date.now()
          const timers = Object.fromEntries(Object.entries(s.session.timers).map(([k, v]) => [k, { endsAt: now + (v.remainingMs ?? 0) }]))
          return { session: { ...s.session, status: 'active', timers } }
        }),
      finishSession: () => {
        const s = get()
        const ses = s.session
        if (!ses || !s.plan) return { ok: false, message: '調理セッションがありません' }
        if (ses.status === 'done' || s.plan.cookedSessionId === ses.id) return { ok: false, message: 'この調理は記録済みです' }
        const t = today()
        let inventory = s.inventory
        const shortages: string[] = []
        for (const { recipeId, servings } of ses.result.servings) {
          const r = s.recipes[recipeId]
          if (!r) continue
          for (const i of r.ingredients) {
            const ing = INGREDIENT_MAP[i.ingredientId]
            if (!ing || ing.staple) continue
            const res = deduct(inventory, i.ingredientId, i.amount * servings)
            inventory = res.next
            if (res.shortage > 0.01) shortages.push(`${ing.name} ${Math.round(res.shortage * 10) / 10}${ing.unit}（${r.name}）`)
          }
        }
        // 完成した料理を作り置きとして登録（冷蔵期限を超える日の分は冷凍）
        const uses = dishUses(s.plan).filter((u) => u.mode === 'batch')
        const prepared: PreparedDish[] = [...s.prepared]
        for (const { recipeId, servings } of ses.result.servings) {
          const r = s.recipes[recipeId]
          const dates = uses.find((u) => u.recipeId === recipeId)?.dates ?? []
          const freezeDates = r.freeze === 'ng' ? [] : dates.filter((d) => diffDays(d, t) > r.fridgeDays)
          const fridgeDates = dates.filter((d) => !freezeDates.includes(d))
          const lots: [StorageLoc, string[]][] = [['fridge', fridgeDates], ['freezer', freezeDates]]
          let left = servings
          for (const [loc, ds] of lots) {
            const n = loc === 'freezer' ? Math.min(left, ds.length) : Math.min(left, Math.max(ds.length, servings - freezeDates.length))
            if (n <= 0) continue
            left -= n
            prepared.push({ id: uid('pd'), recipeId, servings: n, cookedOn: t, location: loc, consumeBy: addDays(t, loc === 'freezer' ? r.freezerDays : r.fridgeDays), plannedFor: ds, sessionId: ses.id, eatenLog: [] })
          }
        }
        const skipped = Object.values(ses.progress).filter((v) => v === 'skipped').length
        const history: CookHistory = { id: uid('ch'), sessionId: ses.id, date: t, recipes: ses.result.servings.map(({ recipeId, servings }) => ({ recipeId, servings })), totalMin: ses.result.totalMin, shortages, skipped }
        const plan = { ...s.plan, cookedSessionId: ses.id }
        const next = { inventory, prepared, plan, session: { ...ses, status: 'done' as const, finishedAt: new Date().toISOString(), timers: {} }, cookHistory: [history, ...s.cookHistory] }
        set({ ...next, ...recalc({ ...s, ...next }) })
        return { ok: true, message: shortages.length ? `完了しました。在庫が足りなかった食材：${shortages.slice(0, 3).join('、')}${shortages.length > 3 ? ' ほか' : ''}` : '完了しました。在庫と作り置きを更新しました' }
      },
      discardSession: () => set((s) => (s.session?.status === 'done' ? s : { session: undefined })),

      /* ---------- 食事 ---------- */
      eatDinner: (date) => {
        const s = get()
        const day = s.plan?.days.find((d) => d.date === date)
        if (!day?.dinner.main) return { ok: false, message: 'この日の献立がありません' }
        if (s.meals.some((m) => m.date === date && m.slot === 'dinner')) return { ok: false, message: '夕食は記録済みです' }
        const ids = [day.dinner.main, day.dinner.side].filter(Boolean) as string[]
        let prepared = s.prepared
        let inventory = s.inventory
        const consumed: { preparedId: string; servings: number }[] = []
        const missing: string[] = []
        for (const id of ids) {
          const stock = prepared.filter((p) => p.recipeId === id && p.servings > 0).sort((a, b) => (a.location === b.location ? a.consumeBy.localeCompare(b.consumeBy) : a.location === 'fridge' ? -1 : 1))[0]
          if (stock) {
            prepared = prepared.map((p) => (p.id === stock.id ? { ...p, servings: p.servings - 1, eatenLog: [...p.eatenLog, { date, servings: 1 }] } : p))
            consumed.push({ preparedId: stock.id, servings: 1 })
          } else if (day.dinner.mode === 'fresh') {
            for (const i of s.recipes[id].ingredients) {
              if (INGREDIENT_MAP[i.ingredientId]?.staple) continue
              inventory = deduct(inventory, i.ingredientId, i.amount).next
            }
          } else missing.push(s.recipes[id].name)
        }
        if (missing.length) return { ok: false, message: `${missing.join('・')}の作り置きがありません。一括調理を完了するか、当日調理に切り替えてください` }
        const meal = mealFromRecipes(date, 'dinner', ids.map((id) => s.recipes[id]), consumed)
        const next = { prepared, inventory, meals: [...s.meals, meal] }
        set({ ...next, ...recalc({ ...s, ...next }) })
        return { ok: true, message: '夕食を記録しました' }
      },
      eatPrepared: (dishId, slot) => {
        const s = get()
        const dish = s.prepared.find((p) => p.id === dishId)
        if (!dish || dish.servings <= 0) return { ok: false, message: '残りがありません' }
        const t = today()
        const prepared = s.prepared.map((p) => (p.id === dishId ? { ...p, servings: p.servings - 1, eatenLog: [...p.eatenLog, { date: t, servings: 1 }] } : p))
        const meal = mealFromRecipes(t, slot, [s.recipes[dish.recipeId]], [{ preparedId: dishId, servings: 1 }])
        set({ prepared, meals: [...s.meals, meal] })
        return { ok: true, message: `${s.recipes[dish.recipeId].name}を記録しました` }
      },
      recordLunch: (productIds, date, replace) => {
        const s = get()
        const ps = productIds.map((id) => SEVEN_MAP[id]).filter(Boolean)
        if (!ps.length) return { ok: false, message: '商品を選んでください' }
        const existing = s.meals.filter((m) => m.date === date && m.slot === 'lunch')
        if (existing.length && !replace) return { ok: false, message: 'exists' }
        const price = ps.reduce((a, p) => a + p.price, 0)
        const id = uid('meal')
        const meal: MealLog = { id, date, slot: 'lunch', label: 'セブン-イレブン', items: ps.map((p) => ({ name: p.name, refId: p.id, kind: 'product' })), nutrients: comboNutrients(ps), basis: 'demo-label', price }
        const ex = new Set(existing.map((m) => m.id))
        set({
          meals: [...s.meals.filter((m) => !ex.has(m.id)), meal],
          expenses: [...s.expenses.filter((e) => !ex.has(e.sourceId)), { id: uid('exp'), date, amount: price, category: 'lunch', label: '昼食（セブン-イレブン）', sourceId: id }],
        })
        return { ok: true, message: `昼食を記録しました（¥${price}）` }
      },
      recordBreakfast: (presetId, date) => {
        const s = get()
        if (s.meals.some((m) => m.date === date && m.slot === 'breakfast')) return { ok: false, message: '朝食は記録済みです' }
        if (presetId === 'skip') {
          set({ meals: [...s.meals, { id: uid('meal'), date, slot: 'breakfast', label: '食べなかった', items: [], nutrients: sum([]), basis: 'user-input', skipped: true }] })
          return { ok: true, message: '朝食なしとして記録しました' }
        }
        const p = BREAKFAST_PRESETS.find((x) => x.id === presetId)
        if (!p) return { ok: false, message: '不明なメニューです' }
        let inventory = s.inventory
        for (const [ingId, amount] of p.items) inventory = deduct(inventory, ingId, amount).next
        const meal: MealLog = { id: uid('meal'), date, slot: 'breakfast', label: p.label, items: [{ name: p.label, kind: 'preset', refId: p.id }], nutrients: { ...presetNutrition(p.items), vegG: 0 }, basis: 'estimated-ingredients' }
        const next = { inventory, meals: [...s.meals, meal] }
        set({ ...next, ...recalc({ ...s, ...next }) })
        return { ok: true, message: `朝食（${p.label}）を記録しました` }
      },
      deleteMeal: (id) =>
        set((s) => {
          const meal = s.meals.find((m) => m.id === id)
          if (!meal) return s
          let prepared = s.prepared
          for (const c of meal.consumed ?? []) {
            prepared = prepared.map((p) => {
              if (p.id !== c.preparedId) return p
              const idx = p.eatenLog.findIndex((e) => e.date === meal.date)
              return { ...p, servings: p.servings + c.servings, eatenLog: p.eatenLog.filter((_, i) => i !== idx) }
            })
          }
          return { meals: s.meals.filter((m) => m.id !== id), expenses: s.expenses.filter((e) => e.sourceId !== id), prepared }
        }),
      restoreMeal: (meal, expense) =>
        set((s) => {
          if (s.meals.some((m) => m.id === meal.id)) return s
          let prepared = s.prepared
          for (const c of meal.consumed ?? []) prepared = prepared.map((p) => (p.id === c.preparedId ? { ...p, servings: Math.max(0, p.servings - c.servings), eatenLog: [...p.eatenLog, { date: meal.date, servings: c.servings }] } : p))
          return { meals: [...s.meals, meal], expenses: expense ? [...s.expenses, expense] : s.expenses, prepared }
        }),
      toggleLunchFavorite: (productIds) =>
        set((s) => {
          const key = [...productIds].sort().join('|')
          return s.lunchFavorites.some((f) => f.key === key) ? { lunchFavorites: s.lunchFavorites.filter((f) => f.key !== key) } : { lunchFavorites: [...s.lunchFavorites, { key, productIds }] }
        }),
      discardPrepared: (id) => set((s) => ({ prepared: s.prepared.filter((p) => p.id !== id) })),

      /* ---------- ライフログ ---------- */
      upsertHealth: (log) =>
        set((s) => {
          const ex = s.health.find((h) => h.date === log.date)
          const merged = { ...(ex ?? {}), ...log, sample: false }
          const health = ex ? s.health.map((h) => (h.date === log.date ? merged : h)) : [...s.health, merged]
          const profile = log.weight ? { ...s.profile, weightKg: log.weight, bodyFatPct: log.bodyFat ?? s.profile.bodyFatPct } : s.profile
          return { health, profile }
        }),
      updateProfile: (p) => set((s) => ({ profile: { ...s.profile, ...p } })),
    }),
    {
      name: STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => localStorageAdapter),
      partialize: (s) => {
        const { schema, profile, recipes, tools, inventory, prepared, plan, shopping, expenses, session, cookHistory, meals, health, lunchFavorites, aiGeneration } = s
        return { schema, profile, recipes, tools, inventory, prepared, plan, shopping, expenses, session, cookHistory, meals, health, lunchFavorites, aiGeneration }
      },
    },
  ),
)
