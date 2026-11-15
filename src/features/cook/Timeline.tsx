import { useMemo } from 'react'
import { cx } from '../../lib/format'
import type { CookPlanResult, Recipe, TaskState } from '../../types'

interface Block { key: string; lane: string; start: number; end: number; title: string; short: string; color: string; striped?: boolean; taskIds: string[] }

/** 手作業と各器具をレーンに分けた調理タイムライン（並列実行を可視化） */
export function Timeline({ result, recipes, progress, currentId, onSelect }: { result: CookPlanResult; recipes: Record<string, Recipe>; progress?: Record<string, TaskState>; currentId?: string; onSelect?: (id: string) => void }) {
  const { lanes, blocks, total } = useMemo(() => {
    const colorOf = (ids: string[]) => (ids.length === 1 ? recipes[ids[0]]?.color ?? '#6B6F7A' : '#5f655d')
    const blocks: Block[] = []
    for (const t of result.tasks) {
      if (t.attended) blocks.push({ key: t.id, lane: '手作業', start: t.start, end: t.end, title: t.title, short: t.title.replace(/（.*?）/g, ''), color: t.kind === 'clean' ? '#b42318' : colorOf(t.recipeIds), taskIds: [t.id] })
      else if (t.kind === 'cool' || t.kind === 'rest') blocks.push({ key: t.id, lane: '待ち時間', start: t.start, end: t.end, title: t.title, short: t.title.replace(/（.*?）/g, ''), color: colorOf(t.recipeIds), striped: true, taskIds: [t.id] })
    }
    for (const o of result.occupancy) {
      const names = o.recipeIds.map((id) => recipes[id]?.name).filter(Boolean).join('・')
      blocks.push({ key: `${o.unit}-${o.start}`, lane: o.label, start: o.start, end: o.end, title: `${o.label}：${names || '炊飯'}`, short: names || '炊飯', color: colorOf(o.recipeIds), taskIds: o.taskIds })
    }
    const devices = [...new Set(result.occupancy.map((o) => o.label))].sort((a, b) => order(a) - order(b))
    const lanes = ['手作業', ...devices, ...(blocks.some((b) => b.lane.startsWith('待ち時間')) ? ['待ち時間'] : [])]
    return { lanes, blocks, total: Math.max(10, result.totalMin) }
  }, [result, recipes])

  const ticks = Array.from({ length: Math.floor(total / 10) + 1 }, (_, i) => i * 10)
  const pct = (m: number) => `${(m / total) * 100}%`

  return (
    <div className="no-scrollbar -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <div className="min-w-[680px]" role="img" aria-label={`調理タイムライン。全体${result.totalMin}分。${lanes.join('、')}のレーン`}>
        <div className="relative ml-[104px] h-5 text-[11px] text-ink-3">
          {ticks.map((m) => <span key={m} className="num absolute -translate-x-1/2" style={{ left: pct(m) }}>{m}分</span>)}
        </div>
        {lanes.map((lane) => {
          const packed = pack(blocks.filter((b) => b.lane === lane))
          const rows = packed[0]?.rows ?? 1
          return (
          <div key={lane} className="flex items-center border-t border-line py-1.5">
            <span className="w-[104px] shrink-0 truncate pr-2 text-[12px] font-semibold text-ink-2">{lane}</span>
            <div className="relative flex-1 rounded-md bg-sunken/60" style={{ height: rows * 30 + 2 }}>
              {ticks.map((m) => <span key={m} className="absolute inset-y-0 w-px bg-line" style={{ left: pct(m) }} aria-hidden />)}
              {packed.map(({ b, row }) => {
                const done = progress && b.taskIds.every((id) => progress[id])
                const cur = b.taskIds.includes(currentId ?? '')
                return (
                  <button
                    key={b.key}
                    title={b.title}
                    onClick={() => onSelect?.(b.taskIds[0])}
                    className={cx('absolute overflow-hidden rounded-[6px] px-1.5 text-left text-[11px] leading-[28px] font-semibold whitespace-nowrap text-white transition-opacity', b.striped && 'stripes', done && 'opacity-35', cur && 'ring-2 ring-ink ring-offset-1', onSelect && 'cursor-pointer')}
                    style={{ left: pct(b.start), width: `calc(${pct(b.end - b.start)} - 2px)`, top: row * 30 + 2, height: 28, lineHeight: '28px', background: b.striped ? `${b.color}66` : b.color, color: b.striped ? '#1c1c1e' : undefined }}
                  >
                    {b.short}
                  </button>
                )
              })}
            </div>
          </div>
          )
        })}
      </div>
    </div>
  )
}

/** 重なるブロックを段に分ける（冷却の待ち時間など） */
function pack(list: Block[]) {
  const ends: number[] = []
  const placed = [...list].sort((a, b) => a.start - b.start).map((b) => {
    let row = ends.findIndex((e) => e <= b.start + 0.01)
    if (row < 0) { row = ends.length; ends.push(0) }
    ends[row] = b.end
    return { b, row }
  })
  const rows = Math.max(1, ends.length)
  return placed.map((p) => ({ ...p, rows }))
}

function order(label: string) {
  if (label.startsWith('ガスコンロ')) return 0
  if (label.includes('グリル')) return 1
  if (label.includes('レンジ')) return 2
  if (label.includes('炊飯')) return 3
  return 4
}
