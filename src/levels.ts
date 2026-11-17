import type { Project } from './types'
import { PLINTH } from './walls'

export const lvl = (x: { level?: number }) => x.level ?? 0

/** A project view containing only the items on one floor. */
export function onLevel(p: Project, level: number): Project {
  return {
    ...p,
    rooms: p.rooms.filter((r) => lvl(r) === level),
    openings: p.openings.filter((o) => lvl(o) === level),
    furniture: p.furniture.filter((f) => lvl(f) === level),
  }
}

export const floorToFloor = (p: Project) => p.wallHeight + p.slabThickness
export const elevation = (p: Project, level: number) => PLINTH + level * floorToFloor(p)

export const LEVEL_NAMES = ['Ground floor', 'First floor', 'Second floor', 'Third floor', 'Fourth floor', 'Terrace']

/** Bring old / imported projects up to the current schema. */
export function normalize(p: Project): Project {
  const levels = Array.isArray(p.levels) && p.levels.length ? p.levels : [{ name: LEVEL_NAMES[0] }]
  return {
    ...p,
    levels,
    style: p.style ?? 'modern',
    rooms: (p.rooms ?? []).map((r) => ({ ...r, level: lvl(r) })),
    openings: (p.openings ?? []).map((o) => ({ ...o, level: lvl(o) })),
    furniture: (p.furniture ?? []).map((f) => ({ ...f, level: lvl(f) })),
  }
}
