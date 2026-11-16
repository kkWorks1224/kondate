import { animate, motion, useMotionValue, useTransform, type PanInfo } from 'motion/react'
import { useRef, useState, type ReactNode } from 'react'

export type FlickAction = { label: string; icon: ReactNode; color: string; run: () => void }

function haptic(ms = 8) {
  try {
    navigator.vibrate?.(ms)
  } catch {
    /* noop */
  }
}

/**
 * 行を左右にフリックして操作する。右＝主な操作（購入済み・食べた）、左＝削除など。
 * 閾値（幅の28%）を越えるか速くフリックすると実行。ボタン操作も残しているので、フリックは近道。
 */
export function Flick({ right, left, children, className = '', as: Tag = 'li' }: { right?: FlickAction; left?: FlickAction; children: ReactNode; className?: string; as?: 'li' | 'div' }) {
  const x = useMotionValue(0)
  const ref = useRef<HTMLElement>(null)
  const [armed, setArmed] = useState<'r' | 'l' | null>(null)
  const w = () => ref.current?.offsetWidth ?? 340
  const th = () => Math.min(110, w() * 0.28)
  const rOpacity = useTransform(x, [0, 20], [0, 1])
  const lOpacity = useTransform(x, [-20, 0], [1, 0])
  const rScale = useTransform(x, (v) => (v > th() ? 1.15 : 0.75 + Math.min(1, v / th()) * 0.25))
  const lScale = useTransform(x, (v) => (-v > th() ? 1.15 : 0.75 + Math.min(1, -v / th()) * 0.25))

  const onDrag = (_: unknown, i: PanInfo) => {
    const a = i.offset.x > th() && right ? 'r' : i.offset.x < -th() && left ? 'l' : null
    if (a !== armed) {
      if (a) haptic()
      setArmed(a)
    }
  }
  const onEnd = (_: unknown, i: PanInfo) => {
    setArmed(null)
    const go = (dir: 1 | -1, act: FlickAction) => {
      haptic(14)
      // 行を画面外に流してから、元の位置に戻して実行（行は状態変化に合わせて再描画される）
      void animate(x, dir * (w() + 30), { type: 'spring', duration: 0.28, bounce: 0 }).then(() => {
        act.run()
        x.set(0)
      })
    }
    if (right && (i.offset.x > th() || (i.velocity.x > 650 && i.offset.x > 30))) return go(1, right)
    if (left && (i.offset.x < -th() || (i.velocity.x < -650 && i.offset.x < -30))) return go(-1, left)
    void animate(x, 0, { type: 'spring', duration: 0.4, bounce: 0.25 })
  }

  return (
    <Tag ref={ref as never} className={`relative overflow-hidden ${className}`} style={{ touchAction: 'pan-y' }}>
      {right && (
        <motion.div style={{ opacity: rOpacity, background: right.color }} className="absolute inset-0 flex items-center gap-2 pl-5 text-[14px] font-bold text-white" aria-hidden>
          <motion.span style={{ scale: rScale }} className="flex">{right.icon}</motion.span>
          {right.label}
        </motion.div>
      )}
      {left && (
        <motion.div style={{ opacity: lOpacity, background: left.color }} className="absolute inset-0 flex flex-row-reverse items-center gap-2 pr-5 text-[14px] font-bold text-white" aria-hidden>
          <motion.span style={{ scale: lScale }} className="flex">{left.icon}</motion.span>
          {left.label}
        </motion.div>
      )}
      <motion.div
        style={{ x }}
        drag={right || left ? 'x' : false}
        dragDirectionLock
        dragConstraints={{ left: left ? -10000 : 0, right: right ? 10000 : 0 }}
        dragElastic={{ left: left ? 0 : 0.08, right: right ? 0 : 0.08 }}
        dragMomentum={false}
        onDrag={onDrag}
        onDragEnd={onEnd}
        className="relative bg-surface"
      >
        {children}
      </motion.div>
    </Tag>
  )
}
