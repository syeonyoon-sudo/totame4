// ─────────────────────────────────────────────────────────────
// 역사 내부 지도 데이터 구조
// 실제 역사 도면·시설 좌표가 확보된 역은 verified: true 로 등록합니다.
// 현재 등록된 이대역 데이터는 내비게이션 기능 시연을 위한 **개략 도면(예시)** 이며 실제 도면이 아닙니다.
// 좌표 단위: m (도면 좌상단 기준, x → 동쪽, y → 남쪽)
// ─────────────────────────────────────────────────────────────
import type { Lang } from './network'

export type NodeKind =
  | 'exit'
  | 'gate'
  | 'gateWide'
  | 'elevator'
  | 'escalator'
  | 'stairs'
  | 'lift'
  | 'toilet'
  | 'toiletAccessible'
  | 'info'
  | 'locker'
  | 'nursing'
  | 'platform'
  | 'emergency'
  | 'ticket'
  | 'junction'

export type EdgeType = 'walk' | 'stairs' | 'escalator' | 'elevator' | 'lift' | 'gate' | 'gateWide'

export interface IndoorNode {
  id: string
  floor: string
  x: number
  y: number
  kind: NodeKind
  name?: Record<Lang, string>
  /** 출구 번호 / 승강장 위치(호차-문) 등 */
  ref?: string
}

export interface IndoorEdge {
  a: string
  b: string
  type: EdgeType
  /** 한 방향 에스컬레이터: a → b 만 가능 */
  oneway?: boolean
}

export interface IndoorArea {
  floor: string
  kind: 'concourse' | 'paid' | 'platform' | 'track' | 'room' | 'street'
  x: number
  y: number
  w: number
  h: number
  label?: Record<Lang, string>
}

export interface IndoorStation {
  station: string
  verified: boolean
  source: Record<Lang, string>
  floors: { id: string; level: number; name: Record<Lang, string>; short?: Record<Lang, string> }[]
  nodes: IndoorNode[]
  edges: IndoorEdge[]
  areas: IndoorArea[]
  /** 지상 출구의 실제 방향 (도면 x축 기준 회전, 도) — 출구 좌표 환산용 */
  rotation: number
}

const N = (ko: string, en: string, zh: string, ja: string): Record<Lang, string> => ({ ko, en, zh, ja })

// ── 이대역 (2호선) — 시연용 개략 도면 ─────────────────────────
const EWHA: IndoorStation = {
  station: '이대',
  verified: false,
  source: N(
    '시연용 개략 도면 · 실제 역사 도면 아님 · 서울교통공사 역사 시설 데이터 연동 시 교체',
    'Schematic demo plan · not the official floor plan · to be replaced with Seoul Metro facility data',
    '演示用示意图 · 非官方平面图 · 接入首尔交通公社设施数据后替换',
    'デモ用概略図 · 公式図面ではありません · 施設データ連携後に差し替え',
  ),
  rotation: 0,
  floors: [
    { id: 'G', level: 0, name: N('지상 (출구)', 'Street (exits)', '地面(出口)', '地上(出口)'), short: N('지상', 'street level', '地面', '地上') },
    { id: 'B1', level: -1, name: N('지하 1층 대합실', 'B1 Concourse', '地下1层 大厅', '地下1階 コンコース'), short: N('지하 1층 대합실', 'B1 concourse', '地下1层大厅', '地下1階コンコース') },
    { id: 'B2', level: -2, name: N('지하 2층 승강장', 'B2 Platforms', '地下2层 站台', '地下2階 ホーム'), short: N('지하 2층 승강장', 'B2 platforms', '地下2层站台', '地下2階ホーム') },
  ],
  areas: [
    { floor: 'G', kind: 'street', x: 0, y: 0, w: 120, h: 60 },
    { floor: 'B1', kind: 'concourse', x: 8, y: 12, w: 52, h: 36, label: N('대합실 (개찰구 밖)', 'Concourse (outside gates)', '大厅(闸机外)', 'コンコース(改札外)') },
    { floor: 'B1', kind: 'paid', x: 60, y: 12, w: 50, h: 36, label: N('개찰구 안', 'Inside gates', '闸机内', '改札内') },
    { floor: 'B2', kind: 'platform', x: 15, y: 10, w: 95, h: 12, label: N('신촌·홍대입구 방면 승강장', 'Platform → Sinchon / Hongik Univ.', '往新村·弘大入口方向站台', '新村・弘大入口方面ホーム') },
    { floor: 'B2', kind: 'track', x: 15, y: 22, w: 95, h: 16 },
    { floor: 'B2', kind: 'platform', x: 15, y: 38, w: 95, h: 12, label: N('아현·시청 방면 승강장', 'Platform → Ahyeon / City Hall', '往阿岘·市厅方向站台', '阿峴・市庁方面ホーム') },
  ],
  nodes: [
    // 지상 출구
    { id: 'E1', floor: 'G', x: 12, y: 6, kind: 'exit', ref: '1', name: N('1번 출구', 'Exit 1', '1号出口', '1番出口') },
    { id: 'E2', floor: 'G', x: 12, y: 54, kind: 'exit', ref: '2', name: N('2번 출구', 'Exit 2', '2号出口', '2番出口') },
    { id: 'E3', floor: 'G', x: 42, y: 54, kind: 'exit', ref: '3', name: N('3번 출구 (엘리베이터)', 'Exit 3 (elevator)', '3号出口(电梯)', '3番出口(EV)') },
    { id: 'E4', floor: 'G', x: 42, y: 6, kind: 'exit', ref: '4', name: N('4번 출구', 'Exit 4', '4号出口', '4番出口') },
    // 지상 ↔ 대합실 연결점
    { id: 'G-E1', floor: 'G', x: 16, y: 14, kind: 'stairs' },
    { id: 'G-E2s', floor: 'G', x: 16, y: 46, kind: 'stairs' },
    { id: 'G-E2e', floor: 'G', x: 22, y: 46, kind: 'escalator' },
    { id: 'G-E3', floor: 'G', x: 42, y: 46, kind: 'elevator' },
    { id: 'G-E4', floor: 'G', x: 42, y: 14, kind: 'stairs' },
    // 대합실 (개찰구 밖)
    { id: 'B1-E1', floor: 'B1', x: 16, y: 16, kind: 'stairs', name: N('1번 출구 계단', 'Stairs to Exit 1', '1号出口楼梯', '1番出口階段') },
    { id: 'B1-E2s', floor: 'B1', x: 16, y: 44, kind: 'stairs', name: N('2번 출구 계단', 'Stairs to Exit 2', '2号出口楼梯', '2番出口階段') },
    { id: 'B1-E2e', floor: 'B1', x: 22, y: 44, kind: 'escalator', name: N('2번 출구 에스컬레이터', 'Escalator to Exit 2', '2号出口扶梯', '2番出口エスカレーター') },
    { id: 'B1-E3', floor: 'B1', x: 42, y: 44, kind: 'elevator', name: N('3번 출구 엘리베이터', 'Elevator to Exit 3', '3号出口电梯', '3番出口EV') },
    { id: 'B1-E4', floor: 'B1', x: 42, y: 16, kind: 'stairs', name: N('4번 출구 계단', 'Stairs to Exit 4', '4号出口楼梯', '4番出口階段') },
    { id: 'J1', floor: 'B1', x: 22, y: 30, kind: 'junction' },
    { id: 'J2', floor: 'B1', x: 42, y: 30, kind: 'junction' },
    { id: 'J3', floor: 'B1', x: 54, y: 30, kind: 'junction' },
    { id: 'INFO', floor: 'B1', x: 54, y: 18, kind: 'info', name: N('고객안전실 (역무실)', 'Station office / customer center', '客服中心(站务室)', '駅事務室・案内') },
    { id: 'LOCK', floor: 'B1', x: 30, y: 40, kind: 'locker', name: N('물품보관함', 'Lockers', '储物柜', 'コインロッカー') },
    { id: 'NURSE', floor: 'B1', x: 30, y: 20, kind: 'nursing', name: N('수유실', 'Nursing room', '哺乳室', '授乳室') },
    { id: 'TICKET', floor: 'B1', x: 50, y: 40, kind: 'ticket', name: N('승차권 발매·충전기', 'Ticket & top-up machines', '售票·充值机', '券売機・チャージ機') },
    // 개찰구
    { id: 'GATE', floor: 'B1', x: 60, y: 26, kind: 'gate', name: N('개찰구', 'Fare gates', '闸机', '改札口') },
    { id: 'GATEW', floor: 'B1', x: 60, y: 36, kind: 'gateWide', name: N('넓은 개찰구 (휠체어·유모차·캐리어)', 'Wide gate (wheelchair, stroller, luggage)', '宽闸机(轮椅·婴儿车·行李)', '幅広改札(車いす・ベビーカー・荷物)') },
    // 개찰구 안
    { id: 'P1', floor: 'B1', x: 68, y: 30, kind: 'junction' },
    { id: 'WC', floor: 'B1', x: 72, y: 44, kind: 'toilet', name: N('화장실', 'Restrooms', '洗手间', 'トイレ') },
    { id: 'WCA', floor: 'B1', x: 80, y: 44, kind: 'toiletAccessible', name: N('장애인 화장실', 'Accessible restroom', '无障碍洗手间', '多目的トイレ') },
    { id: 'P2', floor: 'B1', x: 86, y: 30, kind: 'junction' },
    { id: 'B1-ESN', floor: 'B1', x: 86, y: 18, kind: 'escalator', name: N('신촌 방면 에스컬레이터', 'Escalator to Sinchon-bound', '往新村方向扶梯', '新村方面エスカレーター') },
    { id: 'B1-STN', floor: 'B1', x: 96, y: 18, kind: 'stairs', name: N('신촌 방면 계단', 'Stairs to Sinchon-bound', '往新村方向楼梯', '新村方面階段') },
    { id: 'B1-ELN', floor: 'B1', x: 104, y: 22, kind: 'elevator', name: N('신촌 방면 엘리베이터', 'Elevator to Sinchon-bound', '往新村方向电梯', '新村方面EV') },
    { id: 'B1-ESS', floor: 'B1', x: 86, y: 42, kind: 'escalator', name: N('아현 방면 에스컬레이터', 'Escalator to Ahyeon-bound', '往阿岘方向扶梯', '阿峴方面エスカレーター') },
    { id: 'B1-STS', floor: 'B1', x: 96, y: 42, kind: 'stairs', name: N('아현 방면 계단', 'Stairs to Ahyeon-bound', '往阿岘方向楼梯', '阿峴方面階段') },
    { id: 'B1-ELS', floor: 'B1', x: 104, y: 38, kind: 'elevator', name: N('아현 방면 엘리베이터', 'Elevator to Ahyeon-bound', '往阿岘方向电梯', '阿峴方面EV') },
    { id: 'LIFT', floor: 'B1', x: 76, y: 16, kind: 'lift', name: N('휠체어 리프트 (보조)', 'Wheelchair lift (backup)', '轮椅升降平台(备用)', '車いすリフト(予備)') },
    // 승강장 — 신촌 방면 (북쪽)
    { id: 'B2-ESN', floor: 'B2', x: 86, y: 14, kind: 'escalator' },
    { id: 'B2-STN', floor: 'B2', x: 96, y: 14, kind: 'stairs' },
    { id: 'B2-ELN', floor: 'B2', x: 104, y: 16, kind: 'elevator' },
    { id: 'PN10', floor: 'B2', x: 100, y: 18, kind: 'platform', ref: '10-1', name: N('신촌 방면 10-1', 'Sinchon-bound car 10-1', '往新村 10-1', '新村方面 10-1') },
    { id: 'PN7', floor: 'B2', x: 72, y: 18, kind: 'platform', ref: '7-1', name: N('신촌 방면 7-1', 'Sinchon-bound car 7-1', '往新村 7-1', '新村方面 7-1') },
    { id: 'PN4', floor: 'B2', x: 46, y: 18, kind: 'platform', ref: '4-1', name: N('신촌 방면 4-1', 'Sinchon-bound car 4-1', '往新村 4-1', '新村方面 4-1') },
    { id: 'PN1', floor: 'B2', x: 20, y: 18, kind: 'platform', ref: '1-1', name: N('신촌 방면 1-1', 'Sinchon-bound car 1-1', '往新村 1-1', '新村方面 1-1') },
    { id: 'EMN', floor: 'B2', x: 60, y: 13, kind: 'emergency', name: N('비상벨·비상전화', 'Emergency bell / phone', '紧急按钮·电话', '非常ボタン・電話') },
    // 승강장 — 아현 방면 (남쪽)
    { id: 'B2-ESS', floor: 'B2', x: 86, y: 46, kind: 'escalator' },
    { id: 'B2-STS', floor: 'B2', x: 96, y: 46, kind: 'stairs' },
    { id: 'B2-ELS', floor: 'B2', x: 104, y: 44, kind: 'elevator' },
    { id: 'PS1', floor: 'B2', x: 100, y: 42, kind: 'platform', ref: '1-1', name: N('아현 방면 1-1', 'Ahyeon-bound car 1-1', '往阿岘 1-1', '阿峴方面 1-1') },
    { id: 'PS4', floor: 'B2', x: 72, y: 42, kind: 'platform', ref: '4-1', name: N('아현 방면 4-1', 'Ahyeon-bound car 4-1', '往阿岘 4-1', '阿峴方面 4-1') },
    { id: 'PS7', floor: 'B2', x: 46, y: 42, kind: 'platform', ref: '7-1', name: N('아현 방면 7-1', 'Ahyeon-bound car 7-1', '往阿岘 7-1', '阿峴方面 7-1') },
    { id: 'PS10', floor: 'B2', x: 20, y: 42, kind: 'platform', ref: '10-1', name: N('아현 방면 10-1', 'Ahyeon-bound car 10-1', '往阿岘 10-1', '阿峴方面 10-1') },
    { id: 'EMS', floor: 'B2', x: 60, y: 47, kind: 'emergency', name: N('비상벨·비상전화', 'Emergency bell / phone', '紧急按钮·电话', '非常ボタン・電話') },
  ],
  edges: [
    // 출구 ↔ 지상 연결점
    { a: 'E1', b: 'G-E1', type: 'walk' },
    { a: 'E2', b: 'G-E2s', type: 'walk' },
    { a: 'E2', b: 'G-E2e', type: 'walk' },
    { a: 'E3', b: 'G-E3', type: 'walk' },
    { a: 'E4', b: 'G-E4', type: 'walk' },
    // 층간 이동 (지상 ↔ B1)
    { a: 'G-E1', b: 'B1-E1', type: 'stairs' },
    { a: 'G-E2s', b: 'B1-E2s', type: 'stairs' },
    { a: 'B1-E2e', b: 'G-E2e', type: 'escalator', oneway: true }, // 올라가는 방향만
    { a: 'G-E3', b: 'B1-E3', type: 'elevator' },
    { a: 'G-E4', b: 'B1-E4', type: 'stairs' },
    // 대합실
    { a: 'B1-E1', b: 'J1', type: 'walk' },
    { a: 'B1-E2s', b: 'J1', type: 'walk' },
    { a: 'B1-E2e', b: 'J1', type: 'walk' },
    { a: 'J1', b: 'J2', type: 'walk' },
    { a: 'B1-E3', b: 'J2', type: 'walk' },
    { a: 'B1-E4', b: 'J2', type: 'walk' },
    { a: 'J2', b: 'J3', type: 'walk' },
    { a: 'J1', b: 'NURSE', type: 'walk' },
    { a: 'J1', b: 'LOCK', type: 'walk' },
    { a: 'J3', b: 'INFO', type: 'walk' },
    { a: 'J3', b: 'TICKET', type: 'walk' },
    // 개찰구
    { a: 'J3', b: 'GATE', type: 'walk' },
    { a: 'J3', b: 'GATEW', type: 'walk' },
    { a: 'GATE', b: 'P1', type: 'gate' },
    { a: 'GATEW', b: 'P1', type: 'gateWide' },
    // 개찰구 안
    { a: 'P1', b: 'WC', type: 'walk' },
    { a: 'P1', b: 'WCA', type: 'walk' },
    { a: 'P1', b: 'P2', type: 'walk' },
    { a: 'P1', b: 'LIFT', type: 'walk' },
    { a: 'P2', b: 'B1-ESN', type: 'walk' },
    { a: 'P2', b: 'B1-STN', type: 'walk' },
    { a: 'P2', b: 'B1-ELN', type: 'walk' },
    { a: 'P2', b: 'B1-ESS', type: 'walk' },
    { a: 'P2', b: 'B1-STS', type: 'walk' },
    { a: 'P2', b: 'B1-ELS', type: 'walk' },
    // 층간 이동 (B1 ↔ B2)
    { a: 'B1-ESN', b: 'B2-ESN', type: 'escalator' },
    { a: 'B1-STN', b: 'B2-STN', type: 'stairs' },
    { a: 'B1-ELN', b: 'B2-ELN', type: 'elevator' },
    { a: 'B1-ESS', b: 'B2-ESS', type: 'escalator' },
    { a: 'B1-STS', b: 'B2-STS', type: 'stairs' },
    { a: 'B1-ELS', b: 'B2-ELS', type: 'elevator' },
    { a: 'LIFT', b: 'B2-ELN', type: 'lift' },
    // 승강장 (북)
    { a: 'B2-ESN', b: 'PN10', type: 'walk' },
    { a: 'B2-STN', b: 'PN10', type: 'walk' },
    { a: 'B2-ELN', b: 'PN10', type: 'walk' },
    { a: 'PN10', b: 'PN7', type: 'walk' },
    { a: 'PN7', b: 'EMN', type: 'walk' },
    { a: 'PN7', b: 'PN4', type: 'walk' },
    { a: 'PN4', b: 'PN1', type: 'walk' },
    // 승강장 (남)
    { a: 'B2-ESS', b: 'PS1', type: 'walk' },
    { a: 'B2-STS', b: 'PS1', type: 'walk' },
    { a: 'B2-ELS', b: 'PS1', type: 'walk' },
    { a: 'PS1', b: 'PS4', type: 'walk' },
    { a: 'PS4', b: 'EMS', type: 'walk' },
    { a: 'PS4', b: 'PS7', type: 'walk' },
    { a: 'PS7', b: 'PS10', type: 'walk' },
  ],
}

/** 실내 지도 등록 역 — 확장 시 여기에 추가 (또는 API/DB에서 로드) */
export const INDOOR: Record<string, IndoorStation> = { [EWHA.station]: EWHA }

export const hasIndoor = (station: string) => Boolean(INDOOR[station])
