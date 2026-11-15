import type { Aisle, Ingredient, StorageLoc, Unit } from '../types'

// 栄養値は日本食品標準成分表の代表値を参考にした「概算」。
// 価格は いちやま湯村店 を想定した仮の価格で、実際の店頭価格ではない。

type N = [kcal: number, p: number, f: number, c: number, fiber: number, salt: number, ca: number, fe: number, b1: number, vc: number]

interface Def {
  id: string
  name: string
  aisle: Aisle
  n: N
  pack: [size: number, price: number, label: string]
  unit?: Unit
  gpu?: number
  shelf: { fridge?: number; freezer?: number; pantry?: number }
  store?: StorageLoc
  veg?: boolean
  wash?: boolean
  raw?: 'meat' | 'poultry' | 'fish'
  staple?: boolean
  frequent?: boolean
}

const defs: Def[] = [
  // 精肉
  { id: 'chicken_breast', name: '鶏むね肉', aisle: '精肉', n: [105, 23.3, 1.9, 0.1, 0, 0.1, 4, 0.3, 0.1, 3], pack: [600, 480, '2枚（約600g）'], shelf: { fridge: 2, freezer: 21 }, store: 'fridge', raw: 'poultry', frequent: true },
  { id: 'chicken_thigh', name: '鶏もも肉', aisle: '精肉', n: [190, 16.6, 14.2, 0, 0, 0.2, 5, 0.6, 0.1, 3], pack: [300, 420, '1枚（約300g）'], shelf: { fridge: 2, freezer: 21 }, store: 'fridge', raw: 'poultry', frequent: true },
  { id: 'pork_koma', name: '豚こま肉', aisle: '精肉', n: [200, 18.5, 14, 0.2, 0, 0.1, 4, 0.7, 0.7, 1], pack: [300, 450, '約300g'], shelf: { fridge: 3, freezer: 21 }, store: 'fridge', raw: 'meat', frequent: true },
  { id: 'pork_belly', name: '豚バラ肉', aisle: '精肉', n: [366, 14.4, 35.4, 0.1, 0, 0.1, 3, 0.6, 0.51, 1], pack: [200, 398, '薄切り 約200g'], shelf: { fridge: 3, freezer: 21 }, store: 'fridge', raw: 'meat', frequent: true },
  { id: 'pork_loin', name: '豚ロース（生姜焼き用）', aisle: '精肉', n: [248, 19.3, 19.2, 0.2, 0, 0.1, 4, 0.3, 0.69, 1], pack: [250, 450, '約250g'], shelf: { fridge: 3, freezer: 21 }, store: 'fridge', raw: 'meat' },
  { id: 'pork_minced', name: '豚ひき肉', aisle: '精肉', n: [209, 17.7, 17.2, 0.1, 0, 0.1, 6, 1.0, 0.69, 1], pack: [250, 328, '約250g'], shelf: { fridge: 1, freezer: 14 }, store: 'fridge', raw: 'meat', frequent: true },
  { id: 'beef_koma', name: '牛こま肉', aisle: '精肉', n: [280, 15, 23, 0.2, 0, 0.1, 4, 1.4, 0.06, 1], pack: [200, 498, '約200g'], shelf: { fridge: 2, freezer: 21 }, store: 'fridge', raw: 'meat' },
  // 鮮魚
  { id: 'salmon', name: '鮭', aisle: '鮮魚', n: [124, 22.3, 4.1, 0.1, 0, 0.2, 14, 0.5, 0.15, 1], pack: [160, 398, '2切れ（約160g）'], shelf: { fridge: 2, freezer: 21 }, store: 'fridge', raw: 'fish', frequent: true },
  { id: 'mackerel', name: 'さば', aisle: '鮮魚', n: [211, 20.6, 16.8, 0.3, 0, 0.3, 6, 1.2, 0.21, 1], pack: [200, 398, '2切れ（約200g）'], shelf: { fridge: 2, freezer: 21 }, store: 'fridge', raw: 'fish' },
  // 日配
  { id: 'tofu', name: '豆腐（木綿）', aisle: '日配', n: [73, 7.0, 4.9, 1.5, 1.1, 0, 93, 1.5, 0.09, 0], pack: [350, 98, '1丁（約350g）'], shelf: { fridge: 4 }, store: 'fridge', frequent: true },
  { id: 'egg', name: '卵', aisle: '日配', unit: '個', gpu: 50, n: [142, 12.2, 10.2, 0.4, 0, 0.4, 46, 1.5, 0.06, 0], pack: [10, 278, '10個入り'], shelf: { fridge: 14 }, store: 'fridge', frequent: true },
  { id: 'natto', name: '納豆', aisle: '日配', unit: 'パック', gpu: 45, n: [190, 16.5, 10, 12.1, 6.7, 0, 90, 3.3, 0.07, 0], pack: [3, 98, '3パック'], shelf: { fridge: 7, freezer: 30 }, store: 'fridge', frequent: true },
  { id: 'kimchi', name: 'キムチ', aisle: '日配', n: [27, 2.3, 0.1, 5.4, 2.2, 2.9, 48, 0.5, 0.04, 15], pack: [250, 228, '約250g'], shelf: { fridge: 14 }, store: 'fridge', frequent: true },
  { id: 'aburaage', name: '油揚げ', aisle: '日配', n: [377, 23.4, 34.4, 0.4, 1.3, 0, 310, 3.2, 0.06, 0], pack: [60, 98, '2枚'], shelf: { fridge: 4, freezer: 30 }, store: 'fridge' },
  { id: 'cheese', name: 'チーズ', aisle: '日配', n: [313, 22.7, 26, 1.3, 0, 2.8, 630, 0.3, 0.03, 0], pack: [150, 298, 'シュレッド 約150g'], shelf: { fridge: 14, freezer: 30 }, store: 'fridge', frequent: true },
  { id: 'yogurt', name: 'ヨーグルト', aisle: '日配', n: [56, 3.6, 3, 4.9, 0, 0.1, 120, 0, 0.04, 1], pack: [400, 158, '400g'], shelf: { fridge: 10 }, store: 'fridge', frequent: true },
  { id: 'milk', name: '牛乳', aisle: '日配', unit: 'ml', gpu: 1.03, n: [61, 3.3, 3.8, 4.8, 0, 0.1, 110, 0, 0.04, 1], pack: [1000, 228, '1L'], shelf: { fridge: 7 }, store: 'fridge', frequent: true },
  { id: 'gyoza_skin', name: '餃子の皮', aisle: '日配', unit: '枚', gpu: 6, n: [275, 9.3, 1.4, 57, 2.2, 0, 16, 0.8, 0.08, 0], pack: [24, 128, '24枚'], shelf: { fridge: 5, freezer: 30 }, store: 'fridge' },
  { id: 'miso', name: '味噌', aisle: '日配', n: [192, 12.5, 6, 21.9, 4.9, 12.4, 100, 4, 0.03, 0], pack: [750, 298, '750g'], shelf: { fridge: 120 }, store: 'fridge' },
  // 青果
  { id: 'onion', name: '玉ねぎ', aisle: '青果', n: [33, 1.0, 0.1, 8.4, 1.5, 0, 17, 0.3, 0.04, 7], pack: [600, 198, '3個（約600g）'], shelf: { pantry: 30 }, store: 'pantry', veg: true, wash: true, frequent: true },
  { id: 'carrot', name: 'にんじん', aisle: '青果', n: [35, 0.7, 0.2, 9.3, 2.4, 0.1, 28, 0.2, 0.07, 6], pack: [450, 178, '3本（約450g）'], shelf: { fridge: 21 }, store: 'fridge', veg: true, wash: true, frequent: true },
  { id: 'potato', name: 'じゃがいも', aisle: '青果', n: [76, 1.6, 0.1, 17.6, 1.3, 0, 3, 0.4, 0.09, 28], pack: [600, 198, '4個（約600g）'], shelf: { pantry: 30 }, store: 'pantry', veg: true, wash: true },
  { id: 'napa', name: '白菜', aisle: '青果', n: [13, 0.8, 0.1, 3.2, 1.3, 0, 43, 0.3, 0.03, 19], pack: [500, 158, '1/4株（約500g）'], shelf: { fridge: 10 }, store: 'fridge', veg: true, wash: true, frequent: true },
  { id: 'leek', name: '長ねぎ', aisle: '青果', n: [35, 1.4, 0.1, 8.3, 2.5, 0, 36, 0.3, 0.05, 14], pack: [200, 158, '2本（約200g）'], shelf: { fridge: 10, freezer: 30 }, store: 'fridge', veg: true, wash: true, frequent: true },
  { id: 'komatsuna', name: '小松菜', aisle: '青果', n: [13, 1.5, 0.2, 2.4, 1.9, 0, 170, 2.8, 0.09, 39], pack: [250, 128, '1束（約250g）'], shelf: { fridge: 4, freezer: 30 }, store: 'fridge', veg: true, wash: true, frequent: true },
  { id: 'broccoli', name: 'ブロッコリー', aisle: '青果', n: [37, 5.4, 0.6, 6.6, 5.1, 0.1, 50, 1.3, 0.17, 140], pack: [250, 198, '1株（約250g）'], shelf: { fridge: 5, freezer: 30 }, store: 'fridge', veg: true, wash: true, frequent: true },
  { id: 'eggplant', name: 'なす', aisle: '青果', n: [18, 1.1, 0.1, 5.1, 2.2, 0, 18, 0.3, 0.05, 4], pack: [300, 198, '3本（約300g）'], shelf: { fridge: 5 }, store: 'fridge', veg: true, wash: true, frequent: true },
  { id: 'tomato', name: 'トマト', aisle: '青果', n: [20, 0.7, 0.1, 4.7, 1.0, 0, 7, 0.2, 0.05, 15], pack: [300, 258, '2個（約300g）'], shelf: { fridge: 7 }, store: 'fridge', veg: true, wash: true, frequent: true },
  { id: 'cabbage', name: 'キャベツ', aisle: '青果', n: [21, 1.3, 0.2, 5.2, 1.8, 0, 43, 0.3, 0.04, 41], pack: [600, 158, '1/2玉（約600g）'], shelf: { fridge: 10 }, store: 'fridge', veg: true, wash: true },
  { id: 'piman', name: 'ピーマン', aisle: '青果', n: [20, 0.9, 0.2, 5.1, 2.3, 0, 11, 0.4, 0.03, 76], pack: [150, 128, '5個（約150g）'], shelf: { fridge: 7 }, store: 'fridge', veg: true, wash: true },
  { id: 'moyashi', name: 'もやし', aisle: '青果', n: [15, 1.7, 0.1, 2.6, 1.3, 0, 10, 0.2, 0.04, 8], pack: [200, 38, '1袋（200g）'], shelf: { fridge: 2 }, store: 'fridge', veg: true, wash: true },
  { id: 'spinach', name: 'ほうれん草', aisle: '青果', n: [18, 2.2, 0.4, 3.1, 2.8, 0, 49, 2.0, 0.11, 35], pack: [200, 158, '1束（約200g）'], shelf: { fridge: 3, freezer: 30 }, store: 'fridge', veg: true, wash: true },
  { id: 'gobo', name: 'ごぼう', aisle: '青果', n: [58, 1.8, 0.1, 15.4, 5.7, 0, 46, 0.7, 0.05, 3], pack: [150, 128, '1本（約150g）'], shelf: { fridge: 10 }, store: 'fridge', veg: true, wash: true },
  { id: 'daikon', name: '大根', aisle: '青果', n: [18, 0.5, 0.1, 4.1, 1.4, 0, 24, 0.2, 0.02, 12], pack: [500, 108, '1/2本（約500g）'], shelf: { fridge: 10 }, store: 'fridge', veg: true, wash: true },
  { id: 'shiitake', name: 'しいたけ', aisle: '青果', n: [25, 3.1, 0.3, 6.4, 4.9, 0, 1, 0.4, 0.13, 0], pack: [90, 158, '6個（約90g）'], shelf: { fridge: 5, freezer: 30 }, store: 'fridge', veg: true, wash: false, frequent: true },
  { id: 'enoki', name: 'えのき', aisle: '青果', n: [34, 2.7, 0.2, 7.6, 3.9, 0, 0, 1.1, 0.24, 0], pack: [200, 88, '1袋（200g）'], shelf: { fridge: 5, freezer: 30 }, store: 'fridge', veg: true, wash: false, frequent: true },
  { id: 'kinoko_mix', name: 'きのこミックス', aisle: '青果', n: [25, 2.7, 0.3, 6, 4, 0, 1, 0.6, 0.15, 0], pack: [200, 198, '1袋（200g）'], shelf: { fridge: 4, freezer: 30 }, store: 'fridge', veg: true, wash: false, frequent: true },
  { id: 'takenoko', name: 'たけのこ水煮', aisle: '青果', n: [22, 2.7, 0.2, 4.0, 2.3, 0, 17, 0.3, 0.05, 0], pack: [120, 128, '1袋（約120g）'], shelf: { fridge: 3 }, store: 'fridge', veg: true, wash: true },
  // 米・麺・パン
  { id: 'rice', name: '白米（精白米）', aisle: '米・麺・パン', n: [342, 6.1, 0.9, 77.6, 0.5, 0, 5, 0.8, 0.08, 0], pack: [5000, 3280, '5kg'], shelf: { pantry: 60 }, store: 'pantry', frequent: true },
  { id: 'pasta', name: 'パスタ（乾）', aisle: '米・麺・パン', n: [347, 12.9, 1.8, 73.1, 5.4, 0, 18, 1.4, 0.19, 0], pack: [500, 198, '500g'], shelf: { pantry: 365 }, store: 'pantry', frequent: true },
  { id: 'soba', name: 'そば（乾）', aisle: '米・麺・パン', n: [344, 14, 2.3, 66.7, 3.7, 2.2, 24, 2.6, 0.37, 0], pack: [270, 158, '270g'], shelf: { pantry: 365 }, store: 'pantry', frequent: true },
  { id: 'bread', name: '食パン', aisle: '米・麺・パン', unit: '枚', gpu: 60, n: [248, 8.9, 4.1, 46.4, 4.2, 1.2, 22, 0.5, 0.07, 0], pack: [6, 158, '6枚切り'], shelf: { pantry: 4, freezer: 21 }, store: 'pantry', frequent: true },
  { id: 'chuka_men', name: '焼きそば麺', aisle: '米・麺・パン', n: [162, 4.9, 1.7, 35.6, 3.1, 0.3, 10, 0.4, 0, 0], pack: [450, 178, '3玉（約450g）'], shelf: { fridge: 7 }, store: 'fridge' },
  { id: 'panko', name: 'パン粉', aisle: '米・麺・パン', n: [373, 14.6, 6.8, 63.4, 4, 1.2, 33, 1.4, 0.15, 0], pack: [100, 98, '100g'], shelf: { pantry: 60 }, store: 'pantry' },
  // 冷凍
  { id: 'frozen_veg', name: '冷凍野菜ミックス', aisle: '冷凍', n: [60, 2.5, 0.5, 12, 3, 0, 20, 0.6, 0.08, 10], pack: [300, 198, '300g'], shelf: { freezer: 60 }, store: 'freezer', veg: true, frequent: true },
  // 調味料・乾物（ルウ・乾物は購入対象）
  { id: 'curry_roux', name: 'カレールウ', aisle: '調味料・乾物', n: [474, 6.5, 34.1, 44.7, 3.7, 10.6, 90, 3.5, 0.09, 0], pack: [140, 228, '1箱（約8皿分）'], shelf: { pantry: 180 }, store: 'pantry' },
  { id: 'stew_roux', name: 'シチュールウ', aisle: '調味料・乾物', n: [512, 5.7, 36, 44, 2, 8.1, 50, 0.5, 0.05, 0], pack: [160, 258, '1箱（約8皿分）'], shelf: { pantry: 180 }, store: 'pantry' },
  { id: 'hayashi_roux', name: 'ハヤシルウ', aisle: '調味料・乾物', n: [501, 5.8, 33, 45, 1.5, 10.5, 40, 1.5, 0.05, 0], pack: [160, 258, '1箱（約8皿分）'], shelf: { pantry: 180 }, store: 'pantry' },
  { id: 'hijiki', name: '芽ひじき（乾）', aisle: '調味料・乾物', n: [180, 9.2, 3.2, 58.4, 51.8, 4.7, 1000, 6.2, 0.09, 0], pack: [20, 178, '20g'], shelf: { pantry: 180 }, store: 'pantry', veg: true },
  { id: 'wakame', name: '乾燥わかめ', aisle: '調味料・乾物', n: [186, 17.9, 4, 41.8, 39.2, 16.6, 780, 6.1, 0.39, 27], pack: [30, 198, '30g'], shelf: { pantry: 180 }, store: 'pantry', veg: true },
  // 常備調味料（staple）
  { id: 'soy', name: '醤油', aisle: '調味料・乾物', unit: 'ml', gpu: 1.18, n: [77, 7.7, 0, 7.9, 0, 14.5, 29, 1.7, 0.05, 0], pack: [1000, 298, '1L'], shelf: { pantry: 365 }, store: 'pantry', staple: true },
  { id: 'mirin', name: 'みりん', aisle: '調味料・乾物', unit: 'ml', gpu: 1.17, n: [241, 0.3, 0, 43.2, 0, 0, 2, 0, 0, 0], pack: [1000, 398, '1L'], shelf: { pantry: 365 }, store: 'pantry', staple: true },
  { id: 'sake', name: '料理酒', aisle: '調味料・乾物', unit: 'ml', gpu: 1, n: [88, 0.2, 0, 4.7, 0, 2.2, 3, 0, 0, 0], pack: [1000, 298, '1L'], shelf: { pantry: 365 }, store: 'pantry', staple: true },
  { id: 'salt', name: '塩', aisle: '調味料・乾物', n: [0, 0, 0, 0, 0, 99.5, 22, 0, 0, 0], pack: [1000, 158, '1kg'], shelf: { pantry: 999 }, store: 'pantry', staple: true },
  { id: 'sugar', name: '砂糖', aisle: '調味料・乾物', n: [384, 0, 0, 99.3, 0, 0, 1, 0, 0, 0], pack: [1000, 228, '1kg'], shelf: { pantry: 999 }, store: 'pantry', staple: true },
  { id: 'pepper', name: 'こしょう', aisle: '調味料・乾物', n: [362, 11, 6, 66.6, 0, 0.2, 410, 20, 0.1, 0], pack: [50, 198, '50g'], shelf: { pantry: 365 }, store: 'pantry', staple: true },
  { id: 'oil', name: 'サラダ油', aisle: '調味料・乾物', unit: 'ml', gpu: 0.92, n: [921, 0, 100, 0, 0, 0, 0, 0, 0, 0], pack: [1000, 398, '1L'], shelf: { pantry: 365 }, store: 'pantry', staple: true },
  { id: 'olive_oil', name: 'オリーブオイル', aisle: '調味料・乾物', unit: 'ml', gpu: 0.92, n: [921, 0, 100, 0, 0, 0, 0, 0, 0, 0], pack: [450, 698, '450ml'], shelf: { pantry: 365 }, store: 'pantry', staple: true },
  { id: 'vinegar', name: '酢', aisle: '調味料・乾物', unit: 'ml', gpu: 1, n: [25, 0.1, 0, 2.4, 0, 0, 2, 0.1, 0.01, 0], pack: [500, 198, '500ml'], shelf: { pantry: 365 }, store: 'pantry', staple: true },
  { id: 'mentsuyu', name: 'めんつゆ（3倍）', aisle: '調味料・乾物', unit: 'ml', gpu: 1.15, n: [98, 4.4, 0, 20, 0, 9.9, 15, 0.8, 0.03, 0], pack: [500, 298, '500ml'], shelf: { pantry: 180 }, store: 'pantry', staple: true },
  { id: 'sesame_oil', name: 'ごま油', aisle: '調味料・乾物', unit: 'ml', gpu: 0.92, n: [921, 0, 100, 0, 0, 0, 1, 0.1, 0, 0], pack: [300, 398, '300ml'], shelf: { pantry: 365 }, store: 'pantry', staple: true },
  { id: 'shirodashi', name: '白だし', aisle: '調味料・乾物', unit: 'ml', gpu: 1.15, n: [69, 2.4, 0, 10, 0, 12.5, 10, 0.3, 0, 0], pack: [500, 398, '500ml'], shelf: { pantry: 180 }, store: 'pantry', staple: true },
  { id: 'dashi', name: 'だしの素（顆粒）', aisle: '調味料・乾物', n: [223, 24.2, 0.3, 31.1, 0, 40.6, 42, 1.2, 0.02, 0], pack: [100, 298, '100g'], shelf: { pantry: 365 }, store: 'pantry', staple: true },
  { id: 'consomme', name: 'コンソメ（顆粒）', aisle: '調味料・乾物', n: [233, 7, 4.3, 41.8, 0.3, 43.2, 26, 0.4, 0.03, 0], pack: [100, 298, '100g'], shelf: { pantry: 365 }, store: 'pantry', staple: true },
  { id: 'torigara', name: '鶏がらスープの素', aisle: '調味料・乾物', n: [211, 12.5, 1.8, 37.1, 0, 47.5, 20, 0.5, 0.03, 0], pack: [100, 298, '100g'], shelf: { pantry: 365 }, store: 'pantry', staple: true },
  { id: 'garlic', name: 'にんにく', aisle: '調味料・乾物', n: [129, 6.4, 0.9, 27.5, 6.2, 0, 14, 0.8, 0.19, 12], pack: [40, 128, 'チューブ'], shelf: { fridge: 60 }, store: 'fridge', staple: true },
  { id: 'ginger', name: 'しょうが', aisle: '調味料・乾物', n: [28, 0.9, 0.3, 6.6, 2.1, 0, 12, 0.5, 0.03, 2], pack: [40, 128, 'チューブ'], shelf: { fridge: 60 }, store: 'fridge', staple: true },
  { id: 'oyster', name: 'オイスターソース', aisle: '調味料・乾物', unit: 'ml', gpu: 1.2, n: [105, 7.7, 0.3, 18.3, 0.2, 11.4, 25, 1.2, 0.01, 0], pack: [140, 248, '140g'], shelf: { fridge: 90 }, store: 'fridge', staple: true },
  { id: 'ketchup', name: 'ケチャップ', aisle: '調味料・乾物', n: [104, 1.6, 0.2, 27.6, 1.7, 3.1, 16, 0.5, 0.06, 8], pack: [300, 198, '300g'], shelf: { fridge: 60 }, store: 'fridge', staple: true },
  { id: 'katakuriko', name: '片栗粉', aisle: '調味料・乾物', n: [330, 0.1, 0.1, 81.6, 0, 0, 10, 0.6, 0, 0], pack: [200, 158, '200g'], shelf: { pantry: 365 }, store: 'pantry', staple: true },
  { id: 'mayo', name: 'マヨネーズ', aisle: '調味料・乾物', n: [668, 1.4, 76, 3.6, 0, 1.9, 8, 0.3, 0.01, 0], pack: [350, 298, '350g'], shelf: { fridge: 30 }, store: 'fridge', staple: true },
  { id: 'tobanjan', name: '豆板醤', aisle: '調味料・乾物', n: [49, 2, 2.3, 7.9, 4.3, 17.8, 32, 2.3, 0.04, 3], pack: [90, 198, '90g'], shelf: { fridge: 90 }, store: 'fridge', staple: true },
]

export const INGREDIENTS: Ingredient[] = defs.map((d) => ({
  id: d.id,
  name: d.name,
  aisle: d.aisle,
  unit: d.unit ?? 'g',
  gramsPerUnit: d.gpu,
  per100g: { kcal: d.n[0], protein: d.n[1], fat: d.n[2], carbs: d.n[3], fiber: d.n[4], salt: d.n[5], calcium: d.n[6], iron: d.n[7], vitB1: d.n[8], vitC: d.n[9] },
  pack: { size: d.pack[0], price: d.pack[1], label: d.pack[2] },
  shelfDays: d.shelf,
  defaultStorage: d.store ?? 'fridge',
  isVeg: d.veg,
  needsWash: d.wash,
  rawMeat: d.raw,
  staple: d.staple,
  frequent: d.frequent,
}))

export const INGREDIENT_MAP: Record<string, Ingredient> = Object.fromEntries(INGREDIENTS.map((i) => [i.id, i]))

export const AISLE_ORDER: string[] = ['青果', '精肉', '鮮魚', '日配', '米・麺・パン', '冷凍', '調味料・乾物', 'その他']

export function ingredientName(id: string) {
  return INGREDIENT_MAP[id]?.name ?? id
}
