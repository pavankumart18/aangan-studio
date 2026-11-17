import type { Furniture, Project, Room } from './types'
import { CATALOG_MAP } from './catalog'
import { buildWalls, bearingToVec } from './walls'
import { onLevel, lvl } from './levels'
import { planToTrue } from './insights'
import { dirName, DIR_LONG, sunPosition, type Dir8 } from './sun'
import { STYLES } from './styles'

/**
 * Rule-based interior layout engine.
 * Places catalogue items against walls, respecting door swings, windows, circulation clearances,
 * sun exposure (glare / heat) and traditional Vastu orientation preferences.
 */

type Side = 'top' | 'bottom' | 'left' | 'right'
export interface Wall {
  side: Side
  a0: number
  a1: number
  doors: [number, number][]
  windows: [number, number][]
  exterior: boolean
  trueBearing: number // outward facing direction of this wall (true north)
  dir: Dir8
  sunHours: number
}
interface Rect {
  x0: number
  y0: number
  x1: number
  y1: number
}
export interface LayoutResult {
  items: Furniture[]
  notes: string[]
}

const GAP = 0.06 // distance from wall face
const SIDE_BEARING: Record<Side, number> = { top: 0, right: 90, bottom: 180, left: 270 }
const ROT_FOR_SIDE: Record<Side, number> = { top: 0, bottom: 180, left: 270, right: 90 }

const overlap = (a: Rect, b: Rect, pad = 0) => a.x0 < b.x1 + pad && a.x1 > b.x0 - pad && a.y0 < b.y1 + pad && a.y1 > b.y0 - pad

function footprint(kind: string, x: number, y: number, rot: number): Rect {
  const d = CATALOG_MAP[kind]
  const swap = Math.round(rot / 90) % 2 !== 0
  const w = swap ? d.d : d.w
  const h = swap ? d.w : d.d
  return { x0: x - w / 2, y0: y - h / 2, x1: x + w / 2, y1: y + h / 2 }
}

export function roomWalls(p: Project, room: Room, sunBearings: number[]): Wall[] {
  const lp = onLevel(p, lvl(room))
  const segs = buildWalls(lp).filter((s) => s.roomIds.includes(room.id))
  const edges: { side: Side; orient: 'h' | 'v'; fixed: number; a0: number; a1: number }[] = [
    { side: 'top', orient: 'h', fixed: room.y, a0: room.x, a1: room.x + room.w },
    { side: 'bottom', orient: 'h', fixed: room.y + room.d, a0: room.x, a1: room.x + room.w },
    { side: 'left', orient: 'v', fixed: room.x, a0: room.y, a1: room.y + room.d },
    { side: 'right', orient: 'v', fixed: room.x + room.w, a0: room.y, a1: room.y + room.d },
  ]
  return edges.map((e) => {
    const on = segs.filter((s) => s.orient === e.orient && Math.abs(s.fixed - e.fixed) < 1e-6 && s.end > e.a0 + 1e-6 && s.start < e.a1 - 1e-6)
    const tb = planToTrue(SIDE_BEARING[e.side], p.plot.northDeg)
    const exterior = on.some((s) => s.exterior)
    const windows = on.filter((s) => s.type === 'window').map((s) => [s.start, s.end] as [number, number])
    const sunHours = exterior && windows.length ? sunBearings.filter((b) => Math.abs((((b - tb) % 360) + 540) % 360 - 180) < 80).length / 6 : 0
    return {
      side: e.side,
      a0: e.a0,
      a1: e.a1,
      doors: on.filter((s) => s.type === 'door').map((s) => [s.start, s.end] as [number, number]),
      windows,
      exterior,
      trueBearing: tb,
      dir: dirName(tb),
      sunHours,
    }
  })
}

/** Door swing keep-out zones inside the room. */
function doorZones(room: Room, walls: Wall[]): Rect[] {
  const out: Rect[] = []
  for (const w of walls)
    for (const [a, b] of w.doors) {
      // swing depth = leaf width (wide openings are usually archways/sliders: cap at 0.95 m)
      const L = Math.min(b - a, 0.95) + 0.1
      if (w.side === 'top') out.push({ x0: a - 0.1, x1: b + 0.1, y0: room.y, y1: room.y + L })
      if (w.side === 'bottom') out.push({ x0: a - 0.1, x1: b + 0.1, y0: room.y + room.d - L, y1: room.y + room.d })
      if (w.side === 'left') out.push({ y0: a - 0.1, y1: b + 0.1, x0: room.x, x1: room.x + L })
      if (w.side === 'right') out.push({ y0: a - 0.1, y1: b + 0.1, x0: room.x + room.w - L, x1: room.x + room.w })
    }
  return out
}

/** Free intervals along a wall after removing doors (and windows for tall items). */
function freeSpans(w: Wall, tall: boolean): [number, number][] {
  const blocks = [...w.doors.map(([a, b]) => [a - 0.1, b + 0.1]), ...(tall ? w.windows.map(([a, b]) => [a - 0.05, b + 0.05]) : [])].sort((x, y) => x[0] - y[0])
  const spans: [number, number][] = []
  let cur = w.a0 + 0.05
  for (const [a, b] of blocks) {
    if (a > cur) spans.push([cur, a])
    cur = Math.max(cur, b)
  }
  if (w.a1 - 0.05 > cur) spans.push([cur, w.a1 - 0.05])
  return spans.filter(([a, b]) => b - a > 0.3)
}

class Planner {
  items: Furniture[] = []
  rects: Rect[] = []
  notes: string[] = []
  room: Room
  walls: Wall[]
  level: number
  colors: (kind: string) => string
  constructor(room: Room, walls: Wall[], colors: (kind: string) => string) {
    this.room = room
    this.walls = walls
    this.level = lvl(room)
    this.rects = doorZones(room, walls)
    this.colors = colors
  }
  inRoom(r: Rect) {
    const m = 0.03
    return r.x0 >= this.room.x + m && r.y0 >= this.room.y + m && r.x1 <= this.room.x + this.room.w - m && r.y1 <= this.room.y + this.room.d - m
  }
  fits(r: Rect, pad = 0.05) {
    return this.inRoom(r) && !this.rects.some((o) => overlap(r, o, pad))
  }
  add(kind: string, x: number, y: number, rot: number, reserve?: Rect) {
    const r = footprint(kind, x, y, rot)
    this.items.push({ id: Math.random().toString(36).slice(2, 9), kind, x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100, rot, color: this.colors(kind), level: this.level })
    this.rects.push(r)
    if (reserve) this.rects.push(reserve)
    return r
  }
  /** Position of an item backed against a wall at `along` (centre). */
  posOnWall(kind: string, side: Side, along: number) {
    const d = CATALOG_MAP[kind]
    const off = GAP + d.d / 2
    const R = this.room
    if (side === 'top') return { x: along, y: R.y + off, rot: ROT_FOR_SIDE.top }
    if (side === 'bottom') return { x: along, y: R.y + R.d - off, rot: ROT_FOR_SIDE.bottom }
    if (side === 'left') return { x: R.x + off, y: along, rot: ROT_FOR_SIDE.left }
    return { x: R.x + R.w - off, y: along, rot: ROT_FOR_SIDE.right }
  }
  /** Try to place against a wall; prefer centre of the largest free span, or near `prefer` ('start'|'end'|'center'). */
  tryWall(kind: string, side: Side, opts: { tall?: boolean; prefer?: 'center' | 'start' | 'end'; front?: number } = {}) {
    const def = CATALOG_MAP[kind]
    const wall = this.walls.find((w) => w.side === side)!
    const spans = freeSpans(wall, !!opts.tall).sort((a, b) => b[1] - b[0] - (a[1] - a[0]))
    for (const [a, b] of spans) {
      if (b - a < def.w) continue
      const cands =
        opts.prefer === 'start' ? [a + def.w / 2] : opts.prefer === 'end' ? [b - def.w / 2] : [(a + b) / 2, a + def.w / 2, b - def.w / 2]
      for (const along of cands) {
        const pos = this.posOnWall(kind, side, along)
        const r = footprint(kind, pos.x, pos.y, pos.rot)
        if (!this.fits(r)) continue
        // keep a clearance zone in front of the piece
        const front = opts.front ?? 0
        const fr = frontZone(r, side, front)
        return { ...pos, rect: r, frontRect: front ? fr : undefined, wall }
      }
    }
    return null
  }
}

function frontZone(r: Rect, side: Side, depth: number): Rect {
  if (side === 'top') return { x0: r.x0, x1: r.x1, y0: r.y1, y1: r.y1 + depth }
  if (side === 'bottom') return { x0: r.x0, x1: r.x1, y0: r.y0 - depth, y1: r.y0 }
  if (side === 'left') return { y0: r.y0, y1: r.y1, x0: r.x1, x1: r.x1 + depth }
  return { y0: r.y0, y1: r.y1, x0: r.x0 - depth, x1: r.x0 }
}

const opposite: Record<Side, Side> = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' }
const freeLen = (w: Wall, tall = false) => freeSpans(w, tall).reduce((s, [a, b]) => s + b - a, 0)
const sides: Side[] = ['top', 'right', 'bottom', 'left']

function byScore(walls: Wall[], score: (w: Wall) => number) {
  return [...walls].sort((a, b) => score(b) - score(a))
}

function furnishBedroom(P: Planner, vastu: boolean) {
  const R = P.room
  const big = R.w * R.d >= 11 && Math.min(R.w, R.d) >= 3
  const bed = big ? 'bedq' : 'beds'
  // Headboard wall: long free wall, no windows behind the head, avoid hot west sun, Vastu prefers head to South/East
  const headWalls = byScore(P.walls, (w) => {
    let s = freeLen(w) * 2 - w.windows.length * 2 - (w.dir === 'W' ? w.sunHours : 0)
    if (vastu && ['S', 'E', 'SE', 'SW'].includes(w.dir)) s += 2.5
    if (vastu && w.dir === 'N') s -= 2
    return s
  })
  let headSide: Side | null = null
  for (const w of headWalls) {
    const spot = P.tryWall(bed, w.side, { front: 0.6 })
    if (spot) {
      P.add(bed, spot.x, spot.y, spot.rot, spot.frontRect)
      headSide = w.side
      P.notes.push(`Bed headboard on the ${DIR_LONG[w.dir]} wall${w.windows.length ? '' : ' (no window behind your head)'}${vastu && ['S', 'E', 'SE', 'SW'].includes(w.dir) ? ' — sleeping with head to the South/East is Vastu-preferred' : ''}.`)
      // nightstands on either side
      const bedR = P.rects[P.rects.length - 2]
      const ns = CATALOG_MAP.nightstand
      const along = w.side === 'top' || w.side === 'bottom' ? [bedR.x0 - ns.w / 2 - 0.05, bedR.x1 + ns.w / 2 + 0.05] : [bedR.y0 - ns.w / 2 - 0.05, bedR.y1 + ns.w / 2 + 0.05]
      for (const a of along) {
        const pos = P.posOnWall('nightstand', w.side, a)
        if (P.fits(footprint('nightstand', pos.x, pos.y, pos.rot), 0.02)) P.add('nightstand', pos.x, pos.y, pos.rot)
      }
      break
    }
  }
  // Wardrobe: tall, needs a wall without windows; Vastu prefers South-West/West/South
  const wr = byScore(
    P.walls.filter((w) => w.side !== headSide),
    (w) => freeLen(w, true) + (vastu && ['S', 'W', 'SW'].includes(w.dir) ? 1.5 : 0),
  )
  for (const w of wr) {
    const spot = P.tryWall('wardrobe', w.side, { tall: true, prefer: 'start', front: 0.7 })
    if (spot) {
      P.add('wardrobe', spot.x, spot.y, spot.rot, spot.frontRect)
      P.notes.push(`Wardrobe on the ${DIR_LONG[w.dir]} wall with 0.7 m clear in front to open the shutters.`)
      break
    }
  }
  // Study desk under a window with soft light if the room is generous
  if (R.w * R.d >= 12) {
    const win = byScore(
      P.walls.filter((w) => w.windows.length),
      (w) => -w.sunHours,
    )
    for (const w of win) {
      const spot = P.tryWall('desk', w.side, { front: 0.75 })
      if (spot) {
        P.add('desk', spot.x, spot.y, spot.rot, spot.frontRect)
        P.notes.push(`Desk by the ${DIR_LONG[w.dir]} window for daylight${w.sunHours > 3 ? ' — add a blind, this window gets strong sun' : ''}.`)
        break
      }
    }
  }
  plantInCorner(P)
}

function furnishLiving(P: Planner) {
  const R = P.room
  // TV wall: no windows (avoid glare), not facing a sunny window opposite
  const tvWalls = byScore(P.walls, (w) => {
    const opp = P.walls.find((o) => o.side === opposite[w.side])!
    return freeLen(w) - w.windows.length * 3 - opp.sunHours * 0.4 - w.sunHours
  })
  let placedTv: Side | null = null
  for (const w of tvWalls) {
    const spot = P.tryWall('tv', w.side, {})
    if (!spot) continue
    // sofa on the opposite wall, ~2.4–3.5 m viewing distance
    const sofaKind = R.w * R.d > 18 ? 'lsofa' : 'sofa3'
    const opp = opposite[w.side]
    const s = P.tryWall(sofaKind, opp, {}) ?? P.tryWall('sofa3', opp, {}) ?? P.tryWall('sofa2', opp, {})
    if (!s) continue
    const kind = P.tryWall(sofaKind, opp, {}) ? sofaKind : P.tryWall('sofa3', opp, {}) ? 'sofa3' : 'sofa2'
    // align TV with the sofa centre when possible
    const along = w.side === 'top' || w.side === 'bottom' ? s.x : s.y
    const tvPos = P.posOnWall('tv', w.side, along)
    const tvR = footprint('tv', tvPos.x, tvPos.y, tvPos.rot)
    if (P.fits(tvR)) P.add('tv', tvPos.x, tvPos.y, tvPos.rot)
    else P.add('tv', spot.x, spot.y, spot.rot)
    P.add(kind, s.x, s.y, s.rot)
    placedTv = w.side
    P.notes.push(`TV on the ${DIR_LONG[w.dir]} wall (no window there → no screen glare); ${CATALOG_MAP[kind].label.toLowerCase()} faces it from the ${DIR_LONG[P.walls.find((o) => o.side === opp)!.dir]} wall.`)
    // coffee table + rug between them
    const cx = (tvPos.x + s.x) / 2
    const cy = (tvPos.y + s.y) / 2
    const rot = w.side === 'top' || w.side === 'bottom' ? 0 : 90
    const sofaR = footprint(kind, s.x, s.y, s.rot)
    // place the table ~0.45 m in front of the sofa
    const t =
      opp === 'bottom' ? { x: s.x, y: sofaR.y0 - 0.45 - 0.3 } : opp === 'top' ? { x: s.x, y: sofaR.y1 + 0.45 + 0.3 } : opp === 'left' ? { x: sofaR.x1 + 0.45 + 0.3, y: s.y } : { x: sofaR.x0 - 0.45 - 0.3, y: s.y }
    const rugR = footprint('rug', cx, cy, rot)
    if (P.inRoom(rugR)) P.items.push({ id: Math.random().toString(36).slice(2, 9), kind: 'rug', x: t.x, y: t.y, rot, color: P.colors('rug'), level: P.level })
    if (P.fits(footprint('coffee', t.x, t.y, rot), 0.1)) P.add('coffee', t.x, t.y, rot)
    else {
      const spot = searchSpot(P, (x, y) => footprint('coffee', x, y, rot), t.x, t.y)
      if (spot && Math.hypot(spot.x - t.x, spot.y - t.y) < 0.8) P.add('coffee', spot.x, spot.y, rot)
    }
    break
  }
  if (!placedTv) {
    const spot = byScore(P.walls, freeLen).map((w) => P.tryWall('sofa3', w.side, {})).find(Boolean)
    if (spot) P.add('sofa3', spot.x, spot.y, spot.rot)
    P.notes.push('Room is tight for a TV + sofa layout; placed seating only.')
  }
  // armchair + lamp, bookshelf on a remaining wall
  for (const w of byScore(P.walls, (w) => freeLen(w, true))) {
    const spot = P.tryWall('bookshelf', w.side, { tall: true, prefer: 'end' })
    if (spot) {
      P.add('bookshelf', spot.x, spot.y, spot.rot)
      break
    }
  }
  for (const w of byScore(P.walls, (w) => (w.windows.length ? 1 : 0) + freeLen(w))) {
    const spot = P.tryWall('armchair', w.side, { prefer: 'start', front: 0.4 })
    if (spot) {
      P.add('armchair', spot.x, spot.y, spot.rot, spot.frontRect)
      break
    }
  }
  plantInCorner(P, true)
}

function furnishDining(P: Planner) {
  const R = P.room
  const kind = R.w * R.d >= 11 && Math.max(R.w, R.d) >= 3.4 ? 'dining6' : 'dining4'
  const rot = R.w >= R.d ? 0 : 90
  const cx = R.x + R.w / 2, cy = R.y + R.d / 2
  // table + chairs: chairs need ~0.6 m pull-back on the long sides; search outward from the centre
  const chairsZone = (k: string, x: number, y: number) => {
    const r = footprint(k, x, y, rot)
    return rot === 0 ? { ...r, y0: r.y0 - 0.6, y1: r.y1 + 0.6 } : { ...r, x0: r.x0 - 0.6, x1: r.x1 + 0.6 }
  }
  let placed = false
  for (const k of kind === 'dining6' ? ['dining6', 'dining4'] : ['dining4']) {
    const spot = searchSpot(P, (x, y) => chairsZone(k, x, y), cx, cy)
    if (spot) {
      P.add(k, spot.x, spot.y, rot, chairsZone(k, spot.x, spot.y))
      P.notes.push(`${CATALOG_MAP[k].label} ${spot.moved ? 'shifted clear of the door swings' : 'centred'} with chair pull-back clearance.`)
      placed = true
      break
    }
  }
  if (!placed) P.notes.push('Not enough clear floor for a dining table — consider moving a door.')
  for (const w of byScore(P.walls, (w) => freeLen(w))) {
    const spot = P.tryWall('dresser', w.side, {})
    if (spot) {
      P.add('dresser', spot.x, spot.y, spot.rot)
      P.notes.push(`Sideboard/crockery unit on the ${DIR_LONG[w.dir]} wall.`)
      break
    }
  }
  plantInCorner(P)
}

/** Find the free spot nearest (cx, cy) for a free-standing zone, scanning a 0.1 m grid. */
function searchSpot(P: Planner, zone: (x: number, y: number) => Rect, cx: number, cy: number) {
  const R = P.room
  let best: { x: number; y: number; d: number } | null = null
  for (let x = R.x + 0.3; x <= R.x + R.w - 0.3; x += 0.1)
    for (let y = R.y + 0.3; y <= R.y + R.d - 0.3; y += 0.1) {
      const d = Math.hypot(x - cx, y - cy)
      if (best && d >= best.d) continue
      if (P.fits(zone(x, y), 0)) best = { x, y, d }
    }
  return best ? { x: Math.round(best.x * 100) / 100, y: Math.round(best.y * 100) / 100, moved: best.d > 0.15 } : null
}

function furnishKitchen(P: Planner, vastu: boolean) {
  // main counter along the longest free wall; prefer the wall under a window (sink by the window)
  const main = byScore(P.walls, (w) => freeLen(w) + (w.windows.length ? 1 : 0) + (vastu && ['E', 'SE'].includes(w.dir) ? 1.2 : 0))
  let used: Side | null = null
  for (const w of main) {
    const spot = P.tryWall('counter', w.side, { front: 0.9 })
    if (spot) {
      P.add('counter', spot.x, spot.y, spot.rot, spot.frontRect)
      used = w.side
      P.notes.push(`Main counter (sink + hob) on the ${DIR_LONG[w.dir]} wall${w.windows.length ? ' under the window for light & ventilation' : ''}${vastu && ['E', 'SE'].includes(w.dir) ? ' — cooking facing East is Vastu-preferred' : ''}.`)
      break
    }
  }
  // second run (L/parallel)
  for (const w of byScore(P.walls.filter((w) => w.side !== used), (w) => freeLen(w))) {
    const spot = P.tryWall('counter', w.side, { front: 0.9 })
    if (spot) {
      P.add('counter', spot.x, spot.y, spot.rot, spot.frontRect)
      P.notes.push('Second counter run forms an efficient work triangle.')
      break
    }
  }
  for (const w of byScore(P.walls, (w) => freeLen(w, true))) {
    const spot = P.tryWall('fridge', w.side, { tall: true, prefer: 'start', front: 0.7 })
    if (spot) {
      P.add('fridge', spot.x, spot.y, spot.rot, spot.frontRect)
      break
    }
  }
}

function furnishBath(P: Planner) {
  for (const w of byScore(P.walls, (w) => freeLen(w) - w.doors.length)) {
    const spot = P.tryWall('toilet', w.side, { prefer: 'end', front: 0.55 })
    if (spot) {
      P.add('toilet', spot.x, spot.y, spot.rot, spot.frontRect)
      break
    }
  }
  for (const w of byScore(P.walls, (w) => freeLen(w))) {
    const spot = P.tryWall('vanity', w.side, { front: 0.5 })
    if (spot) {
      P.add('vanity', spot.x, spot.y, spot.rot, spot.frontRect)
      break
    }
  }
  if (P.room.w * P.room.d >= 3.5)
    for (const w of byScore(P.walls, (w) => freeLen(w, true))) {
      const spot = P.tryWall('shower', w.side, { tall: true, prefer: 'start' })
      if (spot) {
        P.add('shower', spot.x, spot.y, spot.rot)
        P.notes.push('Wet (shower) and dry (WC, vanity) zones separated.')
        break
      }
    }
}

function furnishStudy(P: Planner, northish: number) {
  const win = byScore(P.walls, (w) => (w.windows.length ? 2 : 0) - Math.abs((((w.trueBearing - northish) % 360) + 540) % 360 - 180) / 90 - w.sunHours * 0.3)
  for (const w of win) {
    const spot = P.tryWall('desk', w.side, { front: 0.8 })
    if (spot) {
      P.add('desk', spot.x, spot.y, spot.rot, spot.frontRect)
      const chair = frontZone(spot.rect, w.side, 0.45)
      const ccx = (chair.x0 + chair.x1) / 2, ccy = (chair.y0 + chair.y1) / 2
      P.items.push({ id: Math.random().toString(36).slice(2, 9), kind: 'officechair', x: ccx, y: ccy, rot: spot.rot, color: P.colors('officechair'), level: P.level })
      P.notes.push(`Desk faces the ${DIR_LONG[w.dir]} wall${w.windows.length ? ' by the window' : ''} for soft daylight.`)
      break
    }
  }
  for (const w of byScore(P.walls, (w) => freeLen(w, true))) {
    const spot = P.tryWall('bookshelf', w.side, { tall: true })
    if (spot) {
      P.add('bookshelf', spot.x, spot.y, spot.rot)
      break
    }
  }
  plantInCorner(P)
}

function furnishPooja(P: Planner) {
  // The deity should face East or West; the person praying then faces East/West. Unit on the West wall faces East.
  const order = byScore(P.walls, (w) => (w.dir === 'W' ? 3 : w.dir === 'E' ? 2 : 0) + freeLen(w) * 0.1)
  for (const w of order) {
    const spot = P.tryWall('mandir', w.side, { front: 0.9 })
    if (spot) {
      P.add('mandir', spot.x, spot.y, spot.rot, spot.frontRect)
      P.notes.push(`Pooja unit on the ${DIR_LONG[w.dir]} wall so it faces ${DIR_LONG[P.walls.find((o) => o.side === opposite[w.side])!.dir]}.`)
      break
    }
  }
}

function furnishBalcony(P: Planner) {
  const R = P.room
  const cx = R.x + R.w / 2, cy = R.y + R.d / 2
  if (R.w * R.d > 8 && P.fits(footprint('dining4', cx, cy, 0), 0.6)) P.add('dining4', cx, cy, 0)
  else
    for (const w of byScore(P.walls, (w) => freeLen(w))) {
      const spot = P.tryWall('armchair', w.side, {})
      if (spot) {
        P.add('armchair', spot.x, spot.y, spot.rot)
        break
      }
    }
  plantInCorner(P, true)
  plantInCorner(P, true)
}

function plantInCorner(P: Planner, sunny = false) {
  const R = P.room
  const corners = [
    [R.x + 0.35, R.y + 0.35],
    [R.x + R.w - 0.35, R.y + 0.35],
    [R.x + 0.35, R.y + R.d - 0.35],
    [R.x + R.w - 0.35, R.y + R.d - 0.35],
  ]
  const scored = corners
    .map(([x, y]) => {
      const near = P.walls.filter((w) => w.windows.length && (w.side === 'top' ? y < R.y + 1 : w.side === 'bottom' ? y > R.y + R.d - 1 : w.side === 'left' ? x < R.x + 1 : x > R.x + R.w - 1))
      return { x, y, s: near.reduce((s, w) => s + w.sunHours, 0) }
    })
    .sort((a, b) => (sunny ? b.s - a.s : b.s - a.s))
  for (const c of scored) {
    if (P.fits(footprint('plant', c.x, c.y, 0), 0.02)) {
      P.add('plant', c.x, c.y, 0)
      return
    }
  }
}

export function sunBearingsFor(p: Project, date: string) {
  const out: number[] = []
  for (let m = 0; m < 1440; m += 10) {
    const s = sunPosition(p.plot, date, m)
    if (s.altitude > 0.05) out.push(s.bearing)
  }
  return out
}

/** Validate externally proposed items (e.g. from Claude): inside the room, no overlaps, no blocked doors. */
export function validateItems(p: Project, room: Room, proposed: Furniture[], date: string) {
  const walls = roomWalls(p, room, sunBearingsFor(p, date))
  const P = new Planner(room, walls, (k) => CATALOG_MAP[k]?.color ?? '#999')
  const kept: Furniture[] = []
  const dropped: string[] = []
  for (const f of proposed) {
    if (!CATALOG_MAP[f.kind]) continue
    const r = footprint(f.kind, f.x, f.y, f.rot)
    if (f.kind === 'rug' ? P.inRoom(r) : P.fits(r, 0)) {
      kept.push(f)
      if (f.kind !== 'rug') P.rects.push(r)
    } else dropped.push(CATALOG_MAP[f.kind].label)
  }
  return { kept, dropped }
}

export function autoFurnish(p: Project, room: Room, date: string, vastu: boolean): LayoutResult {
  const t0 = performance.now()
  const sunBearings = sunBearingsFor(p, date)
  const walls = roomWalls(p, room, sunBearings)
  const style = STYLES[p.style ?? 'modern']
  let ui = 0
  const colors = (kind: string) => {
    if (['sofa3', 'sofa2', 'lsofa', 'armchair', 'bedq', 'beds'].includes(kind)) return style.upholstery[ui++ % style.upholstery.length]
    if (['coffee', 'bookshelf', 'wardrobe', 'nightstand', 'dresser', 'dining6', 'dining4', 'desk'].includes(kind)) return style.wood
    return CATALOG_MAP[kind]?.color ?? '#999'
  }
  const P = new Planner(room, walls, colors)
  const north = p.plot.lat >= 0 ? 0 : 180
  switch (room.type) {
    case 'bedroom':
      furnishBedroom(P, vastu)
      break
    case 'living':
      furnishLiving(P)
      break
    case 'dining':
      furnishDining(P)
      break
    case 'kitchen':
      furnishKitchen(P, vastu)
      break
    case 'bathroom':
      furnishBath(P)
      break
    case 'study':
      furnishStudy(P, north)
      break
    case 'pooja':
      furnishPooja(P)
      break
    case 'balcony':
      furnishBalcony(P)
      break
    default:
      P.notes.push('Circulation space — kept clear.')
  }
  // keep any stairs already in the room as obstacles: re-check overlap and drop clashing pieces
  const stairs = p.furniture.filter((f) => f.kind.startsWith('stair') && lvl(f) === lvl(room)).map((f) => footprint(f.kind, f.x, f.y, f.rot))
  const items = P.items.filter((f) => !stairs.some((s) => overlap(footprint(f.kind, f.x, f.y, f.rot), s)))
  if (!items.length && room.type !== 'utility' && room.type !== 'garage') P.notes.push('No layout fits — try a larger room or move doors.')
  P.notes.push(`Laid out ${items.length} pieces in ${(performance.now() - t0).toFixed(1)} ms.`)
  return { items, notes: P.notes }
}

/** Remove existing (non-structural) furniture inside a room. */
export function clearRoom(p: Project, room: Room) {
  p.furniture = p.furniture.filter(
    (f) => f.kind.startsWith('stair') || lvl(f) !== lvl(room) || !(f.x >= room.x && f.x <= room.x + room.w && f.y >= room.y && f.y <= room.y + room.d),
  )
}

export const sideVec = (side: Side) => bearingToVec(SIDE_BEARING[side])
export { sides }
