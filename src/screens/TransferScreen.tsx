// 스마트 환승 (하단 탭)
// 막대그래프 대신 '하차 → 통로 이동 → 연결 열차'를 숫자로 비교합니다.
// 시각은 예상 시간표(운행 간격 기반), 통로 이동시간은 예시/추정 데이터 — 화면에 항상 데이터 종류를 표시합니다.
import { useEffect, useMemo, useState } from 'react'
import { ArrowDown, CircleCheck, Clock, Footprints, Map as MapIcon, Pause, Play, RotateCcw, Route as RouteIcon, TrainFront, TriangleExclamationPoint } from 'lucide-react'
import TransferPath, { towardOf } from '../components/TransferPath'
import { DataTag, LineBadge, PrimaryButton, ScreenHeader, Segmented } from '../components/ui'
import { hasIndoor } from '../data/indoor'
import { lineName, stationName, t } from '../i18n'
import { TRANSFER_TEXT, transferStatus, transferTimeline } from '../lib/boarding'
import { formatClock, formatMMSS, routeStops } from '../lib/routing'
import { PACE_PRESETS, paceKey, useStore } from '../state/store'
import { useNow } from '../state/useNow'
import { PACE_LABEL } from './RouteScreen'

const clockSec = (d: Date) => `${formatClock(d)}:${String(d.getSeconds()).padStart(2, '0')}`
const signed = (sec: number) => `${sec < 0 ? '−' : ''}${formatMMSS(Math.abs(sec))}`
const human = (sec: number) => {
  const a = Math.abs(Math.round(sec))
  return a >= 60 ? t('unit.minSec', { m: Math.floor(a / 60), s: a % 60 }) : t('unit.sec', { n: a })
}

export default function TransferScreen() {
  const s = useStore()
  const now = useNow(1000)
  const route = s.journeyRoute ?? s.selectedRoute
  const j = s.journey && s.journeyRoute ? s.journey : null
  const stops = route ? routeStops(route) : []

  // 이동 중이면 다음 환승역을 자동 선택
  const upcoming = useMemo(() => {
    if (!route) return 0
    if (!j) return 0
    const idx = route.transfers.findIndex((x) => stops.findIndex((y, k) => k > 0 && y.station === x.station && y.transferTo === x.to) >= j.index)
    return idx < 0 ? Math.max(0, route.transfers.length - 1) : idx
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route?.id, j?.index])
  const [pick, setPick] = useState<number | null>(null)
  const ti = Math.min(pick ?? upcoming, Math.max(0, (route?.transfers.length ?? 1) - 1))

  // 통로 이동 진행 (사용자가 '이동 시작'을 누른 뒤 보행속도 기준 예상 진행 — 실제 위치 추적 아님)
  const [walkStart, setWalkStart] = useState<number | null>(null)
  const [paused, setPaused] = useState<number>(0)
  const [pausedAt, setPausedAt] = useState<number | null>(null)
  const [speedX, setSpeedX] = useState<1 | 5>(1)
  const [done, setDone] = useState(false)
  useEffect(() => {
    setWalkStart(null)
    setPausedAt(null)
    setPaused(0)
    setDone(false)
  }, [ti, route?.id])

  const tl = useMemo(
    () => (route ? transferTimeline({ route, ti, now, journey: j ? { index: j.index, indexAt: j.indexAt ?? j.startedAt } : null, delayOf: (l) => s.statusOf(l).delayMin }) : null),
    // 1초마다 다시 계산
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [route, ti, Math.floor(now.getTime() / 1000), j?.index, j?.indexAt, s.disruptions],
  )

  if (!route)
    return (
      <div className="safe-top absolute inset-0 flex flex-col bg-white">
        <ScreenHeader title={t('tab.transfer')} />
        <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-light text-brand">
            <RouteIcon size={28} />
          </span>
          <p className="mt-4 text-[18px] font-bold">{t('tr2.emptyTitle')}</p>
          <p className="mt-1 text-[14px] text-ink-2">{t('tr2.emptyBody')}</p>
          <div className="mt-6 w-full">
            <PrimaryButton onClick={() => s.setTab('route')}>{t('move.searchSelf')}</PrimaryButton>
          </div>
        </div>
      </div>
    )
  if (!tl)
    return (
      <div className="safe-top absolute inset-0 flex flex-col bg-white">
        <ScreenHeader title={t('tab.transfer')} />
        <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
          <CircleCheck size={40} className="text-ok" />
          <p className="mt-3 text-[18px] font-bold">{t('tr.direct')}</p>
          <button type="button" onClick={() => s.setTab('move')} className="mt-5 h-12 rounded-xl bg-brand-light px-5 font-bold text-brand">
            {t('tr.toTrack')}
          </button>
        </div>
      </div>
    )

  const step = tl.step
  const atStation = tl.arrived
  // 현재 시각 기준(역 도착 후) 또는 하차 예정 기준
  const walkedSec = walkStart ? Math.min(tl.walkSec, (((pausedAt ?? now.getTime()) - walkStart - paused) / 1000) * speedX) : 0
  const walkLeft = Math.max(0, Math.round(tl.walkSec - walkedSec))
  const untilTrain = atStation ? Math.round((tl.target.getTime() - now.getTime()) / 1000) : tl.gapSec
  const marginSec = done ? untilTrain : untilTrain - walkLeft
  const st = done ? null : transferStatus(marginSec)
  const statusText = done ? t('tr.statusDone') : t(TRANSFER_TEXT[st!], { n: Math.max(1, Math.ceil((tl.recommended.getTime() - now.getTime()) / 60000)) })
  const tone = done || st === 'relaxed' ? 'text-ok' : st === 'next' ? 'text-danger' : 'text-[#B57714]'
  const sourceKind = step.info.source // 'sample' | 'estimate'
  const progress = tl.walkSec ? walkedSec / tl.walkSec : 0

  const finish = () => {
    setDone(true)
    setPausedAt(Date.now())
    s.notify({ title: t('tr.doneTitle', { s: stationName(step.station) }), body: t('tr.doneBody', { t: formatMMSS(Math.max(0, untilTrain)) }), tone: 'success' }, { kind: 'transfer' })
    if (s.journey) {
      const idx = tl.stopIdx + 1
      if (idx > s.journey.index) s.setJourneyIndex(idx)
    }
  }

  return (
    <div className="safe-top absolute inset-0 flex flex-col bg-white">
      <ScreenHeader title={t('tab.transfer')} right={<DataTag kind="estimate" />} />
      <div className="no-scrollbar flex-1 overflow-y-auto pb-8">
        <div className="flex flex-wrap items-center gap-2 px-5">
          <span className="text-[19px] font-bold">{t('tr.title', { s: stationName(step.station) })}</span>
          <LineBadge line={step.from} size={20} />
          <span className="text-ink-2">→</span>
          <LineBadge line={step.to} size={20} />
        </div>
        <p className="mt-0.5 px-5 text-[13px] text-ink-2">
          {stationName(route.from)} → {stationName(route.to)} · {lineName(step.to)} {towardOf(route, step.station, step.to)}
        </p>
        {route.transfers.length > 1 && (
          <div className="mt-2 flex flex-wrap gap-1.5 px-5">
            {route.transfers.map((x, i) => (
              <button key={x.station + i} type="button" onClick={() => setPick(i)} className={`h-8 rounded-full px-3 text-[13px] font-semibold ${i === ti ? 'bg-brand text-white' : 'bg-sub text-ink-2'}`}>
                {i + 1}. {stationName(x.station)}
              </button>
            ))}
          </div>
        )}

        {/* 핵심 숫자 비교 */}
        <div className="mx-4 mt-4 overflow-hidden rounded-2xl border border-line">
          <Row icon={<Clock size={17} />} label={atStation ? t('tr2.untilTrainNow') : t('tr2.untilTrainAfter')} value={signed(untilTrain)} sub={human(untilTrain)} strong />
          <Row icon={<Footprints size={17} />} label={walkStart && !done ? t('tr2.walkLeft') : t('tr2.walk')} value={formatMMSS(walkLeft)} sub={t('tr2.walkSub', { m: t('unit.minSec', { m: Math.floor(tl.walkSec / 60), s: tl.walkSec % 60 }) })} />
          <div className="flex items-center gap-3 bg-sub px-4 py-3.5">
            <span className={`flex h-8 w-8 items-center justify-center rounded-full bg-white ${tone}`}>=</span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-ink-2">{t('tr2.margin')}</p>
              <p className="text-[12px] text-ink-2">{marginSec >= 0 ? t('tr2.marginAbout', { t: human(marginSec) }) : t('tr2.short', { t: human(marginSec) })}</p>
            </div>
            <span className={`text-[30px] leading-none font-extrabold tabular ${tone}`}>{signed(marginSec)}</span>
          </div>
        </div>

        <p className={`mx-5 mt-4 flex items-start gap-2 text-[17px] leading-snug font-bold ${tone}`} aria-live="polite">
          {done || st === 'relaxed' ? <CircleCheck size={21} className="mt-0.5 shrink-0" /> : <TriangleExclamationPoint size={21} className="mt-0.5 shrink-0" />}
          {statusText}
        </p>
        {(st === 'tight' || st === 'hurry') && <p className="mx-5 mt-1 text-[13px] font-semibold text-ink-2">{t('dep.noRun')}</p>}
        {st === 'next' && (
          <button type="button" onClick={() => (s.setMoveTab('disruption'), s.setTab('move'))} className="mx-5 mt-2 h-9 rounded-lg bg-sub px-3 text-[13px] font-bold">
            {t('tr.altRoute')}
          </button>
        )}

        {/* 시간 순서 */}
        <div className="mx-4 mt-5 rounded-2xl bg-sub px-4 py-3">
          <div className="mb-1 flex items-center gap-2">
            <h3 className="text-[15px] font-bold">{t('tr2.timeline')}</h3>
            <span className="text-[11px] text-ink-2">{tl.based === 'journey' ? t('tr2.basedJourney') : t('tr2.basedPlan')}</span>
          </div>
          <TimeRow label={t('tr2.alight', { s: stationName(step.station) })} time={clockSec(tl.alightAt)} line={step.from} />
          <Arrow text={t('tr2.walkArrow', { t: human(tl.walkSec) })} />
          <TimeRow label={t('tr2.platform')} time={clockSec(tl.platformAt)} />
          <Arrow text={tl.marginSec >= 0 ? t('tr2.waitArrow', { t: human(tl.marginSec) }) : t('tr2.missArrow')} />
          <TimeRow label={t('tr2.thisTrain')} time={clockSec(tl.target)} line={step.to} dim={tl.marginSec < 0} strike={tl.marginSec < 0} />
          <TimeRow label={tl.marginSec >= 0 ? t('tr2.fallback') : t('tr2.nextRec')} time={clockSec(tl.marginSec >= 0 ? tl.fallback : tl.recommended)} line={step.to} />
          <p className="mt-2 text-[11px] leading-relaxed text-ink-2">{t('tr2.estNote')}</p>
        </div>

        {/* 이동 진행 */}
        <div className="mt-5 flex gap-2 px-4">
          {done ? (
            <PrimaryButton onClick={() => s.setTab('move')}>
              <TrainFront size={19} /> {t('tr.toTrack')}
            </PrimaryButton>
          ) : walkStart ? (
            <>
              <PrimaryButton tone={pausedAt ? 'brand' : 'ink'} onClick={() => (pausedAt ? (setPaused((p) => p + Date.now() - pausedAt), setPausedAt(null)) : setPausedAt(Date.now()))}>
                {pausedAt ? <Play size={19} /> : <Pause size={19} />} {pausedAt ? t('tr.resume') : t('tr.pause')}
              </PrimaryButton>
              <PrimaryButton tone="light" onClick={finish}>
                <CircleCheck size={19} /> {t('tr2.finish')}
              </PrimaryButton>
            </>
          ) : (
            <PrimaryButton onClick={() => setWalkStart(Date.now())}>
              <Play size={19} /> {t('tr.start')}
            </PrimaryButton>
          )}
          <button type="button" aria-label={t('tr.reset')} onClick={() => (setWalkStart(null), setPausedAt(null), setPaused(0), setDone(false))} className="flex h-[54px] w-[54px] shrink-0 items-center justify-center rounded-2xl bg-sub text-ink">
            <RotateCcw size={20} />
          </button>
          <button type="button" onClick={() => setSpeedX((d) => (d === 1 ? 5 : 1))} className={`h-[54px] w-[58px] shrink-0 rounded-2xl text-[15px] font-bold ${speedX === 5 ? 'bg-brand-light text-brand' : 'bg-sub text-ink-2'}`}>
            {speedX}×
          </button>
        </div>
        <p className="mt-2 px-5 text-[12px] leading-relaxed text-ink-2">{t('tr2.walkNote')}</p>

        <div className="mt-5 px-5">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[15px] font-bold">{t('pace.title')}</span>
            <span className="text-[13px] text-ink-2 tabular">{s.walkSpeed.toFixed(2)} m/s</span>
          </div>
          <Segmented value={paceKey(s.walkSpeed)} options={PACE_PRESETS.map((p) => ({ value: p.key, label: t(PACE_LABEL[p.key]) }))} onChange={(k) => s.patch({ walkSpeed: PACE_PRESETS.find((p) => p.key === k)!.speed, measured: false })} />
        </div>

        {/* 단계별 안내 — 검증된/예시 동선 데이터가 있을 때만 */}
        <div className="mt-6 border-t border-line px-5 pt-4">
          <div className="mb-3 flex items-center gap-2">
            <h3 className="text-[15px] font-bold">{t('tr.path')}</h3>
            <DataTag kind={sourceKind === 'sample' ? 'demo' : 'estimate'} />
          </div>
          <TransferPath step={step} route={route} speed={s.walkSpeed} progress={walkStart ? progress : undefined} />
          {hasIndoor(step.station) && (
            <button type="button" onClick={() => s.openPage({ kind: 'indoor', station: step.station })} className="mt-3 flex h-10 items-center gap-1 rounded-lg bg-brand-light px-3 text-[13px] font-bold text-brand">
              <MapIcon size={14} /> {t('in.open')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function Row({ icon, label, value, sub, strong }: { icon: React.ReactNode; label: string; value: string; sub: string; strong?: boolean }) {
  return (
    <div className="flex items-center gap-3 border-b border-line px-4 py-3.5">
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-light text-brand">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-ink-2">{label}</p>
        <p className="text-[12px] text-ink-2">{sub}</p>
      </div>
      <span className={`leading-none font-extrabold tabular ${strong ? 'text-[30px]' : 'text-[26px] text-brand'}`}>{value}</span>
    </div>
  )
}

function TimeRow({ label, time, line, dim, strike }: { label: string; time: string; line?: import('../data/network').LineId; dim?: boolean; strike?: boolean }) {
  return (
    <div className={`flex items-center gap-2 py-1.5 ${dim ? 'text-[#A3AAB8]' : ''}`}>
      {line ? <LineBadge line={line} size={18} /> : <span className="h-[18px] w-[18px] rounded-full border-2 border-[#C5CBD6]" />}
      <span className="flex-1 text-[14px] font-semibold">{label}</span>
      <span className={`text-[15px] font-bold tabular ${strike ? 'line-through' : ''}`}>{time}</span>
    </div>
  )
}

function Arrow({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 py-0.5 pl-[3px] text-[12px] text-ink-2">
      <ArrowDown size={13} /> {text}
    </div>
  )
}
