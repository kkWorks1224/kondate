// 一括調理スケジューラ
// ------------------------------------------------------------
// 1. 各レシピの工程を食数分にスケール
// 2. 同じ食材・同じ切り方の下処理、洗い、計量、炊飯などを横断的にまとめる
// 3. 衛生制約を依存関係として追加（野菜→生肉→洗浄→加熱、冷却→小分け）
// 4. 手・コンロ・鍋・レンジなどを資源とするリストスケジューリング
//    （クリティカルパス優先、鍋は同じ料理の工程間で保持、料理が変わる時は洗浄を挿入）
// UI から独立した純粋関数。テスト可能で、将来サーバー側（Workers）でも実行できる。

import { INGREDIENT_MAP } from '../data/ingredients'
import { FREEZER_CAPACITY } from '../data/tools'
import { gramsOf } from '../services/ai/recipeGenerator'
import type { CookPlanResult, CookTask, CookWarning, Occupancy, Recipe, RecipeStep, Scaling, StepKind, Tool } from '../types'

export interface PlanRecipeInput {
  recipe: Recipe
  servings: number
  /** 保存（冷蔵・冷凍）する食数。0 なら冷却・小分け工程を付けない */
  store: number
  freeze?: number
}

export interface PlanInput {
  recipes: PlanRecipeInput[]
  tools: Tool[]
  naive?: boolean // 比較用（料理ごとに単独で作る）
}

interface Node {
  key: string
  kind: StepKind
  title: string
  detail?: string
  recipeIds: string[]
  members: { recipeId: string; step: RecipeStep; servings: number }[]
  ingredients: { ingredientId: string; amount: number; cut?: string }[]
  tools: string[]
  duration: number
  attended: boolean
  deps: Set<string>
  safety?: string
  heat?: RecipeStep['heat']
  reason?: string
}

const HOLDABLE = new Set(['stove', 'pan_large', 'pan_small', 'pot_small', 'pot_large', 'donabe', 'yukihira', 'grill', 'rice_cooker'])
const LANE_TOOLS: Record<string, string> = { stove: 'コンロ', microwave: '電子レンジ', grill: '魚焼きグリル', rice_cooker: '炊飯器' }
const PREP_KINDS = new Set<StepKind>(['wash', 'cut', 'measure'])

const round = (n: number) => Math.max(0.5, Math.round(n * 2) / 2)

export function scaleDuration(d: number, scaling: Scaling | undefined, n: number) {
  switch (scaling ?? 'sublinear') {
    case 'fixed':
      return d
    case 'linear':
      return d * n
    case 'pan':
      return d * Math.ceil(n / 3) // 大きいフライパンで一度に約3食分
    default:
      return d * (1 + 0.35 * (n - 1))
  }
}

function mergeKeyOf(step: RecipeStep, recipeId: string): string {
  if (step.mergeKey) return `m:${step.mergeKey}`
  if (step.kind === 'wash' && step.ingredientIds?.length) return 'm:wash'
  if ((step.kind === 'cut' || step.kind === 'raw') && step.target?.cut) return `m:${step.kind}:${step.target.ingredientId}:${step.target.cut}`
  if (step.kind === 'measure') return 'm:measure'
  return `${recipeId}:${step.id}`
}

function buildNodes(input: PlanRecipeInput[], merge: boolean) {
  const nodes = new Map<string, Node>()
  const alias = new Map<string, string>() // recipeId:stepId -> node key
  for (const { recipe, servings } of input) {
    for (const step of recipe.steps) {
      const own = `${recipe.id}:${step.id}`
      const key = merge ? mergeKeyOf(step, recipe.id) : own
      alias.set(own, key)
      let node = nodes.get(key)
      if (!node) {
        node = { key, kind: step.kind, title: step.title, detail: step.detail, recipeIds: [], members: [], ingredients: [], tools: [...step.tools], duration: 0, attended: step.attended, deps: new Set(), safety: step.safety, heat: step.heat }
        nodes.set(key, node)
      } else {
        for (const t of step.tools) if (!node.tools.includes(t)) node.tools.push(t)
        node.safety = node.safety ?? step.safety
      }
      if (!node.recipeIds.includes(recipe.id)) node.recipeIds.push(recipe.id)
      node.members.push({ recipeId: recipe.id, step, servings })
      // 食材量
      const add = (ingredientId: string, cut?: string) => {
        const per = recipe.ingredients.find((i) => i.ingredientId === ingredientId)
        const amount = (per?.amount ?? 0) * servings
        const ex = node!.ingredients.find((x) => x.ingredientId === ingredientId && x.cut === cut)
        if (ex) ex.amount += amount
        else node!.ingredients.push({ ingredientId, amount, cut })
      }
      if (step.target) add(step.target.ingredientId, step.target.cut)
      for (const id of step.ingredientIds ?? []) add(id)
    }
  }
  // 依存関係を張り替え
  for (const { recipe } of input) {
    for (const step of recipe.steps) {
      const node = nodes.get(alias.get(`${recipe.id}:${step.id}`)!)!
      for (const d of step.dependsOn) {
        const dk = alias.get(`${recipe.id}:${d}`)
        if (dk && dk !== node.key) node.deps.add(dk)
      }
    }
  }
  // 所要時間
  for (const node of nodes.values()) {
    const scaled = node.members.map((m) => scaleDuration(m.step.durationMin, m.step.scaling, m.servings))
    if (node.members.length === 1) node.duration = round(scaled[0])
    else if (node.kind === 'simmer' || node.kind === 'rest') node.duration = round(Math.max(...scaled))
    else if (node.kind === 'cut' || node.kind === 'raw') node.duration = round(scaled.reduce((a, b) => a + b, 0) * 0.85)
    else node.duration = round(scaled.reduce((a, b) => a + b, 0) * 0.7)
    if (node.members.length > 1) relabel(node, input)
  }
  return nodes
}

function recipeName(input: PlanRecipeInput[], id: string) {
  return input.find((r) => r.recipe.id === id)?.recipe.name ?? id
}

function relabel(node: Node, input: PlanRecipeInput[]) {
  const names = node.recipeIds.map((id) => recipeName(input, id))
  const n = node.recipeIds.length
  if (node.kind === 'wash') {
    node.title = '野菜をまとめて洗う・皮をむく'
    node.detail = node.ingredients.map((i) => INGREDIENT_MAP[i.ingredientId]?.name).filter(Boolean).join('・')
    node.reason = `${n}品分の野菜を一度に洗い、ざるで水を切っておく`
  } else if (node.kind === 'measure') {
    node.title = `調味料をまとめて計量する（${n}品分）`
    node.detail = '料理ごとに小皿・計量カップへ分けておく'
    node.reason = '計量をまとめると、加熱中に手が止まらない'
  } else if (node.kind === 'cut' || node.kind === 'raw') {
    const ing = node.ingredients[0]
    const name = INGREDIENT_MAP[ing.ingredientId]?.name ?? ''
    const g = Math.round(gramsOf(ing.ingredientId, ing.amount))
    node.title = `${name}を${ing.cut}にする（${n}品分・約${g}g）`
    node.reason = `${names.join('・')}で同じ切り方の${name}を使うため、まとめて切る`
  } else if (node.key === 'm:rice-cook') {
    node.title = `まとめて炊飯（${n}品分）`
  } else if (node.key === 'm:rice-wash') {
    node.title = `米をまとめて研いで炊飯器にセット（${n}品分）`
  }
}

function reach(nodes: Map<string, Node>, from: string[], dir: 'down' | 'up') {
  const children = new Map<string, string[]>()
  for (const n of nodes.values()) for (const d of n.deps) children.set(d, [...(children.get(d) ?? []), n.key])
  const out = new Set<string>()
  const stack = [...from]
  while (stack.length) {
    const k = stack.pop()!
    const next = dir === 'down' ? children.get(k) ?? [] : [...(nodes.get(k)?.deps ?? [])]
    for (const x of next) if (!out.has(x)) { out.add(x); stack.push(x) }
  }
  return out
}

function hasCycle(nodes: Map<string, Node>) {
  const state = new Map<string, 1 | 2>()
  const visit = (k: string): boolean => {
    const s = state.get(k)
    if (s === 1) return true
    if (s === 2) return false
    state.set(k, 1)
    for (const d of nodes.get(k)?.deps ?? []) if (visit(d)) return true
    state.set(k, 2)
    return false
  }
  for (const k of nodes.keys()) if (visit(k)) return true
  return false
}

function addHygiene(nodes: Map<string, Node>, warnings: CookWarning[], tools: Tool[]) {
  const raw = [...nodes.values()].filter((n) => n.kind === 'raw')
  if (!raw.length) return
  const rawKeys = raw.map((r) => r.key)
  const down = reach(nodes, rawKeys, 'down')
  const up = reach(nodes, rawKeys, 'up')
  const usedTools = new Set(raw.flatMap((r) => r.tools.flatMap((t) => t.split('|'))))
  const cleanTools = ['board', 'knife', 'scissors'].filter((t) => usedTools.has(t))
  const usedBowl = usedTools.has('bowl')
  const clean: Node = {
    key: 'hygiene:clean', kind: 'clean',
    title: `${[cleanTools.includes('board') && 'まな板', cleanTools.includes('knife') && '包丁', cleanTools.includes('scissors') && 'はさみ', usedBowl && 'ボウル'].filter(Boolean).join('・')}と手を洗う`,
    detail: '洗剤で洗い、熱湯をかけるか布巾で水気を拭く。シンク周りも拭く',
    recipeIds: [...new Set(raw.flatMap((r) => r.recipeIds))], members: [], ingredients: [], tools: cleanTools, duration: 2 + 0.5 * (cleanTools.length + (usedBowl ? 1 : 0)), attended: true,
    deps: new Set(rawKeys), safety: '生肉・生魚に触れた器具と手は、他の食材に触れる前に必ず洗う',
    reason: '生肉・生魚の下処理をまとめて終えた直後に洗浄し、交差汚染を防ぐ',
  }
  let veg = 0
  let after = 0
  for (const n of nodes.values()) {
    if (n.kind === 'raw') continue
    if (down.has(n.key)) {
      if (n.kind !== 'rest') { n.deps.add(clean.key); after++ }
      continue
    }
    if (up.has(n.key)) continue
    if (PREP_KINDS.has(n.kind) && n.attended) {
      for (const r of raw) r.deps.add(n.key)
      veg++
      n.reason = n.reason ?? (n.tools.some((t) => t.includes('board')) ? 'まな板が1枚のため、生肉より先に野菜を切る' : '生肉を扱う前に済ませる')
    } else if (n.attended) {
      n.deps.add(clean.key)
      after++
    }
  }
  nodes.set(clean.key, clean)
  const boards = tools.find((t) => t.id === 'board')?.quantity ?? 1
  warnings.push({ level: 'info', message: `衛生：野菜などの下処理${veg}件 → 生肉・生魚${raw.length}件 → 洗浄 → 加熱の順に並べました${boards > 1 ? '（まな板が複数あっても手洗いのため順序を維持）' : ''}` })
  void after
}

function addCoolPack(nodes: Map<string, Node>, input: PlanRecipeInput[]) {
  const all = [...nodes.values()]
  for (const r of input) {
    if (r.store <= 0) continue
    const mine = all.filter((n) => n.recipeIds.includes(r.recipe.id) && !n.key.startsWith('hygiene'))
    const depended = new Set(mine.flatMap((n) => [...n.deps]))
    const terminals = mine.filter((n) => !depended.has(n.key) && n.recipeIds.length === 1)
    const term = terminals.length ? terminals : mine.slice(-1)
    const cool: Node = {
      key: `${r.recipe.id}:cool`, kind: 'cool', title: `${r.recipe.name}の粗熱を取る`, detail: '浅い容器に広げ、保冷剤や氷水を当てる',
      recipeIds: [r.recipe.id], members: [], ingredients: [], tools: [], duration: r.recipe.role === 'soup' ? 25 : 20, attended: false,
      deps: new Set(term.map((t) => t.key)), safety: '30分以内に中心温度20℃付近まで冷ます（菌が増えやすい温度帯を短く）',
    }
    const freeze = r.freeze ?? 0
    const pack: Node = {
      key: `${r.recipe.id}:pack`, kind: 'pack', title: `${r.recipe.name}を小分けにする（冷蔵${r.store - freeze}・冷凍${freeze}）`,
      detail: freeze > 0 ? '冷凍分は真空パックまたは冷凍保存袋で平らにし、日付を書く' : '1食ずつ保存容器へ。日付を書く',
      recipeIds: [r.recipe.id], members: [], ingredients: [], tools: freeze > 0 ? ['container', 'vacuum_sealer|freezer_bag'] : ['container'],
      duration: round(1.5 + 0.6 * r.store), attended: true, deps: new Set([cool.key]), safety: '清潔な容器に詰め、すぐに冷蔵・冷凍する',
    }
    nodes.set(cool.key, cool)
    nodes.set(pack.key, pack)
  }
}

/* ---------- スケジューリング ---------- */

interface Unit { id: string; toolId: string; label: string; busyUntil: number; heldBy?: string; dirtyBy?: string }

export function planCooking(input: PlanInput): CookPlanResult {
  const warnings: CookWarning[] = []
  const recipes = input.recipes.filter((r) => r.servings > 0)
  if (!recipes.length) return { tasks: [], totalMin: 0, handsMin: 0, naiveMin: 0, warnings: [], lanes: [], occupancy: [], servings: [] }

  let nodes = buildNodes(recipes, !input.naive)
  if (hasCycle(nodes)) {
    warnings.push({ level: 'warn', message: '工程の依存関係が循環したため、まとめ処理を行わずに計画しました' })
    nodes = buildNodes(recipes, false)
  }
  addHygiene(nodes, warnings, input.tools)
  addCoolPack(nodes, recipes)
  if (hasCycle(nodes)) {
    warnings.push({ level: 'error', message: '工程の依存関係に矛盾があります。レシピの「前の工程」を見直してください' })
    for (const n of nodes.values()) n.deps.clear()
  }

  // 器具ユニット
  const toolMap = new Map(input.tools.map((t) => [t.id, t]))
  const units: Unit[] = []
  for (const t of input.tools) {
    const q = t.shareable ? 0 : t.quantity
    for (let i = 0; i < q; i++) units.push({ id: `${t.id}#${i + 1}`, toolId: t.id, label: t.quantity > 1 ? `${t.name}${i + 1}` : t.name, busyUntil: 0 })
  }
  const shareable = new Set(input.tools.filter((t) => t.shareable && t.quantity > 0).map((t) => t.id))
  const missing = new Set<string>()
  for (const n of nodes.values()) {
    for (const req of n.tools) {
      const alts = req.split('|')
      if (!alts.some((a) => shareable.has(a) || units.some((u) => u.toolId === a))) missing.add(req)
    }
  }
  for (const m of missing) {
    const names = m.split('|').map((a) => toolMap.get(a)?.name ?? a).join('または')
    warnings.push({ level: 'error', message: `「${names}」が登録されていない（数量0）ため、その器具を使う工程は器具なしとして計画しています` })
  }

  // 優先度：残りクリティカルパス長
  const children = new Map<string, string[]>()
  for (const n of nodes.values()) for (const d of n.deps) children.set(d, [...(children.get(d) ?? []), n.key])
  const prio = new Map<string, number>()
  const cp = (k: string): number => {
    if (prio.has(k)) return prio.get(k)!
    const n = nodes.get(k)!
    const v = n.duration + Math.max(0, ...(children.get(k) ?? []).map(cp))
    prio.set(k, v)
    return v
  }
  for (const k of nodes.keys()) cp(k)

  const owner = (n: Node) => (n.key.startsWith('m:rice') ? 'rice' : n.recipeIds.length === 1 ? n.recipeIds[0] : n.key)
  // 料理ごとに、まだ使う予定の器具要求
  const pendingReq = (o: string, req: string, exceptKey: string) =>
    [...nodes.values()].some((n) => n.key !== exceptKey && !started.has(n.key) && owner(n) === o && n.tools.includes(req))

  const started = new Map<string, { start: number; end: number; units: string[] }>()
  const finished = new Set<string>()
  const running: { key: string; end: number }[] = []
  const occupancy: Occupancy[] = []
  const openOcc = new Map<string, Occupancy>() // unit -> 保持中の区間
  const holds = new Map<string, Map<string, string>>() // owner -> req -> unitId
  const blockedSince = new Map<string, { t: number; unit: string; by?: string }>()
  const extra: CookTask[] = []
  let handsFree = 0
  let t = 0
  let guard = 0

  const unitFree = (u: Unit, o: string) => u.busyUntil <= t && (!u.heldBy || u.heldBy === o)

  function tryResolve(n: Node): { units: Unit[]; dirty?: Unit } | { blocked: string; by?: string } {
    const o = owner(n)
    const chosen: Unit[] = []
    let dirty: Unit | undefined
    for (const req of n.tools) {
      if (missing.has(req)) continue
      const alts = req.split('|')
      if (alts.some((a) => shareable.has(a))) continue
      const heldId = holds.get(o)?.get(req)
      if (heldId) {
        const u = units.find((x) => x.id === heldId)!
        if (u.busyUntil > t) return { blocked: u.label }
        chosen.push(u)
        continue
      }
      const cands = alts.flatMap((a) => units.filter((u) => u.toolId === a && !chosen.includes(u)))
      const free = cands.filter((u) => unitFree(u, o))
      const clean = free.find((u) => !u.dirtyBy || u.dirtyBy === o)
      const pick = clean ?? free[0]
      if (!pick) {
        const busy = cands.find((u) => u.heldBy && u.heldBy !== o) ?? cands[0]
        return { blocked: busy?.label ?? req, by: busy?.heldBy }
      }
      if (pick.dirtyBy && pick.dirtyBy !== o) dirty = pick
      chosen.push(pick)
    }
    return { units: chosen, dirty }
  }

  function start(n: Node, us: Unit[]) {
    const o = owner(n)
    const end = t + n.duration
    started.set(n.key, { start: t, end, units: us.map((u) => u.id) })
    running.push({ key: n.key, end })
    if (n.attended) handsFree = end
    for (const u of us) {
      u.busyUntil = end
      if (HOLDABLE.has(u.toolId) && (n.kind === 'heat' || n.kind === 'simmer' || n.key.includes('rice'))) {
        const req = n.tools.find((r) => r.split('|').includes(u.toolId))!
        if (!holds.has(o)) holds.set(o, new Map())
        holds.get(o)!.set(req, u.id)
        u.heldBy = o
        const occ = openOcc.get(u.id)
        if (occ && occ.recipeIds.join() === n.recipeIds.join()) {
          occ.end = end
          occ.taskIds.push(n.key)
        } else {
          const nOcc: Occupancy = { unit: u.id, toolId: u.toolId, label: u.label, start: t, end, recipeIds: [...n.recipeIds], taskIds: [n.key] }
          occupancy.push(nOcc)
          openOcc.set(u.id, nOcc)
        }
      } else if (LANE_TOOLS[u.toolId]) {
        occupancy.push({ unit: u.id, toolId: u.toolId, label: u.label, start: t, end, recipeIds: [...n.recipeIds], taskIds: [n.key] })
      }
    }
    const b = blockedSince.get(n.key)
    if (b && t - b.t >= 1) {
      warnings.push({ level: 'warn', message: `器具の競合：「${b.unit}」が${b.by ? `${recipeName(recipes, b.by)}で` : ''}使用中のため、「${n.title}」を${Math.round(t - b.t)}分後ろにずらしました` })
    }
  }

  function finish(key: string) {
    finished.add(key)
    const n = nodes.get(key)!
    const o = owner(n)
    const h = holds.get(o)
    if (!h) return
    for (const [req, unitId] of [...h.entries()]) {
      if (!pendingReq(o, req, key)) {
        h.delete(req)
        const u = units.find((x) => x.id === unitId)!
        u.heldBy = undefined
        openOcc.delete(unitId)
        const tool = toolMap.get(u.toolId)
        if (tool && (tool.washPolicy === 'between-recipes' || tool.washPolicy === 'always')) u.dirtyBy = o
      }
    }
  }

  while (finished.size < nodes.size && guard++ < 5000) {
    const ready = [...nodes.values()]
      .filter((n) => !started.has(n.key) && [...n.deps].every((d) => finished.has(d)))
      .sort((a, b) => (b.kind === 'clean' ? 1 : 0) - (a.kind === 'clean' ? 1 : 0) || prio.get(b.key)! - prio.get(a.key)!)
    let progressed = false
    for (const n of ready) {
      if (n.attended && handsFree > t) continue
      const res = tryResolve(n)
      if ('blocked' in res) {
        if (!blockedSince.has(n.key)) blockedSince.set(n.key, { t, unit: res.blocked, by: res.by })
        continue
      }
      if (res.dirty) {
        // 他の料理で使った鍋・フライパンを洗ってから使う
        if (handsFree > t) continue
        const u = res.dirty
        const id = `wash:${u.id}:${extra.length}`
        extra.push({ id, kind: 'clean', title: `${u.label}を洗う`, detail: `${recipeName(recipes, u.dirtyBy!)}で使った後、${recipeName(recipes, n.recipeIds[0])}に使う前に洗う`, recipeIds: n.recipeIds, ingredients: [], tools: [u.toolId], durationMin: 2, attended: true, dependsOn: [], start: t, end: t + 2, lane: '手作業', units: [u.id], reason: '料理が変わるため、味移り・汚れを防ぐ' })
        u.busyUntil = t + 2
        u.dirtyBy = undefined
        handsFree = t + 2
        running.push({ key: id, end: t + 2 })
        progressed = true
        continue
      }
      start(n, res.units)
      progressed = true
    }
    if (!running.length && !progressed) {
      // 資源不足で動けない場合は、優先度の高い工程を器具を無視して開始
      const n = ready[0]
      if (!n) break
      warnings.push({ level: 'warn', message: `器具が足りず「${n.title}」を割り当てられませんでした。器具の数量を確認してください` })
      start(n, [])
      continue
    }
    if (!running.length) continue
    t = Math.min(...running.map((r) => r.end), ...(handsFree > t ? [handsFree] : []))
    for (const r of running.filter((x) => x.end <= t)) {
      if (!r.key.startsWith('wash:')) finish(r.key)
    }
    for (let i = running.length - 1; i >= 0; i--) if (running[i].end <= t) running.splice(i, 1)
  }

  const tasks: CookTask[] = [...nodes.values()].map((n) => {
    const s = started.get(n.key) ?? { start: 0, end: n.duration, units: [] }
    return {
      id: n.key, kind: n.kind, title: n.title, detail: n.detail, recipeIds: n.recipeIds,
      ingredients: n.ingredients.map((i) => ({ ...i, amount: Math.round(i.amount * 10) / 10 })),
      tools: s.units.map((u) => u.split('#')[0]).concat(n.tools.filter((r) => r.split('|').some((a) => shareable.has(a))).map((r) => r.split('|')[0])),
      durationMin: n.duration, attended: n.attended, dependsOn: [...n.deps], start: s.start, end: s.end,
      lane: n.attended ? '手作業' : laneOf(s.units, n.kind), safety: n.safety, heat: n.heat, merged: n.members.length > 1 ? n.members.length : undefined, reason: n.reason, units: s.units,
    }
  })
  tasks.push(...extra)
  tasks.sort((a, b) => a.start - b.start || Number(b.attended) - Number(a.attended) || a.end - b.end)

  const totalMin = Math.round(Math.max(0, ...tasks.map((x) => x.end)))
  const handsMin = Math.round(tasks.filter((x) => x.attended).reduce((a, x) => a + x.durationMin, 0))
  let naiveMin = 0
  if (!input.naive) {
    for (const r of recipes) naiveMin += planCooking({ recipes: [r], tools: input.tools, naive: true }).totalMin
    const merged = tasks.filter((x) => x.merged)
    if (merged.length) warnings.unshift({ level: 'info', message: `下処理を${merged.length}件にまとめました（${merged.map((m) => m.title.replace(/（.*$/, '')).slice(0, 3).join('、')}${merged.length > 3 ? ' など' : ''}）` })
    const freeze = recipes.reduce((a, r) => a + (r.freeze ?? 0), 0)
    if (freeze > FREEZER_CAPACITY) warnings.push({ level: 'warn', message: `冷凍する食数が${freeze}食で、冷凍庫の目安（${FREEZER_CAPACITY}食）を超えます` })
  }
  const lanes = ['手作業', ...new Set(occupancy.map((o) => o.label))]

  return { tasks, totalMin, handsMin, naiveMin, warnings, lanes, occupancy, servings: recipes.map((r) => ({ recipeId: r.recipe.id, servings: r.servings, store: r.store })) }
}

function laneOf(units: string[], kind: StepKind) {
  const u = units.find((x) => LANE_TOOLS[x.split('#')[0]])
  if (u) return u
  return kind === 'cool' || kind === 'rest' ? '待ち時間' : '待ち時間'
}
