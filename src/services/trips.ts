// 이동 기록 저장소
// 기본: 이 기기(localStorage)에 저장
// Supabase 환경변수(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)를 설정하면 Supabase 저장소로 전환할 수 있는 구조입니다.
// 테이블 스키마: supabase/schema.sql
import type { LineId } from '../data/network'
import { readSession } from './auth'

export interface TripRecord {
  id: string
  startedAt: string // ISO
  endedAt: string // ISO
  from: string
  to: string
  lines: LineId[]
  stations: string[]
  minutes: number
  transfers: number
  distanceKm: number
  walkM: number
  /** 지연으로 추가된 시간(분) */
  delayMin?: number
  /** 시연용 예시 기록 여부 — 실제 기록과 구분 */
  demo?: boolean
}

export interface TripRepository {
  readonly kind: 'local' | 'supabase'
  list(): Promise<TripRecord[]>
  add(t: TripRecord): Promise<void>
  remove(id: string): Promise<void>
  clear(opts?: { demoOnly?: boolean }): Promise<void>
}

const KEY = 'totame:trips:v1'

class LocalTripRepository implements TripRepository {
  readonly kind = 'local' as const
  private read(): TripRecord[] {
    try {
      return JSON.parse(localStorage.getItem(KEY) ?? '[]') as TripRecord[]
    } catch {
      return []
    }
  }
  private write(list: TripRecord[]) {
    try {
      localStorage.setItem(KEY, JSON.stringify(list.slice(-2000)))
    } catch {
      /* noop */
    }
  }
  async list() {
    return this.read().sort((a, b) => b.startedAt.localeCompare(a.startedAt))
  }
  async add(t: TripRecord) {
    this.write([...this.read(), t])
  }
  async remove(id: string) {
    this.write(this.read().filter((x) => x.id !== id))
  }
  async clear(opts?: { demoOnly?: boolean }) {
    this.write(opts?.demoOnly ? this.read().filter((x) => !x.demo) : [])
  }
}

/** Supabase REST(PostgREST) 저장소 — 로그인 연동 시 user_id 기준 RLS 적용 필요 (README 참고) */
class SupabaseTripRepository implements TripRepository {
  readonly kind = 'supabase' as const
  private url: string
  private key: string
  private device: string
  constructor(url: string, key: string) {
    this.url = url.replace(/\/$/, '')
    this.key = key
    let d = ''
    try {
      d = localStorage.getItem('totame:device') ?? ''
      if (!d) {
        d = crypto.randomUUID()
        localStorage.setItem('totame:device', d)
      }
    } catch {
      d = 'anonymous'
    }
    this.device = d
  }
  private headers() {
    // 로그인 시 사용자 토큰으로 요청 → RLS(user_id) 정책 적용
    return { apikey: this.key, Authorization: `Bearer ${readSession()?.accessToken ?? this.key}`, 'Content-Type': 'application/json' }
  }
  async list() {
    const r = await fetch(`${this.url}/rest/v1/trips?device_id=eq.${this.device}&order=started_at.desc`, { headers: this.headers() })
    if (!r.ok) throw new Error('supabase list failed')
    const rows = (await r.json()) as Record<string, unknown>[]
    return rows.map((x) => ({
      id: String(x.id),
      startedAt: String(x.started_at),
      endedAt: String(x.ended_at),
      from: String(x.from_station),
      to: String(x.to_station),
      lines: x.lines as LineId[],
      stations: x.stations as string[],
      minutes: Number(x.minutes),
      transfers: Number(x.transfers),
      distanceKm: Number(x.distance_km),
      walkM: Number(x.walk_m),
      delayMin: Number(x.delay_min ?? 0),
      demo: Boolean(x.demo),
    }))
  }
  async add(t: TripRecord) {
    await fetch(`${this.url}/rest/v1/trips`, {
      method: 'POST',
      headers: { ...this.headers(), Prefer: 'return=minimal' },
      body: JSON.stringify({
        id: t.id,
        device_id: this.device,
        user_id: readSession()?.userId ?? null,
        started_at: t.startedAt,
        ended_at: t.endedAt,
        from_station: t.from,
        to_station: t.to,
        lines: t.lines,
        stations: t.stations,
        minutes: t.minutes,
        transfers: t.transfers,
        distance_km: t.distanceKm,
        walk_m: t.walkM,
        delay_min: t.delayMin ?? 0,
        demo: !!t.demo,
      }),
    })
  }
  async remove(id: string) {
    await fetch(`${this.url}/rest/v1/trips?id=eq.${id}&device_id=eq.${this.device}`, { method: 'DELETE', headers: this.headers() })
  }
  async clear(opts?: { demoOnly?: boolean }) {
    await fetch(`${this.url}/rest/v1/trips?device_id=eq.${this.device}${opts?.demoOnly ? '&demo=eq.true' : ''}`, { method: 'DELETE', headers: this.headers() })
  }
}

export function createTripRepository(): TripRepository {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
  if (url && key) return new SupabaseTripRepository(url, key)
  return new LocalTripRepository()
}

export function newId() {
  try {
    return crypto.randomUUID()
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`
  }
}
