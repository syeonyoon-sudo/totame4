// 알림 출력 엔진 — 웹 표준 API로 구현 가능한 범위
// · 스마트폰 알림: Notification API / Service Worker (권한 필요, iOS는 홈 화면 추가 후 16.4+)
// · 알림음: Web Audio API
// · 진동: Vibration API (Android Chrome 지원, iOS Safari 미지원)
// · 음성 안내: Web Speech API (speechSynthesis) — 이어폰 연결 시 이어폰으로 출력
// · 스마트워치: 휴대폰 시스템 알림이 워치로 미러링됨 (워치 전용 화면은 네이티브 앱 필요)
import type { Lang } from '../data/network'

export type SoundType = 'chime' | 'ding' | 'bell'

const PATTERNS: Record<SoundType, { notes: number[]; wave: OscillatorType; step: number; len: number }> = {
  chime: { notes: [784, 988, 1175], wave: 'sine', step: 0.16, len: 0.22 },
  ding: { notes: [1046, 784], wave: 'triangle', step: 0.28, len: 0.4 },
  bell: { notes: [660, 660, 880], wave: 'square', step: 0.14, len: 0.1 },
}

let ctx: AudioContext | null = null
function audio() {
  try {
    const C = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    ctx ||= new C()
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

export function playSound(type: SoundType, volume: number) {
  const c = audio()
  if (!c || volume <= 0) return
  const p = PATTERNS[type]
  p.notes.forEach((f, i) => {
    const o = c.createOscillator()
    const g = c.createGain()
    o.type = p.wave
    o.frequency.value = f
    const t0 = c.currentTime + i * p.step
    const peak = Math.max(0.0002, 0.3 * volume * (p.wave === 'square' ? 0.35 : 1))
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.exponentialRampToValueAtTime(peak, t0 + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + p.len)
    o.connect(g).connect(c.destination)
    o.start(t0)
    o.stop(t0 + p.len + 0.02)
  })
}

export function vibrate(pattern: number[]) {
  try {
    if ('vibrate' in navigator) return navigator.vibrate(pattern)
  } catch {
    /* noop */
  }
  return false
}

export const canVibrate = () => typeof navigator !== 'undefined' && 'vibrate' in navigator
export const canSpeak = () => typeof window !== 'undefined' && 'speechSynthesis' in window
export const canNotify = () => typeof window !== 'undefined' && 'Notification' in window

const VOICE_LANG: Record<Lang, string> = { ko: 'ko-KR', en: 'en-US', zh: 'zh-CN', ja: 'ja-JP' }

export function speak(text: string, lang: Lang, volume: number, rate = 1) {
  if (!canSpeak()) return
  try {
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.lang = VOICE_LANG[lang]
    u.volume = Math.max(0.1, Math.min(1, volume))
    u.rate = rate
    const v = window.speechSynthesis.getVoices().find((x) => x.lang.replace('_', '-').startsWith(VOICE_LANG[lang].slice(0, 2)))
    if (v) u.voice = v
    window.speechSynthesis.speak(u)
  } catch {
    /* noop */
  }
}

export function notificationPermission(): NotificationPermission | 'unsupported' {
  return canNotify() ? Notification.permission : 'unsupported'
}

export async function requestNotificationPermission() {
  if (!canNotify()) return 'unsupported' as const
  try {
    return await Notification.requestPermission()
  } catch {
    return 'denied' as const
  }
}

let swReg: ServiceWorkerRegistration | null = null
export async function registerServiceWorker() {
  try {
    if ('serviceWorker' in navigator && window.isSecureContext) swReg = await navigator.serviceWorker.register('/sw.js')
  } catch {
    swReg = null
  }
}

export async function phoneNotify(title: string, body?: string, tag = 'totame', url = '/today') {
  if (!canNotify() || Notification.permission !== 'granted') return false
  try {
    if (swReg) {
      await swReg.showNotification(title, { body, tag, icon: '/favicon.svg', badge: '/favicon.svg', data: { url } })
      return true
    }
    new Notification(title, { body, tag, icon: '/favicon.svg' })
    return true
  } catch {
    return false
  }
}

/** 오디오 출력 장치 중 이어폰/헤드셋으로 보이는 장치가 있는지 (브라우저가 라벨을 숨기면 판단 불가) */
export async function detectEarphones(): Promise<boolean | null> {
  try {
    const devs = await navigator.mediaDevices?.enumerateDevices?.()
    if (!devs) return null
    const outs = devs.filter((d) => d.kind === 'audiooutput')
    if (!outs.length || outs.every((d) => !d.label)) return null
    return outs.some((d) => /head|ear|bluetooth|airpods|buds|이어|헤드/i.test(d.label))
  } catch {
    return null
  }
}
