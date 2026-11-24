// ─────────────────────────────────────────────────────────────
// 오늘 일정 — 약속 출발 시간 / 귀가 출발 시간 / 막차 역산
// 모든 시간은 검색된 경로(findRoutes)의 소요시간을 기반으로 계산합니다.
// 공식 시간표·실시간 정보가 연동되지 않은 값(막차·대기시간)은 '예상'으로 표시합니다.
// ─────────────────────────────────────────────────────────────
import { LINES, STATIONS } from '../data/network'
import { accessMinutes } from './boarding'
import type { ReturnPlan } from './alarms'
import { findRoutes, type Criterion, type Disruption, type Route, type RoutingSettings } from './routing'

/** 출발지 — 저장 장소 / 역 직접 지정 / 현재 위치 */
export type Origin = { kind: 'place'; placeId: string } | { kind: 'station'; station: string; distanceM: number } | { kind: 'current' }

export interface ResolvedOrigin {
  station: string
  distanceM: number
  label?: string
}

export interface ApptAlertConfig {
  offsets: number[] // 분 전 (0 = 권장 출발 시각)
  repeatMin: number // 0 = 반복 안 함
  repeatCount: number
}

export interface Appointment {
  id: string
  title: string
  placeName: string
  /** 약속 장소에서 가장 가까운 역 */
  destStation: string
  /** 역에서 약속 장소까지 도보(분) */
  walkMin: number
  date: string // YYYY-MM-DD
  time: string // HH:MM 약속 시간
  /** 도착 희망 시간 (기본: 약속 시간) */
  arriveBy: string
  origin: Origin
  priorities: Criterion[]
  bufferMin: number
  alerts: ApptAlertConfig
  // 귀가
  endTime: string // 약속 종료 예정
  homeEnabled: boolean
  home: Origin // 귀가 목적지 (집 = place)
  homeTarget: string // 목표 귀가 시각
  lastTrainAlert: boolean
  // 진행 상태
  departedAt?: string
  arrivedAt?: string
  homeDepartedAt?: string
  homeArrivedAt?: string
  canceled?: boolean
  /** 사용자가 이 일정의 알림을 중단 */
  muted?: boolean
  createdAt: string
  updatedAt: string
}

export function at(date: string, hhmm: string) {
  const [y, m, d] = date.split('-').map(Number)
  const [h, mi] = hhmm.split(':').map(Number)
  const r = new Date(y, m - 1, d, h, mi, 0, 0)
  // 자정 이후 시각(예: 00:30)을 같은 날 저녁 이후 일정으로 입력한 경우 다음 날로 처리
  if (h < 4) r.setDate(r.getDate() + 1)
  return r
}

export function todayStr(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** 하차 후 승강장 → 개찰구 → 출구 (예상) */
export const EXIT_MIN = 2

export interface TripPlan {
  route: Route | null
  /** 출발지 → 승강장 (도보 + 신호 + 개찰구 + 승강장) */
  accessMin: number
  /** 지하철 구간 (대기 + 탑승 + 환승 + 지연) */
  subwayMin: number
  delayMin: number
  /** 하차 후 목적지까지 */
  egressMin: number
  bufferMin: number
  totalMin: number
  leaveAt: Date
  arriveAt: Date
}

function plan(from: ResolvedOrigin | null, toStation: string, egressMin: number, mustArrive: Date, bufferMin: number, settings: RoutingSettings, ds: Disruption[]): TripPlan | null {
  if (!from || !STATIONS[from.station] || !STATIONS[toStation]) return null
  const route = from.station === toStation ? null : findRoutes(from.station, toStation, settings, ds, new Date(mustArrive.getTime() - 60 * 60000))[0] ?? null
  if (from.station !== toStation && !route) return null
  const accessMin = accessMinutes(from.distanceM, 'walk', settings.walkSpeed).total
  const subwayMin = route?.totalMin ?? 0
  const delayMin = route?.delayMin ?? 0
  const totalMin = Math.ceil(accessMin + subwayMin + egressMin + bufferMin)
  const leaveAt = new Date(mustArrive.getTime() - totalMin * 60000)
  return { route, accessMin, subwayMin, delayMin, egressMin, bufferMin, totalMin, leaveAt, arriveAt: new Date(leaveAt.getTime() + (totalMin - bufferMin) * 60000) }
}

/** 약속 장소까지 — 권장 출발 시간 */
export function planAppointment(a: Appointment, origin: ResolvedOrigin | null, settings: RoutingSettings, ds: Disruption[]) {
  // 하차 후: 승강장 → 출구(약 2분) + 출구 → 약속 장소 도보
  return plan(origin, a.destStation, a.walkMin + EXIT_MIN, at(a.date, a.arriveBy || a.time), a.bufferMin, { ...settings, priorities: a.priorities.length ? a.priorities : settings.priorities }, ds)
}

/** 막차 (공식 시간표 미연동 → 예상): 각 노선 마지막 열차가 23:50 무렵 출발한다고 가정 */
export const LAST_TRAIN_ESTIMATE = { h: 23, m: 50 }

/**
 * 막차를 타기 위해 출발지를 늦어도 떠나야 하는 시각 (예상)
 * 각 구간의 탑승 시각이 그 노선 막차(예상) 이전이어야 함 → 환승 구간까지 모두 고려해 가장 이른 제약을 사용
 */
export function lastLeave(route: Route | null, accessMin: number, ref: Date) {
  if (!route) return null
  const last = new Date(ref)
  last.setHours(LAST_TRAIN_ESTIMATE.h, LAST_TRAIN_ESTIMATE.m, 0, 0)
  if (ref.getHours() < 4) last.setDate(last.getDate() - 1)
  let offset = accessMin
  let latest = Infinity
  route.segments.forEach((seg, i) => {
    if (i > 0) offset += route.transfers[i - 1].seconds / 60
    // 탑승역 대기 (운행 간격의 절반)
    offset += LINES[seg.line].headway / 120
    latest = Math.min(latest, last.getTime() - offset * 60000)
    offset += seg.minutes
  })
  return new Date(latest)
}

/** 귀가 — 목표 귀가 시각에서 역산 + 막차 제약 */
export function planReturn(a: Appointment, home: ResolvedOrigin | null, settings: RoutingSettings, ds: Disruption[]): ReturnPlan | null {
  if (!a.homeEnabled || !home) return null
  // 약속 장소 → (도보) → 약속 역 → 지하철 → 집 근처 역 → (도보) → 집
  const fromVenue: ResolvedOrigin = { station: a.destStation, distanceM: 0 }
  const target = at(a.date, a.homeTarget)
  const p = plan(fromVenue, home.station, home.distanceM > 0 ? accessMinutes(home.distanceM, 'walk', settings.walkSpeed).total : EXIT_MIN, target, a.bufferMin, settings, ds)
  if (!p) return null
  // 약속 장소에서 역까지 도보를 출발 시각에 반영
  const leaveAt = new Date(p.leaveAt.getTime() - a.walkMin * 60000)
  const lastStationLeave = lastLeave(p.route, accessMinutes(0, 'walk', settings.walkSpeed).total, target)
  const lastVenueLeave = lastStationLeave ? new Date(lastStationLeave.getTime() - a.walkMin * 60000) : null
  const effectiveLeave = lastVenueLeave && lastVenueLeave < leaveAt ? lastVenueLeave : leaveAt
  return {
    ...p,
    leaveAt: effectiveLeave,
    targetLeaveAt: leaveAt,
    lastLeaveAt: lastVenueLeave,
    /** 막차 때문에 목표보다 일찍 출발해야 하는지 */
    lastTrainBinding: Boolean(lastVenueLeave && lastVenueLeave < leaveAt),
    totalMin: p.totalMin + a.walkMin,
    arriveAt: new Date(effectiveLeave.getTime() + (p.totalMin - p.bufferMin + a.walkMin) * 60000),
    endAt: at(a.date, a.endTime),
  }
}

export type ApptPhase = 'scheduled' | 'prepare' | 'moving' | 'returnPending' | 'returning' | 'done' | 'canceled'

export function phaseOf(a: Appointment, leaveAt: Date | null, now: Date): ApptPhase {
  if (a.canceled) return 'canceled'
  if (a.homeArrivedAt) return 'done'
  if (a.homeDepartedAt) return 'returning'
  if (a.departedAt && !a.arrivedAt) return 'moving'
  if (a.arrivedAt || now >= at(a.date, a.time)) {
    if (a.homeEnabled) return 'returnPending'
    return a.arrivedAt || now.getTime() > at(a.date, a.endTime).getTime() ? 'done' : 'returnPending'
  }
  if (leaveAt && now.getTime() >= leaveAt.getTime() - 60 * 60000) return 'prepare'
  return 'scheduled'
}

export function fmtDuration(min: number) {
  const m = Math.max(0, Math.round(min))
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`
}
