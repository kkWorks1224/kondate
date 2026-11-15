import { motion } from 'motion/react'
import { useId } from 'react'
import { cx } from '../../lib/format'

export function Segmented<T extends string>({ value, onChange, options, label, className }: { value: T; onChange: (v: T) => void; options: { value: T; label: string; count?: number }[]; label: string; className?: string }) {
  const id = useId()
  return (
    <div role="tablist" aria-label={label} className={cx('relative flex rounded-[12px] bg-sunken p-1', className)}>
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cx('relative z-0 flex h-9 min-w-0 flex-1 items-center justify-center gap-1 rounded-[9px] px-2 text-[14px] font-semibold transition-colors cursor-pointer', active ? 'text-ink' : 'text-ink-2 hover:text-ink')}
          >
            {active && <motion.span layoutId={`seg-${id}`} className="absolute inset-0 -z-10 rounded-[9px] bg-surface shadow-[0_1px_3px_rgb(0_0_0/0.1)]" transition={{ type: 'spring', duration: 0.32, bounce: 0.12 }} />}
            <span className="truncate">{o.label}</span>
            {o.count !== undefined && <span className="num text-[12px] text-ink-3">{o.count}</span>}
          </button>
        )
      })}
    </div>
  )
}
