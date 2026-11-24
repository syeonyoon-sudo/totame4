// 실시간 열차 도착정보 — Vercel 서버리스 함수(/api/arrival)를 통해 서울시 실시간 지하철 API 호출
// API 키는 서버 환경변수(SEOUL_SUBWAY_API_KEY)에만 저장되어 클라이언트에 노출되지 않습니다.
// 키가 없거나 로컬 개발 환경이면 null을 반환하고, 화면은 '예상 시각'으로 표시합니다.

export interface Arrival {
  line: string
  direction: string
  destination: string
  message: string
  seconds: number | null
  receivedAt: string
}

export async function fetchArrivals(stationKo: string): Promise<Arrival[] | null> {
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 4000)
    const r = await fetch(`/api/arrival?station=${encodeURIComponent(stationKo)}`, { signal: ctrl.signal })
    clearTimeout(t)
    if (!r.ok || !r.headers.get('content-type')?.includes('json')) return null
    const j = (await r.json()) as { arrivals?: Arrival[] }
    return j.arrivals ?? null
  } catch {
    return null
  }
}
