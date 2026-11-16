import { AnimatePresence, motion } from 'motion/react'
import { AlertTriangle, ArrowRight, MessageSquareText, Send, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { Button } from '../../components/ui/Button'
import { Skeleton } from '../../components/ui/bits'
import { Sheet } from '../../components/ui/Sheet'
import { toast } from '../../components/ui/Toast'
import { applyOps, editContext, parseInstruction, sanitizeOps, type PlanOp } from '../../engine/planEdit'
import { today } from '../../lib/date'
import { cx } from '../../lib/format'
import { useStore } from '../../store/useStore'

const EXAMPLES = ['火曜日は不要', '今週は3日分だけ', '金曜は魚にして', '水曜と木曜は外食', '副菜をレンジで作れるものに']

type Preview = { busy: boolean; ops: PlanOp[]; changes: string[]; message: string; by: 'rule' | 'ai'; error?: string }

/** 「火曜は不要」「今週は3日分だけ」のような文章で献立を組み直す */
export function PlanEdit() {
  const plan = useStore((s) => s.plan)
  const apply = useStore((s) => s.applyPlanEdit)
  const restore = useStore((s) => s.restorePlan)
  const [text, setText] = useState('')
  const [pv, setPv] = useState<Preview | null>(null)
  if (!plan) return null

  const submit = async (input = text) => {
    const t = input.trim()
    if (!t) return
    const p = useStore.getState().plan!
    const rs = useStore.getState().recipes
    // よくある言い方はルールで即座に、それ以外は Workers AI で解釈
    const rule = parseInstruction(t, p, today())
    if (rule) {
      const { changes } = applyOps(p, rule.ops, rs)
      return setPv({ busy: false, ops: rule.ops, changes, message: rule.message, by: 'rule' })
    }
    setPv({ busy: true, ops: [], changes: [], message: '', by: 'ai' })
    try {
      const r = await fetch('/api/ai/plan-edit', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ instruction: t, context: editContext(p, rs, today()) }) })
      if (!r.ok) throw new Error(r.status === 429 ? 'AIの利用回数の上限に達しました。少し時間をおいてください' : 'AIの応答を取得できませんでした')
      const j = (await r.json()) as { ops: unknown; message: string }
      const ops = sanitizeOps(j.ops, rs)
      const { changes } = applyOps(p, ops, rs)
      setPv({ busy: false, ops, changes, message: j.message || (changes.length ? '献立を変更します' : '変更できる内容が見つかりませんでした'), by: 'ai' })
    } catch (e) {
      setPv({ busy: false, ops: [], changes: [], message: '', by: 'ai', error: e instanceof Error ? e.message : '解釈できませんでした' })
    }
  }

  const confirm = () => {
    if (!pv) return
    const prev = useStore.getState().plan!
    const changes = apply(pv.ops)
    setPv(null)
    setText('')
    toast(changes.length ? `献立を${changes.length}か所変更しました。食材・食費・工程を再計算しました` : '変更はありませんでした', 'ok', changes.length ? { label: '取り消す', run: () => restore(prev) } : undefined)
  }

  return (
    <section className="surface mb-5 p-4" aria-labelledby="edit-h">
      <h2 id="edit-h" className="mb-2 flex items-center gap-2 text-[16px] font-bold"><MessageSquareText size={18} className="text-basil" aria-hidden />指示で組み直す</h2>
      <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); void submit() }}>
        <textarea
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void submit() } }}
          placeholder="例：火曜日は不要／今週は3日分だけ"
          aria-label="献立への指示"
          maxLength={300}
          className="min-h-11 flex-1 resize-none rounded-[12px] bg-sunken px-3 py-2.5 text-[16px] leading-snug outline-none [field-sizing:content] focus:bg-surface focus:ring-2 focus:ring-basil/40"
        />
        <Button type="submit" disabled={!text.trim() || pv?.busy} icon={<Send size={16} />} aria-label="指示を送る">送る</Button>
      </form>
      <div className="no-scrollbar -mx-4 mt-2 flex gap-1.5 overflow-x-auto px-4">
        {EXAMPLES.map((x) => (
          <button key={x} type="button" className="press h-8 shrink-0 rounded-full bg-sunken px-3 text-[13px] text-ink-2 cursor-pointer hover:bg-basil-soft hover:text-basil-ink" onClick={() => { setText(x); void submit(x) }}>{x}</button>
        ))}
      </div>

      <Sheet open={!!pv} onClose={() => setPv(null)} title="献立の変更" footer={pv && !pv.busy && pv.changes.length > 0 ? (
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={() => setPv(null)}>やめる</Button>
          <Button className="flex-1" onClick={confirm}>この内容で変更</Button>
        </div>
      ) : undefined}>
        {pv?.busy && (
          <div className="space-y-2" aria-busy="true" aria-label="AIが指示を解釈中">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-12 w-full rounded-[12px]" />
            <Skeleton className="h-12 w-full rounded-[12px]" />
          </div>
        )}
        {pv?.error && <p role="alert" className="flex items-start gap-2 rounded-[12px] bg-raw-soft px-3 py-2.5 text-[14px] text-raw"><AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />{pv.error}</p>}
        {pv && !pv.busy && !pv.error && (
          <>
            <p className="mb-3 flex items-start gap-2 text-[15px] leading-relaxed">
              {pv.by === 'ai' && <Sparkles size={16} className="mt-1 shrink-0 text-basil" aria-label="AIが解釈" />}
              {pv.message}
            </p>
            {pv.changes.length ? (
              <ul className="space-y-1.5">
                <AnimatePresence initial>
                  {pv.changes.map((c, i) => {
                    const [day, rest] = c.split('：')
                    const [from, to] = (rest ?? c).split(' → ')
                    return (
                      <motion.li key={c} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0, transition: { delay: i * 0.04, type: 'spring', duration: 0.35, bounce: 0.1 } }} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-[12px] bg-sunken px-3 py-2.5 text-[14px]">
                        <span className="font-bold">{rest ? day : ''}</span>
                        {to ? (<><span className="text-ink-3 line-through">{from}</span><ArrowRight size={14} className="text-ink-3" aria-label="から" /><span className={cx('font-semibold', /なし/.test(to) ? 'text-amber' : 'text-basil-ink')}>{to}</span></>) : <span>{rest ?? c}</span>}
                      </motion.li>
                    )
                  })}
                </AnimatePresence>
              </ul>
            ) : (
              <p className="rounded-[12px] bg-sunken px-3 py-2.5 text-[14px] text-ink-2">今の献立から変わる点はありませんでした。言い方を変えてお試しください（例：「火曜日は不要」「金曜の主菜を鮭のホイル焼きに」）。</p>
            )}
            {pv.changes.length > 0 && <p className="mt-3 text-[12px] leading-relaxed text-ink-3">変更すると、買い物リスト・食費・一括調理の工程を自動で計算し直します。あとから「取り消す」で戻せます。</p>}
          </>
        )}
      </Sheet>
    </section>
  )
}
