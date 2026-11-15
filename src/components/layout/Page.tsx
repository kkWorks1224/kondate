import { ChevronLeft } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { cx } from '../../lib/format'

export function Page({ title, subtitle, actions, back, children, wide }: { title: string; subtitle?: ReactNode; actions?: ReactNode; back?: string | true; children: ReactNode; wide?: boolean }) {
  const sentinel = useRef<HTMLDivElement>(null)
  const [stuck, setStuck] = useState(false)
  const nav = useNavigate()
  useEffect(() => {
    const el = sentinel.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => setStuck(!e.isIntersecting), { rootMargin: '-8px 0px 0px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  useEffect(() => {
    document.title = `${title}｜今週の献立`
  }, [title])
  const goBack = () => (typeof back === 'string' ? nav(back) : nav(-1))

  return (
    <div className={cx('mx-auto w-full px-4 sm:px-6 lg:px-10', wide ? 'max-w-[1180px]' : 'max-w-[960px]')}>
      {/* スクロール時の小さなタイトルバー */}
      <div className={cx('glass fixed inset-x-0 top-0 z-30 border-b border-line pt-[env(safe-area-inset-top)] transition-opacity duration-200 lg:left-[248px]', stuck ? 'opacity-100' : 'pointer-events-none opacity-0')} aria-hidden={!stuck}>
        <div className="mx-auto flex h-12 max-w-[960px] items-center gap-1 px-2">
          {back && (
            <button onClick={goBack} className="press flex h-10 w-10 items-center justify-center rounded-full text-basil cursor-pointer" aria-label="戻る" tabIndex={stuck ? 0 : -1}>
              <ChevronLeft size={22} />
            </button>
          )}
          <span className={cx('flex-1 truncate text-[16px] font-semibold', !back && 'px-2')}>{title}</span>
        </div>
      </div>
      <header className="pt-[max(env(safe-area-inset-top),12px)] pb-4 lg:pt-8">
        {back && (
          <button onClick={goBack} className="press -ml-2 mb-1 flex h-10 items-center gap-0.5 rounded-full pr-3 pl-1 text-[15px] font-medium text-basil cursor-pointer">
            <ChevronLeft size={22} aria-hidden /> 戻る
          </button>
        )}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 pt-2">
            <h1 className="text-[30px] leading-[1.15] font-bold tracking-[-0.02em] lg:text-[32px]">{title}</h1>
            {subtitle && <div className="mt-1 text-[15px] text-ink-2">{subtitle}</div>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-1 pt-2">{actions}</div>}
        </div>
        <div ref={sentinel} className="h-px" />
      </header>
      {children}
    </div>
  )
}
