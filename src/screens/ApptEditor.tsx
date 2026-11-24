// 오늘 일정 — 약속 등록/수정
import { useEffect, useState, type ReactNode } from 'react'
import { ChevronLeft, LocateFixed, MapPin, Star, TrainFront } from 'lucide-react'
import { StationPicker } from '../components/Overlays'
import { PrimaryButton, ScreenHeader, Toggle } from '../components/ui'
import { STATIONS } from '../data/network'
import { stationName, t, type MessageKey } from '../i18n'
import { OFFSET_CHOICES, REPEAT_CHOICES } from '../lib/alarms'
import { nearestStations, useGeo } from '../lib/geo'
import type { Criterion } from '../lib/routing'
import { todayStr, type Appointment, type Origin } from '../lib/schedule'
import { placeLabel, useStore } from '../state/store'
import { KIND_ICON } from './SmartDeparture'

const PRIORITY_CHOICES: { c: Criterion | 'none'; key: MessageKey }[] = [
  { c: 'none', key: 'crit.fast' },
  { c: 'transfer', key: 'crit.transfer' },
  { c: 'walk', key: 'crit.walk' },
  { c: 'elevator', key: 'crit.elevator' },
  { c: 'stairs', key: 'crit.stairs' },
]

function addMin(hhmm: string, d: number) {
  const [h, m] = hhmm.split(':').map(Number)
  const x = (((h * 60 + m + d) % 1440) + 1440) % 1440
  return `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`
}

export function newAppointment(s: { places: { id: string; kind: string }[]; defaultOriginId: string; defaultHomeId: string }): Appointment {
  const now = new Date()
  const base = new Date(now.getTime() + 3 * 3600_000)
  const time = `${String(base.getHours()).padStart(2, '0')}:${base.getMinutes() < 30 ? '00' : '30'}`
  const homePlace = s.places.find((p) => p.id === s.defaultHomeId) ?? s.places.find((p) => p.kind === 'home')
  const originPlace = s.places.find((p) => p.id === s.defaultOriginId)
  const iso = now.toISOString()
  return {
    id: `a-${Date.now()}`,
    title: '',
    placeName: '',
    destStation: '',
    walkMin: 5,
    date: todayStr(base.getHours() < 4 && now.getHours() >= 4 ? now : base),
    time,
    arriveBy: time,
    origin: originPlace ? { kind: 'place', placeId: originPlace.id } : { kind: 'current' },
    priorities: [],
    bufferMin: 10,
    alerts: { offsets: [], repeatMin: 0, repeatCount: 3 },
    endTime: addMin(time, 120),
    homeEnabled: Boolean(homePlace),
    home: homePlace ? { kind: 'place', placeId: homePlace.id } : { kind: 'station', station: '', distanceM: 300 },
    homeTarget: addMin(time, 180),
    lastTrainAlert: true,
    createdAt: iso,
    updatedAt: iso,
  }
}

export default function ApptEditor({ initial, onClose }: { initial: Appointment; onClose: () => void }) {
  const s = useStore()
  const [a, setA] = useState<Appointment>(initial)
  const [picker, setPicker] = useState<null | 'dest' | 'origin' | 'home'>(null)
  const [early, setEarly] = useState(() => {
    const [h1, m1] = initial.time.split(':').map(Number)
    const [h2, m2] = initial.arriveBy.split(':').map(Number)
    return Math.max(0, h1 * 60 + m1 - (h2 * 60 + m2))
  })
  const [customRepeat, setCustomRepeat] = useState(!REPEAT_CHOICES.includes(initial.alerts.repeatMin))
  const { geo, locate } = useGeo()
  const up = (p: Partial<Appointment>) => setA((x) => ({ ...x, ...p }))
  const isNew = !s.appointments.some((x) => x.id === a.id)

  // 현재 위치 확인 → 마지막 위치 저장
  const useCurrent = () =>
    s.withLocation(() => {
      locate()
      up({ origin: { kind: 'current' } })
    })
  useEffect(() => {
    if (geo.status !== 'ok' || !geo.real) return
    const n = nearestStations(geo.lat, geo.lon, 1)[0]
    s.patch({ lastKnown: { station: n.st.id, distanceM: Math.round(n.km * 1000), at: new Date().toISOString() } })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geo.status, geo.real, geo.lat, geo.lon])

  const originChip = (o: Origin, label: ReactNode, key: string) => {
    const on = JSON.stringify(a.origin) === JSON.stringify(o) || (o.kind === 'current' && a.origin.kind === 'current')
    return (
      <button key={key} type="button" onClick={() => (o.kind === 'current' ? useCurrent() : up({ origin: o }))} className={`flex h-10 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[14px] font-semibold ${on ? 'bg-brand text-white' : 'border border-line'}`}>
        {label}
      </button>
    )
  }
  const homeChip = (o: Origin, label: ReactNode, key: string) => {
    const on = JSON.stringify(a.home) === JSON.stringify(o)
    return (
      <button key={key} type="button" onClick={() => up({ home: o })} className={`flex h-10 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[14px] font-semibold ${on ? 'bg-brand text-white' : 'border border-line'}`}>
        {label}
      </button>
    )
  }

  const valid = Boolean(a.destStation && STATIONS[a.destStation] && a.time && a.date && (a.placeName.trim() || a.title.trim()))
  const save = () => {
    if (!valid) return
    s.saveAppt({ ...a, arriveBy: addMin(a.time, -early), updatedAt: new Date().toISOString() })
    onClose()
  }
  const offs = a.alerts.offsets
  const toggleOff = (n: number) => up({ alerts: { ...a.alerts, offsets: offs.includes(n) ? offs.filter((x) => x !== n) : [...offs, n].sort((x, y) => y - x) } })

  return (
    <div className="safe-top anim-fade-up absolute inset-0 z-40 flex flex-col bg-white">
      <ScreenHeader
        title={isNew ? t('today.add') : t('today.edit')}
        left={
          <button type="button" aria-label={t('common.back')} onClick={onClose} className="flex h-11 w-11 items-center justify-center">
            <ChevronLeft size={26} />
          </button>
        }
      />
      <div className="no-scrollbar flex-1 space-y-5 overflow-y-auto px-5 pb-6">
        <Field label={t('today.f.title')}>
          <input value={a.title} onChange={(e) => up({ title: e.target.value })} placeholder={t('today.f.titlePh')} className="h-12 w-full rounded-xl bg-sub px-4 text-[16px] outline-none" />
        </Field>
        <Field label={t('today.f.place')} required>
          <input value={a.placeName} onChange={(e) => up({ placeName: e.target.value })} placeholder={t('today.f.placePh')} className="h-12 w-full rounded-xl bg-sub px-4 text-[16px] outline-none" />
          <button type="button" onClick={() => setPicker('dest')} className="mt-2 flex h-12 w-full items-center justify-between rounded-xl bg-sub px-4 text-left text-[15px]">
            <span className="flex items-center gap-1.5 text-ink-2">
              <TrainFront size={16} /> {t('today.f.station')}
            </span>
            <span className={a.destStation ? 'font-bold' : 'text-[#A3AAB8]'}>{a.destStation ? stationName(a.destStation) : t('common.select')}</span>
          </button>
          <Slider label={t('today.f.walk')} value={a.walkMin} min={0} max={25} unit={t('unit.minShort')} onChange={(v) => up({ walkMin: v })} />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label={t('today.f.date')} required>
            <input type="date" value={a.date} onChange={(e) => up({ date: e.target.value })} className="h-12 w-full rounded-xl bg-sub px-3 text-[15px] outline-none" />
          </Field>
          <Field label={t('today.f.time')} required>
            <input
              type="time"
              value={a.time}
              onChange={(e) => {
                const v = e.target.value
                if (!v) return
                // 약속 시간을 바꾸면 종료·귀가 시각도 같은 만큼 이동
                const [h1, m1] = a.time.split(':').map(Number)
                const [h2, m2] = v.split(':').map(Number)
                const d = h2 * 60 + m2 - (h1 * 60 + m1)
                up({ time: v, endTime: addMin(a.endTime, d), homeTarget: addMin(a.homeTarget, d) })
              }} className="h-12 w-full rounded-xl bg-sub px-3 text-[15px] outline-none" />
          </Field>
        </div>
        <Field label={t('today.f.arriveBy')}>
          <div className="flex flex-wrap gap-1.5">
            {[0, 5, 10, 15, 30].map((n) => (
              <button key={n} type="button" onClick={() => setEarly(n)} className={`h-9 rounded-full px-3 text-[13px] font-semibold ${early === n ? 'bg-ink text-white' : 'bg-sub text-ink-2'}`}>
                {n === 0 ? t('today.f.onTime') : t('today.f.early', { n })}
              </button>
            ))}
          </div>
          <p className="mt-1 text-[12px] text-ink-2">{t('today.f.arriveAt', { t: addMin(a.time, -early) })}</p>
        </Field>

        <Field label={t('today.f.origin')}>
          <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5">
            {originChip({ kind: 'current' }, <><LocateFixed size={15} /> {t('dep.current')}</>, 'cur')}
            {s.places.map((p) => {
              const Icon = KIND_ICON[p.kind]
              return originChip({ kind: 'place', placeId: p.id }, <><Icon size={15} /> {placeLabel(p, t)}</>, p.id)
            })}
            {s.favorites.slice(0, 4).map((f) => originChip({ kind: 'station', station: f, distanceM: 0 }, <><Star size={14} /> {stationName(f)}</>, `fav-${f}`))}
            <button type="button" onClick={() => setPicker('origin')} className={`flex h-10 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[14px] font-semibold ${a.origin.kind === 'station' && !s.favorites.slice(0, 4).includes(a.origin.station) ? 'bg-brand text-white' : 'border border-dashed border-[#C5CBD6] text-ink-2'}`}>
              <MapPin size={15} /> {a.origin.kind === 'station' && !s.favorites.slice(0, 4).includes(a.origin.station) ? stationName(a.origin.station) : t('today.f.direct')}
            </button>
          </div>
          {a.origin.kind === 'current' && (
            <p className="mt-1.5 text-[12px] text-ink-2">
              {geo.status === 'locating' ? t('geo.locating') : s.lastKnown ? t('today.f.lastKnown', { s: stationName(s.lastKnown.station), m: s.lastKnown.distanceM }) : geo.status === 'denied' || geo.status === 'unavailable' ? t('geo.denied') : t('today.f.needLoc')}
            </p>
          )}
          {a.origin.kind === 'station' && <Slider label={t('place.distance')} value={a.origin.distanceM} min={0} max={2000} step={50} unit="m" onChange={(v) => up({ origin: { ...(a.origin as { kind: 'station'; station: string; distanceM: number }), distanceM: v } })} />}
        </Field>

        <Field label={t('today.f.pref')}>
          <div className="flex flex-wrap gap-1.5">
            {PRIORITY_CHOICES.map(({ c, key }) => {
              const on = c === 'none' ? a.priorities.length === 0 : a.priorities[0] === c
              return (
                <button key={c} type="button" onClick={() => up({ priorities: c === 'none' ? [] : [c] })} className={`h-9 rounded-full px-3 text-[13px] font-semibold ${on ? 'bg-ink text-white' : 'bg-sub text-ink-2'}`}>
                  {t(key)}
                </button>
              )
            })}
          </div>
        </Field>
        <Field label={t('today.f.buffer')}>
          <div className="flex gap-1.5">
            {[0, 5, 10, 15, 20].map((n) => (
              <button key={n} type="button" onClick={() => up({ bufferMin: n })} className={`h-9 flex-1 rounded-lg text-[13px] font-bold ${a.bufferMin === n ? 'bg-ink text-white' : 'bg-sub text-ink-2'}`}>
                {t('unit.min', { n })}
              </button>
            ))}
          </div>
        </Field>

        <Field label={t('today.f.alerts')} hint={offs.length ? undefined : t('today.f.alertsDefault', { v: s.alarm.appt.offsets.map((n) => (n ? t('unit.min', { n }) : t('al.atTime'))).join(' · ') })}>
          <div className="flex flex-wrap gap-1.5">
            {OFFSET_CHOICES.appt.map((n) => (
              <button key={n} type="button" onClick={() => toggleOff(n)} className={`h-9 rounded-full px-3 text-[13px] font-semibold ${offs.includes(n) ? 'bg-brand text-white' : 'bg-sub text-ink-2'}`}>
                {n === 0 ? t('al.atTime') : t('al.before', { n })}
              </button>
            ))}
          </div>
          <p className="mt-3 text-[13px] font-semibold">{t('al.repeat')}</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {REPEAT_CHOICES.map((n) => (
              <button key={n} type="button" onClick={() => (setCustomRepeat(false), up({ alerts: { ...a.alerts, repeatMin: n } }))} className={`h-9 rounded-full px-3 text-[13px] font-semibold ${!customRepeat && a.alerts.repeatMin === n ? 'bg-ink text-white' : 'bg-sub text-ink-2'}`}>
                {n === 0 ? (offs.length ? t('al.noRepeat') : t('al.useDefault')) : t('al.every', { n })}
              </button>
            ))}
            <button type="button" onClick={() => (setCustomRepeat(true), up({ alerts: { ...a.alerts, repeatMin: Math.max(1, a.alerts.repeatMin || 7) } }))} className={`h-9 rounded-full px-3 text-[13px] font-semibold ${customRepeat ? 'bg-ink text-white' : 'bg-sub text-ink-2'}`}>
              {t('al.custom')}
            </button>
          </div>
          {customRepeat && <Slider label={t('al.interval')} value={a.alerts.repeatMin} min={1} max={30} unit={t('unit.minShort')} onChange={(v) => up({ alerts: { ...a.alerts, repeatMin: v } })} />}
          {a.alerts.repeatMin > 0 && <Slider label={t('al.count')} value={a.alerts.repeatCount} min={1} max={10} unit={t('al.times')} onChange={(v) => up({ alerts: { ...a.alerts, repeatCount: v } })} />}
          <p className="mt-1 text-[12px] text-ink-2">{t('al.stopRule')}</p>
        </Field>

        {/* 귀가 */}
        <div className="rounded-2xl border border-line px-4 py-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[15px] font-bold">{t('today.f.home')}</p>
              <p className="text-[12px] text-ink-2">{t('today.f.homeDesc')}</p>
            </div>
            <Toggle on={a.homeEnabled} onChange={(v) => up({ homeEnabled: v })} label={t('today.f.home')} />
          </div>
          {a.homeEnabled && (
            <div className="mt-3 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label={t('today.f.end')}>
                  <input type="time" value={a.endTime} onChange={(e) => up({ endTime: e.target.value })} className="h-11 w-full rounded-xl bg-sub px-3 text-[15px] outline-none" />
                </Field>
                <Field label={t('today.f.homeTarget')}>
                  <input type="time" value={a.homeTarget} onChange={(e) => up({ homeTarget: e.target.value })} className="h-11 w-full rounded-xl bg-sub px-3 text-[15px] outline-none" />
                </Field>
              </div>
              <Field label={t('today.f.homeDest')}>
                <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
                  {s.places.map((p) => {
                    const Icon = KIND_ICON[p.kind]
                    return homeChip({ kind: 'place', placeId: p.id }, <><Icon size={15} /> {placeLabel(p, t)}</>, p.id)
                  })}
                  <button type="button" onClick={() => setPicker('home')} className={`flex h-10 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[14px] font-semibold ${a.home.kind === 'station' ? 'bg-brand text-white' : 'border border-dashed border-[#C5CBD6] text-ink-2'}`}>
                    <MapPin size={15} /> {a.home.kind === 'station' ? stationName(a.home.station) : t('today.f.direct')}
                  </button>
                </div>
                {!s.places.some((p) => p.kind === 'home') && <p className="mt-1 text-[12px] text-ink-2">{t('today.f.noHome')}</p>}
                {a.home.kind === 'station' && <Slider label={t('place.distance')} value={a.home.distanceM} min={0} max={2000} step={50} unit="m" onChange={(v) => up({ home: { ...(a.home as { kind: 'station'; station: string; distanceM: number }), distanceM: v } })} />}
              </Field>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[14px] font-semibold">{t('today.f.lastTrain')}</p>
                  <p className="text-[12px] text-ink-2">{t('today.f.lastTrainDesc')}</p>
                </div>
                <Toggle on={a.lastTrainAlert} onChange={(v) => up({ lastTrainAlert: v })} label={t('today.f.lastTrain')} />
              </div>
            </div>
          )}
        </div>
        <p className="text-[12px] leading-relaxed text-ink-2">{t('today.privacy')}</p>
      </div>
      <div className="shrink-0 border-t border-line px-4 pt-2.5 pb-2.5">
        <PrimaryButton disabled={!valid} onClick={save}>
          {t('common.save')}
        </PrimaryButton>
        {!valid && <p className="mt-1 text-center text-[12px] text-ink-2">{t('today.f.required')}</p>}
      </div>
      <StationPicker
        open={picker !== null}
        title={picker === 'dest' ? t('today.f.station') : picker === 'home' ? t('today.f.homeDest') : t('today.f.origin')}
        onClose={() => setPicker(null)}
        onPick={(id) => {
          if (picker === 'dest') up({ destStation: id, placeName: a.placeName || stationName(id) })
          else if (picker === 'origin') up({ origin: { kind: 'station', station: id, distanceM: 0 } })
          else if (picker === 'home') up({ home: { kind: 'station', station: id, distanceM: 300 } })
          setPicker(null)
        }}
      />
    </div>
  )
}

function Field({ label, children, required, hint }: { label: string; children: ReactNode; required?: boolean; hint?: string }) {
  return (
    <div>
      <p className="mb-1.5 text-[13px] font-bold">
        {label}
        {required && <span className="ml-0.5 text-danger">*</span>}
      </p>
      {children}
      {hint && <p className="mt-1 text-[12px] text-ink-2">{hint}</p>}
    </div>
  )
}

function Slider({ label, value, min, max, step = 1, unit, onChange }: { label: string; value: number; min: number; max: number; step?: number; unit: string; onChange: (v: number) => void }) {
  return (
    <div className="mt-2">
      <div className="flex justify-between text-[13px]">
        <span className="text-ink-2">{label}</span>
        <span className="font-bold tabular">
          {value}
          {unit}
        </span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label={label} className="mt-1 w-full accent-[#293896]" />
    </div>
  )
}
