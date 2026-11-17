import type { Furniture, Project, Room } from './types'
import { CATALOG } from './catalog'
import { roomWalls, sunBearingsFor, validateItems } from './layout'
import { DIR_LONG } from './sun'
import { lvl } from './levels'
import { STYLES } from './styles'

const ALLOWED = new Set(CATALOG.filter((c) => !c.kind.startsWith('stair')).map((c) => c.kind))

export interface AiResult {
  items: Furniture[]
  notes: string[]
  summary: string
  ms: number
}

/** Ask Claude (via the local server endpoint) to furnish one room, then validate geometry client-side. */
export async function aiFurnish(p: Project, room: Room, date: string, vastu: boolean, brief: string): Promise<AiResult> {
  const t0 = performance.now()
  const walls = roomWalls(p, room, sunBearingsFor(p, date))
  const rel = (side: string, [a, b]: [number, number]): [number, number] => {
    const o = side === 'top' || side === 'bottom' ? room.x : room.y
    return [Math.round((a - o) * 100) / 100, Math.round((b - o) * 100) / 100]
  }
  const body = {
    room: { name: room.name, type: room.type, w: room.w, d: room.d },
    walls: walls.map((w) => ({
      side: w.side,
      facing: DIR_LONG[w.dir],
      exterior: w.exterior,
      doors: w.doors.map((s) => rel(w.side, s)),
      windows: w.windows.map((s) => rel(w.side, s)),
      sunHours: w.sunHours,
    })),
    style: `${STYLES[p.style].label} — ${STYLES[p.style].blurb}`,
    vastu,
    city: p.plot.city,
    date,
    brief,
    catalog: CATALOG.filter((c) => ALLOWED.has(c.kind)).map(({ kind, label, w, d, h }) => ({ kind, label, w, d, h })),
  }
  const res = await fetch('/api/ai-layout', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
  const style = STYLES[p.style]
  let ui = 0
  const proposed: Furniture[] = (data.items as { kind: string; x: number; y: number; rot: number; reason: string }[])
    .filter((i) => ALLOWED.has(i.kind))
    .map((i) => ({
      id: Math.random().toString(36).slice(2, 9),
      kind: i.kind,
      x: room.x + i.x,
      y: room.y + i.y,
      rot: ((Math.round(i.rot / 90) * 90) % 360 + 360) % 360,
      color: ['sofa3', 'sofa2', 'lsofa', 'armchair', 'bedq', 'beds'].includes(i.kind)
        ? style.upholstery[ui++ % style.upholstery.length]
        : ['coffee', 'bookshelf', 'wardrobe', 'nightstand', 'dresser', 'dining6', 'dining4', 'desk'].includes(i.kind)
          ? style.wood
          : (CATALOG.find((c) => c.kind === i.kind)?.color ?? '#999'),
      level: lvl(room),
    }))
  const { kept, dropped } = validateItems(p, room, proposed, date)
  const notes = (data.items as { reason: string; kind: string }[]).filter((i) => ALLOWED.has(i.kind)).map((i) => i.reason)
  if (dropped.length) notes.push(`Skipped ${dropped.length} piece(s) that collided or left the room: ${dropped.join(', ')}.`)
  const ms = performance.now() - t0
  notes.push(`Claude (${data.model}) answered in ${(data.ms / 1000).toFixed(1)} s; total ${(ms / 1000).toFixed(1)} s.`)
  return { items: kept, notes, summary: data.summary, ms }
}
