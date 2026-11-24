import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'

interface Props {
  /** 스냅 높이: 1 이하 값은 부모 높이 비율, 그 외는 px */
  snaps: number[]
  index: number
  onIndexChange: (i: number) => void
  onHeightChange?: (h: number) => void
  header?: ReactNode
  children: ReactNode
  footer?: ReactNode
}

/** 지도 위 하단 슬라이딩 패널 */
export default function BottomSheet({ snaps, index, onIndexChange, onHeightChange, header, children, footer }: Props) {
  const wrap = useRef<HTMLDivElement>(null)
  const [parentH, setParentH] = useState(700)
  const [dragH, setDragH] = useState<number | null>(null)
  const drag = useRef<{ y: number; h: number; t: number; scale: number; interactive: boolean } | null>(null)

  useLayoutEffect(() => {
    const el = wrap.current?.parentElement
    if (!el) return
    const ro = new ResizeObserver(() => setParentH(el.clientHeight))
    ro.observe(el)
    setParentH(el.clientHeight)
    return () => ro.disconnect()
  }, [])

  const px = snaps.map((s) => Math.round(s <= 1 ? s * parentH : Math.min(s, parentH - 8)))
  const height = dragH ?? px[Math.min(index, px.length - 1)]

  useEffect(() => {
    onHeightChange?.(px[Math.min(index, px.length - 1)])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, parentH, snaps.join(',')])

  const onDown = (e: React.PointerEvent) => {
    const r = wrap.current!.getBoundingClientRect()
    const scale = r.width / wrap.current!.clientWidth || 1
    const interactive = !!(e.target as HTMLElement).closest('button,input,a')
    drag.current = { y: e.clientY, h: height, t: performance.now(), scale, interactive }
    if (!interactive) (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
  }
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current) return
    const dy = (e.clientY - drag.current.y) / drag.current.scale
    setDragH(Math.max(px[0] - 30, Math.min(px[px.length - 1] + 20, drag.current.h - dy)))
  }
  const onUp = (e: React.PointerEvent) => {
    if (!drag.current) return
    const dy = (e.clientY - drag.current.y) / drag.current.scale
    const dt = performance.now() - drag.current.t
    const cur = drag.current.h - dy
    const interactive = drag.current.interactive
    drag.current = null
    setDragH(null)
    if (Math.abs(dy) < 5) {
      if (interactive) return
      // 탭: 다음 단계로 토글
      onIndexChange(index < px.length - 1 ? index + 1 : 0)
      return
    }
    const v = dy / Math.max(dt, 1) // px/ms
    let target = px.reduce((best, p, i) => (Math.abs(p - cur) < Math.abs(px[best] - cur) ? i : best), 0)
    if (v < -0.5) target = Math.min(px.length - 1, index + 1)
    if (v > 0.5) target = Math.max(0, index - 1)
    onIndexChange(target)
  }

  return (
    <div
      ref={wrap}
      className={`absolute inset-x-0 bottom-0 z-20 flex flex-col rounded-t-[22px] bg-white shadow-[0_-4px_20px_rgba(34,43,58,0.12)] ${dragH === null ? 'transition-[height] duration-300 ease-[cubic-bezier(.2,.8,.2,1)]' : ''}`}
      style={{ height }}
    >
      <div className="shrink-0 cursor-grab touch-none" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        <div className="flex h-5 items-center justify-center">
          <div className="h-[5px] w-10 rounded-full bg-[#D5DAE3]" />
        </div>
        {header}
      </div>
      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
      {footer}
    </div>
  )
}
