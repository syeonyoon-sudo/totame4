// MY > 알림 설정 — 기능별 다중·반복 알림, 권한 확인, 테스트, 예약 목록, 발송 기록
import { useEffect, useMemo, useState } from 'react'
import { BellRing, ChevronLeft, CircleCheck, CircleExclamationPoint, RotateCcw, Send, Timer } from 'lucide-react'
import { PrimaryButton, ScreenHeader, Toggle } from '../components/ui'
import { t, type MessageKey } from '../i18n'
import { ALARM_CATS, ALARM_ITEMS, DEFAULT_ALARMS, OFFSET_CHOICES, OFFSET_UNIT, REPEAT_CHOICES, buildEvents, clearLog, readLog, readTest, scheduleTest, upcoming, writeLog, type AlarmCat, type AlarmLog, type AlarmRule } from '../lib/alarms'
import { canNotify, canSpeak, canVibrate, notificationPermission, requestNotificationPermission } from '../lib/notify'
import { formatClock } from '../lib/routing'
import { useApptPlans } from '../state/plans'
import { useStore } from '../state/store'

const CAT_KEY = (c: AlarmCat) => `al.cat.${c}` as MessageKey
const ITEM_KEY = (c: AlarmCat, i: string) => `al.item.${c}.${i}` as MessageKey
const CH_KEY: Record<string, MessageKey> = { banner: 'al.ch.banner', sound: 'al.ch.sound', vibrate: 'al.ch.vibrate', voice: 'al.ch.voice', system: 'al.ch.system' }

function useLog() {
  const [log, setLog] = useState<AlarmLog[]>(readLog)
  useEffect(() => {
    const on = () => setLog(readLog())
    window.addEventListener('totame:alarmlog', on)
    const id = setInterval(on, 4000)
    return () => {
      window.removeEventListener('totame:alarmlog', on)
      clearInterval(id)
    }
  }, [])
  return [log, setLog] as const
}

export default function AlarmSettingsScreen({ onClose }: { onClose: () => void }) {
  const s = useStore()
  const { plans, now } = useApptPlans(10000)
  const [log, setLog] = useLog()
  const [perm, setPerm] = useState(notificationPermission())
  const [testState, setTestState] = useState<null | 'waiting'>(null)
  const rule = (c: AlarmCat) => s.alarm[c]
  const setRule = (c: AlarmCat, p: Partial<AlarmRule>) => s.patch({ alarm: { ...s.alarm, [c]: { ...s.alarm[c], ...p } } })

  const events = useMemo(() => {
    const w = s.boardingWatch
    const j = s.journey && s.journeyRoute ? s.journey : null
    const ev = buildEvents({
      appts: plans.map((p) => ({ a: p.a, go: p.go, back: p.back, homeLabel: p.homeLabel })),
      watch: w ? { station: w.station, line: w.line, toward: w.toward, distanceM: w.distanceM, trainAt: new Date(w.trainAt), leaveBy: new Date(w.leaveBy), mustCatch: w.mustCatch, setAt: new Date(w.setAt), walkSpeed: s.walkSpeed, delayMin: 0 } : null,
      journey: j ? { route: s.journeyRoute!, index: j.index, indexAt: j.indexAt ?? j.startedAt, startedAt: j.startedAt, arrived: j.arrived, alertOn: j.alertOn } : null,
      settings: s.alarm,
      now,
      test: readTest(),
    })
    return upcoming(ev, now, new Set(log.map((l) => l.key))).slice(0, 12)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plans, s.boardingWatch, s.journey, s.alarm, now, log])

  // 테스트 예약이 발송되면 상태 해제
  useEffect(() => {
    if (testState !== 'waiting') return
    const tst = readTest()
    if (tst && log.some((l) => l.key === `test@${tst.id}`)) setTestState(null)
  }, [log, testState])

  const testNow = () => {
    const key = `test-now@${Date.now()}`
    const channels = s.notify({ title: t('al.testTitle'), body: t('al.testBody'), tone: 'success' }, { kind: 'alarm', tag: key })
    const at = new Date().toISOString()
    writeLog([...readLog(), { key, cat: 'test', title: t('al.testTitle'), fireAt: at, at, status: 'sent', channels }])
    setLog(readLog())
  }
  const testLater = () => {
    scheduleTest(10)
    setTestState('waiting')
    window.dispatchEvent(new Event('totame:alarmtest'))
  }

  const support = [
    { ok: canNotify(), label: t('al.sup.notification'), state: perm === 'granted' ? t('al.perm.granted') : perm === 'denied' ? t('al.perm.denied') : perm === 'unsupported' ? t('al.perm.unsupported') : t('al.perm.default') },
    { ok: typeof navigator !== 'undefined' && 'serviceWorker' in navigator, label: t('al.sup.sw'), state: '' },
    { ok: false, label: t('al.sup.push'), state: t('al.sup.pushNote') },
    { ok: canVibrate(), label: t('al.sup.vibrate'), state: canVibrate() ? '' : t('al.sup.vibrateNo') },
    { ok: canSpeak(), label: t('al.sup.voice'), state: '' },
  ]

  return (
    <div className="safe-top anim-fade-up absolute inset-0 z-40 flex flex-col bg-white">
      <ScreenHeader
        title={t('al.title')}
        left={
          <button type="button" aria-label={t('common.back')} onClick={onClose} className="flex h-11 w-11 items-center justify-center">
            <ChevronLeft size={26} />
          </button>
        }
      />
      <div className="no-scrollbar flex-1 overflow-y-auto pb-10">
        {/* 권한 · 지원 환경 */}
        <section className="mx-4 rounded-2xl bg-sub px-4 py-3">
          <p className="text-[14px] font-bold">{t('al.envTitle')}</p>
          <ul className="mt-2 space-y-1.5">
            {support.map((x) => (
              <li key={x.label} className="flex items-start gap-2 text-[13px]">
                {x.ok ? <CircleCheck size={16} className="mt-px shrink-0 text-ok" /> : <CircleExclamationPoint size={16} className="mt-px shrink-0 text-[#B57714]" />}
                <span className="shrink-0 font-semibold whitespace-nowrap">{x.label}</span>
                {x.state && <span className="text-ink-2">· {x.state}</span>}
              </li>
            ))}
          </ul>
          {canNotify() && perm !== 'granted' && perm !== 'denied' && (
            <button
              type="button"
              onClick={async () => {
                const r = await requestNotificationPermission()
                setPerm(r)
                if (r === 'granted') s.patchNotify({ phone: true })
              }}
              className="mt-3 h-10 w-full rounded-xl bg-white text-[14px] font-bold text-brand"
            >
              {t('al.askPerm')}
            </button>
          )}
          {perm === 'denied' && <p className="mt-2 text-[12px] text-danger">{t('al.permDeniedHelp')}</p>}
          <p className="mt-2 text-[12px] leading-relaxed text-ink-2">{t('al.limit')}</p>
        </section>

        {/* 출력 방식 */}
        <section className="mt-4 px-5">
          <p className="mb-1 text-[15px] font-bold">{t('al.outputs')}</p>
          <Row label={t('al.ch.system')} sub={perm === 'granted' ? undefined : t('al.needPerm')}>
            <Toggle on={s.alerts.phone && perm === 'granted'} onChange={(v) => (perm === 'granted' ? s.patchNotify({ phone: v }) : void requestNotificationPermission().then((r) => (setPerm(r), r === 'granted' && s.patchNotify({ phone: true }))))} label={t('al.ch.system')} />
          </Row>
          <Row label={t('al.ch.sound')}>
            <Toggle on={s.alerts.sound} onChange={(v) => s.patchNotify({ sound: v })} label={t('al.ch.sound')} />
          </Row>
          <Row label={t('al.ch.vibrate')} sub={canVibrate() ? undefined : t('al.sup.vibrateNo')}>
            <Toggle on={s.alerts.vibrate} onChange={(v) => s.patchNotify({ vibrate: v })} label={t('al.ch.vibrate')} />
          </Row>
          <Row label={t('al.ch.voice')}>
            <Toggle on={s.alerts.voice} onChange={(v) => s.patchNotify({ voice: v })} label={t('al.ch.voice')} />
          </Row>
        </section>

        {/* 테스트 */}
        <section className="mx-4 mt-4 flex gap-2">
          <button type="button" onClick={testNow} className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand-light text-[14px] font-bold text-brand">
            <Send size={16} /> {t('al.testNow')}
          </button>
          <button type="button" disabled={testState === 'waiting'} onClick={testLater} className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand text-[14px] font-bold text-white disabled:opacity-60">
            <Timer size={16} /> {testState === 'waiting' ? t('al.testWaiting') : t('al.test10')}
          </button>
        </section>

        {/* 기능별 규칙 */}
        <div className="mt-5 flex items-center justify-between px-5">
          <p className="text-[15px] font-bold">{t('al.rules')}</p>
          <button type="button" onClick={() => s.patch({ alarm: DEFAULT_ALARMS })} className="flex items-center gap-1 text-[13px] font-semibold text-brand">
            <RotateCcw size={14} /> {t('al.reset')}
          </button>
        </div>
        {ALARM_CATS.map((c) => {
          const r = rule(c)
          const unit = OFFSET_UNIT[c]
          const custom = r.repeatMin > 0 && !REPEAT_CHOICES.includes(r.repeatMin)
          return (
            <section key={c} className="mx-4 mt-3 rounded-2xl border border-line px-4 py-3">
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-[15px] font-bold">{t(CAT_KEY(c))}</p>
                  <p className="text-[12px] text-ink-2">{t(`al.desc.${c}` as MessageKey)}</p>
                </div>
                <Toggle on={r.on} onChange={(v) => setRule(c, { on: v })} label={t(CAT_KEY(c))} />
              </div>
              {r.on && (
                <div className="mt-3 space-y-3">
                  <div className="flex flex-wrap gap-1.5">
                    {ALARM_ITEMS[c].map((i) => (
                      <button key={i} type="button" aria-pressed={r.items[i]} onClick={() => setRule(c, { items: { ...r.items, [i]: !r.items[i] } })} className={`h-8 rounded-full px-3 text-[12px] font-semibold ${r.items[i] ? 'bg-ink text-white' : 'bg-sub text-ink-2'}`}>
                        {t(ITEM_KEY(c, i))}
                      </button>
                    ))}
                  </div>
                  <div>
                    <p className="mb-1 text-[12px] font-semibold text-ink-2">{t('al.when')}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {OFFSET_CHOICES[c].map((n) => {
                        const on = r.offsets.includes(n)
                        return (
                          <button key={n} type="button" aria-pressed={on} onClick={() => setRule(c, { offsets: on ? r.offsets.filter((x) => x !== n) : [...r.offsets, n].sort((x, y) => y - x) })} className={`h-8 rounded-full px-3 text-[12px] font-semibold ${on ? 'bg-brand text-white' : 'bg-sub text-ink-2'}`}>
                            {n === 0 ? t('al.atTime') : unit === 'stop' ? t('al.stopsBefore', { n }) : t('al.before', { n })}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                  <div>
                    <p className="mb-1 text-[12px] font-semibold text-ink-2">{t('al.repeat')}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {REPEAT_CHOICES.map((n) => (
                        <button key={n} type="button" onClick={() => setRule(c, { repeatMin: n })} className={`h-8 rounded-full px-3 text-[12px] font-semibold ${!custom && r.repeatMin === n ? 'bg-ink text-white' : 'bg-sub text-ink-2'}`}>
                          {n === 0 ? t('al.noRepeat') : t('al.every', { n })}
                        </button>
                      ))}
                      <button type="button" onClick={() => setRule(c, { repeatMin: custom ? r.repeatMin : 7 })} className={`h-8 rounded-full px-3 text-[12px] font-semibold ${custom ? 'bg-ink text-white' : 'bg-sub text-ink-2'}`}>
                        {t('al.custom')}
                      </button>
                    </div>
                    {custom && <Range label={t('al.interval')} value={r.repeatMin} min={1} max={30} unit={t('unit.minShort')} onChange={(v) => setRule(c, { repeatMin: v })} />}
                    {r.repeatMin > 0 && <Range label={t('al.count')} value={r.repeatCount} min={1} max={10} unit={t('al.times')} onChange={(v) => setRule(c, { repeatCount: v })} />}
                    {r.repeatMin > 0 && <p className="mt-1 text-[11px] text-ink-2">{t(`al.stop.${c}` as MessageKey)}</p>}
                  </div>
                </div>
              )}
            </section>
          )
        })}

        {/* 예약된 알림 */}
        <section className="mt-6 px-5">
          <p className="mb-1 flex items-center gap-1.5 text-[15px] font-bold">
            <BellRing size={16} /> {t('al.upcoming')}
          </p>
          {events.length === 0 ? (
            <p className="py-2 text-[13px] text-ink-2">{t('al.upcomingNone')}</p>
          ) : (
            events.map((e) => (
              <div key={e.key} className="flex items-start gap-3 border-b border-line py-2.5 last:border-0">
                <span className="w-12 shrink-0 text-[14px] font-bold tabular">{formatClock(e.fireAt)}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold">{e.title}</p>
                  <p className="text-[11px] text-ink-2">{e.cat === 'test' ? t('al.cat.test') : t(CAT_KEY(e.cat))}</p>
                </div>
              </div>
            ))
          )}
        </section>

        {/* 발송 기록 */}
        <section className="mt-6 px-5">
          <div className="mb-1 flex items-center justify-between">
            <p className="text-[15px] font-bold">{t('al.log')}</p>
            {log.length > 0 && (
              <button type="button" onClick={() => (clearLog(), setLog([]))} className="text-[12px] font-semibold text-ink-2">
                {t('al.logClear')}
              </button>
            )}
          </div>
          {log.length === 0 ? (
            <p className="py-2 text-[13px] text-ink-2">{t('al.logNone')}</p>
          ) : (
            log
              .slice()
              .reverse()
              .slice(0, 20)
              .map((l) => (
                <div key={l.key} className="border-b border-line py-2.5 last:border-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] text-ink-2 tabular">{formatClock(new Date(l.at))}</span>
                    <span className={`rounded px-1.5 text-[11px] font-bold ${l.status === 'sent' ? 'bg-[#E7F5EC] text-ok' : 'bg-[#FDF6DC] text-[#8A6A00]'}`}>{l.status === 'sent' ? t('al.sent') : t('al.missed')}</span>
                    <span className="truncate text-[13px] font-semibold">{l.title}</span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-ink-2">{l.status === 'sent' ? l.channels.map((c) => t(CH_KEY[c] ?? 'al.ch.banner')).join(' · ') : t('al.missedNote', { t: formatClock(new Date(l.fireAt)) })}</p>
                </div>
              ))
          )}
        </section>
        <div className="mx-4 mt-6">
          <PrimaryButton tone="light" onClick={onClose}>
            {t('common.done')}
          </PrimaryButton>
        </div>
      </div>
    </div>
  )
}

function Row({ label, sub, children }: { label: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-line py-2.5 last:border-0">
      <div>
        <p className="text-[14px] font-semibold">{label}</p>
        {sub && <p className="text-[12px] text-ink-2">{sub}</p>}
      </div>
      {children}
    </div>
  )
}

function Range({ label, value, min, max, unit, onChange }: { label: string; value: number; min: number; max: number; unit: string; onChange: (v: number) => void }) {
  return (
    <div className="mt-2">
      <div className="flex justify-between text-[12px]">
        <span className="text-ink-2">{label}</span>
        <span className="font-bold tabular">
          {value}
          {unit}
        </span>
      </div>
      <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label={label} className="mt-1 w-full accent-[#293896]" />
    </div>
  )
}
