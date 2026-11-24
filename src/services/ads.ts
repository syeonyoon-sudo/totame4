// 광고 슬롯 관리
// · 광고 네트워크 승인 전: 하우스 광고(자체 예시 광고)만 표시하며 모두 '광고' 표기
// · Google AdSense 승인 후: VITE_ADSENSE_CLIENT, VITE_ADSENSE_SLOT_* 환경변수를 설정하면 AdSlot이 애드센스 태그로 전환
// · 노출/클릭 통계는 기기에 저장 (운영 시 서버 집계 API로 교체)

export type AdPlacement = 'home_banner' | 'route_bottom' | 'arrival_native' | 'station_area' | 'local_partner'

export interface HouseAd {
  id: string
  placement: AdPlacement[]
  title: Record<'ko' | 'en' | 'zh' | 'ja', string>
  body: Record<'ko' | 'en' | 'zh' | 'ja', string>
  /** 역 주변 광고 대상 역 (없으면 전체) */
  stations?: string[]
  tone: string
}

/** 시연용 하우스 광고 — 가상의 업체명, 실제 업체 아님 */
export const HOUSE_ADS: HouseAd[] = [
  {
    id: 'h1',
    placement: ['home_banner', 'route_bottom'],
    title: { ko: '출퇴근길 정기권, 앱으로 간편하게', en: 'Commuter pass, right in the app', zh: '通勤月票，应用内轻松办理', ja: '定期券をアプリでかんたんに' },
    body: { ko: '광고 예시 · 가상의 교통카드 서비스', en: 'Sample ad · fictional transit card', zh: '广告示例 · 虚构交通卡服务', ja: '広告サンプル · 架空の交通カード' },
    tone: '#EAF0FC',
  },
  {
    id: 'h2',
    placement: ['station_area', 'local_partner', 'arrival_native'],
    title: { ko: '역 앞 카페 〇〇 — 또타미 이용자 음료 10% 할인', en: 'Café 〇〇 by the station — 10% off', zh: '站前咖啡〇〇 — 饮品9折', ja: '駅前カフェ〇〇 — ドリンク10%オフ' },
    body: { ko: '지역 상권 제휴 광고 예시 · 가상 업체', en: 'Local partner ad sample · fictional shop', zh: '本地商户合作广告示例 · 虚构店铺', ja: '地域提携広告サンプル · 架空の店舗' },
    tone: '#FDF6DC',
  },
  {
    id: 'h3',
    placement: ['arrival_native', 'home_banner'],
    title: { ko: '도착역 근처 전시 〈도시의 선〉', en: 'Exhibition near your station', zh: '到达站附近的展览', ja: '到着駅近くの展示会' },
    body: { ko: '네이티브 광고 예시 · 가상 전시', en: 'Native ad sample · fictional event', zh: '原生广告示例 · 虚构活动', ja: 'ネイティブ広告サンプル · 架空イベント' },
    tone: '#E7F5EC',
  },
]

export function pickAd(placement: AdPlacement, seed = 0) {
  const list = HOUSE_ADS.filter((a) => a.placement.includes(placement))
  return list[seed % list.length]
}

const STATS_KEY = 'totame:adstats:v1'
export type AdStats = Record<string, { impressions: number; clicks: number }>

export function readAdStats(): AdStats {
  try {
    return JSON.parse(localStorage.getItem(STATS_KEY) ?? '{}') as AdStats
  } catch {
    return {}
  }
}
export function trackAd(placement: AdPlacement, type: 'impressions' | 'clicks') {
  try {
    const s = readAdStats()
    s[placement] ||= { impressions: 0, clicks: 0 }
    s[placement][type] += 1
    localStorage.setItem(STATS_KEY, JSON.stringify(s))
  } catch {
    /* noop */
  }
}
export function resetAdStats() {
  try {
    localStorage.removeItem(STATS_KEY)
  } catch {
    /* noop */
  }
}

export const ADSENSE_CLIENT = import.meta.env.VITE_ADSENSE_CLIENT as string | undefined
