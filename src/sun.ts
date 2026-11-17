import SunCalc from 'suncalc'
import type { Plot } from './types'

const DEG = Math.PI / 180

export function instantFor(date: string, minutes: number, tz: number) {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d, 0, 0) + (minutes - tz * 60) * 60000)
}

export interface SunPos {
  altitude: number // radians
  bearing: number // true compass bearing, degrees from north clockwise
}

export function sunPosition(plot: Plot, date: string, minutes: number): SunPos {
  const p = SunCalc.getPosition(instantFor(date, minutes, plot.tz), plot.lat, plot.lng)
  return { altitude: p.altitude, bearing: ((p.azimuth / DEG + 180) % 360 + 360) % 360 }
}

/** Unit vector towards the sun in scene space (X right, Y up, Z = plan down). */
export function sunVector(plot: Plot, s: SunPos): [number, number, number] {
  const beta = (s.bearing + plot.northDeg) * DEG
  const h = Math.cos(s.altitude)
  return [Math.sin(beta) * h, Math.sin(s.altitude), -Math.cos(beta) * h]
}

const toLocalMinutes = (d: Date, tz: number) => {
  const t = d.getTime()
  if (Number.isNaN(t)) return null
  const m = (t / 60000 + tz * 60) % 1440
  return (m + 1440) % 1440
}

export function dayTimes(plot: Plot, date: string) {
  const t = SunCalc.getTimes(instantFor(date, 12 * 60, plot.tz), plot.lat, plot.lng)
  return {
    sunrise: toLocalMinutes(t.sunrise, plot.tz),
    sunset: toLocalMinutes(t.sunset, plot.tz),
    noon: toLocalMinutes(t.solarNoon, plot.tz) ?? 720,
  }
}

export const fmtTime = (m: number | null) => {
  if (m == null) return '—'
  const h = Math.floor(m / 60) % 24
  const mm = Math.floor(m % 60)
  const ap = h >= 12 ? 'PM' : 'AM'
  return `${((h + 11) % 12) + 1}:${String(mm).padStart(2, '0')} ${ap}`
}

export const DIRS8 = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const
export type Dir8 = (typeof DIRS8)[number]
export const dirName = (bearing: number): Dir8 => DIRS8[Math.round((((bearing % 360) + 360) % 360) / 45) % 8]
export const DIR_LONG: Record<Dir8, string> = {
  N: 'North', NE: 'North-East', E: 'East', SE: 'South-East', S: 'South', SW: 'South-West', W: 'West', NW: 'North-West',
}

export function seasonDates(year: number) {
  return [
    { label: 'Summer', date: `${year}-06-21` },
    { label: 'Equinox', date: `${year}-09-22` },
    { label: 'Winter', date: `${year}-12-21` },
  ]
}
