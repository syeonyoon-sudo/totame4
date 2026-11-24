import { useEffect, useState, type ReactNode } from 'react'
import { ArrowLeftRight, Bell, CalendarClock, Footprints, House, Navigation, User, X } from 'lucide-react'
import { todayStr } from '../lib/schedule'
import { t, type MessageKey } from '../i18n'
import { useStore, type Tab } from '../state/store'

/** 데스크톱: 스마트폰 프레임 시연 모드 / 모바일: 전체 화면 */
export function PhoneFrame({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState(() => detect())
  useEffect(() => {
    const on = () => setMode(detect())
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])

  if (mode.mobile) {
    return <div className="relative h-full w-full overflow-hidden bg-white">{children}</div>
  }
  return (
    <div className="flex h-full w-full flex-col items-center justify-center overflow-hidden bg-[#E9ECF2]">
      <div style={{ width: 390 * mode.scale, height: 844 * mode.scale }}>
        <div
          className="relative overflow-hidden rounded-[54px] bg-white shadow-[0_30px_80px_rgba(34,43,58,0.25),0_0_0_10px_#1b1f27,0_0_0_12px_#3a3f4a]"
          style={{ width: 390, height: 844, transform: `scale(${mode.scale})`, transformOrigin: 'top left', ['--safe-top' as string]: '50px', ['--safe-bottom' as string]: '18px' }}
        >
          <StatusBar />
          {children}
          <div className="pointer-events-none absolute bottom-2 left-1/2 z-[60] h-[5px] w-[134px] -translate-x-1/2 rounded-full bg-ink/85" />
        </div>
      </div>
      <p className="mt-5 text-[13px] text-ink-2">{t('frame.hint')}</p>
    </div>
  )
}

function detect() {
  const w = window.innerWidth
  const h = window.innerHeight
  const mobile = w < 600 || (navigator.maxTouchPoints > 0 && w < 900)
  const scale = Math.min(1.15, (h - 70) / 844, (w - 40) / 390)
  return { mobile, scale: Math.max(0.5, scale) }
}

function StatusBar() {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15000)
    return () => clearInterval(t)
  }, [])
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-[60] flex h-[50px] items-center justify-between px-8 pt-1 text-[16px] font-semibold text-ink">
      <span className="tabular w-14 text-center">{`${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`}</span>
      <div className="absolute top-[11px] left-1/2 h-[32px] w-[120px] -translate-x-1/2 rounded-full bg-black" />
      <div className="flex items-center gap-1.5">
        <svg width="18" height="12" viewBox="0 0 18 12" fill="#222B3A">
          <rect x="0" y="8" width="3" height="4" rx="1" />
          <rect x="5" y="5.5" width="3" height="6.5" rx="1" />
          <rect x="10" y="3" width="3" height="9" rx="1" />
          <rect x="15" y="0" width="3" height="12" rx="1" />
        </svg>
        <svg width="16" height="12" viewBox="0 0 16 12" fill="#222B3A">
          <path d="M8 2.2c2.3 0 4.4.9 6 2.4l1.2-1.3A10.4 10.4 0 0 0 8 .4 10.4 10.4 0 0 0 .8 3.3L2 4.6a8.6 8.6 0 0 1 6-2.4Zm0 3.6c1.4 0 2.6.5 3.5 1.4l1.3-1.3A6.6 6.6 0 0 0 8 4a6.6 6.6 0 0 0-4.8 1.9l1.3 1.3C5.4 6.3 6.6 5.8 8 5.8Zm0 3.5L6 11.4l2 .6 2-.6-2-2.1Z" />
        </svg>
        <svg width="27" height="13" viewBox="0 0 27 13">
          <rect x="0.5" y="0.5" width="23" height="12" rx="3.5" fill="none" stroke="#222B3A" opacity="0.4" />
          <rect x="2" y="2" width="17" height="9" rx="2" fill="#222B3A" />
          <rect x="24.5" y="4.5" width="1.6" height="4" rx="0.8" fill="#222B3A" opacity="0.4" />
        </svg>
      </div>
    </div>
  )
}

const TABS: { id: Tab; label: MessageKey; Icon: typeof House }[] = [
  { id: 'home', label: 'tab.home', Icon: House },
  { id: 'depart', label: 'tab.depart', Icon: Footprints },
  { id: 'move', label: 'tab.move', Icon: Navigation },
  { id: 'transfer', label: 'tab.transfer', Icon: ArrowLeftRight },
  { id: 'today', label: 'tab.today', Icon: CalendarClock },
  { id: 'my', label: 'tab.my', Icon: User },
]

export function TabBar() {
  const { tab, setTab, journey, appointments } = useStore()
  const today = todayStr()
  const todayCount = appointments.filter((a) => a.date === today && !a.canceled && !a.homeArrivedAt).length
  return (
    <nav className="safe-bottom relative z-40 shrink-0 border-t border-line bg-white" style={{ containerType: 'inline-size' }} aria-label="main">
      <div className="flex h-[58px]">
        {TABS.map(({ id, label, Icon }) => {
          const active = tab === id
          return (
            <button
              key={id}
              type="button"
              aria-current={active ? 'page' : undefined}
              onClick={() => setTab(id)}
              className={`relative flex min-w-0 flex-1 flex-col items-center justify-center gap-[3px] ${active ? 'text-brand' : 'text-[#9AA2B1]'}`}
            >
              {active && <span className="absolute inset-x-[18%] top-0 h-[3px] rounded-b-full bg-brand" />}
              <span className={`flex h-[26px] w-[40px] items-center justify-center rounded-full ${active ? 'bg-brand-light' : ''}`}>
                <Icon size={20} strokeWidth={active ? 2.4 : 1.9} />
              </span>
              <span className={`max-w-full overflow-hidden leading-none tracking-[-0.03em] whitespace-nowrap ${active ? 'font-bold' : 'font-medium'}`} style={{ fontSize: 'clamp(9px, 2.8cqw, 11px)' }}>
                {t(label)}
              </span>
              {id === 'move' && journey && !journey.arrived && <span className="absolute top-1.5 right-[calc(50%-20px)] h-2 w-2 rounded-full bg-danger ring-2 ring-white" />}
              {id === 'today' && todayCount > 0 && (
                <span className="absolute top-1 right-[calc(50%-24px)] flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-2 px-1 text-[10px] font-bold text-white ring-2 ring-white">{todayCount}</span>
              )}
            </button>
          )
        })}
      </div>
    </nav>
  )
}

const TONE = {
  info: 'bg-brand',
  warn: 'bg-warn',
  danger: 'bg-danger',
  success: 'bg-ok',
}

/** iOS 알림 스타일 인앱 배너 */
export function NoticeBanner() {
  const { notice, setNotice } = useStore()
  if (!notice) return null
  return (
    <div className="safe-top pointer-events-none absolute inset-x-0 top-0 z-[55] px-3 pt-2">
      <div
        key={notice.id}
        role="alert"
        className="anim-slide-down pointer-events-auto flex items-start gap-3 rounded-[20px] bg-white/95 p-3.5 shadow-[0_8px_30px_rgba(34,43,58,0.22)] backdrop-blur"
      >
        <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] text-white ${TONE[notice.tone]}`}>
          <Bell size={19} strokeWidth={2.3} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] leading-snug font-bold">{notice.title}</p>
          {notice.body && <p className="mt-0.5 text-[13px] leading-snug text-ink-2">{notice.body}</p>}
          {notice.action && (
            <button
              type="button"
              onClick={() => {
                notice.action!.run()
                setNotice(null)
              }}
              className="mt-2 h-8 rounded-lg bg-brand-light px-3 text-[13px] font-bold text-brand"
            >
              {notice.action.label}
            </button>
          )}
        </div>
        <button type="button" aria-label={t('common.close')} onClick={() => setNotice(null)} className="-m-1 p-1 text-ink-2">
          <X size={18} />
        </button>
      </div>
    </div>
  )
}
