import type { HealthLog, MealLog, MealSlot, Nutrients, Profile, Targets } from '../types'
import { sum } from './nutrition'

/** 目標値。BMI・体脂肪率が低い場合は減量目標を設定しない */
export function computeTargets(p: Profile): Targets {
  const bmi = p.weightKg / (p.heightCm / 100) ** 2
  const bmr = 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.age + (p.sex === 'male' ? 5 : -161) // Mifflin-St Jeor
  const factor = p.activity === 'low' ? 1.4 : p.activity === 'moderate' ? 1.55 : 1.75
  const tdee = Math.round(bmr * factor)
  const lean = bmi < 21 || p.bodyFatPct < 12
  const wantsLoss = p.goalWeightKg < p.weightKg
  const deficit = !wantsLoss || lean ? 0 : Math.min(300, Math.round(tdee * 0.1))
  const kcal = Math.round((tdee - deficit) / 10) * 10
  const protein = Math.round(p.weightKg * 1.6)
  const fat = Math.round((kcal * 0.25) / 9)
  const carbs = Math.round((kcal - protein * 4 - fat * 9) / 4)
  const note = lean && wantsLoss
    ? `BMI ${bmi.toFixed(1)}・体脂肪率${p.bodyFatPct}%は既に低めです。希望体重（${p.goalWeightKg}kg）は表示のみとし、エネルギーは維持量、たんぱく質は体重×1.6gで筋肉の維持を優先します。`
    : deficit > 0
      ? `緩やかな調整として維持量から${deficit}kcal控えめに設定しています（1日10%以内）。`
      : '維持量を目標にしています。'
  // 食事摂取基準（2025年版）の成人男性の目安を参考にした値
  return { kcal, protein, fat, carbs, fiber: 22, salt: 7.5, calcium: 750, iron: 7.5, vitB1: 1.2, vitC: 100, vegG: 350, note, bmi, tdee }
}

export const SLOT_LABEL: Record<MealSlot, string> = { breakfast: '朝食', lunch: '昼食', dinner: '夕食', snack: '間食' }

export interface DayStatus {
  date: string
  nutrients: Nutrients
  logged: MealSlot[]
  missing: MealSlot[]
  complete: boolean
}

export function dayStatus(logs: MealLog[], date: string, expectBreakfast: boolean): DayStatus {
  const mine = logs.filter((l) => l.date === date)
  const expected: MealSlot[] = expectBreakfast ? ['breakfast', 'lunch', 'dinner'] : ['lunch', 'dinner']
  const logged = [...new Set(mine.map((l) => l.slot))]
  const missing = expected.filter((s) => !logged.includes(s))
  return { date, nutrients: sum(mine.filter((l) => !l.skipped).map((l) => l.nutrients)), logged, missing, complete: missing.length === 0 }
}

export function movingAverage(logs: HealthLog[], key: 'weight' | 'bodyFat', window = 7) {
  const sorted = [...logs].filter((l) => l[key] !== undefined).sort((a, b) => a.date.localeCompare(b.date))
  return sorted.map((l, i) => {
    const slice = sorted.slice(Math.max(0, i - window + 1), i + 1)
    const avg = slice.reduce((a, x) => a + (x[key] as number), 0) / slice.length
    return { date: l.date, value: l[key] as number, avg: Math.round(avg * 100) / 100, n: slice.length }
  })
}

/** 昼食と夕食を合わせたバランス評価（記録分のみで判定し、未記録があれば明示） */
export function balanceComment(status: DayStatus, t: Targets): { tone: 'ok' | 'warn' | 'info'; text: string }[] {
  const n = status.nutrients
  const out: { tone: 'ok' | 'warn' | 'info'; text: string }[] = []
  if (!status.logged.length) return [{ tone: 'info', text: 'まだ食事の記録がありません' }]
  if (!status.complete) out.push({ tone: 'info', text: `未記録：${status.missing.map((m) => SLOT_LABEL[m]).join('・')}。1日の合計は記録分のみです` })
  const p = n.protein / t.protein
  if (p >= 0.9) out.push({ tone: 'ok', text: `たんぱく質 ${Math.round(n.protein)}g で目標に届いています` })
  else if (status.complete) out.push({ tone: 'warn', text: `たんぱく質があと${Math.round(t.protein - n.protein)}g不足。間食に卵・ヨーグルトなどを` })
  else out.push({ tone: 'info', text: `たんぱく質 ${Math.round(n.protein)}g（目標 ${t.protein}g）` })
  if (n.salt > t.salt) out.push({ tone: 'warn', text: `食塩相当量が${n.salt.toFixed(1)}gで目標（${t.salt}g未満）を超えています` })
  if (status.complete && n.kcal < t.kcal * 0.8) out.push({ tone: 'warn', text: `エネルギーが目標の${Math.round((n.kcal / t.kcal) * 100)}%です。減らしすぎに注意` })
  if (n.vegG < 200 && status.complete) out.push({ tone: 'warn', text: `野菜が約${Math.round(n.vegG)}gで少なめです` })
  return out
}
