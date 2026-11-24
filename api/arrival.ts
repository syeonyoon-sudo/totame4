// Vercel Serverless Function — 서울시 실시간 지하철 도착정보 프록시
// 환경변수: SEOUL_SUBWAY_API_KEY (서울 열린데이터광장 실시간 지하철 인증키)
// 요청: GET /api/arrival?station=잠실
declare const process: { env: Record<string, string | undefined> }
const SUBWAY_IDS: Record<string, string> = {
  '1001': '1', '1002': '2', '1003': '3', '1004': '4', '1005': '5', '1006': '6', '1007': '7', '1008': '8', '1009': '9',
  '1063': 'gyeongui', '1065': 'arex', '1075': 'suin', '1077': 'shinbundang', '1092': 'ui-sinseol', '1093': 'seohae', '1094': 'sillim', '1081': 'gyeonggang', '1032': 'gtx-a',
}

export async function GET(request: Request): Promise<Response> {
  const key = process.env.SEOUL_SUBWAY_API_KEY
  const url = new URL(request.url)
  const station = (url.searchParams.get('station') ?? '').replace(/역$/, '').trim()
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 's-maxage=15' } })
  if (!key) return json({ error: 'not_configured' }, 503)
  if (!station) return json({ error: 'station_required' }, 400)
  try {
    const name = station === '서울역' ? '서울' : station
    const r = await fetch(`http://swopenapi.seoul.go.kr/api/subway/${encodeURIComponent(key)}/json/realtimeStationArrival/0/12/${encodeURIComponent(name)}`)
    const data = (await r.json()) as { realtimeArrivalList?: Record<string, string>[] }
    const arrivals = (data.realtimeArrivalList ?? []).map((a) => ({
      line: SUBWAY_IDS[a.subwayId] ?? a.subwayId,
      direction: a.updnLine,
      destination: a.bstatnNm,
      message: a.arvlMsg2,
      seconds: a.barvlDt && a.barvlDt !== '0' ? Number(a.barvlDt) : null,
      receivedAt: a.recptnDt,
    }))
    return json({ arrivals, source: 'seoul-openapi' })
  } catch {
    return json({ error: 'upstream_failed' }, 502)
  }
}
