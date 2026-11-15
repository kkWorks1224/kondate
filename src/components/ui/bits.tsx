import type { ReactNode } from 'react'
import { Minus, Plus } from 'lucide-react'
import { cx } from '../../lib/format'

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('skeleton', className)} aria-hidden />
}

export function Empty({ icon, title, body, action }: { icon: ReactNode; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-sunken text-ink-2" aria-hidden>{icon}</div>
      <p className="text-[16px] font-semibold">{title}</p>
      {body && <p className="mt-1 max-w-xs text-[14px] leading-relaxed text-ink-2">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

type TagTone = 'neutral' | 'basil' | 'amber' | 'raw' | 'sky'
const TONE: Record<TagTone, string> = {
  neutral: 'bg-sunken text-ink-2',
  basil: 'bg-basil-soft text-basil-ink',
  amber: 'bg-amber-soft text-amber',
  raw: 'bg-raw-soft text-raw',
  sky: 'bg-sky-soft text-sky',
}
export function Tag({ tone = 'neutral', children, className }: { tone?: TagTone; children: ReactNode; className?: string }) {
  return <span className={cx('inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2 text-[12px] font-semibold whitespace-nowrap', TONE[tone], className)}>{children}</span>
}

/** iOS の inset grouped リスト */
export function Group({ title, children, footer, action, className }: { title?: string; children: ReactNode; footer?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <section className={cx('mb-6', className)}>
      {(title || action) && (
        <div className="mb-2 flex items-end justify-between gap-2 px-1">
          {title && <h2 className="text-[17px] font-bold tracking-tight">{title}</h2>}
          {action}
        </div>
      )}
      <div className="surface divide-y divide-line overflow-hidden">{children}</div>
      {footer && <p className="mt-2 px-1 text-[13px] leading-relaxed text-ink-3">{footer}</p>}
    </section>
  )
}

export function Row({ children, className, onClick, as = 'div' }: { children: ReactNode; className?: string; onClick?: () => void; as?: 'div' | 'button' | 'li' }) {
  const C = onClick ? 'button' : as
  return (
    <C type={onClick ? 'button' : undefined} onClick={onClick} className={cx('flex min-h-[52px] w-full items-center gap-3 px-4 py-3 text-left', onClick && 'press cursor-pointer hover:bg-sunken/60 active:bg-sunken', className)}>
      {children}
    </C>
  )
}

/** 目標に対する進み具合。色だけに頼らず数値も併記する */
export function Meter({ value, target, label, unit, tone = 'basil', mode = 'reach', note }: { value: number; target: number; label: string; unit: string; tone?: 'basil' | 'amber' | 'sky'; mode?: 'reach' | 'limit'; note?: string }) {
  const pct = target > 0 ? value / target : 0
  const over = mode === 'limit' && value > target
  const color = over ? 'bg-raw' : tone === 'amber' ? 'bg-amber' : tone === 'sky' ? 'bg-sky' : 'bg-basil'
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2 text-[13px]">
        <span className="text-ink-2">{label}</span>
        <span className="num font-semibold">
          <span className={over ? 'text-raw' : ''}>{value >= 100 ? Math.round(value) : Math.round(value * 10) / 10}</span>
          <span className="font-normal text-ink-3"> / {target}{unit}{mode === 'limit' ? '未満' : ''}</span>
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-sunken" role="meter" aria-label={label} aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={target}>
        <div className={cx('h-full rounded-full transition-[width] duration-500', color)} style={{ width: `${Math.min(100, pct * 100)}%` }} />
      </div>
      {note && <p className="mt-1 text-[12px] text-ink-3">{note}</p>}
    </div>
  )
}

export function Stepper({ value, onChange, step = 1, min = 0, max = 9999, label, unit }: { value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number; label: string; unit?: string }) {
  return (
    <div className="inline-flex items-center rounded-[12px] bg-sunken" role="group" aria-label={label}>
      <button type="button" aria-label={`${label}を減らす`} className="press flex h-10 w-10 items-center justify-center rounded-[12px] text-ink-2 hover:bg-black/5 disabled:opacity-30 cursor-pointer" disabled={value <= min} onClick={() => onChange(Math.max(min, Math.round((value - step) * 100) / 100))}>
        <Minus size={16} />
      </button>
      <span className="num min-w-12 text-center text-[15px] font-semibold" aria-live="polite">{value}{unit && <span className="text-[12px] font-normal text-ink-3">{unit}</span>}</span>
      <button type="button" aria-label={`${label}を増やす`} className="press flex h-10 w-10 items-center justify-center rounded-[12px] text-ink-2 hover:bg-black/5 disabled:opacity-30 cursor-pointer" disabled={value >= max} onClick={() => onChange(Math.min(max, Math.round((value + step) * 100) / 100))}>
        <Plus size={16} />
      </button>
    </div>
  )
}

export function Field({ label, children, hint, error }: { label: string; children: ReactNode; hint?: string; error?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-semibold text-ink-2">{label}</span>
      {children}
      {error ? <span className="mt-1 block text-[12px] text-raw">{error}</span> : hint ? <span className="mt-1 block text-[12px] text-ink-3">{hint}</span> : null}
    </label>
  )
}

export const inputCls = 'h-11 w-full rounded-[12px] bg-sunken px-3 text-[16px] outline-none ring-basil/40 placeholder:text-ink-3 focus:bg-surface focus:ring-2'

export function SampleNote({ children }: { children: ReactNode }) {
  return <span className="inline-flex items-center gap-1 rounded-md bg-amber-soft px-1.5 py-0.5 text-[11px] font-semibold text-amber">{children}</span>
}
