import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cx } from '../../lib/format'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'tinted'
type Size = 'sm' | 'md' | 'lg'

const V: Record<Variant, string> = {
  primary: 'bg-basil text-white hover:bg-basil-ink disabled:bg-ink-3/40',
  secondary: 'bg-surface text-ink ring-1 ring-line-strong hover:bg-sunken disabled:text-ink-3',
  tinted: 'bg-basil-soft text-basil-ink hover:bg-[#d6e7dc] disabled:opacity-50',
  ghost: 'bg-transparent text-basil hover:bg-basil-soft/60 disabled:text-ink-3',
  danger: 'bg-raw-soft text-raw hover:bg-[#f9dcd9] disabled:opacity-50',
}
const S: Record<Size, string> = {
  sm: 'h-9 px-3 text-[14px] gap-1.5 rounded-[10px]',
  md: 'h-11 px-4 text-[15px] gap-2 rounded-ctl',
  lg: 'h-13 px-5 text-[16px] gap-2 rounded-[14px]',
}

export function Button({ variant = 'primary', size = 'md', icon, children, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; icon?: ReactNode }) {
  return (
    <button
      type="button"
      {...rest}
      className={cx('press inline-flex select-none items-center justify-center font-semibold whitespace-nowrap disabled:cursor-not-allowed cursor-pointer', V[variant], S[size], className)}
    >
      {icon}
      {children}
    </button>
  )
}

export function IconButton({ label, children, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button type="button" aria-label={label} title={label} {...rest} className={cx('press inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-2 hover:bg-sunken cursor-pointer disabled:opacity-40', className)}>
      {children}
    </button>
  )
}
