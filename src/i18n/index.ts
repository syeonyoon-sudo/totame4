import { LINES, STATIONS, type Lang, type LineId } from '../data/network'
import { MESSAGES } from './messages'

export type { Lang }
export const LANGS: { id: Lang; label: string }[] = [
  { id: 'ko', label: '한국어' },
  { id: 'en', label: 'English' },
  { id: 'zh', label: '简体中文' },
  { id: 'ja', label: '日本語' },
]
const IDX: Record<Lang, number> = { ko: 0, en: 1, zh: 2, ja: 3 }

let current: Lang = 'ko'

export function detectLang(): Lang {
  try {
    const l = (navigator.languages?.[0] ?? navigator.language ?? 'ko').toLowerCase()
    if (l.startsWith('ko')) return 'ko'
    if (l.startsWith('zh')) return 'zh'
    if (l.startsWith('ja')) return 'ja'
    return 'en'
  } catch {
    return 'ko'
  }
}

export function setLang(l: Lang) {
  current = l
  try {
    document.documentElement.lang = l === 'zh' ? 'zh-CN' : l
  } catch {
    /* noop */
  }
}
export const getLang = () => current

export type MessageKey = keyof typeof MESSAGES

export function t(key: MessageKey, vars?: Record<string, string | number>): string {
  const row = MESSAGES[key] as readonly string[] | undefined
  let s = row ? (row[IDX[current]] ?? row[1] ?? row[0]) : String(key)
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v))
  return s
}

export function stationName(id: string) {
  const st = STATIONS[id]
  return st ? st.names[current] : id
}
export function lineName(id: LineId) {
  return LINES[id].names[current]
}
