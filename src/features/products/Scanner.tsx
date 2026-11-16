import { Camera, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

type Detector = { detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]> }

function beep() {
  try {
    navigator.vibrate?.(30)
    const ctx = new AudioContext()
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.frequency.value = 1400
    g.gain.value = 0.06
    o.connect(g).connect(ctx.destination)
    o.start()
    o.stop(ctx.currentTime + 0.08)
  } catch {
    /* noop */
  }
}

/**
 * スマホの背面カメラで JAN（EAN-13/8）を読み取る。
 * Chrome/Android はブラウザ内蔵の BarcodeDetector、iPhone（Safari）などは ZXing（JavaScript）で解析する。
 */
export function Scanner({ onCode, onClose }: { onCode: (c: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState<string>()
  const [ready, setReady] = useState(false)
  const done = useRef(false)

  useEffect(() => {
    let stream: MediaStream | undefined
    let stop = false
    let zxingControls: { stop: () => void } | undefined
    const found = (code: string) => {
      if (done.current) return
      // EAN は桁数で確認（読み違いの短いコードを捨てる）
      if (!/^\d{8}$|^\d{12,14}$/.test(code) && !/^DEMO-/i.test(code)) return
      done.current = true
      beep()
      onCode(code)
    }
    ;(async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('この環境ではカメラを使えません（HTTPS のページで開いてください）。')
        return
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false })
      } catch {
        setError('カメラを使用できませんでした。ブラウザの設定でカメラの使用を許可してください。')
        return
      }
      if (stop || !video.current) return stream.getTracks().forEach((t) => t.stop())
      video.current.srcObject = stream
      await video.current.play().catch(() => {})
      setReady(true)
      const W = window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector & { constructor: { getSupportedFormats?: () => Promise<string[]> } } }
      let native: Detector | undefined
      if (W.BarcodeDetector) {
        try {
          const fm = await (W.BarcodeDetector as unknown as { getSupportedFormats?: () => Promise<string[]> }).getSupportedFormats?.()
          if (!fm || fm.includes('ean_13')) native = new W.BarcodeDetector({ formats: ['ean_13', 'ean_8'] })
        } catch {
          native = undefined
        }
      }
      if (native) {
        const loop = async () => {
          if (stop || done.current || !video.current) return
          try {
            const r = await native!.detect(video.current)
            if (r[0]) return found(r[0].rawValue)
          } catch {
            /* 次のフレーム */
          }
          setTimeout(loop, 120)
        }
        loop()
        return
      }
      // ZXing（必要なときだけ読み込む）
      const [{ BrowserMultiFormatReader }, { DecodeHintType, BarcodeFormat }] = await Promise.all([import('@zxing/browser'), import('@zxing/library')])
      const hints = new Map()
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8])
      hints.set(DecodeHintType.TRY_HARDER, true)
      const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 120 })
      if (stop || !video.current) return
      zxingControls = await reader.decodeFromVideoElement(video.current, (res) => {
        if (res) found(res.getText())
      })
    })()
    return () => {
      stop = true
      zxingControls?.stop()
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [onCode])

  return (
    <div className="relative mb-3 overflow-hidden rounded-[16px] bg-black text-white">
      {error ? (
        <p className="flex items-start gap-2 p-4 text-[14px] leading-relaxed"><Camera size={18} className="mt-0.5 shrink-0" aria-hidden />{error}</p>
      ) : (
        <div className="relative">
          <video ref={video} className="aspect-[4/3] w-full object-cover" muted playsInline autoPlay aria-label="カメラ映像" />
          {/* 読み取り枠 */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
            <div className="relative h-[34%] w-[78%] rounded-[14px] shadow-[0_0_0_9999px_rgba(0,0,0,0.38)] ring-2 ring-white/90">
              <span className="absolute inset-x-3 top-1/2 h-0.5 -translate-y-1/2 animate-pulse rounded bg-[#ff5a4f] motion-reduce:animate-none" />
            </div>
          </div>
          <p className="absolute inset-x-0 bottom-3 text-center text-[13px] font-semibold drop-shadow" role="status">{ready ? 'バーコードを枠に合わせてください' : 'カメラを準備中…'}</p>
        </div>
      )}
      <button className="absolute top-2 right-2 flex h-10 w-10 items-center justify-center rounded-full bg-black/45 backdrop-blur cursor-pointer" onClick={onClose} aria-label="カメラを閉じる">
        <X size={20} />
      </button>
    </div>
  )
}
