import type { ISODate } from '../types'

const WD = ['日', '月', '火', '水', '木', '金', '土']

/** アプリ内の「今日」。デモでは実時刻を使い、テストでは差し替え可能 */
let fixedToday: ISODate | null = null
export function setToday(d: ISODate | null) {
  fixedToday = d
}
export function today(): ISODate {
  if (fixedToday) return fixedToday
  return toISO(new Date())
}
export function toISO(d: Date): ISODate {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
export function parse(d: ISODate) {
  const [y, m, day] = d.split('-').map(Number)
  return new Date(y, m - 1, day)
}
export function addDays(d: ISODate, n: number): ISODate {
  const x = parse(d)
  x.setDate(x.getDate() + n)
  return toISO(x)
}
export function diffDays(a: ISODate, b: ISODate) {
  return Math.round((parse(a).getTime() - parse(b).getTime()) / 86400000)
}
export function weekday(d: ISODate) {
  return WD[parse(d).getDay()]
}
export function isWeekend(d: ISODate) {
  const w = parse(d).getDay()
  return w === 0 || w === 6
}
/** 指定曜日（作り置き日）を起点とした週の開始日 */
export function weekStartOf(d: ISODate, startDow: number): ISODate {
  const x = parse(d)
  const diff = (x.getDay() - startDow + 7) % 7
  return addDays(d, -diff)
}
export function fmtMD(d: ISODate) {
  const x = parse(d)
  return `${x.getMonth() + 1}/${x.getDate()}`
}
export function fmtLong(d: ISODate) {
  const x = parse(d)
  return `${x.getMonth() + 1}月${x.getDate()}日（${WD[x.getDay()]}）`
}
export function relDay(d: ISODate, base = today()) {
  const n = diffDays(d, base)
  if (n === 0) return '今日'
  if (n === 1) return '明日'
  if (n === -1) return '昨日'
  if (n > 1) return `${n}日後`
  return `${-n}日前`
}
