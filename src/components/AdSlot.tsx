import { useEffect, useRef } from 'react'
import { ChevronRight, X } from 'lucide-react'
import { getLang, t } from '../i18n'
import { ADSENSE_CLIENT, pickAd, trackAd, type AdPlacement } from '../services/ads'
import { useStore } from '../state/store'

/**
 * 광고 영역 — 일반 콘텐츠와 구분되도록 항상 '광고' 라벨 표시
 * 이동 안내 중(하차 직전 등) 주요 화면에는 배치하지 않습니다.
 */
export default function AdSlot({ placement, seed = 0, variant = 'banner' }: { placement: AdPlacement; seed?: number; variant?: 'banner' | 'native' }) {
  const { adsEnabled: enabled, premium, setTab, openPage } = useStore()
  const adsEnabled = enabled && !premium
  const seen = useRef(false)
  const ad = pickAd(placement, seed)

  useEffect(() => {
    if (adsEnabled && ad && !seen.current) {
      seen.current = true
      trackAd(placement, 'impressions')
    }
  }, [adsEnabled, ad, placement])

  useEffect(() => {
    if (!ADSENSE_CLIENT || !adsEnabled) return
    try {
      const w = window as unknown as { adsbygoogle?: unknown[] }
      ;(w.adsbygoogle = w.adsbygoogle || []).push({})
    } catch {
      /* noop */
    }
  }, [adsEnabled])

  if (!adsEnabled || !ad) return null
  const lang = getLang()

  if (ADSENSE_CLIENT) {
    return (
      <div className="mx-4 my-3">
        <p className="mb-1 text-[11px] font-semibold text-ink-2">{t('ad.label')}</p>
        <ins
          className="adsbygoogle"
          style={{ display: 'block' }}
          data-ad-client={ADSENSE_CLIENT}
          data-ad-slot={(import.meta.env[`VITE_ADSENSE_SLOT_${placement.toUpperCase()}`] as string | undefined) ?? ''}
          data-ad-format="auto"
          data-full-width-responsive="true"
        />
      </div>
    )
  }

  return (
    <div className={`mx-4 my-3 rounded-2xl border border-line ${variant === 'native' ? 'p-4' : 'px-4 py-3'}`} style={{ background: ad.tone }}>
      <div className="flex items-center gap-2">
        <span className="rounded border border-ink-2/40 px-1 text-[10px] leading-4 font-bold text-ink-2">{t('ad.label')}</span>
        <span className="text-[11px] text-ink-2">{t(`ad.place.${placement}` as 'ad.place.home_banner')}</span>
        <button
          type="button"
          aria-label={t('ad.settings')}
          onClick={() => {
            setTab('my')
            openPage({ kind: 'premium' })
          }}
          className="ml-auto text-ink-2"
        >
          <X size={15} />
        </button>
      </div>
      <button
        type="button"
        onClick={() => trackAd(placement, 'clicks')}
        className="mt-1.5 flex w-full items-center gap-2 text-left"
      >
        <div className="min-w-0 flex-1">
          <p className={`font-bold ${variant === 'native' ? 'text-[16px]' : 'text-[14px]'}`}>{ad.title[lang]}</p>
          <p className="text-[12px] text-ink-2">{ad.body[lang]}</p>
        </div>
        <ChevronRight size={17} className="shrink-0 text-ink-2" />
      </button>
    </div>
  )
}
