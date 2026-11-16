import { Cloud, CloudOff, LoaderCircle, TriangleAlert } from 'lucide-react'
import { useEffect } from 'react'
import { toast } from '../../components/ui/Toast'
import { useCloud } from '../../services/cloud'

/** 同期の状態（サイドバー下部・設定画面） */
export function SyncBadge({ className = 'mt-auto px-3' }: { className?: string }) {
  const { sync, lastSync, notice } = useCloud()
  useEffect(() => {
    if (!notice) return
    toast(notice)
    useCloud.setState({ notice: null })
  }, [notice])
  const t = lastSync ? new Date(lastSync).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }) : ''
  const [Icon, text, tone] =
    sync === 'saving' ? [LoaderCircle, '保存中…', 'text-ink-3'] as const
    : sync === 'offline' ? [CloudOff, 'オフライン・この端末に保存中', 'text-amber'] as const
    : sync === 'error' ? [TriangleAlert, '同期に失敗・自動で再試行します', 'text-raw'] as const
    : [Cloud, t ? `同期済み ${t}` : '同期済み', 'text-ink-3'] as const
  return (
    <p className={`${className} flex items-center gap-1.5 text-[12px] leading-relaxed ${tone}`} role="status">
      <Icon size={14} className={sync === 'saving' ? 'animate-spin motion-reduce:animate-none' : ''} aria-hidden />
      <span className="min-w-0 truncate">{text}</span>
    </p>
  )
}
