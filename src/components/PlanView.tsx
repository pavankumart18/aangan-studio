import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as RPE } from 'react'
import { uid, useStore } from '../store'
import { buildWalls, G, roomAt, snap, EXT_T, INT_T, bearingToVec, type WallSegment } from '../walls'
import { CATALOG_MAP, ROOM_TYPE_MAP } from '../catalog'
import { sunPosition } from '../sun'
import { planToTrue } from '../insights'
import type { Furniture, OpeningKind, Project, Room } from '../types'
import { onLevel, lvl, floorToFloor } from '../levels'
import { roomViewpoint } from '../camera'

type Pt = { x: number; y: number }
type Drag =
  | { mode: 'pan'; sx: number; sy: number; ox: number; oy: number }
  | { mode: 'moveRoom'; id: string; start: Pt; orig: Pt; furn: { id: string; x: number; y: number }[]; ops: { id: string; x: number; y: number }[] }
  | { mode: 'resize'; id: string; corner: 'nw' | 'ne' | 'sw' | 'se'; orig: Room }
  | { mode: 'moveFurn'; id: string; start: Pt; orig: Pt }
  | { mode: 'moveOpening'; id: string; start: Pt; orig: Pt }
  | { mode: 'draw'; a: Pt; b: Pt }

const ACCENT = '#e07a3f'
export const fmtFt = (m: number) => {
  const inches = Math.round(m * 39.3701)
  return `${Math.floor(inches / 12)}'${inches % 12}"`
}

function hull(points: Pt[]): Pt[] {
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y)
  const cross = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
  const lower: Pt[] = []
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop()
    lower.push(p)
  }
  const upper: Pt[] = []
  for (const p of pts.reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop()
    upper.push(p)
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1))
}

interface Edge {
  orient: 'h' | 'v'
  fixed: number
  a0: number
  a1: number
}

function nearestEdge(p: Project, pt: Pt, tol: number): (Edge & { along: number }) | null {
  let best: (Edge & { along: number; dist: number }) | null = null
  for (const r of p.rooms) {
    const edges: Edge[] = [
      { orient: 'h', fixed: r.y, a0: r.x, a1: r.x + r.w },
      { orient: 'h', fixed: r.y + r.d, a0: r.x, a1: r.x + r.w },
      { orient: 'v', fixed: r.x, a0: r.y, a1: r.y + r.d },
      { orient: 'v', fixed: r.x + r.w, a0: r.y, a1: r.y + r.d },
    ]
    for (const e of edges) {
      const along = e.orient === 'h' ? pt.x : pt.y
      const off = e.orient === 'h' ? pt.y : pt.x
      if (along < e.a0 - 0.05 || along > e.a1 + 0.05) continue
      const dist = Math.abs(off - e.fixed)
      if (dist < tol && (!best || dist < best.dist)) best = { ...e, along, dist }
    }
  }
  return best
}

function openingPreview(p: Project, pt: Pt, kind: OpeningKind, tol: number) {
  const e = nearestEdge(p, pt, tol)
  if (!e) return null
  const len = Math.min(kind === 'window' ? 1.5 : 1, e.a1 - e.a0)
  const start = Math.max(e.a0, Math.min(e.a1 - len, snap(e.along - len / 2)))
  const clash = p.openings.some(
    (o) => o.orient === e.orient && Math.abs((o.orient === 'h' ? o.y : o.x) - e.fixed) < 1e-6 && start < (o.orient === 'h' ? o.x : o.y) + o.length && start + len > (o.orient === 'h' ? o.x : o.y),
  )
  return {
    kind,
    orient: e.orient,
    x: e.orient === 'h' ? start : e.fixed,
    y: e.orient === 'h' ? e.fixed : start,
    length: len,
    clash,
  }
}

function FurnTop({ f, selected }: { f: Furniture; selected: boolean }) {
  const def = CATALOG_MAP[f.kind]
  if (!def) return null
  const { w, d } = def
  const stroke = selected ? ACCENT : '#3b3f46'
  const sw = selected ? 0.05 : 0.025
  const fill = f.color
  const base = <rect x={-w / 2} y={-d / 2} width={w} height={d} rx={0.04} fill={fill} fillOpacity={0.85} stroke={stroke} strokeWidth={sw} />
  let detail = null
  switch (f.kind) {
    case 'sofa3':
    case 'sofa2':
    case 'armchair':
    case 'lsofa':
      detail = (
        <>
          <rect x={-w / 2} y={-d / 2} width={w} height={0.2} fill="#000" fillOpacity={0.18} />
          <rect x={-w / 2} y={-d / 2} width={0.18} height={f.kind === 'lsofa' ? 0.9 : d} fill="#000" fillOpacity={0.14} />
          {f.kind !== 'lsofa' && <rect x={w / 2 - 0.18} y={-d / 2} width={0.18} height={d} fill="#000" fillOpacity={0.14} />}
        </>
      )
      break
    case 'bedq':
    case 'beds':
      detail = (
        <>
          <rect x={-w / 2} y={-d / 2} width={w} height={0.08} fill="#5d4037" />
          {(w > 1.2 ? [-w / 4, w / 4] : [0]).map((x) => (
            <rect key={x} x={x - (w > 1.2 ? w / 4 - 0.08 : w / 2 - 0.12)} y={-d / 2 + 0.15} width={w > 1.2 ? w / 2 - 0.16 : w - 0.24} height={0.35} rx={0.08} fill="#fff" stroke="#999" strokeWidth={0.015} />
          ))}
          <rect x={-w / 2} y={-d / 2 + d * 0.38} width={w} height={d * 0.62} fill="#000" fillOpacity={0.1} />
        </>
      )
      break
    case 'dining6':
    case 'dining4': {
      const per = f.kind === 'dining6' ? 3 : 2
      detail = (
        <>
          {Array.from({ length: per }, (_, i) => {
            const x = -w / 2 + (w / per) * (i + 0.5)
            return (
              <g key={i}>
                <rect x={x - 0.21} y={-d / 2 - 0.4} width={0.42} height={0.38} rx={0.05} fill="#6d4c41" fillOpacity={0.7} />
                <rect x={x - 0.21} y={d / 2 + 0.02} width={0.42} height={0.38} rx={0.05} fill="#6d4c41" fillOpacity={0.7} />
              </g>
            )
          })}
        </>
      )
      break
    }
    case 'toilet':
      detail = (
        <>
          <rect x={-w / 2} y={-d / 2} width={w} height={0.18} fill="#ddd" stroke="#888" strokeWidth={0.015} />
          <ellipse cx={0} cy={0.1} rx={w / 2 - 0.02} ry={d / 2 - 0.12} fill="#fff" stroke="#888" strokeWidth={0.015} />
        </>
      )
      break
    case 'plant':
      detail = <circle r={w / 2} fill="#66bb6a" stroke="#2e7d32" strokeWidth={0.02} />
      break
    case 'tv':
      detail = <rect x={-0.7} y={-d / 2} width={1.4} height={0.06} fill="#111" />
      break
    case 'counter':
      detail = (
        <>
          <rect x={-w / 4 - 0.27} y={-d / 2 + 0.1} width={0.54} height={0.38} rx={0.05} fill="#90a4ae" />
          {[-0.14, 0.14].flatMap((x) => [-0.1, 0.1].map((y) => <circle key={`${x}${y}`} cx={w / 4 + x} cy={y} r={0.07} fill="none" stroke="#222" strokeWidth={0.02} />))}
        </>
      )
      break
    case 'stair-straight':
    case 'stair-u': {
      const u = f.kind === 'stair-u'
      const n = 19
      const per = u ? Math.ceil(n / 2) : n
      const run = u ? d - w / 2 : d
      const flights = u ? [[-w / 2, 0], [0, w / 2]] : [[-w / 2, w / 2]]
      return (
        <>
          <rect x={-w / 2} y={-d / 2} width={w} height={d} fill="#f1ede6" stroke={stroke} strokeWidth={sw} />
          {flights.flatMap(([x0, x1], fi) =>
            Array.from({ length: per - 1 }, (_, i) => {
              const yy = d / 2 - (run / per) * (i + 1)
              return <line key={`${fi}-${i}`} x1={x0} y1={yy} x2={x1} y2={yy} stroke="#6b6b6b" strokeWidth={0.015} />
            }),
          )}
          {u && <line x1={0} y1={d / 2} x2={0} y2={-d / 2 + w / 2} stroke="#3b3f46" strokeWidth={0.03} />}
          <path d={u ? `M ${-w / 4} ${d / 2 - 0.2} L ${-w / 4} ${-d / 2 + w / 4} L ${w / 4} ${-d / 2 + w / 4} L ${w / 4} ${d / 2 - 0.35}` : `M 0 ${d / 2 - 0.2} L 0 ${-d / 2 + 0.3}`} fill="none" stroke={ACCENT} strokeWidth={0.04} />
          <text x={u ? -w / 4 : 0} y={d / 2 - 0.05} textAnchor="middle" fontSize={0.2} fill="#3b3f46" fontWeight={700}>UP</text>
        </>
      )
    }
    case 'rug':
      return (
        <g opacity={0.6}>
          <rect x={-w / 2} y={-d / 2} width={w} height={d} fill={fill} stroke={stroke} strokeWidth={sw} strokeDasharray="0.1 0.06" />
        </g>
      )
  }
  return (
    <>
      {base}
      {detail}
      {/* front indicator */}
      <line x1={-0.08} y1={d / 2 - 0.04} x2={0.08} y2={d / 2 - 0.04} stroke="#000" strokeOpacity={0.35} strokeWidth={0.03} />
    </>
  )
}

function WallShape({ s, sunlit }: { s: WallSegment; sunlit: boolean }) {
  const t = s.exterior ? EXT_T : INT_T
  const L = s.end - s.start
  const ext = s.type === 'wall' ? t / 2 : 0
  const rect = s.orient === 'h' ? { x: s.start - ext, y: s.fixed - t / 2, width: L + 2 * ext, height: t } : { x: s.fixed - t / 2, y: s.start - ext, width: t, height: L + 2 * ext }
  if (s.type === 'wall') return <rect {...rect} fill="#2f333b" />
  if (s.type === 'window')
    return (
      <g>
        <rect {...rect} fill={sunlit ? '#fff3c4' : '#f3f8fb'} stroke="#2f333b" strokeWidth={0.02} />
        {s.orient === 'h' ? (
          <line x1={s.start} y1={s.fixed} x2={s.end} y2={s.fixed} stroke="#3a8fd6" strokeWidth={0.03} />
        ) : (
          <line x1={s.fixed} y1={s.start} x2={s.fixed} y2={s.end} stroke="#3a8fd6" strokeWidth={0.03} />
        )}
      </g>
    )
  // door: swing arc into the first room
  const nb = s.normalBearing != null ? (s.normalBearing + 180) % 360 : s.orient === 'h' ? 180 : 90
  const [nx, ny] = bearingToVec(nb)
  const hinge = s.orient === 'h' ? { x: s.start, y: s.fixed } : { x: s.fixed, y: s.start }
  const tip = s.orient === 'h' ? { x: s.start, y: s.fixed + ny * L } : { x: s.fixed + nx * L, y: s.start }
  const end = s.orient === 'h' ? { x: s.end, y: s.fixed } : { x: s.fixed, y: s.end }
  const sweep = s.orient === 'h' ? (ny > 0 ? 0 : 1) : nx > 0 ? 1 : 0
  return (
    <g>
      <rect {...rect} fill="#fff" />
      <line x1={hinge.x} y1={hinge.y} x2={tip.x} y2={tip.y} stroke="#6d4c33" strokeWidth={0.04} />
      <path d={`M ${tip.x} ${tip.y} A ${L} ${L} 0 0 ${sweep} ${end.x} ${end.y}`} fill="none" stroke="#6d4c33" strokeWidth={0.015} strokeDasharray="0.06 0.04" />
    </g>
  )
}

export default function PlanView() {
  const full = useStore((s) => s.project)
  const activeLevel = useStore((s) => s.activeLevel)
  const p = useMemo(() => onLevel(full, activeLevel), [full, activeLevel])
  const below = useMemo(() => (activeLevel > 0 ? onLevel(full, activeLevel - 1) : null), [full, activeLevel])
  const tool = useStore((s) => s.tool)
  const drawType = useStore((s) => s.drawType)
  const sel = useStore((s) => s.selection)
  const sun = useStore((s) => s.sun)
  const camView = useStore((s) => s.camView)
  const { apply, checkpoint, select } = useStore.getState()

  const wrap = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const [size, setSize] = useState({ w: 800, h: 600 })
  const [view, setView] = useState({ s: 30, ox: 40, oy: 40 })
  const [hover, setHover] = useState<Pt | null>(null)
  const drag = useRef<Drag | null>(null)
  const [draft, setDraft] = useState<{ a: Pt; b: Pt } | null>(null)

  const fit = useCallback(() => {
    const pad = 60
    const s = Math.min((size.w - pad * 2) / p.plot.width, (size.h - pad * 2) / p.plot.depth)
    setView({ s, ox: (size.w - p.plot.width * s) / 2, oy: (size.h - p.plot.depth * s) / 2 })
  }, [size.w, size.h, p.plot.width, p.plot.depth])

  useLayoutEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  useEffect(fit, [fit])

  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      const mx = e.clientX - r.left
      const my = e.clientY - r.top
      setView((v) => {
        const k = Math.exp(-e.deltaY * 0.0015)
        const s = Math.max(5, Math.min(400, v.s * k))
        return { s, ox: mx - ((mx - v.ox) * s) / v.s, oy: my - ((my - v.oy) * s) / v.s }
      })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const walls = useMemo(() => buildWalls(p), [p])
  const sunPos = useMemo(() => sunPosition(p.plot, sun.date, sun.minutes), [p.plot, sun.date, sun.minutes])

  const toPlan = (e: { clientX: number; clientY: number }): Pt => {
    const r = svgRef.current!.getBoundingClientRect()
    return { x: (e.clientX - r.left - view.ox) / view.s, y: (e.clientY - r.top - view.oy) / view.s }
  }

  const begin = (e: RPE, d: Drag) => {
    e.stopPropagation()
    svgRef.current?.setPointerCapture(e.pointerId)
    drag.current = d
  }

  const onBgDown = (e: RPE<SVGSVGElement>) => {
    const pt = toPlan(e)
    if (e.button === 1 || e.button === 2 || tool === 'select') {
      if (tool === 'select' && e.button === 0) select(null)
      begin(e, { mode: 'pan', sx: e.clientX, sy: e.clientY, ox: view.ox, oy: view.oy })
      return
    }
    if (tool === 'room') {
      const a = { x: snap(pt.x), y: snap(pt.y) }
      setDraft({ a, b: a })
      begin(e, { mode: 'draw', a, b: a })
      return
    }
    if (tool === 'window' || tool === 'door') {
      const prev = openingPreview(p, pt, tool, Math.max(0.35, 14 / view.s))
      if (prev && !prev.clash) {
        const id = uid()
        apply((q) => {
          q.openings.push({ id, kind: prev.kind, orient: prev.orient, x: prev.x, y: prev.y, length: prev.length, level: activeLevel })
        })
        select({ type: 'opening', id })
      }
    }
  }

  const onMove = (e: RPE<SVGSVGElement>) => {
    const pt = toPlan(e)
    setHover(pt)
    const d = drag.current
    if (!d) return
    if (d.mode === 'pan') {
      setView((v) => ({ ...v, ox: d.ox + e.clientX - d.sx, oy: d.oy + e.clientY - d.sy }))
    } else if (d.mode === 'draw') {
      d.b = { x: snap(pt.x), y: snap(pt.y) }
      setDraft({ a: d.a, b: d.b })
    } else if (d.mode === 'moveRoom') {
      const dx = snap(pt.x - d.start.x)
      const dy = snap(pt.y - d.start.y)
      apply((q) => {
        const r = q.rooms.find((r) => r.id === d.id)
        if (!r) return
        r.x = d.orig.x + dx
        r.y = d.orig.y + dy
        for (const f of d.furn) {
          const qf = q.furniture.find((x) => x.id === f.id)
          if (qf) {
            qf.x = f.x + dx
            qf.y = f.y + dy
          }
        }
        for (const o of d.ops) {
          const qo = q.openings.find((x) => x.id === o.id)
          if (qo) {
            qo.x = o.x + dx
            qo.y = o.y + dy
          }
        }
      }, false)
    } else if (d.mode === 'resize') {
      const sx = snap(pt.x)
      const sy = snap(pt.y)
      apply((q) => {
        const r = q.rooms.find((r) => r.id === d.id)
        if (!r) return
        const o = d.orig
        let x0 = o.x, y0 = o.y, x1 = o.x + o.w, y1 = o.y + o.d
        if (d.corner.includes('w')) x0 = Math.min(sx, x1 - 1)
        if (d.corner.includes('e')) x1 = Math.max(sx, x0 + 1)
        if (d.corner.includes('n')) y0 = Math.min(sy, y1 - 1)
        if (d.corner.includes('s')) y1 = Math.max(sy, y0 + 1)
        Object.assign(r, { x: x0, y: y0, w: x1 - x0, d: y1 - y0 })
      }, false)
    } else if (d.mode === 'moveFurn') {
      apply((q) => {
        const f = q.furniture.find((f) => f.id === d.id)
        if (!f) return
        f.x = snap(d.orig.x + pt.x - d.start.x, 0.05)
        f.y = snap(d.orig.y + pt.y - d.start.y, 0.05)
      }, false)
    } else if (d.mode === 'moveOpening') {
      apply((q) => {
        const o = q.openings.find((o) => o.id === d.id)
        if (!o) return
        if (o.orient === 'h') o.x = snap(d.orig.x + pt.x - d.start.x)
        else o.y = snap(d.orig.y + pt.y - d.start.y)
      }, false)
    }
  }

  const onUp = (e: RPE<SVGSVGElement>) => {
    const d = drag.current
    drag.current = null
    svgRef.current?.releasePointerCapture?.(e.pointerId)
    if (d?.mode === 'draw') {
      setDraft(null)
      const x = Math.min(d.a.x, d.b.x), y = Math.min(d.a.y, d.b.y)
      const w = Math.abs(d.b.x - d.a.x), dd = Math.abs(d.b.y - d.a.y)
      if (w >= 1 && dd >= 1) {
        const t = ROOM_TYPE_MAP[drawType]
        const count = p.rooms.filter((r) => r.type === drawType).length
        const id = uid()
        apply((q) => {
          q.rooms.push({ id, name: count ? `${t.label} ${count + 1}` : t.label, type: drawType, x, y, w, d: dd, floor: t.floor, wallColor: '#f5f1ea', level: activeLevel })
        })
        select({ type: 'room', id })
      }
    }
  }

  const startRoomMove = (e: RPE, r: Room) => {
    if (tool !== 'select') return
    select({ type: 'room', id: r.id })
    checkpoint()
    const onEdge = (o: Project['openings'][number]) =>
      o.orient === 'h'
        ? (Math.abs(o.y - r.y) < 1e-6 || Math.abs(o.y - r.y - r.d) < 1e-6) && o.x >= r.x - 1e-6 && o.x + o.length <= r.x + r.w + 1e-6
        : (Math.abs(o.x - r.x) < 1e-6 || Math.abs(o.x - r.x - r.w) < 1e-6) && o.y >= r.y - 1e-6 && o.y + o.length <= r.y + r.d + 1e-6
    begin(e, {
      mode: 'moveRoom',
      id: r.id,
      start: toPlan(e),
      orig: { x: r.x, y: r.y },
      furn: p.furniture.filter((f) => roomAt(p, f.x, f.y)?.id === r.id).map((f) => ({ id: f.id, x: f.x, y: f.y })),
      ops: p.openings.filter(onEdge).map((o) => ({ id: o.id, x: o.x, y: o.y })),
    })
  }

  const preview = (tool === 'window' || tool === 'door') && hover ? openingPreview(p, hover, tool, Math.max(0.35, 14 / view.s)) : null
  const fs = (k: number) => k / view.s // px → metres

  // sun in plan space
  const sunPlanBearing = sunPos.bearing + p.plot.northDeg
  const [sx, sy] = bearingToVec(sunPlanBearing)
  const daylight = sunPos.altitude > 0.02
  const buildingH = full.levels.length * floorToFloor(full) + 0.45
  const shadowLen = daylight ? Math.min(30, buildingH / Math.tan(sunPos.altitude)) : 0
  const isSunlit = (s: WallSegment) => {
    if (!daylight || s.type !== 'window' || s.normalBearing == null) return false
    const tb = planToTrue(s.normalBearing, p.plot.northDeg)
    const diff = Math.abs((((sunPos.bearing - tb) % 360) + 540) % 360 - 180)
    return diff < 80
  }

  const selRoom = sel?.type === 'room' ? p.rooms.find((r) => r.id === sel.id) : undefined
  const cursor = tool === 'select' ? (drag.current?.mode === 'pan' ? 'grabbing' : 'default') : 'crosshair'

  return (
    <div ref={wrap} className="plan-wrap">
      <svg
        ref={svgRef}
        width={size.w}
        height={size.h}
        style={{ cursor }}
        onPointerDown={onBgDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerLeave={() => setHover(null)}
        onContextMenu={(e) => e.preventDefault()}
      >
        <defs>
          <pattern id="grid-minor" width={G * 2} height={G * 2} patternUnits="userSpaceOnUse">
            <path d={`M ${G * 2} 0 L 0 0 0 ${G * 2}`} fill="none" stroke="#d8d3c8" strokeWidth={0.01} />
          </pattern>
          <pattern id="grid-major" width={1} height={1} patternUnits="userSpaceOnUse">
            <rect width={1} height={1} fill="url(#grid-minor)" />
            <path d="M 1 0 L 0 0 0 1" fill="none" stroke="#c9c2b4" strokeWidth={0.02} />
          </pattern>
          <pattern id="hatch" width={0.3} height={0.3} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1={0} y1={0} x2={0} y2={0.3} stroke="#7a9a5a" strokeWidth={0.04} strokeOpacity={0.35} />
          </pattern>
        </defs>
        <g transform={`translate(${view.ox} ${view.oy}) scale(${view.s})`}>
          <rect x={-200} y={-200} width={400 + p.plot.width} height={400 + p.plot.depth} fill="url(#grid-major)" />
          {/* plot */}
          <rect x={0} y={0} width={p.plot.width} height={p.plot.depth} fill="#e9eedf" />
          <rect x={0} y={0} width={p.plot.width} height={p.plot.depth} fill="url(#hatch)" />
          <rect x={0} y={0} width={p.plot.width} height={p.plot.depth} fill="none" stroke="#5f7d45" strokeWidth={fs(2)} strokeDasharray={`${fs(8)} ${fs(5)}`} />
          <text x={p.plot.width / 2} y={-fs(12)} textAnchor="middle" fontSize={fs(12)} className="dim">
            {p.plot.width.toFixed(2)} m · {fmtFt(p.plot.width)}
          </text>
          <text x={-fs(12)} y={p.plot.depth / 2} textAnchor="middle" fontSize={fs(12)} className="dim" transform={`rotate(-90 ${-fs(12)} ${p.plot.depth / 2})`}>
            {p.plot.depth.toFixed(2)} m · {fmtFt(p.plot.depth)}
          </text>

          {/* building shadows */}
          {daylight &&
            full.rooms.filter((r) => lvl(r) === 0).map((r) => {
              const pts = [
                { x: r.x, y: r.y },
                { x: r.x + r.w, y: r.y },
                { x: r.x + r.w, y: r.y + r.d },
                { x: r.x, y: r.y + r.d },
              ]
              const all = pts.concat(pts.map((q) => ({ x: q.x - sx * shadowLen, y: q.y - sy * shadowLen })))
              return <polygon key={r.id} points={hull(all).map((q) => `${q.x},${q.y}`).join(' ')} fill="#1d2b3a" fillOpacity={0.09} />
            })}

          {/* floor below (ghost) */}
          {below && (
            <g style={{ pointerEvents: 'none' }}>
              {below.rooms.map((r) => (
                <rect key={r.id} x={r.x} y={r.y} width={r.w} height={r.d} fill="none" stroke="#9aa0a8" strokeWidth={fs(1)} strokeDasharray={`${fs(4)} ${fs(3)}`} />
              ))}
              {below.furniture
                .filter((f) => f.kind.startsWith('stair'))
                .map((f) => {
                  const def = CATALOG_MAP[f.kind]
                  return (
                    <g key={f.id} transform={`translate(${f.x} ${f.y}) rotate(${f.rot})`}>
                      <rect x={-def.w / 2} y={-def.d / 2} width={def.w} height={def.d} fill="#ffffff" fillOpacity={0.6} stroke="#555" strokeWidth={fs(1.5)} strokeDasharray={`${fs(5)} ${fs(3)}`} />
                      <line x1={-def.w / 2} y1={-def.d / 2} x2={def.w / 2} y2={def.d / 2} stroke="#777" strokeWidth={fs(1)} />
                      <text y={0.08} textAnchor="middle" fontSize={0.22} fill="#333" fontWeight={700}>DN</text>
                    </g>
                  )
                })}
            </g>
          )}

          {/* rooms */}
          {p.rooms.map((r) => {
            const t = ROOM_TYPE_MAP[r.type]
            const label = Math.min(r.w, r.d)
            return (
              <g key={r.id} onPointerDown={(e) => tool === 'select' && startRoomMove(e, r)} style={{ cursor: tool === 'select' ? 'move' : undefined }}>
                <rect x={r.x} y={r.y} width={r.w} height={r.d} fill={t.color} fillOpacity={0.5} />
                <text x={r.x + r.w / 2} y={r.y + r.d / 2 - Math.min(0.12, label * 0.04)} textAnchor="middle" fontSize={Math.min(0.42, label * 0.15)} className="room-name">
                  {r.name}
                </text>
                <text x={r.x + r.w / 2} y={r.y + r.d / 2 + Math.min(0.36, label * 0.12)} textAnchor="middle" fontSize={Math.min(0.26, label * 0.09)} className="room-area">
                  {(r.w * r.d).toFixed(1)} m² · {Math.round(r.w * r.d * 10.7639)} ft²
                </text>
                <g
                  className="eye-btn"
                  transform={`translate(${r.x + r.w - fs(16)} ${r.y + fs(16)})`}
                  onPointerDown={(e) => {
                    e.stopPropagation()
                    const st = useStore.getState()
                    st.set({ camView: roomViewpoint(full, r), viewMode: st.viewMode === '2d' ? 'split' : st.viewMode })
                  }}
                >
                  <title>View from inside {r.name}</title>
                  <circle r={fs(10)} fill="#fff" stroke="#c9c2b4" strokeWidth={fs(1)} />
                  <path d={`M ${-fs(6)} 0 Q 0 ${-fs(6)} ${fs(6)} 0 Q 0 ${fs(6)} ${-fs(6)} 0 Z`} fill="none" stroke="#3b3f46" strokeWidth={fs(1.3)} />
                  <circle r={fs(2.2)} fill="#3b3f46" />
                </g>
              </g>
            )
          })}

          {/* walls */}
          <g style={{ pointerEvents: 'none' }}>
            {walls.filter((s) => s.type === 'wall').map((s) => <WallShape key={s.key} s={s} sunlit={false} />)}
          </g>
          {walls
            .filter((s) => s.type !== 'wall')
            .map((s) => (
              <g
                key={s.key}
                style={{ cursor: tool === 'select' ? 'ew-resize' : undefined }}
                onPointerDown={(e) => {
                  if (tool !== 'select' || !s.openingId) return
                  const o = p.openings.find((o) => o.id === s.openingId)
                  if (!o) return
                  select({ type: 'opening', id: o.id })
                  checkpoint()
                  begin(e, { mode: 'moveOpening', id: o.id, start: toPlan(e), orig: { x: o.x, y: o.y } })
                }}
              >
                <WallShape s={s} sunlit={isSunlit(s)} />
                {sel?.type === 'opening' && sel.id === s.openingId && (
                  <rect
                    x={s.orient === 'h' ? s.start : s.fixed - 0.2}
                    y={s.orient === 'h' ? s.fixed - 0.2 : s.start}
                    width={s.orient === 'h' ? s.end - s.start : 0.4}
                    height={s.orient === 'h' ? 0.4 : s.end - s.start}
                    fill="none"
                    stroke={ACCENT}
                    strokeWidth={fs(2)}
                  />
                )}
              </g>
            ))}

          {/* furniture */}
          {p.furniture.map((f) => {
            const selected = sel?.type === 'furniture' && sel.id === f.id
            return (
              <g
                key={f.id}
                transform={`translate(${f.x} ${f.y}) rotate(${f.rot})`}
                style={{ cursor: tool === 'select' ? 'grab' : undefined }}
                onPointerDown={(e) => {
                  if (tool !== 'select') return
                  select({ type: 'furniture', id: f.id })
                  checkpoint()
                  begin(e, { mode: 'moveFurn', id: f.id, start: toPlan(e), orig: { x: f.x, y: f.y } })
                }}
              >
                <FurnTop f={f} selected={selected} />
              </g>
            )
          })}

          {/* selected room handles + dims */}
          {selRoom && tool === 'select' && (
            <g>
              <rect x={selRoom.x} y={selRoom.y} width={selRoom.w} height={selRoom.d} fill="none" stroke={ACCENT} strokeWidth={fs(2)} strokeDasharray={`${fs(6)} ${fs(4)}`} style={{ pointerEvents: 'none' }} />
              <text x={selRoom.x + selRoom.w / 2} y={selRoom.y - fs(18)} textAnchor="middle" fontSize={fs(11)} className="dim accent">
                {selRoom.w.toFixed(2)} m ({fmtFt(selRoom.w)})
              </text>
              <text x={selRoom.x + selRoom.w + fs(18)} y={selRoom.y + selRoom.d / 2} textAnchor="middle" fontSize={fs(11)} className="dim accent" transform={`rotate(90 ${selRoom.x + selRoom.w + fs(18)} ${selRoom.y + selRoom.d / 2})`}>
                {selRoom.d.toFixed(2)} m ({fmtFt(selRoom.d)})
              </text>
              {(
                [
                  ['nw', selRoom.x, selRoom.y],
                  ['ne', selRoom.x + selRoom.w, selRoom.y],
                  ['sw', selRoom.x, selRoom.y + selRoom.d],
                  ['se', selRoom.x + selRoom.w, selRoom.y + selRoom.d],
                ] as const
              ).map(([c, x, y]) => (
                <rect
                  key={c}
                  x={x - fs(6)}
                  y={y - fs(6)}
                  width={fs(12)}
                  height={fs(12)}
                  fill="#fff"
                  stroke={ACCENT}
                  strokeWidth={fs(2)}
                  style={{ cursor: c === 'nw' || c === 'se' ? 'nwse-resize' : 'nesw-resize' }}
                  onPointerDown={(e) => {
                    checkpoint()
                    begin(e, { mode: 'resize', id: selRoom.id, corner: c, orig: { ...selRoom } })
                  }}
                />
              ))}
            </g>
          )}

          {/* drafts */}
          {draft && (
            <g style={{ pointerEvents: 'none' }}>
              <rect
                x={Math.min(draft.a.x, draft.b.x)}
                y={Math.min(draft.a.y, draft.b.y)}
                width={Math.abs(draft.b.x - draft.a.x)}
                height={Math.abs(draft.b.y - draft.a.y)}
                fill={ROOM_TYPE_MAP[drawType].color}
                fillOpacity={0.5}
                stroke={ACCENT}
                strokeWidth={fs(2)}
              />
              <text x={(draft.a.x + draft.b.x) / 2} y={(draft.a.y + draft.b.y) / 2} textAnchor="middle" fontSize={fs(13)} className="dim accent">
                {Math.abs(draft.b.x - draft.a.x).toFixed(2)} × {Math.abs(draft.b.y - draft.a.y).toFixed(2)} m
              </text>
            </g>
          )}
          {preview && (
            <rect
              style={{ pointerEvents: 'none' }}
              x={preview.orient === 'h' ? preview.x : preview.x - 0.18}
              y={preview.orient === 'h' ? preview.y - 0.18 : preview.y}
              width={preview.orient === 'h' ? preview.length : 0.36}
              height={preview.orient === 'h' ? 0.36 : preview.length}
              fill={preview.clash ? '#e53935' : preview.kind === 'window' ? '#4fc3f7' : '#a1887f'}
              fillOpacity={0.6}
              stroke={preview.clash ? '#e53935' : ACCENT}
              strokeWidth={fs(1.5)}
            />
          )}
          {tool === 'room' && hover && !draft && <circle cx={snap(hover.x)} cy={snap(hover.y)} r={fs(4)} fill={ACCENT} style={{ pointerEvents: 'none' }} />}

          {/* viewer position when in a room viewpoint */}
          {camView && camView.level === activeLevel && (
            <g style={{ pointerEvents: 'none' }} transform={`translate(${camView.x} ${camView.y})`}>
              {(() => {
                const look = camView.look ?? { x: camView.x, y: camView.y - 1 }
                const a = Math.atan2(look.y - camView.y, look.x - camView.x)
                const L = 2.2, h = 0.6
                const p1 = [Math.cos(a - h) * L, Math.sin(a - h) * L]
                const p2 = [Math.cos(a + h) * L, Math.sin(a + h) * L]
                return <path d={`M 0 0 L ${p1[0]} ${p1[1]} A ${L} ${L} 0 0 1 ${p2[0]} ${p2[1]} Z`} fill={ACCENT} fillOpacity={0.18} stroke={ACCENT} strokeWidth={fs(1)} />
              })()}
              <circle r={fs(6)} fill={ACCENT} stroke="#fff" strokeWidth={fs(2)} />
            </g>
          )}

          {/* sun ray indicator */}
          {daylight && (
            <g style={{ pointerEvents: 'none' }}>
              {(() => {
                const cx = p.plot.width / 2, cy = p.plot.depth / 2
                const R = Math.max(p.plot.width, p.plot.depth) / 2 + 1.6
                const ox = cx + sx * R, oy = cy + sy * R
                return (
                  <>
                    <line x1={ox} y1={oy} x2={cx + sx * (R - 1.2)} y2={cy + sy * (R - 1.2)} stroke="#f9a825" strokeWidth={fs(3)} markerEnd="" />
                    <circle cx={ox} cy={oy} r={fs(11)} fill="#ffd54f" stroke="#f9a825" strokeWidth={fs(2)} />
                  </>
                )
              })()}
            </g>
          )}
        </g>
      </svg>

      {/* overlays */}
      <div className="north-arrow" title="Drag the North slider in the Plot panel to rotate">
        <svg width={54} height={54} viewBox="-27 -27 54 54">
          <circle r={25} fill="#fff" stroke="#d6cfc2" />
          <g transform={`rotate(${p.plot.northDeg})`}>
            <path d="M0 -19 L7 6 L0 2 L-7 6 Z" fill={ACCENT} />
          </g>
        </svg>
        <span>N</span>
      </div>
      <div className="plan-hud">
        <button className="ghost sm" onClick={fit}>Fit</button>
        <span>{hover ? `${hover.x.toFixed(2)}, ${hover.y.toFixed(2)} m` : 'Scroll to zoom · drag to pan'}</span>
        {tool === 'room' && <span className="hint">Drag to draw a {ROOM_TYPE_MAP[drawType].label.toLowerCase()}</span>}
        {(tool === 'window' || tool === 'door') && <span className="hint">Click on a wall to add a {tool}</span>}
      </div>
    </div>
  )
}
