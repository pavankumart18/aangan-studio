import { useStore, uid } from '../store'
import { CATALOG, CITIES, ROOM_TYPES, ROOM_TYPE_MAP } from '../catalog'
import { roomAt } from '../walls'
import type { Tool } from '../types'
import { fmtFt } from './PlanView'
import { LEVEL_NAMES, lvl, onLevel } from '../levels'
import { STYLES, applyStyle } from '../styles'
import { autoFurnish, clearRoom } from '../layout'
import { roomViewpoint } from '../camera'
import type { StyleId } from '../types'
import { useState } from 'react'

const PLOT_PRESETS = [
  { label: '30×40 ft', w: 30, d: 40 },
  { label: '30×50 ft', w: 30, d: 50 },
  { label: '40×60 ft', w: 40, d: 60 },
  { label: '50×80 ft', w: 50, d: 80 },
]
const FT = 0.3048

const TOOLS: { id: Tool; label: string; key: string; icon: string }[] = [
  { id: 'select', label: 'Select / Move', key: 'V', icon: '↖' },
  { id: 'room', label: 'Draw room', key: 'B', icon: '▭' },
  { id: 'window', label: 'Window', key: 'W', icon: '⊟' },
  { id: 'door', label: 'Door', key: 'D', icon: '⌒' },
]

function Num({ label, value, onChange, step = 0.25, min = 0, suffix }: { label: string; value: number; onChange: (v: number) => void; step?: number; min?: number; suffix?: string }) {
  return (
    <label className="num">
      <span>{label}</span>
      <input
        type="number"
        step={step}
        min={min}
        value={Number(value.toFixed(2))}
        onChange={(e) => {
          const v = parseFloat(e.target.value)
          if (!Number.isNaN(v) && v >= min) onChange(v)
        }}
      />
      {suffix && <em>{suffix}</em>}
    </label>
  )
}

export default function LeftPanel() {
  const tab = useStore((s) => s.leftTab)
  const set = useStore((s) => s.set)
  const tool = useStore((s) => s.tool)
  const drawType = useStore((s) => s.drawType)
  const p = useStore((s) => s.project)
  const sel = useStore((s) => s.selection)
  const activeLevel = useStore((s) => s.activeLevel)
  const date = useStore((s) => s.sun.date)
  const vastu = useStore((s) => s.vastu)
  const { apply, setTool, select } = useStore.getState()
  const [floorNote, setFloorNote] = useState<string | null>(null)
  const lp = onLevel(p, activeLevel)

  const furnishFloor = () => {
    const t0 = performance.now()
    let count = 0
    apply((q) => {
      for (const r of q.rooms.filter((r) => lvl(r) === activeLevel)) {
        clearRoom(q, r)
        const res = autoFurnish(q, r, date, vastu)
        q.furniture.push(...res.items)
        count += res.items.length
      }
    })
    setFloorNote(`Furnished ${lp.rooms.length} rooms with ${count} pieces in ${(performance.now() - t0).toFixed(0)} ms. Undo with ⌘Z.`)
  }

  const addFurniture = (kind: string) => {
    const def = CATALOG.find((c) => c.kind === kind)!
    let x = p.plot.width / 2, y = p.plot.depth / 2
    const target =
      sel?.type === 'room'
        ? lp.rooms.find((r) => r.id === sel.id)
        : sel?.type === 'furniture'
          ? (() => {
              const f = lp.furniture.find((f) => f.id === sel.id)
              return f ? roomAt(lp, f.x, f.y) : undefined
            })()
          : lp.rooms[0]
    if (target) {
      x = target.x + target.w / 2
      y = target.y + target.d / 2
    }
    const id = uid()
    apply((q) => {
      q.furniture.push({ id, kind, x, y, rot: 0, color: def.color, level: activeLevel })
    })
    select({ type: 'furniture', id })
    setTool('select')
  }

  const categories = Array.from(new Set(CATALOG.map((c) => c.category)))

  return (
    <aside className="panel left">
      <div className="tabs">
        <button className={tab === 'build' ? 'on' : ''} onClick={() => set({ leftTab: 'build' })}>Build</button>
        <button className={tab === 'furnish' ? 'on' : ''} onClick={() => set({ leftTab: 'furnish' })}>Furnish</button>
      </div>

      {tab === 'build' ? (
        <div className="scroll">
          <section>
            <h4>Floors</h4>
            <div className="levels">
              {[...p.levels].map((l, i) => ({ l, i })).reverse().map(({ l, i }) => (
                <div key={i} className={`level-row ${activeLevel === i ? 'on' : ''}`} onClick={() => useStore.getState().set({ activeLevel: i, selection: null })}>
                  <span className="lv-badge">{i === 0 ? 'G' : i}</span>
                  <input value={l.name} onChange={(e) => apply((q) => void (q.levels[i].name = e.target.value), false)} onClick={(e) => e.stopPropagation()} />
                  <em>{p.rooms.filter((r) => lvl(r) === i).length} rooms</em>
                </div>
              ))}
            </div>
            <div className="btn-row tight">
              <button
                onClick={() => {
                  const n = p.levels.length
                  apply((q) => void q.levels.push({ name: LEVEL_NAMES[n] ?? `Level ${n}` }))
                  useStore.getState().set({ activeLevel: n })
                }}
              >
                + Add floor
              </button>
              <button
                onClick={() => {
                  const n = p.levels.length
                  const below = p.rooms.filter((r) => lvl(r) === n - 1)
                  apply((q) => {
                    q.levels.push({ name: LEVEL_NAMES[n] ?? `Level ${n}` })
                    for (const r of below) q.rooms.push({ ...r, id: uid(), level: n, name: r.name.replace(/\s*\d*$/, '') + ` (${n === 1 ? 'FF' : 'L' + n})` })
                    for (const o of p.openings.filter((o) => lvl(o) === n - 1 && o.kind === 'window')) q.openings.push({ ...o, id: uid(), level: n })
                  })
                  useStore.getState().set({ activeLevel: n })
                }}
                title="New floor with the same room outlines and windows as the floor below"
              >
                Copy floor ↑
              </button>
              {p.levels.length > 1 && activeLevel === p.levels.length - 1 && (
                <button
                  className="danger"
                  onClick={() => {
                    const L = p.levels.length - 1
                    apply((q) => {
                      q.levels.pop()
                      q.rooms = q.rooms.filter((r) => lvl(r) !== L)
                      q.openings = q.openings.filter((o) => lvl(o) !== L)
                      q.furniture = q.furniture.filter((f) => lvl(f) !== L)
                    })
                    useStore.getState().set({ activeLevel: L - 1 })
                  }}
                >
                  Remove top
                </button>
              )}
            </div>
            <div className="meta">Add a staircase from Furnish → Structure. It cuts an opening in the floor above automatically.</div>
          </section>

          <section>
            <h4>Design style</h4>
            <div className="styles">
              {(Object.keys(STYLES) as StyleId[]).map((id) => {
                const st = STYLES[id]
                return (
                  <button key={id} className={`style-card ${p.style === id ? 'on' : ''}`} onClick={() => apply((q) => applyStyle(q, id))} title={st.blurb}>
                    <span className="sw-row">
                      {[st.exterior, st.wood, ...st.upholstery.slice(0, 2), st.trim].map((c, i) => (
                        <i key={i} style={{ background: c }} />
                      ))}
                    </span>
                    <b>{st.label}</b>
                  </button>
                )
              })}
            </div>
            <div className="meta">{STYLES[p.style].blurb} Re-skins walls, floors, furniture and the roof. Turn on Roof in 3D to see it.</div>
          </section>

          <section>
            <h4>Tools</h4>
            <div className="tool-grid">
              {TOOLS.map((t) => (
                <button key={t.id} className={`tool ${tool === t.id ? 'on' : ''}`} onClick={() => setTool(t.id)} title={`${t.label} (${t.key})`}>
                  <span className="ico">{t.icon}</span>
                  <span>{t.label}</span>
                  <kbd>{t.key}</kbd>
                </button>
              ))}
            </div>
            {tool === 'room' && (
              <div className="chips">
                {ROOM_TYPES.map((r) => (
                  <button key={r.type} className={`chip ${drawType === r.type ? 'on' : ''}`} style={{ ['--c' as string]: r.color }} onClick={() => set({ drawType: r.type })}>
                    <i />
                    {r.label}
                  </button>
                ))}
              </div>
            )}
          </section>

          <section>
            <h4>Plot</h4>
            <div className="chips">
              {PLOT_PRESETS.map((pp) => (
                <button
                  key={pp.label}
                  className="chip"
                  onClick={() =>
                    apply((q) => {
                      q.plot.width = Math.round(pp.w * FT * 100) / 100
                      q.plot.depth = Math.round(pp.d * FT * 100) / 100
                    })
                  }
                >
                  {pp.label}
                </button>
              ))}
            </div>
            <div className="row2">
              <Num label="Width" value={p.plot.width} suffix={fmtFt(p.plot.width)} min={3} onChange={(v) => apply((q) => void (q.plot.width = v))} />
              <Num label="Depth" value={p.plot.depth} suffix={fmtFt(p.plot.depth)} min={3} onChange={(v) => apply((q) => void (q.plot.depth = v))} />
            </div>
            <div className="meta">
              Plot area <b>{(p.plot.width * p.plot.depth).toFixed(1)} m²</b> · <b>{Math.round(p.plot.width * p.plot.depth * 10.7639)} ft²</b> ·{' '}
              <b>{Math.round((p.plot.width * p.plot.depth * 10.7639) / 9)}</b> sq yd (gaj)
            </div>
          </section>

          <section>
            <h4>Orientation & location</h4>
            <label className="slider">
              <span>North direction</span>
              <input type="range" min={0} max={359} value={p.plot.northDeg} onChange={(e) => apply((q) => void (q.plot.northDeg = Number(e.target.value)), false)} onPointerDown={() => useStore.getState().checkpoint()} />
              <b>{p.plot.northDeg}°</b>
            </label>
            <div className="chips">
              {[0, 90, 180, 270].map((d, i) => (
                <button key={d} className={`chip ${p.plot.northDeg === d ? 'on' : ''}`} onClick={() => apply((q) => void (q.plot.northDeg = d))}>
                  {['North', 'West', 'South', 'East'][i]}-facing top
                </button>
              ))}
            </div>
            <label className="sel">
              <span>City</span>
              <select
                value={CITIES.some((c) => c.name === p.plot.city) ? p.plot.city : 'custom'}
                onChange={(e) => {
                  const c = CITIES.find((c) => c.name === e.target.value)
                  if (c) apply((q) => Object.assign(q.plot, { city: c.name, lat: c.lat, lng: c.lng, tz: c.tz }))
                }}
              >
                {CITIES.map((c) => (
                  <option key={c.name} value={c.name}>{c.name}</option>
                ))}
                <option value="custom">Custom…</option>
              </select>
            </label>
            <div className="row3">
              <Num label="Lat" step={0.01} min={-90} value={p.plot.lat} onChange={(v) => apply((q) => Object.assign(q.plot, { lat: v, city: 'Custom' }))} />
              <Num label="Lng" step={0.01} min={-180} value={p.plot.lng} onChange={(v) => apply((q) => Object.assign(q.plot, { lng: v, city: 'Custom' }))} />
              <Num label="UTC±" step={0.5} min={-12} value={p.plot.tz} onChange={(v) => apply((q) => Object.assign(q.plot, { tz: v }))} />
            </div>
          </section>

          <section>
            <h4>Structure</h4>
            <div className="row2">
              <Num label="Wall height" value={p.wallHeight} step={0.1} min={2.4} suffix="m" onChange={(v) => apply((q) => void (q.wallHeight = v))} />
              <Num label="Slab" value={p.slabThickness} step={0.01} min={0.1} suffix="m" onChange={(v) => apply((q) => void (q.slabThickness = v))} />
            </div>
            <div className="meta">Walls: 230 mm exterior · 115 mm partition · 450 mm plinth</div>
          </section>

          <section>
            <h4>Rooms on {p.levels[activeLevel]?.name} ({lp.rooms.length})</h4>
            <ul className="list">
              {lp.rooms.map((r) => (
                <li key={r.id} className={sel?.type === 'room' && sel.id === r.id ? 'on' : ''} onClick={() => select({ type: 'room', id: r.id })}>
                  <i style={{ background: ROOM_TYPE_MAP[r.type].color }} />
                  <span>{r.name}</span>
                  <em>{(r.w * r.d).toFixed(1)} m²</em>
                  <button
                    className="ghost sm eye"
                    title="View from inside"
                    onClick={(e) => {
                      e.stopPropagation()
                      const st = useStore.getState()
                      st.set({ camView: roomViewpoint(p, r), viewMode: st.viewMode === '2d' ? 'split' : st.viewMode })
                    }}
                  >
                    👁
                  </button>
                </li>
              ))}
              {!lp.rooms.length && <li className="empty">Pick “Draw room” and drag on the plot.</li>}
            </ul>
          </section>
        </div>
      ) : (
        <div className="scroll">
          <section>
            <h4>Smart layout</h4>
            <button className="primary wide" disabled={!lp.rooms.length} onClick={furnishFloor}>
              ✦ Auto-furnish {p.levels[activeLevel]?.name}
            </button>
            <div className="meta">
              Places furniture in every room using clearances, door swings, window glare, sun{vastu ? ' and Vastu' : ''}. Select a room and open Inspect to ask Claude for a design.
            </div>
            {floorNote && <div className="note ok">{floorNote}</div>}
          </section>
          <p className="meta pad">
            Click an item to drop it into the {sel?.type === 'room' ? 'selected room' : 'first room'} on this floor. Drag to place · <kbd>R</kbd> rotate · <kbd>⌫</kbd> delete.
          </p>
          {categories.map((cat) => (
            <section key={cat}>
              <h4>{cat}</h4>
              <div className="catalog">
                {CATALOG.filter((c) => c.category === cat).map((c) => (
                  <button key={c.kind} className="cat-item" onClick={() => addFurniture(c.kind)}>
                    <span className="swatch" style={{ background: c.color }} />
                    <span className="nm">{c.label}</span>
                    <span className="dm">
                      {c.w.toFixed(2)}×{c.d.toFixed(2)} m
                    </span>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </aside>
  )
}
