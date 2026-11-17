import { useMemo, useState } from 'react'
import { autoFurnish, clearRoom } from '../layout'
import { aiFurnish } from '../ai'
import { roomViewpoint } from '../camera'
import { lvl } from '../levels'
import type { Room } from '../types'
import { useStore } from '../store'
import { CATALOG_MAP, FLOOR_COLORS, ROOM_TYPES, ROOM_TYPE_MAP, WALL_PALETTE } from '../catalog'
import { analyse, estimate, SQFT, fmtTime, type RoomInsight } from '../insights'
import { DIR_LONG } from '../sun'
import type { FloorMat, RoomType } from '../types'
import { fmtFt } from './PlanView'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  )
}

function NumIn({ value, onChange, step = 0.25, min = 0 }: { value: number; onChange: (v: number) => void; step?: number; min?: number }) {
  return (
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
  )
}

function RoomDesigner({ room }: { room: Room }) {
  const p = useStore((s) => s.project)
  const date = useStore((s) => s.sun.date)
  const vastu = useStore((s) => s.vastu)
  const { apply } = useStore.getState()
  const [notes, setNotes] = useState<{ by: 'engine' | 'claude'; summary?: string; lines: string[]; error?: boolean } | null>(null)
  const [brief, setBrief] = useState('')
  const [busy, setBusy] = useState(false)
  const inRoom = p.furniture.filter((f) => !f.kind.startsWith('stair') && lvl(f) === lvl(room) && f.x >= room.x && f.x <= room.x + room.w && f.y >= room.y && f.y <= room.y + room.d).length

  const smart = () => {
    apply((q) => {
      const r = q.rooms.find((r) => r.id === room.id)!
      clearRoom(q, r)
      const res = autoFurnish(q, r, date, vastu)
      q.furniture.push(...res.items)
      setNotes({ by: 'engine', lines: res.notes })
    })
  }
  const claude = async () => {
    setBusy(true)
    setNotes(null)
    try {
      const res = await aiFurnish(p, room, date, vastu, brief)
      apply((q) => {
        clearRoom(q, q.rooms.find((r) => r.id === room.id)!)
        q.furniture.push(...res.items)
      })
      setNotes({ by: 'claude', summary: res.summary, lines: res.notes })
    } catch (e) {
      setNotes({ by: 'claude', lines: [e instanceof Error ? e.message : String(e)], error: true })
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="designer">
      <h4>Design this room</h4>
      <div className="btn-row tight">
        <button className="primary" onClick={smart} title="Instant rule-based layout">
          ✦ Smart layout
        </button>
        <button className="ai" onClick={claude} disabled={busy}>
          {busy ? 'Claude is designing…' : '✨ Ask Claude'}
        </button>
      </div>
      <textarea placeholder="Optional brief for Claude, e.g. “work-from-home corner, reading nook, kid-safe”" value={brief} onChange={(e) => setBrief(e.target.value)} rows={2} />
      <div className="btn-row tight">
        <button
          onClick={() => {
            const st = useStore.getState()
            st.set({ camView: roomViewpoint(p, room), viewMode: st.viewMode === '2d' ? 'split' : st.viewMode })
          }}
        >
          👁 View inside
        </button>
        <button disabled={!inRoom} onClick={() => apply((q) => clearRoom(q, q.rooms.find((r) => r.id === room.id)!))}>
          Clear {inRoom ? `(${inRoom})` : ''}
        </button>
      </div>
      {notes && (
        <div className={`note ${notes.error ? 'err' : 'ok'}`}>
          <b>{notes.error ? 'Could not get a design' : notes.by === 'claude' ? 'Claude’s design' : 'Layout rationale'}</b>
          {notes.summary && <p>{notes.summary}</p>}
          <ul>
            {notes.lines.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
          {!notes.error && <em>Undo with ⌘Z</em>}
        </div>
      )}
    </div>
  )
}

function Inspect() {
  const p = useStore((s) => s.project)
  const sel = useStore((s) => s.selection)
  const { apply, deleteSelection, select } = useStore.getState()

  if (!sel)
    return (
      <div className="pad">
        <div className="empty-state">
          <h3>Nothing selected</h3>
          <p>Click a room, window, door or furniture piece in the plan or 3D view to edit it.</p>
        </div>
        <h4>Shortcuts</h4>
        <ul className="keys">
          <li><kbd>V</kbd> Select · <kbd>B</kbd> Draw room · <kbd>W</kbd> Window · <kbd>D</kbd> Door</li>
          <li><kbd>R</kbd> / <kbd>⇧R</kbd> Rotate furniture ±90°</li>
          <li><kbd>⌘D</kbd> Duplicate · <kbd>⌫</kbd> Delete · <kbd>Esc</kbd> Deselect</li>
          <li><kbd>⌘Z</kbd> Undo · <kbd>⇧⌘Z</kbd> Redo</li>
          <li><kbd>1</kbd> Plan · <kbd>2</kbd> Split · <kbd>3</kbd> 3D</li>
        </ul>
      </div>
    )

  if (sel.type === 'room') {
    const r = p.rooms.find((r) => r.id === sel.id)
    if (!r) return null
    const up = (patch: Partial<typeof r>) => apply((q) => Object.assign(q.rooms.find((x) => x.id === r.id)!, patch))
    return (
      <div className="pad">
        <div className="insp-head">
          <i style={{ background: ROOM_TYPE_MAP[r.type].color }} />
          <input className="title-in" value={r.name} onChange={(e) => up({ name: e.target.value })} />
        </div>
        <div className="meta">
          {(r.w * r.d).toFixed(2)} m² · {Math.round(r.w * r.d * SQFT)} ft² · {fmtFt(r.w)} × {fmtFt(r.d)}
        </div>
        <Field label="Room type">
          <select value={r.type} onChange={(e) => up({ type: e.target.value as RoomType })}>
            {ROOM_TYPES.map((t) => <option key={t.type} value={t.type}>{t.label}</option>)}
          </select>
        </Field>
        <div className="grid2">
          <Field label="X (m)"><NumIn value={r.x} onChange={(v) => up({ x: v })} /></Field>
          <Field label="Y (m)"><NumIn value={r.y} onChange={(v) => up({ y: v })} /></Field>
          <Field label="Width (m)"><NumIn value={r.w} min={1} onChange={(v) => up({ w: v })} /></Field>
          <Field label="Depth (m)"><NumIn value={r.d} min={1} onChange={(v) => up({ d: v })} /></Field>
        </div>
        <Field label="Flooring">
          <div className="swatches">
            {(Object.keys(FLOOR_COLORS) as FloorMat[]).map((m) => (
              <button key={m} className={`sw ${r.floor === m ? 'on' : ''}`} style={{ background: FLOOR_COLORS[m] }} title={m} onClick={() => up({ floor: m })} />
            ))}
          </div>
          <em className="cap">{r.floor}</em>
        </Field>
        <Field label="Wall colour">
          <div className="swatches">
            {WALL_PALETTE.map((c) => (
              <button key={c} className={`sw ${r.wallColor === c ? 'on' : ''}`} style={{ background: c }} onClick={() => up({ wallColor: c })} />
            ))}
            <input type="color" value={r.wallColor} onChange={(e) => up({ wallColor: e.target.value })} />
          </div>
        </Field>
        <RoomDesigner room={r} />
        <div className="btn-row">
          <button className="danger" onClick={deleteSelection}>Delete room</button>
        </div>
      </div>
    )
  }

  if (sel.type === 'opening') {
    const o = p.openings.find((o) => o.id === sel.id)
    if (!o) return null
    const up = (patch: Partial<typeof o>) => apply((q) => Object.assign(q.openings.find((x) => x.id === o.id)!, patch))
    return (
      <div className="pad">
        <div className="insp-head">
          <h3>{o.kind === 'window' ? 'Window' : 'Door'}</h3>
        </div>
        <Field label="Type">
          <select value={o.kind} onChange={(e) => up({ kind: e.target.value as 'window' | 'door' })}>
            <option value="window">Window (sill 0.9 m, lintel 2.1 m)</option>
            <option value="door">Door (2.1 m high)</option>
          </select>
        </Field>
        <div className="grid2">
          <Field label="Width (m)"><NumIn value={o.length} min={0.5} onChange={(v) => up({ length: v })} /></Field>
          <Field label={o.orient === 'h' ? 'X (m)' : 'Y (m)'}>
            <NumIn value={o.orient === 'h' ? o.x : o.y} onChange={(v) => up(o.orient === 'h' ? { x: v } : { y: v })} />
          </Field>
        </div>
        <p className="meta">Drag it along the wall in the plan to reposition.</p>
        <div className="btn-row">
          <button className="danger" onClick={deleteSelection}>Delete</button>
        </div>
      </div>
    )
  }

  const f = p.furniture.find((f) => f.id === sel.id)
  if (!f) return null
  const def = CATALOG_MAP[f.kind]
  const up = (patch: Partial<typeof f>) => apply((q) => Object.assign(q.furniture.find((x) => x.id === f.id)!, patch))
  return (
    <div className="pad">
      <div className="insp-head">
        <i style={{ background: f.color }} />
        <h3>{def?.label}</h3>
      </div>
      <div className="meta">
        {def?.w.toFixed(2)} × {def?.d.toFixed(2)} × {def?.h.toFixed(2)} m (W×D×H)
      </div>
      <Field label="Colour / fabric">
        <div className="swatches">
          {['#6b7f99', '#9a7b6a', '#7d8a72', '#c9925b', '#b5838d', '#e0d6c8', '#3b3b3f', '#8d6e63', '#2f4858', '#d4a373'].map((c) => (
            <button key={c} className={`sw ${f.color === c ? 'on' : ''}`} style={{ background: c }} onClick={() => up({ color: c })} />
          ))}
          <input type="color" value={f.color} onChange={(e) => up({ color: e.target.value })} />
        </div>
      </Field>
      <Field label={`Rotation ${f.rot}°`}>
        <input type="range" min={0} max={345} step={15} value={f.rot} onChange={(e) => up({ rot: Number(e.target.value) })} />
      </Field>
      <div className="grid2">
        <Field label="X (m)"><NumIn value={f.x} step={0.05} onChange={(v) => up({ x: v })} /></Field>
        <Field label="Y (m)"><NumIn value={f.y} step={0.05} onChange={(v) => up({ y: v })} /></Field>
      </div>
      <div className="btn-row">
        <button
          onClick={() => {
            const id = Math.random().toString(36).slice(2, 9)
            apply((q) => void q.furniture.push({ ...f, id, x: f.x + 0.3, y: f.y + 0.3 }))
            select({ type: 'furniture', id })
          }}
        >
          Duplicate
        </button>
        <button className="danger" onClick={deleteSelection}>Delete</button>
      </div>
    </div>
  )
}

const badge = (h: number) => (h >= 4 ? 'hi' : h >= 1.5 ? 'mid' : 'lo')

function RoomCard({ ri, vastu }: { ri: RoomInsight; vastu: boolean }) {
  const select = useStore((s) => s.select)
  return (
    <div className="room-card" onClick={() => select({ type: 'room', id: ri.room.id })}>
      <div className="rc-head">
        <i style={{ background: ROOM_TYPE_MAP[ri.room.type].color }} />
        <b>{ri.room.name}</b>
        {useStore.getState().project.levels.length > 1 && <span className="lv-tag">{lvl(ri.room) === 0 ? 'G' : `L${lvl(ri.room)}`}</span>}
        <span className={`sun-badge ${badge(ri.total)}`}>☀ {ri.total.toFixed(1)} h</span>
      </div>
      <div className="sunbar" title={`Morning ${ri.morning.toFixed(1)} h · Afternoon ${ri.afternoon.toFixed(1)} h`}>
        <span className="am" style={{ width: `${Math.min(100, (ri.morning / 7) * 50)}%` }} />
        <span className="pm" style={{ width: `${Math.min(100, (ri.afternoon / 7) * 50)}%` }} />
      </div>
      <div className="rc-meta">
        {ri.windows.length ? ri.windows.map((w) => `${w.dir} window`).join(' · ') : 'No exterior windows'}
        {ri.bestWall && <> · best facade: <b>{DIR_LONG[ri.bestWall.dir]}</b></>}
      </div>
      <ul className="tips">
        {ri.tips.map((t, i) => (
          <li key={i} className={t.level}>{t.text}</li>
        ))}
      </ul>
      {vastu && (
        <div className={`vastu ${ri.vastuOk === true ? 'good' : ri.vastuOk === false ? 'warn' : ''}`}>
          <b>Vastu</b> {ri.vastuText}
        </div>
      )}
    </div>
  )
}

function SunInsights() {
  const p = useStore((s) => s.project)
  const date = useStore((s) => s.sun.date)
  const vastu = useStore((s) => s.vastu)
  const set = useStore((s) => s.set)
  const a = useMemo(() => analyse(p, date), [p, date])
  const goodEntrance = a.entrances.some((d) => ['N', 'NE', 'E'].includes(d))
  const dayLen = a.days.sunrise != null && a.days.sunset != null ? (a.days.sunset - a.days.sunrise) / 60 : null
  return (
    <div className="pad">
      <div className="day-strip">
        <div><span>Sunrise</span><b>{fmtTime(a.days.sunrise)}</b></div>
        <div><span>Solar noon</span><b>{fmtTime(a.days.noon)}</b></div>
        <div><span>Sunset</span><b>{fmtTime(a.days.sunset)}</b></div>
        <div><span>Daylight</span><b>{dayLen ? `${dayLen.toFixed(1)} h` : '—'}</b></div>
      </div>
      <label className="toggle">
        <input type="checkbox" checked={vastu} onChange={(e) => set({ vastu: e.target.checked })} />
        Show Vastu Shastra guidance
      </label>
      {vastu && a.entrances.length > 0 && (
        <div className={`vastu block ${goodEntrance ? 'good' : 'warn'}`}>
          <b>Main entrance</b> faces {a.entrances.map((d) => DIR_LONG[d]).join(', ')}.{' '}
          {goodEntrance ? 'North / East entrances are considered auspicious.' : 'Traditionally North, East or North-East entrances are preferred.'}
        </div>
      )}
      <p className="meta">
        Direct-sun hours through exterior windows on <b>{date}</b> (ignores shading by neighbours/trees). Change the date in the sun bar to compare seasons.
      </p>
      {a.rooms.map((ri) => <RoomCard key={ri.room.id} ri={ri} vastu={vastu} />)}
      {!a.rooms.length && <p className="meta">Add rooms with windows to see sunlight analysis.</p>}
      <p className="foot">Analysed in {a.ms.toFixed(1)} ms</p>
    </div>
  )
}

function Estimate() {
  const p = useStore((s) => s.project)
  const e = useMemo(() => estimate(p), [p])
  const row = (k: string, v: string, sub?: string) => (
    <tr>
      <td>{k}</td>
      <td>
        <b>{v}</b>
        {sub && <em>{sub}</em>}
      </td>
    </tr>
  )
  return (
    <div className="pad">
      <div className="kpis">
        <div><span>Built-up</span><b>{Math.round(e.builtUp * SQFT)}</b><em>ft²</em></div>
        <div><span>Coverage</span><b>{Math.round(e.coverage * 100)}</b><em>%</em></div>
        <div><span>Rooms</span><b>{p.rooms.length}</b><em>{e.furniture} items</em></div>
      </div>
      <h4>Areas</h4>
      <table className="est">
        <tbody>
          {row('Plot area', `${e.plotArea.toFixed(1)} m²`, `${Math.round(e.plotArea * SQFT)} ft²`)}
          {e.perLevel.map((l) => row(`Built-up · ${l.name}`, `${l.builtUp.toFixed(1)} m²`, `${Math.round(l.builtUp * SQFT)} ft²`))}
          {row('FAR (built-up ÷ plot)', (e.builtUp / e.plotArea).toFixed(2))}
          {row('Footprint', `${e.footprint.toFixed(1)} m²`, `${Math.round(e.footprint * SQFT)} ft²`)}
          {row('Open space', `${(e.plotArea - e.footprint).toFixed(1)} m²`)}
          {Object.entries(e.floorByMat).map(([m, a]) => row(`Flooring · ${m}`, `${a.toFixed(1)} m²`, `${Math.round(a * SQFT)} ft²`))}
        </tbody>
      </table>
      <h4>Foundation & structure</h4>
      <table className="est">
        <tbody>
          {row('Columns / footings', `${e.columns}`, '1.2×1.2 m pads')}
          {row('Footing concrete', `${e.footingConcrete.toFixed(2)} m³`)}
          {row('Plinth beam concrete', `${e.beamConcrete.toFixed(2)} m³`)}
          {row('Roof slab concrete', `${e.slabConcrete.toFixed(2)} m³`, `${(p.slabThickness * 1000).toFixed(0)} mm`)}
        </tbody>
      </table>
      <h4>Walls & finishes</h4>
      <table className="est">
        <tbody>
          {row('Exterior walls', `${e.extLen.toFixed(1)} m`, '230 mm')}
          {row('Partition walls', `${e.intLen.toFixed(1)} m`, '115 mm')}
          {row('Brickwork', `${e.brickVol.toFixed(1)} m³`, `≈ ${e.bricks.toLocaleString()} bricks`)}
          {row('Interior paint', `${e.paintArea.toFixed(0)} m²`)}
          {row('Exterior paint', `${e.exteriorPaint.toFixed(0)} m²`)}
          {row('Windows', `${e.windows}`, `${e.windowArea.toFixed(1)} m² glazing`)}
          {row('Doors', `${e.doors}`)}
          {row('Staircases', `${e.stairs}`)}
        </tbody>
      </table>
      <p className="foot">Indicative quantities for early planning only — get structural design & BOQ verified by a licensed engineer.</p>
    </div>
  )
}

export default function RightPanel() {
  const tab = useStore((s) => s.rightTab)
  const set = useStore((s) => s.set)
  return (
    <aside className="panel right">
      <div className="tabs">
        <button className={tab === 'inspect' ? 'on' : ''} onClick={() => set({ rightTab: 'inspect' })}>Inspect</button>
        <button className={tab === 'sun' ? 'on' : ''} onClick={() => set({ rightTab: 'sun' })}>Sun & Vastu</button>
        <button className={tab === 'estimate' ? 'on' : ''} onClick={() => set({ rightTab: 'estimate' })}>Estimate</button>
      </div>
      <div className="scroll">
        {tab === 'inspect' && <Inspect />}
        {tab === 'sun' && <SunInsights />}
        {tab === 'estimate' && <Estimate />}
      </div>
    </aside>
  )
}
