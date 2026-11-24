import { useCallback, useEffect, useRef, useState } from 'react'
import { ALL_STATIONS, DEMO_LOCATION, distKm, project } from '../data/network'

export interface GeoState {
  status: 'idle' | 'locating' | 'ok' | 'denied' | 'unavailable'
  lat: number
  lon: number
  accuracy?: number
  /** 실제 GPS 위치인지, 시연용 기본 위치인지 */
  real: boolean
}

export function nearestStations(lat: number, lon: number, n = 4) {
  return ALL_STATIONS.map((st) => ({ st, km: distKm(lat, lon, st.lat, st.lon) }))
    .sort((a, b) => a.km - b.km)
    .slice(0, n)
}

/** 위치 권한 요청은 사용자가 버튼을 눌렀을 때만 */
export function useGeo(watch = false) {
  const [geo, setGeo] = useState<GeoState>({ status: 'idle', ...DEMO_LOCATION, real: false })
  const watchId = useRef<number | null>(null)

  const stop = useCallback(() => {
    if (watchId.current !== null) navigator.geolocation?.clearWatch(watchId.current)
    watchId.current = null
  }, [])

  const locate = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setGeo((g) => ({ ...g, status: 'unavailable' }))
      return
    }
    setGeo((g) => ({ ...g, status: 'locating' }))
    const ok = (p: GeolocationPosition) => setGeo({ status: 'ok', lat: p.coords.latitude, lon: p.coords.longitude, accuracy: p.coords.accuracy, real: true })
    const fail = (e: GeolocationPositionError) => setGeo((g) => ({ ...g, status: e.code === 1 ? 'denied' : 'unavailable' }))
    if (watch) {
      stop()
      watchId.current = navigator.geolocation.watchPosition(ok, fail, { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 })
    } else navigator.geolocation.getCurrentPosition(ok, fail, { enableHighAccuracy: true, maximumAge: 30000, timeout: 15000 })
  }, [watch, stop])

  useEffect(() => stop, [stop])

  return { geo, locate, stop, xy: project(geo.lat, geo.lon) }
}
