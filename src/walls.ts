import type { OpeningKind, Project, Room } from './types'

/** Snap grid for rooms and openings (metres). */
export const G = 0.25
export const EXT_T = 0.23 // 9" brick
export const INT_T = 0.115 // 4.5" brick
export const PLINTH = 0.45
export const SILL = 0.9
export const LINTEL = 2.1

export const snap = (v: number, g = G) => Math.round(v / g) * g

export interface WallSegment {
  key: string
  orient: 'h' | 'v'
  fixed: number // y for h, x for v
  start: number
  end: number
  type: 'wall' | OpeningKind
  exterior: boolean
  openingId?: string
  roomIds: string[]
  /** Outward plan bearing (0 = plan up, 90 = plan right) for exterior segments. */
  normalBearing?: number
}

interface Cell {
  o: 'h' | 'v'
  fixedIdx: number
  alongIdx: number
  rooms: string[]
  opening?: { id: string; kind: OpeningKind }
}

const idx = (v: number) => Math.round(v / G)

function roomCells(r: Room, add: (o: 'h' | 'v', fixedIdx: number, alongIdx: number, room: string) => void) {
  const x0 = idx(r.x), x1 = idx(r.x + r.w), y0 = idx(r.y), y1 = idx(r.y + r.d)
  for (let i = x0; i < x1; i++) {
    add('h', y0, i, r.id)
    add('h', y1, i, r.id)
  }
  for (let j = y0; j < y1; j++) {
    add('v', x0, j, r.id)
    add('v', x1, j, r.id)
  }
}

function buildCells(p: Project) {
  const cells = new Map<string, Cell>()
  const add = (o: 'h' | 'v', fixedIdx: number, alongIdx: number, room: string) => {
    const k = `${o}:${fixedIdx}:${alongIdx}`
    const c = cells.get(k)
    if (c) {
      if (!c.rooms.includes(room)) c.rooms.push(room)
    } else cells.set(k, { o, fixedIdx, alongIdx, rooms: [room] })
  }
  p.rooms.forEach((r) => roomCells(r, add))
  for (const op of p.openings) {
    const fixedIdx = op.orient === 'h' ? idx(op.y) : idx(op.x)
    const a0 = idx(op.orient === 'h' ? op.x : op.y)
    const a1 = idx((op.orient === 'h' ? op.x : op.y) + op.length)
    for (let a = a0; a < a1; a++) {
      const c = cells.get(`${op.orient}:${fixedIdx}:${a}`)
      if (c) c.opening = { id: op.id, kind: op.kind }
    }
  }
  return cells
}

function outwardBearing(o: 'h' | 'v', fixed: number, room: Room | undefined) {
  if (!room) return undefined
  if (o === 'h') return Math.abs(room.y - fixed) < 1e-6 ? 0 : 180
  return Math.abs(room.x - fixed) < 1e-6 ? 270 : 90
}

function mergeRuns(p: Project, cells: Map<string, Cell>, sig: (c: Cell) => string, ignoreOpenings: boolean): WallSegment[] {
  const lines = new Map<string, Cell[]>()
  for (const c of cells.values()) {
    const lk = `${c.o}:${c.fixedIdx}`
    if (!lines.has(lk)) lines.set(lk, [])
    lines.get(lk)!.push(c)
  }
  const roomMap = new Map(p.rooms.map((r) => [r.id, r]))
  const out: WallSegment[] = []
  for (const [lk, list] of lines) {
    list.sort((a, b) => a.alongIdx - b.alongIdx)
    let run: Cell[] = []
    const flush = () => {
      if (!run.length) return
      const c0 = run[0]
      const exterior = c0.rooms.length === 1
      const type = ignoreOpenings ? 'wall' : (c0.opening?.kind ?? 'wall')
      const fixed = c0.fixedIdx * G
      const roomIds = Array.from(new Set(run.flatMap((c) => c.rooms)))
      out.push({
        key: `${lk}:${c0.alongIdx}`,
        orient: c0.o,
        fixed,
        start: c0.alongIdx * G,
        end: (run[run.length - 1].alongIdx + 1) * G,
        type,
        exterior,
        openingId: ignoreOpenings ? undefined : c0.opening?.id,
        roomIds,
        normalBearing: exterior ? outwardBearing(c0.o, fixed, roomMap.get(c0.rooms[0])) : undefined,
      })
      run = []
    }
    for (const c of list) {
      const prev = run[run.length - 1]
      if (prev && c.alongIdx === prev.alongIdx + 1 && sig(c) === sig(prev)) run.push(c)
      else {
        flush()
        run = [c]
      }
    }
    flush()
  }
  return out
}

/** Merge room edges into deduplicated wall runs, split by openings, tagged interior/exterior. */
export function buildWalls(p: Project): WallSegment[] {
  const cells = buildCells(p)
  return mergeRuns(
    p,
    cells,
    (c) => `${c.opening?.kind ?? 'wall'}|${c.opening?.id ?? ''}|${c.rooms.length === 1 ? 'e' : 'i'}|${c.rooms.length === 1 ? c.rooms[0] : ''}`,
    false,
  )
}

/** Continuous runs for plinth beams (openings ignored). */
export function buildBeams(p: Project): WallSegment[] {
  const cells = buildCells(p)
  return mergeRuns(p, cells, (c) => (c.rooms.length === 1 ? 'e' : 'i'), true)
}

/** Unique room corners → column/footing positions. */
export function buildColumns(p: Project): { x: number; y: number }[] {
  const seen = new Map<string, { x: number; y: number }>()
  for (const r of p.rooms) {
    for (const [x, y] of [
      [r.x, r.y],
      [r.x + r.w, r.y],
      [r.x, r.y + r.d],
      [r.x + r.w, r.y + r.d],
    ]) {
      const k = `${idx(x)}:${idx(y)}`
      if (!seen.has(k)) seen.set(k, { x, y })
    }
  }
  return [...seen.values()]
}

/** Footprint area = union of room rectangles (rooms shouldn't overlap, but be safe via grid sampling). */
export function footprintArea(p: Project) {
  const cells = new Set<string>()
  for (const r of p.rooms)
    for (let i = idx(r.x); i < idx(r.x + r.w); i++) for (let j = idx(r.y); j < idx(r.y + r.d); j++) cells.add(`${i}:${j}`)
  return cells.size * G * G
}

export function roomAt(p: Project, x: number, y: number) {
  return p.rooms.find((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.d)
}

export const bearingToVec = (b: number): [number, number] => [Math.sin((b * Math.PI) / 180), -Math.cos((b * Math.PI) / 180)]
