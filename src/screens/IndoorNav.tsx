import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Accessibility,
  ArrowUpDown,
  Baby,
  CableCar,
  ChevronLeft,
  CircleHelp,
  DoorOpen,
  Flag,
  Footprints,
  Luggage,
  MapPin,
  QrCode,
  Siren,
  Ticket,
  Toilet,
  TrainFront,
  TrendingUp,
  X,
} from 'lucide-react'
import { Modal } from '../components/Overlays'
import { DataTag, PrimaryButton, ScreenHeader } from '../components/ui'
import { INDOOR, type NodeKind } from '../data/indoor'
import { getLang, stationName, t, type MessageKey } from '../i18n'
import { INDOOR_MODES, findIndoorRoute, floorName, nodeName, parseIndoorCode, type IndoorMode } from '../lib/indoor'
import { useStore } from '../state/store'

const ICON: Partial<Record<NodeKind, typeof CableCar>> = {
  exit: DoorOpen,
  gate: Ticket,
  gateWide: Accessibility,
  elevator: CableCar,
  escalator: TrendingUp,
  stairs: ArrowUpDown,
  lift: Accessibility,
  toilet: Toilet,
  toiletAccessible: Accessibility,
  info: CircleHelp,
  locker: Luggage,
  nursing: Baby,
  platform: TrainFront,
  emergency: Siren,
  ticket: Ticket,
}

const COLOR: Partial<Record<NodeKind, string>> = {
  exit: '#F2C230',
  elevator: '#27845C',
  lift: '#27845C',
  escalator: '#5675D8',
  stairs: '#747D8D',
  toilet: '#6B7FA8',
  toiletAccessible: '#27845C',
  info: '#293896',
  locker: '#B57714',
  nursing: '#C2589A',
  emergency: '#D9534F',
  platform: '#00A84D',
  gate: '#222B3A',
  gateWide: '#27845C',
  ticket: '#222B3A',
}

const MODE_KEY: Record<IndoorMode, MessageKey> = {
  shortest: 'in.mode.shortest',
  elevator: 'in.mode.elevator',
  escalator: 'in.mode.escalator',
  noStairs: 'in.mode.noStairs',
  wheelchair: 'in.mode.wheelchair',
  luggage: 'in.mode.luggage',
}

export const FACILITY_KINDS: NodeKind[] = ['elevator', 'escalator', 'stairs', 'lift', 'toilet', 'toiletAccessible', 'gate', 'exit', 'info', 'locker', 'nursing', 'emergency']

export default function IndoorNav({ station, from: initialFrom, to: initialTo, onClose }: { station: string; from?: string; to?: string; onClose: () => void }) {
  const s = useStore()
  const st = INDOOR[station]
  const [from, setFrom] = useState<string | null>(initialFrom ?? null)
  const [to, setTo] = useState<string | null>(initialTo ?? null)
  const [mode, setMode] = useState<IndoorMode>(s.wheelchair ? 'wheelchair' : 'shortest')
  const [floor, setFloor] = useState(st?.floors[1]?.id ?? st?.floors[0]?.id ?? '')
  const [picking, setPicking] = useState<null | 'from' | 'to'>(initialFrom ? null : 'from')
  const [stepIdx, setStepIdx] = useState(0)
  const [qr, setQr] = useState(false)

  const route = useMemo(() => (st && from && to ? findIndoorRoute(station, from, to, mode, s.walkSpeed) : null), [st, station, from, to, mode, s.walkSpeed])
  useEffect(() => setStepIdx(0), [from, to, mode])
  useEffect(() => {
    const step = route?.steps[stepIdx]
    if (step) setFloor(step.toFloor && stepIdx > 0 ? step.floor : step.floor)
  }, [route, stepIdx])
  useEffect(() => {
    if (from && !route) setFloor(st.nodes.find((n) => n.id === from)?.floor ?? floor)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from])

  if (!st) {
    return (
      <div className="safe-top anim-fade-up absolute inset-0 z-40 flex flex-col bg-white">
        <ScreenHeader title={t('in.title', { s: stationName(station) })} left={<Back onClose={onClose} />} />
        <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
          <MapPin size={36} className="text-ink-2" />
          <p className="mt-3 text-[17px] font-bold">{t('in.noData')}</p>
          <p className="mt-1 text-[14px] leading-relaxed text-ink-2">{t('in.noDataBody')}</p>
        </div>
      </div>
    )
  }

  const lang = getLang()
  const nodesOnFloor = st.nodes.filter((n) => n.floor === floor)
  const named = st.nodes.filter((n) => n.name)
  const pathSet = new Set(route?.nodes.map((n) => n.id))
  const curStep = route?.steps[stepIdx]
  const pick = (id: string) => {
    if (picking === 'from') setFrom(id)
    else if (picking === 'to') setTo(id)
    setPicking(null)
  }

  return (
    <div className="safe-top anim-fade-up absolute inset-0 z-40 flex flex-col bg-white">
      <ScreenHeader title={t('in.title', { s: stationName(station) })} left={<Back onClose={onClose} />} />
      <div className="no-scrollbar flex-1 overflow-y-auto pb-6">
        <div className="flex flex-wrap items-center gap-1.5 px-5">
          <DataTag kind="demo" />
          <span className="text-[11px] leading-snug text-ink-2">{st.source[lang]}</span>
        </div>

        {/* 출발·도착 */}
        <div className="mx-4 mt-3 rounded-2xl border border-line">
          <button type="button" onClick={() => setPicking('from')} className={`flex min-h-[52px] w-full items-center gap-3 px-4 text-left ${picking === 'from' ? 'bg-brand-light' : ''}`}>
            <span className="w-14 shrink-0 text-[12px] font-semibold text-ink-2">{t('in.here')}</span>
            <span className={`truncate text-[15px] ${from ? 'font-bold' : 'text-[#A3AAB8]'}`}>{from ? nodeName(st.nodes.find((n) => n.id === from)!) : t('in.pickHere')}</span>
          </button>
          <div className="mx-4 h-px bg-line" />
          <button type="button" onClick={() => setPicking('to')} className={`flex min-h-[52px] w-full items-center gap-3 px-4 text-left ${picking === 'to' ? 'bg-brand-light' : ''}`}>
            <span className="w-14 shrink-0 text-[12px] font-semibold text-ink-2">{t('in.dest')}</span>
            <span className={`truncate text-[15px] ${to ? 'font-bold' : 'text-[#A3AAB8]'}`}>{to ? nodeName(st.nodes.find((n) => n.id === to)!) : t('in.pickDest')}</span>
          </button>
        </div>
        {picking && (
          <div className="mx-4 mt-2 rounded-xl bg-brand-light px-3 py-2.5 text-[13px] font-semibold text-brand">
            {picking === 'from' ? t('in.pickHereHint') : t('in.pickDestHint')}
            {picking === 'from' && (
              <button type="button" onClick={() => setQr(true)} className="mt-2 flex h-9 items-center gap-1.5 rounded-lg bg-white px-3 text-[13px] font-bold">
                <QrCode size={15} /> {t('in.qr')}
              </button>
            )}
          </div>
        )}

        {/* 이동 방식 */}
        <div className="no-scrollbar mt-3 flex gap-1.5 overflow-x-auto px-4">
          {INDOOR_MODES.map((m) => (
            <button key={m} type="button" onClick={() => setMode(m)} className={`h-9 shrink-0 rounded-full px-3 text-[13px] font-semibold ${m === mode ? 'bg-brand text-white' : 'bg-sub text-ink-2'}`}>
              {t(MODE_KEY[m])}
            </button>
          ))}
        </div>

        {/* 층 선택 */}
        <div className="mt-3 flex gap-1 px-4">
          {st.floors.map((f) => (
            <button key={f.id} type="button" onClick={() => setFloor(f.id)} className={`h-9 flex-1 rounded-lg text-[13px] font-bold ${f.id === floor ? 'bg-ink text-white' : 'bg-sub text-ink-2'}`}>
              {f.id} <span className="font-medium">{f.name[lang].replace(/^[^ ]+ /, '').slice(0, 8)}</span>
            </button>
          ))}
        </div>

        {/* 층별 지도 */}
        <div className="mx-4 mt-2 overflow-hidden rounded-2xl border border-line bg-[#F6F7F9]">
          <svg viewBox="-4 -4 128 68" className="block w-full">
            {st.areas
              .filter((a) => a.floor === floor)
              .map((a, i) => (
                <g key={i}>
                  <rect
                    x={a.x}
                    y={a.y}
                    width={a.w}
                    height={a.h}
                    rx={1.5}
                    fill={a.kind === 'track' ? '#E6E9F0' : a.kind === 'paid' ? '#EAF0FC' : a.kind === 'platform' ? '#E7F5EC' : a.kind === 'street' ? '#FFFFFF' : '#FFFFFF'}
                    stroke="#D5DAE3"
                    strokeWidth={0.3}
                  />
                  {a.label && (
                    <text x={a.x + 1.5} y={a.y + 3.2} fontSize={2.4} fill="#747D8D" fontWeight={600}>
                      {a.label[lang]}
                    </text>
                  )}
                </g>
              ))}
            {st.edges.map((e, i) => {
              const a = st.nodes.find((n) => n.id === e.a)!
              const b = st.nodes.find((n) => n.id === e.b)!
              if (a.floor !== floor || b.floor !== floor) return null
              const on = pathSet.has(a.id) && pathSet.has(b.id) && route && Math.abs(route.nodes.findIndex((n) => n.id === a.id) - route.nodes.findIndex((n) => n.id === b.id)) === 1
              return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={on ? '#293896' : '#C5CBD6'} strokeWidth={on ? 1.4 : 0.4} strokeLinecap="round" strokeDasharray={e.type === 'gate' || e.type === 'gateWide' ? '1 0.8' : undefined} />
            })}
            {nodesOnFloor.map((n) => {
              if (n.kind === 'junction') return null
              const Icon = ICON[n.kind]
              const isFrom = n.id === from
              const isTo = n.id === to
              const isCur = curStep?.node.id === n.id
              const r = isFrom || isTo || isCur ? 3 : 2.3
              return (
                <g key={n.id} onClick={() => picking && pick(n.id)} style={{ cursor: picking ? 'pointer' : 'default' }}>
                  {picking && <circle cx={n.x} cy={n.y} r={4.2} fill="#293896" opacity={0.12} />}
                  <circle cx={n.x} cy={n.y} r={r} fill={isFrom ? '#5675D8' : isTo ? '#293896' : COLOR[n.kind] ?? '#747D8D'} stroke={isCur ? '#222B3A' : '#fff'} strokeWidth={isCur ? 0.8 : 0.5} />
                  {Icon && <Icon x={n.x - r * 0.62} y={n.y - r * 0.62} width={r * 1.24} height={r * 1.24} color="#fff" strokeWidth={2.6} />}
                  {n.kind === 'exit' && (
                    <text x={n.x} y={n.y + 0.9} fontSize={2.6} textAnchor="middle" fontWeight={800} fill="#222B3A">
                      {n.ref}
                    </text>
                  )}
                </g>
              )
            })}
          </svg>
        </div>
        <p className="mt-1 px-5 text-[11px] text-ink-2">{floorName(st, floor)}</p>

        {/* 안내 */}
        {!from ? (
          <div className="mx-4 mt-3 rounded-xl border border-dashed border-[#C5CBD6] px-4 py-3 text-[13px] leading-relaxed text-ink-2">{t('in.noPosition')}</div>
        ) : !to ? (
          <div className="mt-4 px-5">
            <p className="mb-2 text-[14px] font-bold">{t('in.quickDest')}</p>
            <div className="flex flex-wrap gap-1.5">
              {named
                .filter((n) => FACILITY_KINDS.includes(n.kind) && n.id !== from)
                .map((n) => (
                  <button key={n.id} type="button" onClick={() => setTo(n.id)} className="h-9 rounded-full border border-line px-3 text-[13px] font-semibold active:bg-sub">
                    {nodeName(n)}
                  </button>
                ))}
            </div>
          </div>
        ) : !route ? (
          <p className="mx-4 mt-3 rounded-xl bg-[#FBEAEA] px-4 py-3 text-[14px] font-semibold text-danger">{t('in.noRoute')}</p>
        ) : (
          <div className="mt-4 px-5">
            <div className="flex items-baseline gap-3">
              <span className="text-[22px] font-extrabold tabular">{t('unit.minSec', { m: Math.floor(route.seconds / 60), s: route.seconds % 60 })}</span>
              <span className="text-[13px] text-ink-2">
                {route.distance}m · {t('in.floorChanges', { n: route.floorChanges })}
              </span>
            </div>
            <ol className="mt-3">
              {route.steps.map((step, i) => {
                const done = i < stepIdx
                const cur = i === stepIdx
                return (
                  <li key={i}>
                    <button type="button" onClick={() => setStepIdx(i)} className={`flex w-full gap-3 rounded-xl px-2 py-2.5 text-left ${cur ? 'bg-brand-light' : ''}`}>
                      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-bold ${done ? 'bg-[#D5DAE3] text-white' : cur ? 'bg-brand text-white' : 'bg-sub text-ink-2'}`}>
                        {step.type === 'arrive' ? <Flag size={13} /> : step.type === 'elevator' || step.type === 'lift' ? <CableCar size={13} /> : step.type === 'escalator' ? <TrendingUp size={13} /> : step.type === 'stairs' ? <ArrowUpDown size={13} /> : step.type === 'walk' ? <Footprints size={13} /> : <Ticket size={13} />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className={`text-[15px] leading-snug ${cur ? 'font-bold' : done ? 'text-[#A3AAB8]' : 'font-medium'}`}>{step.text}</p>
                        {step.type !== 'arrive' && (
                          <p className="mt-0.5 text-[12px] text-ink-2 tabular">
                            {step.distance > 0 ? `${step.distance}m · ` : ''}
                            {t('unit.sec', { n: Math.round(step.seconds) })}
                            {step.toFloor ? ` · ${floorName(st, step.floor)} → ${floorName(st, step.toFloor)}` : ''}
                            {i < route.steps.length - 1 && ` · ${t('in.next', { p: nodeName(step.node) })}`}
                          </p>
                        )}
                      </div>
                    </button>
                  </li>
                )
              })}
            </ol>
            <div className="mt-3 flex gap-2">
              <div className="w-24 shrink-0">
                <PrimaryButton tone="light" onClick={() => setStepIdx((i) => Math.max(0, i - 1))}>
                  {t('in.prev')}
                </PrimaryButton>
              </div>
              <div className="min-w-0 flex-1">
                <PrimaryButton onClick={() => (stepIdx < route.steps.length - 1 ? setStepIdx((i) => i + 1) : (setFrom(to), setTo(null)))}>
                  {stepIdx < route.steps.length - 1 ? t('in.arrivedHere') : t('in.done')}
                </PrimaryButton>
              </div>
            </div>
            <p className="mt-2 text-[12px] leading-relaxed text-ink-2">{t('in.positionNote')}</p>
          </div>
        )}

        {/* 시설 목록 */}
        <div className="mt-6 border-t border-line px-5 pt-4">
          <h3 className="text-[15px] font-bold">{t('in.facilities')}</h3>
          <div className="mt-2 grid grid-cols-2 gap-x-3">
            {named
              .filter((n) => FACILITY_KINDS.includes(n.kind))
              .map((n) => {
                const Icon = ICON[n.kind] ?? MapPin
                return (
                  <button key={n.id} type="button" onClick={() => (setFloor(n.floor), from ? setTo(n.id) : setFrom(n.id))} className="flex min-h-[44px] items-center gap-2 border-b border-line text-left">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full" style={{ background: COLOR[n.kind] ?? '#747D8D' }}>
                      <Icon size={13} color="#fff" />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{nodeName(n)}</span>
                    <span className="text-[11px] text-ink-2">{n.floor}</span>
                  </button>
                )
              })}
          </div>
        </div>
      </div>
      {qr && (
        <QrScanner
          onClose={() => setQr(false)}
          onCode={(code) => {
            const r = parseIndoorCode(code)
            if (r && r.station === station) {
              setFrom(r.node)
              setPicking(null)
              setQr(false)
              return true
            }
            return false
          }}
        />
      )}
    </div>
  )
}

function Back({ onClose }: { onClose: () => void }) {
  return (
    <button type="button" aria-label={t('common.back')} onClick={onClose} className="flex h-11 w-11 items-center justify-center">
      <ChevronLeft size={26} />
    </button>
  )
}

/** QR 위치 인식 — BarcodeDetector 지원 브라우저(Android Chrome 등)에서 카메라 스캔, 미지원 시 코드 직접 입력 */
function QrScanner({ onClose, onCode }: { onClose: () => void; onCode: (code: string) => boolean }) {
  const video = useRef<HTMLVideoElement>(null)
  const [state, setState] = useState<'starting' | 'scanning' | 'unsupported' | 'denied'>('starting')
  const [manual, setManual] = useState('')
  const [bad, setBad] = useState(false)
  const cb = useRef(onCode)
  cb.current = onCode

  useEffect(() => {
    let stream: MediaStream | null = null
    let timer: number | undefined
    const Detector = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => { detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]> } }).BarcodeDetector
    if (!Detector || !navigator.mediaDevices?.getUserMedia) {
      setState('unsupported')
      return
    }
    const det = new Detector({ formats: ['qr_code'] })
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' } })
      .then((s) => {
        stream = s
        if (video.current) {
          video.current.srcObject = s
          void video.current.play()
        }
        setState('scanning')
        const tick = async () => {
          if (video.current && video.current.readyState >= 2) {
            try {
              const codes = await det.detect(video.current)
              for (const c of codes) if (cb.current(c.rawValue)) return
              if (codes.length) setBad(true)
            } catch {
              /* noop */
            }
          }
          timer = window.setTimeout(tick, 400)
        }
        void tick()
      })
      .catch(() => setState('denied'))
    return () => {
      window.clearTimeout(timer)
      stream?.getTracks().forEach((x) => x.stop())
    }
  }, [])

  return (
    <Modal open onClose={onClose} title={t('in.qr')}>
      <div className="px-5 pb-5">
        {state === 'scanning' || state === 'starting' ? (
          <video ref={video} playsInline muted className="aspect-square w-full rounded-2xl bg-ink object-cover" />
        ) : (
          <p className="rounded-xl bg-sub px-4 py-3 text-[13px] leading-relaxed text-ink-2">{state === 'denied' ? t('in.qrDenied') : t('in.qrUnsupported')}</p>
        )}
        {bad && <p className="mt-2 text-[13px] text-danger">{t('in.qrBad')}</p>}
        <p className="mt-4 text-[13px] font-semibold">{t('in.qrManual')}</p>
        <div className="mt-2 flex gap-2">
          <input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="TOTAME:이대:B1-E3" className="h-11 min-w-0 flex-1 rounded-xl bg-sub px-3 text-[14px] outline-none" />
          <button type="button" onClick={() => setBad(!onCode(manual))} className="h-11 shrink-0 rounded-xl bg-brand px-4 text-[14px] font-bold text-white">
            {t('common.apply')}
          </button>
        </div>
        <p className="mt-2 text-[12px] leading-relaxed text-ink-2">{t('in.qrNote')}</p>
        <button type="button" onClick={onClose} className="sr-only">
          <X />
        </button>
      </div>
    </Modal>
  )
}
