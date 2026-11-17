import type { Project, Room, RoomType } from './types'
import { buildWalls, buildBeams, buildColumns, footprintArea, roomAt, EXT_T, INT_T, LINTEL, SILL, type WallSegment } from './walls'
import { dayTimes, dirName, DIR_LONG, fmtTime, sunPosition, type Dir8 } from './sun'
import { CATALOG_MAP } from './catalog'
import { onLevel } from './levels'

export type TipLevel = 'good' | 'warn' | 'info'
export interface Tip {
  level: TipLevel
  text: string
}

export interface WindowSun {
  seg: WallSegment
  trueBearing: number
  dir: Dir8
  morning: number // hours
  afternoon: number
}

export interface RoomInsight {
  room: Room
  windows: WindowSun[]
  morning: number
  afternoon: number
  total: number
  bestWall?: { dir: Dir8; hours: number; hasWindow: boolean }
  vastuZone: Dir8 | 'Center'
  vastuOk: boolean | null
  vastuText: string
  tips: Tip[]
}

const STEP = 10 // minutes
const HALF_FOV = 80 // degrees — window "sees" the sun within ±80° of its normal

const angDiff = (a: number, b: number) => {
  const d = Math.abs((((a - b) % 360) + 540) % 360 - 180)
  return d
}

export const planToTrue = (planBearing: number, northDeg: number) => (((planBearing - northDeg) % 360) + 360) % 360

/** Precompute sun samples for a day. */
function daySamples(p: Project, date: string) {
  const { noon } = dayTimes(p.plot, date)
  const out: { minutes: number; bearing: number; alt: number; morning: boolean }[] = []
  for (let m = 0; m < 1440; m += STEP) {
    const s = sunPosition(p.plot, date, m)
    if (s.altitude > 0.05) out.push({ minutes: m, bearing: s.bearing, alt: s.altitude, morning: m < noon })
  }
  return out
}

function facadeHours(samples: ReturnType<typeof daySamples>, trueBearing: number) {
  let morning = 0, afternoon = 0
  for (const s of samples) {
    if (angDiff(s.bearing, trueBearing) < HALF_FOV) {
      if (s.morning) morning += STEP / 60
      else afternoon += STEP / 60
    }
  }
  return { morning, afternoon }
}

// ---- Vastu Shastra traditional placement guidance (cultural guideline, not a building code) ----
const VASTU: Partial<Record<RoomType, { ideal: (Dir8 | 'Center')[]; avoid: (Dir8 | 'Center')[]; note: string }>> = {
  kitchen: { ideal: ['SE', 'NW'], avoid: ['NE', 'SW', 'Center'], note: 'Agni (fire) corner is South-East' },
  bedroom: { ideal: ['SW', 'S', 'W', 'NW'], avoid: ['NE', 'Center'], note: 'Master bedroom is best in the South-West' },
  living: { ideal: ['N', 'NE', 'E', 'NW'], avoid: ['SW'], note: 'North/East living invites light and energy' },
  pooja: { ideal: ['NE', 'E', 'N'], avoid: ['S', 'SW', 'SE'], note: 'Ishanya (North-East) is the most sacred zone' },
  bathroom: { ideal: ['NW', 'W', 'S'], avoid: ['NE', 'Center', 'SW'], note: 'Toilets suit the North-West / West' },
  dining: { ideal: ['W', 'E', 'S', 'Center'], avoid: ['NE'], note: 'West or East dining is preferred' },
  study: { ideal: ['NE', 'E', 'N', 'W'], avoid: ['SE'], note: 'Face East or North while studying' },
  garage: { ideal: ['NW', 'SE'], avoid: ['NE'], note: 'Parking suits North-West or South-East' },
  balcony: { ideal: ['N', 'E', 'NE'], avoid: ['SW'], note: 'Open spaces belong in the North and East' },
}

function vastuZone(p: Project, r: Room): Dir8 | 'Center' {
  const xs = p.rooms.flatMap((q) => [q.x, q.x + q.w])
  const ys = p.rooms.flatMap((q) => [q.y, q.y + q.d])
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2
  const dx = r.x + r.w / 2 - cx
  const dy = r.y + r.d / 2 - cy
  const span = Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys))
  if (Math.hypot(dx, dy) < span * 0.14) return 'Center'
  const planB = (Math.atan2(dx, -dy) * 180) / Math.PI
  return dirName(planToTrue(planB, p.plot.northDeg))
}

const isWestish = (b: number) => angDiff(b, 270) <= 50
const h1 = (v: number) => (Math.round(v * 10) / 10).toFixed(1)

export function analyse(full: Project, date: string) {
  const t0 = performance.now()
  const samples = daySamples(full, date)
  const rooms: RoomInsight[] = []
  const entrances: Dir8[] = []
  full.levels.forEach((_, i) => {
    const r = analyseLevel(onLevel(full, i), samples, i === 0)
    rooms.push(...r.rooms)
    entrances.push(...r.entrances)
  })
  const days = dayTimes(full.plot, date)
  return { rooms, entrances, days, ms: performance.now() - t0 }
}

function analyseLevel(p: Project, samples: ReturnType<typeof daySamples>, ground: boolean) {
  const walls = buildWalls(p)
  const north = p.plot.lat >= 0 ? 0 : 180 // the "diffuse light" side of the hemisphere
  const rooms: RoomInsight[] = []

  for (const room of p.rooms) {
    const segs = walls.filter((s) => s.exterior && s.roomIds[0] === room.id)
    const windows: WindowSun[] = segs
      .filter((s) => s.type === 'window' && s.normalBearing != null)
      .map((seg) => {
        const tb = planToTrue(seg.normalBearing!, p.plot.northDeg)
        return { seg, trueBearing: tb, dir: dirName(tb), ...facadeHours(samples, tb) }
      })

    // union of sun over all windows (room is sunlit if any window sees the sun)
    let morning = 0, afternoon = 0
    for (const s of samples) {
      if (windows.some((w) => angDiff(s.bearing, w.trueBearing) < HALF_FOV)) {
        if (s.morning) morning += STEP / 60
        else afternoon += STEP / 60
      }
    }
    const total = morning + afternoon

    // Which exterior facade of this room has the most sun potential?
    const facades = Array.from(new Set(segs.map((s) => s.normalBearing!).filter((b) => b != null)))
    let bestWall: RoomInsight['bestWall']
    for (const fb of facades) {
      const tb = planToTrue(fb, p.plot.northDeg)
      const { morning: m, afternoon: a } = facadeHours(samples, tb)
      const hasWindow = windows.some((w) => w.seg.normalBearing === fb)
      if (!bestWall || m + a > bestWall.hours) bestWall = { dir: dirName(tb), hours: m + a, hasWindow }
    }

    const tips: Tip[] = []
    const area = room.w * room.d
    const glazing = windows.reduce((s, w) => s + (w.seg.end - w.seg.start) * (LINTEL - SILL), 0)
    const habitable = ['living', 'bedroom', 'kitchen', 'study', 'dining'].includes(room.type)
    const westWin = windows.filter((w) => isWestish(w.trueBearing) && w.afternoon > 1.5)

    if (habitable && windows.length === 0) {
      tips.push({ level: 'warn', text: `No exterior windows — add one${bestWall ? ` on the ${DIR_LONG[bestWall.dir]} wall (${h1(bestWall.hours)} h potential sun)` : ''}. Habitable rooms need daylight & cross-ventilation.` })
    } else if (habitable && glazing / area < 0.1) {
      tips.push({ level: 'info', text: `Window area is ${Math.round((glazing / area) * 100)}% of floor area — aim for ≥10% for good daylight (common bye-law guidance).` })
    }

    switch (room.type) {
      case 'living':
        if (total >= 3) tips.push({ level: 'good', text: `Bright living room — ${h1(total)} h of direct sun today.` })
        else if (windows.length) tips.push({ level: 'warn', text: `Living room gets only ${h1(total)} h of sun.${bestWall && !bestWall.hasWindow ? ` A ${DIR_LONG[bestWall.dir]} window would add up to ${h1(bestWall.hours)} h.` : ' Use light wall colours & mirrors to bounce light.'}` })
        break
      case 'bedroom':
        if (morning >= 1) tips.push({ level: 'good', text: `Morning light (${h1(morning)} h) — great for a natural wake-up.` })
        else tips.push({ level: 'info', text: 'No morning sun. An East-facing window helps regulate sleep cycles.' })
        break
      case 'kitchen':
        if (morning >= 1) tips.push({ level: 'good', text: `Morning sun (${h1(morning)} h) keeps the kitchen fresh and dry.` })
        if (westWin.length) tips.push({ level: 'warn', text: 'West sun + cooking heat = a hot kitchen in the evening. Add a chajja/sunshade and an exhaust.' })
        break
      case 'study': {
        const diffuse = windows.some((w) => angDiff(w.trueBearing, north) <= 50)
        if (diffuse) tips.push({ level: 'good', text: `${north === 0 ? 'North' : 'South'}-facing window gives soft, glare-free light — ideal for desks and screens.` })
        if (total > 3) tips.push({ level: 'warn', text: 'Strong direct sun on the work area — place the desk perpendicular to the window to avoid screen glare.' })
        break
      }
      case 'bathroom':
        if (total >= 1) tips.push({ level: 'good', text: `Gets ${h1(total)} h of sun — helps keep it dry and hygienic.` })
        else tips.push({ level: 'warn', text: 'No direct sun — make sure there is an exhaust fan / ventilator.' })
        break
      case 'balcony':
        if (total >= 3) tips.push({ level: 'good', text: `${h1(total)} h of sun — perfect for plants and drying clothes.` })
        break
    }
    if (westWin.length && ['living', 'bedroom'].includes(room.type))
      tips.push({ level: 'warn', text: `Harsh afternoon sun through the ${westWin.map((w) => DIR_LONG[w.dir]).join(' / ')} window (${h1(westWin[0].afternoon)} h). Use a deep chajja, blinds or heat-reflective glass.` })

    // Furniture-level advice
    for (const f of p.furniture) {
      if (roomAt(p, f.x, f.y)?.id !== room.id) continue
      const def = CATALOG_MAP[f.kind]
      if (!def?.sunSensitive) continue
      const near = windows
        .map((w) => {
          const mid = (w.seg.start + w.seg.end) / 2
          const wx = w.seg.orient === 'h' ? mid : w.seg.fixed
          const wy = w.seg.orient === 'h' ? w.seg.fixed : mid
          return { w, d: Math.hypot(f.x - wx, f.y - wy) }
        })
        .sort((a, b) => a.d - b.d)[0]
      const sunny = near && near.d < 2 && near.w.morning + near.w.afternoon > 1.5
      if (def.sunSensitive === 'glare' && sunny)
        tips.push({ level: 'warn', text: `${def.label} is close to a sunny ${DIR_LONG[near.w.dir]} window — expect glare in the ${near.w.morning > near.w.afternoon ? 'morning' : 'afternoon'}. Rotate it or add blinds.` })
      if (def.sunSensitive === 'heat' && sunny && near.w.afternoon > 1.5)
        tips.push({ level: 'info', text: `${def.label} sits by a ${DIR_LONG[near.w.dir]} window with afternoon sun — fabrics may fade; use UV curtains.` })
      if (def.sunSensitive === 'heat' && sunny && near.w.afternoon <= 1.5 && near.w.morning > 1)
        tips.push({ level: 'good', text: `${def.label} gets gentle morning light from the ${DIR_LONG[near.w.dir]}.` })
      if (def.sunSensitive === 'loves-light')
        tips.push(sunny ? { level: 'good', text: `${def.label} is in a sunny spot — it will thrive.` } : { level: 'info', text: `${def.label} is far from direct sun — move it within ~1.5 m of a bright window.` })
    }

    const zone = vastuZone(p, room)
    const rule = VASTU[room.type]
    let vastuOk: boolean | null = null
    let vastuText = `Located in the ${zone === 'Center' ? 'centre (Brahmasthan)' : DIR_LONG[zone]} zone.`
    if (rule) {
      if (rule.ideal.includes(zone)) {
        vastuOk = true
        vastuText += ` ✓ ${rule.note}.`
      } else if (rule.avoid.includes(zone)) {
        vastuOk = false
        vastuText += ` Not recommended — ${rule.note}.`
      } else vastuText += ` Acceptable. ${rule.note}.`
    }
    rooms.push({ room, windows, morning, afternoon, total, bestWall, vastuZone: zone, vastuOk, vastuText, tips })
  }

  // Main entrance — exterior doors on the ground floor
  const entrances = ground
    ? walls.filter((s) => s.type === 'door' && s.exterior && s.normalBearing != null).map((s) => dirName(planToTrue(s.normalBearing!, p.plot.northDeg)))
    : []
  return { rooms, entrances }
}

export function estimate(full: Project) {
  const levels = full.levels.map((_, i) => estimateLevel(onLevel(full, i), i === 0))
  const g = levels[0]
  const sum = (k: keyof ReturnType<typeof estimateLevel>) => levels.reduce((s, l) => s + (l[k] as number), 0)
  const floorByMat: Record<string, number> = {}
  for (const l of levels) for (const [m, a] of Object.entries(l.floorByMat)) floorByMat[m] = (floorByMat[m] ?? 0) + a
  return {
    ...g,
    builtUp: sum('builtUp'),
    extLen: sum('extLen'),
    intLen: sum('intLen'),
    paintArea: sum('paintArea'),
    exteriorPaint: sum('exteriorPaint'),
    brickVol: sum('brickVol'),
    bricks: sum('bricks'),
    slabConcrete: sum('slabConcrete'),
    windows: sum('windows'),
    windowArea: sum('windowArea'),
    doors: sum('doors'),
    furniture: sum('furniture'),
    stairs: full.furniture.filter((f) => f.kind.startsWith('stair')).length,
    floorByMat,
    perLevel: levels.map((l, i) => ({ name: full.levels[i].name, builtUp: l.builtUp })),
  }
}

function estimateLevel(p: Project, ground: boolean) {
  const walls = buildWalls(p)
  const beams = ground ? buildBeams(p) : []
  const cols = ground ? buildColumns(p) : []
  const H = p.wallHeight
  let extLen = 0, intLen = 0, extArea = 0, intArea = 0
  const parapet = new Set(p.rooms.filter((r) => r.type === 'balcony').map((r) => r.id))
  for (const s of walls) {
    const L = s.end - s.start
    const wallH = s.exterior && parapet.has(s.roomIds[0]) ? 1.05 : H
    const solidH = s.type === 'wall' ? wallH : s.type === 'window' ? Math.max(0, wallH - (LINTEL - SILL)) : Math.max(0, wallH - LINTEL)
    if (s.exterior) {
      extLen += L
      extArea += L * solidH
    } else {
      intLen += L
      intArea += L * solidH
    }
  }
  const footprint = footprintArea(p)
  const builtUp = p.rooms.reduce((s, r) => s + r.w * r.d, 0)
  const plotArea = p.plot.width * p.plot.depth
  const brickVol = extArea * EXT_T + intArea * INT_T
  const beamLen = beams.reduce((s, b) => s + (b.end - b.start), 0)
  const floorByMat: Record<string, number> = {}
  for (const r of p.rooms) floorByMat[r.floor] = (floorByMat[r.floor] ?? 0) + r.w * r.d
  const windows = p.openings.filter((o) => o.kind === 'window')
  const doors = p.openings.filter((o) => o.kind === 'door')
  return {
    plotArea,
    footprint,
    builtUp,
    coverage: plotArea ? footprint / plotArea : 0,
    extLen,
    intLen,
    paintArea: extArea + intArea * 2, // interior walls painted both sides; exterior one side inside + we count outside separately
    exteriorPaint: extArea,
    brickVol,
    bricks: Math.round(brickVol * 500), // ≈500 modular bricks per m³ incl. mortar
    columns: cols.length,
    footingConcrete: cols.length * 1.2 * 1.2 * 0.3,
    beamConcrete: beamLen * EXT_T * 0.3,
    slabConcrete: footprint * p.slabThickness,
    floorByMat,
    windows: windows.length,
    windowArea: windows.reduce((s, o) => s + o.length * (LINTEL - SILL), 0),
    doors: doors.length,
    furniture: p.furniture.filter((f) => !f.kind.startsWith('stair')).length,
  }
}

export const SQFT = 10.7639
export { fmtTime }
