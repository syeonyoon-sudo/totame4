import { useEffect, useState } from 'react'
import { useNow } from '../state/useNow'
import { Briefcase, Building2, ChevronRight, Footprints, GraduationCap, House, LocateFixed } from 'lucide-react'
import { Modal, StationPicker } from '../components/Overlays'
import { LineBadge, PrimaryButton } from '../components/ui'
import { STATIONS } from '../data/network'
import { STATUS_TEXT, STATUS_TONE, directionsOf, planBoarding } from '../lib/boarding'
import { stationName, t, type MessageKey } from '../i18n'
import { nearestStations, useGeo } from '../lib/geo'
import { formatClock } from '../lib/routing'
import { placeLabel, useStore, type Place } from '../state/store'

export { useNow } from '../state/useNow'

export const KIND_ICON = { home: House, school: GraduationCap, work: Briefcase, etc: Building2 }

/** 홈 화면 요약 카드 */
export function DepartureSummary({ onOpen }: { onOpen: () => void }) {
  const s = useStore()
  const now = useNow(5000)
  const place = s.places.find((p) => p.id === s.defaultOriginId) ?? s.places[0]
  if (!place || !STATIONS[place.station]) {
    return (
      <button type="button" onClick={onOpen} className="mx-4 mb-2 flex w-[calc(100%-2rem)] items-center gap-3 rounded-2xl bg-brand-light px-4 py-3 text-left">
        <Footprints size={20} className="text-brand" />
        <span className="flex-1 text-[15px] font-bold text-brand">{t('dep.title')}</span>
        <ChevronRight size={18} className="text-brand" />
      </button>
    )
  }
  const line = STATIONS[place.station].lines[0]
  const dir = directionsOf(place.station, line)[0]
  const p = planBoarding({ station: place.station, line, toward: dir?.toward ?? '', distanceM: place.distanceM, mode: 'walk', walkSpeed: s.walkSpeed, now, delayMin: s.statusOf(line).delayMin, mustCatch: s.departMode === 'must', bufferMin: s.safetyBuffer })
  const Icon = KIND_ICON[place.kind]
  return (
    <button type="button" onClick={onOpen} className="mx-4 mb-2 block w-[calc(100%-2rem)] rounded-2xl bg-brand-light px-4 py-3 text-left">
      <div className="flex items-center gap-2 text-[12px] font-semibold text-brand">
        <Footprints size={14} /> {t('dep.title')}
        <ChevronRight size={14} className="ml-auto" />
      </div>
      <div className="mt-1 flex items-center gap-2">
        <Icon size={17} className="shrink-0 text-ink" />
        <span className="truncate text-[15px] font-bold">{placeLabel(place, t)}</span>
        <span className="text-[13px] text-ink-2">· {stationName(place.station)}</span>
        <LineBadge line={line} size={17} />
      </div>
      <p className={`mt-1 text-[15px] font-bold ${STATUS_TONE[p.status]}`}>{t(STATUS_TEXT[p.status])}</p>
      <p className="text-[12px] text-ink-2">
        {t('dep.summary', { train: formatClock(p.catchable.at), leave: formatClock(p.leaveBy) })}
      </p>
    </button>
  )
}

export function AddPlace({ open, onClose, onAdded }: { open: boolean; onClose: () => void; onAdded: (id: string) => void }) {
  const s = useStore()
  const [kind, setKind] = useState<Place['kind']>('home')
  const [label, setLabel] = useState('')
  const [station, setStation] = useState('')
  const [dist, setDist] = useState(500)
  const [picker, setPicker] = useState(false)
  const { geo, locate } = useGeo()

  useEffect(() => {
    if (geo.status === 'ok' && geo.real) {
      const n = nearestStations(geo.lat, geo.lon, 1)[0]
      setStation(n.st.id)
      setDist(Math.max(50, Math.round((n.km * 1000) / 10) * 10))
    }
  }, [geo.status, geo.real, geo.lat, geo.lon])

  const kinds: { id: Place['kind']; key: MessageKey }[] = [
    { id: 'home', key: 'place.home' },
    { id: 'school', key: 'place.school' },
    { id: 'work', key: 'place.work' },
    { id: 'etc', key: 'place.etc' },
  ]
  return (
    <>
      <Modal
        open={open && !picker}
        onClose={onClose}
        title={t('dep.addPlace')}
        footer={
          <PrimaryButton
            disabled={!station}
            onClick={() => {
              const id = `p-${Date.now()}`
              s.patch({ places: [...s.places, { id, kind, label: label.trim() || t(kinds.find((k) => k.id === kind)!.key), station, distanceM: dist }] })
              onAdded(id)
              setLabel('')
              setStation('')
              onClose()
            }}
          >
            {t('common.save')}
          </PrimaryButton>
        }
      >
        <div className="space-y-4 px-5 pb-2">
          <div className="grid grid-cols-4 gap-2">
            {kinds.map((k) => (
              <button key={k.id} type="button" onClick={() => setKind(k.id)} className={`h-10 rounded-xl text-[14px] font-semibold ${kind === k.id ? 'bg-brand text-white' : 'bg-sub'}`}>
                {t(k.key)}
              </button>
            ))}
          </div>
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t('place.namePh')} className="h-12 w-full rounded-xl bg-sub px-4 text-[16px] outline-none" />
          <button type="button" onClick={() => s.withLocation(locate)} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-brand text-[15px] font-bold text-brand">
            <LocateFixed size={17} /> {geo.status === 'locating' ? t('geo.locating') : t('place.useLocation')}
          </button>
          {(geo.status === 'denied' || geo.status === 'unavailable') && <p className="text-[12px] text-danger">{t('geo.denied')}</p>}
          <button type="button" onClick={() => setPicker(true)} className="flex h-12 w-full items-center justify-between rounded-xl bg-sub px-4 text-left text-[15px]">
            <span className="text-ink-2">{t('place.station')}</span>
            <span className="font-bold">{station ? stationName(station) : t('common.select')}</span>
          </button>
          <div>
            <div className="flex justify-between text-[14px]">
              <span className="text-ink-2">{t('place.distance')}</span>
              <span className="font-bold tabular">{dist}m</span>
            </div>
            <input type="range" min={50} max={3000} step={50} value={dist} onChange={(e) => setDist(Number(e.target.value))} className="mt-2 w-full accent-[#293896]" />
          </div>
        </div>
      </Modal>
      <StationPicker open={picker} title={t('place.station')} onClose={() => setPicker(false)} onPick={(id) => (setStation(id), setPicker(false))} />
    </>
  )
}
