// ─────────────────────────────────────────────────────────────
// 열차 운행 지연 정보
// · 실시간: 서울시 실시간 지하철 API(/api/arrival) + 공식 시간표가 모두 있어야 지연을 계산할 수 있음
// · 시뮬레이션: 장애 대응 화면에서 발생시킨 이벤트
// · 확인 불가: 실시간 정보를 받을 수 없으면 '정상 운행'이라고 단정하지 않음
// ─────────────────────────────────────────────────────────────
import type { LineId } from '../data/network'
import type { MessageKey } from '../i18n'
import type { Disruption } from '../lib/routing'

export type LineStatusKind = 'simulated' | 'realtime' | 'unknown'

export interface LineStatus {
  line: LineId
  kind: LineStatusKind
  delayMin: number
  suspended: boolean
  updatedAt: Date
  message: MessageKey
}

/**
 * realtimeAvailable: /api/arrival 이 응답하는지(키 설정 여부)
 * scheduleAvailable: 공식 시간표 데이터 연동 여부 — 현재 버전은 미연동
 */
export function lineStatus(line: LineId, disruptions: Disruption[], realtimeAvailable: boolean, scheduleAvailable = false): LineStatus {
  const now = new Date()
  const delay = disruptions.filter((d) => d.kind === 'delay' && d.line === line).reduce((a, d) => a + (d.kind === 'delay' ? d.minutes : 0), 0)
  const suspended = disruptions.some((d) => d.kind === 'suspend' && d.line === line)
  if (suspended) return { line, kind: 'simulated', delayMin: delay, suspended, updatedAt: now, message: 'delay.suspended' }
  if (delay > 0) return { line, kind: 'simulated', delayMin: delay, suspended, updatedAt: now, message: delay >= 5 ? 'delay.major' : 'delay.minor' }
  if (realtimeAvailable && scheduleAvailable) return { line, kind: 'realtime', delayMin: 0, suspended, updatedAt: now, message: 'delay.normal' }
  return { line, kind: 'unknown', delayMin: 0, suspended, updatedAt: now, message: realtimeAvailable ? 'delay.noSchedule' : 'delay.unknown' }
}

/** 실시간 API 사용 가능 여부 확인 (한 번만) */
let probe: Promise<boolean> | null = null
export function probeRealtime(): Promise<boolean> {
  probe ||= fetch('/api/arrival?station=%EC%8B%9C%EC%B2%AD')
    .then((r) => r.ok && (r.headers.get('content-type') ?? '').includes('json'))
    .catch(() => false)
  return probe
}
