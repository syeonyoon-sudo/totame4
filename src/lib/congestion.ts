// ─────────────────────────────────────────────────────────────
// 혼잡도 모델
// 실제 실시간 칸별 혼잡도 API(SK open API 등)가 연결되지 않은 상태에서는
// "시간대 패턴 + 역 특성"으로 계산한 **예상 혼잡도**만 제공합니다.
// 화면에는 항상 데이터 종류(예상/실시간)와 기준 시각을 함께 표시합니다.
// ─────────────────────────────────────────────────────────────
import { LINES, STATIONS, hashString, type LineId } from '../data/network'

export type CongestionLevel = 0 | 1 | 2 | 3 // 여유 · 보통 · 혼잡 · 매우 혼잡

export const LEVEL_COLORS = ['#27A35A', '#E8B931', '#EF8A2C', '#D9443F'] as const
export const LEVEL_BG = ['#E7F5EC', '#FDF6DC', '#FDEEDF', '#FBE6E5'] as const

export type DataKind = 'realtime' | 'recent' | 'estimate' | 'demo'

export interface CongestionReading {
  level: CongestionLevel
  /** 0~1.6 상대 지수 (화면에 % 로 표시하지 않음) */
  index: number
  kind: DataKind
  basedAt: Date
  source: string
}

// 평일/주말 시간대 패턴 (0~23시)
const WEEKDAY = [0.12, 0.05, 0, 0, 0, 0.15, 0.32, 0.72, 1.0, 0.74, 0.46, 0.42, 0.47, 0.46, 0.42, 0.46, 0.56, 0.8, 0.96, 0.7, 0.52, 0.48, 0.42, 0.28]
const WEEKEND = [0.14, 0.06, 0, 0, 0, 0.1, 0.16, 0.24, 0.32, 0.4, 0.48, 0.55, 0.6, 0.62, 0.62, 0.62, 0.6, 0.6, 0.58, 0.52, 0.46, 0.42, 0.36, 0.26]

const HOTSPOTS = new Set([
  '강남', '잠실', '홍대입구', '신도림', '서울', '고속터미널', '사당', '선릉', '역삼', '삼성', '여의도', '종로3가', '교대', '왕십리',
  '건대입구', '신림', '구로디지털단지', '가산디지털단지', '시청', '을지로입구', '광화문', '신촌', '이대', '합정', '디지털미디어시티',
  '노량진', '영등포구청', '당산', '김포공항', '판교', '수원', '용산', '청량리', '노원', '수유', '혜화', '광화문', '서울대입구', '양재',
])

const LINE_LOAD: Partial<Record<LineId, number>> = {
  '2': 1.15, '9': 1.2, gimpo: 1.25, '1': 1.0, '4': 1.0, '7': 1.0, '3': 0.95, '5': 0.95, shinbundang: 1.0, suin: 0.95,
}

export function stationWeight(id: string) {
  const st = STATIONS[id]
  if (!st) return 0.6
  let w = 0.52 + 0.11 * (st.lines.length - 1)
  if (HOTSPOTS.has(id)) w += 0.28
  w += ((hashString(id) % 10) - 5) / 100
  return Math.min(1.25, w)
}

function hourProfile(d: Date) {
  const day = d.getDay()
  const prof = day === 0 || day === 6 ? WEEKEND : WEEKDAY
  const h = d.getHours()
  const m = d.getMinutes() / 60
  return prof[h] * (1 - m) + prof[(h + 1) % 24] * m
}

export function levelOf(index: number): CongestionLevel {
  if (index < 0.42) return 0
  if (index < 0.72) return 1
  if (index < 1.0) return 2
  return 3
}

function reading(index: number, at: Date): CongestionReading {
  return { level: levelOf(index), index, kind: 'estimate', basedAt: at, source: 'pattern-model' }
}

/** 열차 혼잡 지수 (특정 역·노선·방향) */
export function trainIndex(station: string, line: LineId, at = new Date(), toward?: string) {
  const dir = toward ? ((hashString(station + toward) % 2 === 0 ? 1 : -1) * (at.getHours() < 12 ? 1 : -1)) : 0
  return hourProfile(at) * (0.55 + stationWeight(station) * 0.75) * (LINE_LOAD[line] ?? 0.85) * (1 + dir * 0.12)
}

export function stationCongestion(station: string, at = new Date()): { concourse: CongestionReading; platform: CongestionReading } {
  const base = hourProfile(at) * (0.45 + stationWeight(station) * 0.85)
  return { concourse: reading(base * 0.88, at), platform: reading(base * 1.04, at) }
}

export function hourlyStation(station: string, at = new Date()) {
  return Array.from({ length: 20 }, (_, i) => {
    const h = (i + 5) % 24
    const d = new Date(at)
    d.setHours(h, 0, 0, 0)
    const idx = hourProfile(d) * (0.45 + stationWeight(station) * 0.85) * 1.04
    return { hour: h, index: idx, level: levelOf(idx) }
  })
}

/** 호차별 예상 혼잡 — 계단·환승통로 가까운 칸이 더 붐비는 패턴 */
export function carCongestion(station: string, line: LineId, at = new Date(), toward?: string) {
  const n = LINES[line].cars
  const base = trainIndex(station, line, at, toward)
  const h = hashString(station + line)
  const hot1 = (h % n) + 0.5
  const hot2 = ((h >> 4) % n) + 0.5
  const raw = Array.from({ length: n }, (_, i) => {
    const c = i + 0.5
    const g = Math.exp(-((c - hot1) ** 2) / (n * 0.35)) + 0.7 * Math.exp(-((c - hot2) ** 2) / (n * 0.3))
    const edge = i === 0 || i === n - 1 ? -0.18 : 0
    return 0.72 + g * 0.55 + edge
  })
  const mean = raw.reduce((a, b) => a + b, 0) / n
  const cars = raw.map((r, i) => {
    const idx = base * (r / mean)
    return { car: i + 1, index: idx, level: levelOf(idx) }
  })
  const best = [...cars].sort((a, b) => a.index - b.index)[0]
  return { cars, best: best.car, kind: 'estimate' as DataKind, basedAt: at }
}

/** 경로 구간 평균 혼잡 지수 */
export function segmentIndex(stations: string[], line: LineId, at = new Date()) {
  if (!stations.length) return 0
  const sample = stations.filter((_, i) => i % 2 === 0 || i === stations.length - 1)
  return sample.reduce((a, s) => a + trainIndex(s, line, at), 0) / sample.length
}

/** 혼잡 예상 사전 안내: 오늘 남은 시간 중 가장 붐비는 시간 */
export function peakAdvice(station: string, at = new Date()) {
  const hours = hourlyStation(station, at).filter((h) => h.hour >= at.getHours())
  const peak = hours.reduce((a, b) => (b.index > a.index ? b : a), hours[0] ?? { hour: at.getHours(), index: 0, level: 0 as CongestionLevel })
  const calm = hours.filter((h) => h.level <= 1)
  return { peak, calm: calm[0] }
}
