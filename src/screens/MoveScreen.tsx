import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Ban,
  BarChart3,
  Bell,
  BellOff,
  CableCar,
  Check,
  CircleCheck,
  Clock,
  Construction,
  Flag,
  LocateFixed,
  MapPin,
  Pause,
  Play,
  Route as RouteIcon,
  SkipForward,
  TrainFront,
  TriangleExclamationPoint,
  X,
  Map as MapIcon,
  Users,
  Footprints,
} from 'lucide-react'
import AdSlot from '../components/AdSlot'
import { DelayLine } from '../components/DelayLine'
import { hasIndoor } from '../data/indoor'
import { STATUS_TEXT, STATUS_TONE, firstBoarding, planBoarding } from '../lib/boarding'
import { carCongestion } from '../lib/congestion'
import { useNow } from './SmartDeparture'
import SubwayMap from '../components/SubwayMap'
import { towardOf } from '../components/TransferPath'
import { CRITERION_KEY } from '../components/Overlays'
import { LineBadge, PrimaryButton, RouteBar, DataTag, Segmented } from '../components/ui'
import { LINES, STATIONS, distKm } from '../data/network'
import { lineName, stationName, t, type MessageKey } from '../i18n'
import { useGeo } from '../lib/geo'
import { findRoutes, formatClock, formatMMSS, remainingMinutes, routeStops, type Disruption, type IssueCode, type Route } from '../lib/routing'
import { exitsOf, mapLinks, openMap } from '../services/maps'
import { useStore, type MoveTab, type TrackMode } from '../state/store'

export default function MoveScreen() {
  const { moveTab, setMoveTab, disruptions } = useStore()
  const tabs: { value: MoveTab; label: React.ReactNode }[] = [
    { value: 'track', label: t('move.track') },
    {
      value: 'disruption',
      label: (
        <span className="inline-flex items-center gap-1">
          {t('move.disruption')}
          {disruptions.length > 0 && <span className="h-1.5 w-1.5 rounded-full bg-danger" />}
        </span>
      ),
    },
  ]
  return (
    <div className="safe-top absolute inset-0 flex flex-col bg-white">
      <div className="shrink-0 px-4 pt-2 pb-2">
        <Segmented value={moveTab} options={tabs} onChange={setMoveTab} />
      </div>
      <div className="relative min-h-0 flex-1">
        {moveTab === 'track' && <TrackView />}
        {moveTab === 'disruption' && <DisruptionView />}
      </div>
    </div>
  )
}

function useActiveRoute(): Route | null {
  const s = useStore()
  return s.journeyRoute ?? s.selectedRoute
}

function EmptyRoute() {
  const s = useStore()
  return (
    <div className="flex h-full flex-col items-center justify-center px-8 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-light text-brand">
        <TrainFront size={30} />
      </span>
      <p className="mt-4 text-[18px] font-bold">{t('move.emptyTitle')}</p>
      <p className="mt-1 text-[14px] text-ink-2">{t('move.emptyBody')}</p>
      <div className="mt-6 w-full space-y-2">
        <PrimaryButton
          onClick={() => {
            if (s.search('이대', '잠실')) s.setTab('route')
          }}
        >
          {t('move.exampleSearch')}
        </PrimaryButton>
        <PrimaryButton tone="light" onClick={() => s.setTab('route')}>
          {t('move.searchSelf')}
        </PrimaryButton>
      </div>
    </div>
  )
}

// ───────────────────────── 지금 어디? ─────────────────────────

function TrackView() {
  const s = useStore()
  const route = useActiveRoute()
  const j = s.journey
  const listRef = useRef<HTMLDivElement>(null)
  const { geo, locate, stop } = useGeo(true)
  const stops = route ? routeStops(route) : []
  const index = j?.index ?? 0

  useEffect(() => {
    const el = listRef.current?.querySelector('[data-current="true"]') as HTMLElement | null
    if (el && listRef.current) listRef.current.scrollTo({ top: el.offsetTop - 120, behavior: 'smooth' })
  }, [index])

  // GPS 보정: 경로 위 가장 가까운 역(800m 이내)으로 현재 역 갱신 — 지하에서는 GPS가 약해 역 좌표·경로와 함께 사용
  useEffect(() => {
    if (!j || j.mode !== 'gps' || geo.status !== 'ok' || !geo.real) return
    let best = -1
    let bestKm = 0.8
    stops.forEach((st, i) => {
      const p = STATIONS[st.station]
      const km = distKm(geo.lat, geo.lon, p.lat, p.lon)
      if (km < bestKm) {
        bestKm = km
        best = i
      }
    })
    if (best >= 0 && best !== j.index) s.setJourneyIndex(best, 'gps')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geo.lat, geo.lon, geo.status, j?.mode])

  useEffect(() => {
    if (j?.mode === 'gps') s.withLocation(locate)
    else stop()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [j?.mode])

  if (!route) return <EmptyRoute />
  if (!j)
    return (
      <div className="flex h-full flex-col items-center justify-center px-8 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-light text-brand">
          <MapPin size={28} />
        </span>
        <p className="mt-4 text-[18px] font-bold">
          {stationName(route.from)} → {stationName(route.to)}
        </p>
        <p className="mt-1 text-[14px] text-ink-2">{t('track.startHint')}</p>
        <div className="mt-6 w-full">
          <PrimaryButton onClick={() => s.startJourney(route, { alertOn: true })}>{t('track.start')}</PrimaryButton>
        </div>
      </div>
    )

  if (j.arrived) return <ArrivalView route={route} />

  const left = stops.length - 1 - index
  const aheadLines = [...new Set(stops.slice(index).map((x) => x.line))]
  const delayAhead = aheadLines.reduce((a, l) => a + s.statusOf(l).delayMin, 0)
  const remMin = remainingMinutes(route, index) + delayAhead
  const eta = new Date(Date.now() + remMin * 60000)
  const cur = stops[index]
  const next = stops[index + 1]
  const curLine = cur.transferTo && index > 0 ? cur.line : (next ? next.line : cur.line)
  const nextTransferIdx = stops.findIndex((x, i) => i >= index && x.transferTo)
  const nextTr = nextTransferIdx >= 0 ? route.transfers.find((x) => x.station === stops[nextTransferIdx].station) : undefined
  const progress = index / Math.max(1, stops.length - 1)
  const toward = towardOf(route, cur.station, curLine)

  const modes: { value: TrackMode; label: string }[] = [
    { value: 'sim', label: t('track.mode.sim') },
    { value: 'gps', label: t('track.mode.gps') },
    { value: 'manual', label: t('track.mode.manual') },
  ]

  return (
    <div className="flex h-full flex-col">
      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto" ref={listRef}>
        {/* 미니 지도 */}
        <div className="relative mx-4 h-[170px] overflow-hidden rounded-2xl">
          <SubwayMap routes={[route]} selectedId={route.id} focus={route.segments.flatMap((g) => g.stations)} fitKey={`track-${route.id}`} currentStation={cur.station} showUser={false} />
        </div>

        {/* 진행 요약 */}
        <div className="px-5 pt-4">
          <div className="flex items-center gap-2 text-[14px]">
            <LineBadge line={curLine} size={20} />
            <span className="font-semibold">{lineName(curLine)}</span>
            <span className="truncate text-ink-2">{toward}</span>
          </div>
          <div className="mt-2 flex items-end justify-between">
            <p className="leading-none">
              <span className="text-[44px] font-extrabold text-brand tabular">{left}</span>
              <span className="ml-1 text-[18px] font-bold">{t('track.stopsLeft')}</span>
            </p>
            <div className="text-right">
              <p className="text-[13px] text-ink-2">{t('track.eta')}</p>
              <p className="text-[22px] font-bold tabular">{formatClock(eta)}</p>
              <p className="text-[12px] text-ink-2 tabular">{t('track.inMin', { n: remMin })}</p>
            </div>
          </div>
          <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-[#E9ECF2]">
            <div className="h-full rounded-full bg-brand transition-all duration-500" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
          <div className="mt-1 flex justify-between text-[12px] text-ink-2">
            <span>{stationName(route.from)}</span>
            <span className="font-semibold text-brand">{Math.round(progress * 100)}%</span>
            <span>{stationName(route.to)}</span>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-brand-light px-3 py-2">
              <p className="text-[12px] font-semibold text-brand">{t('track.current')}</p>
              <p className="truncate text-[16px] font-bold">{stationName(cur.station)}</p>
            </div>
            <div className="rounded-xl bg-sub px-3 py-2">
              <p className="text-[12px] font-semibold text-ink-2">{t('track.next')}</p>
              <p className="truncate text-[16px] font-bold">{next ? stationName(next.station) : '—'}</p>
            </div>
          </div>

          {nextTr && (
            <button type="button" onClick={() => s.setTab('transfer')} className="mt-3 flex w-full items-start gap-3 rounded-xl border border-line px-3 py-3 text-left">
              <RouteIcon size={18} className="mt-0.5 shrink-0 text-brand" />
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-bold">
                  {t('track.transferAt', { s: stationName(nextTr.station), n: nextTransferIdx - index })}
                </p>
                <p className="mt-0.5 flex flex-wrap items-center gap-1 text-[13px] text-ink-2">
                  <LineBadge line={nextTr.to} size={16} /> {towardOf(route, nextTr.station, nextTr.to)}
                  {nextTr.info.source === 'sample' ? ` · ${t('station.door', { d: nextTr.info.door })}` : ''}
                </p>
                {hasIndoor(nextTr.station) && <p className="mt-1 text-[12px] font-semibold text-brand">{t('in.available')}</p>}
              </div>
            </button>
          )}
          <div className="mt-3 flex items-center gap-2 rounded-xl bg-sub px-3 py-2.5">
            <Flag size={16} className="text-brand" />
            <span className="text-[14px] font-semibold">{t('track.final', { s: stationName(route.to) })}</span>
            {hasIndoor(route.to) && (
              <button type="button" onClick={() => s.openPage({ kind: 'indoor', station: route.to })} className="ml-auto flex h-8 items-center gap-1 rounded-lg bg-white px-2.5 text-[12px] font-bold text-brand">
                <MapIcon size={13} /> {t('in.short')}
              </button>
            )}
          </div>
          {index === 0 && <PreBoarding route={route} />}
          <div className="mt-3">
            <DelayLine line={curLine} />
            {delayAhead > 0 && <p className="mt-1 px-1 text-[12px] font-semibold text-danger">{t('track.delayEta', { n: delayAhead })}</p>}
          </div>
          <button type="button" onClick={() => s.openPage({ kind: 'crowd', station: cur.station })} className="mt-2 flex w-full items-center gap-2 rounded-xl border border-line px-3 py-2.5 text-left">
            <Users size={16} className="text-brand" />
            <span className="text-[13px] font-semibold">{t('route.bestCar', { n: carCongestion(cur.station, curLine, new Date()).best })}</span>
            <DataTag kind="estimate" className="ml-auto" />
          </button>

          {/* 위치 기준 */}
          <div className="mt-4">
            <p className="mb-1.5 text-[13px] font-semibold text-ink-2">{t('track.source')}</p>
            <Segmented size="sm" value={j.mode} options={modes} onChange={(m) => s.setJourney({ ...j, mode: m, auto: m === 'sim' ? j.auto : false })} />
            <p className="mt-1.5 text-[12px] leading-relaxed text-ink-2">
              {j.mode === 'sim' && t('track.mode.simNote')}
              {j.mode === 'manual' && t('track.mode.manualNote')}
              {j.mode === 'gps' &&
                (geo.status === 'ok' && geo.real
                  ? t('track.gpsOk', { m: Math.round(geo.accuracy ?? 0) })
                  : geo.status === 'denied' || geo.status === 'unavailable'
                    ? t('track.gpsDenied')
                    : t('geo.locating'))}
            </p>
            {j.mode === 'gps' && geo.status !== 'ok' && (
              <button type="button" onClick={() => s.withLocation(locate)} className="mt-1 flex h-8 items-center gap-1 text-[13px] font-semibold text-brand">
                <LocateFixed size={14} /> {t('geo.retry')}
              </button>
            )}
          </div>
        </div>

        {/* 세로형 노선 */}
        <div className="relative px-5 py-4">
          {stops.map((st, i) => {
            const passed = i < index
            const isCur = i === index
            const isDest = i === stops.length - 1
            const nextLine = stops[i + 1]?.line ?? st.line
            const railColor = st.transferTo ? LINES[st.transferTo].color : LINES[nextLine].color
            const preAlert = !isDest && i === stops.length - 1 - s.alerts.alightBefore
            return (
              <button
                type="button"
                key={st.station + i}
                data-current={isCur}
                onClick={() => (j.mode === 'manual' || j.mode === 'sim') && s.setJourneyIndex(i, j.mode === 'sim' ? 'manual' : 'manual')}
                className="relative flex min-h-[46px] w-full items-center gap-4 text-left"
              >
                {!isDest && <span className="absolute top-1/2 left-[13px] h-full w-[4px]" style={{ background: i < index ? '#D5DAE3' : railColor }} />}
                <span className="relative z-10 flex w-[30px] justify-center">
                  {isCur ? (
                    <span className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-brand ring-4 ring-brand/20">
                      <TrainFront size={16} className="text-white" />
                    </span>
                  ) : isDest ? (
                    <span className="flex h-[30px] w-[30px] items-center justify-center rounded-full border-[3px] border-brand bg-white">
                      <Flag size={14} className="text-brand" />
                    </span>
                  ) : (
                    <span className="h-[14px] w-[14px] rounded-full border-[3px] bg-white" style={{ borderColor: passed ? '#D5DAE3' : LINES[st.line].color }} />
                  )}
                </span>
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <span className={`truncate text-[16px] ${isCur || isDest ? 'font-extrabold' : passed ? 'text-[#A3AAB8]' : 'font-medium'} ${isDest ? 'text-brand' : ''}`}>{stationName(st.station)}</span>
                  {isCur && <span className="shrink-0 rounded-md bg-brand px-1.5 py-0.5 text-[11px] font-bold text-white">{t('track.currentTag')}</span>}
                  {isDest && <span className="shrink-0 rounded-md bg-brand-light px-1.5 py-0.5 text-[11px] font-bold text-brand">{t('track.alightTag')}</span>}
                  {st.transferTo && (
                    <span className="flex shrink-0 items-center gap-1 text-[12px] font-semibold text-ink-2">
                      {t('track.transferTag')} <LineBadge line={st.transferTo} size={16} />
                    </span>
                  )}
                  {preAlert && j.alertOn && !passed && <Bell size={14} className="ml-auto shrink-0 text-warn" />}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* 조작 */}
      <div className="shrink-0 border-t border-line bg-white px-4 pt-3 pb-3">
        <div className="flex gap-2">
          <PrimaryButton tone={j.alertOn ? 'light' : 'brand'} onClick={() => s.setJourney({ ...j, alertOn: !j.alertOn })} className="flex-1">
            {j.alertOn ? <BellOff size={19} /> : <Bell size={19} />}
            {j.alertOn ? t('track.alertOff') : t('track.alertOn')}
          </PrimaryButton>
          <button type="button" onClick={() => s.advance(1)} className="flex h-[54px] shrink-0 items-center gap-1 rounded-2xl bg-ink px-4 text-[15px] font-bold text-white active:bg-black">
            {t('track.nextStation')} <SkipForward size={17} />
          </button>
          <button
            type="button"
            aria-label={t('track.auto')}
            onClick={() => s.setJourney({ ...j, auto: !j.auto, mode: 'sim' })}
            className={`flex h-[54px] w-[54px] shrink-0 items-center justify-center rounded-2xl ${j.auto ? 'bg-brand-light text-brand' : 'bg-sub text-ink'}`}
          >
            {j.auto ? <Pause size={20} /> : <Play size={20} />}
          </button>
        </div>
        <p className="mt-2 text-center text-[12px] text-ink-2">
          {j.alertOn ? t('track.alertState', { n: s.alerts.alightBefore }) : t('track.alertOffState')}
        </p>
      </div>
    </div>
  )
}

function ArrivalView({ route }: { route: Route }) {
  const s = useStore()
  const exits = exitsOf(route.to)
  const [exitNo, setExitNo] = useState(exits[0]?.no ?? 1)
  const [dest, setDest] = useState('')
  const exit = exits.find((e) => e.no === exitNo)
  const st = STATIONS[route.to]
  const name = stationName(route.to)
  const exitName = `${name} ${t('exit.no', { n: exitNo })}`

  const open = (p: 'kakao' | 'naver') => {
    if (!exit) return
    openMap(dest.trim() ? mapLinks(p, { name: exitName, lat: exit.lat, lon: exit.lon, query: `${name} ${dest.trim()}` }) : mapLinks(p, { name: exitName, lat: exit.lat, lon: exit.lon }))
  }

  return (
    <div className="no-scrollbar h-full overflow-y-auto pb-6">
      <div className="px-5 pt-4 text-center">
        <CircleCheck size={44} className="mx-auto text-ok" />
        <p className="mt-2 text-[26px] font-extrabold">{t('arrive.title', { s: name })}</p>
        <p className="mt-1 text-[14px] text-ink-2">
          {t('unit.min', { n: route.totalMin })} · {t('route.transfers', { n: route.transferCount })} · {route.distanceKm}km
        </p>
        <p className="mt-1 text-[12px] text-ok">{t('arrive.saved')}</p>
      </div>

      {/* 출구 선택 */}
      <div className="mt-5 border-t border-line px-5 pt-4">
        <div className="flex items-center gap-2">
          <h3 className="text-[15px] font-bold">{t('arrive.exit')}</h3>
          <DataTag kind="demo" />
        </div>
        <div className="mt-2 grid grid-cols-4 gap-2">
          {exits.map((e) => (
            <button key={e.no} type="button" onClick={() => setExitNo(e.no)} className={`flex h-12 flex-col items-center justify-center rounded-xl border ${e.no === exitNo ? 'border-brand bg-brand-light' : 'border-line'}`}>
              <span className="flex items-center gap-1 text-[14px] font-bold">
                <span className="flex h-5 w-5 items-center justify-center rounded bg-[#F2C230] text-[11px] font-extrabold text-ink">{e.no}</span>
                {e.elevator && <CableCar size={12} className="text-ok" />}
              </span>
              <span className="text-[11px] text-ink-2">{t(`dir.${e.dir}` as 'dir.N')}</span>
            </button>
          ))}
        </div>
        {/* 출구 위치 */}
        {exit && st && (
          <div className="relative mt-3 h-[120px] overflow-hidden rounded-xl bg-[#F6F7F9]">
            <svg viewBox="-60 -60 120 120" className="h-full w-full">
              <circle cx={0} cy={0} r={8} fill="#fff" stroke="#222B3A" strokeWidth={2} />
              {exits.map((e) => {
                const x = (e.lon - st.lon) * 88200 * 0.25
                const y = -(e.lat - st.lat) * 111000 * 0.25
                const on = e.no === exitNo
                return (
                  <g key={e.no}>
                    <line x1={0} y1={0} x2={x} y2={y} stroke="#E6E9F0" strokeWidth={1.5} />
                    <rect x={x - 6} y={y - 6} width={12} height={12} rx={3} fill={on ? '#293896' : '#F2C230'} />
                    <text x={x} y={y + 3.5} fontSize={8} textAnchor="middle" fontWeight={800} fill={on ? '#fff' : '#222B3A'}>
                      {e.no}
                    </text>
                  </g>
                )
              })}
            </svg>
            <span className="absolute bottom-1.5 left-2 text-[11px] text-ink-2">{t('arrive.exitNote')}</span>
          </div>
        )}
      </div>

      {hasIndoor(route.to) && exit && (
        <div className="mt-3 px-5">
          <button type="button" onClick={() => s.openPage({ kind: 'indoor', station: route.to, to: `E${exitNo}` })} className="flex h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-brand-light text-[14px] font-bold text-brand">
            <MapIcon size={16} /> {t('arrive.indoor', { n: exitNo })}
          </button>
        </div>
      )}
      {/* 외부 지도 연동 */}
      <div className="mt-4 px-5">
        <h3 className="text-[15px] font-bold">{t('arrive.toDest')}</h3>
        <input value={dest} onChange={(e) => setDest(e.target.value)} placeholder={t('arrive.destPh')} className="mt-2 h-12 w-full rounded-xl bg-sub px-4 text-[16px] outline-none" />
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button type="button" onClick={() => open('kakao')} className="h-12 rounded-xl bg-[#FEE500] text-[15px] font-bold text-[#191919]">
            {t('arrive.kakao')}
          </button>
          <button type="button" onClick={() => open('naver')} className="h-12 rounded-xl bg-[#03C75A] text-[15px] font-bold text-white">
            {t('arrive.naver')}
          </button>
        </div>
        <p className="mt-2 text-[12px] leading-relaxed text-ink-2">{t('arrive.mapNote')}</p>
      </div>

      <AdSlot placement="arrival_native" variant="native" seed={route.to.length} />

      <div className="space-y-2 px-4">
        <PrimaryButton tone="light" onClick={() => s.setTab('report')}>
          <BarChart3 size={19} /> {t('arrive.report')}
        </PrimaryButton>
        <PrimaryButton
          tone="ink"
          onClick={() => {
            s.setJourney(null)
            s.setTab('home')
          }}
        >
          <Check size={19} /> {t('arrive.end')}
        </PrimaryButton>
      </div>
    </div>
  )
}

// ───────────────────────── 스마트 환승 ─────────────────────────

// ───────────────────────── 실시간 장애 대응 ─────────────────────────

function signatureFrom(r: Route) {
  return r.segments.map((g, i) => (i === 0 ? g.line : `${g.line}@${g.stations[0]}`)).join('/') + '>' + r.to
}

export function issueText(i: IssueCode) {
  switch (i.code) {
    case 'delay':
      return t('issue.delay', { l: lineName(i.line), n: i.minutes })
    case 'suspend':
      return t('issue.suspend', { l: lineName(i.line), a: stationName(i.a), b: stationName(i.b) })
    case 'closed':
      return t('issue.closed', { s: stationName(i.station) })
    case 'elevator':
      return t('issue.elevator', { s: stationName(i.station) })
  }
}

function DisruptionView() {
  const s = useStore()
  const route = useActiveRoute()
  const [choice, setChoice] = useState<string | null>(null)

  const stops = route ? routeStops(route) : []
  const curIndex = s.journey?.index ?? 0
  const origin = s.journey ? stops[curIndex]?.station : route?.from

  const alts = useMemo(() => {
    if (!route || !origin || !s.disruptions.length) return []
    const sig = signatureFrom(route)
    return findRoutes(origin, route.to, s.settings, s.disruptions).filter((r) => signatureFrom(r) !== sig)
  }, [route, origin, s.settings, s.disruptions])

  useEffect(() => setChoice(alts[0]?.id ?? null), [alts])

  if (!route) return <EmptyRoute />

  const upcomingTransfers = route.transfers.filter((x) => stops.findIndex((y) => y.station === x.station) >= curIndex)
  const target = upcomingTransfers.find((x) => x.info.elevator) ?? upcomingTransfers[0] ?? route.transfers[0]
  const lastSeg = route.segments[route.segments.length - 1]

  const events: { key: Disruption['kind']; label: MessageKey; desc: string; Icon: typeof Ban; make: () => Disruption | null }[] = [
    {
      key: 'elevator',
      label: 'dis.elevator',
      desc: target ? `${stationName(target.station)} ${LINES[target.from].short}↔${LINES[target.to].short}` : t('dis.noTransfer'),
      Icon: CableCar,
      make: () => (target ? { id: `ev-${target.station}`, kind: 'elevator', station: target.station, lines: [target.from, target.to] } : null),
    },
    {
      key: 'delay',
      label: 'dis.delay',
      desc: `${lineName(lastSeg.line)} +10`,
      Icon: Clock,
      make: () => ({ id: `delay-${lastSeg.line}`, kind: 'delay', line: lastSeg.line, minutes: 10 }),
    },
    {
      key: 'suspend',
      label: 'dis.suspend',
      desc: `${stationName(lastSeg.stations[0])}–${stationName(lastSeg.stations[1])}`,
      Icon: Ban,
      make: () => ({ id: `sus-${lastSeg.line}`, kind: 'suspend', line: lastSeg.line, from: lastSeg.stations[0], to: lastSeg.stations[1] }),
    },
    {
      key: 'passage',
      label: 'dis.passage',
      desc: target ? stationName(target.station) : t('dis.noTransfer'),
      Icon: Construction,
      make: () => (target ? { id: `pass-${target.station}`, kind: 'passage', station: target.station, lines: [target.from, target.to] } : null),
    },
  ]

  const trigger = (e: (typeof events)[number]) => {
    const d = e.make()
    if (!d) return
    s.setDisruptions((list) => [...list.filter((x) => x.id !== d.id), d])
    s.notify({ title: t('dis.happened', { e: t(e.label) }), body: `${e.desc} · ${t('dis.foundAlt')}`, tone: 'danger' }, { kind: 'transfer' })
  }

  const describe = (d: Disruption) => {
    if (d.kind === 'elevator') return t('issue.elevator', { s: stationName(d.station) })
    if (d.kind === 'passage') return t('issue.closed', { s: stationName(d.station) })
    if (d.kind === 'delay') return t('issue.delay', { l: lineName(d.line), n: d.minutes })
    return t('issue.suspend', { l: lineName(d.line), a: stationName(d.from), b: stationName(d.to) })
  }

  const chosen = alts.find((a) => a.id === choice)
  const affected = route.issues.length > 0

  return (
    <div className="flex h-full flex-col">
      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto pb-4">
        {s.disruptions.length > 0 ? (
          <div className="mx-4 mt-2 rounded-2xl bg-[#FBEAEA] p-4">
            <div className="flex items-center gap-2">
              <TriangleExclamationPoint size={19} className="text-danger" />
              <span className="text-[16px] font-bold text-danger">{t('home.disruptions', { n: s.disruptions.length })}</span>
              <button type="button" onClick={() => s.setDisruptions([])} className="ml-auto h-8 rounded-lg bg-white px-3 text-[13px] font-bold text-ink">
                {t('dis.clearAll')}
              </button>
            </div>
            <ul className="mt-2 space-y-1">
              {s.disruptions.map((d) => (
                <li key={d.id} className="flex items-center gap-2 text-[14px] font-medium">
                  <span className="flex-1">{describe(d)}</span>
                  <button type="button" aria-label={t('dis.clear')} onClick={() => s.setDisruptions((l) => l.filter((x) => x.id !== d.id))} className="text-ink-2">
                    <X size={16} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="mx-4 mt-2 flex items-center gap-2 rounded-2xl bg-[#E8F3EE] p-4">
            <CircleCheck size={19} className="text-ok" />
            <span className="text-[15px] font-bold text-ok">{t('dis.none')}</span>
          </div>
        )}

        <div className="mt-5 px-5">
          <div className="mb-2 flex items-center gap-2">
            <h3 className="text-[15px] font-bold">{s.journey ? t('dis.current') : t('dis.selected')}</h3>
            {affected && <span className="rounded-md bg-danger px-1.5 py-0.5 text-[11px] font-bold text-white">{t('dis.affected')}</span>}
          </div>
          <div className={`rounded-2xl border p-4 ${affected ? 'border-danger/40' : 'border-line'}`}>
            <div className="flex items-baseline gap-2">
              <span className={`text-[22px] font-extrabold tabular ${affected ? 'text-ink-2 line-through decoration-2' : ''}`}>{t('unit.min', { n: route.totalMin })}</span>
              <span className="text-[14px] text-ink-2">
                {t('route.transfers', { n: route.transferCount })} · {route.walkM}m
              </span>
            </div>
            <div className="mt-2">
              <RouteBar route={route} faded={affected} />
            </div>
            {route.issues.map((i, k) => (
              <p key={k} className="mt-2 flex items-start gap-1.5 text-[14px] font-semibold text-danger">
                <TriangleExclamationPoint size={15} className="mt-0.5 shrink-0" />
                {issueText(i)}
              </p>
            ))}
          </div>
        </div>

        {s.disruptions.length > 0 && (
          <div className="mt-6">
            <div className="px-5">
              <h3 className="text-[15px] font-bold">{t('dis.alts')}</h3>
              <p className="mt-0.5 text-[13px] text-ink-2">
                {origin && `${t('dis.from', { s: stationName(origin) })} · `}
                {t('dis.keep')}: {s.settings.priorities.length ? s.settings.priorities.map((p, i) => `${i + 1}. ${t(CRITERION_KEY[p])}`).join(' ') : t('crit.fast')}
              </p>
            </div>
            {alts.length === 0 && <p className="px-5 py-6 text-[14px] text-ink-2">{t('dis.noAlt')}</p>}
            <div className="mt-2 border-t border-line">
              {alts.map((a) => {
                const sel = a.id === choice
                return (
                  <button key={a.id} type="button" onClick={() => setChoice(a.id)} className={`relative flex w-full gap-3 border-b border-line px-5 py-4 text-left ${sel ? 'bg-[#F5F8FE]' : ''}`}>
                    <span className={`mt-1 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-2 ${sel ? 'border-brand bg-brand' : 'border-[#C5CBD6]'}`}>{sel && <Check size={13} className="text-white" strokeWidth={3} />}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-2">
                        {a.recommended && <span className="rounded-md bg-brand px-1.5 py-0.5 text-[11px] font-bold text-white">{t('route.recommended')}</span>}
                        <span className="text-[20px] font-extrabold tabular">{t('unit.min', { n: a.totalMin })}</span>
                        <span className="text-[13px] text-ink-2">
                          {t('route.transfers', { n: a.transferCount })} · {a.walkM}m
                        </span>
                        <span className={`ml-auto text-[13px] font-semibold ${a.elevatorOk ? 'text-ok' : 'text-[#B57714]'}`}>{a.elevatorOk ? t('route.elevatorOk') : t('reason.stairs', { n: a.stairsCount })}</span>
                      </div>
                      <div className="mt-2">
                        <RouteBar route={a} faded={!sel} />
                      </div>
                      <p className="mt-1.5 text-[13px] text-ink-2">{a.transfers.length ? a.transfers.map((x) => t('dis.transferAt', { s: stationName(x.station) })).join(' · ') : t('reason.direct')}</p>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <div className="mt-6 px-5">
          <div className="mb-2 flex items-center gap-2">
            <h3 className="text-[15px] font-bold">{t('dis.events')}</h3>
            <span className="text-[12px] text-ink-2">{t('dis.sim')}</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {events.map((e) => {
              const active = s.disruptions.some((d) => d.kind === e.key)
              return (
                <button
                  key={e.key}
                  type="button"
                  onClick={() => trigger(e)}
                  disabled={(e.key === 'elevator' || e.key === 'passage') && !target}
                  className={`flex min-h-[68px] flex-col items-start justify-center rounded-xl border px-3.5 py-2.5 text-left disabled:opacity-40 ${active ? 'border-danger bg-[#FBEAEA]' : 'border-line active:bg-sub'}`}
                >
                  <span className={`flex items-center gap-1.5 text-[15px] font-bold ${active ? 'text-danger' : ''}`}>
                    <e.Icon size={16} /> {t(e.label)}
                  </span>
                  <span className="mt-0.5 text-[12px] leading-tight text-ink-2">{e.desc}</span>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {chosen && (
        <div className="shrink-0 border-t border-line bg-white px-4 pt-3 pb-3">
          <PrimaryButton
            onClick={() => {
              s.startJourney(chosen, { alertOn: s.journey?.alertOn ?? true, auto: false, startedAt: s.journey?.startedAt ?? Date.now() })
              s.notify({ title: t('dis.changed'), body: `${stationName(chosen.to)} ${formatClock(new Date(Date.now() + chosen.totalMin * 60000))}`, tone: 'success' }, { silent: true })
              s.setMoveTab('track')
            }}
          >
            <RouteIcon size={19} /> {t('dis.apply')}
          </PrimaryButton>
        </div>
      )}
    </div>
  )
}

/** 탑승 전: 출발역 승강장까지 · 다음 열차 — 홈·경로와 같은 계산 */
function PreBoarding({ route }: { route: Route }) {
  const s = useStore()
  const now = useNow(1000)
  const b = firstBoarding(route)
  const place = s.places.find((p) => p.station === b.station)
  const p = planBoarding({ station: b.station, line: b.line, toward: b.toward, distanceM: place?.distanceM ?? 0, mode: 'walk', walkSpeed: s.walkSpeed, now, delayMin: s.statusOf(b.line).delayMin, route, mustCatch: s.departMode === 'must', bufferMin: s.safetyBuffer })
  const secs = Math.max(0, Math.round((p.catchable.at.getTime() - now.getTime()) / 1000))
  return (
    <button type="button" onClick={() => s.setTab('depart')} className="mt-3 block w-full rounded-xl bg-brand-light px-3 py-3 text-left">
      <p className="flex items-center gap-1.5 text-[12px] font-semibold text-brand">
        <Footprints size={14} /> {t('track.beforeBoard')} <span className="ml-auto">{t('dep.title')} ›</span>
      </p>
      <p className={`mt-1 text-[15px] font-bold ${STATUS_TONE[p.status]}`}>{t(STATUS_TEXT[p.status])}</p>
      <p className="text-[12px] text-ink-2 tabular">
        {t('track.boardIn', { time: formatClock(p.catchable.at), t: formatMMSS(secs) })} · {t('dep.breakdown', { n: Math.round(p.access.total) })}
      </p>
    </button>
  )
}
