// ─────────────────────────────────────────────────────────────
// 서울 수도권 지하철 역·노선 데이터
// 역 좌표·역명(한/영/일/중)·노선 연결: © OpenStreetMap contributors (ODbL 1.0)
//   → scripts/build-network.mjs 로 src/data/seoul-network.json 생성
// 환승 도보거리·엘리베이터·추천 하차 위치·운행 간격·편성 수: 시연용 예시 데이터
// ─────────────────────────────────────────────────────────────
import raw from './seoul-network.json'

export type LineId = '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'arex' | 'gyeongui' | 'suin' | 'shinbundang' | 'ui-sinseol' | 'sillim' | 'gimpo'
export type Lang = 'ko' | 'en' | 'zh' | 'ja'

export interface Line {
  id: LineId
  /** 배지용 짧은 표기 */
  short: string
  names: Record<Lang, string>
  color: string
  /** 운행 간격(초) — 예시 */
  headway: number
  /** 편성 량 수 */
  cars: number
}

export interface Station {
  id: string
  names: Record<Lang, string>
  lat: number
  lon: number
  /** 화면 좌표 (개략 투영) */
  x: number
  y: number
  lines: LineId[]
}

export interface TransferInfo {
  walk: number
  elevator: boolean
  escalator: boolean
  door: string
  passage: string
  /** sample: 시연용 수기 예시 / estimate: 자동 추정값 */
  source: 'sample' | 'estimate'
}

const L = (id: LineId, short: string, ko: string, en: string, zh: string, ja: string, color: string, headway: number, cars: number): Line => ({
  id,
  short,
  names: { ko, en, zh, ja },
  color,
  headway,
  cars,
})

export const LINES: Record<LineId, Line> = {
  '1': L('1', '1', '1호선', 'Line 1', '1号线', '1号線', '#0052A4', 300, 10),
  '2': L('2', '2', '2호선', 'Line 2', '2号线', '2号線', '#00A84D', 240, 10),
  '3': L('3', '3', '3호선', 'Line 3', '3号线', '3号線', '#EF7C1C', 360, 10),
  '4': L('4', '4', '4호선', 'Line 4', '4号线', '4号線', '#00A5DE', 300, 10),
  '5': L('5', '5', '5호선', 'Line 5', '5号线', '5号線', '#996CAC', 300, 8),
  '6': L('6', '6', '6호선', 'Line 6', '6号线', '6号線', '#CD7C2F', 420, 8),
  '7': L('7', '7', '7호선', 'Line 7', '7号线', '7号線', '#747F00', 360, 8),
  '8': L('8', '8', '8호선', 'Line 8', '8号线', '8号線', '#E6186C', 360, 6),
  '9': L('9', '9', '9호선', 'Line 9', '9号线', '9号線', '#BDB092', 360, 6),
  arex: L('arex', '공항', '공항철도', 'AREX', '机场铁路', '空港鉄道', '#0090D2', 600, 6),
  gyeongui: L('gyeongui', '경의', '경의중앙선', 'Gyeongui–Jungang', '京义中央线', '京義・中央線', '#77C4A3', 600, 8),
  suin: L('suin', '수인', '수인분당선', 'Suin–Bundang', '水仁盆唐线', '水仁・盆唐線', '#FABE00', 420, 6),
  shinbundang: L('shinbundang', '신분', '신분당선', 'Shinbundang', '新盆唐线', '新盆唐線', '#D4003B', 360, 6),
  'ui-sinseol': L('ui-sinseol', '우이', '우이신설선', 'Ui–Sinseol', '牛耳新设线', '牛耳新設線', '#B0CE18', 300, 2),
  sillim: L('sillim', '신림', '신림선', 'Sillim Line', '新林线', '新林線', '#6789CA', 300, 3),
  gimpo: L('gimpo', '김포', '김포골드라인', 'Gimpo Goldline', '金浦黄金线', '金浦ゴールドライン', '#A17800', 300, 2),
}

export const LINE_ORDER: LineId[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'arex', 'gyeongui', 'suin', 'shinbundang', 'ui-sinseol', 'sillim', 'gimpo']

// ── 투영 (위경도 → 화면 좌표, 1km ≈ 55단위) ─────────────────
const LON0 = 126.978
const LAT0 = 37.5665
const UNIT = 55
export function project(lat: number, lon: number) {
  return { x: (lon - LON0) * 88.2 * UNIT, y: (LAT0 - lat) * 111 * UNIT }
}
export function unproject(x: number, y: number) {
  return { lat: LAT0 - y / (111 * UNIT), lon: LON0 + x / (88.2 * UNIT) }
}
export function distKm(aLat: number, aLon: number, bLat: number, bLon: number) {
  return Math.hypot((aLat - bLat) * 111, (aLon - bLon) * 88.2)
}

interface RawStation {
  id: string
  ko: string
  en?: string
  ja?: string
  zh?: string
  lat: number
  lon: number
  lines: string[]
}

export const STATIONS: Record<string, Station> = Object.fromEntries(
  (raw.stations as RawStation[]).map((s) => {
    const p = project(s.lat, s.lon)
    const en = s.en ?? s.ko
    return [
      s.id,
      {
        id: s.id,
        names: { ko: s.ko, en, ja: s.ja ?? en, zh: s.zh ?? en },
        lat: s.lat,
        lon: s.lon,
        x: p.x,
        y: p.y,
        lines: LINE_ORDER.filter((l) => s.lines.includes(l)),
      } satisfies Station,
    ]
  }),
)

/** 노선별 인접 역 */
export const EDGES: Record<LineId, [string, string][]> = raw.edges as Record<LineId, [string, string][]>
export const ADJ: Record<LineId, Map<string, string[]>> = Object.fromEntries(
  LINE_ORDER.map((l) => {
    const m = new Map<string, string[]>()
    for (const [a, b] of EDGES[l] ?? []) {
      ;(m.get(a) ?? m.set(a, []).get(a)!).push(b)
      ;(m.get(b) ?? m.set(b, []).get(b)!).push(a)
    }
    return [l, m]
  }),
) as Record<LineId, Map<string, string[]>>

export const STATION_LINES: Record<string, LineId[]> = Object.fromEntries(Object.values(STATIONS).map((s) => [s.id, s.lines]))

export const ALL_STATIONS: Station[] = Object.values(STATIONS).sort((a, b) => a.names.ko.localeCompare(b.names.ko, 'ko'))

/** 진행 방향의 종착(또는 분기) 역 */
export function terminusFrom(line: LineId, from: string, next: string): string {
  const adj = ADJ[line]
  let prev = from
  let cur = next
  const seen = new Set([from])
  for (let i = 0; i < 200; i++) {
    const nb = (adj.get(cur) ?? []).filter((x) => x !== prev)
    if (nb.length !== 1 || seen.has(nb[0])) break
    seen.add(cur)
    prev = cur
    cur = nb[0]
  }
  return cur === from ? next : cur
}

// ── 환승 정보 ─────────────────────────────────────────────
const T = (walk: number, elevator: boolean, escalator: boolean, door: string, passage: string): TransferInfo => ({ walk, elevator, escalator, door, passage, source: 'sample' })

/** 시연용 수기 예시 (key: `역|노선A-노선B`, 노선은 사전순) */
const SAMPLE_TRANSFERS: Record<string, TransferInfo> = {
  '시청|1-2': T(210, true, true, '1-1', '지하 2층 연결통로'),
  '서울|1-4': T(150, true, true, '9-4', '지하 1층 대합실 경유'),
  '종로3가|1-3': T(230, true, false, '5-1', '3호선 방면 연결통로'),
  '종로3가|3-5': T(270, true, true, '7-2', '지하 3층 환승통로'),
  '종로3가|1-5': T(320, false, true, '3-3', '1호선 대합실 경유 장거리 통로'),
  '동대문|1-4': T(130, false, false, '8-2', '계단 환승'),
  '을지로3가|2-3': T(210, true, true, '4-3', '지하 2층 연결통로'),
  '을지로4가|2-5': T(150, false, true, '6-1', '계단·에스컬레이터 환승'),
  '동대문역사문화공원|2-4': T(120, true, true, '10-1', '4호선 승강장 직결'),
  '동대문역사문화공원|2-5': T(330, true, true, '1-4', '장거리 환승통로'),
  '동대문역사문화공원|4-5': T(260, true, false, '2-2', '지하 2층 환승통로'),
  '충무로|3-4': T(60, true, false, '5-3', '동일 승강장 인접 환승'),
  '왕십리|2-5': T(240, true, true, '8-1', '지하 2층 대합실 경유'),
  '건대입구|2-7': T(170, true, true, '6-3', '7호선 지하 승강장 연결'),
  '군자|5-7': T(190, true, true, '4-1', '지하 3층 환승통로'),
  '천호|5-8': T(170, true, true, '4-2', '지하 3층 직결 환승통로'),
  '잠실|2-8': T(230, true, true, '3-1', '지하 2층 환승통로'),
  '홍대입구|2-arex': T(280, true, true, '7-3', '공항철도 지하 연결통로'),
  '홍대입구|2-gyeongui': T(260, true, true, '7-3', '경의중앙선 지하 연결통로'),
  '홍대입구|arex-gyeongui': T(90, true, true, '3-2', '동일 역사 인접 승강장'),
}

/** 실제로는 별도 역이라 환승 불가 */
const NO_TRANSFER = new Set<string>([])

function hash(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}
export { hash as hashString }

export function transferKey(station: string, a: LineId, b: LineId) {
  const [x, y] = [a, b].sort()
  return `${station}|${x}-${y}`
}

export function getTransfer(station: string, a: LineId, b: LineId): TransferInfo | undefined {
  const st = STATIONS[station]
  if (!st || !st.lines.includes(a) || !st.lines.includes(b) || a === b) return undefined
  const key = transferKey(station, a, b)
  if (NO_TRANSFER.has(key)) return undefined
  if (SAMPLE_TRANSFERS[key]) return SAMPLE_TRANSFERS[key]
  const h = hash(key)
  return {
    walk: 110 + (h % 23) * 10,
    elevator: h % 7 !== 0,
    escalator: h % 3 !== 0,
    door: `${(h % 8) + 1}-${((h >> 3) % 4) + 1}`,
    passage: '환승통로',
    source: 'estimate',
  }
}

// ── 한강 (개략, 위경도) ─────────────────────────────────────
const RIVER: [number, number][] = [
  [37.62, 126.73], [37.598, 126.809], [37.588, 126.822], [37.573, 126.862], [37.553, 126.893], [37.543, 126.904], [37.535, 126.925],
  [37.534, 126.936], [37.527, 126.948], [37.517, 126.959], [37.512, 126.981], [37.513, 126.996], [37.524, 127.012], [37.533, 127.021],
  [37.537, 127.035], [37.532, 127.058], [37.526, 127.068], [37.524, 127.089], [37.531, 127.105], [37.541, 127.113], [37.553, 127.127],
  [37.574, 127.152], [37.585, 127.19], [37.56, 127.235], [37.535, 127.28],
]
export const RIVER_PATH = RIVER.map(([la, lo], i) => {
  const p = project(la, lo)
  return `${i ? 'L' : 'M'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`
}).join(' ')

/** 위치 권한이 없을 때 사용하는 시연용 위치 (광화문 인근) */
export const DEMO_LOCATION = { lat: 37.5722, lon: 126.9775 }

export const DATA_SOURCE = raw.source as string
