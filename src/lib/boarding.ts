// ─────────────────────────────────────────────────────────────
// 스마트 출발 도우미 공통 계산 — 홈 · 경로 · 지금 어디? 에서 모두 이 로직을 사용
// "지금 출발하면 뛰어야 할까?" : 실제 도보시간과 열차 출발시각을 비교
// ─────────────────────────────────────────────────────────────
import { ADJ, LINES, hashString, terminusFrom, type LineId } from '../data/network'
import type { MessageKey } from '../i18n'
import { rideMinutes, routeStops, towardStation, type Route } from './routing'

export type Mode = 'walk' | 'bike'

/** 출발지 → 승강장 도착까지 걸리는 시간(분) */
export function accessMinutes(distanceM: number, mode: Mode, walkSpeed: number) {
  const pathM = distanceM * 1.25 // 실제 보행 경로는 직선거리보다 김
  const move = mode === 'walk' ? pathM / (walkSpeed * 60) : pathM / 230 + 1.5 // 자전거: 거치 시간 포함
  const signals = (distanceM / 350) * 0.6 // 신호 대기
  const entrance = distanceM > 0 ? 1 : 0 // 출입구 → 개찰구
  const platform = 1.5 // 개찰구 → 승강장
  return { total: move + signals + entrance + platform, move, signals, entrance, platform }
}

/**
 * 예상 시각표 — 운행 간격 기반 (공식 시간표 API 미연동 시 '예상'으로 표시)
 * delayMin: 운행 지연(분) 만큼 실제 출발이 늦어짐
 */
export function nextDepartures(station: string, line: LineId, toward: string, now: Date, count = 4, delayMin = 0) {
  const h = LINES[line].headway
  const offset = hashString(station + line + toward) % h
  const sec = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds() - delayMin * 60
  const first = Math.ceil((sec - offset) / h) * h + offset
  return Array.from({ length: count }, (_, k) => {
    const scheduled = new Date(now)
    scheduled.setHours(0, 0, 0, 0)
    scheduled.setSeconds(first + k * h)
    return { scheduled, at: new Date(scheduled.getTime() + delayMin * 60000) }
  })
}

export type DepartureStatus = 'relaxed' | 'enough' | 'hurry' | 'next' | 'delayed' | 'transfer'

export const STATUS_TEXT: Record<DepartureStatus, MessageKey> = {
  relaxed: 'dep.relaxed',
  enough: 'dep.enough',
  hurry: 'dep.hurry',
  next: 'dep.next',
  delayed: 'dep.delayed',
  transfer: 'dep.transfer',
}

export const STATUS_TONE: Record<DepartureStatus, string> = {
  relaxed: 'text-ok',
  enough: 'text-ok',
  delayed: 'text-brand',
  hurry: 'text-[#B57714]',
  next: 'text-[#B57714]',
  transfer: 'text-[#B57714]',
}

export function directionsOf(station: string, line: LineId) {
  return (ADJ[line].get(station) ?? []).map((nb) => {
    const term = terminusFrom(line, station, nb)
    return { next: nb, toward: (ADJ[line].get(term)?.length ?? 0) === 1 ? term : nb }
  })
}

/** 경로의 첫 탑승 노선·방향 */
export function firstBoarding(route: Route) {
  const seg = route.segments[0]
  const term = terminusFrom(seg.line, seg.stations[0], seg.stations[1])
  return { station: seg.stations[0], line: seg.line, toward: (ADJ[seg.line].get(term)?.length ?? 0) === 1 ? term : seg.stations[1] }
}

export interface BoardingInput {
  station: string
  line: LineId
  toward: string
  /** 승강장까지 남은 거리(m) — 이미 역 안이면 0 */
  distanceM: number
  mode: Mode
  walkSpeed: number
  now: Date
  delayMin?: number
  route?: Route | null
  /** '이번 열차 꼭 탑승' 모드 — 빠듯한 열차도 안내 (뛰라고 하지 않음) */
  mustCatch?: boolean
  /** 안전 여유(분) */
  bufferMin?: number
  /** 역 혼잡으로 늘어나는 개찰구·승강장 이동 시간(분, 예상) */
  crowdMin?: number
}

/** 혼잡도 단계(0~3, 예상) → 개찰구·계단 대기 추가 시간 */
export const CROWD_EXTRA = [0, 0.3, 0.8, 1.5]

/** 여유가 이 정도(분) 이상이면 '일반 이동'에서도 서두르지 않고 탈 수 있음 */
export const COMFORT_MARGIN = 1.5

export function planBoarding(i: BoardingInput) {
  const delay = i.delayMin ?? 0
  const base = accessMinutes(i.distanceM, i.mode, i.walkSpeed)
  const crowd = i.crowdMin ?? 0
  const buffer = i.bufferMin ?? 0
  const access = { ...base, crowd, total: base.total + crowd }
  const need = access.total + buffer
  const trains = nextDepartures(i.station, i.line, i.toward, i.now, 5, delay).map((d) => ({
    ...d,
    margin: (d.at.getTime() - i.now.getTime()) / 60000 - need,
  }))
  const first = trains[0]
  const must = Boolean(i.mustCatch)
  // 일반 이동: 여유 있게 탈 수 있는 열차 / 꼭 탑승: 안전 여유를 지키며 탈 수 있는 가장 빠른 열차
  const catchable = trains.find((x) => x.margin >= (must ? 0 : COMFORT_MARGIN)) ?? trains[trains.length - 1]
  let status: DepartureStatus = first.margin >= 4 ? 'relaxed' : first.margin >= COMFORT_MARGIN ? 'enough' : first.margin >= 0 && must ? 'hurry' : 'next'
  // 지연 덕분에 탑승 가능해진 경우
  if (delay > 0 && first.margin >= COMFORT_MARGIN) {
    const undelayed = (first.scheduled.getTime() - i.now.getTime()) / 60000 - need
    if (undelayed < COMFORT_MARGIN) status = 'delayed'
  }
  const leaveBy = new Date(catchable.at.getTime() - need * 60000)
  /** 지금 열차를 놓쳤을 때의 다음 열차 */
  const fallback = trains[trains.indexOf(catchable) + 1] ?? null
  return { access, buffer, need, trains, catchable, fallback, status, leaveBy }
}

// ── 스마트 환승 판단 (출발 도우미와 같은 기준) ─────────────────
export type TransferStatus = 'relaxed' | 'hurry' | 'tight' | 'next'
export const TRANSFER_TEXT: Record<TransferStatus, MessageKey> = {
  relaxed: 'tr.statusOk',
  hurry: 'tr.statusHurry',
  tight: 'tr.statusTight',
  next: 'tr.statusNext',
}
export function transferStatus(marginSec: number): TransferStatus {
  if (marginSec >= 60) return 'relaxed'
  if (marginSec >= 30) return 'hurry'
  if (marginSec >= 0) return 'tight'
  return 'next'
}

// ── 환승 타임라인 (예상 시간표 기반) ────────────────────────────
// 하차 예정 시각 → 통로 이동(예상) → 연결 열차 출발 시각을 비교해 '남는 시간'을 숫자로 계산
export interface TransferTimelineInput {
  route: Route
  /** route.transfers 인덱스 */
  ti: number
  now: Date
  /** 이동 중이면 현재 정차역 인덱스와 그 역 도착 시각 */
  journey?: { index: number; indexAt: number } | null
  delayOf?: (line: LineId) => number
}

export function transferTimeline(i: TransferTimelineInput) {
  const { route, ti, now } = i
  const step = route.transfers[ti]
  if (!step) return null
  const stops = routeStops(route)
  const stopIdx = stops.findIndex((x, k) => x.station === step.station && x.transferTo === step.to && k > 0)
  const delay = (l: LineId) => i.delayOf?.(l) ?? 0
  // 1) 하차 예정 시각
  let alightAt: Date
  let based: 'journey' | 'plan'
  if (i.journey && i.journey.index <= stopIdx) {
    based = 'journey'
    let m = 0
    for (let k = i.journey.index; k < stopIdx; k++) {
      m += rideMinutes(stops[k].station, stops[k + 1].station)
      const tr = stops[k].transferTo ? route.transfers.find((x) => x.station === stops[k].station) : undefined
      if (tr) m += tr.seconds / 60 + LINES[tr.to].headway / 120
    }
    alightAt = new Date(i.journey.indexAt + m * 60000)
  } else {
    based = 'plan'
    const fb = firstBoarding(route)
    const board = nextDepartures(fb.station, fb.line, fb.toward, now, 1, delay(fb.line))[0].at
    let m = 0
    for (let k = 0; k < stopIdx; k++) {
      m += rideMinutes(stops[k].station, stops[k + 1].station)
      const tr = k > 0 && stops[k].transferTo ? route.transfers.find((x) => x.station === stops[k].station) : undefined
      if (tr) m += tr.seconds / 60 + LINES[tr.to].headway / 120
    }
    alightAt = new Date(board.getTime() + m * 60000)
  }
  const arrived = Boolean(i.journey && i.journey.index === stopIdx)
  // 2) 통로 이동 (예상 · 보행속도 반영)
  const walkSec = step.seconds
  // 3) 연결 열차 (하차 시각 이후 출발)
  const toward = towardStation(route, step.station, step.to) || route.segments[ti + 1]?.stations[1] || ''
  const deps = nextDepartures(step.station, step.to, toward, alightAt, 3, delay(step.to))
  const target = deps[0].at
  /** 하차 후 연결 열차 출발까지 (초) */
  const gapSec = Math.round((target.getTime() - alightAt.getTime()) / 1000)
  const marginSec = gapSec - walkSec
  const status = transferStatus(marginSec)
  const recommended = marginSec >= 0 ? target : deps[1].at
  const fallback = marginSec >= 0 ? deps[1].at : deps[2].at
  return { step, stopIdx, alightAt, walkSec, platformAt: new Date(alightAt.getTime() + walkSec * 1000), target, gapSec, marginSec, status, recommended, fallback, toward, arrived, based }
}
