import { useEffect, useState } from 'react'
import { ArrowUpDown, CableCar, Check, ChevronLeft, ChevronRight, Clock, DoorOpen, Footprints, Map as MapIcon, Navigation, SlidersHorizontal, Star, Users } from 'lucide-react'
import { DelayChip } from '../components/DelayLine'
import { hasIndoor } from '../data/indoor'
import { STATUS_TEXT, STATUS_TONE, firstBoarding, planBoarding } from '../lib/boarding'
import { exitsOf } from '../services/maps'
import { useNow } from './SmartDeparture'
import AdSlot from '../components/AdSlot'
import BottomSheet from '../components/BottomSheet'
import SubwayMap from '../components/SubwayMap'
import TransferPath, { towardOf } from '../components/TransferPath'
import { CRITERION_KEY, ConditionSheet, StationPicker } from '../components/Overlays'
import { CrowdChip, DataTag, LineBadge, PrimaryButton, RouteBar, ScreenHeader, Segmented } from '../components/ui'
import { LINES, STATIONS } from '../data/network'
import { stationName, t, type MessageKey } from '../i18n'
import { carCongestion } from '../lib/congestion'
import { formatClock, towardStation, type ReasonCode, type Route } from '../lib/routing'
import { PACE_PRESETS, paceKey, placeLabel, useStore } from '../state/store'

export const REASON_KEY: Record<ReasonCode, MessageKey> = {
  allEscalator: 'reason.allEscalator',
  fewStairs: 'reason.fewStairs',
  accessible: 'reason.accessible',
  luggage: 'reason.luggage',
  fastest: 'reason.fastest',
  direct: 'reason.direct',
  fewestTransfers: 'reason.fewestTransfers',
  leastWalk: 'reason.leastWalk',
  leastWalkElevator: 'reason.leastWalkElevator',
  allElevator: 'reason.allElevator',
  leastCrowded: 'reason.leastCrowded',
  comfort: 'reason.comfort',
  stairs: 'reason.stairs',
}

export const reasonText = (r: Route, code: ReasonCode) => t(REASON_KEY[code], { n: code === 'stairs' ? r.stairsCount : r.transferCount })

export const PACE_LABEL: Record<string, MessageKey> = { slow: 'pace.slow', normal: 'pace.normal', fast: 'pace.fast' }

export default function RouteScreen() {
  const s = useStore()
  const [editing, setEditing] = useState(!s.query)
  useEffect(() => {
    if (s.query) setEditing(false)
  }, [s.query])

  if (editing || !s.query) return <RouteInput onDone={() => setEditing(false)} />
  return <RouteResults onEdit={() => setEditing(true)} />
}

function RouteInput({ onDone }: { onDone: () => void }) {
  const s = useStore()
  const [picker, setPicker] = useState<null | 'from' | 'to'>(null)
  const [cond, setCond] = useState(false)

  return (
    <div className="safe-top absolute inset-0 flex flex-col bg-white">
      <ScreenHeader
        title={t('route.title')}
        left={
          <button type="button" aria-label={t('common.back')} onClick={() => s.setHomeView('main')} className="flex h-11 w-11 items-center justify-center">
            <ChevronLeft size={26} />
          </button>
        }
      />
      <div className="no-scrollbar flex-1 overflow-y-auto pb-28">
        <div className="mx-4 mt-1 flex rounded-2xl border border-line">
          <div className="min-w-0 flex-1">
            <button type="button" onClick={() => setPicker('from')} className="flex h-[58px] w-full items-center gap-3 pl-4 text-left">
              <span className="w-10 shrink-0 text-[13px] font-semibold text-ink-2">{t('common.from')}</span>
              <span className={`truncate text-[17px] ${s.from ? 'font-bold' : 'text-[#A3AAB8]'}`}>{s.from ? stationName(s.from) : t('field.from')}</span>
            </button>
            <div className="ml-4 h-px bg-line" />
            <button type="button" onClick={() => setPicker('to')} className="flex h-[58px] w-full items-center gap-3 pl-4 text-left">
              <span className="w-10 shrink-0 text-[13px] font-semibold text-ink-2">{t('common.to')}</span>
              <span className={`truncate text-[17px] ${s.to ? 'font-bold' : 'text-[#A3AAB8]'}`}>{s.to ? stationName(s.to) : t('field.to')}</span>
            </button>
          </div>
          <div className="flex items-center pr-2">
            <button
              type="button"
              aria-label={t('common.swap')}
              onClick={() => {
                const f = s.from
                s.setFrom(s.to)
                s.setTo(f)
              }}
              className="flex h-11 w-11 items-center justify-center rounded-full border border-line bg-white text-ink active:bg-sub"
            >
              <ArrowUpDown size={19} />
            </button>
          </div>
        </div>

        <button type="button" onClick={() => setCond(true)} className="mt-6 flex w-full items-center gap-3 px-5 text-left">
          <SlidersHorizontal size={19} className="text-brand" />
          <span className="text-[15px] font-bold">{t('crit.title')}</span>
          <span className="ml-auto text-[13px] font-semibold text-brand">{t('common.change')}</span>
          <ChevronRight size={17} className="-ml-2 text-brand" />
        </button>
        <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto px-5">
          {s.priorities.length ? (
            s.priorities.map((p, i) => (
              <button key={p} type="button" onClick={() => setCond(true)} className="flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-brand-light pr-3.5 pl-1.5 text-[14px] font-semibold text-brand">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand text-[12px] text-white tabular">{i + 1}</span>
                {t(CRITERION_KEY[p])}
              </button>
            ))
          ) : (
            <button type="button" onClick={() => setCond(true)} className="h-9 rounded-full border border-dashed border-[#C5CBD6] px-4 text-[14px] text-ink-2">
              {t('crit.none')}
            </button>
          )}
        </div>

        <div className="mt-6 px-5">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[15px] font-bold">{t('pace.title')}</span>
            <span className="text-[13px] text-ink-2 tabular">
              {s.walkSpeed.toFixed(2)} m/s{s.measured ? ` · ${t('pace.measured')}` : ''}
            </span>
          </div>
          <Segmented
            value={paceKey(s.walkSpeed)}
            options={PACE_PRESETS.map((p) => ({ value: p.key, label: t(PACE_LABEL[p.key]) }))}
            onChange={(k) => s.patch({ walkSpeed: PACE_PRESETS.find((p) => p.key === k)!.speed, measured: false })}
          />
          <p className="mt-2 text-[13px] text-ink-2">{t('pace.hint')}</p>
        </div>

        {s.favorites.length > 0 && (
          <>
            <p className="px-5 pt-7 pb-2 text-[15px] font-bold">{t('fav.stations')}</p>
            <div className="no-scrollbar flex gap-2 overflow-x-auto px-5">
              {s.favorites
                .filter((f) => STATIONS[f])
                .map((id) => (
                  <button key={id} type="button" onClick={() => (s.from && s.from !== id ? s.setTo(id) : s.setFrom(id))} className="flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-line px-3.5 text-[14px] font-semibold active:bg-sub">
                    <Star size={14} className="fill-warn text-warn" />
                    {stationName(id)}
                  </button>
                ))}
            </div>
          </>
        )}

        <p className="px-5 pt-7 pb-1 text-[15px] font-bold">{t('search.recent')}</p>
        {s.recents
          .filter((r) => STATIONS[r.from] && STATIONS[r.to])
          .map((r) => (
            <button
              key={r.from + r.to}
              type="button"
              onClick={() => {
                s.setFrom(r.from)
                s.setTo(r.to)
              }}
              className="flex h-[52px] w-full items-center gap-3 px-5 text-left active:bg-sub"
            >
              <Clock size={17} className="text-[#A3AAB8]" />
              <span className="text-[15px] font-medium">
                {stationName(r.from)} → {stationName(r.to)}
              </span>
            </button>
          ))}
      </div>

      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-white via-white to-white/0 px-4 pt-6 pb-3">
        <PrimaryButton
          disabled={!s.from || !s.to || s.from === s.to}
          onClick={() => {
            if (s.search()) onDone()
          }}
        >
          {t('route.search')}
        </PrimaryButton>
      </div>

      <StationPicker
        open={picker !== null}
        title={picker === 'from' ? t('search.from') : t('search.to')}
        exclude={picker === 'from' ? s.to : s.from}
        onClose={() => setPicker(null)}
        onPick={(id) => {
          if (picker === 'from') s.setFrom(id)
          else s.setTo(id)
          setPicker(null)
        }}
      />
      <ConditionSheet open={cond} onClose={() => setCond(false)} />
    </div>
  )
}

function RouteResults({ onEdit }: { onEdit: () => void }) {
  const s = useStore()
  const [sheet, setSheet] = useState(1)
  const [sheetH, setSheetH] = useState(400)
  const q = s.query!
  const selected = s.selectedRoute
  const now = new Date()
  const fav = s.favoriteRoutes.some((r) => r.from === q.from && r.to === q.to)

  const start = (r: Route) => {
    s.startJourney(r)
    s.setMoveTab('track')
    s.setTab('move')
    s.notify({ title: t('notice.started'), body: `${stationName(r.from)} → ${stationName(r.to)} · ${t('unit.min', { n: r.totalMin })}`, tone: 'info' }, { silent: true })
  }

  return (
    <div className="absolute inset-0">
      <SubwayMap
        routes={s.routes}
        selectedId={selected?.id}
        focus={s.routes.flatMap((r) => r.segments.flatMap((g) => g.stations))}
        fitKey={`res-${q.from}-${q.to}-${sheet === 2 ? 'full' : 'half'}`}
        topInset={110}
        bottomInset={Math.min(sheetH, 460)}
        showUser={false}
        issueStations={s.disruptions.flatMap((d) => ('station' in d ? [d.station] : []))}
        onRouteTap={(id) => s.setSelectedId(id)}
      />

      <div className="safe-top absolute inset-x-0 top-0 z-10 px-3 pt-2">
        <div className="flex h-[52px] items-center rounded-2xl bg-white pr-1 shadow-[0_3px_14px_rgba(34,43,58,0.14)]">
          <button type="button" aria-label={t('common.back')} onClick={onEdit} className="flex h-full w-11 shrink-0 items-center justify-center">
            <ChevronLeft size={24} />
          </button>
          <button type="button" onClick={onEdit} className="flex min-w-0 flex-1 items-center gap-2 text-left">
            <span className="truncate text-[16px] font-bold">{stationName(q.from)}</span>
            <span className="text-ink-2">→</span>
            <span className="truncate text-[16px] font-bold">{stationName(q.to)}</span>
          </button>
          <button
            type="button"
            aria-label={t('fav.route')}
            onClick={() => s.patch({ favoriteRoutes: fav ? s.favoriteRoutes.filter((r) => !(r.from === q.from && r.to === q.to)) : [{ from: q.from, to: q.to }, ...s.favoriteRoutes] })}
            className="flex h-10 w-10 items-center justify-center rounded-full active:bg-sub"
          >
            <Star size={19} className={fav ? 'fill-warn text-warn' : 'text-[#A3AAB8]'} />
          </button>
          <button type="button" aria-label={t('common.swap')} onClick={() => s.search(q.to, q.from, q.priorities)} className="flex h-10 w-10 items-center justify-center rounded-full text-ink-2 active:bg-sub">
            <ArrowUpDown size={19} />
          </button>
        </div>
      </div>

      <BottomSheet
        snaps={[170, 0.56, 0.92]}
        index={sheet}
        onIndexChange={setSheet}
        onHeightChange={setSheetH}
        header={
          <div className="px-5 pb-3">
            <div className="flex items-center gap-2">
              <h2 className="text-[17px] font-bold">{t('route.results', { n: s.routes.length })}</h2>
              <DataTag kind="estimate" />
              <button type="button" onClick={onEdit} className="ml-auto text-[13px] font-semibold text-brand">
                {t('crit.change')}
              </button>
            </div>
            <p className="mt-1 truncate text-[13px] text-ink-2">
              {q.priorities.length ? q.priorities.map((p, i) => `${i + 1}. ${t(CRITERION_KEY[p])}`).join('  ') : t('crit.fast')} · {t('pace.short', { p: t(PACE_LABEL[paceKey(s.walkSpeed)]) })}
              {s.wheelchair ? ` · ${t('acc.wheelchairShort')}` : ''}
            </p>
          </div>
        }
        footer={
          selected && (
            <div className="shrink-0 border-t border-line bg-white px-4 pt-2.5 pb-2.5">
              <PrimaryButton onClick={() => start(selected)}>
                <Navigation size={19} /> {t('route.start')}
              </PrimaryButton>
            </div>
          )
        }
      >
        {s.routes.length === 0 && <p className="px-5 py-10 text-center text-[15px] text-ink-2">{t('route.none')}</p>}
        {selected && <RouteDeparture route={selected} />}
        <div className="border-t border-line">
          {s.routes.map((r) => {
            const sel = r.id === selected?.id
            const arrive = new Date(now.getTime() + r.totalMin * 60000)
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => (sel ? setSheet(2) : s.setSelectedId(r.id))}
                className={`relative block w-full border-b border-line px-5 py-4 text-left transition-colors ${sel ? 'bg-[#F5F8FE]' : 'active:bg-sub'}`}
              >
                {sel && <span className="absolute inset-y-0 left-0 w-1 bg-brand" />}
                <div className="flex items-center gap-2">
                  {r.recommended && <span className="rounded-md bg-brand px-1.5 py-0.5 text-[12px] font-bold text-white">{t('route.recommended')}</span>}
                  <span className="text-[24px] leading-none font-extrabold tabular">{r.totalMin}</span>
                  <span className="-ml-1 text-[16px] font-bold">{t('unit.minShort')}</span>
                  <span className="ml-auto text-[13px] text-ink-2 tabular">{t('route.arrive', { t: formatClock(arrive) })}</span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[14px] text-ink-2">
                  <span>{t('route.transfers', { n: r.transferCount })}</span>
                  <span className="text-line">|</span>
                  <span>{t('route.walk', { m: r.walkM, n: r.walkMin })}</span>
                  <span className="text-line">|</span>
                  <span className={`flex items-center gap-0.5 font-semibold ${r.elevatorOk ? 'text-ok' : 'text-[#B57714]'}`}>
                    <CableCar size={14} />
                    {r.elevatorOk ? t('route.elevatorOk') : t('reason.stairs', { n: r.stairsCount })}
                  </span>
                  <CrowdChip level={r.congestionLevel} small />
                  <DelayChip lines={[...new Set(r.segments.map((g) => g.line))]} />
                </div>
                <div className="mt-3">
                  <RouteBar route={r} faded={!sel} />
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-1 text-[13px] text-ink-2">
                  {r.segments.map((g, i) => (
                    <span key={i} className="flex items-center gap-1">
                      {i > 0 && <ChevronRight size={12} className="text-[#C5CBD6]" />}
                      {stationName(g.stations[0])}
                    </span>
                  ))}
                  <ChevronRight size={12} className="text-[#C5CBD6]" />
                  {stationName(r.to)}
                </div>
                {(() => {
                  const ex = exitsOf(r.to).find((e) => e.elevator) ?? exitsOf(r.to)[0]
                  return ex ? (
                    <p className="mt-1.5 flex items-center gap-1 text-[12px] text-ink-2">
                      <DoorOpen size={13} /> {t('route.exit', { n: ex.no })}
                      {ex.elevator && <CableCar size={12} className="text-ok" />} · {t('data.demo')}
                    </p>
                  ) : null
                })()}
                {r.reasons.length > 0 && (
                  <p className={`mt-2 flex items-start gap-1 text-[13px] font-semibold ${r.recommended ? 'text-brand' : 'text-ink'}`}>
                    <Check size={15} className="mt-px shrink-0" />
                    {r.reasons.map((c) => reasonText(r, c)).join(' · ')}
                  </p>
                )}
              </button>
            )
          })}
        </div>

        {selected && <RouteDetail route={selected} />}
        <AdSlot placement="route_bottom" />
        <div className="h-3" />
      </BottomSheet>
    </div>
  )
}

export function RouteDetail({ route }: { route: Route }) {
  const s = useStore()
  const first = route.segments[0]
  const cars = carCongestion(first.stations[0], first.line, new Date(), towardStation(route, first.stations[0], first.line))
  return (
    <div className="px-5 pt-5 pb-2">
      <h3 className="mb-3 text-[15px] font-bold">{t('route.detail')}</h3>
      <button
        type="button"
        onClick={() => s.openPage({ kind: 'crowd', station: first.stations[0] })}
        className="mb-4 flex w-full items-center gap-2 rounded-xl border border-line px-4 py-3 text-left"
      >
        <Users size={17} className="text-brand" />
        <span className="text-[14px] font-semibold">{t('route.bestCar', { n: cars.best })}</span>
        <DataTag kind="estimate" className="ml-auto" />
        <ChevronRight size={16} className="text-ink-2" />
      </button>
      {route.segments.map((g, i) => {
        const tr = route.transfers[i - 1]
        return (
          <div key={i}>
            {tr && (
              <div className="my-3 rounded-2xl bg-sub p-4">
                <p className="mb-3 text-[14px] font-bold">
                  {t('route.transferAt', { s: stationName(tr.station), n: Math.round(tr.seconds / 60) })}
                  <span className="ml-1 font-medium text-ink-2">{t('pace.basis', { v: s.walkSpeed.toFixed(1) })}</span>
                </p>
                <TransferPath step={tr} route={route} speed={s.walkSpeed} />
                {hasIndoor(tr.station) && (
                  <button type="button" onClick={() => s.openPage({ kind: 'indoor', station: tr.station })} className="mt-3 flex h-9 items-center gap-1 rounded-lg bg-white px-3 text-[13px] font-bold text-brand">
                    <MapIcon size={14} /> {t('in.open')}
                  </button>
                )}
              </div>
            )}
            <div className="flex gap-3">
              <div className="flex flex-col items-center">
                <LineBadge line={g.line} size={26} />
                <span className="my-1 w-[3px] flex-1 rounded-full" style={{ background: LINES[g.line].color }} />
              </div>
              <div className="min-w-0 flex-1 pb-2">
                <p className="text-[16px] font-bold">{stationName(g.stations[0])}</p>
                <p className="text-[13px] text-ink-2">
                  {towardOf(route, g.stations[0], g.line)} · {t('route.stops', { n: g.stations.length - 1 })} · {t('unit.min', { n: Math.round(g.minutes) })}
                </p>
                <p className="mt-2 text-[16px] font-bold">{stationName(g.stations[g.stations.length - 1])}</p>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/** 경로 화면의 스마트 출발 — 홈과 같은 계산 로직 */
function RouteDeparture({ route }: { route: Route }) {
  const s = useStore()
  const now = useNow(5000)
  const b = firstBoarding(route)
  const place = s.places.find((p) => p.station === b.station)
  const distanceM = place?.distanceM ?? 0
  const p = planBoarding({ station: b.station, line: b.line, toward: b.toward, distanceM, mode: 'walk', walkSpeed: s.walkSpeed, now, delayMin: s.statusOf(b.line).delayMin, route, mustCatch: s.departMode === 'must', bufferMin: s.safetyBuffer })
  return (
    <button type="button" onClick={() => s.setTab('depart')} className="mx-4 mb-3 block w-[calc(100%-2rem)] rounded-2xl bg-brand-light px-4 py-3 text-left">
      <p className="flex items-center gap-1.5 text-[12px] font-semibold text-brand">
        <Footprints size={14} /> {place ? t('route.depFrom', { p: placeLabel(place, t), m: distanceM }) : t('route.depAtStation', { s: stationName(b.station) })}
        <ChevronRight size={14} className="ml-auto" />
      </p>
      <p className={`mt-1 text-[15px] font-bold ${STATUS_TONE[p.status]}`}>{t(STATUS_TEXT[p.status])}</p>
      <p className="text-[12px] text-ink-2">{t('dep.summary', { train: formatClock(p.catchable.at), leave: formatClock(p.leaveBy) })}</p>
    </button>
  )
}
