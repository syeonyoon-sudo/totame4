import { ADJ, LINES, LINE_ORDER, STATIONS, distKm, getTransfer, terminusFrom, type LineId, type TransferInfo } from '../data/network'
import { levelOf, segmentIndex, type CongestionLevel } from './congestion'
export { stationName, lineName } from '../i18n'

export type Criterion = 'fast' | 'transfer' | 'walk' | 'congestion' | 'elevator' | 'escalator' | 'stairs' | 'access' | 'luggage' | 'comfort'
export const ALL_CRITERIA: Criterion[] = ['fast', 'transfer', 'walk', 'congestion', 'elevator', 'escalator', 'stairs', 'access', 'luggage', 'comfort']
/** 프리미엄 전용 고급 추천 기준 */
export const PREMIUM_CRITERIA: Criterion[] = ['congestion', 'comfort', 'luggage']

export type Disruption =
  | { id: string; kind: 'elevator'; station: string; lines: [LineId, LineId] }
  | { id: string; kind: 'passage'; station: string; lines: [LineId, LineId] }
  | { id: string; kind: 'delay'; line: LineId; minutes: number }
  | { id: string; kind: 'suspend'; line: LineId; from: string; to: string }

export interface RoutingSettings {
  walkSpeed: number
  priorities: Criterion[]
  wheelchair: boolean
}

export interface Segment {
  line: LineId
  stations: string[]
  minutes: number
}

export interface TransferStep {
  station: string
  from: LineId
  to: LineId
  info: TransferInfo
  elevator: boolean
  elevatorBroken: boolean
  closed: boolean
  seconds: number
}

export type IssueCode =
  | { code: 'delay'; line: LineId; minutes: number }
  | { code: 'suspend'; line: LineId; a: string; b: string }
  | { code: 'closed'; station: string }
  | { code: 'elevator'; station: string }

export interface Route {
  id: string
  signature: string
  from: string
  to: string
  segments: Segment[]
  transfers: TransferStep[]
  rideMin: number
  waitMin: number
  delayMin: number
  totalMin: number
  walkM: number
  walkMin: number
  distanceKm: number
  transferCount: number
  elevatorOk: boolean
  stairsCount: number
  /** 엘리베이터·에스컬레이터 모두 없는 환승 */
  stairsOnlyCount: number
  noEscalatorCount: number
  congestion: number
  congestionLevel: CongestionLevel
  invalid: boolean
  issues: IssueCode[]
  reasons: ReasonCode[]
  score: number
  recommended: boolean
}

export type ReasonCode = 'fastest' | 'direct' | 'fewestTransfers' | 'leastWalk' | 'leastWalkElevator' | 'allElevator' | 'allEscalator' | 'fewStairs' | 'accessible' | 'luggage' | 'leastCrowded' | 'comfort' | 'stairs'

// ── 기본 계산 ─────────────────────────────────────────────

function edgeKm(a: string, b: string) {
  const s = STATIONS[a]
  const t = STATIONS[b]
  return distKm(s.lat, s.lon, t.lat, t.lon)
}

/** 역간 주행시간(분) — 거리 기반 예상값 (운행속도 약 42km/h + 정차 30초) */
export function rideMinutes(a: string, b: string) {
  return 0.5 + edgeKm(a, b) / 0.7
}

/** 개인 보행속도 기반 환승 소요시간(초) */
export function transferSeconds(walk: number, elevator: boolean, speed: number) {
  const vertical = elevator ? 35 : 25 * (1.2 / speed) + 10
  return Math.round(walk / speed + vertical + 20)
}

function isSuspended(line: LineId, a: string, b: string, ds: Disruption[]) {
  return ds.some((d) => d.kind === 'suspend' && d.line === line && ((d.from === a && d.to === b) || (d.from === b && d.to === a)))
}

function lineDelay(line: LineId, ds: Disruption[]) {
  let m = 0
  for (const d of ds) if (d.kind === 'delay' && d.line === line) m += d.minutes
  return m
}

function effectiveTransfer(station: string, a: LineId, b: LineId, ds: Disruption[]) {
  const info = getTransfer(station, a, b)
  if (!info) return undefined
  let elevatorBroken = false
  let closed = false
  for (const d of ds) {
    if ((d.kind === 'elevator' || d.kind === 'passage') && d.station === station) {
      const same = (d.lines[0] === a && d.lines[1] === b) || (d.lines[0] === b && d.lines[1] === a)
      if (!same) continue
      if (d.kind === 'elevator') elevatorBroken = true
      else closed = true
    }
  }
  return { info, elevator: info.elevator && !elevatorBroken, elevatorBroken: info.elevator && elevatorBroken, closed }
}

// ── 경로 탐색 (다익스트라 + 이진 힙) ──────────────────────

interface Profile {
  transferPenalty: number
  walkWeight: number
  noElevatorPenalty: number
  noEscalatorPenalty: number
  crowdWeight: number
  avoid: Set<string>
}

type Node = string // `${station}|${line}`

class Heap {
  private a: [Node, number][] = []
  get size() {
    return this.a.length
  }
  push(n: Node, d: number) {
    const a = this.a
    a.push([n, d])
    let i = a.length - 1
    while (i > 0) {
      const p = (i - 1) >> 1
      if (a[p][1] <= a[i][1]) break
      ;[a[p], a[i]] = [a[i], a[p]]
      i = p
    }
  }
  pop(): [Node, number] {
    const a = this.a
    const top = a[0]
    const last = a.pop()!
    if (a.length) {
      a[0] = last
      let i = 0
      for (;;) {
        const l = i * 2 + 1
        const r = l + 1
        let m = i
        if (l < a.length && a[l][1] < a[m][1]) m = l
        if (r < a.length && a[r][1] < a[m][1]) m = r
        if (m === i) break
        ;[a[m], a[i]] = [a[i], a[m]]
        i = m
      }
    }
    return top
  }
}

function crowdFactor(station: string, line: LineId, at: Date) {
  return segmentIndex([station], line, at)
}

function neighbors(node: Node, settings: RoutingSettings, ds: Disruption[], p: Profile, at: Date): [Node, number][] {
  const sep = node.indexOf('|')
  const st = node.slice(0, sep)
  const line = node.slice(sep + 1) as LineId
  const out: [Node, number][] = []
  for (const nb of ADJ[line].get(st) ?? []) {
    if (isSuspended(line, st, nb, ds)) continue
    const m = rideMinutes(st, nb)
    out.push([`${nb}|${line}`, m * (1 + (p.crowdWeight ? p.crowdWeight * crowdFactor(nb, line, at) : 0))])
  }
  for (const other of STATIONS[st].lines) {
    if (other === line) continue
    const eff = effectiveTransfer(st, line, other, ds)
    if (!eff || eff.closed) continue
    if (settings.wheelchair && !eff.elevator) continue
    const sec = transferSeconds(eff.info.walk, eff.elevator, settings.walkSpeed)
    let cost = sec / 60 + LINES[other].headway / 120 + lineDelay(other, ds)
    cost += p.transferPenalty + eff.info.walk * p.walkWeight
    if (!eff.elevator) cost += p.noElevatorPenalty
    if (!eff.info.escalator) cost += p.noEscalatorPenalty
    if (p.avoid.has(st)) cost += 25
    out.push([`${st}|${other}`, cost])
  }
  return out
}

function dijkstra(from: string, to: string, settings: RoutingSettings, ds: Disruption[], p: Profile, at: Date): Node[] | null {
  const dist = new Map<Node, number>()
  const prev = new Map<Node, Node>()
  const done = new Set<Node>()
  const heap = new Heap()
  for (const line of STATIONS[from].lines) {
    const n = `${from}|${line}`
    const d0 = lineDelay(line, ds)
    dist.set(n, d0)
    heap.push(n, d0)
  }
  while (heap.size) {
    const [cur, d] = heap.pop()
    if (done.has(cur)) continue
    done.add(cur)
    if (cur.startsWith(`${to}|`)) {
      const path: Node[] = [cur]
      let c = cur
      while (prev.has(c)) {
        c = prev.get(c)!
        path.unshift(c)
      }
      return path
    }
    for (const [nb, w] of neighbors(cur, settings, ds, p, at)) {
      const nd = d + w
      if (nd < (dist.get(nb) ?? Infinity)) {
        dist.set(nb, nd)
        prev.set(nb, cur)
        heap.push(nb, nd)
      }
    }
  }
  return null
}

function pathToSegments(path: Node[]): Segment[] {
  const segs: Segment[] = []
  for (const node of path) {
    const sep = node.indexOf('|')
    const st = node.slice(0, sep)
    const line = node.slice(sep + 1) as LineId
    const last = segs[segs.length - 1]
    if (!last || last.line !== line) {
      segs.push({ line, stations: [st], minutes: 0 })
    } else {
      last.minutes += rideMinutes(last.stations[last.stations.length - 1], st)
      last.stations.push(st)
    }
  }
  return segs.filter((s) => s.stations.length > 1)
}

/** 구간 목록으로 경로 평가 (장애·보행속도·혼잡 반영) */
export function evaluateSegments(segments: Segment[], settings: RoutingSettings, ds: Disruption[], at = new Date()): Route {
  const transfers: TransferStep[] = []
  const issues: IssueCode[] = []
  let invalid = false
  let waitMin = 2
  let delayMin = 0
  let km = 0

  segments.forEach((seg, i) => {
    const d = lineDelay(seg.line, ds)
    if (d > 0) {
      delayMin += d
      issues.push({ code: 'delay', line: seg.line, minutes: d })
    }
    for (let k = 0; k < seg.stations.length - 1; k++) {
      km += edgeKm(seg.stations[k], seg.stations[k + 1])
      if (isSuspended(seg.line, seg.stations[k], seg.stations[k + 1], ds)) {
        invalid = true
        issues.push({ code: 'suspend', line: seg.line, a: seg.stations[k], b: seg.stations[k + 1] })
      }
    }
    if (i === 0) return
    const prevSeg = segments[i - 1]
    const station = seg.stations[0]
    const eff = effectiveTransfer(station, prevSeg.line, seg.line, ds)
    const info: TransferInfo = eff?.info ?? { walk: 200, elevator: false, escalator: false, door: '-', passage: '환승통로', source: 'estimate' }
    const elevator = eff ? eff.elevator : false
    const step: TransferStep = {
      station,
      from: prevSeg.line,
      to: seg.line,
      info,
      elevator,
      elevatorBroken: eff?.elevatorBroken ?? false,
      closed: eff?.closed ?? !eff,
      seconds: transferSeconds(info.walk, elevator, settings.walkSpeed),
    }
    if (step.closed) {
      invalid = true
      issues.push({ code: 'closed', station })
    }
    if (step.elevatorBroken) issues.push({ code: 'elevator', station })
    waitMin += LINES[seg.line].headway / 120
    transfers.push(step)
  })

  const rideMin = segments.reduce((a, s) => a + s.minutes, 0)
  const transferMin = transfers.reduce((a, t) => a + t.seconds / 60, 0)
  const signature = segments.map((s) => `${s.line}:${s.stations[0]}>${s.stations[s.stations.length - 1]}`).join('/')
  // 혼잡: 구간 길이 가중 평균
  let crowd = 0
  let t = at.getTime()
  segments.forEach((s) => {
    crowd += segmentIndex(s.stations, s.line, new Date(t)) * s.minutes
    t += s.minutes * 60000
  })
  crowd = rideMin ? crowd / rideMin : 0

  return {
    id: signature,
    signature,
    from: segments[0].stations[0],
    to: segments[segments.length - 1].stations[segments[segments.length - 1].stations.length - 1],
    segments,
    transfers,
    rideMin,
    waitMin,
    delayMin,
    totalMin: Math.round(rideMin + transferMin + waitMin + delayMin),
    walkM: transfers.reduce((a, x) => a + x.info.walk, 0),
    walkMin: Math.round(transferMin),
    distanceKm: Math.round(km * 10) / 10,
    transferCount: transfers.length,
    elevatorOk: transfers.every((x) => x.elevator),
    stairsCount: transfers.filter((x) => !x.elevator).length,
    stairsOnlyCount: transfers.filter((x) => !x.elevator && !x.info.escalator).length,
    noEscalatorCount: transfers.filter((x) => !x.info.escalator).length,
    congestion: crowd,
    congestionLevel: levelOf(crowd),
    invalid,
    issues,
    reasons: [],
    score: 0,
    recommended: false,
  }
}

const RANK_WEIGHTS = [4, 2.5, 1.6, 1.2, 1, 0.9, 0.8, 0.7, 0.6, 0.5]

function weightsFor(priorities: Criterion[]): Record<Criterion, number> {
  const w: Record<Criterion, number> = { fast: 0.6, transfer: 0.15, walk: 0.15, congestion: 0.15, elevator: 0.15, escalator: 0.05, stairs: 0.05, access: 0.05, luggage: 0.05, comfort: 0.1 }
  priorities.forEach((c, i) => (w[c] = RANK_WEIGHTS[i] ?? 0.8))
  return w
}

function metric(r: Route, c: Criterion) {
  switch (c) {
    case 'fast':
      return r.totalMin
    case 'transfer':
      return r.transferCount
    case 'walk':
      return r.walkM
    case 'congestion':
      return Math.round(r.congestion * 100)
    case 'elevator':
      return r.stairsCount
    case 'escalator':
      return r.noEscalatorCount
    case 'stairs':
      return r.stairsOnlyCount * 2 + r.stairsCount
    case 'access':
      return r.stairsCount * 30 + Math.round(r.walkM / 10)
    case 'luggage':
      return r.stairsCount * 20 + r.stairsOnlyCount * 10 + r.transferCount * 8 + Math.round(r.walkM / 20)
    case 'comfort':
      return Math.round(r.congestion * 60 + r.stairsCount * 15 + r.transferCount * 10 + r.walkM / 40)
  }
}

function scoreRoutes(routes: Route[], priorities: Criterion[]) {
  const w = weightsFor(priorities)
  const ranges = Object.fromEntries(
    ALL_CRITERIA.map((k) => {
      const v = routes.map((r) => metric(r, k))
      return [k, [Math.min(...v), Math.max(...v)]]
    }),
  ) as Record<Criterion, [number, number]>

  for (const r of routes) {
    r.score = ALL_CRITERIA.reduce((acc, k) => {
      const [lo, hi] = ranges[k]
      const n = hi === lo ? 0 : (metric(r, k) - lo) / (hi - lo)
      return acc + w[k] * n
    }, 0)
    const order: Criterion[] = [...priorities, ...ALL_CRITERIA.filter((k) => !priorities.includes(k))]
    const reasons: ReasonCode[] = []
    for (const k of order) {
      const best = metric(r, k) === ranges[k][0] && ranges[k][0] !== ranges[k][1]
      if (k === 'fast' && best) reasons.push('fastest')
      if (k === 'transfer' && (best || r.transferCount === 0)) reasons.push(r.transferCount === 0 ? 'direct' : 'fewestTransfers')
      if (k === 'walk' && best) reasons.push('leastWalk')
      if (k === 'walk' && !best && r.elevatorOk && r.transferCount > 0 && priorities.includes('elevator')) {
        const evMin = Math.min(...routes.filter((x) => x.elevatorOk && x.transferCount > 0).map((x) => x.walkM))
        if (r.walkM === evMin) reasons.push('leastWalkElevator')
      }
      if (k === 'congestion' && best) reasons.push('leastCrowded')
      if (k === 'comfort' && best && priorities.includes('comfort')) reasons.push('comfort')
      if (k === 'elevator' && r.elevatorOk && r.transferCount > 0) reasons.push('allElevator')
      if (k === 'escalator' && r.noEscalatorCount === 0 && r.transferCount > 0 && priorities.includes('escalator')) reasons.push('allEscalator')
      if (k === 'stairs' && best && priorities.includes('stairs')) reasons.push('fewStairs')
      if (k === 'access' && r.elevatorOk && (best || r.transferCount === 0) && priorities.includes('access')) reasons.push('accessible')
      if (k === 'luggage' && best && priorities.includes('luggage')) reasons.push('luggage')
    }
    if (!r.elevatorOk) reasons.push('stairs')
    r.reasons = [...new Set(reasons)].slice(0, 3)
  }
  routes.sort((a, b) => a.score - b.score || a.totalMin - b.totalMin)
  routes.forEach((r, i) => (r.recommended = i === 0))
  return routes
}

/** 개인 조건 기반 복수 경로 추천 */
export function findRoutes(from: string, to: string, settings: RoutingSettings, ds: Disruption[] = [], at = new Date()): Route[] {
  if (!from || !to || from === to || !STATIONS[from] || !STATIONS[to]) return []
  const w = weightsFor(settings.priorities)
  const base = { avoid: new Set<string>() }
  const profiles: Profile[] = [
    {
      ...base,
      transferPenalty: w.transfer * 4 + w.comfort * 2 + w.luggage * 3,
      walkWeight: w.walk * 0.02 + (w.access + w.luggage) * 0.01,
      noElevatorPenalty: w.elevator * 8 + w.comfort * 3 + w.access * 10 + w.luggage * 6 + w.stairs * 4,
      noEscalatorPenalty: w.escalator * 6 + w.stairs * 3,
      crowdWeight: (w.congestion + w.comfort) * 0.25,
    },
    { ...base, transferPenalty: 0, walkWeight: 0, noElevatorPenalty: 0, noEscalatorPenalty: 0, crowdWeight: 0 },
    { ...base, transferPenalty: 20, walkWeight: 0, noElevatorPenalty: 0, noEscalatorPenalty: 0, crowdWeight: 0 },
    { ...base, transferPenalty: 0, walkWeight: 0.08, noElevatorPenalty: 0, noEscalatorPenalty: 0, crowdWeight: 0 },
    { ...base, transferPenalty: 0, walkWeight: 0, noElevatorPenalty: 40, noEscalatorPenalty: 0, crowdWeight: 0 },
    { ...base, transferPenalty: 0, walkWeight: 0, noElevatorPenalty: 0, noEscalatorPenalty: 30, crowdWeight: 0 },
    { ...base, transferPenalty: 2, walkWeight: 0, noElevatorPenalty: 0, noEscalatorPenalty: 0, crowdWeight: 1.2 },
  ]

  const found = new Map<string, Route>()
  const add = (path: Node[] | null) => {
    if (!path) return
    const segs = pathToSegments(path)
    if (!segs.length) return
    const r = evaluateSegments(segs, settings, ds, at)
    if (!r.invalid && !found.has(r.signature)) found.set(r.signature, r)
  }
  for (const p of profiles) add(dijkstra(from, to, settings, ds, p, at))
  for (const r of [...found.values()].slice(0, 3)) {
    const avoid = new Set(r.transfers.map((t) => t.station))
    if (!avoid.size) continue
    add(dijkstra(from, to, settings, ds, { ...profiles[0], avoid }, at))
    add(dijkstra(from, to, settings, ds, { ...profiles[1], avoid }, at))
  }

  let routes = [...found.values()]
  if (!routes.length) return []
  const fastest = Math.min(...routes.map((r) => r.totalMin))
  routes = routes.filter((r) => r.totalMin <= fastest * 1.5 + 6)
  return scoreRoutes(routes, settings.priorities).slice(0, 4)
}

export function reevaluate(route: Route, settings: RoutingSettings, ds: Disruption[]): Route {
  const r = evaluateSegments(route.segments, settings, ds)
  return { ...r, reasons: route.reasons, recommended: route.recommended, score: route.score }
}

export interface RouteStop {
  station: string
  line: LineId
  transferTo?: LineId
}

export function routeStops(route: Route): RouteStop[] {
  const stops: RouteStop[] = []
  route.segments.forEach((seg, i) => {
    seg.stations.forEach((st, k) => {
      if (i > 0 && k === 0) return
      const isLast = k === seg.stations.length - 1
      const next = route.segments[i + 1]
      stops.push({ station: st, line: seg.line, transferTo: isLast && next ? next.line : undefined })
    })
  })
  return stops
}

export function remainingMinutes(route: Route, fromIndex: number) {
  const stops = routeStops(route)
  let m = 0
  for (let i = fromIndex; i < stops.length - 1; i++) {
    const a = stops[i]
    const b = stops[i + 1]
    m += rideMinutes(a.station, b.station)
    if (a.transferTo) {
      const t = route.transfers.find((x) => x.station === a.station)
      if (t) m += t.seconds / 60 + LINES[t.to].headway / 120
    }
  }
  return Math.round(m)
}

/** 진행 방향 종착역 */
export function towardStation(route: Route, station: string, line: LineId) {
  const seg = route.segments.find((s) => s.line === line && s.stations[0] === station) ?? route.segments.find((s) => s.line === line && s.stations.includes(station))
  if (!seg) return ''
  const i = seg.stations.indexOf(station)
  const a = seg.stations[Math.max(0, i)]
  const b = seg.stations[Math.min(seg.stations.length - 1, Math.max(0, i) + 1)]
  if (a === b) return ''
  const term = terminusFrom(line, a, b)
  // 순환선·분기점에서 멈춘 경우: 이번 구간의 하차(환승)역 방면으로 안내
  return (ADJ[line].get(term)?.length ?? 0) === 1 ? term : seg.stations[seg.stations.length - 1]
}

export function formatClock(d: Date) {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function formatMMSS(sec: number) {
  const s = Math.max(0, Math.round(Math.abs(sec)))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

export { LINE_ORDER }
