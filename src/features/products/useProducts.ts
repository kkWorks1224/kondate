import { useMemo } from 'react'
import { SEVEN_PRODUCTS } from '../../data/seven'
import { useStore } from '../../store/useStore'
import type { SevenProduct } from '../../types'

export const CATEGORIES: SevenProduct['category'][] = ['おにぎり', '弁当・丼', 'パン', '麺', 'たんぱく質', '惣菜', 'サラダ', 'スープ', '飲料', 'デザート']
export const ROLE_OF: Record<SevenProduct['category'], SevenProduct['role']> = {
  おにぎり: 'staple', '弁当・丼': 'staple', パン: 'staple', 麺: 'staple', たんぱく質: 'protein', 惣菜: 'protein', サラダ: 'veg', スープ: 'soup', 飲料: 'drink', デザート: 'extra',
}

const norm = (c: string) => c.trim().toUpperCase().replace(/\s/g, '')

/** 目安のデモ商品＋自分で登録した商品 */
export function useProducts() {
  const mine = useStore((s) => s.myProducts)
  return useMemo(() => {
    const all = [...(mine ?? []), ...SEVEN_PRODUCTS]
    const map: Record<string, SevenProduct> = Object.fromEntries(all.map((p) => [p.id, p]))
    const findByCode = (code: string) => {
      const c = norm(code)
      return all.find((p) => norm(p.code) === c || (p.jan && p.jan === c.replace(/\D/g, '')))
    }
    return { all, mine: mine ?? [], map, findByCode }
  }, [mine])
}
