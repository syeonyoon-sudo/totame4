import { useMemo, useState } from 'react'
import { ArrowUpDown, CableCar, ChevronRight, Clock, Footprints, Globe, LocateFixed, Map as MapIcon, MapPin, Navigation, Route as RouteIcon, Star, TriangleExclamationPoint, Users, X } from 'lucide-react'
import { DelayLine } from '../components/DelayLine'
import { hasIndoor } from '../data/indoor'
import type { LineId } from '../data/network'
import AdSlot from '../components/AdSlot'
import BottomSheet from '../components/BottomSheet'
import SubwayMap from '../components/SubwayMap'
import { StationPicker } from '../components/Overlays'
import { CrowdChip, DataTag, LineBadge } from '../components/ui'
import { STATIONS, STATION_LINES, getTransfer } from '../data/network'
import { getLang, stationName, t } from '../i18n'
import { stationCongestion } from '../lib/congestion'
import { nearestStations, useGeo } from '../lib/geo'
import { routeStops } from '../lib/routing'
import { exitsOf, mapLinks, openMap } from '../services/maps'
import { useStore } from '../state/store'
import { DepartureSummary } from './SmartDeparture'

export default function HomeScreen() {
  const s = useStore()
  const [sheet, setSheet] = useState(0)
  const [sheetH, setSheetH] = useState(240)
  const [picker, setPicker] = useState<null | 'from' | 'to'>(null)
  const [picked, setPicked] = useState<string | null>(null)
  const { geo, locate, xy } = useGeo()

  const nearby = useMemo(() => nearestStations(geo.lat, geo.lon, 4), [geo.lat, geo.lon])
  const journeyRoute = s.journeyRoute
  const stops = journeyRoute ? routeStops(journeyRoute) : []
  const curStop = s.journey ? stops[s.journey.index] : undefined

  const goSearch = (from: string, to: string) => {
    if (s.search(from, to)) s.setTab('route')
  }

  const shortcuts = [
    { label: t('home.sc.route'), Icon: RouteIcon, run: () => s.setTab('route') },
    { label: t('home.sc.where'), Icon: Navigation, run: () => (s.setMoveTab('track'), s.setTab('move')) },
    { label: t('home.sc.crowd'), Icon: Users, run: () => s.openPage({ kind: 'crowd' }) },
    { label: t('home.sc.foreign'), Icon: Globe, run: () => s.openPage({ kind: 'foreign' }) },
  ]

  // 운행 정보를 보여줄 노선: 이동 중 경로 → 등록 출발지 → 즐겨찾는 역
  const statusLines = [
    ...(journeyRoute?.segments.map((g) => g.line) ?? []),
    ...s.places.flatMap((p) => STATIONS[p.station]?.lines.slice(0, 1) ?? []),
    ...s.favorites.flatMap((f) => STATIONS[f]?.lines.slice(0, 1) ?? []),
  ].filter((l, i, a) => a.indexOf(l) === i).slice(0, 3) as LineId[]
  const MAJOR = ['이대', '신촌', '홍대입구', '강남', '잠실', '서울', '시청', '고속터미널']

  const focus = journeyRoute ? journeyRoute.segments.flatMap((g) => g.stations) : nearby.map((n) => n.st.id)

  return (
    <div className="absolute inset-0">
      <SubwayMap
        routes={journeyRoute ? [journeyRoute] : []}
        selectedId={journeyRoute?.id}
        focus={focus}
        fitKey={`home-${journeyRoute?.id ?? 'none'}-${geo.real ? `${geo.lat.toFixed(3)}` : 'demo'}`}
        topInset={170}
        bottomInset={sheetH}
        currentStation={curStop?.station}
        highlightStation={picked}
        user={xy}
        issueStations={s.disruptions.flatMap((d) => ('station' in d ? [d.station] : []))}
        onStationTap={(id) => {
          setPicked(id)
          setSheet(1)
        }}
      />

      {/* 상단: 브랜드 + 검색 */}
      <div className="safe-top pointer-events-none absolute inset-x-0 top-0 z-10">
        <div className="pointer-events-auto px-4 pt-2">
          <div className="mb-2 flex items-center justify-between px-1">
            <span className="flex items-baseline gap-1.5">
              <span className="text-[19px] font-extrabold tracking-tight text-brand">{t('brand')}</span>
              {s.lang === 'ko' && <span className="text-[11px] font-bold tracking-wide text-brand-2">TOTA:ME</span>}
            </span>
            {s.disruptions.length > 0 && (
              <button type="button" onClick={() => (s.setMoveTab('disruption'), s.setTab('move'))} className="flex h-8 items-center gap-1 rounded-full bg-danger px-3 text-[12px] font-bold text-white">
                <TriangleExclamationPoint size={14} /> {t('home.disruptions', { n: s.disruptions.length })}
              </button>
            )}
          </div>
          <div className="flex rounded-2xl bg-white shadow-[0_3px_14px_rgba(34,43,58,0.14)]">
            <div className="min-w-0 flex-1">
              <button type="button" onClick={() => setPicker('from')} className="flex h-[50px] w-full items-center gap-3 pl-4 text-left">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full border-[2.5px] border-brand-2" />
                <span className="truncate text-[16px] font-semibold">{s.from ? stationName(s.from) : t('field.from')}</span>
              </button>
              <div className="ml-10 h-px bg-line" />
              <button type="button" onClick={() => setPicker('to')} className="flex h-[50px] w-full items-center gap-3 pl-4 text-left">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-brand" />
                <span className={`truncate text-[16px] ${s.to ? 'font-semibold' : 'text-[#A3AAB8]'}`}>{s.to ? stationName(s.to) : t('home.toPlaceholder')}</span>
              </button>
            </div>
            <button
              type="button"
              aria-label={t('common.swap')}
              onClick={() => {
                const f = s.from
                s.setFrom(s.to)
                s.setTo(f)
              }}
              className="flex w-14 items-center justify-center text-ink-2"
            >
              <ArrowUpDown size={20} />
            </button>
          </div>
        </div>
      </div>

      <BottomSheet
        snaps={[240, 0.56, 0.9]}
        index={sheet}
        onIndexChange={setSheet}
        onHeightChange={setSheetH}
        header={
          s.journey && curStop && !s.journey.arrived ? (
            <button type="button" onClick={() => (s.setMoveTab('track'), s.setTab('move'))} className="mx-4 mb-2 flex w-[calc(100%-2rem)] items-center gap-3 rounded-2xl bg-brand px-4 py-3 text-left text-white">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-70" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-white" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[12px] opacity-80">{t('home.moving', { s: stationName(journeyRoute!.to) })}</p>
                <p className="truncate text-[15px] font-bold">{t('home.movingNow', { s: stationName(curStop.station), n: stops.length - 1 - s.journey.index })}</p>
              </div>
              <ChevronRight size={20} />
            </button>
          ) : null
        }
      >
        {picked ? (
          <StationDetail
            id={picked}
            onClose={() => setPicked(null)}
            onFrom={() => {
              s.setFrom(picked)
              setPicked(null)
              if (s.to && s.to !== picked) goSearch(picked, s.to)
            }}
            onTo={() => {
              s.setTo(picked)
              setPicked(null)
              if (s.from && s.from !== picked) goSearch(s.from, picked)
            }}
          />
        ) : (
          <>
            {/* 스마트 출발 도우미 */}
            {s.foreignMode && (
              <div className="mx-4 mb-2 rounded-2xl border border-brand/30 px-4 py-3">
                <p className="flex items-center gap-1.5 text-[13px] font-bold text-brand">
                  <Globe size={15} /> Foreign Mode
                </p>
                <div className="mt-2 flex gap-1.5">
                  {(['card', 'transfer', 'sights', 'emergency'] as const).map((sec) => (
                    <button key={sec} type="button" onClick={() => s.openPage({ kind: 'foreign', section: sec })} className="h-9 flex-1 rounded-lg bg-brand-light px-1 text-[12px] font-bold text-brand">
                      {t(`fx.${sec}` as 'fx.card')}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <DepartureSummary onOpen={() => s.setTab('depart')} />

            <div className="grid grid-cols-4 px-3 pt-1 pb-2">
              {shortcuts.map(({ label, Icon, run }) => (
                <button key={label} type="button" onClick={run} className="flex flex-col items-center gap-1.5 rounded-xl py-2 active:bg-sub">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-light text-brand">
                    <Icon size={22} strokeWidth={2.1} />
                  </span>
                  <span className="text-center text-[12px] leading-tight font-semibold">{label}</span>
                </button>
              ))}
            </div>

            {statusLines.length > 0 && (
              <div className="px-4 pb-2">
                <p className="mb-1.5 px-1 text-[13px] font-bold text-ink-2">{t('home.service')}</p>
                <div className="space-y-1.5">
                  {statusLines.map((l) => (
                    <DelayLine key={l} line={l} />
                  ))}
                </div>
              </div>
            )}

            <div className="mt-1 h-2 bg-sub" />
            <div className="flex items-center justify-between px-5 pt-4 pb-2">
              <h2 className="text-[15px] font-bold">{t('home.majorCrowd')}</h2>
              <DataTag kind="estimate" />
            </div>
            <div className="no-scrollbar flex gap-2 overflow-x-auto px-5 pb-1">
              {MAJOR.filter((m) => STATIONS[m]).map((id) => (
                <button key={id} type="button" onClick={() => s.openPage({ kind: 'crowd', station: id })} className="flex shrink-0 flex-col items-start gap-1 rounded-xl border border-line px-3 py-2">
                  <span className="text-[14px] font-bold">{stationName(id)}</span>
                  <CrowdChip level={stationCongestion(id).platform.level} small />
                </button>
              ))}
            </div>

            <div className="mt-3 h-2 bg-sub" />
            <h2 className="px-5 pt-4 pb-1 text-[15px] font-bold">{t('home.recent')}</h2>
            {[...s.favoriteRoutes.map((r) => ({ ...r, fav: true })), ...s.recents.filter((r) => !s.favoriteRoutes.some((f) => f.from === r.from && f.to === r.to)).map((r) => ({ ...r, fav: false }))]
              .filter((r) => STATIONS[r.from] && STATIONS[r.to])
              .slice(0, 5)
              .map((r) => (
                <button key={r.from + r.to} type="button" onClick={() => goSearch(r.from, r.to)} className="flex min-h-[54px] w-full items-center gap-3 border-b border-line px-5 text-left last:border-0 active:bg-sub">
                  {r.fav ? <Star size={17} className="shrink-0 fill-warn text-warn" /> : <Clock size={17} className="shrink-0 text-[#A3AAB8]" />}
                  <span className="flex-1 truncate text-[16px] font-semibold">
                    {stationName(r.from)} <span className="text-ink-2">→</span> {stationName(r.to)}
                  </span>
                  <ChevronRight size={18} className="text-[#C5CBD6]" />
                </button>
              ))}

            {s.favorites.length > 0 && (
              <>
                <h2 className="px-5 pt-4 pb-2 text-[15px] font-bold">{t('fav.stations')}</h2>
                <div className="no-scrollbar flex gap-2 overflow-x-auto px-5 pb-1">
                  {s.favorites
                    .filter((f) => STATIONS[f])
                    .map((id) => (
                      <button key={id} type="button" onClick={() => setPicked(id)} className="flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-line px-3.5 text-[14px] font-semibold active:bg-sub">
                        <Star size={14} className="fill-warn text-warn" />
                        {stationName(id)}
                      </button>
                    ))}
                </div>
              </>
            )}

            <div className="mt-3 h-2 bg-sub" />
            <div className="flex items-center justify-between px-5 pt-4 pb-1">
              <h2 className="text-[15px] font-bold">{t('home.nearby')}</h2>
              <button type="button" onClick={() => s.withLocation(locate)} className="flex h-8 items-center gap-1 rounded-lg px-2 text-[12px] font-semibold text-brand active:bg-brand-light">
                <LocateFixed size={14} />
                {geo.status === 'locating' ? t('geo.locating') : geo.real ? t('geo.real') : t('geo.useMine')}
              </button>
            </div>
            {(geo.status === 'denied' || geo.status === 'unavailable') && <p className="px-5 pb-1 text-[12px] text-danger">{t('geo.denied')}</p>}
            {!geo.real && <p className="px-5 pb-1 text-[12px] text-ink-2">{t('geo.demoNote')}</p>}
            {nearby.map(({ st, km }) => {
              const c = stationCongestion(st.id)
              return (
                <button key={st.id} type="button" onClick={() => setPicked(st.id)} className="flex min-h-[56px] w-full items-center gap-3 border-b border-line px-5 text-left last:border-0 active:bg-sub">
                  <MapPin size={18} className="shrink-0 text-brand-2" />
                  <span className="truncate text-[16px] font-semibold">{stationName(st.id)}</span>
                  <span className="flex shrink-0 gap-1">
                    {STATION_LINES[st.id].map((l) => (
                      <LineBadge key={l} line={l} size={18} />
                    ))}
                  </span>
                  <span className="ml-auto flex shrink-0 flex-col items-end gap-0.5">
                    <CrowdChip level={c.platform.level} small />
                    <span className="text-[12px] text-ink-2 tabular">{t('unit.walkMin', { n: Math.max(1, Math.round((km * 1300) / 72)) })}</span>
                  </span>
                </button>
              )
            })}

            <div className="mt-2 h-2 bg-sub" />
            <AdSlot placement="home_banner" />
            <div className="h-4" />
          </>
        )}
      </BottomSheet>

      <StationPicker
        open={picker !== null}
        title={picker === 'from' ? t('search.from') : t('search.to')}
        exclude={picker === 'from' ? s.to : s.from}
        onClose={() => setPicker(null)}
        onPick={(id) => {
          const which = picker
          setPicker(null)
          if (which === 'from') {
            s.setFrom(id)
            if (s.to) goSearch(id, s.to)
            else s.setTab('route')
          } else {
            s.setTo(id)
            if (s.from) goSearch(s.from, id)
            else s.setTab('route')
          }
        }}
      />
    </div>
  )
}

function StationDetail({ id, onClose, onFrom, onTo }: { id: string; onClose: () => void; onFrom: () => void; onTo: () => void }) {
  const s = useStore()
  const { favorites, patch, disruptions } = s
  const st = STATIONS[id]
  const lines = st.lines
  const fav = favorites.includes(id)
  const pairs: [typeof lines[number], typeof lines[number]][] = []
  lines.forEach((a, i) => lines.slice(i + 1).forEach((b) => pairs.push([a, b])))
  const crowd = stationCongestion(id)
  const exits = exitsOf(id)
  return (
    <div className="pb-6">
      <div className="px-5">
        <div className="flex items-center gap-2 pt-1">
          <h2 className="min-w-0 truncate text-[22px] font-bold">{stationName(id)}</h2>
          <div className="flex shrink-0 flex-wrap gap-1">
            {lines.map((l) => (
              <LineBadge key={l} line={l} size={22} />
            ))}
          </div>
          <button type="button" aria-label={t('fav.add')} onClick={() => patch({ favorites: fav ? favorites.filter((f) => f !== id) : [...favorites, id] })} className="ml-auto flex h-10 w-10 shrink-0 items-center justify-center">
            <Star size={21} className={fav ? 'fill-warn text-warn' : 'text-[#C5CBD6]'} />
          </button>
          <button type="button" aria-label={t('common.close')} onClick={onClose} className="-mr-2 flex h-10 w-10 shrink-0 items-center justify-center text-ink-2">
            <X size={21} />
          </button>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button type="button" onClick={onFrom} className="h-12 rounded-xl border border-brand text-[15px] font-bold text-brand active:bg-brand-light">
            {t('common.from')}
          </button>
          <button type="button" onClick={onTo} className="h-12 rounded-xl bg-brand text-[15px] font-bold text-white active:bg-[#1f2c7a]">
            {t('common.to')}
          </button>
        </div>

        <button
          type="button"
          onClick={() => s.openPage({ kind: 'indoor', station: id })}
          className="mt-4 flex w-full items-center gap-3 rounded-xl bg-brand-light px-4 py-3 text-left"
        >
          <MapIcon size={18} className="text-brand" />
          <span className="text-[14px] font-semibold text-brand">{hasIndoor(id) ? t('in.open') : t('in.noDataShort')}</span>
          {hasIndoor(id) && <DataTag kind="demo" className="ml-auto" />}
          <ChevronRight size={16} className={`${hasIndoor(id) ? '' : 'ml-auto'} text-brand`} />
        </button>
        <button
          type="button"
          onClick={() => s.openPage({ kind: 'crowd', station: id })}
          className="mt-2 flex w-full items-center gap-3 rounded-xl bg-sub px-4 py-3 text-left"
        >
          <Users size={18} className="text-ink-2" />
          <span className="text-[14px] font-semibold">{t('crowd.platform')}</span>
          <CrowdChip level={crowd.platform.level} small />
          <DataTag kind="estimate" at={crowd.platform.basedAt} className="ml-auto" />
          <ChevronRight size={16} className="text-ink-2" />
        </button>

        <h3 className="mt-5 mb-1 text-[14px] font-bold text-ink-2">{t('station.transfers')}</h3>
        {pairs.length === 0 && <p className="py-3 text-[14px] text-ink-2">{t('station.noTransfer')}</p>}
        {pairs.map(([a, b]) => {
          const tr = getTransfer(id, a, b)
          if (!tr) return null
          const broken = disruptions.some((d) => d.kind === 'elevator' && d.station === id && d.lines.includes(a) && d.lines.includes(b))
          const closed = disruptions.some((d) => d.kind === 'passage' && d.station === id && d.lines.includes(a) && d.lines.includes(b))
          return (
            <div key={a + b} className="flex items-center gap-3 border-b border-line py-3 last:border-0">
              <span className="flex shrink-0 items-center gap-0.5">
                <LineBadge line={a} size={20} />
                <span className="text-ink-2">↔</span>
                <LineBadge line={b} size={20} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-semibold">
                  <Footprints size={14} className="mr-1 inline text-ink-2" />
                  {tr.source === 'estimate' ? t('tp.noDataShort') : `${tr.walk}m · ${getLang() === 'ko' ? tr.passage : t('data.demo')}`}
                </p>
                <p className={`text-[13px] ${closed || broken ? 'font-semibold text-danger' : tr.elevator ? 'text-ok' : 'text-[#B57714]'}`}>
                  <CableCar size={13} className="mr-1 inline" />
                  {closed ? t('tp.closed') : broken ? t('tp.elevatorBroken') : tr.source === 'estimate' ? t('tp.facilityUnknown') : `${tr.elevator ? t('station.elevatorOk') : t('tp.hasStairs')} · ${t('station.door', { d: tr.door })}`}
                </p>
              </div>
            </div>
          )
        })}

        <h3 className="mt-5 mb-2 text-[14px] font-bold text-ink-2">{t('station.exits')}</h3>
        <div className="flex flex-wrap gap-1.5">
          {exits.map((e) => (
            <button
              key={e.no}
              type="button"
              onClick={() => openMap(mapLinks('kakao', { name: `${stationName(id)} ${t('exit.no', { n: e.no })}`, lat: e.lat, lon: e.lon }))}
              className="flex h-9 items-center gap-1 rounded-lg border border-line px-2.5 text-[13px] font-semibold active:bg-sub"
            >
              <span className="flex h-5 w-5 items-center justify-center rounded bg-[#F2C230] text-[11px] font-extrabold text-ink">{e.no}</span>
              {t(`dir.${e.dir}` as 'dir.N')}
            </button>
          ))}
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-y-2 text-[13px]">
          <dt className="text-ink-2">{t('station.firstLast')}</dt>
          <dd className="text-right font-semibold">05:30 / 24:00</dd>
          <dt className="text-ink-2">{t('station.code')}</dt>
          <dd className="text-right font-semibold text-ink-2">{t('station.codePending')}</dd>
        </dl>
        <p className="mt-3 text-[12px] leading-relaxed text-ink-2">{t('station.dataNote')}</p>
      </div>
      <AdSlot placement="station_area" seed={id.length} />
    </div>
  )
}
