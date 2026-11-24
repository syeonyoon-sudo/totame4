import { useMemo, useRef, useState, type ReactNode } from 'react'
import {
  Camera,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Luggage,
  MapPinned,
  Moon,
  Phone,
  Repeat,
  Route as RouteIcon,
  Siren,
  Volume2,
  X,
} from 'lucide-react'
import { StationPicker } from '../components/Overlays'
import { DataTag, LineBadge, PrimaryButton, ScreenHeader } from '../components/ui'
import { ATTRACTIONS, CARD_GUIDE, CLIMATE_PASS, EMERGENCY_NUMBERS, FARE, PHRASES, SIGNS, estimateFare, type Attraction } from '../data/foreign'
import { hasIndoor } from '../data/indoor'
import { LANGS, getLang, lineName, stationName, t, type MessageKey } from '../i18n'
import { speak } from '../lib/notify'
import { findRoutes, formatClock, type Route } from '../lib/routing'
import { towardOf } from '../components/TransferPath'
import { mapLinks, openMap, exitsOf } from '../services/maps'
import { useStore } from '../state/store'
import { STATIONS } from '../data/network'

type Section = 'card' | 'transfer' | 'tour' | 'sights' | 'luggage' | 'night' | 'camera' | 'emergency'

const SECTIONS: { id: Section; key: MessageKey; Icon: typeof CreditCard }[] = [
  { id: 'card', key: 'fx.card', Icon: CreditCard },
  { id: 'transfer', key: 'fx.transfer', Icon: Repeat },
  { id: 'sights', key: 'fx.sights', Icon: MapPinned },
  { id: 'tour', key: 'fx.tour', Icon: RouteIcon },
  { id: 'luggage', key: 'fx.luggage', Icon: Luggage },
  { id: 'night', key: 'fx.night', Icon: Moon },
  { id: 'camera', key: 'fx.camera', Icon: Camera },
  { id: 'emergency', key: 'fx.emergency', Icon: Siren },
]

export default function ForeignMode({ onClose, initial }: { onClose: () => void; initial?: Section }) {
  const s = useStore()
  const [sec, setSec] = useState<Section | null>(initial ?? null)
  const title = sec ? t(SECTIONS.find((x) => x.id === sec)!.key) : t('fx.title')
  return (
    <div className="safe-top anim-fade-up absolute inset-0 z-40 flex flex-col bg-white">
      <ScreenHeader
        title={title}
        left={
          <button type="button" aria-label={t('common.back')} onClick={() => (sec ? setSec(null) : onClose())} className="flex h-11 w-11 items-center justify-center">
            <ChevronLeft size={26} />
          </button>
        }
      />
      <div className="no-scrollbar flex-1 overflow-y-auto pb-8">
        {!sec && (
          <>
            <div className="px-5">
              <p className="text-[22px] leading-tight font-extrabold text-brand">Welcome to Seoul</p>
              <p className="mt-1 text-[14px] text-ink-2">{t('fx.subtitle')}</p>
            </div>
            <div className="mt-4 grid grid-cols-4 gap-2 px-4">
              {LANGS.map((l) => (
                <button key={l.id} type="button" onClick={() => s.patch({ lang: l.id })} className={`h-10 rounded-xl text-[13px] font-semibold ${s.lang === l.id ? 'bg-brand text-white' : 'bg-sub'}`}>
                  {l.label}
                </button>
              ))}
            </div>
            <div className="mt-5 grid grid-cols-2 gap-2 px-4">
              {SECTIONS.map(({ id, key, Icon }) => (
                <button key={id} type="button" onClick={() => setSec(id)} className="flex min-h-[64px] items-center gap-3 rounded-2xl border border-line px-4 text-left active:bg-sub">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-light text-brand">
                    <Icon size={20} />
                  </span>
                  <span className="text-[14px] leading-tight font-bold">{t(key)}</span>
                </button>
              ))}
            </div>
            <div className="mt-5 flex items-center gap-3 px-5">
              <span className="text-[14px] font-semibold">{t('fx.modeToggle')}</span>
              <button type="button" onClick={() => s.patch({ foreignMode: !s.foreignMode })} className={`ml-auto h-9 rounded-full px-4 text-[13px] font-bold ${s.foreignMode ? 'bg-brand text-white' : 'bg-sub text-ink-2'}`}>
                {s.foreignMode ? 'ON' : 'OFF'}
              </button>
            </div>
            <p className="mt-1 px-5 text-[12px] text-ink-2">{t('fx.modeHint')}</p>
          </>
        )}
        {sec === 'card' && <CardSection />}
        {sec === 'transfer' && <TransferHelp />}
        {sec === 'sights' && <Sights />}
        {sec === 'tour' && <TourPlanner />}
        {sec === 'luggage' && <LuggageSection />}
        {sec === 'night' && <NightSection />}
        {sec === 'camera' && <CameraTranslate />}
        {sec === 'emergency' && <Emergency />}
      </div>
    </div>
  )
}

function Card({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <div className="mx-4 mt-3 rounded-2xl border border-line p-4">
      <p className="text-[15px] font-bold">{title}</p>
      <div className="mt-1.5 text-[14px] leading-relaxed text-ink">{children}</div>
    </div>
  )
}

const won = (n: number) => `₩${n.toLocaleString()}`

// ── 교통카드·요금 ─────────────────────────────────────────
function CardSection() {
  const s = useStore()
  const lang = getLang()
  const [from, setFrom] = useState(s.from && STATIONS[s.from] ? s.from : '서울')
  const [to, setTo] = useState('홍대입구')
  const [picker, setPicker] = useState<null | 'from' | 'to'>(null)
  const r = useMemo(() => findRoutes(from, to, { walkSpeed: s.walkSpeed, priorities: ['fast'], wheelchair: false })[0], [from, to, s.walkSpeed])
  const sbd = r?.segments.some((g) => g.line === 'shinbundang')
  return (
    <div>
      <div className="mx-4 rounded-2xl bg-brand-light p-4">
        <div className="flex items-center gap-2">
          <p className="text-[15px] font-bold text-brand">{t('fx.fares')}</p>
          <span className="ml-auto text-[11px] text-ink-2">
            {FARE.source[lang]} · {FARE.updated}
          </span>
        </div>
        <dl className="mt-2 grid grid-cols-2 gap-y-1.5 text-[14px]">
          <dt>{t('fx.fareAdultCard')}</dt>
          <dd className="text-right font-bold tabular">{won(FARE.adultCard)}</dd>
          <dt>{t('fx.fareSingle')}</dt>
          <dd className="text-right font-bold tabular">{won(FARE.adultSingle)}</dd>
          <dt>{t('fx.fareYouth')}</dt>
          <dd className="text-right font-bold tabular">{won(FARE.youthCard)}</dd>
          <dt>{t('fx.fareChild')}</dt>
          <dd className="text-right font-bold tabular">{won(FARE.child)}</dd>
          <dt>{t('fx.fareEarly')}</dt>
          <dd className="text-right font-bold tabular">{won(FARE.earlyAdult)}</dd>
        </dl>
        <p className="mt-2 text-[12px] leading-relaxed text-ink-2">{t('fx.fareDistance')}</p>
      </div>

      <Card title={t('fx.estimate')}>
        <div className="flex gap-2">
          <button type="button" onClick={() => setPicker('from')} className="h-10 flex-1 truncate rounded-lg bg-sub px-2 text-[14px] font-semibold">
            {stationName(from)}
          </button>
          <span className="self-center">→</span>
          <button type="button" onClick={() => setPicker('to')} className="h-10 flex-1 truncate rounded-lg bg-sub px-2 text-[14px] font-semibold">
            {stationName(to)}
          </button>
        </div>
        {r && (
          <p className="mt-2">
            <span className="text-[24px] font-extrabold text-brand tabular">{won(estimateFare(r.distanceKm))}</span>
            <span className="ml-2 text-[13px] text-ink-2">
              {r.distanceKm}km · {t('unit.min', { n: r.totalMin })}
            </span>
          </p>
        )}
        <p className="mt-1 text-[12px] text-ink-2">
          <DataTag kind="estimate" /> {t('fx.estimateNote')}
          {sbd ? ` ${t('fx.sbdNote')}` : ''}
        </p>
      </Card>

      <Card title={t('fx.climate')}>
        <div className="grid grid-cols-5 gap-1.5">
          {CLIMATE_PASS.map((p) => (
            <div key={p.days} className="rounded-lg bg-sub py-2 text-center">
              <p className="text-[12px] text-ink-2">{t('fx.days', { n: p.days })}</p>
              <p className="text-[13px] font-bold tabular">{won(p.price)}</p>
            </div>
          ))}
        </div>
      </Card>
      {CARD_GUIDE.map((g) => (
        <Card key={g.title.en} title={g.title[lang]}>
          {g.body[lang]}
        </Card>
      ))}
      <StationPicker open={picker !== null} title={t('search.to')} onClose={() => setPicker(null)} onPick={(id) => (picker === 'from' ? setFrom(id) : setTo(id), setPicker(null))} />
    </div>
  )
}

// ── 외국인용 환승 안내 ─────────────────────────────────────
function TransferHelp() {
  const s = useStore()
  const route = s.journeyRoute ?? s.selectedRoute
  const [korean, setKorean] = useState(false)
  if (!route)
    return (
      <div className="px-6 py-12 text-center">
        <p className="text-[16px] font-bold">{t('move.emptyTitle')}</p>
        <div className="mt-4">
          <PrimaryButton onClick={() => s.setTab('route')}>{t('move.searchSelf')}</PrimaryButton>
        </div>
      </div>
    )
  const exit = exitsOf(route.to)[0]
  const lines: string[] = []
  route.transfers.forEach((x) => lines.push(t('fx.trSpeak', { s: stationName(x.station), l: lineName(x.to), d: towardOf(route, x.station, x.to) })))
  lines.push(t('fx.finalSpeak', { s: stationName(route.to) }))
  const name = (id: string) => (korean ? STATIONS[id].names.ko : stationName(id))
  return (
    <div className="px-4">
      <div className="flex items-center gap-2 px-1">
        <p className="text-[15px] font-bold">
          {stationName(route.from)} → {stationName(route.to)}
        </p>
        <button type="button" onClick={() => setKorean((k) => !k)} className="ml-auto h-8 rounded-lg bg-sub px-3 text-[12px] font-bold">
          {korean ? t('fx.showMine') : t('fx.showKorean')}
        </button>
      </div>
      {route.transfers.map((x, i) => (
        <div key={i} className="mt-3 rounded-2xl bg-brand-light p-4">
          <p className="text-[13px] font-semibold text-brand">{t('fx.transferN', { n: i + 1 })}</p>
          <p className="mt-1 text-[22px] font-extrabold">{name(x.station)}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[15px] font-semibold">
            <LineBadge line={x.from} size={22} /> → <LineBadge line={x.to} size={22} />
            <span>{towardOf(route, x.station, x.to)}</span>
          </div>
          <p className="mt-2 text-[14px] text-ink">
            {x.info.source === 'estimate' ? t('tp.noDataShort') : `${t('station.door', { d: x.info.door })} · ${t('tp.passage', { m: x.info.walk })} · ${x.elevator ? t('station.elevatorOk') : t('tp.hasStairs')}`}
          </p>
          {hasIndoor(x.station) && (
            <button type="button" onClick={() => s.openPage({ kind: 'indoor', station: x.station })} className="mt-2 h-9 rounded-lg bg-white px-3 text-[13px] font-bold text-brand">
              {t('in.open')}
            </button>
          )}
        </div>
      ))}
      <div className="mt-3 rounded-2xl border border-line p-4">
        <p className="text-[13px] font-semibold text-ink-2">{t('fx.final')}</p>
        <p className="mt-1 text-[22px] font-extrabold">{name(route.to)}</p>
        {exit && <p className="mt-1 text-[14px]">{t('fx.exitHint', { n: exit.no })}</p>}
      </div>
      <div className="mt-3">
        <PrimaryButton onClick={() => speak(lines.join('. '), s.lang, s.alerts.volume)}>
          <Volume2 size={19} /> {t('fx.listen')}
        </PrimaryButton>
      </div>
    </div>
  )
}

// ── 관광지·출구 ───────────────────────────────────────────
function Sights() {
  const s = useStore()
  const lang = getLang()
  return (
    <div>
      <p className="px-5 text-[13px] leading-relaxed text-ink-2">{t('fx.sightsNote')}</p>
      {ATTRACTIONS.filter((a) => STATIONS[a.station]).map((a) => (
        <div key={a.id} className="flex items-center gap-3 border-b border-line px-5 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-bold">{a.name[lang]}</p>
            <p className="mt-0.5 flex flex-wrap items-center gap-1 text-[13px] text-ink-2">
              {stationName(a.station)}
              {STATIONS[a.station].lines.map((l) => (
                <LineBadge key={l} line={l} size={16} />
              ))}
              · {a.exit ? t('fx.exitN', { n: a.exit }) : t('fx.exitCheck')}
            </p>
          </div>
          <button type="button" onClick={() => (s.setTo(a.station), s.search(s.from && s.from !== a.station ? s.from : '서울', a.station), s.closePage(), s.setTab('route'))} className="h-9 shrink-0 rounded-lg bg-brand px-3 text-[12px] font-bold text-white">
            {t('fx.go')}
          </button>
          <button
            type="button"
            onClick={() => openMap(mapLinks('kakao', { name: a.name.ko, lat: STATIONS[a.station].lat, lon: STATIONS[a.station].lon, query: a.name.ko }))}
            className="h-9 shrink-0 rounded-lg bg-sub px-3 text-[12px] font-bold"
          >
            {t('fx.map')}
          </button>
        </div>
      ))}
    </div>
  )
}

// ── 관광 일정 추천 ─────────────────────────────────────────
function permutations<T>(a: T[]): T[][] {
  if (a.length <= 1) return [a]
  return a.flatMap((x, i) => permutations([...a.slice(0, i), ...a.slice(i + 1)]).map((p) => [x, ...p]))
}

function TourPlanner() {
  const s = useStore()
  const lang = getLang()
  const [start, setStart] = useState(s.from && STATIONS[s.from] ? s.from : '서울')
  const [picked, setPicked] = useState<string[]>(['gyeongbok', 'myeongdong', 'hongdae'])
  const [picker, setPicker] = useState(false)
  const [plan, setPlan] = useState<{ order: Attraction[]; legs: (Route | undefined)[]; total: number; fare: number } | null>(null)
  const settings = { walkSpeed: s.walkSpeed, priorities: ['fast' as const], wheelchair: s.wheelchair }

  const compute = () => {
    const items = picked.map((id) => ATTRACTIONS.find((a) => a.id === id)!).filter((a) => STATIONS[a.station])
    const cache = new Map<string, Route | undefined>()
    const leg = (a: string, b: string) => {
      if (a === b) return undefined
      const k = `${a}>${b}`
      if (!cache.has(k)) cache.set(k, findRoutes(a, b, settings)[0])
      return cache.get(k)
    }
    let best: { order: Attraction[]; legs: (Route | undefined)[]; total: number; fare: number } | null = null
    for (const order of permutations(items)) {
      let cur = start
      let total = 0
      let fare = 0
      const legs: (Route | undefined)[] = []
      for (const a of order) {
        const r = leg(cur, a.station)
        legs.push(r)
        total += r?.totalMin ?? 0
        fare += r ? estimateFare(r.distanceKm) : 0
        cur = a.station
      }
      if (!best || total < best.total) best = { order, legs, total, fare }
    }
    setPlan(best)
  }

  return (
    <div>
      <p className="px-5 text-[13px] text-ink-2">{t('fx.tourHint')}</p>
      <button type="button" onClick={() => setPicker(true)} className="mx-4 mt-3 flex h-12 w-[calc(100%-2rem)] items-center justify-between rounded-xl bg-sub px-4 text-[14px]">
        <span className="text-ink-2">{t('fx.tourStart')}</span>
        <span className="font-bold">{stationName(start)}</span>
      </button>
      <div className="mt-3 flex flex-wrap gap-1.5 px-4">
        {ATTRACTIONS.filter((a) => STATIONS[a.station]).map((a) => {
          const on = picked.includes(a.id)
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => setPicked((p) => (on ? p.filter((x) => x !== a.id) : p.length >= 6 ? p : [...p, a.id]))}
              className={`h-9 rounded-full px-3 text-[13px] font-semibold ${on ? 'bg-brand text-white' : 'border border-line'}`}
            >
              {a.name[lang]}
            </button>
          )
        })}
      </div>
      <p className="mt-1 px-5 text-[12px] text-ink-2">{t('fx.tourMax')}</p>
      <div className="mt-3 px-4">
        <PrimaryButton disabled={picked.length < 2} onClick={compute}>
          {t('fx.tourPlan')}
        </PrimaryButton>
      </div>
      {plan && (
        <div className="mt-4 px-5">
          <div className="flex items-baseline gap-3">
            <span className="text-[22px] font-extrabold tabular">{t('unit.min', { n: plan.total })}</span>
            <span className="text-[14px] text-ink-2">
              {t('fx.tourFare')} {won(plan.fare)}
            </span>
            <DataTag kind="estimate" />
          </div>
          <ol className="mt-3">
            <li className="flex items-center gap-3 pb-3">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-sub text-[12px] font-bold">S</span>
              <span className="text-[15px] font-semibold">{stationName(start)}</span>
            </li>
            {plan.order.map((a, i) => (
              <li key={a.id} className="flex gap-3 pb-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand text-[12px] font-bold text-white">{i + 1}</span>
                <div>
                  <p className="text-[15px] font-bold">{a.name[lang]}</p>
                  <p className="text-[13px] text-ink-2">
                    {stationName(a.station)} · {a.exit ? t('fx.exitN', { n: a.exit }) : t('fx.exitCheck')}
                    {plan.legs[i] && ` · ${t('unit.min', { n: plan.legs[i]!.totalMin })} · ${t('route.transfers', { n: plan.legs[i]!.transferCount })}`}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}
      <StationPicker open={picker} title={t('fx.tourStart')} onClose={() => setPicker(false)} onPick={(id) => (setStart(id), setPicker(false))} />
    </div>
  )
}

// ── 짐 보관·편의시설 ───────────────────────────────────────
function LuggageSection() {
  const s = useStore()
  const station = s.journeyRoute?.to ?? s.selectedRoute?.to ?? '이대'
  return (
    <div>
      <Card title={t('fx.lockers')}>
        <p>{t('fx.lockersBody')}</p>
        <p className="mt-2 text-[12px] text-ink-2">{t('fx.lockersAvail')}</p>
      </Card>
      <Card title={t('fx.facilitiesAt', { s: stationName(station) })}>
        {hasIndoor(station) ? (
          <>
            <p>{t('fx.facilitiesIndoor')}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {[
                ['LOCK', 'in.kind.locker'],
                ['B1-E3', 'in.kind.elevator'],
                ['WC', 'in.kind.toilet'],
                ['NURSE', 'in.kind.nursing'],
              ].map(([id, key]) => (
                <button key={id} type="button" onClick={() => s.openPage({ kind: 'indoor', station, to: id })} className="h-9 rounded-lg bg-brand-light px-3 text-[13px] font-bold text-brand">
                  {t(key as 'in.kind.locker')}
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <p className="text-ink-2">{t('in.noDataBody')}</p>
            <button type="button" onClick={() => s.openPage({ kind: 'indoor', station: '이대', to: 'LOCK' })} className="mt-2 h-9 rounded-lg bg-brand-light px-3 text-[13px] font-bold text-brand">
              {t('fx.ewhaDemo')}
            </button>
          </>
        )}
      </Card>
      <Card title={t('fx.luggageRoute')}>
        <p>{t('fx.luggageRouteBody')}</p>
        <button
          type="button"
          onClick={() => {
            s.patch({ priorities: ['luggage', 'elevator'] })
            s.closePage()
            s.setTab('route')
          }}
          className="mt-2 h-9 rounded-lg bg-brand px-3 text-[13px] font-bold text-white"
        >
          {t('fx.luggageApply')}
        </button>
      </Card>
    </div>
  )
}

// ── 막차·심야 ─────────────────────────────────────────────
function NightSection() {
  const s = useStore()
  const route = s.journeyRoute ?? s.selectedRoute
  const now = new Date()
  // 공식 시간표 미연동: 막차 출발은 자정 무렵으로 '예상'
  const lastDepart = new Date(now)
  lastDepart.setHours(23, 50, 0, 0)
  if (now.getHours() < 4) lastDepart.setDate(lastDepart.getDate() - 1)
  const minsLeft = Math.round((lastDepart.getTime() - now.getTime()) / 60000)
  const lastTransferOk = route ? route.transfers.every((_, i) => {
    const before = route.segments.slice(0, i + 1).reduce((a, g) => a + g.minutes, 0)
    return minsLeft - before > -15
  }) : true
  return (
    <div>
      <div className="mx-4 rounded-2xl bg-ink p-4 text-white">
        <p className="text-[13px] opacity-80">{t('fx.lastTrain')}</p>
        <p className="mt-1 text-[30px] font-extrabold tabular">~{formatClock(lastDepart)}</p>
        <p className="mt-1 text-[13px] opacity-80">{t('fx.lastTrainNote')}</p>
      </div>
      {route ? (
        <Card title={`${stationName(route.from)} → ${stationName(route.to)}`}>
          <p className={minsLeft >= 0 && lastTransferOk ? 'font-semibold text-ok' : 'font-semibold text-danger'}>
            {minsLeft < 0 ? t('fx.lastMissed') : !lastTransferOk ? t('fx.lastTransferNo') : t('fx.lastOk', { n: minsLeft })}
          </p>
          {route.transfers.length > 0 && <p className="mt-1 text-[13px] text-ink-2">{t('fx.lastTransferCheck', { s: route.transfers.map((x) => stationName(x.station)).join(', ') })}</p>}
        </Card>
      ) : (
        <Card title={t('fx.lastTrain')}>{t('move.emptyBody')}</Card>
      )}
      <Card title={t('fx.nightAlt')}>
        <p>{t('fx.nightBus')}</p>
        <p className="mt-2">{t('fx.nightTaxi')}</p>
      </Card>
    </div>
  )
}

// ── 카메라 번역 ───────────────────────────────────────────
function CameraTranslate() {
  const s = useStore()
  const file = useRef<HTMLInputElement>(null)
  const [img, setImg] = useState<string | null>(null)
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'unavailable' | 'error'>('idle')
  const [result, setResult] = useState<{ text: string; translated: string } | null>(null)
  const [q, setQ] = useState('')
  const lang = getLang()

  const onFile = async (f: File) => {
    const url = URL.createObjectURL(f)
    setImg(url)
    setState('loading')
    try {
      // 업로드 용량을 줄이기 위해 최대 1280px로 축소
      const bmp = await createImageBitmap(f)
      const scale = Math.min(1, 1280 / Math.max(bmp.width, bmp.height))
      const c = document.createElement('canvas')
      c.width = bmp.width * scale
      c.height = bmp.height * scale
      c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
      const b64 = c.toDataURL('image/jpeg', 0.85).split(',')[1]
      const r = await fetch('/api/translate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ image: b64, target: lang === 'zh' ? 'zh-CN' : lang }) })
      if (r.status === 503 || !(r.headers.get('content-type') ?? '').includes('json')) return setState('unavailable')
      if (!r.ok) return setState('error')
      setResult((await r.json()) as { text: string; translated: string })
      setState('done')
    } catch {
      setState('unavailable')
    }
  }

  const sign = SIGNS.filter((x) => !q || Object.values(x).some((v) => v.toLowerCase().includes(q.toLowerCase())))
  return (
    <div>
      <div className="px-4">
        <input ref={file} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => e.target.files?.[0] && void onFile(e.target.files[0])} />
        <PrimaryButton onClick={() => file.current?.click()}>
          <Camera size={19} /> {t('fx.cameraShoot')}
        </PrimaryButton>
      </div>
      {img && <img src={img} alt="" className="mx-4 mt-3 max-h-56 w-[calc(100%-2rem)] rounded-xl object-contain" />}
      {state === 'loading' && <p className="px-5 pt-3 text-[14px] text-ink-2">{t('common.loading')}</p>}
      {state === 'unavailable' && <p className="mx-4 mt-3 rounded-xl bg-[#FDF6DC] px-4 py-3 text-[13px] leading-relaxed text-[#8A6A00]">{t('fx.cameraNoApi')}</p>}
      {state === 'error' && <p className="mx-4 mt-3 rounded-xl bg-[#FBEAEA] px-4 py-3 text-[13px] text-danger">{t('fx.cameraError')}</p>}
      {state === 'done' && result && (
        <Card title={t('fx.cameraResult')}>
          <p className="text-[13px] whitespace-pre-line text-ink-2">{result.text}</p>
          <p className="mt-2 text-[16px] font-bold whitespace-pre-line">{result.translated}</p>
          <button type="button" onClick={() => speak(result.translated, s.lang, s.alerts.volume)} className="mt-2 flex h-9 items-center gap-1 rounded-lg bg-sub px-3 text-[13px] font-bold">
            <Volume2 size={15} /> {t('fx.listen')}
          </button>
        </Card>
      )}
      <div className="mt-6 border-t border-line px-5 pt-4">
        <h3 className="text-[15px] font-bold">{t('fx.signs')}</h3>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('fx.signsSearch')} className="mt-2 h-11 w-full rounded-xl bg-sub px-3 text-[15px] outline-none" />
        {sign.map((x) => (
          <div key={x.ko} className="flex items-center gap-3 border-b border-line py-2.5">
            <span className="w-28 shrink-0 text-[16px] font-bold">{x.ko}</span>
            <span className="text-[14px]">{lang === 'ko' ? x.en : x[lang]}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── 긴급 상황 ─────────────────────────────────────────────
function Emergency() {
  const s = useStore()
  const lang = getLang()
  const [show, setShow] = useState<string | null>(null)
  return (
    <div>
      <div className="grid grid-cols-2 gap-2 px-4">
        {EMERGENCY_NUMBERS.map((n) => (
          <a key={n.no} href={`tel:${n.no}`} className="flex min-h-[64px] flex-col justify-center rounded-2xl bg-[#FBEAEA] px-4">
            <span className="flex items-center gap-1 text-[20px] font-extrabold text-danger">
              <Phone size={16} /> {n.no}
            </span>
            <span className="text-[12px] leading-tight text-ink">{n.label[lang]}</span>
          </a>
        ))}
      </div>
      <Card title={t('fx.staff')}>
        <p>{t('fx.staffBody')}</p>
        {hasIndoor('이대') && (
          <button type="button" onClick={() => s.openPage({ kind: 'indoor', station: '이대', to: 'INFO' })} className="mt-2 h-9 rounded-lg bg-brand-light px-3 text-[13px] font-bold text-brand">
            {t('fx.staffEwha')}
          </button>
        )}
      </Card>
      <Card title={t('fx.lost')}>
        <p>{t('fx.lostBody')}</p>
        <a href="https://www.lost112.go.kr" target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex h-9 items-center gap-1 rounded-lg bg-sub px-3 text-[13px] font-bold">
          lost112.go.kr <ChevronRight size={14} />
        </a>
      </Card>
      <div className="mt-4 px-5">
        <h3 className="text-[15px] font-bold">{t('fx.phrases')}</h3>
        <p className="text-[12px] text-ink-2">{t('fx.phrasesHint')}</p>
        {PHRASES.map((p) => (
          <div key={p.ko} className="flex items-center gap-2 border-b border-line py-2.5">
            <button type="button" onClick={() => setShow(p.ko)} className="min-w-0 flex-1 text-left">
              <p className="text-[15px] font-semibold">{lang === 'ko' ? p.tr.en : p.tr[lang]}</p>
              <p className="text-[13px] text-ink-2">{p.ko}</p>
            </button>
            <button type="button" aria-label={t('fx.listen')} onClick={() => speak(p.ko, 'ko', 1)} className="flex h-10 w-10 items-center justify-center rounded-full bg-sub">
              <Volume2 size={17} />
            </button>
          </div>
        ))}
      </div>
      {show && (
        <button type="button" onClick={() => setShow(null)} className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-white px-8 text-center">
          <p className="text-[40px] leading-tight font-extrabold">{show}</p>
          <p className="mt-6 flex items-center gap-1 text-[14px] text-ink-2">
            <X size={16} /> {t('common.close')}
          </p>
        </button>
      )}
    </div>
  )
}

export type { Section as ForeignSection }
