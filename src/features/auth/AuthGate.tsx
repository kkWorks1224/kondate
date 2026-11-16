import { motion } from 'motion/react'
import { AlertCircle, ChefHat } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'
import { Skeleton } from '../../components/ui/bits'
import { boot, useCloud } from '../../services/cloud'

/** ログインと初回同期が済むまで、全画面スケルトンかログイン画面を出す */
export function AuthGate({ children }: { children: ReactNode }) {
  const phase = useCloud((s) => s.phase)
  useEffect(() => {
    void boot()
  }, [])
  useEffect(() => {
    if (phase !== 'checking') document.getElementById('boot')?.remove()
  }, [phase])
  if (phase === 'signedOut') return <Login />
  if (phase !== 'ready') return <AppSkeleton />
  return <>{children}</>
}

/** アプリの骨組み（サイドバー／下部タブ・見出し・カード）を模した全画面スケルトン */
export function AppSkeleton() {
  return (
    <div className="min-h-dvh lg:flex" aria-busy="true" aria-label="読み込み中">
      <aside className="hidden h-dvh w-[248px] shrink-0 flex-col gap-2 border-r border-line bg-[#f9faf8] px-6 py-5 lg:flex">
        <Skeleton className="mb-6 h-8 w-36" />
        {Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-9 w-full" />)}
      </aside>
      <div className="mx-auto w-full max-w-[960px] px-4 pt-[calc(env(safe-area-inset-top)+20px)] sm:px-6 lg:px-10 lg:pt-10">
        <Skeleton className="mb-2 h-9 w-44" />
        <Skeleton className="mb-6 h-4 w-60" />
        <Skeleton className="mb-3 h-44 w-full rounded-[18px]" />
        <div className="mb-3 grid grid-cols-2 gap-3">
          <Skeleton className="h-28 rounded-[18px]" />
          <Skeleton className="h-28 rounded-[18px]" />
        </div>
        <Skeleton className="mb-3 h-24 w-full rounded-[18px]" />
        <Skeleton className="h-24 w-full rounded-[18px]" />
      </div>
      <nav className="glass fixed inset-x-0 bottom-0 flex h-[calc(64px+env(safe-area-inset-bottom))] justify-around border-t border-line px-4 pt-3 lg:hidden">
        {Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-9 w-12" />)}
      </nav>
    </div>
  )
}

const G = (
  <svg viewBox="0 0 48 48" width="22" height="22" aria-hidden>
    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
    <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
    <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
  </svg>
)

function Login() {
  const notice = useCloud((s) => s.notice)
  const err = new URLSearchParams(location.search).get('auth') === 'error'
  const spring = (delay = 0) => ({ type: 'spring' as const, duration: 0.6, bounce: 0.2, delay })
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 pb-[env(safe-area-inset-bottom)] text-center">
      <motion.span
        className="mb-5 flex h-[88px] w-[88px] items-center justify-center rounded-[24px] bg-basil text-white shadow-lift"
        initial={{ opacity: 0, scale: 0.85, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', duration: 0.7, bounce: 0.3 }}
        aria-hidden
      >
        <ChefHat size={44} strokeWidth={1.8} />
      </motion.span>
      <motion.h1 className="mb-8 text-[30px] font-extrabold tracking-tight" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={spring(0.06)}>
        今週の献立
      </motion.h1>
      <motion.a
        href="/auth/login"
        className="press glass inline-flex h-[54px] min-w-[280px] items-center justify-center gap-3 rounded-full px-6 text-[17px] font-semibold shadow-card ring-1 ring-line"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={spring(0.12)}
      >
        {G}
        Google でログイン
      </motion.a>
      {(err || notice) && (
        <p role="alert" className="mt-5 flex max-w-[340px] items-start gap-2 rounded-2xl bg-raw-soft px-4 py-3 text-left text-[14px] text-raw">
          <AlertCircle size={18} className="mt-0.5 shrink-0" aria-hidden />
          {err ? 'ログインできませんでした。もう一度お試しください。' : notice}
        </p>
      )}
      <p className="mt-6 max-w-[34ch] text-[13px] leading-relaxed text-ink-3">献立・レシピ・在庫・食事の記録は Google アカウントに紐づけて保存され、スマホとパソコンで同期されます。</p>
    </main>
  )
}
