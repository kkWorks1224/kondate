import { buildRecipe, RECIPE_COLORS, safetyFor, type RecipeDef } from '../services/ai/recipeGenerator'
import type { Recipe } from '../types'

const AT = new Date('2026-11-14T09:00:00+09:00').toISOString()

/* ---------- 詳細サンプルレシピ（AI提案として登録・編集可能） ---------- */
const shogayaki: Recipe = {
  id: 'shogayaki', name: '生姜焼き', subtitle: '豚ロース・玉ねぎ・千切りキャベツ', role: 'main',
  canMake: true, liked: true, isNew: false, starred: true, source: 'ai-detailed',
  ingredients: [
    { ingredientId: 'pork_loin', amount: 120, cut: '筋切り' },
    { ingredientId: 'onion', amount: 50, cut: '薄切り' },
    { ingredientId: 'cabbage', amount: 60, cut: '千切り', note: '付け合わせ。別容器で冷蔵' },
    { ingredientId: 'soy', amount: 15 },
    { ingredientId: 'mirin', amount: 15 },
    { ingredientId: 'sake', amount: 10 },
    { ingredientId: 'ginger', amount: 8 },
    { ingredientId: 'katakuriko', amount: 3 },
    { ingredientId: 'oil', amount: 4 },
  ],
  steps: [
    { id: 's1', kind: 'wash', title: '玉ねぎの皮をむき、キャベツを洗う', durationMin: 2, scaling: 'sublinear', attended: true, tools: ['colander'], ingredientIds: ['onion', 'cabbage'], dependsOn: [] },
    { id: 's2', kind: 'cut', title: '玉ねぎを薄切りにする', durationMin: 1, scaling: 'linear', attended: true, tools: ['board', 'knife|slicer'], target: { ingredientId: 'onion', cut: '薄切り' }, dependsOn: ['s1'] },
    { id: 's3', kind: 'cut', title: 'キャベツを千切りにする', durationMin: 2, scaling: 'linear', attended: true, tools: ['board', 'knife|slicer'], target: { ingredientId: 'cabbage', cut: '千切り' }, dependsOn: ['s1'] },
    { id: 's4', kind: 'measure', title: '醤油・みりん・酒・すりおろし生姜を合わせる', durationMin: 1.5, scaling: 'sublinear', attended: true, tools: ['scale'], ingredientIds: ['soy', 'mirin', 'sake', 'ginger'], dependsOn: [] },
    { id: 's5', kind: 'raw', title: '豚肉を筋切りし、片栗粉を薄くまぶす', durationMin: 2, scaling: 'linear', attended: true, tools: ['board', 'knife'], target: { ingredientId: 'pork_loin', cut: '筋切り' }, dependsOn: [], safety: '生肉の後はまな板・包丁・手を洗う' },
    { id: 's6', kind: 'heat', title: '豚肉を両面焼く', detail: '重ならないよう広げ、片面1分半ずつ', durationMin: 4, scaling: 'pan', attended: true, tools: ['stove', 'pan_large'], dependsOn: ['s5'], heat: { method: '中火', coreTempC: 75, holdMin: 1 }, safety: safetyFor('pork_loin') },
    { id: 's7', kind: 'heat', title: '玉ねぎを加え、合わせ調味料を絡める', durationMin: 3, scaling: 'pan', attended: true, tools: ['stove', 'pan_large'], dependsOn: ['s6', 's2', 's4'], heat: { method: '中火で煮詰める' } },
    { id: 's8', kind: 'plate', title: 'キャベツを別容器に分ける', durationMin: 1, scaling: 'sublinear', attended: true, tools: ['container'], dependsOn: ['s3', 's7'] },
  ],
  freeze: 'good', fridgeDays: 3, freezerDays: 21,
  reheat: '冷蔵：600Wで1分30秒／冷凍：600Wで3分。中心まで熱くなるまで加熱',
  storageNote: 'キャベツは冷凍せず冷蔵2日以内',
  tags: ['定番', '10分以内に温め'], color: RECIPE_COLORS[0], updatedAt: AT,
}

const teriyaki: Recipe = {
  id: 'teriyaki', name: '鶏の照り焼き', subtitle: '鶏もも・ブロッコリー添え', role: 'main',
  canMake: true, liked: true, isNew: false, starred: false, source: 'ai-detailed',
  ingredients: [
    { ingredientId: 'chicken_thigh', amount: 150, cut: '筋と余分な脂を取る' },
    { ingredientId: 'broccoli', amount: 50, cut: '小房' },
    { ingredientId: 'soy', amount: 15 },
    { ingredientId: 'mirin', amount: 15 },
    { ingredientId: 'sake', amount: 15 },
    { ingredientId: 'sugar', amount: 3 },
    { ingredientId: 'oil', amount: 3 },
  ],
  steps: [
    { id: 's1', kind: 'wash', title: 'ブロッコリーを洗う', durationMin: 1, scaling: 'sublinear', attended: true, tools: ['colander'], ingredientIds: ['broccoli'], dependsOn: [] },
    { id: 's2', kind: 'cut', title: 'ブロッコリーを小房に分ける', durationMin: 1.5, scaling: 'linear', attended: true, tools: ['board', 'knife'], target: { ingredientId: 'broccoli', cut: '小房' }, dependsOn: ['s1'] },
    { id: 's3', kind: 'measure', title: 'たれ（醤油・みりん・酒・砂糖）を合わせる', durationMin: 1.5, scaling: 'sublinear', attended: true, tools: ['scale'], ingredientIds: ['soy', 'mirin', 'sake', 'sugar'], dependsOn: [] },
    { id: 's4', kind: 'raw', title: '鶏ももの筋と余分な脂を取り、厚みをそろえる', detail: '皮目をフォークで数か所刺す', durationMin: 3, scaling: 'linear', attended: true, tools: ['board', 'knife'], target: { ingredientId: 'chicken_thigh', cut: '筋と余分な脂を取る' }, dependsOn: [], safety: '生肉の後はまな板・包丁・手を洗う' },
    { id: 's5', kind: 'simmer', title: '皮目を下にして焼く（押さえずに置く）', durationMin: 5, scaling: 'pan', attended: false, tools: ['stove', 'pan_large|pan_small'], dependsOn: ['s4'], heat: { method: '中火で5分、皮がきつね色になるまで' } },
    { id: 's6', kind: 'simmer', title: '裏返して蓋をし、弱火で蒸し焼き', durationMin: 5, scaling: 'pan', attended: false, tools: ['stove', 'pan_large|pan_small'], dependsOn: ['s5'], heat: { method: '弱火5分', coreTempC: 75, holdMin: 1 }, safety: safetyFor('chicken_thigh') },
    { id: 's7', kind: 'heat', title: '余分な脂を拭き、たれを煮絡める', durationMin: 2, scaling: 'pan', attended: true, tools: ['stove', 'pan_large|pan_small', 'thermometer'], dependsOn: ['s6', 's3'], heat: { method: '中火でとろみが出るまで' }, safety: '温度計で中心75℃以上を確認' },
    { id: 's8', kind: 'simmer', title: 'ブロッコリーをレンジ加熱', durationMin: 2, scaling: 'sublinear', attended: false, tools: ['microwave', 'muji_range'], dependsOn: ['s2'], heat: { method: '600Wで2分' } },
    { id: 's9', kind: 'cut', title: '焼き上がった鶏肉を食べやすく切る', durationMin: 1, scaling: 'linear', attended: true, tools: ['board', 'knife'], target: { ingredientId: 'chicken_thigh', cut: '加熱後切り分け' }, dependsOn: ['s7'], safety: '生肉に使ったまな板は洗浄済みのものを使う' },
  ],
  freeze: 'good', fridgeDays: 3, freezerDays: 21,
  reheat: '冷蔵：600Wで1分30秒／冷凍：解凍モード後600Wで1分。中心まで熱くなるまで',
  storageNote: '冷凍時はたれごと真空パックにすると乾燥しにくい',
  tags: ['高たんぱく', '冷凍向き'], color: RECIPE_COLORS[1], updatedAt: AT,
}

const butakimchi: Recipe = {
  id: 'butakimchi', name: '豚キムチ', subtitle: '豚バラ・キムチ・玉ねぎ・長ねぎ', role: 'main',
  canMake: true, liked: true, isNew: false, starred: false, source: 'ai-detailed',
  ingredients: [
    { ingredientId: 'pork_belly', amount: 90, cut: 'はさみで切る', note: '4cm幅' },
    { ingredientId: 'kimchi', amount: 80 },
    { ingredientId: 'onion', amount: 50, cut: 'くし切り' },
    { ingredientId: 'leek', amount: 20, cut: '斜め切り' },
    { ingredientId: 'sesame_oil', amount: 4 },
    { ingredientId: 'soy', amount: 5 },
    { ingredientId: 'sake', amount: 5 },
  ],
  steps: [
    { id: 's1', kind: 'wash', title: '玉ねぎの皮をむき、長ねぎを洗う', durationMin: 1.5, scaling: 'sublinear', attended: true, tools: ['colander'], ingredientIds: ['onion', 'leek'], dependsOn: [] },
    { id: 's2', kind: 'cut', title: '玉ねぎをくし切りにする', durationMin: 1, scaling: 'linear', attended: true, tools: ['board', 'knife'], target: { ingredientId: 'onion', cut: 'くし切り' }, dependsOn: ['s1'] },
    { id: 's3', kind: 'cut', title: '長ねぎを斜め切りにする', durationMin: 1, scaling: 'linear', attended: true, tools: ['board', 'knife'], target: { ingredientId: 'leek', cut: '斜め切り' }, dependsOn: ['s1'] },
    { id: 's4', kind: 'measure', title: '醤油・酒を合わせる', durationMin: 1, scaling: 'sublinear', attended: true, tools: ['scale'], ingredientIds: ['soy', 'sake'], dependsOn: [] },
    { id: 's5', kind: 'raw', title: '豚バラをキッチンばさみで4cm幅に切る', detail: 'まな板を使わずに済む', durationMin: 1, scaling: 'linear', attended: true, tools: ['scissors'], target: { ingredientId: 'pork_belly', cut: 'はさみで切る' }, dependsOn: [], safety: '使用後のはさみと手を洗う' },
    { id: 's6', kind: 'heat', title: 'ごま油で豚バラを炒める', durationMin: 3, scaling: 'pan', attended: true, tools: ['stove', 'pan_large|pan_small'], dependsOn: ['s5'], heat: { method: '中火で色が完全に変わるまで', coreTempC: 75, holdMin: 1 }, safety: safetyFor('pork_belly') },
    { id: 's7', kind: 'heat', title: '玉ねぎ・長ねぎを加えて炒める', durationMin: 2, scaling: 'pan', attended: true, tools: ['stove', 'pan_large|pan_small'], dependsOn: ['s6', 's2', 's3'] },
    { id: 's8', kind: 'heat', title: 'キムチと調味料を加えて炒め合わせる', durationMin: 1.5, scaling: 'pan', attended: true, tools: ['stove', 'pan_large|pan_small'], dependsOn: ['s7', 's4'] },
  ],
  freeze: 'ok', fridgeDays: 2, freezerDays: 21,
  reheat: '冷蔵：600Wで1分30秒／冷凍：600Wで3分。全体が熱くなるまで',
  storageNote: '冷凍すると玉ねぎの食感がやや変わる',
  tags: ['10分以内に温め', '在庫活用'], color: RECIPE_COLORS[2], updatedAt: AT,
}

/* ---------- テンプレート定義（ルールベース生成） ---------- */
export const CAN_MAKE_DEFS: RecipeDef[] = [
  { id: 'curry', name: 'カレー', subtitle: '豚こま・じゃがいも・にんじん', role: 'one-dish', method: 'roux', items: [['pork_koma', 70, '一口大'], ['onion', 80, 'くし切り'], ['carrot', 40, '乱切り'], ['potato', 60, '一口大']], seasoning: [['curry_roux', 18], ['oil', 3]], canMake: true, liked: true, freeze: 'ok', storageNote: 'じゃがいもは冷凍で食感が変わる。冷凍分はつぶすと良い', rice: 60 },
  { id: 'stew', name: 'シチュー', subtitle: '鶏もも・ブロッコリー', role: 'main', method: 'roux', items: [['chicken_thigh', 80, '一口大'], ['onion', 60, 'くし切り'], ['carrot', 40, '乱切り'], ['potato', 50, '一口大'], ['broccoli', 30, '小房'], ['milk', 80]], seasoning: [['stew_roux', 18], ['oil', 3]], canMake: true, freeze: 'ok' },
  { id: 'hayashi', name: 'ハヤシライス', subtitle: '牛こま・玉ねぎ・きのこ', role: 'one-dish', method: 'roux', items: [['beef_koma', 70, '一口大'], ['onion', 100, '薄切り'], ['kinoko_mix', 40, '石づきを取ってほぐす']], seasoning: [['hayashi_roux', 18], ['ketchup', 8], ['oil', 3]], canMake: true, freeze: 'good', rice: 60 },
  { id: 'misoshiru', name: '味噌汁', subtitle: '豆腐・わかめ・長ねぎ', role: 'soup', method: 'soup', items: [['tofu', 50, 'さいの目'], ['leek', 15, '小口切り'], ['wakame', 1]], seasoning: [['miso', 12], ['dashi', 1]], canMake: true, freeze: 'ng', fridgeDays: 2, reheat: '小鍋で沸騰直前まで温める' },
  { id: 'vegsoup', name: '野菜スープ', subtitle: 'キャベツ・にんじん・玉ねぎ', role: 'soup', method: 'soup', items: [['cabbage', 50, 'ざく切り'], ['carrot', 20, 'いちょう切り'], ['onion', 30, '薄切り'], ['kinoko_mix', 20, '石づきを取ってほぐす']], seasoning: [['consomme', 2], ['salt', 0.3], ['pepper', 0.1]], canMake: true, freeze: 'good', fridgeDays: 3 },
  { id: 'yasaiitame', name: '野菜炒め', subtitle: '豚こま・キャベツ・もやし', role: 'main', method: 'stirfry', items: [['pork_koma', 70, undefined], ['cabbage', 80, 'ざく切り'], ['moyashi', 60], ['carrot', 20, '短冊切り']], seasoning: [['torigara', 2], ['soy', 5], ['oil', 5], ['pepper', 0.1]], canMake: true, freeze: 'ng', fridgeDays: 1, reheat: '作りたてが前提。当日〜翌日', tags: ['当日調理向き'] },
  { id: 'hoikoro', name: '回鍋肉', subtitle: '豚バラ・キャベツ・ピーマン', role: 'main', method: 'stirfry', items: [['pork_belly', 80, '4cm幅'], ['cabbage', 100, 'ざく切り'], ['piman', 30, '乱切り']], seasoning: [['miso', 8], ['tobanjan', 2], ['sugar', 3], ['soy', 3], ['sake', 5], ['oil', 3]], canMake: true, freeze: 'ok', fridgeDays: 2 },
  { id: 'mapo', name: '麻婆豆腐', subtitle: '豆腐・豚ひき肉', role: 'main', method: 'mapo', items: [['tofu', 150, 'さいの目'], ['pork_minced', 50, undefined], ['leek', 20, 'みじん切り']], seasoning: [['tobanjan', 3], ['torigara', 2], ['soy', 5], ['sugar', 2], ['katakuriko', 4], ['garlic', 2], ['ginger', 2], ['sesame_oil', 3]], canMake: true, freeze: 'ok', fridgeDays: 2, storageNote: '豆腐は冷凍で食感が変わる' },
  { id: 'chinjao', name: '青椒肉絲', subtitle: '豚こま・ピーマン・たけのこ', role: 'main', method: 'stirfry', items: [['pork_koma', 80, '細切り'], ['piman', 60, '細切り'], ['takenoko', 40, '細切り']], seasoning: [['oyster', 8], ['soy', 4], ['sake', 5], ['katakuriko', 3], ['oil', 4]], canMake: true, freeze: 'good' },
  { id: 'yakizakana', name: '焼き魚', subtitle: 'さばの塩焼き', role: 'main', method: 'grill-fish', items: [['mackerel', 100, undefined]], seasoning: [['salt', 1]], canMake: true, freeze: 'ok', fridgeDays: 2, reheat: 'ラップをして600Wで1分', storageNote: '焼いた後は冷蔵2日。生のまま冷凍する方が風味が良い' },
  { id: 'salmon_foil', name: '鮭のホイル焼き', subtitle: '鮭・きのこ・玉ねぎ', role: 'main', method: 'foil', items: [['salmon', 80, undefined], ['onion', 30, '薄切り'], ['kinoko_mix', 40, '石づきを取ってほぐす']], seasoning: [['soy', 5], ['sake', 5]], canMake: true, freeze: 'ok', fridgeDays: 2 },
  { id: 'pasta', name: 'パスタ', subtitle: 'きのこと鶏むねの和風', role: 'one-dish', method: 'pasta', items: [['pasta', 80, undefined], ['chicken_breast', 70, 'そぎ切り'], ['kinoko_mix', 50, '石づきを取ってほぐす'], ['komatsuna', 40, '4cm幅']], seasoning: [['soy', 8], ['olive_oil', 6], ['garlic', 2]], canMake: true, freeze: 'ng', fridgeDays: 1, reheat: '作りたてが前提', tags: ['当日調理向き'] },
]

export const LIKED_DEFS: RecipeDef[] = [
  { id: 'nikujaga', name: '肉じゃが', role: 'main', method: 'nimono', items: [['pork_koma', 60, undefined], ['potato', 100, '一口大'], ['onion', 60, 'くし切り'], ['carrot', 30, '乱切り']], seasoning: [['soy', 12], ['mirin', 12], ['sugar', 4], ['sake', 10], ['dashi', 1]], liked: true, freeze: 'ng', fridgeDays: 3, storageNote: 'じゃがいもは冷凍に不向き' },
  { id: 'tonjiru', name: '豚汁', role: 'soup', method: 'soup', items: [['pork_belly', 30, '4cm幅'], ['daikon', 40, 'いちょう切り'], ['carrot', 20, 'いちょう切り'], ['gobo', 15, 'ささがき'], ['leek', 10, '小口切り'], ['tofu', 30, 'さいの目']], seasoning: [['miso', 14], ['dashi', 1]], liked: true, freeze: 'ok', fridgeDays: 3, storageNote: '豆腐を入れない分は冷凍しやすい' },
  { id: 'gyoza', name: '餃子', role: 'main', method: 'gyoza', items: [['pork_minced', 60, undefined], ['napa', 60, 'みじん切り'], ['leek', 15, 'みじん切り'], ['gyoza_skin', 8]], seasoning: [['soy', 4], ['sesame_oil', 3], ['garlic', 2], ['ginger', 2], ['oil', 3]], liked: true, freeze: 'good', storageNote: '焼かずに生のまま冷凍し、凍ったまま焼く' },
  { id: 'hamburg', name: 'ハンバーグ', role: 'main', method: 'hamburg', items: [['pork_minced', 100, undefined], ['onion', 40, 'みじん切り'], ['egg', 0.3], ['panko', 6]], seasoning: [['salt', 0.6], ['pepper', 0.1], ['ketchup', 15], ['oil', 3]], liked: true, freeze: 'good' },
  { id: 'karaage', name: '唐揚げ', role: 'main', method: 'karaage', items: [['chicken_thigh', 130, '一口大']], seasoning: [['soy', 8], ['sake', 5], ['garlic', 2], ['ginger', 2], ['katakuriko', 10], ['oil', 10]], liked: true, freeze: 'good', reheat: 'トースターで温めると衣が戻る。レンジなら600Wで1分' },
  { id: 'oyakodon', name: '親子丼', role: 'one-dish', method: 'donburi', items: [['chicken_thigh', 80, '一口大'], ['onion', 50, '薄切り'], ['egg', 1.5]], seasoning: [['mentsuyu', 20], ['sugar', 2]], liked: true, freeze: 'ng', fridgeDays: 1, egg: true, rice: 60, tags: ['当日調理向き'] },
  { id: 'gyudon', name: '牛丼', role: 'one-dish', method: 'donburi', items: [['beef_koma', 80, undefined], ['onion', 60, '薄切り']], seasoning: [['soy', 12], ['mirin', 12], ['sugar', 3], ['sake', 10], ['ginger', 2]], liked: true, freeze: 'good', rice: 60 },
  { id: 'soboro', name: 'そぼろ丼', role: 'one-dish', method: 'stirfry', items: [['pork_minced', 70, undefined], ['komatsuna', 40, '小口切り']], seasoning: [['soy', 8], ['mirin', 8], ['sugar', 3], ['ginger', 2]], liked: true, freeze: 'good', rice: 60, pan: 'pan_small', egg: true },
  { id: 'nizakana', name: '煮魚', subtitle: 'さばの煮付け', role: 'main', method: 'nimono', items: [['mackerel', 100, undefined], ['ginger', 3]], seasoning: [['soy', 12], ['mirin', 12], ['sake', 15], ['sugar', 4]], liked: true, freeze: 'good' },
  { id: 'chahan', name: 'チャーハン', role: 'one-dish', method: 'fried-rice', items: [['egg', 1], ['leek', 20, 'みじん切り'], ['pork_belly', 30, '4cm幅']], seasoning: [['torigara', 2], ['soy', 3], ['oil', 6], ['pepper', 0.1]], liked: true, freeze: 'good', rice: 70, egg: true },
  { id: 'omurice', name: 'オムライス', role: 'one-dish', method: 'omurice', items: [['chicken_thigh', 50, '角切り'], ['onion', 40, 'みじん切り'], ['egg', 2]], seasoning: [['ketchup', 25], ['oil', 5], ['salt', 0.3]], liked: true, freeze: 'ok', rice: 70, storageNote: 'ケチャップライスのみ冷凍し、卵は食べる日に焼く' },
  { id: 'yakisoba', name: '焼きそば', role: 'one-dish', method: 'stirfry', items: [['chuka_men', 150, undefined], ['pork_koma', 60, undefined], ['cabbage', 80, 'ざく切り'], ['moyashi', 50]], seasoning: [['oyster', 6], ['soy', 4], ['oil', 5]], liked: true, freeze: 'ok', fridgeDays: 2 },
  { id: 'nabe', name: '鍋料理', subtitle: '鶏と白菜の白だし鍋', role: 'main', method: 'nabe', items: [['chicken_thigh', 100, '一口大'], ['napa', 120, 'ざく切り'], ['leek', 30, '斜め切り'], ['tofu', 80, 'さいの目'], ['shiitake', 30, '石づきを取ってほぐす']], seasoning: [['shirodashi', 30]], liked: true, freeze: 'ng', fridgeDays: 1, tags: ['当日調理向き'] },
  { id: 'kinpira', name: 'きんぴらごぼう', role: 'side', method: 'stirfry', items: [['gobo', 50, 'ささがき'], ['carrot', 20, '細切り']], seasoning: [['soy', 5], ['mirin', 5], ['sugar', 2], ['sesame_oil', 3]], liked: true, freeze: 'good', fridgeDays: 4, pan: 'pan_small' },
  { id: 'hijikini', name: 'ひじき煮', role: 'side', method: 'hijiki', items: [['hijiki', 5], ['carrot', 20, '細切り'], ['aburaage', 10, '短冊切り']], seasoning: [['soy', 6], ['mirin', 6], ['sugar', 2], ['dashi', 1], ['oil', 2]], liked: true, freeze: 'good', fridgeDays: 4 },
  { id: 'ohitashi', name: 'ほうれん草のおひたし', role: 'side', method: 'ohitashi', items: [['spinach', 70, undefined]], seasoning: [['mentsuyu', 6]], liked: true, freeze: 'ok', fridgeDays: 2 },
  { id: 'potesara', name: 'ポテトサラダ', role: 'side', method: 'potato-salad', items: [['potato', 80, '一口大'], ['carrot', 15, 'いちょう切り'], ['egg', 0.5]], seasoning: [['mayo', 12], ['salt', 0.3], ['pepper', 0.1]], liked: true, freeze: 'ng', fridgeDays: 2, egg: true },
]

// 小松菜の副菜（作れる料理ではないが、在庫・栄養のバランス用にAIが追加した新規提案）
export const NEW_DEFS: RecipeDef[] = [
  { id: 'komatsuna_ohitashi', name: '小松菜のおひたし', role: 'side', method: 'ohitashi', items: [['komatsuna', 70, undefined]], seasoning: [['mentsuyu', 6]], isNew: true, freeze: 'ok', fridgeDays: 2, tags: ['カルシウム', '鉄'] },
  { id: 'napa_soup', name: '白菜と卵のスープ', role: 'soup', method: 'soup', items: [['napa', 60, 'ざく切り'], ['egg', 0.5], ['leek', 10, '斜め切り']], seasoning: [['torigara', 2], ['salt', 0.3]], isNew: true, freeze: 'ng', fridgeDays: 2, tags: ['在庫活用'] },
]

export const RECIPE_LIBRARY: RecipeDef[] = [...CAN_MAKE_DEFS, ...LIKED_DEFS, ...NEW_DEFS]

export function buildSeedRecipes(): Recipe[] {
  const generated = RECIPE_LIBRARY.map((d, i) => buildRecipe(d, i + 3))
  return [shogayaki, teriyaki, butakimchi, ...generated]
}
