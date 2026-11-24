import { useMemo } from 'react'
import { t } from '../i18n'
import { phaseOf, planAppointment, planReturn, type Appointment } from '../lib/schedule'
import { placeLabel, useStore, type Store } from './store'
import { useNow } from './useNow'

/** 일정별 계산 결과 (권장 출발 · 귀가 출발 · 막차 · 상태) */
export function computePlans(s: Pick<Store, 'appointments' | 'resolveOrigin' | 'walkSpeed' | 'priorities' | 'wheelchair' | 'disruptions' | 'places'>, now: Date) {
  const settings = { walkSpeed: s.walkSpeed, priorities: s.priorities, wheelchair: s.wheelchair }
  return s.appointments.map((a: Appointment) => {
    const origin = s.resolveOrigin(a.origin)
    const home = a.homeEnabled ? s.resolveOrigin(a.home) : null
    const go = planAppointment(a, origin, settings, s.disruptions)
    const back = planReturn(a, home, settings, s.disruptions)
    const hp = a.home.kind === 'place' ? s.places.find((p) => p.id === (a.home as { placeId: string }).placeId) : undefined
    const homeLabel = hp ? placeLabel(hp, t) : t('place.home')
    return { a, origin, home, go, back, homeLabel, phase: phaseOf(a, go?.leaveAt ?? null, now) }
  })
}
export type ApptPlan = ReturnType<typeof computePlans>[number]

export function useApptPlans(tickMs = 30000) {
  const s = useStore()
  const now = useNow(tickMs)
  const minute = Math.floor(now.getTime() / 60000)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const plans = useMemo(() => computePlans(s, now), [s.appointments, s.resolveOrigin, s.walkSpeed, s.priorities, s.wheelchair, s.disruptions, s.places, s.lang, minute])
  return { plans, now }
}
