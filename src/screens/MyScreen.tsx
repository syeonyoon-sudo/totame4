import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Accessibility, BarChart3, Bell, BellRing, CalendarClock, ChevronLeft, ChevronRight, Crown, Footprints, Gauge, Globe, Headphones, History, LocateFixed, Megaphone, Plus, ShieldCheck, Smartphone, Star, Type, User, Vibrate, Volume2, Watch, X } from 'lucide-react'
import { authConfigured, readSession, signIn, signOut, signUp } from '../services/auth'
import { PriorityEditor, StationPicker } from '../components/Overlays'
import { LineBadge, PrimaryButton, ScreenHeader, Segmented, Toggle } from '../components/ui'
import { STATIONS, STATION_LINES } from '../data/network'
import { LANGS, stationName, t, type MessageKey } from '../i18n'
import { canSpeak, canVibrate, notificationPermission, playSound, requestNotificationPermission, speak } from '../lib/notify'
import { formatMMSS, transferSeconds } from '../lib/routing'
import { readAdStats, resetAdStats, type AdPlacement } from '../services/ads'
import { PACE_PRESETS, paceKey, placeLabel, useStore } from '../state/store'
import { PACE_LABEL } from './RouteScreen'
import { AddPlace } from './SmartDeparture'

export default function MyScreen() {
  return (
    <div className="safe-top absolute inset-0 flex flex-col bg-white">
      <ScreenHeader title={t('tab.my')} />
      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
        <Settings />
      </div>
    </div>
  )
}

function Account() {
  const s = useStore()
  const [session, setSession] = useState(readSession())
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  if (!authConfigured())
    return (
      <div className="flex items-center gap-3 px-5 pb-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-light text-brand">
          <User size={24} />
        </span>
        <div className="min-w-0 flex-1">
          <input value={s.nickname} onChange={(e) => s.patch({ nickname: e.target.value })} placeholder={t('my.nicknamePh')} className="h-9 w-full rounded-lg bg-transparent text-[17px] font-bold outline-none placeholder:font-medium placeholder:text-[#A3AAB8] focus:bg-sub focus:px-2" />
          <p className="text-[12px] text-ink-2">{t('acct.notConfigured')}</p>
        </div>
      </div>
    )
  if (session)
    return (
      <div className="flex items-center gap-3 px-5 pb-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand text-white">
          <User size={24} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[16px] font-bold">{session.email}</p>
          <p className="text-[12px] text-ink-2">{t('acct.loggedIn')}</p>
        </div>
        <button type="button" onClick={() => (signOut(), setSession(null))} className="h-9 rounded-lg bg-sub px-3 text-[13px] font-bold">
          {t('acct.logout')}
        </button>
      </div>
    )
  const run = async (kind: 'in' | 'up') => {
    setBusy(true)
    setMsg(null)
    try {
      const ses = kind === 'in' ? await signIn(email, pw) : await signUp(email, pw)
      if (ses) {
        setSession(ses)
        void s.clearTrips(true)
      } else setMsg(t('acct.checkEmail'))
    } catch (e) {
      setMsg(String((e as Error).message))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="px-5 pb-4">
      <p className="text-[15px] font-bold">{t('acct.title')}</p>
      <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" placeholder={t('acct.email')} className="mt-2 h-11 w-full rounded-xl bg-sub px-3 text-[15px] outline-none" />
      <input value={pw} onChange={(e) => setPw(e.target.value)} type="password" autoComplete="current-password" placeholder={t('acct.password')} className="mt-2 h-11 w-full rounded-xl bg-sub px-3 text-[15px] outline-none" />
      {msg && <p className="mt-2 text-[12px] text-danger">{msg}</p>}
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button type="button" disabled={busy || !email || pw.length < 6} onClick={() => void run('in')} className="h-11 rounded-xl bg-brand text-[14px] font-bold text-white disabled:bg-[#D5DAE3]">
          {t('acct.login')}
        </button>
        <button type="button" disabled={busy || !email || pw.length < 6} onClick={() => void run('up')} className="h-11 rounded-xl border border-brand text-[14px] font-bold text-brand disabled:border-line disabled:text-[#A3AAB8]">
          {t('acct.signup')}
        </button>
      </div>
    </div>
  )
}

function Row({ icon, label, sub, right }: { icon: ReactNode; label: string; sub?: string; right: ReactNode }) {
  return (
    <div className="flex min-h-[58px] items-center gap-3 px-5 py-2">
      <span className="shrink-0 text-ink-2">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[15px]">{label}</p>
        {sub && <p className="text-[12px] leading-snug text-ink-2">{sub}</p>}
      </div>
      {right}
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
      <div className="h-2 bg-sub" />
      <div className="pt-4 pb-2">
        <p className="px-5 pb-1 text-[15px] font-bold">{title}</p>
        {children}
      </div>
    </>
  )
}

function Settings() {
  const s = useStore()
  const n = s.alerts
  const [measure, setMeasure] = useState(false)
  const [addFav, setAddFav] = useState(false)
  const [addPlace, setAddPlace] = useState(false)
  const [perm, setPerm] = useState(notificationPermission())
  const [stats, setStats] = useState(readAdStats())

  const enablePhone = async (v: boolean, key: 'phone' | 'watch') => {
    if (v) {
      const p = await requestNotificationPermission()
      setPerm(p)
      if (p !== 'granted') {
        s.notify({ title: t('nt.permDenied'), body: t('nt.permDeniedBody'), tone: 'warn' }, { kind: 'system', silent: true })
        return
      }
    }
    s.patchNotify({ [key]: v })
  }

  const permText = perm === 'granted' ? t('nt.perm.granted') : perm === 'denied' ? t('nt.perm.denied') : perm === 'unsupported' ? t('nt.perm.unsupported') : t('nt.perm.default')

  const placements: { id: AdPlacement; key: MessageKey }[] = [
    { id: 'home_banner', key: 'ad.place.home_banner' },
    { id: 'route_bottom', key: 'ad.place.route_bottom' },
    { id: 'arrival_native', key: 'ad.place.arrival_native' },
    { id: 'station_area', key: 'ad.place.station_area' },
    { id: 'local_partner', key: 'ad.place.local_partner' },
  ]

  return (
    <div className="pb-10">
      <Account />
      {/* 프리미엄 */}
      <button type="button" onClick={() => s.openPage({ kind: 'premium' })} className="mx-4 mb-4 flex w-[calc(100%-2rem)] items-center gap-3 rounded-2xl bg-ink px-4 py-3.5 text-left text-white">
        <Crown size={20} className="shrink-0 text-[#F2C230]" />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-bold">{s.premiumPaid ? t('pro.active') : s.premiumPreview ? t('pro.previewOn') : t('pro.cta')}</p>
          <p className="text-[12px] opacity-75">{s.premiumPaid && s.subscription ? t('pro.until', { d: new Date(s.subscription.expiresAt).toLocaleDateString() }) : t('pro.ctaSub')}</p>
        </div>
        <ChevronRight size={18} />
      </button>

      {/* 바로가기: 이동 리포트 · 알림 설정 · 오늘 일정 */}
      <div className="grid grid-cols-3 gap-2 px-4 pb-4">
        <button type="button" onClick={() => s.openPage({ kind: 'report' })} className="flex flex-col items-start gap-1 rounded-2xl bg-brand-light px-3 py-3 text-left">
          <BarChart3 size={20} className="text-brand" />
          <span className="text-[14px] font-bold text-brand">{t('tab.report')}</span>
          <span className="text-[11px] text-ink-2">{s.trips.filter((x) => !x.demo).length ? t('my.tripsN', { n: s.trips.filter((x) => !x.demo).length }) : t('my.tripsNone')}</span>
        </button>
        <button type="button" onClick={() => s.openPage({ kind: 'alarms' })} className="flex flex-col items-start gap-1 rounded-2xl bg-sub px-3 py-3 text-left">
          <BellRing size={20} className="text-ink" />
          <span className="text-[14px] font-bold">{t('al.title')}</span>
          <span className="text-[11px] text-ink-2">{t('my.alarmSub')}</span>
        </button>
        <button type="button" onClick={() => s.setTab('today')} className="flex flex-col items-start gap-1 rounded-2xl bg-sub px-3 py-3 text-left">
          <CalendarClock size={20} className="text-ink" />
          <span className="text-[14px] font-bold">{t('tab.today')}</span>
          <span className="text-[11px] text-ink-2">{t('my.apptN', { n: s.appointments.filter((a) => !a.canceled && !a.homeArrivedAt).length })}</span>
        </button>
      </div>

      {/* 언어 */}
      <Section title={t('my.language')}>
        <div className="grid grid-cols-4 gap-2 px-5 pt-1">
          {LANGS.map((l) => (
            <button key={l.id} type="button" onClick={() => s.patch({ lang: l.id })} className={`flex h-11 items-center justify-center gap-1 rounded-xl text-[14px] font-semibold ${s.lang === l.id ? 'bg-brand text-white' : 'bg-sub'}`}>
              {s.lang === l.id && <Globe size={14} />}
              {l.label}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => s.openPage({ kind: 'foreign' })} className="mx-5 mt-3 flex h-11 w-[calc(100%-2.5rem)] items-center justify-center gap-1.5 rounded-xl border border-brand text-[14px] font-bold text-brand">
          <Globe size={16} /> Foreign Mode
        </button>
      </Section>

      {/* 보행속도 */}
      <Section title={t('pace.title')}>
        <div className="px-5 pt-1">
          <div className="flex items-end gap-2">
            <span className="text-[34px] leading-none font-extrabold text-brand tabular">{s.walkSpeed.toFixed(2)}</span>
            <span className="pb-0.5 text-[15px] font-bold">m/s</span>
            <span className="mb-0.5 ml-1 rounded-md bg-brand-light px-2 py-0.5 text-[13px] font-bold text-brand">{t(PACE_LABEL[paceKey(s.walkSpeed)])}</span>
            <span className="mb-1 ml-auto text-[12px] text-ink-2">{s.measured ? t('pace.measured') : t('pace.default')}</span>
          </div>
          <div className="mt-3">
            <Segmented value={paceKey(s.walkSpeed)} options={PACE_PRESETS.map((p) => ({ value: p.key, label: `${t(PACE_LABEL[p.key])} ${p.speed}` }))} onChange={(k) => s.patch({ walkSpeed: PACE_PRESETS.find((p) => p.key === k)!.speed, measured: false })} />
          </div>
          <button type="button" onClick={() => setMeasure(true)} className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-brand text-[15px] font-bold text-brand active:bg-brand-light">
            <Gauge size={18} /> {t('pace.measure')}
          </button>
        </div>
      </Section>

      {/* 선호 이동 성향 */}
      <Section title={t('my.prefs')}>
        <div className="pt-2">
          <PriorityEditor value={s.priorities} onChange={(v) => s.patch({ priorities: v })} />
        </div>
      </Section>

      {/* 자주 가는 장소 · 기본 출발지 · 기본 귀가지 */}
      <Section title={t('my.places')}>
        {s.places.length === 0 && <p className="px-5 py-2 text-[13px] text-ink-2">{t('my.placesNone')}</p>}
        {s.places.map((p) => {
          const isOrigin = s.defaultOriginId === p.id
          const isHome = s.defaultHomeId === p.id || (!s.defaultHomeId && p.kind === 'home' && s.places.find((x) => x.kind === 'home')?.id === p.id)
          return (
            <div key={p.id} className="px-5 py-2.5">
              <div className="flex items-center gap-3">
                <Footprints size={17} className="text-ink-2" />
                <span className="text-[15px] font-semibold">{placeLabel(p, t)}</span>
                <span className="truncate text-[13px] text-ink-2">
                  {STATIONS[p.station] ? stationName(p.station) : '-'} · {p.distanceM}m{p.example ? ` · ${t('data.demo')}` : ''}
                </span>
                <button type="button" aria-label={t('common.delete')} onClick={() => s.patch({ places: s.places.filter((x) => x.id !== p.id), defaultOriginId: isOrigin ? '' : s.defaultOriginId, defaultHomeId: s.defaultHomeId === p.id ? '' : s.defaultHomeId })} className="ml-auto text-[#A3AAB8]">
                  <X size={17} />
                </button>
              </div>
              <div className="mt-1.5 flex gap-1.5 pl-[29px]">
                <button type="button" aria-pressed={isOrigin} onClick={() => s.patch({ defaultOriginId: isOrigin ? '' : p.id })} className={`h-7 rounded-full px-2.5 text-[12px] font-semibold ${isOrigin ? 'bg-brand text-white' : 'bg-sub text-ink-2'}`}>
                  {t('my.defaultOrigin')}
                </button>
                <button type="button" aria-pressed={isHome} onClick={() => s.patch({ defaultHomeId: s.defaultHomeId === p.id ? '' : p.id })} className={`h-7 rounded-full px-2.5 text-[12px] font-semibold ${isHome ? 'bg-brand text-white' : 'bg-sub text-ink-2'}`}>
                  {t('my.defaultHome')}
                </button>
              </div>
            </div>
          )
        })}
        <div className="flex gap-2 px-5 pt-1">
          <button type="button" onClick={() => setAddPlace(true)} className="flex h-10 items-center gap-1 rounded-xl border border-dashed border-[#C5CBD6] px-3 text-[14px] font-semibold text-ink-2">
            <Plus size={15} /> {t('dep.addPlace')}
          </button>
          <button type="button" onClick={() => s.setTab('depart')} className="flex h-10 items-center gap-1 px-2 text-[14px] font-semibold text-brand">
            {t('my.openDeparture')} <ChevronRight size={15} />
          </button>
        </div>
      </Section>

      {/* 즐겨찾는 경로 */}
      <Section title={t('my.favRoutes')}>
        {s.favoriteRoutes.length === 0 && <p className="px-5 py-2 text-[13px] text-ink-2">{t('my.favRoutesNone')}</p>}
        {s.favoriteRoutes.map((r) => (
          <div key={`${r.from}-${r.to}`} className="flex items-center">
            <button type="button" onClick={() => s.search(r.from, r.to) && s.setTab('route')} className="flex min-h-[48px] min-w-0 flex-1 items-center gap-2 pl-5 text-left active:bg-sub">
              <Star size={16} className="shrink-0 fill-warn text-warn" />
              <span className="truncate text-[15px] font-semibold">
                {stationName(r.from)} → {stationName(r.to)}
              </span>
            </button>
            <button type="button" aria-label={t('common.delete')} onClick={() => s.patch({ favoriteRoutes: s.favoriteRoutes.filter((x) => !(x.from === r.from && x.to === r.to)) })} className="flex h-12 w-12 items-center justify-center text-[#A3AAB8]">
              <X size={17} />
            </button>
          </div>
        ))}
      </Section>

      {/* 즐겨찾는 역 */}
      <Section title={t('fav.stations')}>
        <div className="flex items-center justify-end px-5">
          <button type="button" onClick={() => setAddFav(true)} className="-mt-8 flex h-9 items-center gap-1 text-[14px] font-semibold text-brand">
            <Plus size={16} /> {t('common.add')}
          </button>
        </div>
        {s.favorites
          .filter((f) => STATIONS[f])
          .map((id) => (
            <div key={id} className="flex items-center">
              <button
                type="button"
                onClick={() => {
                  if (s.search(s.from && s.from !== id ? s.from : '광화문', id)) s.setTab('route')
                }}
                className="flex min-h-[52px] min-w-0 flex-1 items-center gap-3 pl-5 text-left active:bg-sub"
              >
                <Star size={16} className="shrink-0 fill-warn text-warn" />
                <span className="truncate text-[15px] font-semibold">{stationName(id)}</span>
                <span className="flex shrink-0 gap-1">
                  {STATION_LINES[id].map((l) => (
                    <LineBadge key={l} line={l} size={17} />
                  ))}
                </span>
              </button>
              <button type="button" aria-label={t('common.delete')} onClick={() => s.patch({ favorites: s.favorites.filter((f) => f !== id) })} className="flex h-[52px] w-12 items-center justify-center text-[#A3AAB8]">
                <X size={17} />
              </button>
            </div>
          ))}
      </Section>

      {/* 알림 */}
      <Section title={t('nt.title')}>
        <p className="px-5 pb-1 text-[12px] font-semibold text-ink-2">{t('nt.methods')}</p>
        <Row icon={<Smartphone size={19} />} label={t('nt.phone')} sub={permText} right={<Toggle label={t('nt.phone')} on={n.phone && perm === 'granted'} onChange={(v) => void enablePhone(v, 'phone')} />} />
        <Row icon={<Volume2 size={19} />} label={t('nt.sound')} right={<Toggle label={t('nt.sound')} on={n.sound} onChange={(v) => s.patchNotify({ sound: v })} />} />
        {n.sound && (
          <div className="space-y-3 px-5 pb-2 pl-[52px]">
            <Segmented
              size="sm"
              value={n.soundType}
              onChange={(v) => {
                s.patchNotify({ soundType: v })
                playSound(v, n.volume)
              }}
              options={[
                { value: 'chime', label: t('nt.snd.chime') },
                { value: 'ding', label: t('nt.snd.ding') },
                { value: 'bell', label: t('nt.snd.bell') },
              ]}
            />
            <div className="flex items-center gap-3">
              <span className="w-10 text-[13px] text-ink-2">{t('nt.volume')}</span>
              <input type="range" min={0} max={1} step={0.05} value={n.volume} onChange={(e) => s.patchNotify({ volume: Number(e.target.value) })} onPointerUp={() => playSound(n.soundType, n.volume)} className="flex-1 accent-[#293896]" aria-label={t('nt.volume')} />
              <span className="w-9 text-right text-[13px] font-semibold tabular">{Math.round(n.volume * 100)}</span>
            </div>
          </div>
        )}
        <Row icon={<Vibrate size={19} />} label={t('nt.vibrate')} sub={canVibrate() ? undefined : t('nt.vibrateNo')} right={<Toggle label={t('nt.vibrate')} on={n.vibrate} onChange={(v) => s.patchNotify({ vibrate: v })} />} />
        <Row icon={<Headphones size={19} />} label={t('nt.earphone')} sub={t('nt.earphoneSub')} right={<Toggle label={t('nt.earphone')} on={n.earphoneVoice} onChange={(v) => s.patchNotify({ earphoneVoice: v })} />} />
        <Row icon={<Watch size={19} />} label={t('nt.watch')} sub={t('nt.watchSub')} right={<Toggle label={t('nt.watch')} on={n.watch && perm === 'granted'} onChange={(v) => void enablePhone(v, 'watch')} />} />

        <p className="px-5 pt-3 pb-1 text-[12px] font-semibold text-ink-2">{t('nt.kinds')}</p>
        {(
          [
            ['alightOn', 'nt.k.alight'],
            ['transferOn', 'nt.k.transfer'],
            ['directionOn', 'nt.k.direction'],
            ['passageOn', 'nt.k.passage'],
            ['arrivalOn', 'nt.k.arrival'],
          ] as const
        ).map(([k, label]) => (
          <Row key={k} icon={<Bell size={19} />} label={t(label)} right={<Toggle label={t(label)} on={n[k]} onChange={(v) => s.patchNotify({ [k]: v })} />} />
        ))}

        <div className="px-5 pt-3">
          <button type="button" onClick={() => s.openPage({ kind: 'alarms' })} className="flex h-12 w-full items-center gap-2 rounded-xl bg-brand-light px-4 text-left text-[14px] font-bold text-brand">
            <BellRing size={17} /> <span className="flex-1">{t('my.alarmDetail')}</span> <ChevronRight size={16} />
          </button>
        </div>
        <div className="px-5 pt-4">
          <button
            type="button"
            onClick={() => {
              const title = t('alert.alightTitle', { s: stationName('이대') })
              s.notify({ title, body: t('alert.alightBody'), tone: 'warn' }, { kind: 'alight', voice: title })
              if (n.voice && !canSpeak()) speak('', s.lang, n.volume)
            }}
            className="h-11 w-full rounded-xl bg-sub text-[14px] font-bold"
          >
            {t('nt.preview')}
          </button>
        </div>
        <details className="mx-5 mt-3 rounded-xl border border-line px-4 py-3 text-[12px] leading-relaxed text-ink-2">
          <summary className="cursor-pointer text-[13px] font-semibold text-ink">{t('nt.webVsApp')}</summary>
          <p className="mt-2 whitespace-pre-line">{t('nt.webVsAppBody')}</p>
        </details>
      </Section>

      {/* 음성 */}
      <Section title={t('voice.title')}>
        <Row icon={<Megaphone size={19} />} label={t('nt.voice')} sub={canSpeak() ? t('nt.voiceSub') : t('nt.voiceNo')} right={<Toggle label={t('nt.voice')} on={n.voice} onChange={(v) => s.patchNotify({ voice: v })} />} />
        <div className="flex items-center gap-3 px-5 py-2">
          <span className="w-16 shrink-0 text-[14px]">{t('voice.rate')}</span>
          <input type="range" min={0.7} max={1.4} step={0.1} value={s.voiceRate} onChange={(e) => s.patch({ voiceRate: Number(e.target.value) })} className="flex-1 accent-[#293896]" aria-label={t('voice.rate')} />
          <span className="w-10 text-right text-[13px] font-semibold tabular">{s.voiceRate.toFixed(1)}×</span>
        </div>
        <div className="px-5 pt-1">
          <button type="button" onClick={() => speak(t('alert.alightTitle', { s: stationName('이대') }) + '. ' + t('alert.alightBody'), s.lang, n.volume, s.voiceRate)} className="h-10 w-full rounded-xl bg-sub text-[14px] font-bold">
            {t('voice.test')}
          </button>
        </div>
      </Section>

      {/* 접근성 */}
      <Section title={t('acc.title')}>
        <Row icon={<Accessibility size={19} />} label={t('acc.wheelchair')} sub={t('acc.wheelchairSub')} right={<Toggle label={t('acc.wheelchair')} on={s.wheelchair} onChange={(v) => s.patch({ wheelchair: v })} />} />
        <Row icon={<Type size={19} />} label={t('acc.large')} sub={t('acc.largeSub')} right={<Toggle label={t('acc.large')} on={s.largeText} onChange={(v) => s.patch({ largeText: v })} />} />
      </Section>

      {/* 광고 및 개인정보 */}
      <Section title={t('privacy.title')}>
        <Row icon={<LocateFixed size={19} />} label={t('privacy.location')} sub={t('privacy.locationSub')} right={<Toggle label={t('privacy.location')} on={Boolean(s.locationConsent)} onChange={(v) => s.patch({ locationConsent: v })} />} />
        <Row icon={<History size={19} />} label={t('privacy.record')} sub={t('privacy.recordSub')} right={<Toggle label={t('privacy.record')} on={s.recordConsent} onChange={(v) => s.patch({ recordConsent: v })} />} />
        <Row icon={<Megaphone size={19} />} label={t('privacy.ads')} sub={s.premium ? t('privacy.adsPremium') : t('privacy.adsSub')} right={<Toggle label={t('privacy.ads')} on={s.adsEnabled && !s.premium} onChange={(v) => s.patch({ adsEnabled: v })} />} />
        <Row icon={<ShieldCheck size={19} />} label={t('privacy.personalized')} sub={t('privacy.personalizedSub')} right={<Toggle label={t('privacy.personalized')} on={s.adsPersonalized} onChange={(v) => s.patch({ adsPersonalized: v, consentAsked: true })} />} />
        <details className="mx-5 mt-1 rounded-xl border border-line px-4 py-3">
          <summary className="cursor-pointer text-[13px] font-semibold">{t('privacy.adStats')}</summary>
          <table className="mt-2 w-full text-[12px]">
            <thead>
              <tr className="text-ink-2">
                <th className="py-1 text-left font-medium">{t('privacy.slot')}</th>
                <th className="text-right font-medium">{t('privacy.imp')}</th>
                <th className="text-right font-medium">{t('privacy.clk')}</th>
              </tr>
            </thead>
            <tbody>
              {placements.map((p) => (
                <tr key={p.id}>
                  <td className="py-1">{t(p.key)}</td>
                  <td className="text-right tabular">{stats[p.id]?.impressions ?? 0}</td>
                  <td className="text-right tabular">{stats[p.id]?.clicks ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <button
            type="button"
            onClick={() => {
              resetAdStats()
              setStats(readAdStats())
            }}
            className="mt-2 text-[12px] font-semibold text-brand"
          >
            {t('privacy.resetStats')}
          </button>
        </details>
        <div className="mt-3 space-y-2 px-5">
          <button
            type="button"
            onClick={() => {
              if (window.confirm(t('rep.clearConfirm'))) void s.clearTrips()
            }}
            className="h-11 w-full rounded-xl border border-danger/40 text-[14px] font-bold text-danger"
          >
            {t('privacy.deleteTrips')}
          </button>
          <button
            type="button"
            onClick={() => {
              if (!window.confirm(t('privacy.resetConfirm'))) return
              try {
                Object.keys(localStorage)
                  .filter((k) => k.startsWith('totame:'))
                  .forEach((k) => localStorage.removeItem(k))
              } catch {
                /* noop */
              }
              window.location.href = '/'
            }}
            className="h-11 w-full rounded-xl bg-sub text-[14px] font-semibold text-ink-2"
          >
            {t('privacy.resetAll')}
          </button>
        </div>
      </Section>

      <p className="mt-6 px-5 text-[11px] leading-relaxed text-ink-2">{t('my.dataNote')}</p>

      {measure && <PaceMeasure onClose={() => setMeasure(false)} />}
      <AddPlace open={addPlace} onClose={() => setAddPlace(false)} onAdded={() => undefined} />
      <StationPicker
        open={addFav}
        title={t('fav.add')}
        onClose={() => setAddFav(false)}
        onPick={(id) => {
          if (!s.favorites.includes(id)) s.patch({ favorites: [...s.favorites, id] })
          setAddFav(false)
        }}
      />
    </div>
  )
}

// ───────────── 보행속도 측정 (실측 / 시뮬레이션) ─────────────

const DIST = { real: 10, sim: 20 }

function PaceMeasure({ onClose }: { onClose: () => void }) {
  const s = useStore()
  const [mode, setMode] = useState<'real' | 'sim'>('sim')
  const [phase, setPhase] = useState<'ready' | 'run' | 'done'>('ready')
  const [elapsed, setElapsed] = useState(0)
  const [walked, setWalked] = useState(0)
  const [result, setResult] = useState<number | null>(null)
  const t0 = useRef(0)
  const simSpeed = useRef(1.2)

  const finish = (e = (performance.now() - t0.current) / 1000) => {
    const d = DIST[mode]
    const v = Math.max(0.5, Math.min(2.2, d / Math.max(e, 0.5)))
    setResult(Math.round(v * 100) / 100)
    setWalked(d)
    setPhase('done')
  }

  useEffect(() => {
    if (phase !== 'run') return
    const id = setInterval(() => {
      const e = (performance.now() - t0.current) / 1000
      setElapsed(e)
      if (mode === 'sim') {
        const w = Math.min(DIST.sim, e * simSpeed.current * (1 + Math.sin(e * 5) * 0.04))
        setWalked(w)
        if (w >= DIST.sim) finish(e)
      }
    }, 50)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, mode])

  const start = () => {
    simSpeed.current = 1.05 + Math.random() * 0.35
    t0.current = performance.now()
    setElapsed(0)
    setWalked(0)
    setResult(null)
    setPhase('run')
  }

  const dist = DIST[mode]
  const before = transferSeconds(170, true, s.walkSpeed)
  const after = result ? transferSeconds(170, true, result) : null

  return (
    <div className="safe-top anim-fade-up absolute inset-0 z-50 flex flex-col bg-white">
      <ScreenHeader
        title={t('pace.measureTitle')}
        left={
          <button type="button" aria-label={t('common.back')} onClick={onClose} className="flex h-11 w-11 items-center justify-center">
            <ChevronLeft size={26} />
          </button>
        }
      />
      <div className="px-5">
        <Segmented
          value={mode}
          options={[
            { value: 'sim', label: t('pace.sim') },
            { value: 'real', label: t('pace.real') },
          ]}
          onChange={(m) => {
            setMode(m)
            setPhase('ready')
            setResult(null)
            setWalked(0)
            setElapsed(0)
          }}
        />
      </div>

      <div className="flex flex-1 flex-col items-center px-6 pt-8">
        <div className="relative h-[220px] w-[220px]">
          <svg viewBox="0 0 220 220" className="h-full w-full -rotate-90">
            <circle cx="110" cy="110" r="96" fill="none" stroke="#EAF0FC" strokeWidth="14" />
            <circle cx="110" cy="110" r="96" fill="none" stroke="#293896" strokeWidth="14" strokeLinecap="round" strokeDasharray={2 * Math.PI * 96} strokeDashoffset={2 * Math.PI * 96 * (1 - (mode === 'sim' ? walked / dist : phase === 'done' ? 1 : 0))} className="transition-[stroke-dashoffset] duration-100" />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            {phase === 'done' && result ? (
              <>
                <span className="text-[52px] leading-none font-extrabold text-brand tabular">{result.toFixed(2)}</span>
                <span className="mt-1 text-[16px] font-bold">m/s · {t(PACE_LABEL[paceKey(result)])}</span>
              </>
            ) : (
              <>
                <Footprints size={28} className={`text-brand ${phase === 'run' ? 'blink-soft' : ''}`} />
                <span className="mt-2 text-[40px] leading-none font-extrabold tabular">{t('unit.secDec', { n: elapsed.toFixed(1) })}</span>
                <span className="mt-1 text-[15px] text-ink-2 tabular">{mode === 'sim' ? `${walked.toFixed(1)} / ${dist}m` : `${dist}m`}</span>
              </>
            )}
          </div>
        </div>

        <p className="mt-6 text-center text-[16px] leading-relaxed font-semibold">
          {phase === 'ready' && (mode === 'sim' ? t('pace.simReady') : t('pace.realReady'))}
          {phase === 'run' && (mode === 'sim' ? t('pace.simRun') : t('pace.realRun'))}
          {phase === 'done' && after !== null && (
            <>
              {t('pace.effect')} {formatMMSS(before)} → <span className="text-brand">{formatMMSS(after)}</span>
            </>
          )}
        </p>
        <p className="mt-1 text-center text-[13px] text-ink-2">{t('pace.noRun')}</p>
      </div>

      <div className="space-y-2 px-4 pb-4">
        {phase === 'ready' && <PrimaryButton onClick={start}>{t('pace.start')}</PrimaryButton>}
        {phase === 'run' && mode === 'real' && <PrimaryButton onClick={() => finish()}>{t('pace.arrived')}</PrimaryButton>}
        {phase === 'run' && mode === 'sim' && (
          <PrimaryButton tone="light" onClick={() => setPhase('ready')}>
            {t('common.cancel')}
          </PrimaryButton>
        )}
        {phase === 'done' && result && (
          <>
            <PrimaryButton
              onClick={() => {
                s.patch({ walkSpeed: result, measured: true })
                s.notify({ title: t('pace.applied'), body: `${result.toFixed(2)} m/s`, tone: 'success' }, { silent: true })
                onClose()
              }}
            >
              {t('pace.apply')}
            </PrimaryButton>
            <PrimaryButton tone="light" onClick={start}>
              {t('pace.again')}
            </PrimaryButton>
          </>
        )}
      </div>
    </div>
  )
}
