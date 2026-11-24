import { ArrowLeftRight, Ban, CableCar, Footprints, TrainFront } from 'lucide-react'
import { getLang, t, stationName } from '../i18n'
import { towardStation, type Route, type TransferStep } from '../lib/routing'
import type { LineId } from '../data/network'
import { LineBadge } from './ui'

export function towardOf(route: Route, station: string, line: LineId) {
  const term = towardStation(route, station, line)
  return term ? t('dir.toward', { s: stationName(term) }) : ''
}

const secText = (s: number) => (s < 60 ? t('unit.sec', { n: s }) : t('unit.minSec', { m: Math.floor(s / 60), s: s % 60 }))

/** 역사 내부 환승 동선 (Station Intelligence) */
export default function TransferPath({ step, route, speed, progress }: { step: TransferStep; route: Route; speed: number; progress?: number }) {
  // 역별 동선 데이터가 없으면(추정값) 승강장 위치·방향·거리를 만들어내지 않음
  if (step.info.source === 'estimate')
    return (
      <div className="rounded-xl bg-sub px-4 py-3 text-[13px] leading-relaxed text-ink-2">
        <p className="flex items-center gap-1.5 font-bold text-ink">
          <ArrowLeftRight size={15} /> {t('tp.noData')}
        </p>
        <p className="mt-1">{t('tp.noDataBody', { line: '', s: stationName(step.station) })}</p>
        <p className="mt-1 flex items-center gap-1.5">
          <LineBadge line={step.from} size={16} /> → <LineBadge line={step.to} size={16} /> {towardOf(route, step.station, step.to)}
        </p>
      </div>
    )
  const vertical = step.elevator ? 35 : Math.round(25 * (1.2 / speed) + 10)
  const walkSec = Math.round(step.info.walk / speed)
  const items = [
    {
      icon: <TrainFront size={16} />,
      title: (
        <span className="flex flex-wrap items-center gap-1.5">
          <LineBadge line={step.from} size={18} /> {t('tp.alight', { door: step.info.door })}
        </span>
      ),
      sub: step.elevator ? t('tp.nearElevator') : t('tp.nearStairs'),
      sec: 10,
    },
    step.elevatorBroken
      ? { icon: <Ban size={16} />, title: t('tp.elevatorBroken'), sub: t('tp.elevatorBrokenSub'), sec: vertical, danger: true }
      : step.elevator
        ? { icon: <CableCar size={16} />, title: t('tp.elevator'), sub: t('tp.noStairs'), sec: vertical }
        : { icon: <Footprints size={16} />, title: step.info.escalator ? t('tp.escalator') : t('tp.stairs'), sub: t('tp.hasStairs'), sec: vertical, warn: true },
    {
      icon: <ArrowLeftRight size={16} />,
      title: t('tp.passage', { m: step.info.walk }),
      sub: step.closed ? t('tp.closed') : getLang() === 'ko' ? step.info.passage : t('data.demo'),
      sec: walkSec,
      danger: step.closed,
    },
    {
      icon: <TrainFront size={16} />,
      title: (
        <span className="flex flex-wrap items-center gap-1.5">
          <LineBadge line={step.to} size={18} /> {t('tp.platform')} · {towardOf(route, step.station, step.to)}
        </span>
      ),
      sub: t('tp.wait'),
      sec: 10,
    },
  ]
  const total = items.reduce((a, i) => a + i.sec, 0)
  let acc = 0
  return (
    <ol className="relative">
      {items.map((it, i) => {
        const startP = acc / total
        acc += it.sec
        const done = progress !== undefined && progress >= acc / total
        const active = progress !== undefined && !done && progress >= startP
        const color = 'danger' in it && it.danger ? 'text-danger bg-[#FBEAEA]' : 'warn' in it && it.warn ? 'text-[#B57714] bg-[#FCF3E4]' : done || active ? 'text-white bg-brand' : 'text-brand bg-brand-light'
        return (
          <li key={i} className="relative flex gap-3 pb-4 last:pb-0">
            {i < items.length - 1 && <span className={`absolute top-8 bottom-0 left-[15px] w-[2px] ${done ? 'bg-brand' : 'bg-line'}`} />}
            <span className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${color} ${active ? 'ring-4 ring-brand/20' : ''}`}>{it.icon}</span>
            <div className="min-w-0 flex-1 pt-1">
              <div className="flex items-baseline justify-between gap-2">
                <div className={`text-[15px] font-semibold ${'danger' in it && it.danger ? 'text-danger' : ''}`}>{it.title}</div>
                <span className="shrink-0 text-[13px] text-ink-2 tabular">{secText(it.sec)}</span>
              </div>
              <p className="text-[13px] text-ink-2">{it.sub}</p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
