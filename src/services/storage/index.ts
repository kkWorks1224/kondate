// 永続化アダプタ。プロトタイプは localStorage、本番は D1（API経由）に差し替える。
import type { StateStorage } from 'zustand/middleware'

export const STORAGE_KEY = 'kondate-v1'

export const localStorageAdapter: StateStorage = {
  getItem: (name) => {
    try {
      return window.localStorage.getItem(name)
    } catch {
      return null
    }
  },
  setItem: (name, value) => {
    try {
      window.localStorage.setItem(name, value)
    } catch {
      /* 容量超過・プライベートモードでは保存できない */
    }
  },
  removeItem: (name) => {
    try {
      window.localStorage.removeItem(name)
    } catch {
      /* noop */
    }
  },
}
