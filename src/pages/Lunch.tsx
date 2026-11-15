import { Camera, Heart, Plus, ScanBarcode, Search, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Page } from '../components/layout/Page'
import { Button, IconButton } from '../components/ui/Button'
import { Empty, inputCls, Meter, Tag } from '../components/ui/bits'
import { Sheet } from '../components/ui/Sheet'
import { toast } from '../components/ui/Toast'
import { SEVEN_BY_CODE, SEVEN_MAP, SEVEN_PRODUCTS } from '../data/seven'
import { comboNutrients, MODE_LABEL, scoreCombo, suggestLunch } from '../engine/lunch'
import { add, recipeNutrition, ZERO } from '../engine/nutrition'
import { fmtMD, today, weekday } from '../lib/date'
import { cx, r1, yen } from '../lib/format'
import { useTargets } from '../store/derived'
import { useStore } from '../store/useStore'
import { deleteMealWithUndo } from '../store/useDeleteMeal'
import type { LunchCombo } from '../types'

export default function Lunch() {
  const t = today()
  const budget = useStore((s) => s.profile.lunchBudget)
  const meals = useStore((s) => s.meals)
  const favorites = useStore((s) => s.lunchFavorites)
  const record = useStore((s) => s.recordLunch)
  const toggleFav = useStore((s) => s.toggleLunchFavorite)
  const deleteMeal = useStore((s) => s.deleteMeal)
  const targets = useTargets()
  const [sp] = useSearchParams()
  const [exclude, setExclude] = useState<string[]>([])
  const [builder, setBuilder] = useState(false)
  const [confirmIds, setConfirmIds] = useState<string[] | null>(null)
  const combos = useMemo(() => suggestLunch(SEVEN_PRODUCTS, budget, targets.kcal, exclude), [budget, targets.kcal, exclude])
  const todayLunch = meals.find((m) => m.date === t && m.slot === 'lunch')
  const history = meals.filter((m) => m.slot === 'lunch').sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8)
  const picked = sp.get('pick')

  const doRecord = (ids: string[], replace = false) => {
    const r = record(ids, t, replace)
    if (!r.ok && r.message === 'exists') return setConfirmIds(ids)
    if (!r.ok) return toast(r.message, 'error')
    setConfirmIds(null)
    const m = useStore.getState().meals.at(-1)
    toast(r.message ?? '', 'ok', m && !replace ? { label: '取り消す', run: () => deleteMeal(m.id) } : undefined)
  }
  const isFav = (ids: string[]) => favorites.some((f) => f.key === [...ids].sort().join('|'))

  return (
    <Page title="セブンの昼食" subtitle={`1食 ${yen(budget)}以内・健康／筋肉維持／節約で評価`} back="/">
      <p className="mb-5 rounded-[14px] bg-sunken px-4 py-3 text-[13px] leading-relaxed text-ink-2">
        <span className="font-semibold text-ink">デモデータ：</span>商品名・価格・栄養値は実在商品を模した架空の値です（作成日 2026-11-15）。実際の販売状況や現在価格は確認していません。
      </p>

      <PairWithDinner />

      <div className="mb-2 flex items-end justify-between px-1">
        <h2 className="text-[17px] font-bold">今日の候補</h2>
        <button className="text-[13px] font-semibold text-basil cursor-pointer" onClick={() => setExclude(combos.flatMap((c) => c.productIds.slice(0, 1)))}>別の組み合わせ</button>
      </div>
      <div className="mb-6 grid gap-3 md:grid-cols-3">
        {combos.map((c) => <ComboCard key={c.id} c={c} highlight={picked === c.id} fav={isFav(c.productIds)} onFav={() => toggleFav(c.productIds)} onRecord={() => doRecord(c.productIds)} recorded={!!todayLunch} />)}
      </div>
      {exclude.length > 0 && <button className="-mt-3 mb-6 px-1 text-[13px] text-ink-3 underline cursor-pointer" onClick={() => setExclude([])}>最初の候補に戻す</button>}

      <section className="mb-6">
        <div className="mb-2 flex items-end justify-between px-1">
          <h2 className="text-[17px] font-bold">自分で組み合わせる</h2>
        </div>
        <div className="surface flex flex-wrap items-center gap-3 p-4">
          <ScanBarcode size={22} className="text-ink-2" aria-hidden />
          <p className="min-w-0 flex-1 text-[14px] text-ink-2">商品名検索・商品コード入力（デモ用コード）から選べます</p>
          <Button variant="tinted" icon={<Plus size={16} />} onClick={() => setBuilder(true)}>商品を選ぶ</Button>
        </div>
      </section>

      {favorites.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 px-1 text-[17px] font-bold">お気に入り</h2>
          <ul className="surface divide-y divide-line">
            {favorites.map((f) => {
              const ps = f.productIds.map((id) => SEVEN_MAP[id]).filter(Boolean)
              const n = comboNutrients(ps)
              return (
                <li key={f.key} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-medium">{ps.map((p) => p.name).join(' ＋ ')}</p>
                    <p className="num text-[12px] text-ink-3">{yen(ps.reduce((a, p) => a + p.price, 0))}・{Math.round(n.kcal)}kcal・P{Math.round(n.protein)}g</p>
                  </div>
                  <Button size="sm" variant="tinted" onClick={() => doRecord(f.productIds)}>記録</Button>
                  <IconButton label="お気に入りから外す" onClick={() => toggleFav(f.productIds)}><X size={17} /></IconButton>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      <section className="mb-8">
        <h2 className="mb-2 px-1 text-[17px] font-bold">購入履歴</h2>
        {history.length ? (
          <ul className="surface divide-y divide-line">
            {history.map((m) => (
              <li key={m.id} className="flex items-center gap-3 px-4 py-3">
                <span className="num w-12 shrink-0 text-[13px] text-ink-3">{fmtMD(m.date)}<br />（{weekday(m.date)}）</span>
                <span className="min-w-0 flex-1 text-[14px] leading-snug">{m.items.map((i) => i.name).join('・')}</span>
                <span className="num text-[14px] font-semibold">{yen(m.price ?? 0)}</span>
                <IconButton label="この記録を削除" onClick={() => deleteMealWithUndo(m.id, '昼食の記録を削除しました（支出からも除外）')}><Trash2 size={16} /></IconButton>
              </li>
            ))}
          </ul>
        ) : <div className="surface"><Empty icon={<Heart size={24} />} title="まだ記録がありません" /></div>}
      </section>

      <BuilderSheet open={builder} onClose={() => setBuilder(false)} onRecord={(ids) => { setBuilder(false); doRecord(ids) }} />
      <Sheet open={!!confirmIds} onClose={() => setConfirmIds(null)} title="今日の昼食は記録済みです" footer={<div className="flex gap-2"><Button variant="secondary" className="flex-1" onClick={() => setConfirmIds(null)}>やめる</Button><Button className="flex-1" onClick={() => confirmIds && doRecord(confirmIds, true)}>置き換える</Button></div>}>
        <p className="text-[15px] leading-relaxed text-ink-2">記録済みの「{todayLunch?.items.map((i) => i.name).join('・')}」を新しい内容で置き換えます。昼食費も置き換え後の金額になります（二重に計上しません）。</p>
      </Sheet>
    </Page>
  )
}

function ComboCard({ c, highlight, fav, onFav, onRecord, recorded }: { c: LunchCombo; highlight: boolean; fav: boolean; onFav: () => void; onRecord: () => void; recorded: boolean }) {
  const ps = c.productIds.map((id) => SEVEN_MAP[id])
  return (
    <article className={cx('surface flex flex-col p-4', highlight && 'ring-2 ring-basil')}>
      <div className="flex items-center justify-between">
        <p className="text-[14px] font-bold text-basil">{MODE_LABEL[c.mode as keyof typeof MODE_LABEL]}</p>
        <IconButton label={fav ? 'お気に入りから外す' : 'お気に入りに追加'} aria-pressed={fav} onClick={onFav} className="-mr-2 h-10 w-10">
          <Heart size={19} className={fav ? 'fill-raw text-raw' : ''} />
        </IconButton>
      </div>
      <ul className="mt-1 space-y-1">
        {ps.map((p) => <li key={p.id} className="flex justify-between gap-2 text-[14px]"><span className="min-w-0">{p.name}</span><span className="num shrink-0 text-ink-2">{yen(p.price)}</span></li>)}
      </ul>
      <p className="mt-3 flex items-baseline gap-3 border-t border-line pt-3">
        <span className="num text-[22px] font-bold">{yen(c.price)}</span>
        <span className="num text-[13px] text-ink-2">{Math.round(c.nutrients.kcal)}kcal</span>
      </p>
      <p className="num mt-1 text-[12px] text-ink-2">P {r1(c.nutrients.protein)}g・F {r1(c.nutrients.fat)}g・C {r1(c.nutrients.carbs)}g・繊維 {r1(c.nutrients.fiber)}g・塩分 {r1(c.nutrients.salt)}g</p>
      <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
        {[['健康', c.scores.health], ['筋肉維持', c.scores.muscle], ['節約', c.scores.budget]].map(([k, v]) => (
          <div key={k as string}>
            <div className="mb-1 flex justify-between text-ink-3"><span>{k}</span><span className="num">{Math.round((v as number) * 100)}</span></div>
            <div className="h-1.5 overflow-hidden rounded-full bg-sunken"><div className="h-full rounded-full bg-basil" style={{ width: `${(v as number) * 100}%` }} /></div>
          </div>
        ))}
      </div>
      <ul className="mt-3 flex-1 space-y-1 text-[13px] leading-snug text-ink-2">
        {c.reasons.map((r) => <li key={r} className="flex gap-1.5"><span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-ink-3" aria-hidden />{r}</li>)}
      </ul>
      <Button className="mt-4 w-full" variant={recorded ? 'secondary' : 'primary'} onClick={onRecord}>{recorded ? 'これに置き換える' : 'これを記録'}</Button>
    </article>
  )
}

/** 昼食（記録 or 候補）と今日の夕食（献立の推定）を合わせた評価 */
function PairWithDinner() {
  const t = today()
  const meals = useStore((s) => s.meals)
  const plan = useStore((s) => s.plan)
  const recipes = useStore((s) => s.recipes)
  const targets = useTargets()
  const lunch = meals.find((m) => m.date === t && m.slot === 'lunch')
  const dinnerLog = meals.find((m) => m.date === t && m.slot === 'dinner')
  const day = plan?.days.find((d) => d.date === t)
  const dinner = dinnerLog?.nutrients ?? [day?.dinner.main, day?.dinner.side].filter(Boolean).reduce((a, id) => add(a, recipeNutrition(recipes[id!])), { ...ZERO })
  if (!lunch) return null
  const n = add(lunch.nutrients, dinner)
  const share = 0.68 // 昼＋夕で1日の約2/3を目安にする
  return (
    <section className="surface mb-6 p-5">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-semibold text-ink-2">今日の昼食＋夕食{dinnerLog ? '' : '（予定）'}</h2>
        <Tag tone="basil">昼食 記録済み {yen(lunch.price ?? 0)}</Tag>
      </div>
      <p className="mb-3 text-[14px]">{lunch.items.map((i) => i.name).join('・')} ／ 夕食：{dinnerLog ? dinnerLog.label : [day?.dinner.main, day?.dinner.side].filter(Boolean).map((id) => recipes[id!]?.name).join('・') || '未定'}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Meter label="たんぱく質" value={n.protein} target={Math.round(targets.protein * share)} unit="g" />
        <Meter label="エネルギー" value={n.kcal} target={Math.round(targets.kcal * share)} unit="kcal" />
        <Meter label="野菜" value={n.vegG} target={Math.round(targets.vegG * share)} unit="g" />
        <Meter label="食塩相当量" value={n.salt} target={Math.round(targets.salt * share * 10) / 10} unit="g" mode="limit" tone="amber" />
      </div>
      <p className="mt-3 text-[12px] leading-relaxed text-ink-3">目安は1日の目標の約2/3（朝食・間食を除いた分）。夕食{dinnerLog ? 'は記録値' : 'は献立からの推定'}、昼食はデモ商品の表示値を模した値です。</p>
    </section>
  )
}

function BuilderSheet({ open, onClose, onRecord }: { open: boolean; onClose: () => void; onRecord: (ids: string[]) => void }) {
  const budget = useStore((s) => s.profile.lunchBudget)
  const targets = useTargets()
  const [q, setQ] = useState('')
  const [code, setCode] = useState('')
  const [tray, setTray] = useState<string[]>([])
  const [scan, setScan] = useState(false)
  const list = SEVEN_PRODUCTS.filter((p) => !q || p.name.includes(q) || p.category.includes(q))
  const ps = tray.map((id) => SEVEN_MAP[id])
  const s = ps.length ? scoreCombo(ps, budget, targets.kcal) : undefined
  const addCode = (c: string) => {
    const p = SEVEN_BY_CODE[c.trim().toUpperCase()]
    if (!p) return toast('そのコードのデモ商品は見つかりません（例：DEMO-4901000）', 'error')
    setTray((x) => [...x, p.id])
    setCode('')
    toast(`${p.name}を追加しました`)
  }
  return (
    <Sheet open={open} onClose={onClose} title="商品を選ぶ" wide footer={
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className={cx('num text-[17px] font-bold', s && s.price > budget && 'text-raw')}>{yen(s?.price ?? 0)}<span className="text-[13px] font-normal text-ink-3"> / {yen(budget)}</span></p>
          {s && <p className="num text-[12px] text-ink-2">{Math.round(s.n.kcal)}kcal・P{Math.round(s.n.protein)}g・塩分{r1(s.n.salt)}g</p>}
        </div>
        <Button disabled={!tray.length} onClick={() => { onRecord(tray); setTray([]) }}>記録する</Button>
      </div>
    }>
      {tray.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {tray.map((id, i) => <button key={i} onClick={() => setTray(tray.filter((_, j) => j !== i))} className="press inline-flex h-8 items-center gap-1 rounded-full bg-ink px-3 text-[13px] text-white cursor-pointer">{SEVEN_MAP[id].name}<X size={13} aria-label="外す" /></button>)}
        </div>
      )}
      {s && s.price > budget && <p className="mb-3 text-[13px] text-raw">予算を{yen(s.price - budget)}超えています</p>}
      <form className="mb-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); addCode(code) }}>
        <input className={cx(inputCls, 'num')} placeholder="商品コード（例：DEMO-4901000）" value={code} onChange={(e) => setCode(e.target.value)} aria-label="商品コード" />
        <Button type="submit" variant="secondary">検索</Button>
        <IconButton label="カメラで読み取る" onClick={() => setScan(true)}><Camera size={19} /></IconButton>
      </form>
      {scan && <Scanner onCode={(c) => { setScan(false); addCode(c) }} onClose={() => setScan(false)} />}
      <div className="relative mb-2">
        <Search size={17} className="absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" aria-hidden />
        <input className={cx(inputCls, 'pl-9')} placeholder="商品名・カテゴリで探す" value={q} onChange={(e) => setQ(e.target.value)} aria-label="商品名で探す" />
      </div>
      <ul className="divide-y divide-line">
        {list.map((p) => (
          <li key={p.id}>
            <button className="press flex w-full items-center gap-3 py-2.5 text-left cursor-pointer" onClick={() => setTray([...tray, p.id])}>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px]">{p.name}</span>
                <span className="num block text-[12px] text-ink-3">{p.category}・{p.nutrients.kcal}kcal・P{p.nutrients.protein}g・塩分{p.nutrients.salt}g・{p.code}</span>
              </span>
              <span className="num text-[15px] font-semibold">{yen(p.price)}</span>
              <Plus size={18} className="text-basil" aria-hidden />
            </button>
          </li>
        ))}
        {!list.length && <li className="py-6 text-center text-[14px] text-ink-3">該当する商品がありません</li>}
      </ul>
    </Sheet>
  )
}

/** BarcodeDetector 対応ブラウザのみカメラ読み取り。非対応なら手動入力へ案内 */
function Scanner({ onCode, onClose }: { onCode: (c: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState<string>()
  useEffect(() => {
    const W = window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => { detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]> } }
    if (!W.BarcodeDetector) { setError('このブラウザはカメラでのバーコード読み取りに対応していません。商品コードを手入力してください。'); return }
    let stream: MediaStream | undefined
    let stop = false
    const detector = new W.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'code_128', 'qr_code'] })
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: 'environment' } }).then(async (s) => {
      stream = s
      if (!video.current) return
      video.current.srcObject = s
      await video.current.play()
      const loop = async () => {
        if (stop || !video.current) return
        try {
          const r = await detector.detect(video.current)
          if (r[0]) return onCode(r[0].rawValue)
        } catch { /* 次のフレームで再試行 */ }
        requestAnimationFrame(loop)
      }
      loop()
    }).catch(() => setError('カメラを使用できませんでした（権限が許可されていない可能性があります）。商品コードを手入力してください。'))
    return () => { stop = true; stream?.getTracks().forEach((t) => t.stop()) }
  }, [onCode])
  return (
    <div className="mb-3 overflow-hidden rounded-[14px] bg-ink text-white">
      {error ? <p className="p-4 text-[14px] leading-relaxed">{error}</p> : <video ref={video} className="aspect-video w-full object-cover" muted playsInline />}
      <button className="w-full py-2.5 text-[14px] font-semibold cursor-pointer" onClick={onClose}>閉じる</button>
    </div>
  )
}
