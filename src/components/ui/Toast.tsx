import { AnimatePresence, motion } from 'motion/react'
import { CheckCircle2, AlertCircle, Info } from 'lucide-react'
import { create } from 'zustand'

type Tone = 'ok' | 'error' | 'info'
interface ToastItem { id: number; text: string; tone: Tone; action?: { label: string; run: () => void } }
interface ToastState { items: ToastItem[]; push: (t: Omit<ToastItem, 'id'>) => void; dismiss: (id: number) => void }

let n = 0
export const useToast = create<ToastState>((set) => ({
  items: [],
  push: (t) => {
    const id = ++n
    set((s) => ({ items: [...s.items.slice(-2), { ...t, id }] }))
    setTimeout(() => set((s) => ({ items: s.items.filter((i) => i.id !== id) })), t.action ? 5000 : 3200)
  },
  dismiss: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
}))

export const toast = (text: string, tone: Tone = 'ok', action?: ToastItem['action']) => useToast.getState().push({ text, tone, action })

export function Toaster() {
  const { items, dismiss } = useToast()
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 top-[max(env(safe-area-inset-top),10px)] z-[70] flex flex-col items-center gap-2 px-4 lg:top-auto lg:bottom-6">
      <AnimatePresence initial={false}>
        {items.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: -12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, transition: { duration: 0.16 } }}
            transition={{ type: 'spring', duration: 0.4, bounce: 0.1 }}
            className="pointer-events-auto flex max-w-md items-center gap-3 rounded-2xl bg-[#1f2420]/92 py-3 pl-4 pr-3 text-[14px] text-white shadow-lift backdrop-blur"
            role="status"
          >
            {t.tone === 'ok' ? <CheckCircle2 size={18} className="shrink-0 text-[#8fd3ae]" aria-hidden /> : t.tone === 'error' ? <AlertCircle size={18} className="shrink-0 text-[#ffb4ab]" aria-hidden /> : <Info size={18} className="shrink-0 text-[#a9c8ef]" aria-hidden />}
            <span className="leading-snug">{t.text}</span>
            {t.action && (
              <button className="press ml-1 shrink-0 rounded-lg px-2 py-1 font-semibold text-[#8fd3ae] hover:bg-white/10 cursor-pointer" onClick={() => { t.action!.run(); dismiss(t.id) }}>
                {t.action.label}
              </button>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
