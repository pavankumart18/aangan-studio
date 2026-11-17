import type { CamView, Project, Room } from './types'
import { buildWalls } from './walls'
import { onLevel, lvl } from './levels'

/** Eye-level viewpoint for a room: stand just inside the main door, look across the room. */
export function roomViewpoint(p: Project, room: Room): CamView {
  const cx = room.x + room.w / 2
  const cy = room.y + room.d / 2
  const doors = buildWalls(onLevel(p, lvl(room))).filter((s) => s.type === 'door' && s.roomIds.includes(room.id))
  let ex = cx
  let ey = room.y + room.d * 0.82
  if (doors.length) {
    const d = doors[0]
    const mid = (d.start + d.end) / 2
    const dx = d.orient === 'h' ? mid : d.fixed
    const dy = d.orient === 'h' ? d.fixed : mid
    ex = cx + (dx - cx) * 0.72
    ey = cy + (dy - cy) * 0.72
  }
  return { roomId: room.id, x: ex, y: ey, level: lvl(room), look: { x: cx + (cx - ex) * 0.6, y: cy + (cy - ey) * 0.6 } }
}
