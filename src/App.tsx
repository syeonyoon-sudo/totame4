import { useEffect, useRef, useState } from 'react'
import { NoticeBanner, PhoneFrame, TabBar } from './components/Shell'
import { towardOf } from './components/TransferPath'
import { lineName, stationName, t } from './i18n'
import { routeStops } from './lib/routing'
import { formatClock } from './lib/routing'
import CongestionScreen from './screens/CongestionScreen'
import ForeignMode from './screens/ForeignMode'
import IndoorNav from './screens/IndoorNav'
import PremiumScreen from './screens/PremiumScreen'
import ReportScreen from './screens/ReportScreen'
import AlarmSettingsScreen from './screens/AlarmSettings'
import DepartureScreen from './screens/DepartureScreen'
import TransferScreen from './screens/TransferScreen'
import TodayScreen from './screens/TodayScreen'
import { GRACE_MS, buildEvents, readLog, readTest, writeLog, type AlarmLog } from './lib/alarms'
import { transferTimeline } from './lib/boarding'
import { remainingMinutes } from './lib/routing'
import { EXIT_MIN, at } from './lib/schedule'
import { useApptPlans } from './state/plans'
import type { Tab } from './state/store'
import { Modal } from './components/Overlays'
import { PrimaryButton } from './components/ui'
import { confirmFromUrl } from './services/premium'
import HomeScreen from './screens/HomeScreen'
import MoveScreen from './screens/MoveScreen'
import MyScreen from './screens/MyScreen'
import RouteScreen from './screens/RouteScreen'
import { StoreProvider, useStore } from './state/store'

/** 이동 중 상태 감시: 자동 진행 · 환승 사전 알림 · 하차 사전 알림 · 도착 알림 · 이동 기록 저장 */
function JourneyEngine() {
  const s = useStore()
  const j = s.journey
  const last = useRef<{ id: string; index: number } | null>(null)

  useEffect(() => {
    if (!j?.auto || j.arrived) return
    const id = setInterval(() => s.advance(1), 3500)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [j?.auto, j?.arrived])

  // 도착 시 기록 저장 (한 번만) + 오늘 일정 도착 처리
  useEffect(() => {
    if (j?.arrived && !j.recorded && s.journeyRoute) {
      s.recordJourney(j, s.journeyRoute)
      s.setJourney({ ...j, recorded: true })
      if (j.apptId) s.patchAppt(j.apptId, j.leg === 'home' ? { homeArrivedAt: new Date().toISOString() } : { arrivedAt: new Date().toISOString() })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [j?.arrived])

  useEffect(() => {
    if (!j) {
      last.current = null
      return
    }
    const prev = last.current
    last.current = { id: j.route.id, index: j.index }
    if (!prev || prev.id !== j.route.id || prev.index === j.index) return
    const route = j.route
    const stops = routeStops(route)
    const left = stops.length - 1 - j.index
    const cur = stops[j.index]
    const dest = stationName(route.to)
    const n = s.alerts
    const A = s.alarm
    const base = `jr@${j.startedAt}:${j.index}`

    if (left === 0) {
      if (A.alight.on && A.alight.items.arrive) {
        const used = s.notify({ title: t('alert.arrivedTitle', { s: dest }), body: t('alert.arrivedBody'), tone: 'success' }, { kind: 'arrival', silent: !j.alertOn, duration: 6000, tag: base })
        if (j.alertOn) logAlarm(`${base}:arrive`, 'alight', t('alert.arrivedTitle', { s: dest }), used)
      }
      return
    }
    // 하차 사전 알림 (여러 시점: 예 2정거장 전 · 1정거장 전)
    if (j.alertOn && A.alight.on && A.alight.items.before && A.alight.offsets.includes(left)) {
      const title = left === 1 ? t('alert.alightTitle', { s: dest }) : t('alert.alightTitleN', { n: left, s: dest })
      const used = s.notify({ title, body: t('alert.alightBody'), tone: 'warn' }, { kind: 'alight', duration: 6000, tag: base, url: '/move' })
      logAlarm(`${base}:alight:${left}`, 'alight', title, used)
      return
    }
    // 환승 사전 알림 (n정거장 전) + 환승 방향
    const nextTi = stops.findIndex((x, i) => i >= j.index && x.transferTo)
    if (nextTi >= 0) {
      const tr = route.transfers.find((x) => x.station === stops[nextTi].station)
      const dist = nextTi - j.index
      if (tr && j.alertOn && A.transfer.on && A.transfer.items.before && dist > 0 && A.transfer.offsets.includes(dist)) {
        const dir = A.transfer.items.direction && n.directionOn ? `${lineName(tr.to)} ${towardOf(route, tr.station, tr.to)}` : ''
        const door = tr.info.source === 'sample' ? t('station.door', { d: tr.info.door }) : ''
        const title = t('alert.transferSoon', { s: stationName(tr.station), n: dist })
        const used = s.notify({ title, body: [door, dir].filter(Boolean).join(' · ') || undefined, tone: 'info' }, { kind: 'transfer', duration: 6000, tag: base, url: '/transfer' })
        logAlarm(`${base}:tr:before`, 'transfer', title, used)
        return
      }
    }
    if (cur.transferTo && A.transfer.on) {
      const tr = route.transfers.find((x) => x.station === cur.station)
      const ti = route.transfers.findIndex((x) => x.station === cur.station)
      // 환승 시간 부족 여부 (예상 시간표 기준)
      const tl = ti >= 0 ? transferTimeline({ route, ti, now: new Date(), journey: { index: j.index, indexAt: Date.now() }, delayOf: (l) => s.statusOf(l).delayMin }) : null
      if (tl && A.transfer.items.short && (tl.status === 'tight' || tl.status === 'next') && j.alertOn) {
        const title = tl.status === 'next' ? t('al.trShort') : t('tr.statusTight')
        const used = s.notify({ title, body: t('al.trShortBody', { t: formatClock(tl.recommended) }), tone: 'warn', action: { label: t('alert.openTransfer'), run: () => s.setTab('transfer') } }, { kind: 'transfer', duration: 7000, tag: base, url: '/transfer' })
        logAlarm(`${base}:tr:short`, 'transfer', title, used)
        return
      }
      if (!A.transfer.items.alight) return
      const body = [
        A.transfer.items.direction && n.directionOn && tr ? `${lineName(tr.to)} ${towardOf(route, tr.station, tr.to)}` : '',
        A.transfer.items.passage && n.passageOn && tr ? (tr.info.source === 'sample' ? t('alert.passage', { m: tr.info.walk, e: tr.elevator ? t('alert.byElevator') : t('alert.byStairs') }) : t('al.passageEst', { t: Math.max(1, Math.round(tr.seconds / 60)) })) : '',
      ]
        .filter(Boolean)
        .join(' · ')
      const title = t('alert.transferNow', { s: stationName(cur.station) })
      const used = s.notify({ title, body, tone: 'info', action: { label: t('alert.openTransfer'), run: () => s.setTab('transfer') } }, { kind: 'transfer', silent: !j.alertOn, duration: 6000, tag: base, url: '/transfer' })
      if (j.alertOn) logAlarm(`${base}:tr:alight`, 'transfer', title, used)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [j?.index, j?.route.id])

  useEffect(() => {
    document.documentElement.classList.toggle('large-text', s.largeText)
  }, [s.largeText])

  // 운행 지연 발생 시 이동 중 경로에 영향이 있으면 푸시 알림 + 도착시간 재계산(경로 재평가는 store에서 자동)
  const prevDelay = useRef(0)
  useEffect(() => {
    if (!j) return
    const lines = [...new Set(j.route.segments.map((g) => g.line))]
    const total = lines.reduce((a, l) => a + s.statusOf(l).delayMin, 0)
    const susp = lines.some((l) => s.statusOf(l).suspended)
    if (total > prevDelay.current || susp) {
      s.notify(
        { title: susp ? t('delay.suspended') : t('delay.pushTitle', { n: total }), body: t('delay.pushBody'), tone: 'danger', action: { label: t('dis.alts'), run: () => (s.setMoveTab('disruption'), s.setTab('move')) } },
        { kind: 'transfer', duration: 6000 },
      )
    }
    prevDelay.current = total
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.disruptions])

  return null
}

/** 발송 기록 남기기 (MY > 알림 설정 > 발송 기록) */
function logAlarm(key: string, cat: AlarmLog['cat'], title: string, channels: string[], body?: string) {
  const log = readLog()
  if (log.some((l) => l.key === key)) return
  const now = new Date().toISOString()
  writeLog([...log, { key, cat, title, body, fireAt: now, at: now, status: 'sent', channels }])
  window.dispatchEvent(new Event('totame:alarmlog'))
}

const GO_TAB: Record<string, Tab> = { depart: 'depart', today: 'today', move: 'move', transfer: 'transfer' }

/**
 * 시간 기반 다중·반복 알림 스케줄러 (앱이 열려 있는 동안 동작)
 * 일정·출발 도우미·이동 상태로부터 알림 목록을 매번 다시 계산하므로 일정 변경 시 자동 재예약, 삭제·출발·취소 시 자동 중단됩니다.
 */
function AlarmEngine() {
  const s = useStore()
  const { plans } = useApptPlans(20000)
  const [tick, setTick] = useState(0)
  const delaySeen = useRef<Record<string, number>>({})

  useEffect(() => {
    const bump = () => setTick((x) => x + 1)
    const id = setInterval(bump, 5000)
    document.addEventListener('visibilitychange', bump)
    window.addEventListener('totame:alarmtest', bump)
    window.addEventListener('focus', bump)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', bump)
      window.removeEventListener('totame:alarmtest', bump)
      window.removeEventListener('focus', bump)
    }
  }, [])

  useEffect(() => {
    const now = new Date()
    const w = s.boardingWatch
    const j = s.journey && s.journeyRoute ? s.journey : null
    const events = buildEvents({
      appts: plans.map((p) => ({ a: p.a, go: p.go, back: p.back, homeLabel: p.homeLabel })),
      watch: w ? { station: w.station, line: w.line, toward: w.toward, distanceM: w.distanceM, trainAt: new Date(w.trainAt), leaveBy: new Date(w.leaveBy), mustCatch: w.mustCatch, setAt: new Date(w.setAt), walkSpeed: s.walkSpeed, delayMin: s.statusOf(w.line).delayMin } : null,
      journey: j ? { route: s.journeyRoute!, index: j.index, indexAt: j.indexAt ?? j.startedAt, startedAt: j.startedAt, arrived: j.arrived, alertOn: j.alertOn } : null,
      settings: s.alarm,
      now,
      test: readTest(),
    })
    const log = readLog()
    const fired = new Set(log.map((l) => l.key))
    const add: AlarmLog[] = []
    let sent = false
    for (const e of events) {
      if (fired.has(e.key) || e.fireAt > now) continue
      if (now.getTime() - e.fireAt.getTime() > GRACE_MS) {
        // 앱이 닫혀 있던 동안 놓친 알림 — 한꺼번에 보내지 않고 '미발송'으로 기록
        if (e.scheduledAt.getTime() < e.fireAt.getTime()) add.push({ key: e.key, cat: e.cat, title: e.title, body: e.body, fireAt: e.fireAt.toISOString(), at: now.toISOString(), status: 'missed', channels: [] })
        continue
      }
      if (sent) continue // 한 번에 하나씩 (다음 주기에 이어서 발송)
      const go = e.go ? GO_TAB[e.go] : undefined
      const channels = s.notify(
        { title: e.title, body: e.body, tone: e.tone, action: go ? { label: t('al.open'), run: () => s.setTab(go) } : undefined },
        { kind: 'alarm', duration: 8000, tag: e.key, url: go ? `/${go}` : '/today' },
      )
      add.push({ key: e.key, cat: e.cat, title: e.title, body: e.body, fireAt: e.fireAt.toISOString(), at: now.toISOString(), status: 'sent', channels })
      sent = true
    }

    // 일정 경로 지연 → 도착 예정 재계산 알림 / 이동 중 약속 지각 경고
    for (const p of plans) {
      const { a, go } = p
      if (a.canceled || a.muted || !go || a.arrivedAt || !s.alarm.appt.on) continue
      const prev = delaySeen.current[a.id] ?? 0
      if (s.alarm.appt.items.delay && go.delayMin > prev && !sent) {
        const key = `${a.id}@${a.updatedAt}:delay:${go.delayMin}`
        if (!fired.has(key)) {
          const title = t('al.apptDelay')
          const body = `${a.title || a.placeName} · ${t('al.leaveAt', { t: formatClock(go.leaveAt) })}`
          const channels = s.notify({ title, body, tone: 'danger', action: { label: t('al.open'), run: () => s.setTab('today') } }, { kind: 'alarm', duration: 8000, tag: key })
          add.push({ key, cat: 'appt', title, body, fireAt: now.toISOString(), at: now.toISOString(), status: 'sent', channels })
          sent = true
        }
      }
      delaySeen.current[a.id] = go.delayMin
      if (s.alarm.appt.items.late && j && j.apptId === a.id && j.leg !== 'home' && !j.arrived && !sent) {
        const eta = now.getTime() + (remainingMinutes(s.journeyRoute!, j.index) + a.walkMin + EXIT_MIN) * 60000
        const late = Math.round((eta - at(a.date, a.time).getTime()) / 60000)
        const key = `${a.id}:late:${j.startedAt}`
        if (late > 0 && !fired.has(key)) {
          const title = t('today.lateWarn', { n: late })
          const channels = s.notify({ title, body: t('al.lateBody', { t: formatClock(new Date(eta)) }), tone: 'danger', action: { label: t('al.open'), run: () => s.setTab('today') } }, { kind: 'alarm', duration: 8000, tag: key })
          add.push({ key, cat: 'appt', title, fireAt: now.toISOString(), at: now.toISOString(), status: 'sent', channels })
          sent = true
        }
      }
    }
    if (add.length) {
      writeLog([...log, ...add])
      window.dispatchEvent(new Event('totame:alarmlog'))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, plans, s.boardingWatch, s.journey?.index, s.journey?.arrived, s.alarm])

  return null
}

/** 결제 리다이렉트(/pay/success, /pay/fail) 처리 — 서버 승인 결과로만 구독 활성화 */
function PaymentReturn() {
  const s = useStore()
  const done = useRef(false)
  useEffect(() => {
    if (done.current) return
    done.current = true
    void confirmFromUrl().then((r) => {
      if (!r) return
      try {
        window.history.replaceState(null, '', '/my')
      } catch {
        /* noop */
      }
      s.setTab('my')
      s.openPage({ kind: 'premium' })
      if (r.ok) {
        s.setSubscription(r.sub)
        s.notify({ title: t('pro.paySuccess'), body: r.sub.testMode ? t('pro.testPaid') : undefined, tone: 'success' }, { kind: 'system' })
      } else s.notify({ title: t('pro.payFail'), body: r.message ?? r.code, tone: 'danger' }, { kind: 'system', duration: 7000 })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return null
}

/** 위치정보 이용 동의 */
function LocationConsent() {
  const s = useStore()
  if (!s.consentAsk) return null
  const run = s.consentAsk
  return (
    <Modal
      open
      onClose={() => s.setConsentAsk(null)}
      title={t('consent.title')}
      footer={
        <div className="space-y-2">
          <PrimaryButton
            onClick={() => {
              s.patch({ locationConsent: true })
              s.setConsentAsk(null)
              run()
            }}
          >
            {t('consent.agree')}
          </PrimaryButton>
          <PrimaryButton tone="light" onClick={() => (s.patch({ locationConsent: false }), s.setConsentAsk(null))}>
            {t('consent.decline')}
          </PrimaryButton>
        </div>
      }
    >
      <div className="space-y-2 px-5 pb-2 text-[14px] leading-relaxed">
        <p>{t('consent.body')}</p>
        <ul className="list-disc space-y-1 pl-5 text-[13px] text-ink-2">
          <li>{t('consent.p1')}</li>
          <li>{t('consent.p2')}</li>
          <li>{t('consent.p3')}</li>
        </ul>
      </div>
    </Modal>
  )
}

function Screens() {
  const { tab, homeView, pages, closePage, lang } = useStore()
  return (
    <div className="flex h-full flex-col" key={lang}>
      <main className="relative min-h-0 flex-1 overflow-hidden">
        {tab === 'home' && (homeView === 'route' ? <RouteScreen /> : <HomeScreen />)}
        {tab === 'depart' && <DepartureScreen />}
        {tab === 'move' && <MoveScreen />}
        {tab === 'transfer' && <TransferScreen />}
        {tab === 'today' && <TodayScreen />}
        {tab === 'my' && <MyScreen />}
        {/* 화면 스택: 아래 화면은 숨겨진 채 상태를 유지 */}
        {pages.map((page, i) => (
          <div key={page.kind} className={i === pages.length - 1 ? 'contents' : 'hidden'}>
            {page.kind === 'report' && <ReportScreen onClose={closePage} />}
            {page.kind === 'alarms' && <AlarmSettingsScreen onClose={closePage} />}
            {page.kind === 'crowd' && <CongestionScreen key={page.station ?? ''} initialStation={page.station} onClose={closePage} />}
            {page.kind === 'indoor' && <IndoorNav key={page.station + (page.to ?? '')} station={page.station} from={page.from} to={page.to} onClose={closePage} />}
            {page.kind === 'foreign' && <ForeignMode key={page.section ?? ''} initial={page.section} onClose={closePage} />}
            {page.kind === 'premium' && <PremiumScreen onClose={closePage} />}
          </div>
        ))}
        <LocationConsent />
      </main>
      <TabBar />
      <NoticeBanner />
      <JourneyEngine />
      <AlarmEngine />
      <PaymentReturn />
    </div>
  )
}

export default function App() {
  return (
    <StoreProvider>
      <PhoneFrame>
        <Screens />
      </PhoneFrame>
    </StoreProvider>
  )
}
