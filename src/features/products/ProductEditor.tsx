import { Camera, ImagePlus, LoaderCircle, Search, Sparkles } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '../../components/ui/Button'
import { Field, inputCls } from '../../components/ui/bits'
import { Sheet } from '../../components/ui/Sheet'
import { toast } from '../../components/ui/Toast'
import { today } from '../../lib/date'
import { cx, uid } from '../../lib/format'
import { useStore } from '../../store/useStore'
import type { SevenProduct } from '../../types'
import { CATEGORIES, ROLE_OF } from './useProducts'

type Draft = {
  id?: string
  jan: string
  name: string
  category: SevenProduct['category']
  price: string
  per: string
  kcal: string
  protein: string
  fat: string
  carbs: string
  fiber: string
  salt: string
  basis: NonNullable<SevenProduct['basis']>
}
type Nut = { kcal: number | null; protein: number | null; fat: number | null; carbs: number | null; fiber: number | null; salt: number | null }

const empty = (jan = ''): Draft => ({ jan, name: '', category: 'おにぎり', price: '', per: '1個当たり', kcal: '', protein: '', fat: '', carbs: '', fiber: '', salt: '', basis: 'manual' })
const s = (v: number | null | undefined) => (v == null ? '' : String(v))

/** 写真を長辺1280pxの JPEG に縮小（送信量を抑え、AI が読みやすい解像度にする） */
async function shrink(file: File): Promise<string> {
  const bmp = await createImageBitmap(file).catch(() => null)
  const img = bmp ?? (await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image()
    i.onload = () => res(i)
    i.onerror = rej
    i.src = URL.createObjectURL(file)
  }))
  const w = 'width' in img ? img.width : 0
  const h = 'height' in img ? img.height : 0
  const k = Math.min(1, 1280 / Math.max(w, h))
  const c = document.createElement('canvas')
  c.width = Math.round(w * k)
  c.height = Math.round(h * k)
  c.getContext('2d')!.drawImage(img as CanvasImageSource, 0, 0, c.width, c.height)
  return c.toDataURL('image/jpeg', 0.85)
}

/**
 * 自分の商品を登録・編集する。
 * JAN があれば公開データベース（Open Food Facts）を引き、栄養成分表示の写真は Workers AI で読み取って入力欄に入れる。
 */
export function ProductEditor({ open, jan, product, onClose, onSaved }: { open: boolean; jan?: string; product?: SevenProduct; onClose: () => void; onSaved?: (p: SevenProduct) => void }) {
  const save = useStore((st) => st.saveProduct)
  const [d, setD] = useState<Draft>(empty(jan))
  const [lookup, setLookup] = useState<'idle' | 'busy' | 'found' | 'none'>('idle')
  const [reading, setReading] = useState(false)
  const camRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    if (product) {
      const n = product.nutrients
      setD({ id: product.id, jan: product.jan ?? '', name: product.name, category: product.category, price: String(product.price), per: product.per ?? '1個当たり', kcal: s(n.kcal), protein: s(n.protein), fat: s(n.fat), carbs: s(n.carbs), fiber: s(n.fiber), salt: s(n.salt), basis: product.basis ?? 'manual' })
      setLookup('idle')
      return
    }
    setD(empty(jan))
    setLookup('idle')
    if (jan) void runLookup(jan)
  }, [open, jan, product]) // eslint-disable-line react-hooks/exhaustive-deps

  const fill = (n: Nut, extra: Partial<Draft>) =>
    setD((x) => ({
      ...x,
      ...extra,
      kcal: n.kcal != null ? String(n.kcal) : x.kcal,
      protein: n.protein != null ? String(n.protein) : x.protein,
      fat: n.fat != null ? String(n.fat) : x.fat,
      carbs: n.carbs != null ? String(n.carbs) : x.carbs,
      fiber: n.fiber != null ? String(n.fiber) : x.fiber,
      salt: n.salt != null ? String(n.salt) : x.salt,
    }))

  async function runLookup(code: string) {
    setLookup('busy')
    try {
      const r = await fetch(`/api/products/lookup?jan=${encodeURIComponent(code)}`, { credentials: 'same-origin' })
      const j = (await r.json()) as { found: boolean; name?: string; per?: string; nutrients?: Nut }
      if (!j.found) return setLookup('none')
      fill(j.nutrients!, { name: j.name || '', per: j.per === 'serving' ? '1食当たり' : '100g当たり', basis: 'openfoodfacts' })
      setLookup('found')
    } catch {
      setLookup('none')
    }
  }

  async function readLabel(file?: File) {
    if (!file) return
    setReading(true)
    try {
      const image = await shrink(file)
      const r = await fetch('/api/ai/label', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ image }) })
      if (!r.ok) throw new Error(r.status === 422 ? '栄養成分表示を読み取れませんでした。表示が大きく写るように撮り直してください' : r.status === 429 ? 'AIの利用回数の上限に達しました' : '読み取りに失敗しました')
      const j = (await r.json()) as { name: string; per: string; nutrients: Nut }
      fill(j.nutrients, { basis: 'label-photo', ...(j.per ? { per: j.per } : {}), ...(j.name ? { name: d.name || j.name } : {}) })
      toast('栄養成分表示を読み取りました。数値を確認してください', 'ok')
    } catch (e) {
      toast(e instanceof Error ? e.message : '読み取りに失敗しました', 'error')
    } finally {
      setReading(false)
      if (camRef.current) camRef.current.value = ''
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const num = (v: string) => (v.trim() === '' ? NaN : Number(v))
  const missing = !d.name.trim() ? '商品名' : !(num(d.price) > 0) ? '価格' : !(num(d.kcal) >= 0) ? 'エネルギー' : !(num(d.protein) >= 0) ? 'たんぱく質' : ''
  const submit = () => {
    if (missing) return toast(`${missing}を入力してください`, 'error')
    const z = (v: string) => (Number.isFinite(num(v)) ? num(v) : 0)
    const p: SevenProduct = {
      id: d.id ?? uid('my'),
      code: d.jan || d.id || '',
      jan: d.jan || undefined,
      name: d.name.trim().slice(0, 60),
      category: d.category,
      role: ROLE_OF[d.category],
      price: Math.round(z(d.price)),
      nutrients: { kcal: z(d.kcal), protein: z(d.protein), fat: z(d.fat), carbs: z(d.carbs), fiber: z(d.fiber), salt: z(d.salt), vegG: d.category === 'サラダ' ? 70 : 0 },
      fetchedOn: today(),
      user: true,
      per: d.per,
      basis: d.basis,
    }
    if (!p.code) p.code = p.id
    save(p)
    toast(product ? '商品を更新しました' : `「${p.name}」を登録しました`, 'ok')
    onSaved?.(p)
    onClose()
  }
  const set = (k: keyof Draft) => (e: { target: { value: string } }) => setD((x) => ({ ...x, [k]: e.target.value }))
  const numInput = (k: keyof Draft, label: string, unit: string, required = false) => (
    <Field label={`${label}${required ? '' : '（任意）'}`}>
      <div className="relative">
        <input inputMode="decimal" className={cx(inputCls, 'num pr-12')} value={d[k] as string} onChange={set(k)} aria-label={label} />
        <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-[13px] text-ink-3">{unit}</span>
      </div>
    </Field>
  )

  return (
    <Sheet open={open} onClose={onClose} title={product ? '商品を編集' : '商品を登録'} wide footer={<Button className="w-full" onClick={submit}>{product ? '保存する' : '登録する'}</Button>}>
      {d.jan && (
        <p className="mb-3 flex flex-wrap items-center gap-2 rounded-[12px] bg-sunken px-3 py-2.5 text-[13px] text-ink-2">
          <span className="num font-semibold text-ink">JAN {d.jan}</span>
          {lookup === 'busy' && <span className="inline-flex items-center gap-1"><LoaderCircle size={14} className="animate-spin motion-reduce:animate-none" aria-hidden />公開データベースを検索中…</span>}
          {lookup === 'found' && <span className="inline-flex items-center gap-1 text-basil"><Search size={14} aria-hidden />Open Food Facts の参考値を入れました。表示と違えば直してください</span>}
          {lookup === 'none' && <span>公開データベースに登録がありませんでした。栄養成分表示を撮影すると自動で入力できます</span>}
        </p>
      )}

      <div className="mb-4 grid grid-cols-2 gap-2">
        <Button variant="tinted" icon={reading ? <LoaderCircle size={16} className="animate-spin motion-reduce:animate-none" /> : <Camera size={16} />} disabled={reading} onClick={() => camRef.current?.click()}>
          {reading ? 'AIが読み取り中…' : '成分表示を撮影'}
        </Button>
        <Button variant="secondary" icon={<ImagePlus size={16} />} disabled={reading} onClick={() => fileRef.current?.click()}>写真から選ぶ</Button>
        <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => void readLabel(e.target.files?.[0])} aria-hidden tabIndex={-1} />
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => void readLabel(e.target.files?.[0])} aria-hidden tabIndex={-1} />
      </div>
      {reading && (
        <div className="mb-4 space-y-2" aria-busy="true" aria-label="読み取り中">
          <div className="skeleton h-10 w-full" />
          <div className="skeleton h-10 w-2/3" />
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2"><Field label="商品名"><input className={inputCls} value={d.name} onChange={set('name')} placeholder="例：サラダチキン スモーク" /></Field></div>
        <Field label="種類">
          <select className={inputCls} value={d.category} onChange={set('category')}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
        </Field>
        <Field label="価格（税込）">
          <div className="relative">
            <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[14px] text-ink-3">¥</span>
            <input inputMode="numeric" className={cx(inputCls, 'num pl-7')} value={d.price} onChange={set('price')} aria-label="価格" />
          </div>
        </Field>
        <div className="col-span-2"><Field label="栄養値の単位"><input className={inputCls} value={d.per} onChange={set('per')} placeholder="1個当たり" /></Field></div>
        {numInput('kcal', 'エネルギー', 'kcal', true)}
        {numInput('protein', 'たんぱく質', 'g', true)}
        {numInput('fat', '脂質', 'g')}
        {numInput('carbs', '炭水化物', 'g')}
        {numInput('salt', '食塩相当量', 'g')}
        {numInput('fiber', '食物繊維', 'g')}
      </div>
      <p className="mt-4 flex items-start gap-1.5 text-[12px] leading-relaxed text-ink-3">
        <Sparkles size={13} className="mt-0.5 shrink-0" aria-hidden />
        写真は読み取りにだけ使い、保存しません。1袋に2個入りなど、表示の単位と食べる量が違うときは数値を合わせてください。
      </p>
    </Sheet>
  )
}
