import { useState } from 'react'
import { Check, ChevronLeft, Crown, Minus } from 'lucide-react'
import { PrimaryButton, ScreenHeader, Toggle } from '../components/ui'
import { t, type MessageKey } from '../i18n'
import { PLANS, clientKeyIsTest, isActive, paymentsConfigured, startCheckout, writeSubscription, type PlanId } from '../services/premium'
import { useStore } from '../state/store'

const FEATURES: { key: MessageKey; free: boolean | MessageKey; pro: boolean | MessageKey }[] = [
  { key: 'pro.f.route', free: true, pro: true },
  { key: 'pro.f.crowd', free: true, pro: true },
  { key: 'pro.f.alerts', free: true, pro: true },
  { key: 'pro.f.report', free: 'pro.basic', pro: 'pro.detailed' },
  { key: 'pro.f.advRoute', free: false, pro: true },
  { key: 'pro.f.crowdRoute', free: false, pro: true },
  { key: 'pro.f.ads', free: 'pro.withAds', pro: 'pro.noAds' },
]

export default function PremiumScreen({ onClose }: { onClose: () => void }) {
  const s = useStore()
  const [plan, setPlan] = useState<PlanId>('premium-monthly')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const sub = s.subscription
  const active = isActive(sub)
  const configured = paymentsConfigured()

  const pay = async () => {
    setErr(null)
    setBusy(true)
    try {
      await startCheckout(plan, t(plan === 'premium-monthly' ? 'pro.monthly' : 'pro.yearly'))
    } catch (e) {
      const m = (e as { code?: string; message?: string }).code ?? (e as Error).message
      setErr(m === 'USER_CANCEL' ? t('pro.userCancel') : t('pro.payError', { m }))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="safe-top anim-fade-up absolute inset-0 z-40 flex flex-col bg-white">
      <ScreenHeader
        title={t('pro.title')}
        left={
          <button type="button" aria-label={t('common.back')} onClick={onClose} className="flex h-11 w-11 items-center justify-center">
            <ChevronLeft size={26} />
          </button>
        }
      />
      <div className="no-scrollbar flex-1 overflow-y-auto pb-8">
        {/* 상태 */}
        <div className="mx-4 rounded-2xl bg-ink p-5 text-white">
          <Crown size={26} className="text-[#F2C230]" />
          <p className="mt-2 text-[20px] font-extrabold">{active ? t('pro.active') : t('pro.free')}</p>
          {sub && (
            <div className="mt-2 space-y-0.5 text-[13px] opacity-85">
              <p>{t('pro.until', { d: new Date(sub.expiresAt).toLocaleDateString() })}</p>
              <p>
                {t(sub.plan === 'premium-monthly' ? 'pro.monthly' : 'pro.yearly')} · {sub.status === 'canceled' ? t('pro.canceled') : t('pro.statusActive')}
                {sub.testMode ? ` · ${t('pro.testPaid')}` : ''}
              </p>
              <p className="text-[11px] opacity-70">#{sub.orderId}</p>
            </div>
          )}
          {s.premiumPreview && !active && <p className="mt-2 text-[12px] text-[#F2C230]">{t('pro.previewOn')}</p>}
        </div>

        {/* 비교 */}
        <div className="mx-4 mt-4 overflow-hidden rounded-2xl border border-line">
          <div className="grid grid-cols-[1fr_72px_72px] bg-sub px-4 py-2 text-[12px] font-bold text-ink-2">
            <span />
            <span className="text-center">{t('pro.free')}</span>
            <span className="text-center text-brand">Premium</span>
          </div>
          {FEATURES.map((f) => (
            <div key={f.key} className="grid grid-cols-[1fr_72px_72px] items-center border-t border-line px-4 py-2.5 text-[13px]">
              <span className="font-medium">{t(f.key)}</span>
              {[f.free, f.pro].map((v, i) => (
                <span key={i} className={`flex justify-center text-center text-[12px] ${i ? 'font-semibold text-brand' : 'text-ink-2'}`}>
                  {v === true ? <Check size={16} /> : v === false ? <Minus size={16} className="text-[#C5CBD6]" /> : t(v)}
                </span>
              ))}
            </div>
          ))}
        </div>

        {/* 상품 */}
        {!active && (
          <>
            <div className="mt-5 grid grid-cols-2 gap-2 px-4">
              {PLANS.map((p) => (
                <button key={p.id} type="button" onClick={() => setPlan(p.id)} className={`rounded-2xl border-2 px-4 py-3 text-left ${plan === p.id ? 'border-brand bg-brand-light' : 'border-line'}`}>
                  <p className="text-[13px] font-semibold text-ink-2">{t(p.id === 'premium-monthly' ? 'pro.monthly' : 'pro.yearly')}</p>
                  <p className="text-[20px] font-extrabold tabular">₩{p.price.toLocaleString()}</p>
                  <p className="text-[11px] text-ink-2">{t('pro.days', { n: p.days })}</p>
                </button>
              ))}
            </div>
            <p className="mt-1 px-5 text-[11px] text-ink-2">{t('pro.priceNote')}</p>
            <div className="mt-3 px-4">
              <PrimaryButton disabled={!configured || busy} onClick={() => void pay()}>
                {busy ? t('common.loading') : t('pro.pay')}
              </PrimaryButton>
              {configured && clientKeyIsTest() && <p className="mt-2 text-center text-[12px] font-semibold text-brand">{t('pro.testMode')}</p>}
              {!configured && <p className="mt-2 rounded-xl bg-[#FDF6DC] px-4 py-3 text-[12px] leading-relaxed text-[#8A6A00]">{t('pro.notConfigured')}</p>}
              {err && <p className="mt-2 text-[13px] font-semibold text-danger">{err}</p>}
            </div>
          </>
        )}

        {active && sub?.status === 'active' && (
          <div className="mt-5 px-4">
            <button
              type="button"
              onClick={() => {
                if (!window.confirm(t('pro.cancelConfirm'))) return
                const next = { ...sub, status: 'canceled' as const }
                writeSubscription(next)
                s.setSubscription(next)
              }}
              className="h-12 w-full rounded-2xl border border-line text-[15px] font-bold text-ink-2"
            >
              {t('pro.cancel')}
            </button>
            <p className="mt-2 text-[12px] leading-relaxed text-ink-2">{t('pro.cancelNote')}</p>
          </div>
        )}

        {/* 시연용 미리보기 */}
        <div className="mx-4 mt-6 flex items-center gap-3 rounded-2xl border border-dashed border-[#C5CBD6] px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-bold">{t('pro.preview')}</p>
            <p className="text-[12px] leading-snug text-ink-2">{t('pro.previewSub')}</p>
          </div>
          <Toggle label={t('pro.preview')} on={s.premiumPreview} onChange={(v) => s.patch({ premiumPreview: v })} />
        </div>
      </div>
    </div>
  )
}
