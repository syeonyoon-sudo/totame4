// 역사 내부 길찾기 — 층별 그래프 최단경로 + 단계별 방향 안내
import { INDOOR, type EdgeType, type IndoorNode, type IndoorStation } from '../data/indoor'
import { getLang, t } from '../i18n'

export type IndoorMode = 'shortest' | 'elevator' | 'escalator' | 'noStairs' | 'wheelchair' | 'luggage'
export const INDOOR_MODES: IndoorMode[] = ['shortest', 'elevator', 'escalator', 'noStairs', 'wheelchair', 'luggage']

/** 층간 이동 기본 소요(초) */
const VERTICAL_SEC: Partial<Record<EdgeType, number>> = { stairs: 35, escalator: 30, elevator: 55, lift: 120 }

function edgeCost(type: EdgeType, dist: number, mode: IndoorMode): number {
  const base = type === 'walk' || type === 'gate' || type === 'gateWide' ? dist : (VERTICAL_SEC[type] ?? 30)
  switch (mode) {
    case 'elevator':
      return base + (type === 'stairs' ? 300 : type === 'escalator' ? 150 : type === 'lift' ? 200 : 0)
    case 'escalator':
      return base + (type === 'stairs' ? 200 : type === 'elevator' ? 40 : type === 'lift' ? 200 : 0)
    case 'noStairs':
      return type === 'stairs' ? Infinity : base
    case 'wheelchair':
      return type === 'stairs' || type === 'escalator' || type === 'gate' ? Infinity : base
    case 'luggage':
      return type === 'stairs' ? Infinity : base + (type === 'escalator' ? 25 : type === 'gate' ? 15 : type === 'lift' ? 100 : 0)
    default:
      return base
  }
}

export interface IndoorStep {
  type: 'walk' | EdgeType | 'arrive'
  text: string
  distance: number
  seconds: number
  floor: string
  toFloor?: string
  /** 이 단계가 끝나는 지점 */
  node: IndoorNode
  dir?: 'start' | 'straight' | 'right' | 'left'
}

export interface IndoorRoute {
  nodes: IndoorNode[]
  steps: IndoorStep[]
  distance: number
  seconds: number
  floorChanges: number
}

export function nodeName(n: IndoorNode) {
  const lang = getLang()
  if (n.name) return n.name[lang]
  return t(`in.kind.${n.kind}` as 'in.kind.junction')
}

export function floorName(st: IndoorStation, id: string) {
  return st.floors.find((f) => f.id === id)?.name[getLang()] ?? id
}
export function floorShort(st: IndoorStation, id: string) {
  const f = st.floors.find((x) => x.id === id)
  return f?.short?.[getLang()] ?? f?.name[getLang()] ?? id
}

export function findIndoorRoute(stationId: string, from: string, to: string, mode: IndoorMode, walkSpeed: number): IndoorRoute | null {
  const st = INDOOR[stationId]
  if (!st) return null
  const byId = new Map(st.nodes.map((n) => [n.id, n]))
  const adj = new Map<string, { to: string; type: EdgeType; dist: number }[]>()
  for (const e of st.edges) {
    const a = byId.get(e.a)!
    const b = byId.get(e.b)!
    const dist = a.floor === b.floor ? Math.hypot(a.x - b.x, a.y - b.y) : 0
    ;(adj.get(e.a) ?? adj.set(e.a, []).get(e.a)!).push({ to: e.b, type: e.type, dist })
    if (!e.oneway) (adj.get(e.b) ?? adj.set(e.b, []).get(e.b)!).push({ to: e.a, type: e.type, dist })
  }
  // 다익스트라 (노드 수가 적어 단순 구현)
  const dist = new Map<string, number>([[from, 0]])
  const prev = new Map<string, { from: string; type: EdgeType; dist: number }>()
  const done = new Set<string>()
  for (;;) {
    let cur: string | null = null
    let best = Infinity
    for (const [k, v] of dist) if (!done.has(k) && v < best) ((best = v), (cur = k))
    if (cur === null || cur === to) break
    done.add(cur)
    for (const e of adj.get(cur) ?? []) {
      const c = edgeCost(e.type, e.dist, mode)
      if (!isFinite(c)) continue
      const nd = best + c
      if (nd < (dist.get(e.to) ?? Infinity)) {
        dist.set(e.to, nd)
        prev.set(e.to, { from: cur, type: e.type, dist: e.dist })
      }
    }
  }
  if (!prev.has(to) && from !== to) return null

  const chain: { node: IndoorNode; type: EdgeType; dist: number }[] = []
  let c = to
  while (c !== from) {
    const p = prev.get(c)!
    chain.unshift({ node: byId.get(c)!, type: p.type, dist: p.dist })
    c = p.from
  }
  const nodes = [byId.get(from)!, ...chain.map((x) => x.node)]
  const target = byId.get(to)!

  // 단계별 안내문 생성
  const steps: IndoorStep[] = []
  let heading: number | null = null
  let prevNode = nodes[0]
  const nextNamed = (i: number) => {
    for (let k = i; k < chain.length; k++) if (chain[k].node.name && chain[k].node.kind !== 'junction') return chain[k].node
    return target
  }
  chain.forEach((seg, i) => {
    const a = prevNode
    const b = seg.node
    if (seg.type === 'walk') {
      const h = Math.atan2(b.y - a.y, b.x - a.x)
      let dir: 'start' | 'straight' | 'right' | 'left' = 'start'
      if (heading !== null) {
        let d = ((h - heading) * 180) / Math.PI
        while (d > 180) d -= 360
        while (d < -180) d += 360
        dir = Math.abs(d) < 30 ? 'straight' : d > 0 ? 'right' : 'left'
      }
      const last = steps[steps.length - 1]
      // 직진이거나 통로 분기점(이름 없는 지점)을 지나는 경우 하나의 안내로 합침
      if (last && last.type === 'walk' && (dir === 'straight' || a.kind === 'junction')) {
        last.distance += seg.dist
        last.seconds += seg.dist / walkSpeed
        last.node = b
        last.text = walkText(last.dir, last.distance, nextNamed(i))
      } else {
        steps.push({ type: 'walk', dir, text: walkText(dir, seg.dist, nextNamed(i)), distance: seg.dist, seconds: seg.dist / walkSpeed, floor: b.floor, node: b })
      }
      heading = h
    } else if (seg.type === 'gate' || seg.type === 'gateWide') {
      steps.push({ type: seg.type, text: t(seg.type === 'gate' ? 'in.gate' : 'in.gateWide'), distance: seg.dist, seconds: 8 + seg.dist / walkSpeed, floor: b.floor, node: b })
      heading = Math.atan2(b.y - a.y, b.x - a.x)
    } else {
      const fl = floorShort(INDOOR[stationId], b.floor)
      const key = { stairs: 'in.stairs', escalator: 'in.escalator', elevator: 'in.elevator', lift: 'in.lift' }[seg.type as 'stairs'] as 'in.stairs'
      steps.push({ type: seg.type, text: t(key, { f: fl }), distance: 0, seconds: (VERTICAL_SEC[seg.type] ?? 30) * (seg.type === 'stairs' ? 1.2 / walkSpeed : 1), floor: a.floor, toFloor: b.floor, node: b })
      heading = null
    }
    prevNode = b
  })
  steps.push({ type: 'arrive', text: t('in.arrive', { p: nodeName(target) }), distance: 0, seconds: 0, floor: target.floor, node: target })
  const distance = Math.round(steps.reduce((a, s) => a + s.distance, 0))
  const seconds = Math.round(steps.reduce((a, s) => a + s.seconds, 0))
  steps.forEach((s) => (s.distance = Math.round(s.distance)))
  return { nodes, steps, distance, seconds, floorChanges: steps.filter((s) => s.toFloor).length }
}

function walkText(dir: IndoorStep['dir'], d: number, next: IndoorNode) {
  const m = Math.max(1, Math.round(d))
  if (dir === 'start') return t('in.walkToward', { p: nodeName(next), m })
  if (dir === 'straight') return t('in.walkStraight', { p: nodeName(next), m })
  return t(dir === 'right' ? 'in.walkRight' : 'in.walkLeft', { p: nodeName(next), m })
}

/** QR 코드 내용 → 노드 (형식: TOTAME:<역>:<노드ID>) */
export function parseIndoorCode(code: string): { station: string; node: string } | null {
  const m = code.trim().match(/^TOTAME:([^:]+):([A-Za-z0-9-]+)$/i)
  if (!m) return null
  const st = INDOOR[m[1]]
  if (!st || !st.nodes.some((n) => n.id === m[2])) return null
  return { station: m[1], node: m[2] }
}
