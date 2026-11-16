import { AnimatePresence, motion, useDragControls, useReducedMotion, type PanInfo } from 'motion/react'
import { X } from 'lucide-react'
import { useEffect, useRef, type ReactNode } from 'react'
import { IconButton } from './Button'

/** モバイルは下からのシート（下にスワイプで閉じる）、デスクトップは中央のダイアログ */
export function Sheet({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const reduce = useReducedMotion()
  const panel = useRef<HTMLDivElement>(null)
  const controls = useDragControls()
  useEffect(() => {
    if (!open) return
    const prev = document.activeElement as HTMLElement | null
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    const t = setTimeout(() => { const p = panel.current; (p?.querySelector<HTMLElement>('[data-autofocus]') ?? p?.querySelector<HTMLElement>('input, select, textarea, button'))?.focus() }, 60)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      clearTimeout(t)
      document.body.style.overflow = ''
      prev?.focus?.()
    }
  }, [open, onClose])

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > 120 || info.velocity.y > 500) onClose()
  }

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center lg:items-center" role="dialog" aria-modal="true" aria-label={title}>
          <motion.div className="absolute inset-0 bg-[#141a16]/35" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} onClick={onClose} />
          <motion.div
            ref={panel}
            className={`relative flex max-h-[92dvh] w-full flex-col rounded-t-[22px] bg-surface shadow-lift lg:rounded-[22px] ${wide ? 'lg:max-w-2xl' : 'lg:max-w-lg'}`}
            initial={reduce ? { opacity: 0 } : { y: '100%' }}
            animate={reduce ? { opacity: 1 } : { y: 0 }}
            exit={reduce ? { opacity: 0 } : { y: '100%', transition: { duration: 0.22, ease: [0.32, 0.72, 0, 1] } }}
            transition={{ duration: 0.38, ease: [0.32, 0.72, 0, 1] }}
            drag={reduce ? false : 'y'}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0.05, bottom: 0.6 }}
            dragListener={false}
            dragControls={controls}
            onDragEnd={onDragEnd}
          >
            <div className="touch-none" onPointerDown={(e) => !reduce && controls.start(e)}>
              <div className="flex cursor-grab justify-center pt-2 pb-1 lg:hidden" aria-hidden>
                <span className="h-1.5 w-10 rounded-full bg-ink/15" />
              </div>
              <div className="flex items-center justify-between gap-2 px-5 pt-1 pb-2 lg:pt-4">
              <h2 className="text-[19px] font-bold tracking-tight">{title}</h2>
              <IconButton label="閉じる" onClick={onClose} className="-mr-2">
                <X size={20} />
              </IconButton>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5">{children}</div>
            {footer && <div className="pb-safe border-t border-line px-5 pt-3 pb-3">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
