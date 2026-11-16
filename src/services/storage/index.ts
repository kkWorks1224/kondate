// 永続化アダプタ。端末内のキャッシュ（localStorage）はログイン中のユーザーごとに分ける。
// 正本はサーバ（Cloudflare D1）で、同期は services/cloud が担う。
import type { StateStorage } from 'zustand/middleware'

export const STORAGE_KEY = 'kondate-v1'

let scope = ''
/** 以降の読み書きをこのユーザーのキーに向ける */
export function setStorageUser(uid: string) {
  scope = uid
}
const keyOf = (name: string) => (scope ? `${name}:${scope}` : `${name}:anon`)

export function readRaw(key: string) {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}
export function writeRaw(key: string, v: string) {
  try {
    window.localStorage.setItem(key, v)
  } catch {
    /* 容量超過・プライベートモードでは保存できない */
  }
}
export function removeRaw(key: string) {
  try {
    window.localStorage.removeItem(key)
  } catch {
    /* noop */
  }
}

export const localStorageAdapter: StateStorage = {
  getItem: (name) => readRaw(keyOf(name)),
  setItem: (name, value) => writeRaw(keyOf(name), value),
  removeItem: (name) => removeRaw(keyOf(name)),
}
