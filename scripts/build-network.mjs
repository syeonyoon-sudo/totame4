// 역·노선 데이터 생성 스크립트
// 원본: scripts/source/osm-subway.json (© OpenStreetMap contributors, ODbL 1.0 — korea-mcp 패키지 경유)
// 실행: node scripts/build-network.mjs  → src/data/seoul-network.json 생성
import { readFileSync, writeFileSync } from 'node:fs'

const src = JSON.parse(readFileSync(new URL('./source/osm-subway.json', import.meta.url)))
const KEEP = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'arex', 'gyeongui', 'suin', 'shinbundang', 'ui-sinseol', 'sillim', 'gimpo']

// 이름이 같은 서로 다른 역 분리 (원본 데이터 보정)
const SPLIT = {
  '양평|gyeongui': { id: '양평(경의중앙)', en: 'Yangpyeong (Gyeongui–Jungang)', ja: 'ヤンピョン(楊平)', zh: '杨平', lat: 37.492485, lon: 127.491843 },
  '신촌|gyeongui': { id: '신촌(경의중앙)', en: 'Sinchon (Gyeongui–Jungang)', ja: 'シンチョン(新村)', zh: '新村', lat: 37.559864, lon: 126.942549 },
}
const remap = (name, line) => (SPLIT[`${name}|${line}`] ? SPLIT[`${name}|${line}`].id : name)

const stations = {}
for (const s of src.stations) {
  const lines = s.lines.filter((l) => KEEP.includes(l))
  if (!lines.length) continue
  for (const l of lines) {
    const sp = SPLIT[`${s.ko}|${l}`]
    if (sp) {
      stations[sp.id] = { id: sp.id, ko: sp.id, en: sp.en, ja: sp.ja, zh: sp.zh, lat: sp.lat, lon: sp.lon, lines: [l] }
    } else {
      stations[s.ko] ||= { id: s.ko, ko: s.ko === '서울' ? '서울역' : s.ko, en: s.ko === '서울' ? 'Seoul Station' : s.en, ja: s.ja, zh: s.zh, lat: s.lat, lon: s.lon, lines: [] }
      stations[s.ko].lines.push(l)
    }
  }
}

const edges = {}
const seen = new Set()
for (const e of src.edges) {
  if (!KEEP.includes(e.line) || e.express) continue
  const a = remap(e.from, e.line)
  const b = remap(e.to, e.line)
  if (!stations[a] || !stations[b]) continue
  const key = [e.line, ...[a, b].sort()].join('|')
  if (seen.has(key)) continue
  seen.add(key)
  ;(edges[e.line] ||= []).push([a, b])
}

const out = {
  source: src.source,
  generatedAt: src.generatedAt,
  stations: Object.values(stations).map((s) => ({ ...s, lat: +s.lat.toFixed(6), lon: +s.lon.toFixed(6) })),
  edges,
}
writeFileSync(new URL('../src/data/seoul-network.json', import.meta.url), JSON.stringify(out))
console.log('stations', out.stations.length, 'edges', Object.values(edges).reduce((a, x) => a + x.length, 0))
