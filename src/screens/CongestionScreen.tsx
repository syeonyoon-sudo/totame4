import { useMemo, useState } from 'react'
import { ChevronDown, ChevronLeft, Info, TriangleExclamationPoint } from 'lucide-react'
import { StationPicker } from '../components/Overlays'
import { CrowdChip, DataTag, LineBadge, ScreenHeader } from '../components/ui'
import { STATIONS, type LineId } from '../data/network'
import { stationName, t } from '../i18n'
import { LEVEL_BG, LEVEL_COLORS, carCongestion, hourlyStation, peakAdvice, stationCongestion, type CongestionLevel } from '../lib/congestion'
import { routeStops } from '../lib/routing'
import { useStore } from '../state/store'
import { useNow } from './SmartDeparture'
import { directionsOf } from '../lib/boarding'

const LEVEL_KEYS = ['crowd.l0', 'crowd.l1', 'crowd.l2', 'crowd.l3'] as const

export default function CongestionScreen({ initialStation, onClose }: { initialStation?: string; onClose: () => void }) {
  const s = useStore()
  const [picked, setPicked] = useState<string | null>(initialStation ?? null)
  const now = useNow(30000)
  const journeyStation = s.journey ? routeStops(s.journey.route)[s.journey.index]?.station : undefined
  const station = picked && STATIONS[picked] ? picked : (journeyStation ?? (STATIONS[s.from] ? s.from : '이대'))
  const [picker, setPicker] = useState(false)
  const [lineSel, setLineSel] = useState<LineId | null>(null)
  const [dirIdx, setDirIdx] = useState(0)
  const [carSel, setCarSel] = useState<number | null>(null)

  const st = STATIONS[station]
  const line: LineId = lineSel && st.lines.includes(lineSel) ? lineSel : st.lines[0]
  const dirs = directionsOf(station, line)
  const dir = dirs[Math.min(dirIdx, Math.max(0, dirs.length - 1))]
  const sc = stationCongestion(station, now)
  const hourly = useMemo(() => hourlyStation(station, now), [station, now])
  const advice = peakAdvice(station, now)
  const cars = carCongestion(station, line, now, dir?.toward)
  const sel = cars.cars.find((c) => c.car === (carSel ?? cars.best)) ?? cars.cars[0]
  const maxIdx = Math.max(...hourly.map((h) => h.index), 0.01)

  return (
    <div className="safe-top anim-fade-up absolute inset-0 z-40 flex flex-col bg-white">
      <ScreenHeader
        title={t('crowd.title')}
        left={
          <button type="button" aria-label={t('common.back')} onClick={onClose} className="flex h-11 w-11 items-center justify-center">
            <ChevronLeft size={26} />
          </button>
        }
      />
      <div className="no-scrollbar flex-1 overflow-y-auto pb-8">
        {/* 역 선택 */}
        <button type="button" onClick={() => setPicker(true)} className="mx-4 flex w-[calc(100%-2rem)] items-center gap-2 rounded-2xl border border-line px-4 py-3 text-left">
          <span className="min-w-0 truncate text-[20px] font-bold">{stationName(station)}</span>
          <span className="flex shrink-0 flex-wrap gap-1">
            {st.lines.map((l) => (
              <LineBadge key={l} line={l} size={20} />
            ))}
          </span>
          <ChevronDown size={18} className="ml-auto shrink-0 text-ink-2" />
        </button>
        <div className="mt-2 flex flex-wrap items-center gap-1.5 px-5">
          <DataTag kind="estimate" at={now} />
          <span className="text-[12px] text-ink-2">{t('crowd.modelNote')}</span>
        </div>

        {/* 역 혼잡도 */}
        <div className="mt-4 grid grid-cols-2 gap-3 px-4">
          {[
            { label: t('crowd.concourse'), r: sc.concourse },
            { label: t('crowd.platform'), r: sc.platform },
          ].map(({ label, r }) => (
            <div key={label} className="rounded-2xl px-4 py-3" style={{ background: LEVEL_BG[r.level] }}>
              <p className="text-[13px] font-semibold text-ink-2">{label}</p>
              <p className="mt-1 text-[22px] font-extrabold" style={{ color: r.level === 1 ? '#8A6A00' : LEVEL_COLORS[r.level] }}>
                {t(LEVEL_KEYS[r.level])}
              </p>
            </div>
          ))}
        </div>

        {advice.peak && advice.peak.level >= 2 && (
          <div className="mx-4 mt-3 flex items-start gap-2 rounded-xl bg-[#FDEEDF] px-4 py-3">
            <TriangleExclamationPoint size={18} className="mt-0.5 shrink-0 text-[#C46A12]" />
            <p className="text-[14px] leading-snug font-semibold text-[#9A520C]">
              {t('crowd.peakAdvice', { h: advice.peak.hour, l: t(LEVEL_KEYS[advice.peak.level]) })}
              {advice.calm && advice.calm.hour !== advice.peak.hour ? ` ${t('crowd.calmAdvice', { h: advice.calm.hour })}` : ''}
            </p>
          </div>
        )}

        {/* 시간대별 */}
        <div className="mt-6 px-5">
          <h2 className="text-[15px] font-bold">{t('crowd.hourly')}</h2>
          <div className="mt-3 flex h-[120px] items-end gap-[3px]">
            {hourly.map((h) => {
              const cur = h.hour === now.getHours()
              return (
                <div key={h.hour} className="flex h-full flex-1 flex-col items-center justify-end">
                  <div
                    className={`w-full rounded-t-[3px] ${cur ? 'ring-2 ring-ink ring-offset-1' : ''}`}
                    style={{ height: `${Math.max(4, (h.index / maxIdx) * 100)}%`, background: LEVEL_COLORS[h.level], opacity: cur ? 1 : 0.8 }}
                    title={`${h.hour}:00 ${t(LEVEL_KEYS[h.level])}`}
                  />
                </div>
              )
            })}
          </div>
          <div className="mt-1 flex justify-between text-[11px] text-ink-2 tabular">
            <span>5</span>
            <span>9</span>
            <span>13</span>
            <span>18</span>
            <span>24</span>
          </div>
        </div>

        {/* 칸별 혼잡도 */}
        <div className="mt-6 border-t border-line px-5 pt-5">
          <h2 className="text-[15px] font-bold">{t('crowd.cars')}</h2>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {st.lines.map((l) => (
              <button key={l} type="button" onClick={() => (setLineSel(l), setDirIdx(0), setCarSel(null))} className={`flex h-9 items-center rounded-full px-2.5 ${l === line ? 'bg-ink' : 'bg-sub'}`}>
                <LineBadge line={l} size={18} />
              </button>
            ))}
            {dirs.map((d, i) => (
              <button key={d.next} type="button" onClick={() => (setDirIdx(i), setCarSel(null))} className={`h-9 rounded-full px-3 text-[13px] font-semibold ${i === dirIdx ? 'bg-brand-light text-brand' : 'bg-sub text-ink-2'}`}>
                {t('dir.toward', { s: stationName(d.toward) })}
              </button>
            ))}
          </div>

          {/* 열차 객실 UI */}
          <div className="mt-4 flex items-center gap-1 text-[12px] font-semibold text-ink-2">
            <span>←</span> {t('crowd.heading')}
          </div>
          <div className="no-scrollbar mt-1 overflow-x-auto pt-2.5 pb-1">
            <div className="flex min-w-max gap-1">
              {cars.cars.map((c, i) => {
                const on = c.car === sel.car
                const best = c.car === cars.best
                return (
                  <button
                    key={c.car}
                    type="button"
                    onClick={() => setCarSel(c.car)}
                    className={`relative flex h-[58px] flex-col items-center justify-center border-2 ${i === 0 ? 'rounded-l-[16px] rounded-r-md' : 'rounded-md'} ${on ? 'border-ink' : 'border-transparent'}`}
                    style={{ background: LEVEL_COLORS[c.level], width: cars.cars.length > 8 ? 31 : 40 }}
                    aria-label={t('crowd.carLabel', { n: c.car, l: t(LEVEL_KEYS[c.level]) })}
                  >
                    <span className="mb-1 flex gap-[2px]">
                      {[0, 1].map((w) => (
                        <span key={w} className="h-[7px] w-[7px] rounded-[2px] bg-white/80" />
                      ))}
                    </span>
                    <span className="text-[12px] font-extrabold text-white tabular">{c.car}</span>
                    {best && <span className="absolute -top-2 rounded-full bg-white px-1 text-[9px] font-extrabold text-ok shadow">{t('crowd.bestTag')}</span>}
                  </button>
                )
              })}
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1">
            {([0, 1, 2, 3] as CongestionLevel[]).map((l) => (
              <span key={l} className="flex items-center gap-1 text-[12px] text-ink-2">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: LEVEL_COLORS[l] }} />
                {t(LEVEL_KEYS[l])}
              </span>
            ))}
          </div>

          <div className="mt-4 rounded-2xl bg-sub p-4">
            <p className="text-[16px] font-bold">{t('crowd.bestCar', { n: cars.best })}</p>
            <p className="mt-0.5 text-[13px] text-ink-2">{t('crowd.boardAt', { n: cars.best })}</p>
            <div className="mt-2 flex items-center gap-2 text-[14px]">
              <span className="font-semibold">{t('crowd.carN', { n: sel.car })}</span>
              <CrowdChip level={sel.level} />
            </div>
          </div>
        </div>

        <div className="mx-5 mt-5 flex items-start gap-2 rounded-xl border border-line p-3">
          <Info size={16} className="mt-0.5 shrink-0 text-ink-2" />
          <p className="text-[12px] leading-relaxed text-ink-2">{t('crowd.sourceNote')}</p>
        </div>
      </div>
      <StationPicker
        open={picker}
        title={t('crowd.pick')}
        onClose={() => setPicker(false)}
        onPick={(id) => {
          setPicked(id)
          setLineSel(null)
          setDirIdx(0)
          setCarSel(null)
          setPicker(false)
        }}
      />
    </div>
  )
}
