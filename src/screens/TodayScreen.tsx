// 오늘 일정 (하단 탭) — 약속 시간에서 거꾸로 계산한 출발 시간 · 귀가 · 막차 · 통합 타임라인
import { useMemo, useState } from 'react'
import { Bell, BellOff, CalendarClock, CalendarPlus, ChevronDown, ChevronUp, CircleCheck, Footprints, House, MapPin, MoonStar, Navigation, Pencil, Trash2, TriangleExclamationPoint, X } from 'lucide-react'
import { DataTag, LineBadge, PrimaryButton, ScreenHeader } from '../components/ui'
import { stationName, t, type MessageKey } from '../i18n'
import { formatClock, remainingMinutes, type Route } from '../lib/routing'
import { EXIT_MIN, at, todayStr, type ApptPhase } from '../lib/schedule'
import { useApptPlans, type ApptPlan } from '../state/plans'
import { useStore } from '../state/store'
import ApptEditor, { newAppointment } from './ApptEditor'

const PHASE_KEY: Record<ApptPhase, MessageKey> = {
  scheduled: 'today.ph.scheduled',
  prepare: 'today.ph.prepare',
  moving: 'today.ph.moving',
  returning: 'today.ph.moving',
  returnPending: 'today.ph.returnPending',
  done: 'today.ph.done',
  canceled: 'today.ph.canceled',
}
const PHASE_TONE: Record<ApptPhase, string> = {
  scheduled: 'bg-sub text-ink-2',
  prepare: 'bg-[#FDF6DC] text-[#8A6A00]',
  moving: 'bg-brand text-white',
  returning: 'bg-brand text-white',
  returnPending: 'bg-brand-light text-brand',
  done: 'bg-[#E7F5EC] text-ok',
  canceled: 'bg-sub text-[#A3AAB8]',
}
/** 상태 그룹 표시 순서: 출발 준비 → 이동 중 → 예정 → 귀가 예정 → 완료 */
const GROUPS: { key: MessageKey; phases: ApptPhase[] }[] = [
  { key: 'today.ph.prepare', phases: ['prepare'] },
  { key: 'today.ph.moving', phases: ['moving', 'returning'] },
  { key: 'today.ph.scheduled', phases: ['scheduled'] },
  { key: 'today.ph.returnPending', phases: ['returnPending'] },
  { key: 'today.ph.done', phases: ['done', 'canceled'] },
]

const hm = (min: number) => {
  const m = Math.max(0, Math.round(min))
  return m >= 60 ? t('time.hm', { h: Math.floor(m / 60), m: m % 60 }) : t('time.m', { m })
}
const dateLabel = (d: string) => {
  const today = todayStr()
  const tm = todayStr(new Date(Date.now() + 86400_000))
  if (d === today) return t('today.today')
  if (d === tm) return t('today.tomorrow')
  const [, m, dd] = d.split('-').map(Number)
  return t('today.dateMD', { m, d: dd })
}

export default function TodayScreen() {
  const s = useStore()
  const { plans, now } = useApptPlans(15000)
  const [editing, setEditing] = useState<ReturnType<typeof newAppointment> | null>(null)
  const today = todayStr(now)
  // 오늘 + 앞으로의 날짜 (지난 날짜 중 미완료 일정은 오늘 목록에 포함)
  const dates = useMemo(() => [...new Set([today, ...plans.map((p) => p.a.date).filter((d) => d >= today)])].sort(), [plans, today])
  const [date, setDate] = useState(today)
  const list = plans.filter((p) => p.a.date === date || (date === today && p.a.date < today && !['done', 'canceled'].includes(p.phase))).sort((x, y) => at(x.a.date, x.a.time).getTime() - at(y.a.date, y.a.time).getTime())

  return (
    <div className="safe-top absolute inset-0 flex flex-col bg-white">
      <ScreenHeader
        title={t('tab.today')}
        right={
          <button type="button" aria-label={t('today.add')} onClick={() => setEditing(newAppointment(s))} className="flex h-11 w-11 items-center justify-center rounded-full text-brand active:bg-sub">
            <CalendarPlus size={22} />
          </button>
        }
      />
      <div className="no-scrollbar flex gap-1.5 overflow-x-auto px-4 pb-2">
        {dates.map((d) => {
          const n = plans.filter((p) => p.a.date === d && !p.a.canceled).length
          return (
            <button key={d} type="button" onClick={() => setDate(d)} className={`flex h-9 shrink-0 items-center gap-1 rounded-full px-3.5 text-[13px] font-semibold ${date === d ? 'bg-ink text-white' : 'bg-sub text-ink-2'}`}>
              {dateLabel(d)}
              {n > 0 && <span className={`text-[11px] ${date === d ? 'text-white/70' : ''}`}>{n}</span>}
            </button>
          )
        })}
      </div>
      <div className="no-scrollbar flex-1 overflow-y-auto pb-8">
        {list.length === 0 ? (
          <Empty onAdd={() => setEditing(newAppointment(s))} date={date} />
        ) : (
          GROUPS.map((g) => {
            const items = list.filter((p) => g.phases.includes(p.phase))
            if (!items.length) return null
            return (
              <section key={g.key} className="mt-2">
                <h2 className="flex items-center gap-1.5 px-5 pt-2 pb-1.5 text-[13px] font-bold text-ink-2">
                  {t(g.key)} <span className="text-[12px] font-semibold">{items.length}</span>
                </h2>
                {items.map((p) => (
                  <ApptCard key={p.a.id} p={p} now={now} onEdit={() => setEditing(p.a)} />
                ))}
              </section>
            )
          })
        )}
        {list.length > 0 && (
          <div className="mx-4 mt-4">
            <PrimaryButton tone="light" onClick={() => setEditing(newAppointment(s))}>
              <CalendarPlus size={18} /> {t('today.add')}
            </PrimaryButton>
          </div>
        )}
      </div>
      {editing && <ApptEditor key={editing.id} initial={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

function Empty({ onAdd, date }: { onAdd: () => void; date: string }) {
  return (
    <div className="flex flex-col items-center px-8 pt-14 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-light text-brand">
        <CalendarClock size={30} />
      </span>
      <p className="mt-4 text-[18px] font-bold">{date === todayStr() ? t('today.emptyTitle') : t('today.emptyDay')}</p>
      <p className="mt-1 text-[14px] leading-relaxed text-ink-2">{t('today.emptyBody')}</p>
      <ul className="mt-4 space-y-1.5 text-left text-[13px] text-ink-2">
        <li>• {t('today.emptyP1')}</li>
        <li>• {t('today.emptyP2')}</li>
        <li>• {t('today.emptyP3')}</li>
      </ul>
      <div className="mt-6 w-full">
        <PrimaryButton onClick={onAdd}>
          <CalendarPlus size={19} /> {t('today.add')}
        </PrimaryButton>
      </div>
    </div>
  )
}

/** 일정 카드 메시지 — 지금 시각과 권장 출발 시각을 비교 */
function goMessage(p: ApptPlan, now: Date) {
  const { a, go } = p
  if (!go) return null
  const apptAt = at(a.date, a.time)
  const toLeave = (go.leaveAt.getTime() - now.getTime()) / 60000
  if (go.delayMin > 0 && toLeave > -30) return { text: t('al.apptDelay'), tone: 'text-danger' }
  if (toLeave > 60) return { text: t('al.apptPrepare', { t: hm((apptAt.getTime() - now.getTime()) / 60000) }), tone: 'text-ink' }
  if (toLeave > 15) return { text: t('al.apptIn', { n: Math.round(toLeave) }), tone: 'text-ink' }
  if (toLeave > 0) return { text: t('al.apptEarly'), tone: 'text-ok' }
  // 권장 출발 시각이 지남 → 지금 출발 시 예상 도착
  const eta = new Date(now.getTime() + (go.totalMin - go.bufferMin) * 60000)
  const late = Math.round((eta.getTime() - apptAt.getTime()) / 60000)
  if (late > 0) return { text: t('al.apptLate', { n: late }), tone: 'text-danger' }
  return { text: t('al.apptNow'), tone: 'text-[#B57714]' }
}

function homeMessage(p: ApptPlan, now: Date) {
  const b = p.back
  if (!b) return null
  const target = at(p.a.date, p.a.homeTarget)
  const toLeave = (b.leaveAt.getTime() - now.getTime()) / 60000
  if (b.lastLeaveAt && now > b.lastLeaveAt) return { text: t('al.lastHard'), tone: 'text-danger' }
  if (toLeave > 30) return { text: t('today.homePlan', { t: formatClock(b.leaveAt) }), tone: 'text-ink' }
  if (toLeave > 15) return { text: t('al.homeUp', { p: p.homeLabel, t: formatClock(target) }), tone: 'text-ink' }
  if (toLeave > 0) return { text: t('al.homeIn', { n: Math.round(toLeave) }), tone: 'text-[#B57714]' }
  const eta = new Date(now.getTime() + (b.totalMin - b.bufferMin) * 60000)
  if (eta > target) return { text: t('al.homeHard'), tone: 'text-danger' }
  return { text: b.lastTrainBinding ? t('al.lastSoon') : t('al.homeNow'), tone: 'text-[#B57714]' }
}

function ApptCard({ p, now, onEdit }: { p: ApptPlan; now: Date; onEdit: () => void }) {
  const s = useStore()
  const [open, setOpen] = useState(p.phase === 'prepare' || p.phase === 'moving')
  const { a, go, back, phase } = p
  const apptAt = at(a.date, a.time)
  const arriveBy = at(a.date, a.arriveBy || a.time)
  const j = s.journey && s.journey.apptId === a.id ? s.journey : null
  const jr = j ? s.journeyRoute : null
  // 이동 중: 남은 시간으로 도착 예정 재계산
  const liveEta = j && jr && !j.arrived ? new Date(now.getTime() + (remainingMinutes(jr, j.index) + (j.leg === 'home' ? 0 : a.walkMin + EXIT_MIN)) * 60000) : null
  const liveLate = liveEta && j?.leg !== 'home' ? Math.round((liveEta.getTime() - apptAt.getTime()) / 60000) : 0
  const msg = phase === 'returnPending' || phase === 'returning' ? homeMessage(p, now) : phase === 'scheduled' || phase === 'prepare' ? goMessage(p, now) : null

  const startLeg = (route: Route | null, leg: 'go' | 'home') => {
    if (!route) return
    s.startJourney(route, { apptId: a.id, leg })
    s.setMoveTab('track')
    s.setTab('move')
  }
  const toDepart = (route: Route | null) => {
    if (!route) return
    if (s.search(route.from, route.to, a.priorities.length ? a.priorities : s.priorities)) s.setTab('depart')
  }

  return (
    <article className={`mx-4 mb-3 rounded-2xl border ${phase === 'prepare' ? 'border-warn' : phase === 'moving' || phase === 'returning' ? 'border-brand' : 'border-line'} ${a.canceled ? 'opacity-60' : ''}`}>
      <div className="px-4 pt-3.5">
        <div className="flex items-center gap-2">
          <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-bold ${PHASE_TONE[phase]}`}>{t(PHASE_KEY[phase])}</span>
          <span className="text-[13px] font-semibold text-ink-2 tabular">
            {a.date !== todayStr(now) ? `${dateLabel(a.date)} ` : ''}
            {a.time}
          </span>
          {a.muted && <BellOff size={14} className="text-ink-2" />}
          <button type="button" aria-label={t('today.edit')} onClick={onEdit} className="ml-auto flex h-8 w-8 items-center justify-center rounded-full text-ink-2 active:bg-sub">
            <Pencil size={16} />
          </button>
        </div>
        <p className="mt-1 text-[17px] font-bold">{a.title || a.placeName}</p>
        <p className="flex items-center gap-1 text-[13px] text-ink-2">
          <MapPin size={13} /> {a.placeName || stationName(a.destStation)} · {stationName(a.destStation)} {t('today.walkFrom', { n: a.walkMin })}
        </p>
      </div>

      {/* 출발 계산 */}
      {phase !== 'canceled' && phase !== 'done' && phase !== 'returnPending' && phase !== 'returning' && (
        <div className="mx-4 mt-3 rounded-xl bg-sub px-4 py-3">
          {!go ? (
            <p className="text-[13px] leading-relaxed text-ink-2">{!p.origin ? (a.origin.kind === 'current' ? t('today.needLoc') : t('today.needOrigin')) : t('today.noRoute')}</p>
          ) : liveEta ? (
            <>
              <p className="text-[12px] font-semibold text-ink-2">{t('today.liveEta')}</p>
              <p className={`text-[30px] leading-none font-extrabold tabular ${liveLate > 0 ? 'text-danger' : 'text-brand'}`}>{formatClock(liveEta)}</p>
              <p className={`mt-1 text-[14px] font-bold ${liveLate > 0 ? 'text-danger' : 'text-ok'}`}>{liveLate > 0 ? t('today.lateWarn', { n: liveLate }) : t('today.onTime', { n: -liveLate })}</p>
            </>
          ) : (
            <>
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-[12px] font-semibold text-ink-2">{t('today.leaveAt')}</p>
                  <p className="text-[34px] leading-none font-extrabold text-brand tabular">{formatClock(go.leaveAt)}</p>
                </div>
                <div className="text-right text-[12px] text-ink-2">
                  <p className="tabular">{t('today.arriveEta', { t: formatClock(go.arriveAt) })}</p>
                  <p>{p.origin?.label ? `${p.origin.label} · ` : ''}{p.origin ? stationName(p.origin.station) : ''}</p>
                </div>
              </div>
              {msg && <p className={`mt-2 text-[14px] leading-snug font-bold ${msg.tone}`}>{msg.text}</p>}
            </>
          )}
        </div>
      )}

      {/* 귀가 */}
      {a.homeEnabled && phase !== 'canceled' && (
        <div className="mx-4 mt-2 rounded-xl border border-line px-4 py-3">
          <p className="flex items-center gap-1.5 text-[12px] font-semibold text-ink-2">
            <House size={14} /> {t('today.homeTitle', { p: p.homeLabel, t: a.homeTarget })}
          </p>
          {back ? (
            <>
              <p className="mt-1 text-[15px] font-bold tabular">
                {t('today.homeLeave', { t: formatClock(back.leaveAt) })} <span className="text-[12px] font-semibold text-ink-2">→ {formatClock(back.arriveAt)}</span>
              </p>
              {back.lastLeaveAt && (
                <p className={`mt-0.5 flex items-center gap-1 text-[12px] ${back.lastTrainBinding ? 'font-bold text-danger' : 'text-ink-2'}`}>
                  <MoonStar size={13} /> {t('today.lastLeave', { t: formatClock(back.lastLeaveAt) })} <DataTag kind="estimate" />
                </p>
              )}
              {back.lastTrainBinding && <p className="mt-0.5 text-[12px] font-semibold text-danger">{t('today.lastBinding')}</p>}
              {(phase === 'returnPending' || phase === 'returning') && msg && <p className={`mt-1.5 text-[14px] leading-snug font-bold ${msg.tone}`}>{msg.text}</p>}
            </>
          ) : (
            <p className="mt-1 text-[13px] text-ink-2">{t('today.homeMissing')}</p>
          )}
        </div>
      )}

      {/* 동작 */}
      {phase !== 'canceled' && phase !== 'done' && (
        <div className="mx-4 mt-3 flex gap-2">
          {(phase === 'scheduled' || phase === 'prepare') && (
            <>
              <button type="button" disabled={!go?.route} onClick={() => toDepart(go?.route ?? null)} className="flex h-11 flex-1 items-center justify-center gap-1 rounded-xl bg-brand-light text-[14px] font-bold text-brand disabled:opacity-40">
                <Footprints size={16} /> {t('dep.title')}
              </button>
              <button type="button" disabled={!go?.route} onClick={() => startLeg(go?.route ?? null, 'go')} className="flex h-11 flex-1 items-center justify-center gap-1 rounded-xl bg-brand text-[14px] font-bold text-white disabled:opacity-40">
                <Navigation size={16} /> {t('today.startGo')}
              </button>
            </>
          )}
          {phase === 'moving' && (
            <>
              <button type="button" onClick={() => s.setTab('move')} className="flex h-11 flex-1 items-center justify-center gap-1 rounded-xl bg-brand text-[14px] font-bold text-white">
                <Navigation size={16} /> {t('tab.move')}
              </button>
              <button type="button" onClick={() => s.patchAppt(a.id, { arrivedAt: new Date().toISOString() })} className="flex h-11 flex-1 items-center justify-center gap-1 rounded-xl bg-sub text-[14px] font-bold">
                <CircleCheck size={16} /> {t('today.arrived')}
              </button>
            </>
          )}
          {phase === 'returnPending' && (
            <>
              {!a.arrivedAt && (
                <button type="button" onClick={() => s.patchAppt(a.id, { arrivedAt: new Date().toISOString() })} className="flex h-11 flex-1 items-center justify-center gap-1 rounded-xl bg-sub text-[14px] font-bold">
                  <CircleCheck size={16} /> {t('today.arrived')}
                </button>
              )}
              {a.homeEnabled && (
                <button type="button" disabled={!back?.route} onClick={() => startLeg(back?.route ?? null, 'home')} className="flex h-11 flex-1 items-center justify-center gap-1 rounded-xl bg-brand text-[14px] font-bold text-white disabled:opacity-40">
                  <House size={16} /> {t('today.startHome')}
                </button>
              )}
            </>
          )}
          {phase === 'returning' && (
            <button type="button" onClick={() => s.patchAppt(a.id, { homeArrivedAt: new Date().toISOString() })} className="flex h-11 flex-1 items-center justify-center gap-1 rounded-xl bg-sub text-[14px] font-bold">
              <CircleCheck size={16} /> {t('today.homeArrived')}
            </button>
          )}
        </div>
      )}

      <button type="button" onClick={() => setOpen((o) => !o)} className="flex h-10 w-full items-center justify-center gap-1 text-[13px] font-semibold text-ink-2">
        {open ? t('today.less') : t('today.more')} {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
      </button>

      {open && (
        <div className="border-t border-line px-4 pt-3 pb-3">
          {go && (
            <>
              <p className="text-[13px] font-bold">{t('today.calc')}</p>
              <div className="mt-1.5 space-y-1 text-[13px]">
                <Line label={t('today.c.access')} v={go.accessMin} />
                <Line label={t('today.c.subway', { n: go.route ? go.route.transferCount : 0 })} v={go.subwayMin - go.delayMin} />
                {go.delayMin > 0 && <Line label={t('today.c.delay')} v={go.delayMin} danger />}
                <Line label={t('today.c.egress')} v={go.egressMin} />
                <Line label={t('today.c.buffer')} v={go.bufferMin} />
              </div>
              <p className="mt-2 rounded-lg bg-sub px-3 py-2 text-[13px] font-semibold tabular">
                {formatClock(arriveBy)} − {t('unit.min', { n: go.totalMin - go.bufferMin })} − {t('unit.min', { n: go.bufferMin })} = <span className="text-brand">{formatClock(go.leaveAt)}</span>
              </p>
              {go.route && (
                <div className="mt-2 flex flex-wrap items-center gap-1 text-[12px] text-ink-2">
                  {go.route.segments.map((g, i) => (
                    <LineBadge key={i} line={g.line} size={17} />
                  ))}
                  <span>
                    {stationName(go.route.from)} → {stationName(go.route.to)}
                  </span>
                  <DataTag kind="estimate" />
                </div>
              )}
            </>
          )}
          <p className="mt-4 text-[13px] font-bold">{t('today.timeline')}</p>
          <Timeline p={p} />
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => s.patchAppt(a.id, { muted: !a.muted })} className="flex h-10 flex-1 items-center justify-center gap-1 rounded-xl bg-sub text-[13px] font-bold">
              {a.muted ? <Bell size={15} /> : <BellOff size={15} />} {a.muted ? t('today.unmute') : t('today.mute')}
            </button>
            {!a.canceled ? (
              <button type="button" onClick={() => s.patchAppt(a.id, { canceled: true })} className="flex h-10 flex-1 items-center justify-center gap-1 rounded-xl bg-sub text-[13px] font-bold">
                <X size={15} /> {t('today.cancel')}
              </button>
            ) : (
              <button type="button" onClick={() => s.patchAppt(a.id, { canceled: false })} className="flex h-10 flex-1 items-center justify-center gap-1 rounded-xl bg-sub text-[13px] font-bold">
                {t('today.restore')}
              </button>
            )}
            <button type="button" aria-label={t('common.delete')} onClick={() => s.removeAppt(a.id)} className="flex h-10 w-12 items-center justify-center rounded-xl bg-sub text-danger">
              <Trash2 size={16} />
            </button>
          </div>
        </div>
      )}
    </article>
  )
}

function Line({ label, v, danger }: { label: string; v: number; danger?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className={danger ? 'font-semibold text-danger' : 'text-ink-2'}>{label}</span>
      <span className={`font-semibold tabular ${danger ? 'text-danger' : ''}`}>{t('unit.min', { n: Math.round(v) })}</span>
    </div>
  )
}

/** 출발 → 도착 → 약속 → 종료 → 귀가 사전 알림 → 귀가 출발 → 집 도착 */
function Timeline({ p }: { p: ApptPlan }) {
  const s = useStore()
  const { a, go, back } = p
  const rows: { t: Date | null; label: string; done?: boolean; icon?: 'warn' }[] = [
    { t: go?.leaveAt ?? null, label: t('today.tl.leave'), done: Boolean(a.departedAt) },
    { t: go?.arriveAt ?? null, label: t('today.tl.arrive'), done: Boolean(a.arrivedAt) },
    { t: at(a.date, a.time), label: t('today.tl.appt') },
    { t: at(a.date, a.endTime), label: t('today.tl.end') },
  ]
  if (a.homeEnabled && back) {
    const pre = s.alarm.home.offsets.length ? Math.max(...s.alarm.home.offsets) : 0
    if (pre > 0) rows.push({ t: new Date(back.leaveAt.getTime() - pre * 60000), label: t('today.tl.pre', { n: pre }) })
    rows.push({ t: back.leaveAt, label: back.lastTrainBinding ? t('today.tl.leaveHomeLast') : t('today.tl.leaveHome'), done: Boolean(a.homeDepartedAt), icon: back.lastTrainBinding ? 'warn' : undefined })
    rows.push({ t: back.arriveAt, label: t('today.tl.home', { p: p.homeLabel }), done: Boolean(a.homeArrivedAt) })
  }
  return (
    <ol className="mt-1.5">
      {rows.map((r, i) => (
        <li key={i} className="relative flex items-center gap-3 py-1.5 pl-5">
          <span className={`absolute left-0 h-2.5 w-2.5 rounded-full ${r.done ? 'bg-ok' : 'bg-[#C5CBD6]'}`} />
          {i < rows.length - 1 && <span className="absolute top-[18px] left-[4px] h-[calc(100%-6px)] w-[2px] bg-line" />}
          <span className="w-12 text-[13px] font-bold tabular">{r.t ? formatClock(r.t) : '—'}</span>
          <span className="flex items-center gap-1 text-[13px]">
            {r.icon === 'warn' && <TriangleExclamationPoint size={13} className="text-danger" />}
            {r.label}
          </span>
        </li>
      ))}
    </ol>
  )
}
