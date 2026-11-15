import { toast } from '../components/ui/Toast'
import { useStore } from './useStore'

/** 食事記録の削除（取り消しできる） */
export function deleteMealWithUndo(id: string, message = '記録を削除しました') {
  const s = useStore.getState()
  const meal = s.meals.find((m) => m.id === id)
  if (!meal) return
  const expense = s.expenses.find((e) => e.sourceId === id)
  s.deleteMeal(id)
  toast(message, 'info', { label: '元に戻す', run: () => useStore.getState().restoreMeal(meal, expense) })
}
