// ─────────────────────────────────────────────────────────────
// 프리미엄 구독 — 토스페이먼츠 결제 (테스트 모드 우선)
// · VITE_TOSS_CLIENT_KEY(클라이언트 키) + 서버 TOSS_SECRET_KEY 가 모두 있어야 결제 가능
// · 테스트 키(test_ck_/test_sk_)를 사용하면 실제 출금 없이 결제 흐름을 검증
// · 결제 성공 리다이렉트 후 서버(/api/payments/confirm)가 승인해야만 구독이 활성화됨 — 버튼만 눌러 결제된 것처럼 처리하지 않음
// · 정기결제(자동 갱신)는 빌링키 계약 후 적용 예정 — 현재는 기간제 이용권
// ─────────────────────────────────────────────────────────────

export type PlanId = 'premium-monthly' | 'premium-yearly'
export const PLANS: { id: PlanId; price: number; days: number }[] = [
  { id: 'premium-monthly', price: 3900, days: 30 },
  { id: 'premium-yearly', price: 39000, days: 365 },
]

export interface Subscription {
  plan: PlanId
  orderId: string
  status: 'active' | 'canceled'
  startedAt: string
  expiresAt: string
  approvedAt?: string
  method?: string
  testMode: boolean
}

const KEY = 'totame:subscription:v1'
const CLIENT_KEY = import.meta.env.VITE_TOSS_CLIENT_KEY as string | undefined
export const paymentsConfigured = () => Boolean(CLIENT_KEY)
export const clientKeyIsTest = () => Boolean(CLIENT_KEY?.startsWith('test_'))

export function readSubscription(): Subscription | null {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Subscription | null
    return s
  } catch {
    return null
  }
}
export function writeSubscription(s: Subscription | null) {
  try {
    if (s) localStorage.setItem(KEY, JSON.stringify(s))
    else localStorage.removeItem(KEY)
  } catch {
    /* noop */
  }
}
export function isActive(s: Subscription | null) {
  return Boolean(s && new Date(s.expiresAt).getTime() > Date.now())
}

function loadSdk(): Promise<unknown> {
  const w = window as unknown as { TossPayments?: unknown }
  if (w.TossPayments) return Promise.resolve(w.TossPayments)
  return new Promise((res, rej) => {
    const sc = document.createElement('script')
    sc.src = 'https://js.tosspayments.com/v2/standard'
    sc.onload = () => res(w.TossPayments)
    sc.onerror = () => rej(new Error('sdk_load_failed'))
    document.head.appendChild(sc)
  })
}

type TossFactory = (key: string) => { payment: (o: { customerKey: string }) => { requestPayment: (o: Record<string, unknown>) => Promise<void> } }

/** 결제창 열기 — 성공 시 /pay/success 로 리다이렉트 */
export async function startCheckout(planId: PlanId, orderName: string) {
  if (!CLIENT_KEY) throw new Error('not_configured')
  const plan = PLANS.find((p) => p.id === planId)!
  const Toss = (await loadSdk()) as TossFactory
  let customer = ''
  try {
    customer = localStorage.getItem('totame:device') ?? ''
    if (!customer) {
      customer = crypto.randomUUID()
      localStorage.setItem('totame:device', customer)
    }
  } catch {
    customer = `guest-${Date.now()}`
  }
  const orderId = `totame-${planId}-${Date.now()}`
  const origin = window.location.origin
  await Toss(CLIENT_KEY)
    .payment({ customerKey: customer })
    .requestPayment({
      method: 'CARD',
      amount: { currency: 'KRW', value: plan.price },
      orderId,
      orderName,
      successUrl: `${origin}/pay/success?plan=${planId}`,
      failUrl: `${origin}/pay/fail`,
    })
}

/** 결제 성공 리다이렉트 처리 — 서버 승인 후에만 구독 저장 */
export async function confirmFromUrl(): Promise<{ ok: true; sub: Subscription } | { ok: false; code: string; message?: string } | null> {
  const url = new URL(window.location.href)
  if (url.pathname === '/pay/fail') return { ok: false, code: url.searchParams.get('code') ?? 'PAY_FAILED', message: url.searchParams.get('message') ?? undefined }
  if (url.pathname !== '/pay/success') return null
  const paymentKey = url.searchParams.get('paymentKey')
  const orderId = url.searchParams.get('orderId')
  const amount = Number(url.searchParams.get('amount'))
  const planId = url.searchParams.get('plan') as PlanId | null
  const plan = PLANS.find((p) => p.id === planId)
  if (!paymentKey || !orderId || !plan) return { ok: false, code: 'BAD_REDIRECT' }
  try {
    const r = await fetch('/api/payments/confirm', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ paymentKey, orderId, amount, plan: plan.id }) })
    const j = (await r.json().catch(() => ({}))) as { status?: string; approvedAt?: string; method?: string; testMode?: boolean; error?: string; message?: string }
    if (!r.ok || j.status !== 'DONE') return { ok: false, code: j.error ?? 'CONFIRM_FAILED', message: j.message }
    const now = new Date()
    const sub: Subscription = {
      plan: plan.id,
      orderId,
      status: 'active',
      startedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + plan.days * 86400000).toISOString(),
      approvedAt: j.approvedAt,
      method: j.method,
      testMode: Boolean(j.testMode),
    }
    writeSubscription(sub)
    return { ok: true, sub }
  } catch {
    return { ok: false, code: 'NETWORK' }
  }
}
