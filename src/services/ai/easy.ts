// 手軽な作り方（3〜5行・大さじ表記）を、材料と調理法から組み立てる。
// 一括調理用の詳細工程（器具・温度・依存関係）とは別に、「何をすればいいか」がひと目で分かる文章にする。
import { INGREDIENT_MAP } from '../../data/ingredients'
import { recipeTimes } from '../../engine/nutrition'
import type { EasyGuide, Recipe, RecipeIngredient } from '../../types'

// 大さじ1あたりのグラム数（g で持っている調味料）
const TBSP_G: Record<string, number> = {
  sugar: 9, salt: 18, dashi: 9, consomme: 9, torigara: 9, katakuriko: 9, mayo: 12, ketchup: 15, miso: 18, tobanjan: 18, curry_roux: 0, stew_roux: 0, hayashi_roux: 0,
}

const r = (x: number) => Math.round(x * 2) / 2 // 0.5刻み
/** 1.5 → 1と1/2、0.5 → 1/2 */
const half = (x: number) => (x % 1 === 0 ? `${x}` : x < 1 ? '1/2' : `${Math.floor(x)}と1/2`)
function spoonText(ml: number) {
  if (ml >= 13) return `大さじ${half(r(ml / 15))}`
  const t = r(ml / 5)
  return t <= 0 ? '少々' : `小さじ${half(t)}`
}

/** 調味料の分量を家庭の計量に直す（大さじ・小さじ・チューブ・少々・1かけ） */
export function measure(i: RecipeIngredient): string {
  const ing = INGREDIENT_MAP[i.ingredientId]
  if (!ing) return `${i.amount}`
  const id = i.ingredientId
  if (id === 'pepper') return '少々'
  if (id === 'garlic' || id === 'ginger') return `チューブ${Math.max(1, Math.round(i.amount * 2))}cm`
  if (/_roux$/.test(id)) return `${Math.max(1, Math.round(i.amount / 18))}かけ`
  if (id === 'salt' && i.amount < 1) return 'ひとつまみ'
  if (ing.unit === 'ml') return spoonText(i.amount)
  if (TBSP_G[id]) return spoonText((i.amount / TBSP_G[id]) * 15)
  if (ing.unit && ing.unit !== 'g') return `${Math.round(i.amount * 10) / 10}${ing.unit}`
  return `${Math.round(i.amount)}g`
}

/** 材料1つの表示（例：豚こま肉 100g、卵 2個） */
export function amountText(i: RecipeIngredient): string {
  const ing = INGREDIENT_MAP[i.ingredientId]
  if (!ing) return ''
  if (ing.staple) return measure(i)
  if (ing.unit && ing.unit !== 'g' && ing.unit !== 'ml') return `${Math.round(i.amount * 10) / 10}${ing.unit}`
  return `${Math.round(i.amount)}g`
}

// 材料のうち「具」ではなく、手順の中で別に扱うもの
const SAUCE_LIKE = new Set(['curry_roux', 'stew_roux', 'hayashi_roux', 'miso'])
const EXTRA = new Set(['milk', 'gyoza_skin', 'wakame', 'pasta', 'egg', 'panko', 'rice', 'soba', 'chuka_men', 'bread'])
const NO_CUT = new Set(['pork_minced', 'salmon', 'mackerel', 'moyashi'])

const nameOf = (id: string) => (INGREDIENT_MAP[id]?.name ?? id).replace(/（.*?）/g, '')

function inferMethod(r: Recipe): string {
  if (r.method) return r.method
  const t = r.steps.map((s) => s.title).join(' ')
  if (/ルウ/.test(t)) return 'roux'
  if (/グリル/.test(t)) return 'grill-fish'
  if (/ホイル/.test(t)) return 'foil'
  if (/茹で.*パスタ|パスタを茹で/.test(t)) return 'pasta'
  if (/包む/.test(t) && /皮/.test(t)) return 'gyoza'
  if (/落とし蓋|煮汁/.test(t)) return 'nimono'
  if (/味噌を溶く|水と具材/.test(t)) return 'soup'
  if (/レンジ/.test(t) && !/炒め/.test(t)) return 'renge'
  return 'stirfry'
}

/** 手軽な作り方。recipe.easy があればそれを使う */
export function easyGuide(recipe: Recipe): EasyGuide & { minutes: number; style: string[] } {
  const method = inferMethod(recipe)
  const all = recipe.ingredients
  const isStaple = (id: string) => !!INGREDIENT_MAP[id]?.staple
  const foods = all.filter((i) => !isStaple(i.ingredientId) && !SAUCE_LIKE.has(i.ingredientId) && !EXTRA.has(i.ingredientId))
  const seas = all.filter((i) => isStaple(i.ingredientId) || SAUCE_LIKE.has(i.ingredientId))
  const oils = seas.filter((i) => /oil$/.test(i.ingredientId))
  const oil = oils[0]
  const roux = seas.find((i) => /_roux$/.test(i.ingredientId))
  const sauce = seas.filter((i) => !/oil$/.test(i.ingredientId) && !/_roux$/.test(i.ingredientId) && i.ingredientId !== 'katakuriko')
  const sauceText = sauce.map((i) => `${nameOf(i.ingredientId)} ${measure(i)}`).join('・')
  const meat = foods.find((i) => INGREDIENT_MAP[i.ingredientId]?.rawMeat)
  const veg = foods.filter((i) => i !== meat)
  const has = (id: string) => all.some((i) => i.ingredientId === id)
  const cutItems = [...veg, ...(meat ? [meat] : [])].filter((i) => !NO_CUT.has(i.ingredientId) && (i.cut || i === meat))
  const loosen = cutItems.filter((i) => i.cut === '石づきを取ってほぐす').map((i) => `${nameOf(i.ingredientId)}はほぐし`)
  const cutPhr = cutItems
    .filter((i) => i.cut !== '石づきを取ってほぐす')
    .map((i) => `${nameOf(i.ingredientId)}は${!i.cut || i.cut === 'はさみで切る' ? '食べやすい大きさ' : i.cut}`)
  const prep = loosen.length || cutPhr.length ? `${[...loosen, ...cutPhr].join('、')}${cutPhr.length ? 'にする' : ''}。` : ''
  const vegNames = veg.map((i) => nameOf(i.ingredientId)).join('・')
  const oilText = oil ? `${nameOf(oil.ingredientId)}（${measure(oil)}）` : '油（小さじ1）'
  // 炊飯の時間は除く（ご飯は炊いてある前提）
  const times = recipeTimes({ ...recipe, steps: recipe.steps.filter((x) => !/^rice-/.test(x.mergeKey ?? '')).map((x) => ({ ...x, dependsOn: x.dependsOn.filter((d) => !recipe.steps.find((y) => y.id === d && /^rice-/.test(y.mergeKey ?? ''))) })) })
  const minutes = recipe.easy?.minutes ?? Math.max(5, times.total)
  const style: string[] = []
  if (['renge', 'ohitashi'].includes(method)) style.push('レンジだけ')
  else if (['stirfry', 'foil', 'gyoza', 'hamburg', 'mapo', 'fried-rice', 'omurice'].includes(method)) style.push('フライパン1つ')
  else if (['nimono', 'soup', 'roux', 'nabe', 'donburi'].includes(method)) style.push('鍋1つ')
  if (foods.length <= 3) style.push(`材料${foods.length}つ`)
  if (minutes <= 15) style.push(`${minutes}分`)
  if (recipe.easy) return { ...recipe.easy, minutes, style: recipe.easy.style ?? style }

  let steps: string[]
  switch (method) {
    case 'renge':
      steps = [prep, `耐熱容器に${[meat ? nameOf(meat.ingredientId) : '', vegNames].filter(Boolean).join('と')}を入れ、${sauceText}を加えて軽く混ぜる。`, `ふんわりラップをして、600Wのレンジで${meat ? '5分' : '3分'}加熱する。${meat ? '赤いところが残っていたら30秒ずつ追加。' : ''}`, 'そのまま2分おいて、全体を混ぜたら完成。']
      break
    case 'ohitashi':
      steps = [`${vegNames}をさっと洗い、ラップで包んで600Wで2分加熱する。`, '水にさらして水気をしぼり、4cm長さに切る。', `${sauceText}で和えたら完成。`]
      break
    case 'nimono':
      steps = [prep, `鍋に${sauceText}と水（100ml）を入れて火にかける。`, `煮立ったら${[meat ? nameOf(meat.ingredientId) : '', vegNames].filter(Boolean).join('と')}を入れ、落とし蓋（アルミホイルでOK）をして弱めの中火で15分煮る。`, '火を止めて少しおくと、味がしみておいしい。']
      break
    case 'soup':
      steps = [prep, `鍋に水（200ml）と${[vegNames, meat ? nameOf(meat.ingredientId) : ''].filter(Boolean).join('・')}を入れて中火にかけ、10分煮る。`, has('miso') ? `火を止めて${sauceText}を溶き入れ${has('wakame') ? '、乾燥わかめを加え' : ''}たら完成。` : `${sauceText}で味をととのえ${has('wakame') ? '、乾燥わかめを加え' : ''}たら完成。`]
      break
    case 'roux':
      steps = [prep, `鍋に${oilText}を熱し、${meat ? nameOf(meat.ingredientId) + 'と' : ''}${vegNames}を炒める。`, '水（150ml）を入れて、蓋をして弱火で15分煮る。', `火を止めてルウ（${roux ? measure(roux) : '1かけ'}）を溶かし${has('milk') ? '、牛乳を加えて' : ''}、とろみがつくまで弱火で5分煮${sauceText ? `、${sauceText}を加え` : ''}たら完成。`]
      break
    case 'grill-fish':
      steps = [`${meat ? nameOf(meat.ingredientId) : '魚'}に塩をふって10分おき、出てきた水気をキッチンペーパーで拭く。`, '魚焼きグリル（またはフライパンにクッキングシート）で、中火で片面6分→返して5分焼いたら完成。']
      break
    case 'foil':
      steps = [prep, `アルミホイルに${vegNames}を敷いて${meat ? nameOf(meat.ingredientId) : '具材'}をのせ、${sauceText}をかけて包む。`, 'フライパンに置いて水（50ml）を入れ、蓋をして中火で12分蒸し焼きにしたら完成。']
      break
    case 'pasta':
      steps = [prep, 'たっぷりのお湯に塩を入れ、パスタを表示時間より1分短くゆでる。', `その間にフライパンで${oilText}を熱し、${meat ? nameOf(meat.ingredientId) + 'と' : ''}${vegNames}を炒める。`, `ゆで上がったパスタとゆで汁（大さじ2）を加え、${sauceText}で和えたら完成。`]
      break
    case 'donburi':
      steps = [prep, `フライパンに${sauceText}と水（50ml）を入れて煮立て、${meat ? nameOf(meat.ingredientId) + 'と' : ''}${vegNames}を入れる。`, '弱めの中火で7分煮る。', `${has('egg') ? '溶き卵を回し入れて蓋をし、好みのかたさになったら' : ''}ご飯にのせて完成。`]
      break
    case 'mapo':
      steps = [prep, '豆腐はキッチンペーパーで包み、600Wで3分加熱して水切りする。', `フライパンで${meat ? nameOf(meat.ingredientId) : 'ひき肉'}と豆板醤を色が変わるまで炒め、水（100ml）と${sauce.filter((i) => i.ingredientId !== 'tobanjan').map((i) => `${nameOf(i.ingredientId)} ${measure(i)}`).join('・')}、豆腐を入れて4分煮る。`, '水溶き片栗粉（片栗粉 小さじ1＋水 大さじ1）でとろみをつけ、1分しっかり沸騰させたら完成。']
      break
    case 'karaage':
      steps = [prep, `${meat ? nameOf(meat.ingredientId) : '肉'}を${sauceText}でもみ込み、冷蔵庫で15分おく。`, '片栗粉をまぶし、フライパンに油を1cm入れて170℃で両面をこんがり揚げ焼きにしたら完成。']
      break
    case 'gyoza':
      steps = [prep, `ボウルにひき肉・${vegNames}・${sauceText}を入れてよく混ぜ、餃子の皮で包む。`, 'フライパンに油をひいて並べ、焼き色がついたら水（50ml）を入れて蓋をし、中火で6分蒸し焼き。', '蓋を取って水分を飛ばしたら完成。']
      break
    case 'hamburg':
      steps = ['玉ねぎはみじん切りにして、600Wで2分加熱して冷ます。', `ボウルにひき肉・玉ねぎ・${sauceText}を入れてよくこね、小判形にまとめる。`, 'フライパンで両面に焼き色をつけ、蓋をして弱火で8分。竹串を刺して透明な汁が出たら完成。']
      break
    case 'potato-salad':
      steps = [prep, '耐熱容器に入れてラップをし、600Wで6分（竹串が通るまで）加熱する。', `熱いうちにつぶして冷まし、${sauceText}で和えたら完成。`]
      break
    case 'nabe':
      steps = [prep, `鍋に水（300ml）と${sauceText}を入れて煮立て、具材を入れる。`, '弱火で10分、肉に火が通ったら完成。']
      break
    default: {
      const egg = has('egg')
      steps = [
        prep,
        egg ? `フライパンに${oilText}を熱し、溶き卵を大きく混ぜて半熟で取り出す。` : '',
        meat ? `フライパンに${egg ? '油を少し足して' : oilText + 'をひいて'}${nameOf(meat.ingredientId)}を中火で炒め、色が変わるまで火を通す。` : `フライパンに${oilText}を熱する。`,
        vegNames ? `${vegNames}を加えて、しんなりするまで炒める。` : '',
        `${sauceText ? sauceText + 'を加えて' : ''}${egg ? '卵を戻し入れ、' : ''}全体に絡めたら完成。`,
      ]
    }
  }
  return { steps: steps.filter(Boolean), minutes, style }
}
