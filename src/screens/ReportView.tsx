import { useMemo, useState } from 'react'
import { Lightbulb, Lock, Star, Trash2 } from 'lucide-react'
import { LineBadge, PrimaryButton, Segmented } from '../components/ui'
import { LINES, STATIONS, type LineId } from '../data/network'
import { getLang, lineName, stationName, t } from '../i18n'
import { findRoutes } from '../lib/routing'
import { newId, type TripRecord } from '../services/trips'
import { useStore } from '../state/store'

type Period = 'today' | 'week' | 'month'

const DAY = 86400000
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
/** 이번 주 월요일 */
const startOfWeek = (d: Date) => {
  const s = startOfDay(d)
  return new Date(s.getTime() - ((s.getDay() + 6) % 7) * DAY)
}
const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1)

function summarize(list: TripRecord[]) {
  const minutes = list.reduce((a, x) => a + x.minutes, 0)
  const lineCount: Record<string, number> = {}
  const stationCount: Record<string, number> = {}
  const fromCount: Record<string, number> = {}
  const toCount: Record<string, number> = {}
  list.forEach((x) => {
    x.lines.forEach((l) => (lineCount[l] = (lineCount[l] ?? 0) + 1))
    ;[x.from, x.to].forEach((st) => (stationCount[st] = (stationCount[st] ?? 0) + 1))
    fromCount[x.from] = (fromCount[x.from] ?? 0) + 1
    toCount[x.to] = (toCount[x.to] ?? 0) + 1
  })
  const top = (m: Record<string, number>) => Object.entries(m).sort((a, b) => b[1] - a[1])
  return {
    count: list.length,
    minutes,
    avg: list.length ? Math.round(minutes / list.length) : 0,
    transfers: list.reduce((a, x) => a + x.transfers, 0),
    km: Math.round(list.reduce((a, x) => a + x.distanceKm, 0) * 10) / 10,
    walkM: list.reduce((a, x) => a + x.walkM, 0),
    lines: top(lineCount) as [LineId, number][],
    stations: top(stationCount),
    from: top(fromCount),
    to: top(toCount),
    usedStations: new Set(list.flatMap((x) => x.stations)).size,
    delayMin: list.reduce((a, x) => a + (x.delayMin ?? 0), 0),
  }
}

/** 시연용 예시 기록 생성 — demo:true 로 저장되어 실제 기록과 구분 */
function makeDemoTrips(walkSpeed: number): TripRecord[] {
  const pairs: [string, string, number][] = [
    ['이대', '강남', 8],
    ['강남', '이대', 18],
    ['이대', '홍대입구', 13],
    ['광화문', '잠실', 9],
    ['신촌', '여의도', 19],
    ['이대', '서울', 10],
  ]
  const out: TripRecord[] = []
  const today = startOfDay(new Date())
  for (let d = 34; d >= 0; d--) {
    const day = new Date(today.getTime() - d * DAY)
    const dow = day.getDay()
    const n = dow === 0 || dow === 6 ? (d % 3 === 0 ? 1 : 0) : d % 4 === 0 ? 1 : 2
    for (let k = 0; k < n; k++) {
      const [from, to, hour] = pairs[(d * 3 + k * 2) % pairs.length]
      if (!STATIONS[from] || !STATIONS[to]) continue
      const r = findRoutes(from, to, { walkSpeed, priorities: ['fast'], wheelchair: false })[0]
      if (!r) continue
      const start = new Date(day.getTime() + (hour + (k ? 9 : 0)) * 3600000 + ((d * 7) % 50) * 60000)
      if (start.getTime() > Date.now()) continue
      out.push({
        id: newId(),
        startedAt: start.toISOString(),
        endedAt: new Date(start.getTime() + r.totalMin * 60000).toISOString(),
        from,
        to,
        lines: [...new Set(r.segments.map((x) => x.line))],
        stations: r.segments.flatMap((g, i) => (i ? g.stations.slice(1) : g.stations)),
        minutes: r.totalMin + ((d * 5) % 7) - 3,
        transfers: r.transferCount,
        distanceKm: r.distanceKm,
        walkM: r.walkM,
        demo: true,
      })
    }
  }
  return out
}

function Bars({ values, labels, highlight, unit }: { values: number[]; labels: string[]; highlight?: number; unit: string }) {
  const [hover, setHover] = useState<number | null>(null)
  const max = Math.max(1, ...values)
  const active = hover ?? highlight ?? null
  return (
    <div>
      <div className="relative flex h-[120px] items-end gap-[2px]">
        {values.map((v, i) => (
          <button
            key={i}
            type="button"
            onPointerEnter={() => setHover(i)}
            onPointerLeave={() => setHover(null)}
            onClick={() => setHover(i)}
            className="flex h-full flex-1 flex-col items-center justify-end"
            aria-label={`${labels[i]} ${v}${unit}`}
          >
            <span className="w-full max-w-[28px] rounded-t-[4px] transition-colors" style={{ height: `${v ? Math.max(4, (v / max) * 100) : 2}%`, background: v ? (i === active ? '#293896' : '#8FA3E6') : '#E6E9F0' }} />
          </button>
        ))}
        {active !== null && (
          <span className="pointer-events-none absolute -top-1 rounded-md bg-ink px-2 py-0.5 text-[12px] font-semibold text-white tabular" style={{ left: `calc(${((active + 0.5) / values.length) * 100}% - 28px)` }}>
            {labels[active]} · {values[active]}
            {unit}
          </span>
        )}
      </div>
      <div className="mt-1 flex gap-[2px]">
        {labels.map((l, i) => (
          <span key={i} className="flex-1 text-center text-[10px] text-ink-2 tabular">
            {values.length > 12 && i % 5 !== 0 ? '' : l}
          </span>
        ))}
      </div>
    </div>
  )
}

export default function ReportView() {
  const s = useStore()
  const [period, setPeriod] = useState<Period>('week')
  const now = new Date()
  const lang = getLang()
  const dows = lang === 'ko' ? ['월', '화', '수', '목', '금', '토', '일'] : lang === 'ja' ? ['月', '火', '水', '木', '金', '土', '日'] : lang === 'zh' ? ['一', '二', '三', '四', '五', '六', '日'] : ['M', 'T', 'W', 'T', 'F', 'S', 'S']

  const trips = s.trips
  const hasDemo = trips.some((x) => x.demo)
  const ranges = useMemo(() => {
    const today = startOfDay(now).getTime()
    const week = startOfWeek(now).getTime()
    const month = startOfMonth(now).getTime()
    const at = (x: TripRecord) => new Date(x.startedAt).getTime()
    return {
      today: trips.filter((x) => at(x) >= today),
      week: trips.filter((x) => at(x) >= week),
      lastWeek: trips.filter((x) => at(x) >= week - 7 * DAY && at(x) < week),
      month: trips.filter((x) => at(x) >= month),
      lastMonth: trips.filter((x) => {
        const d = new Date(x.startedAt)
        const pm = new Date(now.getFullYear(), now.getMonth() - 1, 1)
        return d >= pm && at(x) < month
      }),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trips, now.getDate()])

  const list = ranges[period]
  const sum = summarize(list)

  // 그래프 데이터
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = startOfWeek(now).getTime() + i * DAY
    return ranges.week.filter((x) => {
      const ts = new Date(x.startedAt).getTime()
      return ts >= d && ts < d + DAY
    }).length
  })
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const monthDays = Array.from({ length: daysInMonth }, (_, i) => ranges.month.filter((x) => new Date(x.startedAt).getDate() === i + 1).length)
  const dowPattern = Array.from({ length: 7 }, (_, i) => trips.filter((x) => (new Date(x.startedAt).getDay() + 6) % 7 === i).length)
  const hourPattern = Array.from({ length: 20 }, (_, i) => trips.filter((x) => new Date(x.startedAt).getHours() === i + 5).length)

  // 인사이트 — 실제 저장된 기록만으로 계산
  const insights: string[] = []
  const ws = summarize(ranges.week)
  const lws = summarize(ranges.lastWeek)
  if (ws.lines[0]) insights.push(t('rep.in.topLine', { l: lineName(ws.lines[0][0]) }))
  if (ws.count && lws.count) {
    const diff = lws.avg - ws.avg
    if (Math.abs(diff) >= 1) insights.push(diff > 0 ? t('rep.in.faster', { n: diff }) : t('rep.in.slower', { n: -diff }))
    const td = lws.transfers - ws.transfers
    if (td !== 0) insights.push(td > 0 ? t('rep.in.fewerTransfers', { n: td }) : t('rep.in.moreTransfers', { n: -td }))
  }
  const all = summarize(trips)
  if (all.from[0]) insights.push(t('rep.in.topFrom', { s: stationName(all.from[0][0]).replace(/\.$/, '') }))
  if (ranges.month.length) insights.push(t('rep.in.month', { n: ranges.month.length }))

  const fmtH = (m: number) => (m >= 60 ? t('unit.hourMin', { h: Math.floor(m / 60), m: m % 60 }) : t('unit.min', { n: m }))

  if (!trips.length) {
    return (
      <div className="px-6 py-14 text-center">
        <p className="text-[18px] font-bold">{t('rep.emptyTitle')}</p>
        <p className="mt-2 text-[14px] leading-relaxed text-ink-2">{t('rep.emptyBody')}</p>
        <div className="mt-6 space-y-2">
          <PrimaryButton onClick={() => s.setTab('route')}>{t('rep.goRoute')}</PrimaryButton>
          <PrimaryButton
            tone="light"
            onClick={async () => {
              for (const x of makeDemoTrips(s.walkSpeed)) await s.addTrip(x)
            }}
          >
            {t('rep.loadDemo')}
          </PrimaryButton>
        </div>
      </div>
    )
  }

  const stats: [string, string][] = [
    [t('rep.totalTime'), fmtH(sum.minutes)],
    [t('rep.trips'), t('unit.times', { n: sum.count })],
    [t('rep.transfers'), t('unit.times', { n: sum.transfers })],
    [t('rep.distance'), `${sum.km}km`],
    [t('rep.walk'), `${sum.walkM.toLocaleString()}m`],
    [t('rep.avg'), t('unit.min', { n: sum.avg })],
    [t('rep.lines'), t('unit.count', { n: sum.lines.length })],
    [t('rep.stations'), t('unit.count', { n: sum.usedStations })],
    [t('rep.delay'), t('unit.min', { n: sum.delayMin })],
  ]

  return (
    <div className="pb-8">
      {hasDemo && (
        <div className="mx-4 mb-3 flex items-center gap-2 rounded-xl bg-[#FDF6DC] px-3 py-2.5">
          <span className="flex-1 text-[13px] font-semibold text-[#8A6A00]">{t('rep.demoBanner')}</span>
          <button type="button" onClick={() => void s.clearTrips(true)} className="h-8 shrink-0 rounded-lg bg-white px-3 text-[12px] font-bold">
            {t('rep.removeDemo')}
          </button>
        </div>
      )}
      <div className="px-4">
        <Segmented
          value={period}
          onChange={setPeriod}
          options={[
            { value: 'today', label: t('rep.today') },
            { value: 'week', label: t('rep.week') },
            { value: 'month', label: t('rep.month') },
          ]}
        />
      </div>

      {/* 핵심 수치 */}
      <div className="mt-4 px-5">
        <p className="text-[14px] font-semibold text-ink-2">{t(`rep.headline.${period}` as 'rep.headline.week')}</p>
        <p className="mt-1 text-[40px] leading-none font-extrabold text-brand tabular">{fmtH(sum.minutes)}</p>
      </div>
      <div className="mt-4 grid grid-cols-4 gap-y-4 px-5">
        {stats.slice(1).map(([k, v]) => (
          <div key={k}>
            <p className="text-[12px] text-ink-2">{k}</p>
            <p className="text-[16px] font-bold tabular">{v}</p>
          </div>
        ))}
      </div>

      {sum.count === 0 && <p className="mt-4 px-5 text-[14px] text-ink-2">{t('rep.noneInPeriod')}</p>}

      {/* 인사이트 */}
      {insights.length > 0 && (
        <div className="mt-6 border-t border-line px-5 pt-5">
          <h3 className="text-[15px] font-bold">{t('rep.insights')}</h3>
          <ul className="mt-2 space-y-2">
            {insights.map((x) => (
              <li key={x} className="flex items-start gap-2 text-[15px]">
                <Lightbulb size={17} className="mt-0.5 shrink-0 text-warn" />
                {x}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 그래프 */}
      <div className="mt-6 border-t border-line px-5 pt-5">
        <h3 className="mb-3 text-[15px] font-bold">{period === 'month' ? t('rep.chartMonth') : t('rep.chartWeek')}</h3>
        {period === 'month' ? (
          <Bars values={monthDays} labels={monthDays.map((_, i) => String(i + 1))} highlight={now.getDate() - 1} unit={t('unit.timesShort')} />
        ) : (
          <Bars values={weekDays} labels={dows} highlight={(now.getDay() + 6) % 7} unit={t('unit.timesShort')} />
        )}
      </div>

      {sum.lines.length > 0 && (
        <div className="mt-6 px-5">
          <h3 className="mb-3 text-[15px] font-bold">{t('rep.topLines')}</h3>
          {sum.lines.slice(0, 5).map(([l, n]) => (
            <div key={l} className="mb-2 flex items-center gap-2">
              <span className="w-[72px] shrink-0">
                <LineBadge line={l} size={20} />
              </span>
              <div className="h-3 flex-1 rounded-r-[4px] bg-sub">
                <div className="h-full rounded-r-[4px]" style={{ width: `${(n / sum.lines[0][1]) * 100}%`, background: LINES[l].color }} />
              </div>
              <span className="w-10 text-right text-[13px] font-semibold tabular">{t('unit.timesShortN', { n })}</span>
            </div>
          ))}
        </div>
      )}

      <div className="mt-5 grid grid-cols-2 gap-3 px-5">
        <div className="rounded-xl bg-sub p-3">
          <p className="text-[12px] text-ink-2">{t('rep.topFrom')}</p>
          <p className="truncate text-[16px] font-bold">{sum.from[0] ? stationName(sum.from[0][0]) : '—'}</p>
        </div>
        <div className="rounded-xl bg-sub p-3">
          <p className="text-[12px] text-ink-2">{t('rep.topTo')}</p>
          <p className="truncate text-[16px] font-bold">{sum.to[0] ? stationName(sum.to[0][0]) : '—'}</p>
        </div>
        <div className="col-span-2 rounded-xl bg-sub p-3">
          <p className="text-[12px] text-ink-2">{t('rep.topStation')}</p>
          <p className="truncate text-[16px] font-bold">{sum.stations[0] ? stationName(sum.stations[0][0]) : '—'}</p>
        </div>
      </div>

      <div className="mt-6 border-t border-line px-5 pt-5">
        {s.premium ? (
          <>
            <h3 className="mb-3 text-[15px] font-bold">{t('rep.dowPattern')}</h3>
            <Bars values={dowPattern} labels={dows} unit={t('unit.timesShort')} />
            <h3 className="mt-6 mb-3 text-[15px] font-bold">{t('rep.hourPattern')}</h3>
            <Bars values={hourPattern} labels={hourPattern.map((_, i) => String(i + 5))} unit={t('unit.timesShort')} />
          </>
        ) : (
          <button type="button" onClick={() => s.openPage({ kind: 'premium' })} className="flex w-full items-center gap-3 rounded-2xl bg-sub px-4 py-4 text-left">
            <Lock size={18} className="shrink-0 text-ink-2" />
            <div>
              <p className="text-[15px] font-bold">{t('rep.proTitle')}</p>
              <p className="text-[13px] text-ink-2">{t('rep.proBody')}</p>
            </div>
          </button>
        )}
      </div>

      {/* 기록 */}
      <div className="mt-6 border-t border-line pt-5">
        <div className="flex items-center justify-between px-5">
          <h3 className="text-[15px] font-bold">{t('rep.records')}</h3>
          <button
            type="button"
            onClick={() => {
              if (window.confirm(t('rep.clearConfirm'))) void s.clearTrips()
            }}
            className="text-[13px] font-semibold text-danger"
          >
            {t('rep.clearAll')}
          </button>
        </div>
        {trips.slice(0, 30).map((x) => {
          const d = new Date(x.startedAt)
          const fav = s.favoriteRoutes.some((r) => r.from === x.from && r.to === x.to)
          return (
            <div key={x.id} className="flex items-center gap-2 border-b border-line py-3 pr-2 pl-5 last:border-0">
              <button type="button" onClick={() => s.search(x.from, x.to) && s.setTab('route')} className="min-w-0 flex-1 text-left">
                <p className="truncate text-[15px] font-semibold">
                  {stationName(x.from)} → {stationName(x.to)}
                  {x.demo && <span className="ml-1.5 rounded bg-sub px-1 text-[10px] font-medium text-ink-2">{t('data.demo')}</span>}
                </p>
                <p className="mt-0.5 flex flex-wrap items-center gap-1 text-[12px] text-ink-2 tabular">
                  {`${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`} · {t('unit.min', { n: x.minutes })} · {t('route.transfers', { n: x.transfers })}
                  {x.lines.map((l) => (
                    <LineBadge key={l} line={l} size={15} />
                  ))}
                </p>
              </button>
              <button
                type="button"
                aria-label={t('fav.route')}
                onClick={() => s.patch({ favoriteRoutes: fav ? s.favoriteRoutes.filter((r) => !(r.from === x.from && r.to === x.to)) : [{ from: x.from, to: x.to }, ...s.favoriteRoutes] })}
                className="flex h-10 w-10 items-center justify-center"
              >
                <Star size={17} className={fav ? 'fill-warn text-warn' : 'text-[#C5CBD6]'} />
              </button>
              <button type="button" aria-label={t('common.delete')} onClick={() => void s.removeTrip(x.id)} className="flex h-10 w-10 items-center justify-center text-[#A3AAB8]">
                <Trash2 size={17} />
              </button>
            </div>
          )
        })}
        <p className="mt-3 px-5 text-[12px] leading-relaxed text-ink-2">{s.repoKind === 'local' ? t('rep.storageLocal') : t('rep.storageCloud')}</p>
      </div>
    </div>
  )
}
