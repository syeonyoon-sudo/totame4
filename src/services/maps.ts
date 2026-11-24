// 카카오맵 · 네이버지도 연동
// 앱이 설치되어 있으면 앱 스킴으로 열고, 일정 시간 안에 화면이 전환되지 않으면 웹 지도로 대체합니다.
// URL 형식: 카카오맵 공식 링크(map.kakao.com/link/...)·앱 스킴(kakaomap://), 네이버지도 앱 스킴(nmap://)·웹 검색
import { STATIONS, hashString } from '../data/network'
import { INDOOR } from '../data/indoor'

const APP_NAME = 'tota.me'

export interface Exit {
  no: number
  lat: number
  lon: number
  /** 역 중심 기준 방위 */
  dir: 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW'
  elevator: boolean
}

const DIRS: Exit['dir'][] = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']

/** 출구 목록 — 실제 출구 좌표 API 연동 전까지 역 좌표 주변 예시 위치 */
export function exitsOf(stationId: string): Exit[] {
  const st = STATIONS[stationId]
  if (!st) return []
  // 실내 지도 데이터가 있는 역은 도면의 출구를 사용
  const indoor = INDOOR[stationId]
  if (indoor) {
    const ex = indoor.nodes.filter((n) => n.kind === 'exit')
    const cx = 60
    const cy = 30
    return ex.map((n) => {
      const dx = (n.x - cx) * 2.2
      const dy = (n.y - cy) * 2.2
      const ang = Math.atan2(-dy, dx)
      const dirIdx = Math.round(((Math.PI / 2 - ang + 2 * Math.PI) % (2 * Math.PI)) / (Math.PI / 4)) % 8
      const elevator = indoor.edges.some((e) => e.type === 'elevator' && (e.a === n.id || e.b === n.id || indoor.edges.some((f) => (f.a === n.id || f.b === n.id) && (f.a === e.a || f.b === e.a || f.a === e.b || f.b === e.b))))
      return { no: Number(n.ref), lat: st.lat - dy / 111000, lon: st.lon + dx / 88200, dir: DIRS[dirIdx], elevator }
    })
  }
  const h = hashString(stationId)
  const n = Math.min(12, 2 + st.lines.length * 2 + (h % 3))
  return Array.from({ length: n }, (_, i) => {
    const ang = ((i / n) * 2 * Math.PI + (h % 60) / 60) % (2 * Math.PI)
    const r = 0.0012 + ((h >> (i % 16)) % 5) * 0.0002
    const dirIdx = Math.round(((Math.PI / 2 - ang + 2 * Math.PI) % (2 * Math.PI)) / (Math.PI / 4)) % 8
    return { no: i + 1, lat: st.lat + Math.sin(ang) * r, lon: st.lon + Math.cos(ang) * r * 1.26, dir: DIRS[dirIdx], elevator: (h >> i) % 3 === 0 }
  })
}

export type MapProvider = 'kakao' | 'naver'

export function mapLinks(provider: MapProvider, opts: { name: string; lat: number; lon: number; query?: string }) {
  const name = encodeURIComponent(opts.name)
  const q = opts.query ? encodeURIComponent(opts.query) : ''
  if (provider === 'kakao') {
    return {
      app: opts.query ? `kakaomap://search?q=${q}&p=${opts.lat},${opts.lon}` : `kakaomap://look?p=${opts.lat},${opts.lon}`,
      web: opts.query ? `https://map.kakao.com/link/search/${q}` : `https://map.kakao.com/link/map/${name},${opts.lat},${opts.lon}`,
    }
  }
  return {
    app: opts.query
      ? `nmap://search?query=${q}&appname=${APP_NAME}`
      : `nmap://place?lat=${opts.lat}&lng=${opts.lon}&name=${name}&appname=${APP_NAME}`,
    web: `https://map.naver.com/p/search/${opts.query ? q : name}`,
  }
}

/** 도보 길찾기 (출구 → 목적지 좌표가 있을 때) */
export function walkRouteLinks(provider: MapProvider, from: { name: string; lat: number; lon: number }, to: { name: string; lat: number; lon: number }) {
  if (provider === 'kakao') {
    return {
      app: `kakaomap://route?sp=${from.lat},${from.lon}&ep=${to.lat},${to.lon}&by=FOOT`,
      web: `https://map.kakao.com/link/to/${encodeURIComponent(to.name)},${to.lat},${to.lon}`,
    }
  }
  return {
    app: `nmap://route/walk?slat=${from.lat}&slng=${from.lon}&sname=${encodeURIComponent(from.name)}&dlat=${to.lat}&dlng=${to.lon}&dname=${encodeURIComponent(to.name)}&appname=${APP_NAME}`,
    web: `https://map.naver.com/p/search/${encodeURIComponent(to.name)}`,
  }
}

const isMobile = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)

/** 모바일: 앱 스킴 시도 후 미설치 시 웹 지도 / 데스크톱: 웹 지도 */
export function openMap(links: { app: string; web: string }) {
  if (!isMobile()) {
    window.open(links.web, '_blank', 'noopener')
    return
  }
  let hidden = false
  const onHide = () => {
    if (document.visibilityState === 'hidden') hidden = true
  }
  document.addEventListener('visibilitychange', onHide)
  window.location.href = links.app
  setTimeout(() => {
    document.removeEventListener('visibilitychange', onHide)
    if (!hidden) window.location.href = links.web
  }, 1400)
}
