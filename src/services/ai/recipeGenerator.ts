// ルールベースのレシピ生成器。
// 料理名・材料・調理法（method）から、器具・依存関係・衛生条件つきの工程を組み立てる。
// 将来は LLM が RecipeDef 相当の JSON を返し、このビルダーで正規化・検証する想定。

import { INGREDIENT_MAP, INGREDIENTS } from '../../data/ingredients'
import type { FreezeFit, Recipe, RecipeIngredient, RecipeStep, Role } from '../../types'

export type Method =
  | 'stirfry'
  | 'roux'
  | 'nimono'
  | 'soup'
  | 'grill-fish'
  | 'foil'
  | 'ohitashi'
  | 'hijiki'
  | 'pasta'
  | 'donburi'
  | 'gyoza'
  | 'hamburg'
  | 'karaage'
  | 'nabe'
  | 'fried-rice'
  | 'omurice'
  | 'potato-salad'
  | 'mapo'

export interface RecipeDef {
  id: string
  name: string
  subtitle?: string
  role: Role
  method: Method
  items: [string, number, string?][]
  seasoning: [string, number][]
  canMake?: boolean
  liked?: boolean
  isNew?: boolean
  freeze: FreezeFit
  fridgeDays?: number
  freezerDays?: number
  reheat?: string
  storageNote?: string
  tags?: string[]
  pan?: 'pan_large' | 'pan_small'
  rice?: number // 1食あたりの米（g）
  egg?: boolean
}

export const RECIPE_COLORS = ['#1F8A5B', '#3D7CC9', '#B97A0E', '#A6466B', '#3F8C8A', '#8A5A44', '#5B7F2B', '#C05B2C', '#2F5F8A']

// 100gあたりの切る時間（分）の目安
const CUT_RATE: Record<string, number> = {
  薄切り: 1.0, くし切り: 0.8, みじん切り: 2.2, 千切り: 2.0, 一口大: 0.9, 乱切り: 0.9, ざく切り: 0.6, 斜め切り: 0.8,
  小口切り: 1.0, 角切り: 1.2, 小房: 1.4, ささがき: 3.0, 細切り: 2.0, 短冊切り: 1.5, いちょう切り: 1.2, 半月切り: 1.0,
  そぎ切り: 1.2, '4cm幅': 0.6, '3cm長さ': 0.6, 筋切り: 0.8, 'はさみで切る': 0.6, 石づきを取ってほぐす: 0.5, 'さいの目': 1.0,
}
const SLICER_OK = new Set(['薄切り', '千切り', '細切り'])

export function cutMinutes(cut: string | undefined, grams: number) {
  const rate = (cut ? CUT_RATE[cut] : undefined) ?? 1
  return Math.max(1, Math.round((0.5 + (rate * grams) / 100) * 2) / 2)
}

export function gramsOf(ingredientId: string, amount: number) {
  const ing = INGREDIENT_MAP[ingredientId]
  if (!ing) return amount
  return ing.unit === 'g' ? amount : amount * (ing.gramsPerUnit ?? 1)
}

export function safetyFor(ingredientId: string): string | undefined {
  const ing = INGREDIENT_MAP[ingredientId]
  if (!ing?.rawMeat) return undefined
  if (ingredientId === 'pork_minced') return 'ひき肉は内部まで菌が入りやすい。中心温度75℃で1分以上加熱し、赤い部分が残らないこと'
  if (ing.rawMeat === 'poultry') return '鶏肉は中心温度75℃で1分以上。切り口に赤みや透明な肉汁が残らないこと（温度計で確認）'
  if (ing.rawMeat === 'fish') return '魚は中心まで火を通す（75℃で1分以上が目安）'
  return '豚肉・牛肉は中心部まで十分に加熱（75℃で1分以上相当）。ピンク色が残らないこと'
}

export function buildRecipe(def: RecipeDef, index = 0): Recipe {
  let n = 0
  const sid = () => `s${++n}`
  const steps: RecipeStep[] = []
  const ings: RecipeIngredient[] = def.items.map(([ingredientId, amount, cut]) => ({ ingredientId, amount, cut }))
  const seasoning: RecipeIngredient[] = def.seasoning.map(([ingredientId, amount]) => ({ ingredientId, amount }))

  // 1. 洗う
  const washIds = ings.filter((i) => INGREDIENT_MAP[i.ingredientId]?.needsWash).map((i) => i.ingredientId)
  let washId: string | undefined
  if (washIds.length) {
    washId = sid()
    steps.push({ id: washId, kind: 'wash', title: '野菜を洗う・皮をむく', durationMin: 1 + 0.5 * washIds.length, scaling: 'sublinear', attended: true, tools: ['colander'], ingredientIds: washIds, dependsOn: [] })
  }

  // 2. 切る（野菜など、生肉以外）
  const vegCut: Record<string, string> = {}
  for (const i of ings) {
    const ing = INGREDIENT_MAP[i.ingredientId]
    if (!ing || ing.rawMeat || !i.cut) continue
    const id = sid()
    vegCut[i.ingredientId] = id
    const deps = ing.needsWash && washId ? [washId] : []
    steps.push({
      id, kind: 'cut', title: `${ing.name}を${i.cut}${/切り$|切る$/.test(i.cut) ? '' : 'に'}する`, durationMin: cutMinutes(i.cut, gramsOf(i.ingredientId, i.amount)), scaling: 'linear', attended: true,
      tools: i.cut === '石づきを取ってほぐす' ? ['knife|scissors'] : ['board', SLICER_OK.has(i.cut) ? 'knife|slicer' : 'knife'],
      target: { ingredientId: i.ingredientId, cut: i.cut }, dependsOn: deps,
    })
  }

  // 3. 調味料の計量
  let measureId: string | undefined
  if (seasoning.length) {
    measureId = sid()
    steps.push({ id: measureId, kind: 'measure', title: '調味料を計量して合わせる', detail: seasoning.map((s) => INGREDIENT_MAP[s.ingredientId]?.name).join('・'), durationMin: 1 + 0.25 * seasoning.length, scaling: 'sublinear', attended: true, tools: ['scale'], ingredientIds: seasoning.map((s) => s.ingredientId), dependsOn: [] })
  }

  // 4. 生肉・生魚の下処理
  const rawIds: string[] = []
  const rawItems = ings.filter((i) => INGREDIENT_MAP[i.ingredientId]?.rawMeat)
  for (const i of rawItems) {
    if (!i.cut) continue
    const ing = INGREDIENT_MAP[i.ingredientId]!
    const id = sid()
    rawIds.push(id)
    steps.push({
      id, kind: 'raw', title: `${ing.name}を${i.cut}${/切り$|切る$/.test(i.cut) ? '' : 'に'}する`, durationMin: cutMinutes(i.cut, gramsOf(i.ingredientId, i.amount)), scaling: 'linear', attended: true,
      tools: i.cut === 'はさみで切る' ? ['scissors'] : ['board', 'knife'], target: { ingredientId: i.ingredientId, cut: i.cut }, dependsOn: [],
      safety: '生肉・生魚の後はまな板・包丁・手を洗う',
    })
  }

  const cuts = Object.values(vegCut)
  const meat = rawItems[0]
  const meatSafety = meat ? safetyFor(meat.ingredientId) : undefined
  const pan = def.pan ? def.pan : 'pan_large|pan_small'
  const prep = [...cuts, ...(measureId ? [measureId] : [])]
  const all = (...xs: (string | undefined)[]) => xs.filter(Boolean) as string[]
  const push = (s: Omit<RecipeStep, 'id'> & { id?: string }) => {
    const id = s.id ?? sid()
    steps.push({ ...s, id })
    return id
  }

  // ご飯もの: 炊飯は複数料理でまとめる
  let riceId: string | undefined
  if (def.rice) {
    const w = push({ kind: 'wash', title: '米を研いで炊飯器にセット', durationMin: 3, scaling: 'sublinear', attended: true, tools: ['rice_cooker'], dependsOn: [], mergeKey: 'rice-wash' })
    riceId = push({ kind: 'simmer', title: '炊飯（炊飯器）', durationMin: 45, scaling: 'fixed', attended: false, tools: ['rice_cooker'], dependsOn: [w], mergeKey: 'rice-cook', heat: { method: '炊飯器・普通炊き' } })
  }

  let last: string
  switch (def.method) {
    case 'stirfry':
    case 'fried-rice':
    case 'omurice': {
      let h1: string | undefined
      if (def.egg) h1 = push({ kind: 'heat', title: '卵を炒めて取り出す', durationMin: 2, scaling: 'pan', attended: true, tools: ['stove', pan], dependsOn: [], heat: { method: '強火で手早く' } })
      const h2 = meat
        ? push({ kind: 'heat', title: `${INGREDIENT_MAP[meat.ingredientId]!.name}を炒める`, durationMin: 4, scaling: 'pan', attended: true, tools: ['stove', pan], dependsOn: all(...rawIds, h1), heat: { method: '中火', coreTempC: 75, holdMin: 1 }, safety: meatSafety })
        : undefined
      const h3 = push({ kind: 'heat', title: def.method === 'stirfry' ? '野菜を加えて炒める' : 'ご飯と具を炒め合わせる', durationMin: 3, scaling: 'pan', attended: true, tools: ['stove', pan], dependsOn: all(h2, h1, ...cuts, riceId), heat: { method: '強めの中火' } })
      last = push({ kind: 'heat', title: '調味料を加えて全体に絡める', durationMin: 1, scaling: 'pan', attended: true, tools: ['stove', pan], dependsOn: all(h3, measureId) })
      if (def.method === 'omurice') last = push({ kind: 'heat', title: '卵で包む（食べる日に焼くと食感が良い）', durationMin: 3, scaling: 'linear', attended: true, tools: ['stove', 'pan_small'], dependsOn: [last] })
      break
    }
    case 'roux': {
      const h1 = push({ kind: 'heat', title: '肉と野菜を炒める', durationMin: 5, scaling: 'sublinear', attended: true, tools: ['stove', 'pot_large'], dependsOn: [...rawIds, ...cuts], heat: { method: '中火' }, safety: meatSafety })
      const s1 = push({ kind: 'simmer', title: '水を加えて煮込む（弱火・蓋）', detail: 'アクを取り、具材がやわらかくなるまで', durationMin: 15, scaling: 'fixed', attended: false, tools: ['stove', 'pot_large'], dependsOn: [h1], heat: { method: '弱火で15分', coreTempC: 75, holdMin: 1 } })
      last = push({ kind: 'heat', title: 'ルウを溶かしてとろみがつくまで煮る', durationMin: 5, scaling: 'sublinear', attended: true, tools: ['stove', 'pot_large'], dependsOn: all(s1, measureId), heat: { method: '弱火で混ぜながら' } })
      break
    }
    case 'nimono': {
      const h1 = push({ kind: 'heat', title: '煮汁を煮立てて具材を入れる', durationMin: 3, scaling: 'sublinear', attended: true, tools: ['stove', 'pot_small|yukihira'], dependsOn: all(...rawIds, ...cuts, measureId), heat: { method: '中火' } })
      const s1 = push({ kind: 'simmer', title: '落とし蓋をして煮る', durationMin: 15, scaling: 'fixed', attended: false, tools: ['stove', 'pot_small|yukihira'], dependsOn: [h1], heat: { method: '弱めの中火で15分', coreTempC: 75, holdMin: 1 }, safety: meatSafety })
      last = push({ kind: 'heat', title: '煮汁を全体に絡める', durationMin: 2, scaling: 'fixed', attended: true, tools: ['stove', 'pot_small|yukihira'], dependsOn: [s1] })
      break
    }
    case 'soup': {
      const h0 = meat ? push({ kind: 'heat', title: `${INGREDIENT_MAP[meat.ingredientId]!.name}を炒める`, durationMin: 2, scaling: 'sublinear', attended: true, tools: ['stove', 'pot_small|pot_large'], dependsOn: rawIds, heat: { method: '中火' } }) : undefined
      const s1 = push({ kind: 'simmer', title: '水と具材を入れて煮る', durationMin: 10, scaling: 'fixed', attended: false, tools: ['stove', 'pot_small|pot_large'], dependsOn: all(h0, ...cuts), heat: { method: '中火→弱火で10分', coreTempC: meat ? 75 : undefined, holdMin: meat ? 1 : undefined }, safety: meatSafety })
      last = push({ kind: 'heat', title: def.seasoning.some((s) => s[0] === 'miso') ? '火を止めて味噌を溶く' : '味を調える', durationMin: 1, scaling: 'sublinear', attended: true, tools: ['stove', 'pot_small|pot_large'], dependsOn: all(s1, measureId) })
      break
    }
    case 'grill-fish': {
      const fish = rawItems[0]
      const r1 = push({ kind: 'raw', title: '塩をふって10分置き、出た水気を拭く', durationMin: 1, scaling: 'sublinear', attended: true, tools: [], target: fish ? { ingredientId: fish.ingredientId } : undefined, dependsOn: [], safety: '生魚に触れた後は手を洗う' })
      const r2 = push({ kind: 'rest', title: '置いて臭みを抜く', durationMin: 10, scaling: 'fixed', attended: false, tools: [], dependsOn: [r1] })
      last = push({ kind: 'simmer', title: '魚焼きグリルで焼く（途中で返す）', durationMin: 11, scaling: 'fixed', attended: false, tools: ['grill'], dependsOn: [r2], heat: { method: '中火で片面6分・返して5分', coreTempC: 75, holdMin: 1 }, safety: fish ? safetyFor(fish.ingredientId) : undefined })
      break
    }
    case 'foil': {
      const h1 = push({ kind: 'raw', title: 'アルミホイルに具材と鮭をのせて包む', durationMin: 3, scaling: 'linear', attended: true, tools: [], dependsOn: all(...cuts, measureId), target: meat ? { ingredientId: meat.ingredientId } : undefined, safety: '生魚に触れた後は手を洗う' })
      last = push({ kind: 'simmer', title: 'フライパンで蒸し焼き（蓋・中火）', durationMin: 12, scaling: 'fixed', attended: false, tools: ['stove', 'pan_large|pan_small'], dependsOn: [h1], heat: { method: '水50mlを入れ、蓋をして中火12分', coreTempC: 75, holdMin: 1 }, safety: meatSafety })
      break
    }
    case 'ohitashi': {
      const green = ings[0]
      const m1 = push({ kind: 'simmer', title: 'レンジで加熱する', durationMin: 2, scaling: 'sublinear', attended: false, tools: ['microwave', 'muji_range'], dependsOn: all(washId), heat: { method: '600Wで2分（100gあたり）' } })
      const c1 = push({ kind: 'cut', title: '水にさらして絞り、4cm長さに切る', durationMin: 2, scaling: 'linear', attended: true, tools: ['board', 'knife'], dependsOn: [m1], target: green ? { ingredientId: green.ingredientId, cut: '加熱後4cm' } : undefined })
      last = push({ kind: 'plate', title: '調味料で和える', durationMin: 1, scaling: 'sublinear', attended: true, tools: ['bowl'], dependsOn: all(c1, measureId) })
      break
    }
    case 'hijiki': {
      const r = push({ kind: 'rest', title: 'ひじきを水で戻す（20分）', durationMin: 20, scaling: 'fixed', attended: false, tools: ['bowl'], dependsOn: [] })
      const d = push({ kind: 'wash', title: 'ざるにあげて水気を切る', durationMin: 1, scaling: 'fixed', attended: true, tools: ['colander'], dependsOn: [r] })
      last = push({ kind: 'heat', title: '具材を炒めて煮汁で炒め煮にする', durationMin: 8, scaling: 'sublinear', attended: true, tools: ['stove', 'pan_small|pan_large'], dependsOn: all(d, ...cuts, measureId), heat: { method: '中火で汁気がなくなるまで' } })
      break
    }
    case 'pasta': {
      const s1 = push({ kind: 'simmer', title: '湯を沸かしてパスタを茹でる', durationMin: 12, scaling: 'fixed', attended: false, tools: ['stove', 'pot_large'], dependsOn: [], heat: { method: '沸騰後、表示時間-1分' } })
      const h1 = push({ kind: 'heat', title: '具材を炒めてソースを作る', durationMin: 5, scaling: 'pan', attended: true, tools: ['stove', 'pan_large'], dependsOn: all(...rawIds, ...cuts), heat: { method: '中火', coreTempC: meat ? 75 : undefined }, safety: meatSafety })
      last = push({ kind: 'heat', title: '茹で上がったパスタとソースを和える', durationMin: 2, scaling: 'pan', attended: true, tools: ['stove', 'pan_large'], dependsOn: all(s1, h1, measureId) })
      break
    }
    case 'donburi': {
      const h1 = push({ kind: 'heat', title: '煮汁を煮立てて肉と玉ねぎを入れる', durationMin: 2, scaling: 'sublinear', attended: true, tools: ['stove', 'pan_small|yukihira'], dependsOn: all(...rawIds, ...cuts, measureId), heat: { method: '中火' } })
      last = push({ kind: 'simmer', title: '弱めの中火で煮る', durationMin: 7, scaling: 'fixed', attended: false, tools: ['stove', 'pan_small|yukihira'], dependsOn: [h1], heat: { method: '弱めの中火で7分', coreTempC: 75, holdMin: 1 }, safety: meatSafety })
      if (def.egg) last = push({ kind: 'heat', title: '溶き卵でとじる（食べる直前が望ましい）', durationMin: 2, scaling: 'linear', attended: true, tools: ['stove', 'pan_small|yukihira'], dependsOn: [last], heat: { method: '半熟は当日中に食べる' } })
      break
    }
    case 'gyoza': {
      const mince = rawItems.find((i) => i.ingredientId === 'pork_minced')
      const r1 = push({ kind: 'raw', title: 'ひき肉と野菜・調味料を混ぜてたねを作る', durationMin: 4, scaling: 'sublinear', attended: true, tools: ['bowl'], dependsOn: all(...cuts, measureId), target: mince ? { ingredientId: mince.ingredientId } : undefined, safety: '生肉をこねた後は手とボウルを洗う' })
      const r2 = push({ kind: 'raw', title: '皮で包む', durationMin: 12, scaling: 'linear', attended: true, tools: [], dependsOn: [r1], safety: '包み終えたらすぐ手を洗う。焼かない分は生のまま冷凍' })
      const h1 = push({ kind: 'heat', title: '並べて焼き色をつける', durationMin: 2, scaling: 'pan', attended: true, tools: ['stove', 'pan_large'], dependsOn: [r2] })
      last = push({ kind: 'simmer', title: '水を入れて蓋をし、蒸し焼きにする', durationMin: 6, scaling: 'pan', attended: false, tools: ['stove', 'pan_large'], dependsOn: [h1], heat: { method: '中火で6分→蓋を取り水分を飛ばす', coreTempC: 75, holdMin: 1 }, safety: safetyFor('pork_minced') })
      break
    }
    case 'hamburg': {
      const onionCut = vegCut['onion']
      const m1 = push({ kind: 'simmer', title: 'みじん切りの玉ねぎをレンジ加熱して冷ます', durationMin: 3, scaling: 'sublinear', attended: false, tools: ['microwave'], dependsOn: all(onionCut), heat: { method: '600Wで2分' } })
      const r1 = push({ kind: 'raw', title: '肉だねをこねて成形する', durationMin: 6, scaling: 'sublinear', attended: true, tools: ['bowl'], dependsOn: all(m1, measureId), target: { ingredientId: 'pork_minced' }, safety: '成形後は手とボウルを洗う' })
      const h1 = push({ kind: 'heat', title: '両面に焼き色をつける', durationMin: 4, scaling: 'pan', attended: true, tools: ['stove', 'pan_large'], dependsOn: [r1] })
      last = push({ kind: 'simmer', title: '蓋をして弱火で蒸し焼き', durationMin: 8, scaling: 'pan', attended: false, tools: ['stove', 'pan_large'], dependsOn: [h1], heat: { method: '弱火8分。竹串で透明な肉汁を確認', coreTempC: 75, holdMin: 1 }, safety: safetyFor('pork_minced') })
      break
    }
    case 'karaage': {
      const r = push({ kind: 'rest', title: '下味をもみ込んで15分置く（冷蔵）', durationMin: 15, scaling: 'fixed', attended: false, tools: ['bowl'], dependsOn: all(...rawIds, measureId), safety: '常温に長く置かない' })
      last = push({ kind: 'heat', title: '片栗粉をまぶして揚げ焼きにする', detail: 'トングを使い、生肉用と取り出し用を分ける', durationMin: 10, scaling: 'pan', attended: true, tools: ['stove', 'pan_small|pan_large', 'thermometer'], dependsOn: [r], heat: { method: '油1cm・170℃で両面', coreTempC: 75, holdMin: 1 }, safety: meatSafety })
      break
    }
    case 'nabe': {
      last = push({ kind: 'simmer', title: '土鍋で具材を煮る', durationMin: 12, scaling: 'fixed', attended: false, tools: ['stove', 'donabe'], dependsOn: all(...rawIds, ...cuts, measureId), heat: { method: '中火で煮立て、弱火で10分', coreTempC: 75, holdMin: 1 }, safety: meatSafety })
      break
    }
    case 'potato-salad': {
      const m1 = push({ kind: 'simmer', title: 'じゃがいも・にんじんをレンジ加熱', durationMin: 6, scaling: 'sublinear', attended: false, tools: ['microwave', 'muji_range'], dependsOn: cuts, heat: { method: '600Wで6分、竹串が通るまで' } })
      const e1 = def.egg ? push({ kind: 'simmer', title: '卵をゆでる（12分）', durationMin: 12, scaling: 'fixed', attended: false, tools: ['stove', 'pot_small|yukihira'], dependsOn: [], heat: { method: '沸騰後12分で固ゆで' } }) : undefined
      const h1 = push({ kind: 'plate', title: '熱いうちにつぶして冷ます', durationMin: 3, scaling: 'sublinear', attended: true, tools: ['bowl'], dependsOn: [m1] })
      last = push({ kind: 'plate', title: '冷めてからマヨネーズで和える', durationMin: 2, scaling: 'sublinear', attended: true, tools: ['bowl'], dependsOn: all(h1, e1, measureId), safety: 'マヨネーズは十分に冷めてから和え、当日〜2日で食べ切る' })
      break
    }
    case 'mapo': {
      const tofuCut = vegCut['tofu']
      const m1 = push({ kind: 'simmer', title: '豆腐をレンジで水切りする', durationMin: 3, scaling: 'sublinear', attended: false, tools: ['microwave'], dependsOn: all(tofuCut), heat: { method: '600Wで3分' } })
      const h1 = push({ kind: 'heat', title: 'ひき肉と豆板醤を炒める', durationMin: 4, scaling: 'pan', attended: true, tools: ['stove', 'pan_large'], dependsOn: all(...cuts.filter((c) => c !== tofuCut)), heat: { method: '中火で肉の色が完全に変わるまで', coreTempC: 75, holdMin: 1 }, safety: safetyFor('pork_minced') })
      const s1 = push({ kind: 'simmer', title: '水・調味料・豆腐を入れて煮る', durationMin: 4, scaling: 'fixed', attended: false, tools: ['stove', 'pan_large'], dependsOn: all(h1, m1, measureId) })
      last = push({ kind: 'heat', title: '水溶き片栗粉でとろみをつける', durationMin: 1, scaling: 'fixed', attended: true, tools: ['stove', 'pan_large'], dependsOn: [s1], heat: { method: '1分以上しっかり沸騰させる' } })
      break
    }
  }

  void prep
  return {
    id: def.id,
    name: def.name,
    subtitle: def.subtitle,
    role: def.role,
    canMake: def.canMake ?? false,
    liked: def.liked ?? false,
    isNew: def.isNew ?? !def.canMake,
    starred: false,
    source: 'ai-template',
    ingredients: [...ings, ...seasoning, ...(def.rice ? [{ ingredientId: 'rice', amount: def.rice }] : [])],
    steps,
    freeze: def.freeze,
    fridgeDays: def.fridgeDays ?? 3,
    freezerDays: def.freezerDays ?? (def.freeze === 'ng' ? 0 : 21),
    reheat: def.reheat ?? (def.freeze === 'ng' ? '冷蔵のまま、または軽く温める' : '電子レンジ600Wで2分前後。中心まで熱くなるまで加熱'),
    storageNote: def.storageNote,
    tags: def.tags ?? [],
    color: RECIPE_COLORS[index % RECIPE_COLORS.length],
    updatedAt: new Date('2026-11-14T09:00:00+09:00').toISOString(),
  }
}

/** 料理名からレシピ下書きを作る（ルールベース）。ライブラリにない料理は要確認として返す */
export function draftRecipeFromName(name: string, library: RecipeDef[], index: number): Recipe {
  const hit = library.find((d) => d.name === name || name.includes(d.name))
  if (hit) return { ...buildRecipe({ ...hit, id: `${hit.id}-${Date.now().toString(36)}`, canMake: false, isNew: true }, index), needsReview: false }
  const method: Method = /スープ|汁/.test(name) ? 'soup' : /煮/.test(name) ? 'nimono' : /丼/.test(name) ? 'donburi' : /パスタ/.test(name) ? 'pasta' : /おひたし|和え/.test(name) ? 'ohitashi' : /焼き魚|塩焼/.test(name) ? 'grill-fish' : 'stirfry'
  const found = INGREDIENTS.filter((i) => !i.staple && name.includes(i.name.replace(/（.*?）/g, '')))
  const items: [string, number, string?][] = found.length
    ? found.map((i) => [i.id, i.rawMeat ? 100 : i.isVeg ? 70 : 50, i.rawMeat ? '一口大' : i.isVeg ? 'ざく切り' : undefined])
    : [['pork_koma', 100, undefined], ['cabbage', 80, 'ざく切り'], ['onion', 50, 'くし切り']]
  const def: RecipeDef = {
    id: `gen-${Date.now().toString(36)}`, name, role: method === 'soup' ? 'soup' : method === 'ohitashi' ? 'side' : method === 'donburi' || method === 'pasta' ? 'one-dish' : 'main',
    method, items, seasoning: [['soy', 10], ['mirin', 10], ['oil', 4]], freeze: 'ok', isNew: true, tags: ['自動生成'],
  }
  return { ...buildRecipe(def, index), needsReview: true }
}
