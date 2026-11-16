import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { BookOpen, CalendarDays, ChefHat, HeartPulse, Home, Refrigerator, Settings, Store as StoreIcon } from 'lucide-react'
import { NavLink, useLocation, useOutlet } from 'react-router-dom'
import { cx } from '../../lib/format'
import { useStore } from '../../store/useStore'
import { Toaster } from '../ui/Toast'
import { SyncBadge } from '../../features/auth/SyncBadge'

const NAV = [
  { to: '/', label: 'ホーム', icon: Home, tab: true },
  { to: '/plan', label: '献立', long: '週間献立', icon: CalendarDays, tab: true },
  { to: '/recipes', label: 'レシピ', long: 'レシピ図鑑', icon: BookOpen },
  { to: '/cook', label: '調理', long: '一括調理ナビ', icon: ChefHat, tab: true },
  { to: '/pantry', label: '食材', long: '食材・買い物', icon: Refrigerator, tab: true },
  { to: '/lunch', label: '昼食', long: 'セブンの昼食', icon: StoreIcon },
  { to: '/health', label: '健康', long: '健康ダッシュボード', icon: HeartPulse, tab: true },
  { to: '/settings', label: '設定', long: '設定・データ', icon: Settings },
]

export function AppShell() {
  const location = useLocation()
  const outlet = useOutlet()
  const reduce = useReducedMotion()
  const cooking = useStore((s) => s.session && (s.session.status === 'active' || s.session.status === 'paused'))
  const section = '/' + (location.pathname.split('/')[1] ?? '')

  return (
    <div className="min-h-dvh lg:flex">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[80] focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2">本文へ移動</a>
      {/* デスクトップ：サイドバー */}
      <aside className="sticky top-0 hidden h-dvh w-[248px] shrink-0 flex-col border-r border-line bg-[#f9faf8] px-3 py-5 lg:flex">
        <div className="mb-6 flex items-center gap-2.5 px-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-basil text-white" aria-hidden>
            <ChefHat size={18} />
          </span>
          <span className="text-[17px] font-bold tracking-tight">今週の献立</span>
        </div>
        <nav aria-label="メイン" className="flex flex-col gap-0.5">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => cx('press flex h-10 items-center gap-3 rounded-[10px] px-3 text-[15px] font-medium', isActive ? 'bg-basil-soft text-basil-ink' : 'text-ink-2 hover:bg-sunken hover:text-ink')}>
              <n.icon size={18} aria-hidden />
              <span className="flex-1">{n.long ?? n.label}</span>
              {n.to === '/cook' && cooking && <span className="h-2 w-2 rounded-full bg-amber" aria-label="調理中" />}
            </NavLink>
          ))}
        </nav>
        <SyncBadge />
      </aside>

      <main id="main" className="min-w-0 flex-1 pb-[calc(76px+env(safe-area-inset-bottom))] lg:pb-10">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={section}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0, transition: { duration: 0.2, ease: [0.23, 1, 0.32, 1] } }}
            exit={{ opacity: 0, transition: { duration: 0.1 } }}
          >
            {outlet}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* モバイル：タブバー（片手で届く下部に主要5画面） */}
      <nav aria-label="タブ" className="glass pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-line lg:hidden">
        <div className="mx-auto flex max-w-xl">
          {NAV.filter((n) => n.tab).map((n) => {
            const active = n.to === '/' ? section === '/' : section === n.to
            return (
              <NavLink key={n.to} to={n.to} end={n.to === '/'} aria-current={active ? 'page' : undefined} className={cx('press relative flex h-[60px] flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold', active ? 'text-basil' : 'text-ink-3')}>
                <n.icon size={23} strokeWidth={active ? 2.3 : 1.9} aria-hidden />
                {n.label}
                {n.to === '/cook' && cooking && <span className="absolute top-2 right-[calc(50%-18px)] h-2 w-2 rounded-full bg-amber ring-2 ring-white" aria-label="調理中" />}
              </NavLink>
            )
          })}
        </div>
      </nav>
      <Toaster />
    </div>
  )
}
