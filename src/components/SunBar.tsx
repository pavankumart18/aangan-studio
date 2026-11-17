import { useEffect, useMemo } from 'react'
import { useStore } from '../store'
import { dayTimes, dirName, DIR_LONG, fmtTime, seasonDates, sunPosition } from '../sun'

export default function SunBar() {
  const sun = useStore((s) => s.sun)
  const plot = useStore((s) => s.project.plot)
  const layers = useStore((s) => s.layers)
  const viewMode = useStore((s) => s.viewMode)
  const { setSun, toggleLayer } = useStore.getState()
  const pos = useMemo(() => sunPosition(plot, sun.date, sun.minutes), [plot, sun.date, sun.minutes])
  const days = useMemo(() => dayTimes(plot, sun.date), [plot, sun.date])

  useEffect(() => {
    if (!sun.playing) return
    let raf = 0
    let last = performance.now()
    const tick = (t: number) => {
      const dt = t - last
      last = t
      const s = useStore.getState().sun
      const rise = days.sunrise ?? 360
      const set = days.sunset ?? 1080
      let m = s.minutes + dt * 0.012 * 10 // ≈ 2 hours of sun per real second
      if (m > set + 20 || m < rise - 20) m = rise - 10
      useStore.getState().setSun({ minutes: m })
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [sun.playing, days.sunrise, days.sunset])

  const year = Number(sun.date.slice(0, 4))
  const alt = (pos.altitude * 180) / Math.PI
  return (
    <div className="sunbar-wrap">
      <button className={`play ${sun.playing ? 'on' : ''}`} onClick={() => setSun({ playing: !sun.playing })} title="Animate the sun across the day">
        {sun.playing ? '❚❚' : '▶'}
      </button>
      <div className="time">
        <b>{fmtTime(sun.minutes)}</b>
        <span>{alt > 0 ? `☀ ${alt.toFixed(0)}° high · from ${DIR_LONG[dirName(pos.bearing)]}` : '☾ Sun below horizon'}</span>
      </div>
      <div className="track">
        <div
          className="daylight"
          style={{
            left: `${((days.sunrise ?? 0) / 1440) * 100}%`,
            width: `${(((days.sunset ?? 1440) - (days.sunrise ?? 0)) / 1440) * 100}%`,
          }}
        />
        <input type="range" min={0} max={1439} step={5} value={sun.minutes} onChange={(e) => setSun({ minutes: Number(e.target.value), playing: false })} />
        <div className="ticks">
          {[0, 6, 12, 18, 24].map((h) => (
            <span key={h} style={{ left: `${(h / 24) * 100}%` }}>{h === 24 ? '' : `${h}:00`}</span>
          ))}
        </div>
      </div>
      <input type="date" value={sun.date} onChange={(e) => e.target.value && setSun({ date: e.target.value })} />
      <div className="seg sm">
        {seasonDates(year).map((s) => (
          <button key={s.label} className={sun.date === s.date ? 'on' : ''} onClick={() => setSun({ date: s.date })}>
            {s.label}
          </button>
        ))}
      </div>
      {viewMode !== '2d' && (
        <div className="layers">
          {(
            [
              ['foundation', 'Foundation'],
              ['walls', 'Walls'],
              ['cutaway', 'Cutaway'],
              ['roof', 'Roof'],
              ['furniture', 'Furniture'],
              ['sunPath', 'Sun path'],
            ] as const
          ).map(([k, l]) => (
            <button key={k} className={`chip ${layers[k] ? 'on' : ''}`} onClick={() => toggleLayer(k)}>
              {l}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
