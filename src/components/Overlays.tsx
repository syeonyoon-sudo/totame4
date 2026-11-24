import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ArrowDown, ArrowUp, Check, ChevronLeft, Clock, Search, Star, X } from 'lucide-react'
import { ALL_STATIONS, STATION_LINES } from '../data/network'
import { stationName, t, type MessageKey } from '../i18n'
import { ALL_CRITERIA, PREMIUM_CRITERIA, type Criterion } from '../lib/routing'
import { useStore } from '../state/store'
import { LineBadge, PrimaryButton } from './ui'

export const CRITERION_KEY: Record<Criterion, MessageKey> = {
  fast: 'crit.fast',
  transfer: 'crit.transfer',
  walk: 'crit.walk',
  congestion: 'crit.congestion',
  elevator: 'crit.elevator',
  escalator: 'crit.escalator',
  stairs: 'crit.stairs',
  access: 'crit.access',
  luggage: 'crit.luggage',
  comfort: 'crit.comfort',
}

/** 모달형 하단 시트 */
export function Modal({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode }) {
  if (!open) return null
  return (
    <div className="absolute inset-0 z-50 flex flex-col justify-end">
      <button type="button" aria-label={t('common.close')} className="absolute inset-0 bg-ink/40" onClick={onClose} />
      <div className="anim-fade-up safe-bottom relative flex max-h-[88%] flex-col rounded-t-[24px] bg-white">
        <div className="flex h-14 shrink-0 items-center justify-between pr-2 pl-5">
          <h3 className="text-[18px] font-bold">{title}</h3>
          <button type="button" aria-label={t('common.close')} onClick={onClose} className="flex h-11 w-11 items-center justify-center text-ink-2">
            <X size={22} />
          </button>
        </div>
        <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto">{children}</div>
        {footer && <div className="shrink-0 px-5 pt-2 pb-4">{footer}</div>}
      </div>
    </div>
  )
}

const norm = (s: string) => s.toLowerCase().replace(/[\s.'’()·–-]/g, '')

/** 전체 화면 역 검색 — 한국어·영어·중국어·일본어 역명 모두 검색 */
export function StationPicker({ open, title, onClose, onPick, exclude }: { open: boolean; title: string; onClose: () => void; onPick: (id: string) => void; exclude?: string }) {
  const { favorites, recents, patch } = useStore()
  const [q, setQ] = useState('')
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (open) {
      setQ('')
      setTimeout(() => input.current?.focus(), 60)
    }
  }, [open])

  const results = useMemo(() => {
    const raw = q.trim().replace(/역$/, '')
    const t0 = norm(raw)
    if (!t0) return []
    const score = (id: string) => {
      const st = ALL_STATIONS.find((s) => s.id === id)!
      const names = Object.values(st.names).map(norm)
      if (names.some((n) => n === t0)) return 0
      if (names.some((n) => n.startsWith(t0))) return 1
      return 2
    }
    return ALL_STATIONS.filter((s) => s.id !== exclude && Object.values(s.names).some((n) => norm(n).includes(t0)))
      .sort((a, b) => score(a.id) - score(b.id))
      .slice(0, 60)
  }, [q, exclude])

  const recentStations = useMemo(() => {
    const ids: string[] = []
    recents.forEach((r) => [r.to, r.from].forEach((id) => !ids.includes(id) && ids.push(id)))
    return ids.filter((id) => id !== exclude && STATION_LINES[id]).slice(0, 5)
  }, [recents, exclude])

  if (!open) return null
  const Row = ({ id, icon }: { id: string; icon?: ReactNode }) => {
    const fav = favorites.includes(id)
    return (
      <div className="flex items-center border-b border-line last:border-0">
        <button type="button" onClick={() => onPick(id)} className="flex min-h-[58px] min-w-0 flex-1 items-center gap-3 pl-5 text-left active:bg-sub">
          {icon}
          <span className="truncate text-[16px] font-semibold">{stationName(id)}</span>
          <span className="flex shrink-0 flex-wrap gap-1">
            {STATION_LINES[id].map((l) => (
              <LineBadge key={l} line={l} size={18} />
            ))}
          </span>
        </button>
        <button
          type="button"
          aria-label={fav ? t('fav.remove') : t('fav.add')}
          onClick={() => patch({ favorites: fav ? favorites.filter((f) => f !== id) : [...favorites, id] })}
          className="flex h-[58px] w-14 shrink-0 items-center justify-center"
        >
          <Star size={19} className={fav ? 'fill-warn text-warn' : 'text-[#C5CBD6]'} />
        </button>
      </div>
    )
  }

  return (
    <div className="safe-top anim-fade-up absolute inset-0 z-50 flex flex-col bg-white">
      <div className="flex h-16 shrink-0 items-center gap-1 pr-4 pl-1">
        <button type="button" aria-label={t('common.back')} onClick={onClose} className="flex h-11 w-11 items-center justify-center">
          <ChevronLeft size={26} />
        </button>
        <div className="flex h-12 flex-1 items-center gap-2 rounded-xl bg-sub px-3">
          <Search size={19} className="text-ink-2" />
          <input
            ref={input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={title}
            className="h-full min-w-0 flex-1 bg-transparent text-[16px] font-medium outline-none placeholder:text-[#A3AAB8]"
            onKeyDown={(e) => e.key === 'Enter' && results[0] && onPick(results[0].id)}
          />
          {q && (
            <button type="button" aria-label={t('common.clear')} onClick={() => setQ('')} className="text-[#A3AAB8]">
              <X size={18} />
            </button>
          )}
        </div>
      </div>
      <div className="no-scrollbar flex-1 overflow-y-auto">
        {q ? (
          results.length ? (
            results.map((s) => <Row key={s.id} id={s.id} />)
          ) : (
            <p className="px-5 py-10 text-center text-[15px] text-ink-2">{t('search.none')}</p>
          )
        ) : (
          <>
            {favorites.filter((f) => f !== exclude && STATION_LINES[f]).length > 0 && (
              <>
                <p className="px-5 pt-4 pb-1 text-[13px] font-semibold text-ink-2">{t('fav.stations')}</p>
                {favorites
                  .filter((f) => f !== exclude && STATION_LINES[f])
                  .map((id) => (
                    <Row key={id} id={id} />
                  ))}
              </>
            )}
            <p className="px-5 pt-5 pb-1 text-[13px] font-semibold text-ink-2">{t('search.recent')}</p>
            {recentStations.map((id) => (
              <Row key={id} id={id} icon={<Clock size={17} className="shrink-0 text-[#A3AAB8]" />} />
            ))}
            <p className="px-5 pt-5 pb-1 text-[13px] text-ink-2">{t('search.count', { n: ALL_STATIONS.length })}</p>
          </>
        )}
      </div>
    </div>
  )
}

/** 이동 조건 + 우선순위 편집기 */
export function PriorityEditor({ value, onChange }: { value: Criterion[]; onChange: (v: Criterion[]) => void }) {
  const { premium, openPage } = useStore()
  const locked = (c: Criterion) => !premium && PREMIUM_CRITERIA.includes(c)
  const toggle = (c: Criterion) => {
    if (locked(c) && !value.includes(c)) return openPage({ kind: 'premium' })
    onChange(value.includes(c) ? value.filter((x) => x !== c) : [...value, c])
  }
  const move = (i: number, d: -1 | 1) => {
    const n = [...value]
    ;[n[i], n[i + d]] = [n[i + d], n[i]]
    onChange(n)
  }
  return (
    <div>
      <div className="grid grid-cols-2 gap-2 px-5">
        {ALL_CRITERIA.map((c) => {
          const idx = value.indexOf(c)
          const on = idx >= 0
          return (
            <button
              key={c}
              type="button"
              onClick={() => toggle(c)}
              className={`flex min-h-[52px] items-center gap-2.5 rounded-xl border px-3 py-2 text-left text-[14px] leading-tight font-semibold transition-colors ${
                on ? 'border-brand bg-brand-light text-brand' : 'border-line text-ink'
              }`}
            >
              <span className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full text-[12px] font-bold tabular ${on ? 'bg-brand text-white' : 'border-[1.5px] border-[#C5CBD6]'}`}>
                {on ? idx + 1 : ''}
              </span>
              <span className="min-w-0 flex-1">{t(CRITERION_KEY[c])}</span>
              {locked(c) && <span className="shrink-0 rounded bg-ink px-1 text-[10px] font-bold text-white">PRO</span>}
            </button>
          )
        })}
      </div>
      {value.length > 1 && (
        <div className="mt-5 px-5">
          <p className="mb-2 text-[13px] font-semibold text-ink-2">{t('crit.priorityHint')}</p>
          <div className="overflow-hidden rounded-xl border border-line">
            {value.map((c, i) => (
              <div key={c} className="flex h-[52px] items-center gap-3 border-b border-line pr-1 pl-4 last:border-0">
                <span className="w-5 text-[15px] font-bold text-brand tabular">{i + 1}</span>
                <span className="flex-1 text-[15px] font-semibold">{t(CRITERION_KEY[c])}</span>
                <button type="button" aria-label={t('common.up')} disabled={i === 0} onClick={() => move(i, -1)} className="flex h-11 w-11 items-center justify-center text-ink disabled:text-[#D5DAE3]">
                  <ArrowUp size={19} />
                </button>
                <button type="button" aria-label={t('common.down')} disabled={i === value.length - 1} onClick={() => move(i, 1)} className="flex h-11 w-11 items-center justify-center text-ink disabled:text-[#D5DAE3]">
                  <ArrowDown size={19} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      {value.length === 0 && <p className="mt-4 px-5 text-[13px] text-ink-2">{t('crit.none')}</p>}
    </div>
  )
}

export function ConditionSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { priorities, patch } = useStore()
  const [draft, setDraft] = useState<Criterion[]>(priorities)
  useEffect(() => {
    if (open) setDraft(priorities)
  }, [open, priorities])
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('crit.title')}
      footer={
        <PrimaryButton
          onClick={() => {
            patch({ priorities: draft })
            onClose()
          }}
        >
          <Check size={20} /> {t('common.apply')}
        </PrimaryButton>
      }
    >
      <PriorityEditor value={draft} onChange={setDraft} />
      <div className="h-4" />
    </Modal>
  )
}
