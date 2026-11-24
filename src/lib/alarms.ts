// ─────────────────────────────────────────────────────────────
// 다중 · 반복 알림 스케줄러
//  - 카테고리별 규칙(여러 시점 + 반복 간격 + 반복 횟수 + 세부 항목 on/off)
//  - 현재 상태(일정 · 출발 도우미 · 이동 중)로부터 알림 목록을 매번 계산 → 일정 변경 시 자동 재예약, 삭제 시 자동 취소
//  - 발송 기록(localStorage)으로 중복 방지, 반복 중단 조건(출발 · 이동 시작 · 하차 · 취소 · 사용자 중단) 반영
//  ※ 웹(PWA)은 앱이 열려 있을 때만 정확한 시각에 알림을 보낼 수 있습니다. 앱이 닫힌 상태의 예약 알림은
//    서버 푸시(Web Push + VAPID + 예약 작업)가 필요합니다. — README 참고
// ─────────────────────────────────────────────────────────────
import { stationName, t, type MessageKey } from '../i18n'
import { planBoarding } from './boarding'
import { formatClock, routeStops, type Route } from './routing'
import { at, type Appointment, type TripPlan } from './schedule'

export type AlarmCat = 'appt' | 'boarding' | 'transfer' | 'alight' | 'home' | 'lastTrain'
export const ALARM_CATS: AlarmCat[] = ['appt', 'boarding', 'transfer', 'alight', 'home', 'lastTrain']

export interface AlarmRule {
  on: boolean
  /** 시간 기반: n분 전 / 정거장 기반(환승·하차): n정거장 전 */
  offsets: number[]
  /** 반복 간격(분) — 0이면 반복 안 함 */
  repeatMin: number
  /** 반복 횟수 (종료 조건) */
  repeatCount: number
  items: Record<string, boolean>
}
export type AlarmSettings = Record<AlarmCat, AlarmRule>

/** 카테고리별 세부 항목 */
export const ALARM_ITEMS: Record<AlarmCat, string[]> = {
  appt: ['offsets', 'notDeparted', 'delay', 'late'],
  boarding: ['prepare', 'imminent', 'difficult'],
  transfer: ['before', 'alight', 'direction', 'passage', 'short'],
  alight: ['before', 'arrive', 'extra'],
  home: ['offsets', 'notDeparted'],
  lastTrain: ['leave', 'imminent', 'difficult'],
}
/** 고를 수 있는 시점 */
export const OFFSET_CHOICES: Record<AlarmCat, number[]> = {
  appt: [60, 45, 30, 20, 15, 10, 5, 0],
  boarding: [10, 5, 3, 2, 1],
  transfer: [3, 2, 1],
  alight: [3, 2, 1],
  home: [60, 45, 30, 20, 15, 10, 5, 0],
  lastTrain: [90, 60, 30, 15],
}
/** 시점 단위: 분 / 정거장 */
export const OFFSET_UNIT: Record<AlarmCat, 'min' | 'stop'> = { appt: 'min', boarding: 'min', transfer: 'stop', alight: 'stop', home: 'min', lastTrain: 'min' }
export const REPEAT_CHOICES = [0, 3, 5, 10]

const all = (cat: AlarmCat) => Object.fromEntries(ALARM_ITEMS[cat].map((k) => [k, true]))

/** 권장 기본값 */
export const DEFAULT_ALARMS: AlarmSettings = {
  appt: { on: true, offsets: [30, 15, 0], repeatMin: 5, repeatCount: 3, items: all('appt') },
  boarding: { on: true, offsets: [3], repeatMin: 0, repeatCount: 2, items: all('boarding') },
  transfer: { on: true, offsets: [1], repeatMin: 0, repeatCount: 1, items: all('transfer') },
  alight: { on: true, offsets: [2, 1], repeatMin: 1, repeatCount: 2, items: all('alight') },
  home: { on: true, offsets: [30, 15, 0], repeatMin: 5, repeatCount: 3, items: all('home') },
  lastTrain: { on: true, offsets: [60, 30], repeatMin: 0, repeatCount: 1, items: all('lastTrain') },
}

export function mergeAlarms(p?: Partial<AlarmSettings>): AlarmSettings {
  const out = {} as AlarmSettings
  for (const c of ALARM_CATS) {
    const d = DEFAULT_ALARMS[c]
    const v = p?.[c]
    out[c] = v ? { ...d, ...v, items: { ...d.items, ...(v.items ?? {}) }, offsets: Array.isArray(v.offsets) ? v.offsets : d.offsets } : d
  }
  return out
}

// ── 발송 기록 (중복 방지 · 기록 화면) ─────────────────────────
export interface AlarmLog {
  key: string
  cat: AlarmCat | 'test'
  title: string
  body?: string
  /** 예정 시각 */
  fireAt: string
  /** 실제 처리 시각 */
  at: string
  status: 'sent' | 'missed'
  /** 실제 사용된 출력 방식 */
  channels: string[]
}
const LOG_KEY = 'totame:alarmlog:v1'
export function readLog(): AlarmLog[] {
  try {
    return JSON.parse(localStorage.getItem(LOG_KEY) ?? '[]') as AlarmLog[]
  } catch {
    return []
  }
}
export function writeLog(entries: AlarmLog[]) {
  try {
    const cut = Date.now() - 3 * 86400_000
    localStorage.setItem(LOG_KEY, JSON.stringify(entries.filter((e) => new Date(e.at).getTime() > cut).slice(-150)))
  } catch {
    /* noop */
  }
}
export function clearLog() {
  try {
    localStorage.removeItem(LOG_KEY)
  } catch {
    /* noop */
  }
}

// ── 테스트 예약 (실제 스케줄러 경로로 발송되는지 확인) ───────────
const TEST_KEY = 'totame:alarmtest:v1'
export function scheduleTest(sec: number) {
  try {
    localStorage.setItem(TEST_KEY, JSON.stringify({ id: Date.now(), at: Date.now() + sec * 1000 }))
  } catch {
    /* noop */
  }
}
export function readTest(): { id: number; at: number } | null {
  try {
    return JSON.parse(localStorage.getItem(TEST_KEY) ?? 'null') as { id: number; at: number } | null
  } catch {
    return null
  }
}

// ── 알림 이벤트 계산 ───────────────────────────────────────────
export interface AlarmEvent {
  key: string
  cat: AlarmCat | 'test'
  fireAt: Date
  /** 이 알림이 예약된 시각 — 이보다 나중 시각에 놓친 알림만 '미발송'으로 기록 */
  scheduledAt: Date
  title: string
  body?: string
  tone: 'info' | 'warn' | 'danger' | 'success'
  apptId?: string
  go?: 'depart' | 'today' | 'move' | 'transfer'
}

export interface ReturnPlan extends TripPlan {
  targetLeaveAt: Date
  lastLeaveAt: Date | null
  lastTrainBinding: boolean
  endAt: Date
}

export interface ApptCtx {
  a: Appointment
  /** 귀가 목적지 이름 (집 / 사용자 지정) */
  homeLabel: string
  go: TripPlan | null
  back: ReturnPlan | null
}

const msg = (k: MessageKey, v?: Record<string, string | number>) => t(k, v)
const hm = (min: number) => {
  const m = Math.max(0, Math.round(min))
  return m >= 60 ? msg('time.hm', { h: Math.floor(m / 60), m: m % 60 }) : msg('time.m', { m })
}

function apptEvents(c: ApptCtx, rule: AlarmSettings, now: Date): AlarmEvent[] {
  const { a, go } = c
  const out: AlarmEvent[] = []
  if (a.canceled || a.muted) return out
  const sched = new Date(a.updatedAt)
  const base = `${a.id}@${a.updatedAt}`
  const apptAt = at(a.date, a.time)
  const label = `${a.title || a.placeName} · ${formatClock(apptAt)}`
  // 약속 출발
  const r = rule.appt
  if (r.on && go && !a.departedAt && !a.arrivedAt) {
    const offs = (a.alerts.offsets.length ? a.alerts.offsets : r.offsets).slice().sort((x, y) => y - x)
    if (r.items.offsets)
      offs.forEach((off) => {
        const fireAt = new Date(go.leaveAt.getTime() - off * 60000)
        const left = (apptAt.getTime() - fireAt.getTime()) / 60000
        const title = off === 0 ? msg('al.apptNow') : off === offs[0] ? msg('al.apptPrepare', { t: hm(left) }) : msg('al.apptIn', { n: off })
        out.push({ key: `${base}:appt:o${off}`, cat: 'appt', fireAt, scheduledAt: sched, title, body: `${label} · ${msg('al.leaveAt', { t: formatClock(go.leaveAt) })}`, tone: off === 0 ? 'warn' : 'info', apptId: a.id, go: 'today' })
      })
    const rep = a.alerts.repeatMin || r.repeatMin
    const cnt = a.alerts.repeatMin ? a.alerts.repeatCount : r.repeatCount
    if (r.items.notDeparted && rep > 0)
      for (let k = 1; k <= cnt; k++) {
        const fireAt = new Date(go.leaveAt.getTime() + k * rep * 60000)
        const eta = new Date(fireAt.getTime() + (go.totalMin - go.bufferMin) * 60000)
        const late = Math.round((eta.getTime() - apptAt.getTime()) / 60000)
        out.push({
          key: `${base}:appt:r${k}`,
          cat: 'appt',
          fireAt,
          scheduledAt: sched,
          title: late > 0 ? msg('al.apptLate', { n: late }) : msg('al.apptNotYet'),
          body: `${label} · ${msg('al.etaIfNow', { t: formatClock(eta) })}`,
          tone: late > 0 ? 'danger' : 'warn',
          apptId: a.id,
          go: 'today',
        })
      }
  }
  // 귀가
  const b = c.back
  const h = rule.home
  if (b && h.on && !a.homeDepartedAt && !a.homeArrivedAt) {
    const offs = h.offsets.slice().sort((x, y) => y - x)
    const target = at(a.date, a.homeTarget)
    if (h.items.offsets)
      offs.forEach((off) => {
        const fireAt = new Date(b.leaveAt.getTime() - off * 60000)
        const title = off === 0 ? (b.lastTrainBinding ? msg('al.lastSoon') : msg('al.homeNow')) : off === offs[0] ? msg('al.homeUp', { p: c.homeLabel, t: formatClock(target) }) : msg('al.homeIn', { n: off })
        out.push({ key: `${base}:home:o${off}`, cat: 'home', fireAt, scheduledAt: sched, title, body: msg('al.homeBody', { t: formatClock(b.leaveAt), a: formatClock(b.arriveAt) }), tone: off === 0 ? 'warn' : 'info', apptId: a.id, go: 'today' })
      })
    if (h.items.notDeparted && h.repeatMin > 0)
      for (let k = 1; k <= h.repeatCount; k++) {
        const fireAt = new Date(b.leaveAt.getTime() + k * h.repeatMin * 60000)
        const eta = new Date(fireAt.getTime() + (b.totalMin - b.bufferMin) * 60000)
        const miss = eta > target || (b.lastLeaveAt !== null && fireAt > b.lastLeaveAt)
        out.push({ key: `${base}:home:r${k}`, cat: 'home', fireAt, scheduledAt: sched, title: miss ? msg('al.homeHard') : msg('al.homeNotYet'), body: msg('al.etaIfNow', { t: formatClock(eta) }), tone: miss ? 'danger' : 'warn', apptId: a.id, go: 'today' })
      }
  }
  // 막차 (예상)
  const l = rule.lastTrain
  if (b && b.lastLeaveAt && a.lastTrainAlert && l.on && !a.homeDepartedAt && !a.homeArrivedAt) {
    const last = b.lastLeaveAt
    if (l.items.leave)
      l.offsets.forEach((off) =>
        out.push({ key: `${base}:last:o${off}`, cat: 'lastTrain', fireAt: new Date(last.getTime() - off * 60000), scheduledAt: sched, title: msg('al.lastLeave', { t: formatClock(last) }), body: msg('al.lastEst'), tone: 'warn', apptId: a.id, go: 'today' }),
      )
    if (l.items.imminent) out.push({ key: `${base}:last:imm`, cat: 'lastTrain', fireAt: new Date(last.getTime() - 5 * 60000), scheduledAt: sched, title: msg('al.lastSoon'), body: msg('al.lastLeave', { t: formatClock(last) }), tone: 'danger', apptId: a.id, go: 'today' })
    if (l.items.difficult) out.push({ key: `${base}:last:hard`, cat: 'lastTrain', fireAt: new Date(last.getTime() + 60000), scheduledAt: sched, title: msg('al.lastHard'), body: msg('al.lastAlt'), tone: 'danger', apptId: a.id, go: 'today' })
  }
  void now
  return out
}

export interface WatchCtx {
  station: string
  line: import('../data/network').LineId
  toward: string
  distanceM: number
  trainAt: Date
  leaveBy: Date
  mustCatch: boolean
  setAt: Date
  walkSpeed: number
  delayMin: number
}

function boardingEvents(w: WatchCtx, r: AlarmRule): AlarmEvent[] {
  if (!r.on) return []
  const out: AlarmEvent[] = []
  const base = `board@${w.setAt.toISOString()}`
  const st = stationName(w.station)
  const train = formatClock(w.trainAt)
  if (r.items.prepare)
    r.offsets.forEach((off) => out.push({ key: `${base}:p${off}`, cat: 'boarding', fireAt: new Date(w.leaveBy.getTime() - off * 60000), scheduledAt: w.setAt, title: msg('al.boardIn', { n: off, t: train }), body: msg('al.boardBody', { s: st, t: formatClock(w.leaveBy) }), tone: 'info', go: 'depart' }))
  if (r.items.imminent) {
    out.push({ key: `${base}:imm`, cat: 'boarding', fireAt: w.leaveBy, scheduledAt: w.setAt, title: w.mustCatch ? msg('dep.enough') : msg('al.boardNow', { t: train }), body: msg('al.boardBody', { s: st, t: formatClock(w.leaveBy) }), tone: 'warn', go: 'depart' })
    // 반복: 아직 출발하지 않았다면 그 시점 기준 다음 열차를 다시 계산해 안내
    if (r.repeatMin > 0)
      for (let k = 1; k <= r.repeatCount; k++) {
        const fireAt = new Date(w.leaveBy.getTime() + k * r.repeatMin * 60000)
        const p = planBoarding({ station: w.station, line: w.line, toward: w.toward, distanceM: w.distanceM, mode: 'walk', walkSpeed: w.walkSpeed, now: fireAt, delayMin: w.delayMin })
        out.push({ key: `${base}:r${k}`, cat: 'boarding', fireAt, scheduledAt: w.setAt, title: msg('al.boardRepeat'), body: msg('dep.summary', { train: formatClock(p.catchable.at), leave: formatClock(p.leaveBy) }), tone: 'info', go: 'depart' })
      }
  }
  if (r.items.difficult) {
    const fireAt = new Date(w.leaveBy.getTime() + 20000)
    const p = planBoarding({ station: w.station, line: w.line, toward: w.toward, distanceM: w.distanceM, mode: 'walk', walkSpeed: w.walkSpeed, now: fireAt, delayMin: w.delayMin })
    out.push({ key: `${base}:hard`, cat: 'boarding', fireAt, scheduledAt: w.setAt, title: msg('dep.next'), body: msg('dep.summary', { train: formatClock(p.catchable.at), leave: formatClock(p.leaveBy) }), tone: 'warn', go: 'depart' })
  }
  return out
}

export interface JourneyCtx {
  route: Route
  index: number
  indexAt: number
  startedAt: number
  arrived: boolean
  alertOn: boolean
}

/** 이동 중 반복 알림 (하차 추가 알림 · 환승역 하차 재알림) — 다음 역으로 이동하면 자동 중단 */
function journeyEvents(j: JourneyCtx, s: AlarmSettings): AlarmEvent[] {
  if (!j.alertOn) return []
  const out: AlarmEvent[] = []
  const stops = routeStops(j.route)
  const cur = stops[j.index]
  const base = `jr@${j.startedAt}:${j.index}`
  const from = new Date(j.indexAt)
  if (j.arrived && s.alight.on && s.alight.items.extra && s.alight.repeatMin > 0)
    for (let k = 1; k <= s.alight.repeatCount; k++)
      out.push({ key: `${base}:alight:r${k}`, cat: 'alight', fireAt: new Date(from.getTime() + k * s.alight.repeatMin * 60000), scheduledAt: from, title: msg('al.alightAgain', { s: stationName(j.route.to) }), body: msg('al.alightAgainBody'), tone: 'warn', go: 'move' })
  if (!j.arrived && cur?.transferTo && s.transfer.on && s.transfer.items.alight && s.transfer.repeatMin > 0)
    for (let k = 1; k <= s.transfer.repeatCount; k++)
      out.push({ key: `${base}:tr:r${k}`, cat: 'transfer', fireAt: new Date(from.getTime() + k * s.transfer.repeatMin * 60000), scheduledAt: from, title: msg('alert.transferNow', { s: stationName(cur.station) }), body: msg('al.transferAgain'), tone: 'warn', go: 'transfer' })
  return out
}

export function buildEvents(input: { appts: ApptCtx[]; watch: WatchCtx | null; journey: JourneyCtx | null; settings: AlarmSettings; now: Date; test: { id: number; at: number } | null }): AlarmEvent[] {
  const ev: AlarmEvent[] = []
  for (const c of input.appts) ev.push(...apptEvents(c, input.settings, input.now))
  if (input.watch) ev.push(...boardingEvents(input.watch, input.settings.boarding))
  if (input.journey) ev.push(...journeyEvents(input.journey, input.settings))
  if (input.test) ev.push({ key: `test@${input.test.id}`, cat: 'test', fireAt: new Date(input.test.at), scheduledAt: new Date(input.test.id), title: msg('al.testTitle'), body: msg('al.testBody'), tone: 'success' })
  return ev.sort((x, y) => x.fireAt.getTime() - y.fireAt.getTime())
}

/** 이 시간보다 오래 지난 알림은 보내지 않음 (앱이 닫혀 있던 동안 놓친 알림이 한꺼번에 쏟아지지 않도록) */
export const GRACE_MS = 3 * 60000

export function upcoming(events: AlarmEvent[], now: Date, fired: Set<string>) {
  return events.filter((e) => e.fireAt.getTime() > now.getTime() && !fired.has(e.key))
}
