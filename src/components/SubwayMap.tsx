import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { LocateFixed, Minus, Plus } from 'lucide-react'
import { EDGES, LINES, LINE_ORDER, RIVER_PATH, STATIONS, STATION_LINES } from '../data/network'
import { stationName, t } from '../i18n'
import type { Route } from '../lib/routing'

interface Props {
  routes?: Route[]
  selectedId?: string | null
  /** 화면에 맞출 역 */
  focus?: string[]
  fitKey?: string
  topInset?: number
  bottomInset?: number
  currentStation?: string
  issueStations?: string[]
  highlightStation?: string | null
  showUser?: boolean
  /** 사용자 위치 (화면 좌표) */
  user?: { x: number; y: number } | null
  onStationTap?: (id: string) => void
  onRouteTap?: (id: string) => void
}

interface VB {
  x: number
  y: number
  w: number
}

const MIN_W = 220
const MAX_W = 9000

export default function SubwayMap({
  routes = [],
  selectedId,
  focus,
  fitKey,
  topInset = 0,
  bottomInset = 0,
  currentStation,
  issueStations = [],
  highlightStation,
  showUser = true,
  user,
  onStationTap,
  onRouteTap,
}: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 390, h: 700 })
  const [vb, setVb] = useState<VB>({ x: -350, y: -300, w: 700 })
  const vbRef = useRef(vb)
  vbRef.current = vb
  const anim = useRef<number | undefined>(undefined)
  const dragged = useRef(false)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth || 390, h: el.clientHeight || 700 }))
    ro.observe(el)
    setSize({ w: el.clientWidth || 390, h: el.clientHeight || 700 })
    return () => ro.disconnect()
  }, [])

  const k = vb.w / size.w // svg units per px
  const vh = vb.w * (size.h / size.w)

  const animateTo = useCallback((target: VB) => {
    if (anim.current) cancelAnimationFrame(anim.current)
    const start = { ...vbRef.current }
    const t0 = performance.now()
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / 420)
      const e = 1 - Math.pow(1 - p, 3)
      setVb({ x: start.x + (target.x - start.x) * e, y: start.y + (target.y - start.y) * e, w: start.w + (target.w - start.w) * e })
      if (p < 1) anim.current = requestAnimationFrame(step)
    }
    anim.current = requestAnimationFrame(step)
  }, [])

  const fitTo = useCallback(
    (ids: string[], pad = 46) => {
      const pts = ids.map((id) => STATIONS[id]).filter(Boolean)
      if (!pts.length) return
      const minX = Math.min(...pts.map((p) => p.x))
      const maxX = Math.max(...pts.map((p) => p.x))
      const minY = Math.min(...pts.map((p) => p.y))
      const maxY = Math.max(...pts.map((p) => p.y))
      const availH = Math.max(120, size.h - topInset - bottomInset)
      const bw = Math.max(maxX - minX, 120)
      const bh = Math.max(maxY - minY, 120)
      // 화면 폭/가용 높이에 모두 들어가는 축척
      const scale = Math.max(bw / (size.w - pad * 2 - 56), bh / (availH - pad * 2))
      const w = Math.min(MAX_W, Math.max(MIN_W, scale * size.w))
      const kk = w / size.w
      const cx = (minX + maxX) / 2 + 22 * kk
      const cy = (minY + maxY) / 2
      const x = cx - w / 2
      // 가용 영역 중앙에 오도록 y 보정
      const centerPx = topInset + availH / 2
      const y = cy - centerPx * kk
      animateTo({ x, y, w })
    },
    [size, topInset, bottomInset, animateTo],
  )

  // 최초/키 변경 시 화면 맞춤
  useEffect(() => {
    if (focus && focus.length) fitTo(focus)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey, size.w, size.h, bottomInset, topInset])

  // ── 팬/줌 ───────────────────────────────────────────
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef<{ startDist: number; startW: number; start: { x: number; y: number }; startVb: VB; total: number } | null>(null)

  const zoomAt = useCallback(
    (factor: number, px: number, py: number) => {
      setVb((v) => {
        const w = Math.min(MAX_W, Math.max(MIN_W, v.w * factor))
        const kOld = v.w / size.w
        const kNew = w / size.w
        return { x: v.x + px * (kOld - kNew), y: v.y + py * (kOld - kNew), w }
      })
    },
    [size.w],
  )

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      const scale = r.width / el.clientWidth || 1
      zoomAt(Math.exp(e.deltaY * 0.0015), (e.clientX - r.left) / scale, (e.clientY - r.top) / scale)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [zoomAt])

  const local = (e: { clientX: number; clientY: number }) => {
    const r = ref.current!.getBoundingClientRect()
    const scale = r.width / ref.current!.clientWidth || 1 // 시연 모드 축소 보정
    return { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale }
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (anim.current) cancelAnimationFrame(anim.current)
    pointers.current.set(e.pointerId, local(e))
    dragged.current = false
    const pts = [...pointers.current.values()]
    const mid = pts.length === 2 ? { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 } : pts[0]
    gesture.current = {
      startDist: pts.length === 2 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0,
      startW: vbRef.current.w,
      start: mid,
      startVb: { ...vbRef.current },
      total: 0,
    }
  }

  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (!pointers.current.has(e.pointerId) || !gesture.current) return
      pointers.current.set(e.pointerId, local(e))
      const pts = [...pointers.current.values()]
      const g = gesture.current
      const kk = g.startVb.w / size.w
      if (pts.length === 1) {
        const dx = pts[0].x - g.start.x
        const dy = pts[0].y - g.start.y
        if (Math.hypot(dx, dy) > 6) dragged.current = true
        setVb({ ...g.startVb, x: g.startVb.x - dx * kk, y: g.startVb.y - dy * kk })
      } else if (pts.length === 2) {
        dragged.current = true
        const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
        const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 }
        const w = Math.min(MAX_W, Math.max(MIN_W, (g.startW * g.startDist) / Math.max(d, 1)))
        const kNew = w / size.w
        // 시작 중점이 가리키던 지점을 현재 중점에 유지
        const sx = g.startVb.x + g.start.x * kk
        const sy = g.startVb.y + g.start.y * kk
        setVb({ x: sx - mid.x * kNew, y: sy - mid.y * kNew, w })
      }
    }
    const up = (e: PointerEvent) => {
      pointers.current.delete(e.pointerId)
      const pts = [...pointers.current.values()]
      if (pts.length) {
        gesture.current = { startDist: 0, startW: vbRef.current.w, start: pts[0], startVb: { ...vbRef.current }, total: 0 }
      } else gesture.current = null
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
  }, [size.w])

  // ── 렌더 데이터 ─────────────────────────────────────
  const linePaths = useMemo(
    () =>
      Object.fromEntries(
        LINE_ORDER.map((id) => [id, (EDGES[id] ?? []).map(([a, b]) => `M${STATIONS[a].x.toFixed(1)} ${STATIONS[a].y.toFixed(1)}L${STATIONS[b].x.toFixed(1)} ${STATIONS[b].y.toFixed(1)}`).join('')]),
      ) as Record<string, string>,
    [],
  )
  const selected = routes.find((r) => r.id === selectedId) ?? null
  const others = routes.filter((r) => r !== selected)
  const routeStations = useMemo(() => {
    const s = new Set<string>()
    routes.forEach((r) => r.segments.forEach((g) => g.stations.forEach((x) => s.add(x))))
    return s
  }, [routes])
  const selectedStations = useMemo(() => new Set(selected?.segments.flatMap((g) => g.stations) ?? []), [selected])
  const keyStations = useMemo(() => {
    const k = new Set<string>()
    if (selected) {
      k.add(selected.from)
      k.add(selected.to)
      selected.transfers.forEach((t) => k.add(t.station))
    }
    return k
  }, [selected])
  const dim = routes.length > 0
  const zoomedIn = k < 0.95

  const pts = (ids: string[]) => ids.map((id) => `${STATIONS[id].x.toFixed(1)},${STATIONS[id].y.toFixed(1)}`).join(' ')
  // 화면 영역 안의 역만 렌더링 (성능)
  const view = { x0: vb.x - 60 * k, y0: vb.y - 60 * k, x1: vb.x + vb.w + 60 * k, y1: vb.y + vh + 60 * k }
  const inView = (x: number, y: number) => x > view.x0 && x < view.x1 && y > view.y0 && y < view.y1

  const tap = (id: string) => {
    if (dragged.current) return
    onStationTap?.(id)
  }

  return (
    <div ref={ref} className="absolute inset-0 touch-none overflow-hidden bg-[#F6F7F9] select-none" onPointerDown={onPointerDown}>
      <svg width={size.w} height={size.h} viewBox={`${vb.x} ${vb.y} ${vb.w} ${vh}`} className="block">
        <defs>
          <pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse">
            <path d="M 60 0 L 0 0 0 60" fill="none" stroke="#ECEEF3" strokeWidth="1" />
          </pattern>
        </defs>
        <rect x={-6000} y={-6000} width={12000} height={14000} fill="url(#grid)" />
        <path d={RIVER_PATH} fill="none" stroke="#DCE6F4" strokeWidth={50} strokeLinecap="round" strokeLinejoin="round" />
        <text x={-470} y={560} fontSize={13 * Math.min(k, 2)} fill="#9DB0CF" fontWeight={600} letterSpacing={4}>
          {t('map.river')}
        </text>

        {/* 전체 노선 */}
        {LINE_ORDER.map((id) => (
          <path
            key={id}
            d={linePaths[id]}
            fill="none"
            stroke={dim ? '#C9CED8' : LINES[id].color}
            strokeOpacity={dim ? 0.7 : 0.95}
            strokeWidth={(dim ? 3 : 4) * Math.min(k, 2.4)}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}

        {/* 비선택 경로: 옅게 */}
        {others.map((r) =>
          r.segments.map((s, i) => (
            <polyline
              key={r.id + i}
              points={pts(s.stations)}
              fill="none"
              stroke={LINES[s.line].color}
              strokeOpacity={0.32}
              strokeWidth={8 * k}
              strokeLinejoin="round"
              strokeLinecap="round"
              onClick={() => !dragged.current && onRouteTap?.(r.id)}
              style={{ cursor: onRouteTap ? 'pointer' : undefined }}
            />
          )),
        )}

        {/* 선택 경로: 굵고 선명하게 */}
        {selected &&
          selected.segments.map((s, i) => (
            <g key={'sel' + i}>
              <polyline points={pts(s.stations)} fill="none" stroke="#fff" strokeWidth={15 * k} strokeLinejoin="round" strokeLinecap="round" />
              <polyline points={pts(s.stations)} fill="none" stroke={LINES[s.line].color} strokeWidth={9.5 * k} strokeLinejoin="round" strokeLinecap="round" />
            </g>
          ))}

        {/* 역 */}
        {Object.values(STATIONS).map((st) => {
          if (!inView(st.x, st.y)) return null
          const lines = STATION_LINES[st.id] ?? []
          const isTransfer = lines.length > 1
          const onSel = selectedStations.has(st.id)
          const faded = dim && !routeStations.has(st.id)
          if (k > 4.5 && !isTransfer && !onSel && st.id !== highlightStation) return null
          const r = (isTransfer ? 5 : 3.4) * Math.min(k, 2.4) * (onSel ? 1.2 : 1)
          const showLabel =
            st.id === highlightStation || st.id === currentStation || keyStations.has(st.id) || (dim ? k < 0.7 && onSel : zoomedIn || (k < 1.9 && isTransfer) || (k < 3.2 && lines.length >= 3))
          const fs = (onSel || st.id === highlightStation ? 12.5 : 11.5) * k
          const off = r + 4 * k
          const [dx, dy, anchor]: [number, number, 'start' | 'middle' | 'end'] = [off, fs * 0.35, 'start']
          return (
            <g key={st.id} opacity={faded ? 0.45 : 1} onClick={() => tap(st.id)} style={{ cursor: onStationTap ? 'pointer' : undefined }}>
              <circle cx={st.x} cy={st.y} r={Math.max(r, 12 * k)} fill="transparent" />
              <circle cx={st.x} cy={st.y} r={r} fill="#fff" stroke={isTransfer || onSel ? '#222B3A' : '#8C95A6'} strokeWidth={(isTransfer ? 1.8 : 1.4) * Math.min(k, 1.8)} />
              {showLabel && (
                <text
                  x={st.x + dx}
                  y={st.y + dy}
                  textAnchor={anchor}
                  fontSize={fs}
                  fontWeight={onSel || isTransfer ? 700 : 500}
                  fill={faded ? '#9AA2B1' : '#222B3A'}
                  stroke="#F6F7F9"
                  strokeWidth={3 * k}
                  paintOrder="stroke"
                >
                  {stationName(st.id)}
                </text>
              )}
            </g>
          )
        })}

        {/* 장애 지점 */}
        {issueStations.map((id) => {
          const st = STATIONS[id]
          if (!st) return null
          return (
            <g key={'issue' + id} transform={`translate(${st.x} ${st.y - 26 * k}) scale(${k})`}>
              <path d="M0 14 L-12 -8 L12 -8 Z" transform="rotate(180)" fill="#D9534F" stroke="#fff" strokeWidth={2} strokeLinejoin="round" />
              <text y={6} textAnchor="middle" fontSize={13} fontWeight={800} fill="#fff">
                !
              </text>
            </g>
          )
        })}

        {/* 출발/도착 핀 */}
        {selected && (
          <>
            <Pin x={STATIONS[selected.from].x} y={STATIONS[selected.from].y} k={k} label={t('common.from')} color="#5675D8" />
            <Pin x={STATIONS[selected.to].x} y={STATIONS[selected.to].y} k={k} label={t('common.to')} color="#293896" />
          </>
        )}

        {/* 탑승 중 현재 역 */}
        {currentStation && STATIONS[currentStation] && (
          <g>
            <circle cx={STATIONS[currentStation].x} cy={STATIONS[currentStation].y} r={9 * k} fill="#293896" opacity={0.25} className="pulse-ring" style={{ transformBox: 'fill-box' }} />
            <circle cx={STATIONS[currentStation].x} cy={STATIONS[currentStation].y} r={8 * k} fill="#293896" stroke="#fff" strokeWidth={3 * k} />
          </g>
        )}

        {/* 현재 위치 (예시) */}
        {showUser && user && !currentStation && (
          <g>
            <circle cx={user.x} cy={user.y} r={22 * k} fill="#5675D8" opacity={0.14} />
            <circle cx={user.x} cy={user.y} r={7 * k} fill="#5675D8" stroke="#fff" strokeWidth={2.5 * k} />
          </g>
        )}
      </svg>

      {/* 지도 컨트롤 */}
      <div className="absolute right-3 flex flex-col gap-2 transition-[bottom] duration-300" style={{ bottom: bottomInset + 14 }}>
        <div className="flex flex-col overflow-hidden rounded-xl bg-white shadow-[0_2px_8px_rgba(34,43,58,0.14)]">
          <button type="button" aria-label={t('map.zoomIn')} className="flex h-10 w-10 items-center justify-center active:bg-sub" onPointerDown={(e) => e.stopPropagation()} onClick={() => zoomAt(0.75, size.w / 2, (size.h - bottomInset) / 2)}>
            <Plus size={18} />
          </button>
          <div className="mx-2 h-px bg-line" />
          <button type="button" aria-label={t('map.zoomOut')} className="flex h-10 w-10 items-center justify-center active:bg-sub" onPointerDown={(e) => e.stopPropagation()} onClick={() => zoomAt(1.33, size.w / 2, (size.h - bottomInset) / 2)}>
            <Minus size={18} />
          </button>
        </div>
        <button
          type="button"
          aria-label={t('map.locate')}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => {
            if (currentStation) fitTo([currentStation], 160)
            else if (focus?.length && routes.length) fitTo(focus)
            else if (user) {
              const w = 420
              const kk = w / size.w
              animateTo({ x: user.x - w / 2, y: user.y - (topInset + (size.h - topInset - bottomInset) / 2) * kk, w })
            }
          }}
          className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-brand shadow-[0_2px_8px_rgba(34,43,58,0.14)] active:bg-sub"
        >
          <LocateFixed size={19} />
        </button>
      </div>
      <div className="pointer-events-none absolute left-3 rounded-md bg-white/90 px-2 py-1 text-[11px] font-medium text-ink-2 transition-[bottom] duration-300" style={{ bottom: bottomInset + 14 }}>
        {t('map.note')}
      </div>
    </div>
  )
}

function Pin({ x, y, k, label, color }: { x: number; y: number; k: number; label: string; color: string }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${k})`} style={{ pointerEvents: 'none' }}>
      <path d="M0 -6 C -4 -12 -17 -18 -17 -32 A 17 17 0 1 1 17 -32 C 17 -18 4 -12 0 -6 Z" fill={color} stroke="#fff" strokeWidth={2} />
      <text y={-28} textAnchor="middle" fontSize={11} fontWeight={700} fill="#fff">
        {label}
      </text>
    </g>
  )
}
