export const yen = (n: number) => `¥${Math.round(n).toLocaleString('ja-JP')}`
export const r1 = (n: number) => Math.round(n * 10) / 10
export const r0 = (n: number) => Math.round(n)
export function qty(n: number, unit: string) {
  const v = unit === 'g' || unit === 'ml' ? Math.round(n) : r1(n)
  return `${v}${unit}`
}
/** 液体調味料などを大さじ・小さじでも表示 */
export function spoon(ml: number) {
  if (ml <= 0) return ''
  if (ml >= 15 && ml % 15 === 0) return `大さじ${ml / 15}`
  if (ml >= 15) return `大さじ${r1(ml / 15)}`
  if (ml >= 5) return `小さじ${r1(ml / 5)}`
  return `小さじ${r1(ml / 5)}`
}
export function uid(prefix = 'id') {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-3)}`
}
export function clamp(n: number, a: number, b: number) {
  return Math.min(b, Math.max(a, n))
}
export function cx(...xs: (string | false | null | undefined)[]) {
  return xs.filter(Boolean).join(' ')
}
