import { CircleCheck, CircleHelp, TriangleExclamationPoint } from 'lucide-react'
import type { LineId } from '../data/network'
import { lineName, t } from '../i18n'
import { useStore } from '../state/store'
import { LineBadge } from './ui'

/** 노선 운행 상태 한 줄 — 실시간 / 시뮬레이션 / 확인 불가를 구분해 표시 */
export function DelayLine({ line, compact }: { line: LineId; compact?: boolean }) {
  const { statusOf } = useStore()
  const st = statusOf(line)
  const bad = st.delayMin > 0 || st.suspended
  const Icon = st.kind === 'unknown' ? CircleHelp : bad ? TriangleExclamationPoint : CircleCheck
  const color = st.kind === 'unknown' ? 'text-ink-2' : bad ? 'text-danger' : 'text-ok'
  const time = `${String(st.updatedAt.getHours()).padStart(2, '0')}:${String(st.updatedAt.getMinutes()).padStart(2, '0')}`
  const kindLabel = st.kind === 'simulated' ? t('data.sim') : st.kind === 'realtime' ? t('data.realtime') : t('data.none')
  return (
    <div className={`flex items-center gap-2 ${compact ? '' : 'rounded-xl bg-sub px-3 py-2.5'}`}>
      <LineBadge line={line} size={18} />
      <Icon size={15} className={`shrink-0 ${color}`} />
      <span className={`min-w-0 flex-1 text-[13px] leading-snug font-semibold ${compact ? 'truncate' : ''} ${color}`}>{t(st.message, { n: st.delayMin, l: lineName(line) })}</span>
      <span className="shrink-0 text-[11px] text-ink-2">
        {kindLabel} · {time}
      </span>
    </div>
  )
}

/** 경로 행에 붙는 작은 지연 표시 */
export function DelayChip({ lines }: { lines: LineId[] }) {
  const { statusOf } = useStore()
  const sts = lines.map(statusOf)
  const delay = sts.reduce((a, x) => a + x.delayMin, 0)
  const susp = sts.some((x) => x.suspended)
  if (susp || delay > 0)
    return <span className="inline-flex h-5 items-center rounded-full bg-[#FBE6E5] px-1.5 text-[11px] font-semibold text-danger">{susp ? t('delay.chipSuspended') : t('delay.chip', { n: delay })}</span>
  if (sts.every((x) => x.kind === 'realtime')) return <span className="inline-flex h-5 items-center rounded-full bg-[#E7F5EC] px-1.5 text-[11px] font-semibold text-ok">{t('delay.chipNormal')}</span>
  return <span className="inline-flex h-5 items-center rounded-full bg-sub px-1.5 text-[11px] font-medium text-ink-2">{t('delay.chipUnknown')}</span>
}
