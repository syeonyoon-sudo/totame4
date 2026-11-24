import type { ReactNode } from 'react'
import { LINES, type LineId } from '../data/network'
import type { Route } from '../lib/routing'
import { LEVEL_BG, LEVEL_COLORS, type CongestionLevel, type DataKind } from '../lib/congestion'
import { getLang, lineName, t } from '../i18n'

export function LineBadge({ line, size = 20 }: { line: LineId; size?: number }) {
  const short = LINES[line].short
  const numeric = /^\d$/.test(short)
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-bold whitespace-nowrap text-white tabular ${numeric ? '' : 'px-1.5'}`}
      style={{ background: LINES[line].color, width: numeric ? size : undefined, minWidth: size, height: size, fontSize: numeric ? size * 0.58 : size * 0.5 }}
      aria-label={lineName(line)}
      title={lineName(line)}
    >
      {getLang() === 'ko' || numeric ? short : lineName(line).slice(0, 4)}
    </span>
  )
}

export function CrowdChip({ level, small }: { level: CongestionLevel; small?: boolean }) {
  const label = [t('crowd.l0'), t('crowd.l1'), t('crowd.l2'), t('crowd.l3')][level]
  return (
    <span className={`inline-flex items-center gap-1 rounded-full font-semibold ${small ? 'h-5 px-1.5 text-[11px]' : 'h-6 px-2 text-[12px]'}`} style={{ background: LEVEL_BG[level], color: level === 1 ? '#8A6A00' : LEVEL_COLORS[level] }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: LEVEL_COLORS[level] }} />
      {label}
    </span>
  )
}

/** 데이터 종류 표시: 실시간 / 최근 업데이트 / 예상 / 시연용 */
export function DataTag({ kind, at, className = '' }: { kind: DataKind; at?: Date; className?: string }) {
  const label = { realtime: t('data.realtime'), recent: t('data.recent'), estimate: t('data.estimate'), demo: t('data.demo') }[kind]
  const cls = kind === 'realtime' ? 'bg-[#E7F5EC] text-ok' : 'bg-sub text-ink-2'
  return (
    <span className={`inline-flex h-5 items-center gap-1 rounded-md px-1.5 text-[11px] font-medium ${cls} ${className}`}>
      {kind === 'realtime' && <span className="h-1.5 w-1.5 rounded-full bg-ok" />}
      {label}
      {at && ` · ${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`}
    </span>
  )
}

/** 경로 구간을 비율 막대로 표현 */
export function RouteBar({ route, faded }: { route: Route; faded?: boolean }) {
  const total = route.segments.reduce((a, s) => a + s.minutes, 0) + route.transfers.reduce((a, t) => a + t.seconds / 60, 0)
  return (
    <div className={`flex h-6 w-full items-center ${faded ? 'opacity-50' : ''}`}>
      {route.segments.map((s, i) => {
        const tr = route.transfers[i - 1]
        return (
          <div key={i} className="contents">
            {tr && (
              <div className="relative h-1.5 shrink-0" style={{ width: `${Math.max(6, (tr.seconds / 60 / total) * 100)}%` }}>
                <div className="absolute inset-x-0 top-1/2 h-0 -translate-y-1/2 border-t-2 border-dotted border-[#B5BCCB]" />
              </div>
            )}
            <div className="relative h-5 min-w-0" style={{ width: `${(s.minutes / total) * 100}%` }}>
              <div className="absolute inset-y-0 right-0 left-0 rounded-full" style={{ background: LINES[s.line].color }} />
              <span className="absolute top-1/2 left-1 -translate-y-1/2">
                <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-white px-0.5 text-[9px] font-bold" style={{ color: LINES[s.line].color }}>
                  {/^\d$/.test(LINES[s.line].short) ? LINES[s.line].short : LINES[s.line].short.slice(0, 1)}
                </span>
              </span>
              <span className="absolute top-1/2 right-2 -translate-y-1/2 text-[11px] font-semibold text-white tabular">
                {t('unit.min', { n: Math.round(s.minutes) })}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`relative h-[30px] w-[50px] shrink-0 rounded-full transition-colors ${on ? 'bg-brand' : 'bg-[#D5DAE3]'}`}
    >
      <span className={`absolute top-[3px] left-[3px] h-6 w-6 rounded-full bg-white shadow-sm transition-transform ${on ? 'translate-x-5' : ''}`} />
    </button>
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  size = 'md',
}: {
  value: T
  options: { value: T; label: ReactNode }[]
  onChange: (v: T) => void
  size?: 'sm' | 'md'
}) {
  return (
    <div className="flex rounded-xl bg-sub p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`flex-1 rounded-[10px] font-semibold transition-all ${size === 'sm' ? 'h-8 text-[13px]' : 'h-10 text-[15px]'} ${
            value === o.value ? 'bg-white text-brand shadow-[0_1px_3px_rgba(34,43,58,0.12)]' : 'text-ink-2'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function SampleTag({ className = '' }: { className?: string }) {
  return <span className={`inline-flex h-5 items-center rounded-md bg-sub px-1.5 text-[11px] font-medium text-ink-2 ${className}`}>{t('data.demo')}</span>
}

export function ScreenHeader({ title, left, right }: { title: ReactNode; left?: ReactNode; right?: ReactNode }) {
  return (
    <div className="relative z-10 flex h-14 shrink-0 items-center bg-white px-2">
      <div className="flex w-12 justify-start">{left}</div>
      <h1 className="flex-1 text-center text-[17px] font-bold">{title}</h1>
      <div className="flex w-12 justify-end">{right}</div>
    </div>
  )
}

export function IconBtn({ children, onClick, label, className = '' }: { children: ReactNode; onClick?: () => void; label: string; className?: string }) {
  return (
    <button type="button" aria-label={label} onClick={onClick} className={`flex h-11 w-11 items-center justify-center rounded-full active:bg-sub ${className}`}>
      {children}
    </button>
  )
}

export function PrimaryButton({ children, onClick, disabled, tone = 'brand', className = '' }: { children: ReactNode; onClick?: () => void; disabled?: boolean; tone?: 'brand' | 'light' | 'danger' | 'ink'; className?: string }) {
  const tones = {
    brand: 'bg-brand text-white active:bg-[#1f2c7a]',
    light: 'bg-brand-light text-brand active:bg-[#dbe4fa]',
    danger: 'bg-danger text-white',
    ink: 'bg-ink text-white',
  }
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex h-[54px] w-full items-center justify-center gap-2 rounded-2xl text-[17px] font-bold transition-colors disabled:bg-[#D5DAE3] disabled:text-white ${tones[tone]} ${className}`}
    >
      {children}
    </button>
  )
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between px-5 pt-6 pb-2">
      <h2 className="text-[15px] font-bold text-ink">{children}</h2>
      {right}
    </div>
  )
}
