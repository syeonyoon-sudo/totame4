// 회원 기능 — Supabase Auth (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY 설정 시 활성화)
// SDK 없이 Supabase Auth REST API를 직접 호출합니다.
export interface Session {
  accessToken: string
  refreshToken: string
  userId: string
  email: string
  expiresAt: number
}

const URL_ = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, '')
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
const KEY = 'totame:session:v1'

export const authConfigured = () => Boolean(URL_ && ANON)

export function readSession(): Session | null {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? 'null') as Session | null
  } catch {
    return null
  }
}

function save(j: { access_token: string; refresh_token: string; expires_in: number; user: { id: string; email: string } }) {
  const s: Session = { accessToken: j.access_token, refreshToken: j.refresh_token, userId: j.user.id, email: j.user.email, expiresAt: Date.now() + j.expires_in * 1000 }
  localStorage.setItem(KEY, JSON.stringify(s))
  return s
}

async function call(path: string, body: unknown) {
  const r = await fetch(`${URL_}/auth/v1/${path}`, { method: 'POST', headers: { apikey: ANON!, 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const j = (await r.json().catch(() => ({}))) as Record<string, unknown>
  if (!r.ok) throw new Error(String(j.msg ?? j.error_description ?? j.message ?? 'auth_failed'))
  return j
}

export async function signUp(email: string, password: string) {
  const j = await call('signup', { email, password })
  // 이메일 확인이 켜져 있으면 세션 없이 확인 메일만 발송됨
  return j.access_token ? save(j as never) : null
}

export async function signIn(email: string, password: string) {
  return save((await call('token?grant_type=password', { email, password })) as never)
}

export function signOut() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* noop */
  }
}
