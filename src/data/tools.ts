import type { Tool } from '../types'

// 器具の数量・同時利用可否・洗浄方針は設定画面から編集でき、調理工程の最適化に使われる
export const TOOLS: Tool[] = [
  { id: 'stove', name: 'ガスコンロ', quantity: 2, shareable: false, washPolicy: 'none', group: '加熱', note: '2口' },
  { id: 'pan_large', name: '大きいフライパン', quantity: 1, shareable: false, washPolicy: 'between-recipes', group: '加熱' },
  { id: 'pan_small', name: '小さいフライパン', quantity: 1, shareable: false, washPolicy: 'between-recipes', group: '加熱' },
  { id: 'pot_small', name: '片手鍋', quantity: 1, shareable: false, washPolicy: 'between-recipes', group: '加熱' },
  { id: 'pot_large', name: '両手鍋・深鍋', quantity: 1, shareable: false, washPolicy: 'between-recipes', group: '加熱' },
  { id: 'donabe', name: '一人暮らし用土鍋', quantity: 1, shareable: false, washPolicy: 'between-recipes', group: '加熱' },
  { id: 'yukihira', name: '雪平鍋', quantity: 1, shareable: false, washPolicy: 'between-recipes', group: '加熱' },
  { id: 'microwave', name: '電子レンジ', quantity: 1, shareable: false, washPolicy: 'none', group: '家電' },
  { id: 'grill', name: '魚焼きグリル', quantity: 1, shareable: false, washPolicy: 'always', group: '加熱' },
  { id: 'rice_cooker', name: '炊飯器', quantity: 1, shareable: false, washPolicy: 'always', group: '家電' },
  { id: 'yogurt_maker', name: 'ヨーグルトメーカー', quantity: 1, shareable: false, washPolicy: 'always', group: '家電', note: '温度・時間設定可能' },
  { id: 'muji_range', name: 'レンジ調理器具（無印良品）', quantity: 1, shareable: false, washPolicy: 'between-recipes', group: '家電' },
  { id: 'vacuum_sealer', name: '真空パック機', quantity: 1, shareable: false, washPolicy: 'none', group: '保存' },
  { id: 'knife', name: '包丁', quantity: 1, shareable: false, washPolicy: 'after-raw', group: '下ごしらえ' },
  { id: 'scissors', name: 'キッチンばさみ', quantity: 1, shareable: false, washPolicy: 'after-raw', group: '下ごしらえ' },
  { id: 'board', name: 'まな板', quantity: 1, shareable: false, washPolicy: 'after-raw', group: '下ごしらえ' },
  { id: 'peeler', name: 'ピーラー', quantity: 1, shareable: false, washPolicy: 'none', group: '下ごしらえ' },
  { id: 'slicer', name: 'スライサー', quantity: 1, shareable: false, washPolicy: 'none', group: '下ごしらえ' },
  { id: 'bowl', name: 'ボウル', quantity: 3, shareable: false, washPolicy: 'after-raw', group: '下ごしらえ' },
  { id: 'colander', name: 'ざる', quantity: 1, shareable: true, washPolicy: 'none', group: '下ごしらえ' },
  { id: 'scale', name: 'キッチンスケール', quantity: 1, shareable: true, washPolicy: 'none', group: '下ごしらえ' },
  { id: 'thermometer', name: '調理用温度計', quantity: 1, shareable: true, washPolicy: 'always', group: '下ごしらえ' },
  { id: 'container', name: '保存容器', quantity: 10, shareable: true, washPolicy: 'none', group: '保存' },
  { id: 'freezer_bag', name: '冷凍保存袋', quantity: 20, shareable: true, washPolicy: 'none', group: '保存' },
]

export const FREEZER_CAPACITY = 12 // 冷凍庫に保存できる食数の目安
