// 스마트 출발 (하단 탭) — "지금 출발하면 이번 열차를 탈 수 있을까?"
// 현재 위치/저장 장소 → 역 입구 → 개찰구 → 승강장 이동시간 + 혼잡(예상) + 안전 여유를 열차 출발시각(예상 시간표)과 비교
import { useEffect, useMemo, useState } from 'react'
import { Bell, BellOff, Bike, ChevronRight, Footprints, LocateFixed, MapPin, Navigation, Plus, Search, ShieldCheck, TrainFront } from 'lucide-react'
import { DelayLine } from '../components/DelayLine'
import { CrowdChip, DataTag, LineBadge, PrimaryButton, ScreenHeader, Segmented } from '../components/ui'
import { STATIONS, type LineId } from '../data/network'
import { stationName, t } from '../i18n'
import { CROWD_EXTRA, STATUS_TEXT, STATUS_TONE, directionsOf, firstBoarding, planBoarding, type Mode } from '../lib/boarding'
import { stationCongestion } from '../lib/congestion'
import { nearestStations, useGeo } from '../lib/geo'
import { findRoutes, formatClock, formatMMSS, type Route } from '../lib/routing'
import { fetchArrivals, type Arrival } from '../services/realtime'
import { useApptPlans } from '../state/plans'
import { placeLabel, useStore } from '../state/store'
import { useNow } from '../state/useNow'
import { AddPlace, KIND_ICON } from './SmartDeparture'

type OriginSel = { kind: 'current' } | { kind: 'place'; id: string } | { kind: 'station' }

/** 스마트 출발이 기준으로 삼을 경로: 이동 시작 전 경로 → 홈에서 검색한 경로 → 오늘 다음 일정 경로 */
function useContextRoute() {
  const s = useStore()
  const { plans } = useApptPlans(60000)
  if (s.journey && !s.journey.arrived && s.journey.index === 0) return { route: s.journeyRoute ?? s.journey.route, source: 'journey' as const }
  if (s.selectedRoute) return { route: s.selectedRoute, source: 'search' as const }
  const next = plans.filter((p) => p.go?.route && (p.phase === 'scheduled' || p.phase === 'prepare')).sort((x, y) => x.go!.leaveAt.getTime() - y.go!.leaveAt.getTime())[0]
  if (next?.go?.route) return { route: next.go.route, source: 'appt' as const, apptId: next.a.id, title: next.a.title || next.a.placeName }
  return { route: null, source: null }
}

export default function DepartureScreen() {
  const s = useStore()
  const now = useNow(1000)
  const ctx = useContextRoute()
  const route = ctx.route
  const { geo, locate } = useGeo()
  const routeStation = route ? firstBoarding(route).station : null
  const defaultOrigin = (): OriginSel => {
    const pl = s.places.find((p) => p.station === routeStation) ?? s.places.find((p) => p.id === s.defaultOriginId)
    if (pl) return { kind: 'place', id: pl.id }
    if (routeStation) return { kind: 'station' }
    return s.places[0] ? { kind: 'place', id: s.places[0].id } : { kind: 'current' }
  }
  const [origin, setOrigin] = useState<OriginSel>(defaultOrigin)
  const [mode, setMode] = useState<Mode>('walk')
  const [line, setLine] = useState<LineId | null>(null)
  const [dirIdx, setDirIdx] = useState(0)
  const [adding, setAdding] = useState(false)
  const [rt, setRt] = useState<Arrival[] | null | undefined>(undefined)

  // 출발지 해석 (위치를 모르면 계산하지 않음)
  const near = geo.status === 'ok' && geo.real ? nearestStations(geo.lat, geo.lon, 1)[0] : null
  const place = origin.kind === 'place' ? s.places.find((p) => p.id === origin.id) : undefined
  const resolved: { station: string; distanceM: number; label: string } | null =
    origin.kind === 'current'
      ? near
        ? { station: near.st.id, distanceM: Math.max(30, Math.round(near.km * 1000)), label: t('dep.current') }
        : null
      : origin.kind === 'station'
        ? routeStation
          ? { station: routeStation, distanceM: 0, label: t('dep.atStation') }
          : null
        : place && STATIONS[place.station]
          ? { station: place.station, distanceM: place.distanceM, label: placeLabel(place, t) }
          : null

  // 위치 확인 시 마지막 위치 저장 (현재 위치 출발 일정 계산용)
  useEffect(() => {
    if (near && s.locationConsent) s.patch({ lastKnown: { station: near.st.id, distanceM: Math.round(near.km * 1000), at: new Date().toISOString() } })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [near?.st.id, Math.round((near?.km ?? 0) * 20)])

  const station = resolved?.station ?? null
  const matchesRoute = Boolean(route && station === routeStation)
  const fb = route && matchesRoute ? firstBoarding(route) : null
  const lineSel: LineId | null = station ? (fb ? fb.line : line && STATIONS[station].lines.includes(line) ? line : STATIONS[station].lines[0]) : null
  const dirs = station && lineSel ? directionsOf(station, lineSel) : []
  const toward = fb ? fb.toward : dirs[Math.min(dirIdx, dirs.length - 1)]?.toward
  const delayMin = lineSel ? s.statusOf(lineSel).delayMin : 0
  const crowd = station ? stationCongestion(station, now).concourse : null
  const must = s.departMode === 'must'

  useEffect(() => {
    if (!station) return
    let alive = true
    setRt(undefined)
    void fetchArrivals(STATIONS[station].names.ko).then((r) => alive && setRt(r))
    return () => {
      alive = false
    }
  }, [station])

  const p = useMemo(
    () =>
      resolved && station && lineSel && toward
        ? planBoarding({ station, line: lineSel, toward, distanceM: resolved.distanceM, mode, walkSpeed: s.walkSpeed, now, delayMin, route: fb ? route : null, mustCatch: must, bufferMin: s.safetyBuffer, crowdMin: CROWD_EXTRA[crowd?.level ?? 0] })
        : null,
    [resolved, station, lineSel, toward, mode, s.walkSpeed, now, delayMin, fb, route, must, s.safetyBuffer, crowd?.level],
  )

  // 대체 경로 (같은 출발·도착, 다른 경로)
  const alts = useMemo(() => (route ? findRoutes(route.from, route.to, s.settings, s.disruptions).filter((r) => r.signature !== route.signature).slice(0, 2) : []), [route, s.settings, s.disruptions])

  const watching = s.boardingWatch && p && s.boardingWatch.station === station && s.boardingWatch.line === lineSel && s.boardingWatch.toward === toward
  const secsToTrain = p ? Math.max(0, Math.round((p.catchable.at.getTime() - now.getTime()) / 1000)) : 0
  const secsToLeave = p ? Math.round((p.leaveBy.getTime() - now.getTime()) / 1000) : 0

  const start = (r: Route) => {
    s.startJourney(r, ctx.source === 'appt' && ctx.apptId ? { apptId: ctx.apptId, leg: 'go' } : undefined)
    s.setMoveTab('track')
    s.setTab('move')
    s.notify({ title: t('notice.started'), body: `${stationName(r.from)} → ${stationName(r.to)} · ${t('unit.min', { n: r.totalMin })}`, tone: 'info' }, { silent: true })
  }

  return (
    <div className="safe-top absolute inset-0 flex flex-col bg-white">
      <ScreenHeader title={t('dep.title')} />
      <div className="no-scrollbar flex-1 overflow-y-auto pb-8">
        {/* 연결된 경로 */}
        {route ? (
          <button type="button" onClick={() => s.setTab('route')} className="mx-4 flex w-[calc(100%-2rem)] items-center gap-3 rounded-2xl border border-line px-4 py-3 text-left">
            <TrainFront size={20} className="shrink-0 text-brand" />
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-semibold text-ink-2">{ctx.source === 'journey' ? t('dep.ctxJourney') : ctx.source === 'appt' ? t('dep.ctxAppt', { a: ctx.title ?? '' }) : t('dep.ctxSearch')}</p>
              <p className="truncate text-[15px] font-bold">
                {stationName(route.from)} → {stationName(route.to)} <span className="font-semibold text-ink-2">· {t('unit.min', { n: route.totalMin })}</span>
              </p>
            </div>
            <span className="shrink-0 text-[13px] font-semibold text-brand">{t('dep.changeRoute')}</span>
          </button>
        ) : (
          <button type="button" onClick={() => s.setTab('route')} className="mx-4 flex w-[calc(100%-2rem)] items-center gap-3 rounded-2xl bg-sub px-4 py-3 text-left">
            <Search size={19} className="shrink-0 text-ink-2" />
            <span className="flex-1 text-[14px] text-ink-2">{t('dep.noRoute')}</span>
            <ChevronRight size={18} className="text-ink-2" />
          </button>
        )}

        {/* 모드 */}
        <div className="mt-4 px-4">
          <Segmented
            value={s.departMode}
            onChange={(v) => s.patch({ departMode: v })}
            options={[
              { value: 'normal', label: t('dep.modeNormal') },
              { value: 'must', label: t('dep.modeMust') },
            ]}
          />
          <p className="mt-1.5 px-1 text-[12px] leading-relaxed text-ink-2">{must ? t('dep.modeMustDesc', { n: s.safetyBuffer }) : t('dep.modeNormalDesc')}</p>
        </div>

        {/* 출발지 */}
        <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto px-4">
          <button
            type="button"
            onClick={() => (setOrigin({ kind: 'current' }), s.withLocation(locate))}
            className={`flex h-10 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[14px] font-semibold ${origin.kind === 'current' ? 'bg-brand text-white' : 'border border-line'}`}
          >
            <LocateFixed size={15} /> {t('dep.current')}
          </button>
          {routeStation && (
            <button type="button" onClick={() => setOrigin({ kind: 'station' })} className={`flex h-10 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[14px] font-semibold ${origin.kind === 'station' ? 'bg-brand text-white' : 'border border-line'}`}>
              <MapPin size={15} /> {t('dep.atStationOf', { s: stationName(routeStation) })}
            </button>
          )}
          {s.places.map((pl) => {
            const Icon = KIND_ICON[pl.kind]
            const on = origin.kind === 'place' && origin.id === pl.id
            return (
              <button key={pl.id} type="button" onClick={() => setOrigin({ kind: 'place', id: pl.id })} className={`flex h-10 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[14px] font-semibold ${on ? 'bg-brand text-white' : 'border border-line'}`}>
                <Icon size={15} /> {placeLabel(pl, t)}
                {pl.example && <span className={`text-[11px] ${on ? 'text-white/80' : 'text-ink-2'}`}>{t('data.demo')}</span>}
              </button>
            )
          })}
          <button type="button" onClick={() => setAdding(true)} className="flex h-10 shrink-0 items-center gap-1 rounded-full border border-dashed border-[#C5CBD6] px-3.5 text-[14px] font-semibold text-ink-2">
            <Plus size={15} /> {t('dep.addPlace')}
          </button>
        </div>

        {origin.kind === 'current' && !resolved && (
          <div className="mx-4 mt-3 rounded-xl bg-sub px-4 py-3 text-[13px] leading-relaxed text-ink-2">
            {geo.status === 'locating' ? t('geo.locating') : geo.status === 'denied' || geo.status === 'unavailable' ? t('geo.denied') : t('dep.needLocation')}
            {geo.status !== 'locating' && (
              <button type="button" onClick={() => s.withLocation(locate)} className="mt-2 block h-9 rounded-lg bg-white px-3 text-[13px] font-bold text-brand">
                {t('place.useLocation')}
              </button>
            )}
          </div>
        )}

        {resolved && station && lineSel && (
          <>
            <div className="mt-3 px-4">
              <div className="flex items-center gap-2 text-[14px]">
                <MapPin size={16} className="text-brand-2" />
                <span className="font-semibold">{resolved.label}</span>
                <span className="text-ink-2">→</span>
                <span className="font-bold">{stationName(station)}</span>
                <span className="text-ink-2 tabular">· {resolved.distanceM}m</span>
              </div>
              {route && !matchesRoute && <p className="mt-1 text-[12px] text-[#B57714]">{t('dep.otherStation', { s: stationName(routeStation!) })}</p>}
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                {(fb ? [fb.line] : STATIONS[station].lines).map((l) => (
                  <button key={l} type="button" disabled={Boolean(fb)} onClick={() => (setLine(l), setDirIdx(0))} className={`flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold ${l === lineSel ? 'bg-ink text-white' : 'bg-sub'}`}>
                    <LineBadge line={l} size={18} />
                  </button>
                ))}
                {fb ? (
                  <span className="h-9 rounded-full bg-brand-light px-3 text-[13px] leading-9 font-semibold text-brand">{t('dir.toward', { s: stationName(fb.toward) })}</span>
                ) : (
                  dirs.map((d, i) => (
                    <button key={d.next} type="button" onClick={() => setDirIdx(i)} className={`h-9 rounded-full px-3 text-[13px] font-semibold ${i === dirIdx ? 'bg-brand-light text-brand' : 'bg-sub text-ink-2'}`}>
                      {t('dir.toward', { s: stationName(d.toward) })}
                    </button>
                  ))
                )}
              </div>
              <div className="mt-3">
                <Segmented
                  size="sm"
                  value={mode}
                  onChange={setMode}
                  options={[
                    { value: 'walk', label: <span className="inline-flex items-center gap-1"><Footprints size={14} />{t('dep.walk')}</span> },
                    { value: 'bike', label: <span className="inline-flex items-center gap-1"><Bike size={14} />{t('dep.bike')}</span> },
                  ]}
                />
              </div>
              <div className="mt-2 flex items-center gap-1.5">
                <span className="mr-auto flex items-center gap-1 text-[13px] font-semibold whitespace-nowrap text-ink-2">
                  <ShieldCheck size={15} /> {t('dep.buffer')}
                </span>
                {[0, 1, 2, 3].map((n) => (
                  <button key={n} type="button" aria-pressed={s.safetyBuffer === n} onClick={() => s.patch({ safetyBuffer: n })} className={`h-8 min-w-11 rounded-lg px-2 text-[13px] font-bold tabular ${s.safetyBuffer === n ? 'bg-ink text-white' : 'bg-sub text-ink-2'}`}>
                    {t('unit.min', { n })}
                  </button>
                ))}
              </div>
            </div>

            {p && (
              <>
                {now.getHours() >= 1 && now.getHours() < 5 && <p className="mx-4 mt-4 rounded-xl bg-[#FDF6DC] px-4 py-3 text-[13px] font-semibold text-[#8A6A00]">{t('dep.offHours')}</p>}
                <div className="mx-4 mt-4 rounded-2xl bg-sub p-5 text-center" aria-live="polite">
                  <p className={`text-[20px] leading-snug font-extrabold ${STATUS_TONE[p.status]}`}>{t(STATUS_TEXT[p.status])}</p>
                  {p.status === 'hurry' && <p className="mt-1 text-[13px] font-semibold text-ink-2">{t('dep.noRun')}</p>}
                  <p className="mt-3 text-[13px] text-ink-2">{t('dep.leaveBy')}</p>
                  <p className="text-[40px] leading-none font-extrabold text-brand tabular">{formatClock(p.leaveBy)}</p>
                  <p className="mt-1 text-[13px] font-semibold text-ink-2 tabular">{secsToLeave > 0 ? t('dep.leaveIn', { t: formatMMSS(secsToLeave) }) : t('dep.leaveNow')}</p>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-left">
                    <div className="rounded-xl bg-white px-3 py-2.5">
                      <p className="text-[12px] text-ink-2">{t('dep.target')}</p>
                      <p className="text-[17px] font-extrabold tabular">
                        {formatClock(p.catchable.at)} <span className="text-[12px] font-semibold text-ink-2">({formatMMSS(secsToTrain)})</span>
                      </p>
                    </div>
                    <div className="rounded-xl bg-white px-3 py-2.5">
                      <p className="text-[12px] text-ink-2">{t('dep.fallback')}</p>
                      <p className="text-[17px] font-extrabold tabular">{p.fallback ? formatClock(p.fallback.at) : '—'}</p>
                    </div>
                  </div>
                  <p className="mt-2 text-[11px] text-ink-2">{t('dep.estNote')}</p>
                </div>

                <div className="mx-4 mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      watching
                        ? s.setBoardingWatch(null)
                        : s.setBoardingWatch({ station, line: lineSel, toward: toward!, distanceM: resolved.distanceM, trainAt: p.catchable.at.toISOString(), leaveBy: p.leaveBy.toISOString(), mustCatch: must, setAt: new Date().toISOString() })
                    }
                    className={`flex h-12 flex-1 items-center justify-center gap-1.5 rounded-xl text-[15px] font-bold ${watching ? 'bg-ink text-white' : 'bg-brand-light text-brand'}`}
                  >
                    {watching ? <BellOff size={18} /> : <Bell size={18} />} {watching ? t('dep.watchOff') : t('dep.watchOn')}
                  </button>
                  {route && (
                    <button type="button" onClick={() => start(route)} className="flex h-12 flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand text-[15px] font-bold text-white">
                      <Navigation size={18} /> {t('dep.startMove')}
                    </button>
                  )}
                </div>
                {watching && s.boardingWatch && <p className="mx-4 mt-1.5 text-[12px] text-ink-2">{t('dep.watching', { t: formatClock(new Date(s.boardingWatch.trainAt)) })}</p>}

                {lineSel && (
                  <div className="mx-4 mt-3">
                    <DelayLine line={lineSel} />
                  </div>
                )}

                {/* 소요시간 분해 */}
                <div className="mx-4 mt-4 rounded-2xl border border-line px-4 py-3">
                  <p className="mb-1.5 text-[14px] font-bold">{t('dep.breakdown2', { n: Math.ceil(p.need) })}</p>
                  {[
                    [t('dep.legEntrance'), p.access.move + p.access.signals, null],
                    [t('dep.legGate'), p.access.entrance + p.access.crowd, crowd],
                    [t('dep.legPlatform'), p.access.platform, null],
                    [t('dep.legBuffer'), p.buffer, null],
                  ].map(([label, m, c]) => (
                    <div key={label as string} className="flex items-center justify-between py-1 text-[14px]">
                      <span className="flex items-center gap-1.5 text-ink-2">
                        {label as string}
                        {c ? <CrowdChip level={(c as NonNullable<typeof crowd>).level} small /> : null}
                      </span>
                      <span className="font-semibold tabular">{t('unit.minDec', { n: (m as number).toFixed(1) })}</span>
                    </div>
                  ))}
                  <p className="mt-1 text-[11px] leading-relaxed text-ink-2">
                    {t('dep.speedNote', { v: s.walkSpeed.toFixed(2) })} · {t('dep.crowdNote')}
                  </p>
                </div>

                {/* 다음 열차 */}
                <div className="mt-5 border-t border-line px-5 pt-4">
                  <div className="mb-2 flex items-center gap-2">
                    <h3 className="text-[15px] font-bold">{t('dep.trains')}</h3>
                    <DataTag kind="estimate" />
                    {delayMin > 0 && <span className="text-[12px] font-semibold text-danger">{t('delay.shifted', { n: delayMin })}</span>}
                  </div>
                  {p.trains.map((tr, i) => {
                    const late = tr.at.getTime() !== tr.scheduled.getTime()
                    const isCatch = tr === p.catchable
                    const tight = tr.margin >= 0 && tr.margin < 1.5
                    return (
                      <div key={i} className={`flex items-center gap-3 border-b border-line py-3 last:border-0 ${isCatch ? 'font-bold' : ''}`}>
                        <span className="w-14 text-[17px] tabular">{formatClock(tr.at)}</span>
                        {late && <span className="text-[12px] text-ink-2 line-through tabular">{formatClock(tr.scheduled)}</span>}
                        <span className="text-[13px] text-ink-2 tabular">{t('dep.inMin', { n: Math.max(0, Math.round((tr.at.getTime() - now.getTime()) / 60000)) })}</span>
                        <span className={`ml-auto text-[13px] ${isCatch ? 'text-brand' : tr.margin < 0 ? 'text-[#A3AAB8]' : tight ? 'text-[#B57714]' : 'text-ok'}`}>
                          {isCatch ? t('dep.recommended') : tr.margin < 0 ? t('dep.missed') : tight ? t('dep.tight') : t('dep.catchable')}
                        </span>
                      </div>
                    )
                  })}
                </div>

                {/* 대체 경로 */}
                {alts.length > 0 && (
                  <div className="mt-4 px-5">
                    <h3 className="mb-1 text-[15px] font-bold">{t('dep.alts')}</h3>
                    {alts.map((r) => {
                      const b = firstBoarding(r)
                      const ap = planBoarding({ station: b.station, line: b.line, toward: b.toward, distanceM: b.station === station ? resolved.distanceM : 0, mode, walkSpeed: s.walkSpeed, now, delayMin: s.statusOf(b.line).delayMin, mustCatch: must, bufferMin: s.safetyBuffer })
                      return (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => {
                            if (s.query && s.query.from === r.from && s.query.to === r.to) s.setSelectedId(r.id)
                            else if (s.search(r.from, r.to)) s.setSelectedId(r.id)
                          }}
                          className="flex w-full items-center gap-2 border-b border-line py-3 text-left last:border-0"
                        >
                          <div className="flex shrink-0 gap-0.5">
                            {r.segments.map((g, i) => (
                              <LineBadge key={i} line={g.line} size={18} />
                            ))}
                          </div>
                          <span className="text-[14px] font-bold tabular">{t('unit.min', { n: r.totalMin })}</span>
                          <span className="text-[12px] text-ink-2">· {t('route.transfers', { n: r.transferCount })}</span>
                          <span className="ml-auto text-[12px] text-ink-2 tabular">{t('dep.altTrain', { t: formatClock(ap.catchable.at) })}</span>
                        </button>
                      )
                    })}
                  </div>
                )}

                <div className="mt-4 px-5">
                  <div className="mb-1 flex items-center gap-2">
                    <h3 className="text-[15px] font-bold">{t('dep.realtime')}</h3>
                    {rt && <DataTag kind="realtime" at={now} />}
                  </div>
                  {rt === undefined && <p className="text-[13px] text-ink-2">{t('common.loading')}</p>}
                  {rt === null && <p className="text-[13px] leading-relaxed text-ink-2">{t('dep.realtimeOff')}</p>}
                  {rt &&
                    rt.slice(0, 6).map((a, i) => (
                      <p key={i} className="py-1 text-[14px]">
                        {a.destination} {t('dir.bound')} · <span className="font-semibold">{a.message}</span>
                      </p>
                    ))}
                </div>
              </>
            )}
          </>
        )}
        {!resolved && origin.kind !== 'current' && <p className="px-5 py-12 text-center text-[15px] text-ink-2">{t('dep.empty')}</p>}
        {!route && resolved && (
          <div className="mx-4 mt-4">
            <PrimaryButton tone="light" onClick={() => s.setTab('route')}>
              <Search size={18} /> {t('dep.searchFirst')}
            </PrimaryButton>
          </div>
        )}
      </div>
      <AddPlace open={adding} onClose={() => setAdding(false)} onAdded={(id) => setOrigin({ kind: 'place', id })} />
    </div>
  )
}
