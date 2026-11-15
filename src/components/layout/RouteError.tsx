import { AlertTriangle } from 'lucide-react'
import { isRouteErrorResponse, useRouteError } from 'react-router-dom'

/** 画面の描画エラー。原因と復旧方法を示す */
export function RouteError({ inline }: { inline?: boolean }) {
  const err = useRouteError()
  const msg = isRouteErrorResponse(err) ? `${err.status} ${err.statusText}` : err instanceof Error ? err.message : '不明なエラー'
  return (
    <div className={inline ? 'mx-auto max-w-[640px] px-4 pt-10' : 'flex min-h-dvh items-center justify-center bg-canvas px-4'}>
      <div className="surface w-full max-w-[560px] p-6">
        <AlertTriangle size={28} className="text-raw" aria-hidden />
        <h1 className="mt-3 text-[20px] font-bold">この画面を表示できませんでした</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-2">データは端末に保存されたままです。再読み込みで解決しない場合は、設定の「初期状態に戻す」でサンプルデータに戻せます。</p>
        <p className="mt-3 rounded-lg bg-sunken px-3 py-2 font-mono text-[12px] break-all text-ink-2">{msg}</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <button className="press h-11 rounded-ctl bg-basil px-4 font-semibold text-white cursor-pointer" onClick={() => location.reload()}>再読み込み</button>
          <a className="press inline-flex h-11 items-center rounded-ctl px-4 font-semibold text-basil" href="/">ホームへ</a>
          <a className="press inline-flex h-11 items-center rounded-ctl px-4 font-semibold text-ink-2" href="/settings">設定</a>
        </div>
      </div>
    </div>
  )
}
