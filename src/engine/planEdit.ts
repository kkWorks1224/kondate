// 文章の指示（「火曜は不要」「今週は3日分だけ」など）で献立を組み直す。
// 指示は「操作（PlanOp）」に変換してから適用するので、AI の出力もルールの解析も同じ検証・適用を通る。
import { diffDays, weekday } from '../lib/date'
import type { CookMode, Recipe, WeekPlan } from '../types'

export type PlanOp =
  | { op: 'skip'; days: number[]; note?: string }
  | { op: 'unskip'; days: number[] }
  | { op: 'keepDays'; count: number }
  | { op: 'set'; day: number; slot: 'main' | 'side'; recipeId: string | null }
  | { op: 'mode'; days: number[]; mode: CookMode }
  | { op: 'swap'; a: number; b: number }

const KANJI_NUM: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, '１': 1, '２': 2, '３': 3, '４': 4, '５': 5, '６': 6, '７': 7 }

/** 文中で言及された日（献立の何日目か）を返す */
export function mentionedDays(text: string, plan: WeekPlan, today: string): number[] {
  const out = new Set<number>()
  const idxOfWd = (w: string) => plan.days.findIndex((d) => weekday(d.date) === w)
  // 「火曜」「火曜日」、または区切られた1文字（「火と木は…」）。「今日」の「日」などは拾わない
  for (const m of text.matchAll(/([日月火水木金土])曜|(?:^|(?<=[、,・とや\s]))([月火水木金土])(?=[、,・とはもや\s]|$)/g)) {
    const i = idxOfWd(m[1] ?? m[2])
    if (i >= 0) out.add(i)
  }
  const rel = (n: number) => plan.days.findIndex((d) => diffDays(d.date, today) === n)
  if (/今日|今晩|今夜/.test(text)) out.add(rel(0))
  if (/明日|あした/.test(text)) out.add(rel(1))
  if (/明後日|あさって/.test(text)) out.add(rel(2))
  if (/平日/.test(text)) plan.days.forEach((d, i) => !/[土日]/.test(weekday(d.date)) && out.add(i))
  if (/週末|土日/.test(text)) plan.days.forEach((d, i) => /[土日]/.test(weekday(d.date)) && out.add(i))
  if (/全部|すべて|全日|毎日/.test(text)) plan.days.forEach((_, i) => out.add(i))
  out.delete(-1)
  return [...out].sort((a, b) => a - b)
}

/**
 * よくある言い方はルールで解析する（速く確実）。解析できなければ null を返し、AI に任せる。
 * 例：「火曜日は不要」「水曜と金曜は外食」「今週は3日分だけ」「木曜はやっぱり作る」「土曜は当日調理」
 */
export function parseInstruction(text: string, plan: WeekPlan, today: string): { ops: PlanOp[]; message: string } | null {
  const t = text.replace(/\s+/g, '')
  const keep = t.match(/([1-7１-７一二三四五六七])日(?:分|ぶん)(?:だけ|のみ|でいい|で良い|にして)/)
  if (keep) {
    const count = KANJI_NUM[keep[1]]
    return { ops: [{ op: 'keepDays', count }], message: `最初の${count}日分だけにして、残りの日はなしにします` }
  }
  const days = mentionedDays(t, plan, today)
  if (!days.length) return null
  const names = days.map((i) => `${weekday(plan.days[i].date)}曜`).join('・')
  // 「やっぱり作る」「戻して」→ 不要を取り消す（「不要」より先に判定）
  if (/(やっぱり|戻し|戻す|復活|必要になっ|作る(?!の?不要))/.test(t) && !/(不要|いらない|要らない)/.test(t)) {
    return { ops: [{ op: 'unskip', days }], message: `${names}の夕食を元に戻します` }
  }
  const skip = t.match(/(不要|いらない|要らない|なし|無し|外食|飲み会|会食|出張|作らない|抜き|食べない|実家)/)
  if (skip) {
    const note = /外食|飲み会|会食|出張|実家/.test(skip[1]) ? skip[1] : '不要'
    return { ops: [{ op: 'skip', days, note }], message: `${names}を「${note}」にして、その分の食材と作り置きを減らします` }
  }
  if (/当日|作りたて/.test(t)) return { ops: [{ op: 'mode', days, mode: 'fresh' }], message: `${names}を当日調理にします` }
  if (/作り置き|まとめて/.test(t)) return { ops: [{ op: 'mode', days, mode: 'batch' }], message: `${names}を作り置きにします` }
  return null
}

const MAIN_ROLES = ['main', 'one-dish']
const SIDE_ROLES = ['side', 'soup']

/** AI などから来た操作を検証して、適用できるものだけ残す */
export function sanitizeOps(raw: unknown, recipes: Record<string, Recipe>): PlanOp[] {
  if (!Array.isArray(raw)) return []
  const day = (x: unknown) => (Number.isInteger(x) && (x as number) >= 0 && (x as number) <= 6 ? (x as number) : -1)
  const days = (x: unknown) => (Array.isArray(x) ? [...new Set(x.map(day).filter((d) => d >= 0))] : [])
  const out: PlanOp[] = []
  for (const o of raw.slice(0, 20) as Record<string, unknown>[]) {
    if (!o || typeof o !== 'object') continue
    if (o.op === 'skip' && days(o.days).length) out.push({ op: 'skip', days: days(o.days), note: typeof o.note === 'string' ? o.note.slice(0, 12) : '不要' })
    else if (o.op === 'unskip' && days(o.days).length) out.push({ op: 'unskip', days: days(o.days) })
    else if (o.op === 'keepDays' && Number.isInteger(o.count) && (o.count as number) >= 1 && (o.count as number) <= 7) out.push({ op: 'keepDays', count: o.count as number })
    else if (o.op === 'mode' && days(o.days).length && (o.mode === 'batch' || o.mode === 'fresh')) out.push({ op: 'mode', days: days(o.days), mode: o.mode })
    else if (o.op === 'swap' && day(o.a) >= 0 && day(o.b) >= 0 && o.a !== o.b) out.push({ op: 'swap', a: o.a as number, b: o.b as number })
    else if (o.op === 'set' && day(o.day) >= 0 && (o.slot === 'main' || o.slot === 'side')) {
      const id = o.recipeId == null ? null : String(o.recipeId)
      const r = id ? recipes[id] : undefined
      if (id && (!r || !(o.slot === 'main' ? MAIN_ROLES : SIDE_ROLES).includes(r.role))) continue
      if (!id && o.slot === 'main') continue // 主菜を空にするのは skip で行う
      out.push({ op: 'set', day: o.day as number, slot: o.slot, recipeId: id })
    }
  }
  return out
}

/** 操作を適用した新しい献立と、変更点の説明を返す（元の献立は変更しない） */
export function applyOps(plan: WeekPlan, ops: PlanOp[], recipes: Record<string, Recipe>): { plan: WeekPlan; changes: string[] } {
  const days = plan.days.map((d) => ({ ...d, dinner: { ...d.dinner } }))
  const changes: string[] = []
  const label = (i: number) => `${weekday(days[i].date)}曜`
  const nameOf = (id?: string) => (id ? recipes[id]?.name ?? '（不明）' : 'なし')
  const skip = (i: number, note: string) => {
    const d = days[i].dinner
    if (d.skip) return
    changes.push(`${label(i)}：${nameOf(d.main)} → なし（${note}）`)
    days[i].dinner = { ...d, skip: true, note, prev: { main: d.main, side: d.side }, main: undefined, side: undefined }
  }
  const unskip = (i: number) => {
    const d = days[i].dinner
    if (!d.skip) return
    days[i].dinner = { mode: d.mode, main: d.prev?.main, side: d.prev?.side }
    changes.push(`${label(i)}：なし → ${nameOf(d.prev?.main)}${d.prev?.main ? '' : '（料理を選んでください）'}`)
  }
  for (const o of ops) {
    if (o.op === 'skip') o.days.forEach((i) => skip(i, o.note ?? '不要'))
    else if (o.op === 'unskip') o.days.forEach(unskip)
    else if (o.op === 'keepDays') days.forEach((_, i) => (i < o.count ? unskip(i) : skip(i, '不要')))
    else if (o.op === 'mode')
      o.days.forEach((i) => {
        if (days[i].dinner.mode === o.mode || days[i].dinner.skip) return
        days[i].dinner = { ...days[i].dinner, mode: o.mode }
        changes.push(`${label(i)}：${o.mode === 'fresh' ? '当日調理' : '作り置き'}にする`)
      })
    else if (o.op === 'swap') {
      const a = days[o.a].dinner
      days[o.a].dinner = days[o.b].dinner
      days[o.b].dinner = a
      changes.push(`${label(o.a)}と${label(o.b)}の料理を入れ替え`)
    } else if (o.op === 'set') {
      const d = days[o.day].dinner
      const before = d[o.slot]
      if (before === (o.recipeId ?? undefined)) continue
      days[o.day].dinner = { ...d, skip: false, note: undefined, prev: undefined, [o.slot]: o.recipeId ?? undefined, ...(d.skip && o.slot === 'main' ? { side: undefined } : {}) }
      changes.push(`${label(o.day)}の${o.slot === 'main' ? '主菜' : '副菜'}：${nameOf(before)} → ${nameOf(o.recipeId ?? undefined)}`)
    }
  }
  return { plan: { ...plan, days, generatedBy: 'manual' }, changes }
}

/** AI に渡す献立と候補の要約 */
export function editContext(plan: WeekPlan, recipes: Record<string, Recipe>, today: string) {
  return {
    today,
    days: plan.days.map((d, i) => ({
      i,
      date: d.date,
      wd: weekday(d.date),
      rel: diffDays(d.date, today) === 0 ? '今日' : diffDays(d.date, today) === 1 ? '明日' : '',
      main: d.dinner.main ? recipes[d.dinner.main]?.name : null,
      side: d.dinner.side ? recipes[d.dinner.side]?.name : null,
      mode: d.dinner.mode,
      skip: !!d.dinner.skip,
    })),
    candidates: Object.values(recipes)
      .filter((r) => [...MAIN_ROLES, ...SIDE_ROLES].includes(r.role))
      .slice(0, 80)
      .map((r) => ({ id: r.id, name: r.name, role: MAIN_ROLES.includes(r.role) ? 'main' : 'side', tags: r.tags.slice(0, 4), freeze: r.freeze, canMake: r.canMake })),
  }
}
