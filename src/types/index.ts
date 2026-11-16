// ドメイン型定義。UI・ロジック・永続化の共通語彙。
// 将来 Cloudflare D1 へ移す際も、このスキーマをテーブル設計の起点にする。

export type ID = string
export type ISODate = string // YYYY-MM-DD

/* ---------- 栄養 ---------- */
export interface Nutrients {
  kcal: number
  protein: number // g
  fat: number // g
  carbs: number // g
  fiber: number // g
  salt: number // g（食塩相当量）
  calcium: number // mg
  iron: number // mg
  vitB1: number // mg
  vitC: number // mg
  vegG: number // 野菜・きのこ・海藻の重量 g
}

/** 栄養値の根拠。推定と実測（表示値）を UI で区別するために持つ */
export type NutritionBasis =
  | 'estimated-ingredients' // 材料の標準成分値から概算
  | 'demo-label' // デモ商品の表示値を模した値
  | 'user-input'

/* ---------- 食材 ---------- */
export type Aisle = '青果' | '精肉' | '鮮魚' | '日配' | '米・麺・パン' | '冷凍' | '調味料・乾物' | 'その他'
export type StorageLoc = 'fridge' | 'freezer' | 'pantry'
export type Unit = 'g' | 'ml' | '個' | '枚' | 'パック'

export interface Ingredient {
  id: ID
  name: string
  aisle: Aisle
  unit: Unit
  gramsPerUnit?: number // 個・枚・ml などをgに換算
  per100g: Omit<Nutrients, 'vegG'>
  pack: { size: number; price: number; label: string } // 購入単位と想定価格（仮）
  shelfDays: { fridge?: number; freezer?: number; pantry?: number }
  defaultStorage: StorageLoc
  isVeg?: boolean
  needsWash?: boolean
  rawMeat?: 'meat' | 'poultry' | 'fish' // 交差汚染の管理対象
  staple?: boolean // 常備調味料：買い物リスト・在庫減算の対象外
  frequent?: boolean // よく購入する食材
}

/* ---------- 調理器具 ---------- */
export type WashPolicy = 'none' | 'after-raw' | 'between-recipes' | 'always'
export interface Tool {
  id: ID
  name: string
  quantity: number
  shareable: boolean // 1台を複数工程で同時利用できるか（例：保存容器・スケール）
  washPolicy: WashPolicy
  note?: string
  group: '加熱' | '家電' | '下ごしらえ' | '保存'
}

/* ---------- レシピ ---------- */
export type StepKind =
  | 'wash' // 洗う
  | 'cut' // 切る（加熱済み・野菜）
  | 'raw' // 生肉・生魚の下処理
  | 'measure' // 調味料の計量
  | 'heat' // 加熱（手が離せない）
  | 'simmer' // 加熱（放置可能）
  | 'rest' // 漬け込み・戻し・寝かせ
  | 'cool' // 冷却
  | 'pack' // 小分け・保存
  | 'plate' // 仕上げ
  | 'clean' // 洗浄（衛生）

export type Scaling = 'fixed' | 'sublinear' | 'linear' | 'pan'

export interface HeatSpec {
  method: string // 例: 中火で焼く
  coreTempC?: number // 中心温度の目標
  holdMin?: number
}

export interface RecipeStep {
  id: ID
  kind: StepKind
  title: string
  detail?: string
  durationMin: number // 1食分を作るときの所要時間
  scaling?: Scaling
  attended: boolean // 手が離せない工程か
  /** 器具ID。'a|b' はいずれか1つ */
  tools: string[]
  target?: { ingredientId: ID; cut?: string } // cut/raw の対象
  ingredientIds?: ID[] // wash などで扱う食材
  dependsOn: ID[]
  heat?: HeatSpec
  safety?: string
  /** 同じキーの工程は複数レシピ間でまとめて実行する（例: 炊飯） */
  mergeKey?: string
}

export interface RecipeIngredient {
  ingredientId: ID
  amount: number // 1食分（食材の単位）
  cut?: string
  note?: string
}

export type Role = 'main' | 'side' | 'soup' | 'one-dish'
export type FreezeFit = 'good' | 'ok' | 'ng'

export interface Recipe {
  id: ID
  name: string
  subtitle?: string
  role: Role
  canMake: boolean // 作れる料理
  liked: boolean // 好きな料理
  isNew: boolean // AIが新しく提案した料理（未経験）
  starred: boolean // ユーザーのお気に入り
  source: 'ai-detailed' | 'ai-template' | 'ai-llm' | 'user'
  needsReview?: boolean // 自動生成で要確認
  ingredients: RecipeIngredient[]
  steps: RecipeStep[]
  freeze: FreezeFit
  fridgeDays: number
  freezerDays: number
  reheat: string
  storageNote?: string
  tags: string[]
  color: string // 調理タイムラインでの識別色
  updatedAt: string
  /** 調理法（buildRecipe のテンプレート名） */
  method?: string
  /** 手軽な作り方（3〜5行・大さじ表記）。無ければ材料と調理法から自動で作る */
  easy?: EasyGuide
}

export interface EasyGuide {
  steps: string[]
  minutes?: number
  /** 「レンジだけ」「フライパン1つ」など */
  style?: string[]
  /** コツ・アレンジ */
  point?: string
}

/* ---------- 在庫・作り置き ---------- */
export interface InventoryLot {
  id: ID
  ingredientId: ID
  quantity: number
  location: StorageLoc
  purchasedOn?: ISODate
  expiresOn?: ISODate
  verified: boolean // false = サンプルの仮数量
  sourceId?: ID // 買い物アイテム由来（取り消し時に戻すため）
}

export interface PreparedDish {
  id: ID
  recipeId: ID
  servings: number
  cookedOn: ISODate
  location: StorageLoc
  consumeBy: ISODate
  plannedFor: ISODate[]
  sessionId?: ID
  eatenLog: { date: ISODate; servings: number }[]
}

/* ---------- 献立 ---------- */
export type CookMode = 'batch' | 'fresh'
export interface DinnerSlot {
  main?: ID
  side?: ID
  mode: CookMode
  /** この日は夕食を用意しない（外食・不要など） */
  skip?: boolean
  /** 不要にした理由（例：外食） */
  note?: string
  /** 不要にする前の料理（戻すときに使う） */
  prev?: { main?: ID; side?: ID }
}
export interface DayPlan {
  date: ISODate
  dinner: DinnerSlot
}
export interface WeekPlan {
  id: ID
  weekStart: ISODate // 作り置き日（日曜）
  days: DayPlan[]
  status: 'draft' | 'confirmed'
  generatedBy: 'ai-local' | 'ai-workers' | 'manual'
  rationale: string[]
  generation: number
  createdAt: string
  confirmedAt?: string
  cookedSessionId?: ID // 作り置き調理が完了したセッション
}

/* ---------- 買い物 ---------- */
export interface ShoppingItem {
  id: ID
  ingredientId?: ID
  name: string
  aisle: Aisle
  needQty: number // 献立から算出した不足量
  unit: Unit
  packs: number
  packLabel: string
  estPrice: number
  actualPrice?: number
  purchased: boolean
  purchasedAt?: string
  usedBy: ID[] // レシピID
  manual?: boolean
}

export interface Expense {
  id: ID
  date: ISODate
  amount: number
  category: 'grocery' | 'lunch'
  label: string
  sourceId: ID // 二重計上防止キー
}

/* ---------- 調理セッション ---------- */
export interface CookTask {
  id: ID
  kind: StepKind
  title: string
  detail?: string
  recipeIds: ID[]
  ingredients: { ingredientId: ID; amount: number; cut?: string }[]
  tools: string[] // 解決済みの器具ID
  durationMin: number
  attended: boolean
  dependsOn: ID[]
  start: number // 分
  end: number
  lane: string
  safety?: string
  heat?: HeatSpec
  merged?: number // まとめた元工程の数
  reason?: string // この位置にある理由（最適化の説明）
  units?: string[] // 割り当てた器具（例: stove#1）
}

export interface Occupancy {
  unit: string // stove#1 など
  toolId: string
  label: string
  start: number
  end: number
  recipeIds: ID[]
  taskIds: ID[]
}

export interface CookWarning {
  level: 'info' | 'warn' | 'error'
  message: string
}

export interface CookPlanResult {
  tasks: CookTask[]
  totalMin: number
  handsMin: number
  naiveMin: number // 料理ごとに順番に作った場合
  warnings: CookWarning[]
  lanes: string[]
  occupancy: Occupancy[]
  servings: { recipeId: ID; servings: number; store: number }[]
}

export type TaskState = 'todo' | 'done' | 'skipped'
export interface CookSession {
  id: ID
  planId: ID
  createdAt: string
  status: 'ready' | 'active' | 'paused' | 'done'
  result: CookPlanResult
  progress: Record<ID, TaskState>
  timers: Record<ID, { endsAt?: number; remainingMs?: number }>
  startedAt?: string
  finishedAt?: string
}

export interface CookHistory {
  id: ID
  sessionId: ID
  date: ISODate
  recipes: { recipeId: ID; servings: number }[]
  totalMin: number
  shortages: string[]
  skipped: number
}

/* ---------- 食事・昼食 ---------- */
export type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snack'
export interface MealLog {
  id: ID
  date: ISODate
  slot: MealSlot
  label: string
  items: { name: string; refId?: ID; kind: 'recipe' | 'product' | 'preset' }[]
  nutrients: Nutrients
  basis: NutritionBasis
  price?: number
  skipped?: boolean // 「食べなかった」
}

export interface SevenProduct {
  id: ID
  code: string // デモ用コード、または JAN
  name: string
  category: 'おにぎり' | '弁当・丼' | 'パン' | '麺' | 'サラダ' | '惣菜' | 'たんぱく質' | 'スープ' | '飲料' | 'デザート'
  role: 'staple' | 'protein' | 'veg' | 'soup' | 'drink' | 'extra'
  price: number
  nutrients: Omit<Nutrients, 'vegG' | 'calcium' | 'iron' | 'vitB1' | 'vitC'> & { vegG?: number }
  fetchedOn: ISODate
  /** 目安値のデモ商品 */
  demo?: boolean
  /** 自分で登録した商品（バーコード・写真・手入力） */
  user?: boolean
  jan?: string
  /** 栄養値の単位（例：1個当たり） */
  per?: string
  /** 値の出どころ */
  basis?: 'demo' | 'label-photo' | 'openfoodfacts' | 'manual'
}

export interface LunchCombo {
  id: ID
  mode: 'balance' | 'protein' | 'budget' | 'custom'
  productIds: ID[]
  price: number
  nutrients: Nutrients
  scores: { health: number; muscle: number; budget: number; total: number }
  reasons: string[]
}

/* ---------- 健康・ライフログ ---------- */
export interface HealthLog {
  date: ISODate
  weight?: number
  bodyFat?: number
  steps?: number
  sleepH?: number
  waterL?: number
  fatigue?: 1 | 2 | 3 | 4 | 5
  workout?: string
  sample?: boolean
}

export interface Profile {
  name: string
  age: number
  sex: 'male' | 'female'
  heightCm: number
  weightKg: number
  bodyFatPct: number
  goalWeightKg: number
  activity: 'low' | 'moderate' | 'high'
  workoutsPerWeek: string
  goals: string[]
  weeklyGroceryBudget: number
  lunchBudget: number
  weekdayPrepMin: number
  batchDay: 0 | 1 | 2 | 3 | 4 | 5 | 6
  maxRepeatDays: number
  store: string
  expectBreakfast: boolean
}

export interface Targets {
  kcal: number
  protein: number
  fat: number
  carbs: number
  fiber: number
  salt: number
  calcium: number
  iron: number
  vitB1: number
  vitC: number
  vegG: number
  note: string
  bmi: number
  tdee: number
}
