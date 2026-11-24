// Vercel Serverless Function — 토스페이먼츠 결제 승인 (테스트/운영 공통)
// 환경변수: TOSS_SECRET_KEY (테스트 키 test_sk_... 를 넣으면 실제 돈이 빠져나가지 않는 테스트 결제)
// 결제창에서 성공 리다이렉트 후 클라이언트가 호출: POST /api/payments/confirm { paymentKey, orderId, amount }
// 서버가 금액을 검증하고 토스 승인 API를 호출해야만 구독이 활성화됩니다.
declare const process: { env: Record<string, string | undefined> }
declare const Buffer: { from(s: string): { toString(enc: string): string } }

const PLANS: Record<string, number> = { 'premium-monthly': 3900, 'premium-yearly': 39000 }

export async function POST(request: Request): Promise<Response> {
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8' } })
  const secret = process.env.TOSS_SECRET_KEY
  if (!secret) return json({ error: 'not_configured' }, 503)
  let b: { paymentKey?: string; orderId?: string; amount?: number; plan?: string }
  try {
    b = (await request.json()) as typeof b
  } catch {
    return json({ error: 'bad_request' }, 400)
  }
  const expected = PLANS[b.plan ?? '']
  if (!b.paymentKey || !b.orderId || !expected || Number(b.amount) !== expected) return json({ error: 'amount_mismatch' }, 400)
  const r = await fetch('https://api.tosspayments.com/v1/payments/confirm', {
    method: 'POST',
    headers: { Authorization: `Basic ${Buffer.from(`${secret}:`).toString('base64')}`, 'content-type': 'application/json' },
    body: JSON.stringify({ paymentKey: b.paymentKey, orderId: b.orderId, amount: expected }),
  })
  const data = (await r.json()) as { status?: string; approvedAt?: string; method?: string; code?: string; message?: string }
  if (!r.ok) return json({ error: data.code ?? 'confirm_failed', message: data.message }, 400)
  return json({ status: data.status, approvedAt: data.approvedAt, method: data.method, testMode: secret.startsWith('test_') })
}
